/**
 * Presence — who is online, and where.
 *
 * Three endpoints, and the first one does nearly all of the work: the
 * heartbeat is both the write that says "I am here" and the read that answers
 * "who else is". Splitting them would double a request that runs on a timer
 * for every signed-in player.
 *
 * Nothing here writes a notification. Presence is ambient; a notice for every
 * person who walked into a room would be the loudest surface in the product
 * and the least useful.
 */
import { route } from '../router.ts';
import { adminClient } from '../_shared/supabase.ts';
import { requireUser } from '../_shared/auth.ts';
import { badRequest } from '../_shared/errors.ts';
import { presenceSnapshot, roomOccupancy } from '../_shared/presence.ts';

type Row = Record<string, unknown>;

const VISIBILITIES = new Set(['everyone', 'connections', 'nobody']);

/** Scene names are frontend data; the server only needs them to be short strings. */
const SCENE_MAX = 40;

/**
 * POST /presence/heartbeat — `{ scene, locationId }`.
 *
 * Upserts this account's position and returns everything the HUD and the
 * current room need to render: the city count, the room's occupancy, the names
 * in it this account may see, and which connections are online.
 *
 * `locationId` is optional and its absence is meaningful — a room with no id
 * is private (the apartment), so it reports a position without ever producing
 * a roster. See the migration.
 */
route('POST', '/presence/heartbeat', async (req) => {
  const body = ((await req.json().catch(() => null)) ?? {}) as Row;

  const scene = String(body.scene ?? '').trim();
  if (!scene) throw badRequest('A heartbeat has to say which room it is in.', { field: 'scene' });
  if (scene.length > SCENE_MAX) throw badRequest('That is not a room.', { field: 'scene' });

  const raw = body.locationId;
  const locationId = raw === null || raw === undefined || raw === '' ? null : String(raw).trim();

  const admin = adminClient();
  const authUser = await requireUser(req);

  // The position is overwritten, never appended: this row is where you are,
  // and `now()` is server-side so a client cannot claim to have been seen
  // later than it was.
  const { error } = await admin.from('presence').upsert(
    {
      user_id: authUser.id,
      scene,
      location_id: locationId,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );

  // A failed heartbeat is not worth failing the room over — the player is
  // simply invisible for one beat, and the next one fixes it. The read still
  // runs so they can see everyone else.
  if (error) console.error('[presence] heartbeat upsert failed:', error.message);

  return { body: await presenceSnapshot(admin, authUser.id, scene, locationId) };
});

/**
 * GET /presence/room?scene=&locationId= — `{ count }`.
 *
 * Occupancy for a room you are not in, which is what lets the city map show
 * how busy a district is before you walk into it. A count, never names: a
 * roster for somewhere you are not standing would turn the map into a
 * directory of where everybody is.
 */
route('GET', '/presence/room', async (req) => {
  const p = new URL(req.url).searchParams;
  const scene = (p.get('scene') ?? '').trim();
  const locationId = (p.get('locationId') ?? '').trim();
  if (!scene || !locationId) {
    throw badRequest('Say which room to count.', { field: 'locationId' });
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  return { body: { count: await roomOccupancy(admin, authUser.id, scene, locationId) } };
});

/**
 * PATCH /users/me/presence — `{ visibility }`.
 *
 * Returns the setting as it now stands, which is what the control renders, so
 * the client never has to assume the write landed.
 */
route('PATCH', '/users/me/presence', async (req) => {
  const body = ((await req.json().catch(() => null)) ?? {}) as Row;
  const visibility = String(body.visibility ?? '').trim();
  if (!VISIBILITIES.has(visibility)) {
    throw badRequest('Choose who can see you: everyone, connections or nobody.', {
      field: 'visibility',
    });
  }

  const admin = adminClient();
  const authUser = await requireUser(req);

  const { error } = await admin
    .from('profiles')
    .update({ presence_visibility: visibility })
    .eq('id', authUser.id);
  if (error) {
    console.error('[presence] visibility update failed:', error.message);
    throw badRequest('Could not save that setting. Try again.');
  }

  return { body: { visibility } };
});

/** GET /users/me/presence — the current setting. */
route('GET', '/users/me/presence', async (req) => {
  const admin = adminClient();
  const authUser = await requireUser(req);
  const { data } = await admin
    .from('profiles')
    .select('presence_visibility')
    .eq('id', authUser.id)
    .maybeSingle();
  return { body: { visibility: String(data?.presence_visibility ?? 'connections') } };
});
