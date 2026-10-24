/**
 * Cross-reference every apiClient call in the frontend against every route
 * registered in the Edge Function. Reports client calls with no server route.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2];

/* ---------------- server: route('GET', '/path/:id', …) ---------------- */

const routeDir = join(root, 'supabase/functions/api/routes');
const server = new Set();
for (const file of readdirSync(routeDir).filter((f) => f.endsWith('.ts'))) {
  const src = readFileSync(join(routeDir, file), 'utf8');
  for (const m of src.matchAll(/route\(\s*'([A-Z]+)'\s*,\s*'([^']+)'/g)) {
    server.add(`${m[1]} ${m[2]}`);
  }
}

/* ---------------- client: apiClient.get('/path') ---------------------- */

const svcDir = join(root, 'src/services');
const client = [];
for (const file of readdirSync(svcDir).filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(join(svcDir, file), 'utf8');
  for (const m of src.matchAll(/apiClient\.(get|post|put|patch|delete)\(\s*([`'])([^`']+)\2/g)) {
    client.push({ file, method: m[1].toUpperCase(), path: m[3] });
  }
}

/** `/jobs/${id}/apply` -> `/jobs/:x/apply`; same for the server's `:id`. */
const shape = (p) => p.replace(/\$\{[^}]+\}/g, ':x').replace(/:[A-Za-z_]+/g, ':x');
const serverShapes = new Map();
for (const entry of server) {
  const [method, path] = entry.split(' ');
  serverShapes.set(`${method} ${shape(path)}`, entry);
}

const missing = [];
const matched = [];
for (const c of client) {
  const key = `${c.method} ${shape(c.path)}`;
  if (serverShapes.has(key)) matched.push({ ...c, route: serverShapes.get(key) });
  else missing.push(c);
}

const byFile = {};
for (const m of missing) (byFile[m.file] = byFile[m.file] ?? []).push(`${m.method} ${m.path}`);

console.log(`server routes registered: ${server.size}`);
console.log(`client calls found:       ${client.length}`);
console.log(`matched:                  ${matched.length}`);
console.log(`unmatched:                ${missing.length}\n`);

const FOCUS = process.argv[3];
if (FOCUS) {
  console.log(`--- ${FOCUS} ---`);
  for (const m of matched.filter((x) => x.file.includes(FOCUS) || x.path.includes(FOCUS))) {
    console.log(`  OK      ${m.method.padEnd(6)} ${m.path.padEnd(44)} -> ${m.route}`);
  }
  for (const m of missing.filter((x) => x.file.includes(FOCUS) || x.path.includes(FOCUS))) {
    console.log(`  NO ROUTE ${m.method.padEnd(5)} ${m.path}`);
  }
  console.log();
}

console.log('--- client calls with no server route, by service ---');
for (const [file, paths] of Object.entries(byFile).sort()) {
  console.log(`\n${file}`);
  for (const p of paths.sort()) console.log(`  ${p}`);
}

/* server routes nothing calls — dead or called from elsewhere */
const clientShapes = new Set(client.map((c) => `${c.method} ${shape(c.path)}`));
const unused = [...server].filter((e) => {
  const [method, path] = e.split(' ');
  return !clientShapes.has(`${method} ${shape(path)}`);
});
console.log('\n--- server routes no frontend service calls ---');
for (const u of unused.sort()) console.log(`  ${u}`);
