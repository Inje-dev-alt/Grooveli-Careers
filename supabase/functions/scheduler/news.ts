import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Pulling career headlines into the cache.
 *
 * Runs on the same schedule as the reminder sweep because both want a timer
 * and neither wants its own function. The sweep is cheap and this is not, so
 * it is rate-limited by its own freshness check rather than by the cron
 * interval: the sweep can keep running every half hour while the feeds are
 * only read every couple of hours.
 */

/** How long cached news stays fresh enough not to re-fetch. */
const FRESH_FOR_HOURS = 2;

/** How many items to keep. Older ones are dropped on each successful fetch. */
const KEEP = 40;

/**
 * The feeds.
 *
 * Chosen for being free, stable, and about work rather than gadgets. Kept
 * here rather than in a table because changing them is a deploy-sized
 * decision — a feed is a third party we send traffic to and quote on our own
 * pages, which is an editorial choice, not configuration.
 */
const FEEDS = [
  { source: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  { source: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { source: 'BBC Business', url: 'http://feeds.bbci.co.uk/news/business/rss.xml' },
];

type Item = { url: string; title: string; source: string; published_at: string | null };

/** Decode the handful of XML entities that actually appear in feed titles. */
function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Ampersand last, or it would re-break everything decoded above.
    .replace(/&amp;/g, '&')
    .trim();
}

const tag = (block: string, name: string): string => {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decode(match[1]) : '';
};

/**
 * Parse RSS or Atom without a library.
 *
 * Deliberately forgiving and deliberately small. A real XML parser would be
 * stricter and correct about documents these feeds do not produce; what
 * actually breaks here is a missing date or an entity nobody decoded, and
 * both are handled. Anything this cannot read is skipped rather than throwing
 * — one malformed item must not cost the whole fetch.
 */
export function parseFeed(xml: string, source: string): Item[] {
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) ?? [];

  return blocks
    .map((block) => {
      const title = tag(block, 'title');

      // RSS puts the link in the element; Atom puts it in an href attribute.
      let url = tag(block, 'link');
      if (!url) {
        const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
        url = href ? decode(href[1]) : '';
      }

      const raw = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated');
      const parsed = raw ? new Date(raw) : null;
      const published_at =
        parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;

      return { url, title, source, published_at };
    })
    .filter((item) => item.url.startsWith('http') && item.title.length > 0);
}

/**
 * Fetch every feed and refresh the cache.
 *
 * Returns a summary rather than throwing: this runs beside the reminder
 * sweep, and a feed being down must not stop people being reminded about
 * their missions.
 */
export async function refreshNews(admin: SupabaseClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - FRESH_FOR_HOURS * 3600 * 1000).toISOString();

  const { data: recent } = await admin
    .from('news_items')
    .select('fetched_at')
    .gte('fetched_at', cutoff)
    .limit(1);

  if ((recent ?? []).length > 0) return { skipped: 'still fresh' as const };

  const items: Item[] = [];
  const failed: string[] = [];

  for (const feed of FEEDS) {
    try {
      // A feed that hangs must not hold the whole run open.
      const response = await fetch(feed.url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'GrooveliCareers/1.0 (+https://grooveli.example)' },
      });
      if (!response.ok) {
        failed.push(`${feed.source} ${response.status}`);
        continue;
      }
      items.push(...parseFeed(await response.text(), feed.source));
    } catch (error) {
      failed.push(`${feed.source} ${(error as Error).message}`);
    }
  }

  if (!items.length) {
    // Nothing read: leave the cache exactly as it was. Stale headlines are a
    // far better ticker than an empty one.
    console.warn('[news] no items fetched, keeping the existing cache:', failed.join('; '));
    return { fetched: 0, failed };
  }

  // Newest first, then trimmed — the cache is a window, not an archive.
  items.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
  const keep = items.slice(0, KEEP);

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

  // Drop anything that did not come back this time, so the ticker does not
  // slowly fill with a year of headlines.
  await admin
    .from('news_items')
    .delete()
    .not('url', 'in', `(${keep.map((i) => `"${i.url}"`).join(',')})`);

  return { fetched: keep.length, failed };
}
