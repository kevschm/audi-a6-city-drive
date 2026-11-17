import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');
const files = ['index.html', 'src/main.js', 'src/styles.css', 'src/simulation/fixed-step.js'];

for (const path of files) {
  const f = resolve(root, path);
  if (!f.startsWith(root + '/')) throw Error('Unexpected path');
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
