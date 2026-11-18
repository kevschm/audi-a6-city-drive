import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

for (const directory of ['src', 'scripts']) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.m?js$/.test(entry.name)) continue;
    const check = spawnSync(process.execPath, ['--check', join(entry.parentPath || entry.path, entry.name)], { stdio: 'inherit' });
    if (check.error) throw check.error;
    if (check.status !== 0) process.exit(check.status ?? 1);
  }
}
