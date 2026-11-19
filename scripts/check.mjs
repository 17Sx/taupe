// Checks the syntax of every JS/MJS file in the project (cross-platform).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const files = [];
for (const dir of ['src', 'electron', 'public', 'scripts']) {
  for (const f of fs.readdirSync(dir)) if (/\.(m?js|cjs)$/.test(f)) files.push(path.join(dir, f));
}
let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); console.log('✓', f); }
  catch (e) { failed++; console.error('✗', f, '\n', e.stderr?.toString()); }
}
if (failed) process.exit(1);
console.log(`\n${files.length} fichiers OK`);
