/**
 * The live ticker.
 * Backed by `GET /ticker`.
 *
 * Two halves from one call: milestones people on Grooveli have just reached,
 * and headlines from the wider market. The server interleaves them, because
 * which to show next is a presentation decision that both the real API and
 * the mock have to make the same way — and only one of them should own it.
 */
import { apiClient, withMock } from './apiClient.js';
import { db, currentUserId } from './mockDb.js';
import { delay } from '../utils/delay.js';
import { suggestedPeople } from '../mock/social.js';

/**
 * What the strip may announce, mirroring the server's allowlist.
 *
 * Kept in step deliberately: if the mock announced things the live endpoint
 * refuses, the ticker would change character the day a deployment caught up
 * and nobody would connect the two.
 */
const TICKER_EVENTS = {
  'skill.challenge': 'passed a skill challenge',
  'course.completed': 'finished a course',
  'interview.simulated': 'completed an interview simulation',
  'assessment.completed': 'finished their career assessment',
  'mission.completed': 'completed a mission',
};


/** How often the strip re-reads. Milestones arrive at human speed. */
export const REFRESH_SECONDS = 90;

/** Headlines for the mock, so the strip has both halves without a backend. */
const MOCK_NEWS = [
  { title: 'Remote hiring climbs for a third quarter', source: 'Market Watch' },
  { title: 'Employers put verified skills above degrees in new survey', source: 'Work Weekly' },
  { title: 'Junior engineering openings up 12% year on year', source: 'Tech Hiring' },
  { title: 'Four-day weeks hold steady a year after the trials', source: 'BBC Business' },
];

/** "Amara K." — the same shortening the server does. */
function shortName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Someone';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** @returns {Promise<object[]>} milestones and headlines, interleaved */
export function getTicker() {
  return withMock(
    async () => {
      await delay(220);
      const me = currentUserId();

      const milestones = (db.activity[me] ?? [])
        .filter((a) => a.shareable && TICKER_EVENTS[a.type])
        .slice(0, 6)
        .map((a, i) => ({
          kind: 'milestone',
          id: a.id,
          // The mock has one account's activity, so other people's milestones
          // are attributed to the suggested people — otherwise the strip would
          // read as one person achieving everything.
          text: `${shortName(suggestedPeople[i % suggestedPeople.length]?.name)} ${TICKER_EVENTS[a.type]}`,
          xp: a.xp ?? 0,
          at: a.createdAt,
        }));

      const headlines = MOCK_NEWS.map((n, i) => ({
        kind: 'news',
        id: `mock-news-${i}`,
        text: n.title,
        source: n.source,
        url: null,
        at: new Date(Date.now() - i * 3600_000).toISOString(),
      }));

      const items = [];
      for (let i = 0; i < Math.max(milestones.length, headlines.length); i += 1) {
        if (milestones[i]) items.push(milestones[i]);
        if (headlines[i]) items.push(headlines[i]);
      }
      return items;
    },
    () => apiClient.get('/ticker'),
  );
}
