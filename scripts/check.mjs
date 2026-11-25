import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const skip = new Set(['node_modules', '.git', 'coverage']);
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (skip.has(entry)) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (entry.endsWith('.js') || entry.endsWith('.mjs')) files.push(path);
  }
}

walk(root);
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    process.stdout.write(`${file}\n${result.stderr}`);
  }
}

process.stdout.write(`Checked ${files.length} JavaScript files. ${failed} failed.\n`);
process.exit(failed === 0 ? 0 : 1);
