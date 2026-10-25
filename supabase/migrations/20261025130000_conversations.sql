-- Batch 4.2 — conversations.
--
-- Two tables and one widened check. What they are for: two people standing in
-- the same room can start talking, which is the point of having put them in a
-- room at all. A company's lobby with one person hiring and one person looking
-- is a better first conversation than two strangers in a plaza, because the
-- context does the introducing.
--
-- Four decisions worth reading before the schema.
--
-- 1. A CONVERSATION IS AN ORDERED PAIR, unique whichever way round it is
--    asked. The same index trick `connections` already uses, for the same
--    reason: A→B and B→A must collide, or two people end up holding two
--    threads and each answers into the one the other is not reading.
--
-- 2. WHERE YOU MET IS PART OF THE RECORD. `met_scene` / `met_location_id` are
--    not analytics. A thread that still says it started in a particular
--    company's lobby is doing the introducing a week later, when neither
--    person remembers why they spoke. Denormalised and never updated: moving
--    rooms does not change where you met.
--
-- 3. UNREAD IS PER MESSAGE, NOT PER THREAD. `read_at` on the row rather than a
--    `last_read_at` on a membership, because the bell needs a count and a
--    cursor would make that count a subtraction that drifts the first time a
--    message arrives out of order.
--
-- 4. THE FIRST MESSAGE IS A RULE, NOT A COLUMN. You may send exactly one
--    message to someone you have no accepted connection with; until they
--    answer, you cannot send another. That is enforced in the send handler by
--    counting the rows already here, because it is a statement about a
--    conversation's history rather than a property of it, and a column would
--    be a second place for the same fact to be wrong. It is the whole
--    anti-mass-DM mechanism, and it is deliberately not a request wall: two
--    people standing in the same lobby should be able to say hello.
--
-- Reversal:
--   drop table if exists public.messages;
--   drop table if exists public.conversations;
--   (the notifications check cannot be narrowed again while 'message' rows exist)

/* ----------------------------------------------------- conversations --- */

create table if not exists public.conversations (
  id          text primary key,
  -- Not requester/addressee: a conversation has no asker. Which of the two
  -- spoke first is answerable from `messages` and belongs there.
  a_id        uuid not null references public.profiles (id) on delete cascade,
  b_id        uuid not null references public.profiles (id) on delete cascade,
  -- Where the two were standing when this started. Nullable because a
  -- conversation opened from the network screen did not start in a room, and
  -- claiming it did would be worse than admitting it did not.
  met_scene   text,
  met_location_id text,
  created_at  timestamptz not null default now(),
  constraint conversations_not_self check (a_id <> b_id)
);

create unique index if not exists conversations_pair_idx on public.conversations (
  least(a_id::text, b_id::text),
  greatest(a_id::text, b_id::text)
);

create index if not exists conversations_a_idx on public.conversations (a_id);
create index if not exists conversations_b_idx on public.conversations (b_id);

/* ---------------------------------------------------------- messages --- */

create table if not exists public.messages (
  id              text primary key,
  conversation_id text not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  -- Plain text with newlines preserved. The frontend renders neither Markdown
  -- nor HTML, by design, so nothing here is interpreted as either — the same
  -- bargain `posts.body` makes.
  body            text not null,
  created_at      timestamptz not null default now(),
  -- Set when the OTHER side reads it. Null on a message you sent yourself,
  -- which is why the unread count filters on sender as well.
  read_at         timestamptz
);

-- The thread, oldest first, and the `since` poll that follows it.
create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- Partial: the unread badge reads far fewer rows than any thread, and the
-- read ones only accumulate.
create index if not exists messages_unread_idx
  on public.messages (conversation_id, sender_id) where read_at is null;

-- The rate limit counts a sender's recent messages across every thread, which
-- is the only index that question needs.
create index if not exists messages_sender_recent_idx
  on public.messages (sender_id, created_at desc);

/* ------------------------------------------------------ moderation --- */

/**
 * A conversation reported for review.
 *
 * Rows for a human, never an instant takedown — the same stance
 * `post_reports` documents, and for the same reason: a reporting system that
 * acts on the first click is a harassment weapon. Blocking is the instant
 * action, and it is the reporter's own to take; it already exists in
 * `blocked_authors` and already means "not in my feed, not in my messages,
 * not in my room".
 */
create table if not exists public.conversation_reports (
  id               text primary key,
  conversation_id  text not null references public.conversations (id) on delete cascade,
  reporter_user_id uuid not null references public.profiles (id) on delete cascade,
  reason           text not null default 'other',
  status           text not null default 'open'
    check (status in ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at       timestamptz not null default now(),
  -- Reporting the same conversation twice is one report, not two signals.
  unique (conversation_id, reporter_user_id)
);

/* --------------------------------------------------- notice vocabulary --- */

-- `notifications.type` is a closed check, so a message notice is a 500 until
-- the vocabulary admits one. Dropped and re-added rather than altered,
-- because a check constraint cannot be widened in place.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('match', 'application', 'interview', 'mission',
                  'mission-reminder', 'message', 'system'));

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reports enable row level security;
