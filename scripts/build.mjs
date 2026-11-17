import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');
const files = ['index.html', 'src/main.js', 'src/styles.css', 'src/simulation/fixed-step.js'];

for (const path of files) {
  const f = resolve(root, path);
  const rel = relative(root, f);
  if (rel.startsWith('..') || isAbsolute(rel)) throw Error('Unexpected path');
  if (!(await stat(f)).isFile()) throw Error(`Missing build asset: ${path}`);
}
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const path of files) {
  const to = resolve(dist, path);
  await mkdir(resolve(to, '..'), { recursive: true });
  await cp(resolve(root, path), to);
}
console.log(`Static browser game prepared in ${dist}`);
