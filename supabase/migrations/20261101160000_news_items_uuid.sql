-- Re-key the news cache on the source's own article id.
--
-- WHY. `news_items` was built for RSS, where an item's link is the only
-- identifier a feed reliably gives, so `url` was the primary key. The ticker
-- now reads the Free News API, whose listing endpoint returns `uuid`, `title`,
-- `published_at` and `publisher` — and no link at all. The link lives on a
-- second endpoint, one request per article, which means it is both optional
-- and slow to get.
--
-- Keying on `url` would therefore mean either dropping every article whose
-- link lookup failed, or inventing a key. `uuid` is the source's own stable
-- identifier for the article: the natural idempotency key, keyed on the thing
-- rather than on the fetch that found it.
--
-- The cache is emptied rather than migrated. Every row in it came from feeds
-- the platform no longer reads, there is no `uuid` to backfill from, and a
-- cache that can be refilled in one scheduled run is not data worth
-- contorting a migration over.
--
-- Reversal: not cleanly reversible — the pre-existing rows are gone. To undo
-- the shape:
--   delete from public.news_items;
--   alter table public.news_items drop constraint news_items_pkey;
--   alter table public.news_items drop column uuid;
--   alter table public.news_items alter column url set not null;
--   alter table public.news_items add primary key (url);

delete from public.news_items;

alter table public.news_items drop constraint if exists news_items_pkey;

alter table public.news_items add column if not exists uuid text;

-- The table is empty, so there is nothing to backfill and no risk of the
-- not-null failing on existing rows.
alter table public.news_items alter column uuid set not null;

-- Asking the catalogue rather than catching an exception: adding a duplicate
-- primary key raises one of two different SQLSTATEs depending on whether the
-- clash is the constraint name or the key itself, and a migration should not
-- depend on guessing which.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.news_items'::regclass and contype = 'p'
  ) then
    alter table public.news_items add constraint news_items_pkey primary key (uuid);
  end if;
end $$;

/*
 * The link becomes optional.
 *
 * It is fetched per article from a second endpoint, and that lookup can fail
 * or be rate-limited. A headline with no link still belongs in the ticker —
 * it renders as plain text instead of an anchor — and losing a day's
 * headlines because a secondary request timed out would be the worse trade.
 */
alter table public.news_items alter column url drop not null;

-- One article should not appear twice under two ids. Where a link is known it
-- is unique; where it is null, Postgres treats nulls as distinct, so the
-- link-less rows do not collide with each other.
create unique index if not exists news_items_url_key
  on public.news_items (url)
  where url is not null;
