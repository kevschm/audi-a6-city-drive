import { createAdaptiveResolution } from './performance/adaptive-resolution.js';
import { createFixedStepClock } from './simulation/fixed-step.js';
import { createVehicleState, stepVehicle, vehicleOverlapsTraffic } from './simulation/vehicle.js';
import { buildCity, districtAt, halfWorld, roads, roadHalfWidth, roadSurfaceAt, startPosition } from './world/city.js';
import { makeTraffic } from './world/traffic.js';
import { lerp, mixAngle } from './render/math.js';
import { Mesh } from './render/mesh.js';
import { createRenderer } from './render/renderer.js?webgl-android-fix-20261118';
import { buildVehicles } from './render/vehicles.js';
import { createMinimap } from './ui/minimap.js';
import { cameraNames, createCamera } from './ui/camera.js';
import { createDriveAudio } from './ui/audio.js';

const $ = id => document.getElementById(id);
const buttons = {
  start: $('startBtn'), camera: $('camBtn'), quality: $('qualityBtn'), audio: $('audioBtn'),
  pause: $('pauseBtn'), resume: $('resumeBtn'), reset: $('resetBtn'),
};
const keyActions = {
  w: 'throttle', arrowup: 'throttle', s: 'brake', arrowdown: 'brake',
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', ' ': 'handbrake',
};
const surfaces = { asphalt: 'Asphalt', paving: 'Pflaster', grass: 'Grünfläche' };
const qualityModes = ['auto', 'high', 'eco'];
const qualityNames = ['Auto', 'Hoch', 'Eco'];
const visualFields = ['x', 'z', 'heave', 'pitch', 'roll', 'steer', 'spin'];
const rpmFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const distanceFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fail(error) {
  $('intro').classList.add('hidden');
  $('pauseModal').classList.add('hidden');
  $('errText').textContent = String(error.message || error);
  $('errorModal').classList.remove('hidden');
}

function boot() {
  const canvas = $('view');
  const renderer = createRenderer(canvas);
  const city = buildCity({ Mesh });
  const { cityChunks, landscape, obstacles, signals } = city;
  renderer.upload(landscape);
  for (const chunk of cityChunks) renderer.upload(chunk.mesh);
  const vehicles = buildVehicles(renderer);
  const traffic = makeTraffic(roads, signals);
  const world = { roads, obstacles, roadSurfaceAt, traffic: traffic.actors, bounds: halfWorld };
  const drawMap = createMinimap($('minimap'), city, roads, roadHalfWidth, halfWorld);
  const camera = createCamera(), clock = createFixedStepClock(), audio = createDriveAudio();
  const touch = matchMedia('(pointer: coarse)').matches;
  const adaptive = createAdaptiveResolution({
    minScale: touch ? 0.56 : 0.68, maxScale: touch ? 1.28 : 1.52, targetFps: touch ? 36 : 55,
    highFpsFactor: touch ? 1.20 : 1.06,
  });
  const car = { ...createVehicleState(), ...startPosition };
  const previous = { ...car };
  const visible = { ...car };
  const keys = new Set();
  const pointers = new Map();
  const input = { left: false, right: false, throttle: false, brake: false, handbrake: false };
  const controls = [...document.querySelectorAll('[data-key]')];
  let started = false, paused = false, failed = false, audioEnabled = false;
  let cameraMode = 0, qualityIndex = 0, prevTime = 0, lastHud = -Infinity, collisionAt = -Infinity;
  let raf = 0, toastTimer;

  function notify(text) {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1450);
  }

  function updateInput() {
    for (const name of Object.keys(input)) input[name] = false;
    for (const key of keys) input[keyActions[key]] = true;
    for (const button of pointers.values()) input[button.dataset.key] = true;
    for (const button of controls) button.classList.toggle('active', input[button.dataset.key]);
  }

  function clearInput() {
    keys.clear();
    pointers.clear();
    updateInput();
  }

  function draw(dt, interpolation = 1) {
    Object.assign(visible, car);
    for (const field of visualFields) visible[field] = lerp(previous[field], car[field], interpolation);
    visible.heading = mixAngle(previous.heading, car.heading, interpolation);
    const view = camera.update(visible, cameraMode, dt, obstacles);
    const device = window.devicePixelRatio || 1;
    const quality = qualityModes[qualityIndex];
    const scale = Math.min(device, quality === 'eco' ? 0.78 : quality === 'high' ? 1.7 : adaptive.scale);
    const scene = vehicles.scene(visible, traffic.actors, signals, traffic.signalColor, cameraMode !== 2, quality === 'eco' ? 100 : 155);
    renderer.render({ ...view, scale, quality, chunks: cityChunks, landscape, ...scene, focus: [visible.x, 0, visible.z] });
  }

  function updateHud() {
    $('speed').textContent = Math.round(Math.abs(car.speed) * 3.6);
    $('gear').textContent = car.gear;
    $('rpm').textContent = rpmFormat.format(car.rpm);
    $('rpmb').style.width = `${Math.min(100, car.rpm / 64)}%`;
    $('dist').textContent = distanceFormat.format(car.km) + ' km';
    $('place').textContent = districtAt(car.x, car.z) + ' · ' + surfaces[car.surface];
    drawMap(car, traffic.actors);
  }

  function update(dt, time) {
    for (const field of visualFields) previous[field] = car[field];
    previous.heading = car.heading;
    traffic.step(dt, car, vehicleOverlapsTraffic, roadHalfWidth);
    stepVehicle(car, input, dt, world);
    if (car.collisionImpact > 1.6 && time - collisionAt > 540) {
      notify('Kollision');
      if (audioEnabled) audio.impact(car.collisionImpact);
      collisionAt = time;
    }
  }

  function frame(time) {
    raf = 0;
    if (!started || paused || failed || document.hidden) return;
    const dt = Math.min(0.06, Math.max(0.001, (time - prevTime) / 1000));
    prevTime = time;
    const result = clock.tick(time, step => update(step, time));
    draw(dt, result.interpolation);
    if (time - lastHud >= 90) {
      updateHud();
      if (audioEnabled) audio.update(car, Number(input.throttle), true);
      lastHud = time;
    }
    if (adaptive.sample(time)) $('fps').textContent = adaptive.fps + ' FPS';
    raf = requestAnimationFrame(frame);
  }

  function stopFrame() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    clock.reset();
    audio.update(car, 0, false);
    clearInput();
  }

  function startFrame() {
    if (raf || !started || paused || failed || document.hidden) return;
    prevTime = performance.now();
    clock.reset(prevTime);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (started || failed) return;
    started = true;
    $('intro').classList.add('hidden');
    if (buttons.start === document.activeElement) buttons.start.blur();
    setAudio(true);
    startFrame();
  }

  function setAudio(enabled) {
    try {
      audioEnabled = audio.setEnabled(enabled);
    } catch {
      audioEnabled = false;
    }
    buttons.audio.setAttribute('aria-pressed', String(audioEnabled));
    buttons.audio.title = audioEnabled ? 'Ton ausschalten' : 'Ton einschalten';
    buttons.audio.querySelector('span').textContent = audioEnabled ? 'Ton an' : 'Ton aus';
  }

  function setPaused(value) {
    if (!started || failed || value === paused) return;
    paused = value;
    $('pauseModal').classList.toggle('hidden', !paused);
    if (paused) {
      stopFrame();
      buttons.resume.focus({ preventScroll: true });
    } else {
      buttons.resume.blur();
      startFrame();
    }
  }

  function reset() {
    Object.assign(car, createVehicleState(), startPosition);
    Object.assign(previous, car);
    collisionAt = -Infinity;
    camera.reset();
    clearInput();
    updateHud();
    draw(0.016);
    notify('Fahrzeug am Start');
  }

  function switchCamera() {
    if (!started || paused || failed) return;
    cameraMode = (cameraMode + 1) % cameraNames.length;
    camera.reset();
    buttons.camera.querySelector('span').textContent = cameraNames[cameraMode];
    notify(cameraNames[cameraMode]);
  }

  function switchQuality() {
    if (!started || paused || failed) return;
    qualityIndex = (qualityIndex + 1) % qualityModes.length;
    adaptive.reset();
    buttons.quality.querySelector('span').textContent = qualityNames[qualityIndex];
    notify('Grafik · ' + qualityNames[qualityIndex]);
  }

  buttons.start.addEventListener('click', start);
  buttons.camera.addEventListener('click', switchCamera);
  buttons.quality.addEventListener('click', switchQuality);
  buttons.audio.addEventListener('click', () => setAudio(!audioEnabled));
  buttons.pause.addEventListener('click', () => setPaused(true));
  buttons.resume.addEventListener('click', () => setPaused(false));
  buttons.reset.addEventListener('click', () => { reset(); setPaused(false); });
  window.addEventListener('keydown', event => {
    if (!started || failed || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (!paused && Object.hasOwn(keyActions, key)) {
      event.preventDefault();
      keys.add(key);
      updateInput();
    }
    if (event.repeat) return;
    if (key === 'v') switchCamera();
    if (key === 'r' && !paused) reset();
    if (key === 'p' || key === 'escape') setPaused(!paused);
  });
  window.addEventListener('keyup', event => {
    if (keys.delete(event.key.toLowerCase())) updateInput();
  });
  window.addEventListener('blur', clearInput);
  window.addEventListener('resize', () => {
    if ((!started || paused) && !failed) draw(0.016);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopFrame();
    else startFrame();
  });

  for (const button of controls) {
    button.addEventListener('pointerdown', event => {
      if (!started || paused || failed || event.button > 0) return;
      event.preventDefault();
      pointers.set(event.pointerId, button);
      button.setPointerCapture(event.pointerId);
      updateInput();
    });
    button.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId) || !button.closest('.steering')) return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.steering button');
      if (target) {
        pointers.set(event.pointerId, target);
        updateInput();
      }
    });
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, event => {
        if (pointers.delete(event.pointerId)) updateInput();
      });
    }
    button.addEventListener('contextmenu', event => event.preventDefault());
  }
  canvas.addEventListener('webglcontextlost', () => {
    failed = true;
    stopFrame();
    fail(new Error('Die Grafikverbindung wurde unterbrochen. Lade die Seite neu.'));
  });

  updateHud();
  draw(0.016);
  buttons.start.disabled = false;
  buttons.start.textContent = 'Motor starten';
}

try {
  boot();
} catch (error) {
  fail(error);
  console.error(error);
}
