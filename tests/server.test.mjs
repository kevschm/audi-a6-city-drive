import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';

test('game server serves HTML, JavaScript modules and CSS with correct media types', async (t) => {
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {
    env: { ...process.env, PORT: '18087' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => server.kill());
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server did not start')), 8000);
    server.once('error', reject);
    server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Server exited: ${code}`)); });
  });
  const base = 'http://127.0.0.1:18087';
  for (const [path, type] of [
    ['/', 'text/html'],
    ['/src/main.js', 'text/javascript'],
    ['/src/simulation/fixed-step.js', 'text/javascript'],
    ['/src/styles.css', 'text/css'],
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').startsWith(type));
    assert.ok((await response.text()).length > 50);
  }
  const miss = await fetch(base + '/does-not-exist');
  assert.equal(miss.status, 404);
});
