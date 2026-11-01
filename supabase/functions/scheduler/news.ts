import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Pulling headlines into the cache, from Free News API.
 *
 * Runs on the same schedule as the reminder sweep because both want a timer
 * and neither wants its own function. It rate-limits itself on the cache's
 * own freshness rather than on the cron interval, so the sweep keeps running
 * every half hour while the news is fetched every couple of hours.
 *
 * THE KEY IS SERVER-SIDE AND NOWHERE ELSE. `FREENEWS_API_KEY` is read from
 * this function's environment. It must never reach the browser: anything in
 * a `VITE_` variable is inlined into the public bundle, and a free tier with
 * a daily quota is exactly the kind of credential that gets harvested.
 *
 *   supabase secrets set FREENEWS_API_KEY=... --project-ref <ref>
 */

const API = 'https://api.freenewsapi.io/v1/news';

/** How long cached news stays fresh enough not to re-fetch. */
const FRESH_FOR_HOURS = 2;

/** How many items to keep. Anything older is dropped on a successful fetch. */
const KEEP = 40;

/**
 * What to ask for.
 *
 * Several narrow queries rather than one broad one, because this is a career
 * platform and unfiltered news is mostly not about work. Each slice is its
 * own request; the free tier allows five thousand a day at two a second, so
 * four every couple of hours is nothing.
 *
 * The countries follow the market the platform now seeds roles in, so the
 * ticker is not reporting one hemisphere to people working in another.
 */
const QUERIES = [
  { label: 'hiring', params: { q: 'hiring OR recruitment OR "job market"', language: 'en' } },
  { label: 'business-us', params: { topic: 'business', language: 'en', country: 'us' } },
  { label: 'business-gb', params: { topic: 'business', language: 'en', country: 'gb' } },
  { label: 'workforce', params: { q: 'employment OR workforce OR "remote work"', language: 'en' } },
];

type Item = { url: string; title: string; source: string; published_at: string | null };

/**
 * Read one article out of a response.
 *
 * DELIBERATELY TOLERANT ABOUT FIELD NAMES. The listing response is not
 * documented field by field and this was written without a key to probe
 * with, so rather than guess one spelling and ship something that silently
 * returns nothing, it accepts the handful of names this kind of service
 * uses. The first live fetch logs the real keys — see `refreshNews` — after
 * which this can be narrowed to exactly what is sent.
 */
export function readArticle(raw: unknown): Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const str = (...names: string[]): string => {
    for (const name of names) {
      const value = row[name];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };

  const title = str('title', 'headline');

  // A link is required: the ticker renders headlines as anchors, and one
  // that goes nowhere is worse than one that is absent.
  const url = str('original_url', 'url', 'link', 'source_url');

  /*
   * The publisher may be a string or an object carrying a name, which is the
   * usual shape when an API also exposes publishers as their own resource.
   */
  let source = str('publisher', 'source', 'source_name', 'domain');
  if (!source && row.publisher && typeof row.publisher === 'object') {
    const publisher = row.publisher as Record<string, unknown>;
    if (typeof publisher.name === 'string') source = publisher.name;
  }

  const rawDate = str('published_at', 'publishedAt', 'pub_date', 'date');
  const parsed = rawDate ? new Date(rawDate) : null;
  const published_at = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;

  if (!title || !url.startsWith('http')) return null;
  return { title, url, source: source || 'Free News', published_at };
}

/** Pull the article array out of whatever envelope the response uses. */
export function readArticles(payload: unknown): Item[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as Record<string, unknown>;
  const list = [body.data, body.articles, body.results, body.news].find(Array.isArray) as
    | unknown[]
    | undefined;
  return (list ?? []).map(readArticle).filter((item): item is Item => item !== null);
}

/**
 * Fetch every slice and refresh the cache.
 *
 * Returns a summary rather than throwing: this runs beside the reminder
 * sweep, and the news being unavailable must not stop people being reminded
 * about their missions.
 */
export async function refreshNews(admin: SupabaseClient, now = new Date()) {
  const key = Deno.env.get('FREENEWS_API_KEY') ?? '';
  if (!key) {
    // Loud, because an unset secret and an empty cache look identical from
    // outside, and this is the likeliest reason the ticker is bare.
    console.error('[news] FREENEWS_API_KEY is not set — no headlines will be fetched.');
    return { skipped: 'no api key' as const };
  }

  const cutoff = new Date(now.getTime() - FRESH_FOR_HOURS * 3600 * 1000).toISOString();
  const { data: recent } = await admin
    .from('news_items')
    .select('fetched_at')
    .gte('fetched_at', cutoff)
    .limit(1);

  if ((recent ?? []).length > 0) return { skipped: 'still fresh' as const };

  const items: Item[] = [];
  const failed: string[] = [];
  let loggedShape = false;

  for (const query of QUERIES) {
    const url = new URL(API);
    Object.entries(query.params).forEach(([name, value]) => url.searchParams.set(name, value));

    try {
      const response = await fetch(url, {
        headers: { 'x-api-key': key, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        failed.push(`${query.label} ${response.status}`);
        continue;
      }

      const payload = await response.json();

      /*
       * Log the real shape once, the first time this runs against the live
       * service. The schema is undocumented, so this is how the tolerant
       * reader above gets narrowed to what is actually sent rather than
       * staying permanently defensive.
       */
      if (!loggedShape) {
        loggedShape = true;
        const envelope = payload as Record<string, unknown>;
        const list = [envelope?.data, envelope?.articles, envelope?.results].find(Array.isArray) as
          | unknown[]
          | undefined;
        const first = list?.[0];
        console.log(
          '[news] response keys:',
          payload && typeof payload === 'object' ? Object.keys(envelope).join(', ') : typeof payload,
          '| article keys:',
          first && typeof first === 'object' ? Object.keys(first).join(', ') : '(none)',
        );
      }

      items.push(...readArticles(payload));
    } catch (error) {
      failed.push(`${query.label} ${(error as Error).message}`);
    }

    // Two requests a second is the free tier's ceiling; this stays well under.
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  // The slices overlap, and the same story can arrive from more than one.
  const unique = new Map<string, Item>();
  for (const item of items) if (!unique.has(item.url)) unique.set(item.url, item);

  if (unique.size === 0) {
    // Nothing read: leave the cache exactly as it was. Stale headlines are a
    // far better ticker than an empty one.
    console.warn('[news] nothing fetched, keeping the existing cache:', failed.join('; '));
    return { fetched: 0, failed };
  }

  const keep = [...unique.values()]
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
    .slice(0, KEEP);

  const { error } = await admin
    .from('news_items')
    .upsert(
      keep.map((item) => ({ ...item, fetched_at: now.toISOString() })),
      { onConflict: 'url' },
    );

  if (error) {
    console.error('[news] could not write the cache:', error.message);
    return { fetched: 0, failed: [...failed, error.message] };
  }

  // Drop anything that did not come back, so the cache stays a window on the
  // news rather than an archive of everything ever fetched.
  await admin
    .from('news_items')
    .delete()
    .not('url', 'in', `(${keep.map((item) => `"${item.url}"`).join(',')})`);

  return { fetched: keep.length, failed };
}
