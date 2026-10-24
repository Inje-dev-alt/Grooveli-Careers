/**
 * Checks that the missions migration seed is a faithful port of the mock: no
 * fabricated or missing rows, and every field value present verbatim. The
 * companion to scripts/generate-seed.mjs - that one writes SQL from the
 * fixtures, this one audits SQL that was written by hand:
 *
 *   node scripts/verify-missions-seed.mjs
 *
 * Exits non-zero on any mismatch, so it can gate a change to either side.
 */
import { readFileSync } from 'node:fs';

const mockPath = new URL('../src/mock/missions.js', import.meta.url);
const sqlPath = new URL(
  '../supabase/migrations/20261023120000_missions.sql',
  import.meta.url,
);
// Objective context arrived in a later migration, as an ALTER plus four
// UPDATEs, so the discriminators are not in the seed INSERT and have to be
// checked against that file instead.
const contextSqlPath = new URL(
  '../supabase/migrations/20261023140000_mission_objective_context.sql',
  import.meta.url,
);
// The path interview objectives are keyed by a derived UPDATE in a third
// migration — see `derivedPathKey`.
const pathSqlPath = new URL(
  '../supabase/migrations/20261024150000_path_interview_objectives.sql',
  import.meta.url,
);
const { missions } = await import(mockPath.href);
const sql = readFileSync(sqlPath, 'utf8');
const contextSql = readFileSync(contextSqlPath, 'utf8');
const pathSql = readFileSync(pathSqlPath, 'utf8');

const problems = [];
const note = (m) => problems.push(m);

/** JS string -> SQL single-quoted literal. */
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * Is this objective keyed by the derived rule rather than by its own UPDATE?
 *
 * 20261024150000 keys every `interview.simulated` objective whose mission has
 * a `path_id`, by copying that path from the missions table. The SQL names no
 * objective, so there is nothing to quote — what is checked instead is that
 * the migration really does carry that join, and that the mock agrees the
 * value is the mission's own path.
 */
const pathKeyRule = /update public\.mission_objectives o[\s\S]*?set context_key\s*=\s*'pathId',\s*\n\s*context_value\s*=\s*m\.path_id[\s\S]*?and o\.event = 'interview\.simulated'/;

const derivedPathKey = (mission, objective) =>
  pathKeyRule.test(pathSql) &&
  Boolean(mission.pathId) &&
  objective.event === 'interview.simulated';

/**
 * The text of the one INSERT tuple that starts at `start`. A tuple ends where
 * the next one begins, or - for the last tuple in a list - at the `on conflict`
 * clause, so looking for the next `),\n` misses it and returns nothing.
 */
const tupleAt = (start) => {
  const rest = sql.slice(start);
  const end = rest.search(/\)\s*(?:,\s*\n|\n\s*on conflict)/i);
  return end === -1 ? rest : rest.slice(0, end + 1);
};

/* ---------------- ids in the SQL vs ids in the mock ---------------------- */

const sqlMissionIds = new Set(
  [...sql.matchAll(/\('(msn-[a-z0-9-]+)',\n/g)].map((m) => m[1]),
);
const sqlObjectiveIds = new Set(
  [...sql.matchAll(/\('(obj-[a-z0-9-]+)', '(msn-[a-z0-9-]+)'/g)].map((m) => m[1]),
);

const mockMissionIds = new Set(missions.map((m) => m.id));
const mockObjectiveIds = new Set(missions.flatMap((m) => m.objectives.map((o) => o.id)));

for (const id of sqlMissionIds) {
  if (!mockMissionIds.has(id)) note(`FABRICATED mission in SQL, absent from mock: ${id}`);
}
for (const id of sqlObjectiveIds) {
  if (!mockObjectiveIds.has(id)) note(`FABRICATED objective in SQL, absent from mock: ${id}`);
}
for (const id of mockMissionIds) {
  if (!sqlMissionIds.has(id)) note(`MISSING mission in SQL: ${id}`);
}
for (const id of mockObjectiveIds) {
  if (!sqlObjectiveIds.has(id)) note(`MISSING objective in SQL: ${id}`);
}

/* -------------- every field value must appear verbatim in the SQL -------- */

for (const m of missions) {
  const fields = {
    title: lit(m.title),
    description: lit(m.description),
    type: lit(m.type),
    category: lit(m.category),
    difficulty: lit(m.difficulty),
    locationId: m.locationId ? lit(m.locationId) : null,
    pathId: m.pathId ? lit(m.pathId) : null,
    reward: m.reward ? lit(m.reward) : null,
    unlocksLevel: m.unlocksLevel ? lit(m.unlocksLevel) : null,
  };
  for (const [name, value] of Object.entries(fields)) {
    if (value === null) continue;
    if (!sql.includes(value)) note(`${m.id}: ${name} not found verbatim in SQL -> ${value}`);
  }

  // xp_reward has to be right in this mission's own tuple, not just somewhere.
  const mStart = sql.indexOf(`('${m.id}',\n`);
  if (mStart === -1) {
    note(`${m.id}: mission tuple not found`);
  } else {
    const tuple = tupleAt(mStart);
    if (!new RegExp(`\\n\\s*${m.xpReward}, `).test(tuple)) {
      note(`${m.id}: xpReward ${m.xpReward} not found in its tuple`);
    }
    if (!m.reward && !/, null, null,|, null, 'Level|, null, null\)/.test(tuple)) {
      note(`${m.id}: mock has no reward; check SQL did not invent one`);
    }
  }

  for (const o of m.objectives) {
    const ofields = {
      label: lit(o.label),
      hint: o.hint ? lit(o.hint) : null,
      event: lit(o.event),
      actionLabel: o.actionLabel ? lit(o.actionLabel) : null,
      actionRoute: o.actionRoute ? lit(o.actionRoute) : null,
    };
    for (const [name, value] of Object.entries(ofields)) {
      if (value === null) continue;
      if (!sql.includes(value)) note(`${o.id}: ${name} not found verbatim in SQL -> ${value}`);
    }

    const start = sql.indexOf(`('${o.id}', '${m.id}'`);
    if (start === -1) {
      note(`${o.id}: tuple not found under mission ${m.id}`);
    } else {
      const tuple = tupleAt(start);
      if (!new RegExp(`${lit(o.event)}, ${o.target},`).test(tuple)) {
        note(`${o.id}: event/target mismatch (expected ${o.event}, ${o.target})`);
      }
      // An objective with no hint must carry an explicit null, not a stray string.
      if (!o.hint && !/,\n\s*null,\n/.test(tuple)) {
        note(`${o.id}: mock has no hint; SQL tuple should pass null`);
      }
    }

    /* The discriminator, from the later migrations. Both directions: a mock
       objective that names a skill must be keyed in SQL, and an objective keyed
       in SQL must say so in the mock - a drift either way is a mission that
       counts the wrong work.

       Two shapes to recognise. The skill objectives are keyed one UPDATE each,
       by id. The ten path interview objectives are keyed by a single derived
       UPDATE that joins `missions` and copies `path_id`, because ten hand-typed
       pairings are ten chances to pair an objective with the wrong path. A
       derived rule cannot be matched by quoting it, so it is checked as the
       rule it is: this objective is covered when the migration carries that
       join, the mission has a path, and the event matches. */
    const update = derivedPathKey(m, o)
      ? [null, 'pathId', m.pathId]
      : new RegExp(
        `set context_key = '([^']*)', context_value = '([^']*)'\\s*\\n\\s*where id = ${lit(o.id)};`,
      ).exec(contextSql);

    if (o.context && !update) {
      note(`${o.id}: mock keys on ${o.context.key}=${o.context.value}; no UPDATE in SQL`);
    } else if (!o.context && update) {
      note(`${o.id}: SQL keys on ${update[1]}=${update[2]}; mock has no context`);
    } else if (o.context && update) {
      if (update[1] !== o.context.key || update[2] !== o.context.value) {
        note(
          `${o.id}: context mismatch - mock ${o.context.key}=${o.context.value}, ` +
            `SQL ${update[1]}=${update[2]}`,
        );
      }
    }
  }
}

/* --------------------------------- report -------------------------------- */

const objCount = missions.reduce((n, m) => n + m.objectives.length, 0);
console.log(`mock:  ${missions.length} missions, ${objCount} objectives`);
console.log(`sql:   ${sqlMissionIds.size} missions, ${sqlObjectiveIds.size} objectives`);

const events = [...new Set(missions.flatMap((m) => m.objectives.map((o) => o.event)))].sort();
console.log(`events referenced: ${events.join(', ')}`);

const noReward = missions.filter((m) => !m.reward).map((m) => m.id);
const noHint = missions.flatMap((m) => m.objectives.filter((o) => !o.hint).map((o) => o.id));
console.log(`missions with no reward: ${noReward.join(', ') || 'none'}`);
console.log(`objectives with no hint: ${noHint.join(', ') || 'none'}`);

const keyed = missions.flatMap((m) =>
  m.objectives.filter((o) => o.context).map((o) => `${o.id}=${o.context.value}`),
);
console.log(`objectives keyed to a context: ${keyed.join(', ') || 'none'}`);

/* Any event shared by objectives that are not all discriminated is a mission
   that can be satisfied by another mission's work. Reported rather than failed:
   plenty of shared events are deliberate ("Apply to three suitable jobs"), so
   this is a list to read, not a rule to enforce. */
const byEvent = {};
missions.forEach((m) =>
  m.objectives.forEach((o) => {
    (byEvent[o.event] = byEvent[o.event] ?? []).push(o);
  }),
);
const ambiguous = Object.entries(byEvent)
  .filter(([, list]) => list.length > 1 && list.some((o) => !o.context))
  .map(([event, list]) => `${event} (${list.filter((o) => !o.context).length}/${list.length} unkeyed)`);
console.log(`shared events with undiscriminated objectives: ${ambiguous.join(', ') || 'none'}`);

if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nOK - seed matches the mock exactly.');
