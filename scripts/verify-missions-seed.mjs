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
const { missions } = await import(mockPath.href);
const sql = readFileSync(sqlPath, 'utf8');

const problems = [];
const note = (m) => problems.push(m);

/** JS string -> SQL single-quoted literal. */
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

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

if (problems.length) {
  console.log(`\n${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nOK - seed matches the mock exactly.');
