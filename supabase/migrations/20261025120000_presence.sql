-- Batch 4.1 — presence.
--
-- One table and one column. The table is a heartbeat log; the column is the
-- privacy setting that makes the table safe to read.
--
-- WHY A TABLE AND NOT A REALTIME CHANNEL. Supabase Realtime presence is the
-- obvious fit and is deliberately not used here: channel authorization needs
-- RLS policies on `realtime.messages`, and this database has none by design —
-- every table is RLS-enabled with no policy, reachable only through the api
-- function's service-role client. Adding a second security model to the
-- project to save a 15-second poll is the wrong trade at this size. The client
-- heartbeats through the router like every other call, and the transport sits
-- behind one module on each side so it can be swapped without touching the
-- rooms that read it.
--
-- Reversal:
--   alter table public.profiles drop column if exists presence_visibility;
--   drop table if exists public.presence;

/* ---------------------------------------------------------- presence --- */

/**
 * Where each account is, as of its last heartbeat.
 *
 * One row per account, overwritten rather than appended: this is a position,
 * not a history, and a log would grow by four rows per minute per player for
 * a question only the newest row answers.
 *
 * STALENESS IS OFFLINE. There is no `online` flag and nothing writes one on
 * disconnect, because a browser that is closed, crashed, asleep or driving
 * through a tunnel never gets to say so. Online means `last_seen_at` is inside
 * the window (see ONLINE_WINDOW_SECONDS in _shared/presence.ts), which makes
 * going offline the absence of a write instead of the presence of one — the
 * only definition that cannot be left wrong by a client that vanishes.
 *
 * Rows are therefore never cleaned up on a schedule. A stale row is already
 * offline; it is overwritten the next time that account signs in.
 */
create table if not exists public.presence (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  -- Which room: 'city', 'apartment', 'office', 'company'. Not constrained to a
  -- list, because the scenes are frontend data and a new room should not need
  -- a migration before it can report where its players are.
  scene        text not null,
  -- Which instance of that room — a district id in the city, an organization
  -- id in an office. NULL means a room with no shared occupancy: the apartment
  -- is one person's flat, so standing in it is not standing anywhere with
  -- anyone. A null here is what makes a room private, and it is the only rule
  -- that decides it.
  location_id  text,
  last_seen_at timestamptz not null default now()
);

-- "Who else is in this room", which is every roster read.
create index if not exists presence_room_idx
  on public.presence (scene, location_id, last_seen_at desc);

-- "Who is online at all", which is the city count and the connections list.
create index if not exists presence_last_seen_idx
  on public.presence (last_seen_at desc);

/* -------------------------------------------------------- visibility --- */

/**
 * Who may see this account BY NAME while it is online.
 *
 *   everyone     named to anyone, and counted.
 *   connections  named to accepted connections only; counted to everyone
 *                else, with no name, headline or avatar. The default.
 *   nobody       not named and not counted, anywhere. Ghost.
 *
 * NAMED AND COUNTED ARE SEPARATE, and that separation is the whole design.
 * Grooveli is a career platform: "seen in a competitor's lobby" is a real
 * consequence for someone currently employed, and it requires knowing that the
 * body in the lobby is *them*. An occupancy number does not carry that — it
 * says a person is there, the way a real lobby does, which is also exactly
 * what tier 3 will draw as an unnamed avatar.
 *
 * So the default protects the identifying part and leaves the aggregate alone.
 * Defaulting the whole thing to 'connections' would have left every count at
 * 1 forever and made the feature a lie; defaulting it to 'everyone' would have
 * published everyone's movements. `nobody` remains for the people who want
 * neither, and it is honoured in the counts too — an occupancy that ticks
 * 0→1 when an invisible account walks in is a leak by arithmetic.
 */
alter table public.profiles
  add column if not exists presence_visibility text not null default 'connections';

alter table public.profiles
  drop constraint if exists profiles_presence_visibility_check;

alter table public.profiles
  add constraint profiles_presence_visibility_check
  check (presence_visibility in ('everyone', 'connections', 'nobody'));

alter table public.presence enable row level security;
