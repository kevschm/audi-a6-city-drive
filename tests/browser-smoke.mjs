import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const dist = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'a6-browser-'));
const executable = process.env.BROWSER_BIN || (process.platform === 'win32'
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : 'google-chrome');
const engine = process.env.BROWSER_ANGLE || 'swiftshader';
const browser = spawn(executable, [
  '--headless=new', '--remote-debugging-port=0', '--window-size=1280,800',
  '--user-data-dir=' + profile, '--no-first-run', '--disable-extensions',
  '--use-gl=angle', '--use-angle=' + engine,
  ...(engine === 'swiftshader' ? ['--enable-unsafe-swiftshader'] : []),
  'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
const server = spawn(process.execPath, [resolve('scripts/serve.mjs')], {
  cwd: dist, windowsHide: true, env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverPort;
let spawnError;
let browserLog = '';
browser.on('error', error => { spawnError = error; });
server.on('error', error => { spawnError = error; });
browser.stderr.on('data', chunk => { browserLog = (browserLog + chunk).slice(-1200); });
server.stdout.on('data', chunk => { serverPort = chunk.toString().match(/localhost:(\d+)/)?.[1] || serverPort; });
const exceptions = [], failedResources = [];
let socket;

async function waitFor(description, probe, timeout = 16000) {
  const end = Date.now() + timeout;
  let lastError;
  do {
    if (spawnError) throw spawnError;
    try {
      const value = await probe();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(115);
  } while (Date.now() < end);
  throw new Error(description + ' timed out' + (lastError ? ' (' + lastError.message + ')' : ''));
}

try {
  const port = await waitFor('Browser debugging port', async () => (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]);
  const tabs = await waitFor('Initial tab', async () => (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(tab => tab.type === 'page'));
  socket = new WebSocket(tabs.webSocketDebuggerUrl);
  await once(socket, 'open');
  const pending = new Map();
  let sequence = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      exceptions.push(details.exception?.description ?? details.text);
    }
    if (message.method === 'Network.responseReceived') {
      const response = message.params.response;
      if (response.status >= 400 && !response.url.endsWith('/favicon.ico')) failedResources.push(response.url);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ method, params, id }));
  });
  const evaluate = async expression => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const inspect = () => evaluate(`Object.fromEntries(['speed','gear','rpm','fps','place'].map(id => [id, document.getElementById(id).textContent]))`);
  const points = (...selectors) => evaluate(`(${JSON.stringify(selectors)}).map(selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2 };
  })`);
  const toggleKey = (key, down) => send('Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp', key, code: 'Key' + key.toUpperCase(), windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
  });
  const press = async key => { await toggleKey(key, true); await toggleKey(key, false); };
  const click = async selector => {
    const [point] = await points(selector);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const touch = (type, touchPoints) => send('Input.dispatchTouchEvent', { type, touchPoints });
  const snap = async name => {
    if (!process.env.SCREENSHOT_DIR) return;
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(resolve(process.env.SCREENSHOT_DIR, name + '.png'), Buffer.from(data, 'base64'));
  };
  let navigation = 0;
  const open = async () => {
    const query = '?test=' + ++navigation;
    await send('Page.navigate', { url: 'http://127.0.0.1:' + serverPort + '/' + query });
    const ready = await waitFor('WebGL startup', () => evaluate(`(() => {
      if (location.search !== ${JSON.stringify(query)}) return;
      const error = document.getElementById('errorModal');
      if (error && !error.classList.contains('hidden')) return { error: document.getElementById('errText').textContent };
      if (document.getElementById('startBtn')?.disabled === false) return { ready: true };
    })()`));
    assert.equal(ready.error, undefined);
  };
  const enter = () => waitFor('Fahrt gestartet', () => evaluate(`document.getElementById('intro').classList.contains('hidden')`));
  const speedOver = limit => waitFor('Speed above ' + limit, async () => Number((await inspect()).speed) > limit);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await waitFor('Static build server', () => serverPort);
  await open();
  const gpu = await evaluate(`(() => {
    const gl = document.getElementById('view').getContext('webgl');
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  })()`);
  await snap('a6-desktop-start');
  await click('#startBtn');
  await enter();
  await toggleKey('w', true);
  await speedOver(12);
  await toggleKey('w', false);
  const desktop = await inspect();
  assert.match(desktop.gear, /^D/);
  await snap('a6-desktop');
  await press('v');
  assert.equal(await evaluate(`document.querySelector('#camBtn span').textContent`), 'Schrägansicht');
  await snap('a6-dreiviertel');
  await press('v');
  assert.equal(await evaluate(`document.querySelector('#camBtn span').textContent`), 'Motorhaube');
  await click('#qualityBtn');
  assert.equal(await evaluate(`document.querySelector('#qualityBtn span').textContent`), 'Quality');
  await press('v');
  assert.equal(await evaluate(`document.querySelector('#camBtn span').textContent`), 'Frontansicht');
  await press('p');
  await click('#duskBtn');
  assert.equal(await evaluate(`document.getElementById('duskBtn').textContent`), 'Abend');
  await click('#weatherBtn');
  assert.equal(await evaluate(`document.getElementById('weatherBtn').textContent`), 'Nass');
  await click('#resumeBtn');
  await waitFor('Evening headlights', () => evaluate(`document.getElementById('lightBtn').getAttribute('aria-pressed') === 'true'`));
  await press('q');
  assert.equal(await evaluate(`document.getElementById('leftSignal').getAttribute('aria-pressed')`), 'true');
  await waitFor('Wet asphalt readout', () => evaluate(`document.getElementById('place').textContent.includes('nass')`));
  await snap('a6-v07-nass');
  assert.equal(await evaluate(`document.getElementById('view').getContext('webgl').getError()`), 0);
  await press('v');
  await press('v');
  assert.equal(await evaluate(`document.querySelector('#camBtn span').textContent`), 'Cockpit');
  await snap('a6-v07-cockpit');
  await press('q');
  await press('l');
  assert.equal(await evaluate(`document.getElementById('lightBtn').getAttribute('aria-pressed')`), 'false');
  await press('p');
  await click('#duskBtn');
  await click('#weatherBtn');
  await click('#resumeBtn');
  await press('v');
  await click('#qualityBtn');
  assert.equal(await evaluate(`document.querySelector('#qualityBtn span').textContent`), 'Performance');
  await press('p');
  assert.equal(await evaluate(`document.getElementById('pauseModal').classList.contains('hidden')`), false);
  const stopped = (await inspect()).speed;
  await delay(350);
  assert.equal((await inspect()).speed, stopped);
  await click('#resetBtn');
  await waitFor('Reset to idle', async () => (await inspect()).speed === '0' && (await inspect()).gear === 'N');
  await toggleKey('s', true);
  await waitFor('Reverse engaged', async () => (await inspect()).gear === 'R');
  await speedOver(2);
  await toggleKey('s', false);
  await click('#audioBtn');
  assert.equal(await evaluate(`document.getElementById('audioBtn').getAttribute('aria-pressed')`), 'false');
  await press('t');
  assert.equal(await evaluate(`document.getElementById('trialPhase').textContent`), 'Zum Starttor');
  await toggleKey('w', true);
  await waitFor('Station course start and first checkpoint', () => evaluate(`document.getElementById('trialPhase').textContent.startsWith('Tor 2')`));
  await toggleKey('w', false);
  await press('p');
  const stationRound = await evaluate(`document.getElementById('trialTime').textContent`);
  assert.notEqual(stationRound, '0:00,00');
  await delay(240);
  assert.equal(await evaluate(`document.getElementById('trialTime').textContent`), stationRound);
  await click('#resumeBtn');
  await click('#trialBtn');
  assert.equal(await evaluate(`document.getElementById('routePanel').hidden`), true);
  await click('#audioBtn');
  await click('#driveReset');
  await toggleKey('w', true);
  await waitFor('Visible crash damage', () => evaluate(`document.getElementById('condition').textContent !== 'Intakt'`), 38000);
  await toggleKey('w', false);
  const impact = await evaluate(`document.getElementById('condition').textContent`);
  assert.equal(await evaluate(`document.getElementById('view').getContext('webgl').getError()`), 0);
  await snap('a6-v06-impact');
  await click('#driveReset');
  assert.equal(await evaluate(`document.getElementById('condition').textContent`), 'Intakt');
  assert.equal((await inspect()).speed, '0');

  await send('Emulation.setDeviceMetricsOverride', {
    width: 915, height: 412, deviceScaleFactor: 2.625, mobile: true,
    screenOrientation: { angle: 90, type: 'landscapePrimary' },
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await open();
  assert.equal(await evaluate(`document.querySelector('#qualityBtn span').textContent`), 'Performance');
  const [start] = await points('#startBtn');
  await touch('touchStart', [{ ...start, id: 1 }]);
  await touch('touchEnd', []);
  await enter();
  await touch('touchStart', [{ x: 406, y: 178, id: 3 }]);
  await touch('touchMove', [{ x: 525, y: 207, id: 3 }]);
  await touch('touchEnd', []);
  await waitFor('Scene drag selects the free camera', () => evaluate(`document.querySelector('#camBtn span').textContent === 'Frei'`));
  await touch('touchStart', [{ x: 383, y: 192, id: 3 }, { x: 506, y: 192, id: 4 }]);
  await touch('touchMove', [{ x: 359, y: 192, id: 3 }, { x: 532, y: 192, id: 4 }]);
  await touch('touchEnd', []);
  const [gas, right, left] = await points('[data-key=throttle]', '[data-key=right]', '[data-key=left]');
  await touch('touchStart', [{ ...gas, id: 1 }, { ...right, id: 2 }]);
  await waitFor('Simultaneous touch throttle and steering', () => evaluate(`document.querySelectorAll('.ctrl.active').length === 2`));
  await speedOver(8);
  await touch('touchMove', [{ ...gas, id: 1 }, { ...left, id: 2 }]);
  await waitFor('Steering changes sides on drag', () => evaluate(`document.querySelector('[data-key=left]').classList.contains('active')`));
  await touch('touchCancel', []);
  await waitFor('Touch input released', () => evaluate(`document.querySelectorAll('.ctrl.active').length === 0`));
  const mobile = await inspect();
  const overlaps = await evaluate(`(() => {
    const meter = document.querySelector('.cluster').getBoundingClientRect();
    return Array.from(document.querySelectorAll('.ctrl')).some(button => {
      const r = button.getBoundingClientRect();
      return r.right > meter.left && r.left < meter.right && r.top < meter.bottom && r.bottom > meter.top;
    });
  })()`);
  assert.equal(overlaps, false, 'Touch instrument cluster must stay clear of pedals');
  await snap('a6-querformat');
  assert.equal(await evaluate(`document.getElementById('view').getContext('webgl').getError()`), 0);
  assert.deepEqual(exceptions, []);
  assert.deepEqual(failedResources, []);
  console.log(JSON.stringify({ gpu, desktop, stationRound, impact, mobile, exceptions, failedResources }, null, 2));
} catch (error) {
  console.error(error);
  console.error({ exceptions, failedResources, browserLog });
  process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  server.kill();
}
