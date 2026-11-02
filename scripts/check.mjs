import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
async function visit(directory) {
  const files = [];
  for (const entry of await readdir(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await visit(path));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}
const files = ['server.mjs', ...await visit('src'), ...await visit('api'), ...await visit('public'), ...await visit('scripts')];
for (const file of files) { const result = spawnSync(process.execPath, ['--check', file], { cwd: root, stdio: 'inherit' }); if (result.status !== 0) process.exit(result.status || 1); }
console.log(`Syntax checked ${files.length} JavaScript modules.`);
