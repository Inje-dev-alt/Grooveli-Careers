import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Headlines for the ticker, from the Free News API.
 *
 * TWO WAYS IN, AND THE FIRST IS THE ONE THAT MATTERS.
 *
 * `ensureHeadlines` is called by `GET /ticker` on a page load. If the cache
 * has gone stale it fetches immediately, writes it, and returns the fresh
 * rows — so the footer fills the first time somebody opens the app, with no
 * cron, no vault entry and no manual SQL. That is the whole point: the news
 * half of the ticker used to depend on a scheduled sweep that had to be set
 * up by hand, so on any project where that step was skipped the footer was
 * permanently empty and nothing said why.
 *
 * `refreshNews` is the scheduled sweep, kept because it does a more thorough
 * job than a page load can afford to — more pages, and every link resolved.
 * It is now a bonus rather than a dependency.
 *
 * THE KEY IS SERVER-SIDE AND NOWHERE ELSE. `FREENEWS_API_KEY` is read from
 * this function's environment, which is what `supabase secrets set` writes.
 *
 *   supabase secrets set --env-file supabase/.env --project-ref <ref>
 *
 * It must never go in the project's root `.env`. Not as a matter of taste:
 * every variable there prefixed `VITE_` is inlined verbatim into the public
 * browser bundle, where anyone can read it out of view-source. And it would
 * not even work — the API sends no `Access-Control-Allow-Origin` header, so
 * a browser `fetch` to it is blocked by CORS before the key is considered.
 * Calling it from a server is the only way to call it at all.
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

/**
 * How long cached news stays fresh enough not to re-fetch.
 *
 * Half an hour. Short enough that a ticker claiming to be live is not
 * scrolling this morning's news this evening, long enough that the fetch
 * cost is bounded no matter how many people are using the app — a page load
 * inside the window costs one indexed query and nothing else.
 */
const FRESH_FOR_MINUTES = 30;

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
 * What a page load is willing to fetch.
 *
 * Two pages, not four. This runs inside a request somebody is waiting on, so
 * it costs two sequential API calls — a little over a second — rather than
 * four. Twenty articles is already more than twice what the ticker shows.
 */
const ON_DEMAND_SLICES = [{ topic: 'jobs', pages: 2 }];

/** How many links one background top-up resolves. */
const LINK_BATCH = 6;

/** The cached row shape the ticker route reads. */
export type NewsRow = {
  uuid: string;
  title: string;
  source: string;
  published_at: string | null;
  fetched_at: string;
  url: string | null;
};

/**
 * The key, or null with a reason said out loud.
 *
 * An unset secret and an empty cache are indistinguishable from the outside,
 * and an unset secret is by far the likeliest reason a ticker is bare — so it
 * is the one thing in this module that always logs.
 */
function apiKey(): string | null {
  const key = Deno.env.get('FREENEWS_API_KEY') ?? '';
  if (key) return key;
  console.error(
    '[news] FREENEWS_API_KEY is not set — no headlines will be fetched. ' +
      'Set it with: supabase secrets set --env-file supabase/.env --project-ref <ref>',
  );
  return null;
}

/** A bound caller for the API, so the key is read once per refresh. */
function caller(key: string) {
  return async (path: string, params: Record<string, string>) => {
    const url = new URL(`${BASE}/${path}`);
    Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, value));
    const response = await fetch(url, {
      headers: { 'x-api-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  };
}

type Get = ReturnType<typeof caller>;

/** Has anything been fetched recently enough to serve as is? */
async function cacheIsFresh(admin: SupabaseClient, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - FRESH_FOR_MINUTES * 60_000).toISOString();
  const { data } = await admin
    .from('news_items')
    .select('fetched_at')
    .gte('fetched_at', cutoff)
    .limit(1);
  return (data ?? []).length > 0;
}

/** Walk the listing pages of each slice. */
async function fetchListing(
  get: Get,
  slices: { topic: string; pages: number }[],
  failed: string[],
): Promise<Item[]> {
  const pool: Item[] = [];
  for (const slice of slices) {
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
  return pool;
}

/**
 * Two rounds of de-duplication, because there are two distinct duplicates.
 *
 * By id, for the same article arriving from two overlapping topics — a story
 * can be both `jobs` and `economy`, and the first slice to claim it keeps it.
 *
 * By title, for the same STORY arriving as two or three different articles,
 * which this API does do. Only the id dedupe would let one headline scroll
 * past three times in a row.
 */
export function dedupe(pool: Item[]): Item[] {
  const unique = new Map<string, Item>();
  const titles = new Set<string>();
  for (const item of pool) {
    if (unique.has(item.uuid)) continue;
    const key = titleKey(item.title);
    if (!key || titles.has(key)) continue;
    titles.add(key);
    unique.set(item.uuid, item);
  }
  return [...unique.values()];
}

/** Write the kept articles and drop whatever did not come back. */
async function writeCache(
  admin: SupabaseClient,
  keep: Item[],
  now: Date,
  failed: string[],
): Promise<number> {
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
    failed.push(error.message);
    return 0;
  }

  // Keep the cache a window on the news rather than an archive of everything
  // ever fetched.
  const { error: pruneError } = await admin
    .from('news_items')
    .delete()
    .not('uuid', 'in', `(${keep.map((item) => `"${item.uuid}"`).join(',')})`);
  if (pruneError) failed.push(`prune ${pruneError.message}`);

  return rows.length;
}

/** The newest cached headlines, as the ticker route wants them. */
async function readCache(admin: SupabaseClient, limit: number): Promise<NewsRow[]> {
  const { data } = await admin
    .from('news_items')
    .select('uuid, title, source, published_at, fetched_at, url')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as NewsRow[];
}

/**
 * Fill in missing links, after the response has gone out.
 *
 * The listing carries no link and `/details` serves one article at a time, so
 * resolving a strip's worth costs as many requests as there are headlines.
 * That is far too slow to do inside a request somebody is waiting on — hence
 * a few at a time, in the background, so links accumulate over the first
 * handful of page loads while the headlines themselves are never delayed.
 *
 * Nothing here is allowed to fail loudly or to reject: it is decoration on a
 * response that has already been sent. `EdgeRuntime.waitUntil` keeps the
 * worker alive for it where it exists; without it the work is simply started
 * and may be cut short when the isolate goes, which costs nothing because the
 * next page load tries again.
 */
function topUpLinks(admin: SupabaseClient, rows: NewsRow[]): void {
  const missing = rows.filter((row) => !row.url).slice(0, LINK_BATCH);
  if (missing.length === 0) return;

  const key = Deno.env.get('FREENEWS_API_KEY') ?? '';
  if (!key) return;
  const get = caller(key);

  const work = (async () => {
    for (const row of missing) {
      try {
        const url = readLink(await get('details', { uuid: row.uuid }));
        if (url) await admin.from('news_items').update({ url }).eq('uuid', row.uuid);
      } catch {
        // Expected often enough not to be worth a line in the log: the strip
        // reads perfectly well without a link.
      }
      await wait(SPACING_MS);
    }
  })().catch(() => {});

  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  runtime?.waitUntil?.(work);
}

/**
 * The headlines for a page load, fetching them if the cache has gone stale.
 *
 * THIS IS WHY THE FOOTER WORKS WITHOUT A CRON. The scheduled sweep is a
 * one-time manual setup step — a vault secret and a `pg_cron` statement run
 * by hand — so on any project where that was skipped, the news half of the
 * ticker was empty forever and nothing explained it. Fetching here means the
 * first person to open the app fills the strip.
 *
 * The cost is bounded by the cache, not by traffic: inside the freshness
 * window this is one indexed query. At the moment the window closes a few
 * concurrent requests may each fetch, which wastes a handful of the daily
 * allowance and is harmless — the writes are keyed on the article id, so they
 * converge rather than conflict.
 */
export async function ensureHeadlines(
  admin: SupabaseClient,
  now = new Date(),
  limit = 8,
): Promise<NewsRow[]> {
  if (await cacheIsFresh(admin, now)) {
    const rows = await readCache(admin, limit);
    topUpLinks(admin, rows);
    return rows;
  }

  const key = apiKey();
  // No key: serve whatever is cached, however old. A stale strip beats none,
  // and `apiKey` has already said why in the log.
  if (!key) return await readCache(admin, limit);

  const failed: string[] = [];
  const pool = await fetchListing(caller(key), ON_DEMAND_SLICES, failed);
  const keep = spreadByTopic(dedupe(pool), KEEP);

  if (keep.length === 0) {
    // Leave the cache exactly as it was. Stale headlines are a far better
    // ticker than an empty one.
    console.warn('[news] on-demand fetch read nothing, keeping the cache:', failed.join('; '));
    return await readCache(admin, limit);
  }

  await writeCache(admin, keep, now, failed);
  if (failed.length) console.warn('[news] on-demand fetch, with failures:', failed.join('; '));

  const rows = await readCache(admin, limit);
  topUpLinks(admin, rows);
  return rows;
}

/**
 * The scheduled sweep: more pages, and every link resolved.
 *
 * A BONUS, NOT A DEPENDENCY. `ensureHeadlines` keeps the ticker fed on its
 * own, so nothing breaks when this never runs. What it adds is depth — four
 * pages rather than two — and links for the whole strip at once instead of a
 * few per page load.
 *
 * Returns a summary rather than throwing: it runs beside the reminder sweep,
 * and the news being unavailable must not stop people being reminded about
 * their missions.
 */
export async function refreshNews(admin: SupabaseClient, now = new Date()) {
  const key = apiKey();
  if (!key) return { skipped: 'no api key' as const };

  if (await cacheIsFresh(admin, now)) return { skipped: 'still fresh' as const };

  const failed: string[] = [];
  const get = caller(key);

  const pool = await fetchListing(get, SLICES, failed);
  const keep = spreadByTopic(dedupe(pool), KEEP);

  if (keep.length === 0) {
    console.warn('[news] nothing fetched, keeping the existing cache:', failed.join('; '));
    return { fetched: 0, links: 0, failed };
  }

  /*
   * Every link, up front.
   *
   * BEST EFFORT, DELIBERATELY. A failure leaves `url` null and the headline
   * still goes in — the ticker renders it as text instead of a link.
   * Dropping articles whose secondary lookup timed out would make the strip's
   * contents depend on the slowest part of the pipeline.
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

  const fetched = await writeCache(admin, keep, now, failed);
  return { fetched, links, failed };
}
