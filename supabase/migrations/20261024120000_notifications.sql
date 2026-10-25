-- Batch 3.5 — notifications (handoff §5).
--
-- The launch gate. Since Batch 3.4 the pipeline has moved and recorded itself
-- durably: an employer shortlists or rejects, `applications` is updated and an
-- `application_events` row is appended. The candidate was told nothing. They
-- found out by going back and looking, which is how a product goes quiet on
-- the person who is waiting on it.
--
-- Two tables.
--
--   notifications              one row per notice, per account.
--   notification_preferences   whether to send mission reminders, and the
--                              hours not to send them in.
--
-- Mirrors every other table in this schema: flat, RLS enabled with no
-- policies, reached only by the router's service-role client.
--
-- Reversal:
--   drop table if exists public.notification_preferences;
--   drop table if exists public.notifications;

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  -- The vocabulary the frontend's Notification typedef declares. `match` and
  -- `system` are not written by anything yet; they are listed because the UI
  -- already renders them and a type it cannot receive is a dead branch, not a
  -- constraint worth tightening later.
  type       text not null
    check (type in ('match', 'application', 'interview', 'mission',
                    'mission-reminder', 'system')),
  title      text not null,
  body       text not null default '',
  -- Where tapping the notice takes you. Nullable: a notice with nowhere to go
  -- is still worth showing, and '' would render as a link to the root.
  route      text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- The feed is always "this account's, newest first", and the bell counts the
-- unread ones. Both are this index.
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- Partial: the unread count reads far fewer rows than the feed, and the
-- read ones only grow.
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where not read;

alter table public.notifications enable row level security;

-- ------------------------------------------------------- preferences ---

-- One row per account, created on first write. A missing row means the
-- defaults below, which is why `GET` answers them without inserting: reading
-- your own preferences should not be a write.
create table if not exists public.notification_preferences (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  mission_reminders boolean not null default true,
  -- Quiet hours as two 24h hour numbers, or null for none. A pair, so the
  -- check keeps half of one from meaning anything.
  quiet_start       integer check (quiet_start is null or quiet_start between 0 and 23),
  quiet_end         integer check (quiet_end is null or quiet_end between 0 and 23),
  constraint notification_preferences_quiet_pair
    check ((quiet_start is null) = (quiet_end is null)),
  updated_at        timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
