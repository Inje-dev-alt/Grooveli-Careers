/**
 * Who is online, and who is allowed to know.
 *
 * Every presence read in the product goes through `presenceSnapshot` or
 * `roomOccupancy` below, so the rule about who can be seen is written once.
 * That is not tidiness — it is the lesson from the leaderboard opt-out, which
 * filtered the viewer's own row and left them visible on everybody else's
 * board. An exclusion applied at the point of rendering is an exclusion
 * applied in one place out of several; applied before the rows are counted, it
 * cannot be forgotten by the next surface that reads them.
 *
 * NAMED vs COUNTED. The privacy setting (`profiles.presence_visibility`)
 * governs whether an account appears BY NAME. Whether it appears in an
 * occupancy NUMBER is a weaker question with a different answer — see the
 * migration's note. In short: `connections` is named to connections and
 * counted to everyone, `nobody` is neither, `everyone` is both.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { resolveProgression } from './progression.ts';

type Row = Record<string, unknown>;

/**
 * How long a heartbeat counts for.
 *
 * Three missed beats at the client's 15s interval. Tight enough that someone
 * who closed the tab is gone within a minute, loose enough that a slow request
 * or a backgrounded tab does not make them flicker out and back.
 */
export const ONLINE_WINDOW_SECONDS = 45;

/** What the client is told to beat at, so the interval is the server's call. */
export const HEARTBEAT_SECONDS = 15;

/** The roster colour, matching the leaderboard's. Avatars are initials, not art. */
const PERSON_COLOR = '#5be3c8';

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The cutoff a row must be newer than to count as online. */
export function onlineSince(): string {
  return new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000).toISOString();
}

export type PresencePerson = {
  id: string;
  name: string;
  headline: string;
  color: string;
  careerLevel: number;
  scene: string;
  locationId: string | null;
};

/**
 * Who this viewer may see by name, and who they may count at all.
 *
 * Both directions of `blocked_authors` are honoured: a block means not in my
 * feed, not in my messages and not in my room, in either direction. One block
 * table, one meaning — a person who blocked you should not be findable by
 * standing next to you.
 */
async function nameability(admin: SupabaseClient, viewerId: string) {
  const [{ data: profiles }, { data: connections }, { data: iBlocked }, { data: blockedMe }] =
    await Promise.all([
      admin.from('profiles').select('id, presence_visibility'),
      admin
        .from('connections')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`),
      admin.from('blocked_authors').select('author_id').eq('user_id', viewerId),
      admin.from('blocked_authors').select('user_id').eq('author_id', viewerId),
    ]);

  const visibilityOf = new Map(
    ((profiles ?? []) as Row[]).map((r) => [
      String(r.id),
      String(r.presence_visibility ?? 'connections'),
    ]),
  );

  const connected = new Set(
    ((connections ?? []) as Row[]).map((r) =>
      String(r.requester_id) === viewerId ? String(r.addressee_id) : String(r.requester_id),
    ),
  );

  const blocked = new Set<string>([
    ...((iBlocked ?? []) as Row[]).map((r) => String(r.author_id)),
    ...((blockedMe ?? []) as Row[]).map((r) => String(r.user_id)),
  ]);

  /** A ghost is absent from rosters AND from counts. */
  const counted = (id: string) =>
    id !== viewerId && !blocked.has(id) && visibilityOf.get(id) !== 'nobody';

  const canName = (id: string) => {
    if (!counted(id)) return false;
    const setting = visibilityOf.get(id) ?? 'connections';
    return setting === 'everyone' || connected.has(id);
  };

  return { canName, counted, connected };
}

/** Name, headline and level for the ids that will actually be rendered. */
async function cardsFor(admin: SupabaseClient, ids: string[]) {
  const cards = new Map<string, Omit<PresencePerson, 'scene' | 'locationId'>>();
  if (!ids.length) return cards;

  const [{ data: profiles }, { data: candidates }, { data: progress }] = await Promise.all([
    admin.from('profiles').select('id, display_name').in('id', ids),
    admin.from('candidate_profiles').select('user_id, headline').in('user_id', ids),
    admin.from('career_progress').select('user_id, xp').in('user_id', ids),
  ]);

  const headlineOf = new Map(
    ((candidates ?? []) as Row[]).map((r) => [String(r.user_id), String(r.headline ?? '')]),
  );
  const xpOf = new Map(((progress ?? []) as Row[]).map((r) => [String(r.user_id), num(r.xp)]));

  for (const row of (profiles ?? []) as Row[]) {
    const id = String(row.id);
    cards.set(id, {
      id,
      name: String(row.display_name ?? '') || 'Grooveli member',
      // An employer has no candidate profile and so no headline. Their row is
      // still real — they are a person standing in a room — so they get the
      // generic line rather than being dropped from the roster.
      headline: headlineOf.get(id) || 'Grooveli member',
      color: PERSON_COLOR,
      careerLevel: resolveProgression(xpOf.get(id) ?? 0).level,
    });
  }

  return cards;
}

export type PresenceSnapshot = {
  /**
   * Everyone online in Grooveli, this viewer included.
   *
   * Includes the viewer because "47 people in the city" that excludes you
   * reads as a bug the moment you are the only one here. Excludes ghosts and
   * blocks, so it is the number this viewer is entitled to see rather than the
   * true one.
   */
  cityOnline: number;
  /**
   * How many OTHER people share this room. Excludes the viewer, because the
   * label it feeds is "2 others here" — the roster's count, not the room's.
   * Zero when the room is private (no locationId).
   */
  hereCount: number;
  /** The ones in this room this viewer may see by name. Never includes the viewer. */
  here: PresencePerson[];
  /** This viewer's accepted connections who are online, wherever they are. */
  connectionsOnline: PresencePerson[];
  /** Echoed back so the privacy control renders without a second request. */
  visibility: string;
  /** Seconds the client should wait before beating again. */
  heartbeatSeconds: number;
};

/**
 * The whole presence payload for one viewer, in one round trip.
 *
 * Deliberately one call rather than three. The client is already paying for a
 * request every 15 seconds; serving the city count, the room roster and the
 * connections list from separate endpoints would make that three requests for
 * one fact, on a timer, forever.
 */
export async function presenceSnapshot(
  admin: SupabaseClient,
  viewerId: string,
  scene: string,
  locationId: string | null,
): Promise<PresenceSnapshot> {
  const [{ data: rows }, rules, { data: me }] = await Promise.all([
    admin
      .from('presence')
      .select('user_id, scene, location_id')
      .gte('last_seen_at', onlineSince()),
    nameability(admin, viewerId),
    admin.from('profiles').select('presence_visibility').eq('id', viewerId).maybeSingle(),
  ]);

  const online = ((rows ?? []) as Row[]).map((r) => ({
    id: String(r.user_id),
    scene: String(r.scene ?? ''),
    locationId: r.location_id === null ? null : String(r.location_id),
  }));

  // Counted first, named second. Every number below is computed from `visible`,
  // so a ghost cannot be inferred from an occupancy that moved.
  const visible = online.filter((row) => rules.counted(row.id));

  // A room with no locationId is somebody's apartment: standing in it is not
  // standing anywhere with anyone, so it has no occupants but you.
  const inRoom = locationId
    ? visible.filter((row) => row.scene === scene && row.locationId === locationId)
    : [];

  const connectionRows = visible.filter((row) => rules.connected.has(row.id));

  const nameIds = [
    ...new Set([
      ...inRoom.filter((row) => rules.canName(row.id)).map((row) => row.id),
      // A connection is named by virtue of being a connection: the
      // `connections` setting means "named to my connections", so the list of
      // who is online never comes back anonymous for the people it is for.
      ...connectionRows.map((row) => row.id),
    ]),
  ];

  const cards = await cardsFor(admin, nameIds);
  const person = (row: { id: string; scene: string; locationId: string | null }) => {
    const card = cards.get(row.id);
    return card ? { ...card, scene: row.scene, locationId: row.locationId } : null;
  };

  return {
    cityOnline: visible.length + 1,
    hereCount: inRoom.length,
    here: inRoom.map(person).filter(Boolean) as PresencePerson[],
    connectionsOnline: connectionRows.map(person).filter(Boolean) as PresencePerson[],
    visibility: String(me?.presence_visibility ?? 'connections'),
    heartbeatSeconds: HEARTBEAT_SECONDS,
  };
}

/**
 * How many people are in a room the viewer is not standing in.
 *
 * This is what puts a number on a district before you walk into it. Names are
 * never served here: a roster for a room you are not in would make the city
 * map a directory of where everybody is, which is the thing the privacy
 * setting exists to prevent.
 */
export async function roomOccupancy(
  admin: SupabaseClient,
  viewerId: string,
  scene: string,
  locationId: string,
): Promise<number> {
  const [{ data: rows }, rules] = await Promise.all([
    admin
      .from('presence')
      .select('user_id')
      .eq('scene', scene)
      .eq('location_id', locationId)
      .gte('last_seen_at', onlineSince()),
    nameability(admin, viewerId),
  ]);

  return ((rows ?? []) as Row[]).filter((r) => rules.counted(String(r.user_id))).length;
}
