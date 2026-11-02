/**
 * Assert that Grooveli City can actually be walked.
 *
 * Flood-fills the baked collision grid from the spawn point and checks that the
 * approach to every location is connected to it. Blocking the carriageways made
 * the city read properly and simultaneously sealed one building's entrance
 * behind a road with no crossing — the kind of fault that is invisible in a
 * screenshot and obvious the moment someone tries to walk there.
 *
 * Run after any change to the layout, the mask, or the locations.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const m = JSON.parse(await readFile(join(root, 'src/game/world/cityManifest.json'), 'utf8'));
const { cell, cols, rows, grid } = m.collision;
const { cityLocations, WORLD } = await import(join(root, 'src/game/world/locations.js'));

const blocked = (c,r) => c<0||r<0||c>=cols||r>=rows|| grid[r][c]==='#';
const seen = new Set();
const start = [Math.floor(WORLD.spawn.x/cell), Math.floor(WORLD.spawn.y/cell)];
if (blocked(...start)) { console.log('FAIL: spawn itself is blocked'); process.exit(1); }
const q=[start]; seen.add(start.join(','));
while(q.length){ const [c,r]=q.pop();
  for(const [dc,dr] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const n=[c+dc,r+dr], k=n.join(',');
    if(!seen.has(k) && !blocked(...n)){ seen.add(k); q.push(n); }
  }
}
const walkable = grid.join('').split('.').length - 1;
console.log(`reachable: ${seen.size} of ${walkable} walkable cells\n`);
let bad=0;
for (const loc of cityLocations){
  // The interaction zone sits just in front of the entrance.
  const x = loc.position.x, y = loc.position.y + loc.size.height/2 + 40;
  const c = Math.floor(x/cell), r = Math.floor(y/cell);
  const ok = seen.has(`${c},${r}`);
  if(!ok) bad++;
  console.log(`${ok?'  ok':'UNREACHABLE'}  ${loc.id.padEnd(22)} approach (${x|0},${y|0})`);
}
console.log(bad ? `\n${bad} location(s) cannot be walked to` : '\nevery location is reachable on foot');
process.exit(bad ? 1 : 0);
