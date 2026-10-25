/**
 * Presence — who is online, and where.
 * Backed by `POST /presence/heartbeat`, `GET /presence/room`,
 * `GET /users/me/presence`, `PATCH /users/me/presence`.
 *
 * The heartbeat is one call that both writes and reads: it says "I am here"
 * and gets back the city count, this room's occupancy and roster, and which
 * connections are online. One request on a timer, not three.
 *
 * WHY POLLING. Supabase Realtime presence would push instead of poll, and is
 * deliberately not used: it needs `supabase-js` in the browser bundle and RLS
 * policies on a database that has none by design. The transport lives behind
 * this module on the client and `_shared/presence.ts` on the server, so
 * swapping it later touches two files and no rooms.
 *
 * NAMED vs COUNTED. `hereCount` counts everyone in the room; `here` names only
 * the ones who allow it. Those numbers are allowed to disagree, and the panel
 * says so rather than hiding the difference — a body you can see whose name
 * you may not is how a real lobby works.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, currentUserId } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { presenceFixtures } from '../mock/presence.js';
import { suggestedPeople } from '../mock/social.js';
import { resolveProgression } from '../utils/progression.js';

/**
 * How long a heartbeat counts for, and how often to send one.
 *
 * The server owns both numbers and returns `heartbeatSeconds` with every
 * snapshot; this is the value used before the first reply lands.
 */
export const HEARTBEAT_SECONDS = 15;

/* ----------------------------------------------------------- the mock --- */

/** The visibility setting for a mock person — fixture people carry their own. */
function mockVisibility(userId) {
  const fixture = presenceFixtures.find((p) => p.id === userId);
  if (fixture) return fixture.presenceVisibility;
  return db.presenceVisibility[userId] ?? 'connections';
}

/** Accepted connections of the signed-in account, as a Set of user ids. */
function mockConnected(me) {
  return new Set(
    db.connections
      .filter((c) => c.status === 'accepted')
      .filter((c) => c.requesterId === me || c.addresseeId === me)
      .map((c) => (c.requesterId === me ? c.addresseeId : c.requesterId)),
  );
}

/** A roster card for a mock person, or null if we do not know who they are. */
function mockCard(userId) {
  const person = suggestedPeople.find((p) => p.id === userId);
  const pooled = db.candidates.find((c) => c.id === userId);
  if (!person && !pooled) return null;
  return {
    id: userId,
    name: person?.name ?? pooled?.name ?? 'Grooveli member',
    headline: person?.headline ?? pooled?.headline ?? 'Grooveli member',
    color: person?.color ?? pooled?.color ?? '#5be3c8',
    careerLevel: pooled?.careerLevel ?? resolveProgression(0).level,
  };
}

/** Everyone the mock holds to be online: the fixtures, plus accounts that beat recently. */
function mockOnline() {
  const cutoff = Date.now() - 45_000;
  const fromAccounts = Object.entries(db.presence)
    .filter(([, row]) => new Date(row.lastSeenAt).getTime() >= cutoff)
    .map(([id, row]) => ({ id, scene: row.scene, locationId: row.locationId }));

  return [
    ...presenceFixtures.map((p) => ({ id: p.id, scene: p.scene, locationId: p.locationId })),
    ...fromAccounts,
  ];
}

function mockSnapshot(scene, locationId) {
  const me = currentUserId();
  const connected = mockConnected(me);
  const blocked = new Set(db.blockedAuthorIds[me] ?? []);

  // Counted first, named second — the same order the server uses, so a ghost
  // cannot be inferred from a number that moved.
  const visible = mockOnline().filter(
    (row) => row.id !== me && !blocked.has(row.id) && mockVisibility(row.id) !== 'nobody',
  );

  const canName = (id) => mockVisibility(id) === 'everyone' || connected.has(id);

  const inRoom = locationId
    ? visible.filter((row) => row.scene === scene && row.locationId === locationId)
    : [];
  const connectionRows = visible.filter((row) => connected.has(row.id));

  const person = (row) => {
    const card = mockCard(row.id);
    return card ? { ...card, scene: row.scene, locationId: row.locationId } : null;
  };

  return {
    cityOnline: visible.length + 1,
    hereCount: inRoom.length,
    here: inRoom.filter((row) => canName(row.id)).map(person).filter(Boolean),
    connectionsOnline: connectionRows.map(person).filter(Boolean),
    visibility: me ? db.presenceVisibility[me] ?? 'connections' : 'connections',
    heartbeatSeconds: HEARTBEAT_SECONDS,
  };
}

/* -------------------------------------------------------- the surface --- */

/**
 * Say where you are, and find out who else is here.
 *
 * @param {{ scene: string, locationId?: string | null }} position
 * @returns {Promise<object>} the presence snapshot
 */
export function heartbeat({ scene, locationId = null }) {
  return withMock(
    async () => {
      await delay(120);
      const me = currentUserId();
      if (me) {
        db.presence[me] = { scene, locationId, lastSeenAt: new Date().toISOString() };
      }
      return mockSnapshot(scene, locationId);
    },
    () => apiClient.post('/presence/heartbeat', { scene, locationId }),
  );
}

/**
 * How many people are in a room you are not standing in.
 *
 * A count, never names: a roster for somewhere else would make the city map a
 * directory of where everybody is.
 *
 * @returns {Promise<number>}
 */
export function getRoomOccupancy(scene, locationId) {
  return withMock(
    async () => {
      await delay(80);
      return mockSnapshot(scene, locationId).hereCount;
    },
    async () => {
      const result = await apiClient.get('/presence/room', { params: { scene, locationId } });
      return result?.count ?? 0;
    },
  );
}

/** @returns {Promise<'everyone' | 'connections' | 'nobody'>} */
export function getPresenceVisibility() {
  return withMock(
    async () => {
      await delay(80);
      const me = currentUserId();
      return me ? db.presenceVisibility[me] ?? 'connections' : 'connections';
    },
    async () => {
      const result = await apiClient.get('/users/me/presence');
      return result?.visibility ?? 'connections';
    },
  );
}

export function setPresenceVisibility(visibility) {
  return withMock(
    async () => {
      await delay(160);
      const me = currentUserId();
      if (me) db.presenceVisibility[me] = visibility;
      return visibility;
    },
    async () => {
      const result = await apiClient.patch('/users/me/presence', { visibility });
      return result?.visibility ?? visibility;
    },
  );
}
