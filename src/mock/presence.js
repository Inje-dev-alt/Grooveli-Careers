/**
 * People who are "online" while the mock backend is serving.
 *
 * Presence is the one feature that cannot be seen at all on an empty database:
 * the real thing needs a second person signed in, and until the backend has
 * users there is no second person. So the mock stands a few of the suggested
 * people around the city in fixed places — the roster, the city count and the
 * district occupancy all read these the way they will read real rows.
 *
 * Fixed rather than random on purpose. A roster that reshuffles every fifteen
 * seconds makes it impossible to tell a working feature from a flickering one,
 * and the interview bank already taught that lesson: a shuffled fixture turns
 * a test into a coin toss.
 *
 * Ids match `suggestedPeople` in ./social.js so a mock roster entry is the same
 * person the network screen suggests, and `presenceVisibility` exercises all
 * three settings — including the ghost, who should never appear anywhere.
 */
export const presenceFixtures = [
  {
    id: 'cand-001',
    scene: 'city',
    locationId: 'corporate-district',
    presenceVisibility: 'everyone',
  },
  {
    id: 'cand-003',
    scene: 'office',
    locationId: 'org-keystone',
    presenceVisibility: 'everyone',
  },
  {
    id: 'cand-006',
    scene: 'city',
    locationId: 'corporate-district',
    // Named only to connections. A stranger sees the occupancy go up by one
    // and no name, which is the default setting doing its job.
    presenceVisibility: 'connections',
  },
  {
    id: 'cand-002',
    scene: 'city',
    locationId: 'technology-hub',
    // Neither named nor counted, anywhere. If this person ever shows up in a
    // roster or moves a number, the visibility rule has a hole in it.
    presenceVisibility: 'nobody',
  },
];
