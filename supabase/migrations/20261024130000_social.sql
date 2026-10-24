-- Batch 3.6 — the Grooveli Network (handoff §4.8).
--
-- Eight tables for a deliberately small network: a feed, a post, a like, a
-- comment, a connection, a follow, a referral, and the two moderation verbs a
-- real network cannot launch without.
--
-- Three decisions worth reading before the schema.
--
-- 1. AN AUTHOR IS A USER OR AN ORGANIZATION, never both and never neither.
--    The frontend's Post carries `author.kind`, and companies post too. Two
--    nullable columns with a check beats a polymorphic `author_id` + `kind`
--    pair, because the foreign keys stay real: a post cannot name a company
--    that was deleted.
--
-- 2. A CONNECTION IS TWO-SIDED. The prototype stored `{ userId, status }` from
--    the requester's point of view only, which is why `countConnections` --
--    which filters on `c.from === id || c.to === id` -- could never return
--    anything but 0: no row ever had a `from` or a `to`. Requester and
--    addressee are both columns here, and the pair is ordered-unique so the
--    same two people cannot hold two connections.
--
-- 3. LIKE COUNTS ARE DERIVED, not stored. A counter column drifts the first
--    time a delete misses it, and the feed already needs one aggregate pass.
--    `organizations.follower_count` is the exception and stays a column: it is
--    seeded with numbers no row in this database accounts for, and deriving it
--    would reset every company to its real followers, which today is nearly
--    none.
--
-- Note on seeding: `profiles.id` references `auth.users`, so the prototype's
-- fixture people (cand-001 and friends) cannot be seeded -- they are not
-- accounts. A fresh deployment therefore has no person-authored posts until
-- real people write them. The two company posts below ARE seeded, because the
-- organizations they belong to are real rows.
--
-- Reversal:
--   drop table if exists public.blocked_authors, public.post_reports,
--     public.referrals, public.follows, public.connections,
--     public.post_comments, public.post_likes, public.posts;

/* ------------------------------------------------------------- posts --- */

create table if not exists public.posts (
  id              text primary key,
  author_user_id  uuid references public.profiles (id) on delete cascade,
  author_org_id   text references public.organizations (id) on delete cascade,
  type            text not null
    check (type in ('achievement', 'skill', 'advice', 'insight',
                    'opportunity', 'company-update')),
  -- Plain text with newlines preserved. The frontend parses neither Markdown
  -- nor HTML, by design (§4.8), so nothing here is rendered as either.
  body            text not null,
  -- { kind, refId, label, detail, score?, verified? }. An achievement
  -- attachment is verified against the author's own earned awards before the
  -- row is written -- see POST /social/posts.
  attachment      jsonb,
  created_at      timestamptz not null default now(),
  constraint posts_one_author
    check ((author_user_id is null) <> (author_org_id is null))
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_user_idx on public.posts (author_user_id);
create index if not exists posts_author_org_idx on public.posts (author_org_id);

create table if not exists public.post_likes (
  post_id    text not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id             text primary key,
  post_id        text not null references public.posts (id) on delete cascade,
  author_user_id uuid not null references public.profiles (id) on delete cascade,
  body           text not null,
  created_at     timestamptz not null default now()
);

create index if not exists post_comments_post_idx
  on public.post_comments (post_id, created_at);

/* ------------------------------------------------------- connections --- */

create table if not exists public.connections (
  id           text primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint connections_not_self check (requester_id <> addressee_id)
);

-- The pair is unique whichever way round it is asked. Ordering the two ids
-- inside the index means A→B and B→A collide, so two people cannot end up
-- holding two connections to each other.
create unique index if not exists connections_pair_idx on public.connections (
  least(requester_id::text, addressee_id::text),
  greatest(requester_id::text, addressee_id::text)
);
create index if not exists connections_requester_idx on public.connections (requester_id);
create index if not exists connections_addressee_idx on public.connections (addressee_id);

create table if not exists public.follows (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  organization_id text not null references public.organizations (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, organization_id)
);

/* --------------------------------------------------------- referrals --- */

create table if not exists public.referrals (
  id                text primary key,
  referrer_user_id  uuid not null references public.profiles (id) on delete cascade,
  applicant_user_id uuid not null references public.profiles (id) on delete cascade,
  application_id    uuid not null references public.applications (id) on delete cascade,
  -- Denormalised so the list renders without joining jobs through
  -- applications, exactly as the prototype's Referral carries them.
  job_title         text not null default '',
  company_name      text not null default '',
  status            text not null default 'requested'
    check (status in ('requested', 'sent', 'declined')),
  created_at        timestamptz not null default now(),
  -- One ask per person per application: asking twice is the same ask, and the
  -- endpoint returns the original rather than making a second.
  unique (referrer_user_id, application_id)
);

create index if not exists referrals_applicant_idx on public.referrals (applicant_user_id);
create index if not exists referrals_referrer_idx on public.referrals (referrer_user_id);

/* -------------------------------------------------------- moderation --- */

-- Rows for human review, never instant takedowns: a reporting system that acts
-- on the first click is a harassment weapon (§4.8).
create table if not exists public.post_reports (
  id               text primary key,
  post_id          text not null references public.posts (id) on delete cascade,
  reporter_user_id uuid not null references public.profiles (id) on delete cascade,
  author_id        text not null,
  reason           text not null default 'other',
  status           text not null default 'open'
    check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at       timestamptz not null default now(),
  -- Reporting the same post twice is one report, not two signals.
  unique (post_id, reporter_user_id)
);

-- Hides an author from ONE account's feed. `author_id` is text because an
-- author may be an organization, whose ids are text; it is therefore not a
-- foreign key, and a block on a deleted author is harmless.
create table if not exists public.blocked_authors (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  author_id  text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, author_id)
);

/* -------------------------------------------------------------- rls --- */

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.connections enable row level security;
alter table public.follows enable row level security;
alter table public.referrals enable row level security;
alter table public.post_reports enable row level security;
alter table public.blocked_authors enable row level security;

/* ------------------------------------------------------------- seed --- */

-- The two company posts from src/mock/social.js. Their organizations are real
-- seeded rows, so these are the only posts that can be ported: the four
-- person-authored ones belong to fixture people who are not accounts.
--
-- Their like counts cannot come with them -- a like is a row naming a real
-- account here, and inventing 58 of them would be inventing 58 people. The
-- posts arrive with none, which is the honest number.
insert into public.posts (id, author_org_id, type, body, attachment, created_at) values
  ('post-002', 'org-northwind', 'opportunity',
   'We are hiring a Backend Engineer for the settlement team. Correctness-critical work, careful reviews, and we write decisions down. Remote within WAT ±3.',
   '{"kind":"job","refId":"job-001","label":"Backend Engineer","detail":"Northwind Systems · Lagos / Remote"}'::jsonb,
   '2026-10-04T15:10:00.000Z'),
  ('post-005', 'org-brightpath', 'company-update',
   'New cohort of Data Essentials opens next week. Four weeks, evenings, assessment-backed certificate. Built for people who already own a process and want the data half of it.',
   null,
   '2026-10-02T10:30:00.000Z')
on conflict (id) do nothing;
