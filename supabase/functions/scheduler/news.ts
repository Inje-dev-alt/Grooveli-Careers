import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Pulling headlines into the cache, from the Free News API.
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
 *
 * THE API, AS IT ACTUALLY BEHAVES (probed, not assumed):
 *
 *   GET /v1/news?topic=&language=&country=&offset=
 *     -> { data: [{ uuid, title, published_at, publisher }], meta: {...} }
 *     Ten per page, always: `page_size` is ignored. `offset` pages.
 *
 *   GET /v1/details?uuid=
 *     -> { data: { uuid, title, publisher, published_at, original_url,
 *                  thumbnail, authors[], topics[], countries[], languages[] } }
 *
 *   GET /v1/topics  -> the 64 valid topic names.
 *
 * TWO THINGS THAT SHAPE EVERYTHING BELOW.
 *
 * First, there is no text search. `q` and `in_body` return 400 — "has been
 * removed" — and `in_title` returns a 500. Worse, `search` and `keywords`
 * return 200 with completely unfiltered news, so a plausible-looking guess
 * fails silently. Filtering is by topic only, and there is a `jobs` topic.
 *
 * Second, the listing carries no link. Links come one article at a time from
 * `/details`, so they are fetched for the articles that survive and treated
 * as optional — see `resolveLinks`.
 */

const BASE = 'https://api.freenewsapi.io/v1';

/** How long cached news stays fresh enough not to re-fetch. */
const FRESH_FOR_HOURS = 2;

/** How many items to keep. Anything older is dropped on a successful fetch. */
const KEEP = 24;

/**
 * Most headlines one publisher may hold in the strip.
 *
 * Measured, not guessed: in a fifty-article sample of the `jobs` topic, one
 * outlet held five slots and a regional story about a single public-service
 * recruitment scandal held nine between four outlets. Without a cap the
 * ticker becomes one newsroom's rolling coverage of one story, which is a
 * worse read than a thinner strip and makes a global platform look local.
 *
 * The same reasoning as the milestone half, which allows one line per person
 * per kind of achievement so an active explorer cannot fill the whole strip.
 */
const PER_PUBLISHER = 2;

/**
 * Where the headlines come from.
 *
 * Topics, because topics are the only filter the API still offers. `jobs` and
 * nothing else — a decision taken by reading what each topic actually
 * returns, not by what its name suggests.
 *
 * `economy` and `business` were in here, for market context. Four pages of
 * each delivered a veteran car run, an LNG cargo, Sydney house prices and a
 * Christmas editorial: the API's topic tagging is loose, and on a careers
 * platform a ticker of general market reporting is just a news widget
 * somebody left on. `jobs` returns work — quiet firing, graduate hiring, CVs
 * and AI, recruitment reform — on every page.
 *
 * THE COST OF THAT, STATED PLAINLY. `jobs` skews heavily to Indian and
 * Malaysian public-service recruitment, because that is what is published
 * under the tag in volume. Every item is about work, which is the right
 * trade for this product, but it is not a balanced world view and nobody
 * should discover that from a user. The per-publisher cap below stops one
 * newsroom's coverage of one story taking the strip over, which is as far as
 * this can be fixed without a text search the API no longer offers.
 *
 * No `country` filter. It narrows results hard, and the platform seeds roles
 * across several markets — reporting one hemisphere to people working in
 * another is the failure this is meant to avoid.
 */
const SLICES = [{ topic: 'jobs', pages: 4 }];

/**
 * Milliseconds between requests.
 *
 * The free tier allows two a second. 500ms is exactly that ceiling, so this
 * sits just under it — the previous value of 400ms was two and a half a
 * second, i.e. over the limit.
 */
const SPACING_MS = 550;

type Item = {
  uuid: string;
  title: string;
  source: string;
  published_at: string | null;
  url: string | null;
  /** Which slice found it. Not stored — used to spread the strip across topics. */
  topic: string;
};

/** Read one article out of a listing response. */
export function readArticle(raw: unknown, topic = ''): Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  const uuid = typeof row.uuid === 'string' ? row.uuid.trim() : '';
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  if (!uuid || !title) return null;

  // Confirmed a plain string on both endpoints, but an empty one would render
  // as a bare separator in the strip, so it falls back rather than blanking.
  const publisher = typeof row.publisher === 'string' ? row.publisher.trim() : '';

  const raw_date = typeof row.published_at === 'string' ? row.published_at : '';
  const parsed = raw_date ? new Date(raw_date) : null;
  const published_at = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;

  return { uuid, title, source: publisher || 'Free News', published_at, url: null, topic };
}

/** Pull the article array out of a listing response. */
export function readArticles(payload: unknown, topic = ''): Item[] {
  if (!payload || typeof payload !== 'object') return [];
  const list = (payload as Record<string, unknown>).data;
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => readArticle(row, topic))
    .filter((item): item is Item => item !== null);
}

/**
 * The link, out of a `/details` response.
 *
 * Rejected unless it is absolute http(s): the ticker renders these as
 * anchors, and a relative or `javascript:` href in one would be a hole in a
 * page served to every signed-in person.
 */
export function readLink(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return null;
  const url = (data as Record<string, unknown>).original_url;
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/**
 * A title reduced to what makes two headlines the same story.
 *
 * The API returns genuinely duplicated articles under different `uuid`s — the
 * same wire story syndicated, or simply ingested more than once. In a
 * fifty-article sample one headline appeared three times in a row. Keying the
 * cache on `uuid` is right for idempotency and useless against this, so the
 * title does the second pass.
 */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Spread the kept articles across the topics and publishers that produced them.
 *
 * ROUND-ROBIN BY TOPIC, rather than a straight sort by date. With one topic
 * configured this is just a date sort, and that is fine — it earns its keep
 * the moment a second topic is added back, because a high-volume topic
 * publishing within the same few hours would otherwise bury a low-volume one
 * entirely. Taking one topic at a time guarantees each reaches the strip;
 * within each topic the newest wins.
 *
 * THEN CAPPED PER PUBLISHER, so no single outlet's rolling coverage of one
 * story takes the strip over. The cap is a preference, not a hard limit: if
 * honouring it would leave the ticker short, a second pass fills the
 * remainder from what the cap held back. A thin strip of varied news is
 * better than a full one from two newsrooms, but an underfull strip is worse
 * than either.
 */
export function spreadByTopic(items: Item[], keep: number, perPublisher = PER_PUBLISHER): Item[] {
  const build = () => {
    const queues = new Map<string, Item[]>();
    for (const item of items) {
      const queue = queues.get(item.topic) ?? [];
      queue.push(item);
      queues.set(item.topic, queue);
    }
    for (const queue of queues.values()) {
      queue.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
    }
    // Slice order, so `jobs` is served first on every pass.
    const order = SLICES.map((slice) => slice.topic).filter((topic) => queues.has(topic));
    for (const topic of queues.keys()) if (!order.includes(topic)) order.push(topic);
    return { queues, order };
  };

  const out: Item[] = [];
  const taken = new Set<string>();
  const byPublisher = new Map<string, number>();

  const pass = (cap: number) => {
    const { queues, order } = build();
    while (out.length < keep) {
      let took = false;
      for (const topic of order) {
        const queue = queues.get(topic);
        if (!queue) continue;
        // Walk past anything already taken or over its publisher's share.
        while (queue.length) {
          const next = queue[0];
          if (taken.has(next.uuid)) {
            queue.shift();
            continue;
          }
          if ((byPublisher.get(next.source) ?? 0) >= cap) break;
          queue.shift();
          out.push(next);
          taken.add(next.uuid);
          byPublisher.set(next.source, (byPublisher.get(next.source) ?? 0) + 1);
          took = true;
          break;
        }
        if (out.length >= keep) break;
      }
      if (!took) break;
    }
  };

  pass(perPublisher);
  // Short because the cap held things back — fill rather than under-deliver.
  if (out.length < keep) pass(Number.POSITIVE_INFINITY);
  return out;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  const failed: string[] = [];

  const get = async (path: string, params: Record<string, string>) => {
    const url = new URL(`${BASE}/${path}`);
    Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
    const response = await fetch(url, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  };

  /* ---- the listings ---- */

  const pool: Item[] = [];
  for (const slice of SLICES) {
    for (let page = 0; page < slice.pages; page += 1) {
      const label = `${slice.topic}+${page * 10}`;
      try {
        const payload = await get('news', {
          topic: slice.topic,
          language: 'en',
          offset: String(page * 10),
        });
        const batch = readArticles(payload, slice.topic);
        pool.push(...batch);
        // A page that parses to nothing means the response shape moved. Said
        // out loud, because the symptom downstream is just an empty ticker.
        if (batch.length === 0) failed.push(`${label} parsed 0`);
      } catch (error) {
        failed.push(`${label} ${(error as Error).message}`);
      }
      await wait(SPACING_MS);
    }
  }

  /*
   * Two rounds of de-duplication, because there are two distinct duplicates.
   *
   * By id, for the same article arriving from two overlapping topics — a
   * story can be both `jobs` and `economy`, and the first slice to claim it
   * keeps it.
   *
   * By title, for the same STORY arriving as two or three different articles,
   * which this API does do. Only the id dedupe would let one headline scroll
   * past three times in a row.
   */
  const unique = new Map<string, Item>();
  const titles = new Set<string>();
  for (const item of pool) {
    if (unique.has(item.uuid)) continue;
    const key = titleKey(item.title);
    if (!key || titles.has(key)) continue;
    titles.add(key);
    unique.set(item.uuid, item);
  }

  if (unique.size === 0) {
    // Nothing read: leave the cache exactly as it was. Stale headlines are a
    // far better ticker than an empty one.
    console.warn('[news] nothing fetched, keeping the existing cache:', failed.join('; '));
    return { fetched: 0, links: 0, failed };
  }

  const keep = spreadByTopic([...unique.values()], KEEP);

  /* ---- the links ---- */

  /*
   * One request per article, because the listing has none and `/details` is
   * the only place they live.
   *
   * BEST EFFORT, DELIBERATELY. A failure here leaves `url` null and the
   * headline still goes in — the ticker renders it as text instead of a
   * link. Dropping articles whose secondary lookup timed out would make the
   * strip's contents depend on the slowest part of the pipeline.
   */
  let links = 0;
  for (const item of keep) {
    try {
      item.url = readLink(await get('details', { uuid: item.uuid }));
      if (item.url) links += 1;
    } catch (error) {
      failed.push(`details ${item.uuid.slice(0, 8)} ${(error as Error).message}`);
    }
    await wait(SPACING_MS);
  }

  /* ---- the cache ---- */

  const rows = keep.map((item) => ({
    uuid: item.uuid,
    title: item.title,
    source: item.source,
    published_at: item.published_at,
    url: item.url,
    fetched_at: now.toISOString(),
  }));

  const { error } = await admin.from('news_items').upsert(rows, { onConflict: 'uuid' });

  if (error) {
    console.error('[news] could not write the cache:', error.message);
    return { fetched: 0, links, failed: [...failed, error.message] };
  }

  // Drop anything that did not come back, so the cache stays a window on the
  // news rather than an archive of everything ever fetched.
  const { error: pruneError } = await admin
    .from('news_items')
    .delete()
    .not('uuid', 'in', `(${keep.map((item) => `"${item.uuid}"`).join(',')})`);

  if (pruneError) failed.push(`prune ${pruneError.message}`);

  return { fetched: rows.length, links, failed };
}
