-- Batch 5.2 — the live ticker's news half.
--
-- The milestone half needs no schema: `career_activity` already carries a
-- `shareable` flag, and `leaderboard_opt_out` already says who does not want
-- to be listed publicly. Reusing that opt-out rather than adding a second one
-- is the point — somebody who opts out of being ranked in public has said
-- what they mean, and surprising them with their name in a ticker because it
-- was technically a different feature is how a privacy promise gets broken.
--
-- Reversal:
--   drop table if exists public.news_items;

/**
 * Career and industry headlines, fetched on a schedule and cached here.
 *
 * WHY CACHED RATHER THAN FETCHED ON DEMAND. A browser cannot read most feeds
 * directly — cross-origin rules stop it — and even where it could, every
 * reader would be hitting someone else's server on every page load. One
 * scheduled fetch serves everybody, survives the source being briefly down,
 * and keeps the number of requests we make to a stranger's feed proportional
 * to our schedule rather than to our traffic.
 */
create table if not exists public.news_items (
  -- The item's own link, which is the only identifier a feed reliably gives.
  -- As the primary key it also makes the fetch idempotent: re-reading a feed
  -- that has not changed updates rows rather than duplicating them, so a
  -- sweep can run as often as it likes.
  url          text primary key,
  title        text not null,
  source       text not null default '',
  -- When the item was published, as the feed reports it. Nullable because
  -- plenty of feeds omit it or format it in ways nobody can parse, and an
  -- invented date would sort the ticker wrongly and look authoritative.
  published_at timestamptz,
  fetched_at   timestamptz not null default now()
);

-- The ticker reads the newest handful, by publication where known and by
-- fetch time otherwise.
create index if not exists news_items_recent_idx
  on public.news_items (coalesce(published_at, fetched_at) desc);

alter table public.news_items enable row level security;
