import { createAdaptiveResolution } from './performance/adaptive-resolution.js';
import { createFixedStepClock } from './simulation/fixed-step.js';
import { createVehicleState, stepVehicle, vehicleOverlapsTraffic } from './simulation/vehicle.js';
import { damageAreas, wheelNames } from './simulation/vehicle-damage.js';
import { createTimeTrial, formatTrialTime } from './simulation/time-trial.js';
import { buildCity, districtAt, groundHeightAt, halfWorld, roads, roadHalfWidth, roadSurfaceAt, startPosition } from './world/city.js';
import { makeTraffic } from './world/traffic.js';
import { makeWalkers } from './world/walkers.js';
import { clamp, lerp, mixAngle } from './render/math.js';
import { Mesh } from './render/mesh.js';
import { createRenderer, GRAPHICS } from './render/renderer.js?drive-080';
import { createImpactEffects } from './render/impact-effects.js';
import { buildVehicles } from './render/vehicles.js';
import { createActorModels } from './render/city-actors.js';
import { createMinimap } from './ui/minimap.js';
import { cameraNames, createCamera, COCKPIT_MODE, ORBIT_MODE } from './ui/camera.js';
import { createOrbitPose, installOrbitGestures } from './ui/orbit.js';
import { createDriveAudio } from './ui/audio.js';

const $ = id => document.getElementById(id);
const buttons = {
  start: $('startBtn'), camera: $('camBtn'), quality: $('qualityBtn'), audio: $('audioBtn'),
  pause: $('pauseBtn'), resume: $('resumeBtn'), reset: $('resetBtn'),
  trial: $('trialBtn'), headlights: $('lightBtn'), dusk: $('duskBtn'),
  leftSignal: $('leftSignal'), rightSignal: $('rightSignal'),
  quickReset: $('driveReset'),
  weather: $('weatherBtn'),
};
const keyActions = {
  w: 'throttle', arrowup: 'throttle', s: 'brake', arrowdown: 'brake',
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', ' ': 'handbrake',
};
const surfaces = { asphalt: 'Asphalt', paving: 'Pflaster', grass: 'Grünfläche' };
const qualityModes = ['balanced', 'quality', 'performance'];
const visualFields = ['x', 'z', 'heave', 'pitch', 'roll', 'steer', 'spin', 'speed', 'yaw'];
const wheelFields = ['wheelTravel', 'wheelSteer', 'wheelSpin'];
const rpmFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const distanceFormat = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const storage = {
  read(name) {
    try { return localStorage.getItem('a6-city.' + name); }
    catch { return null; }
  },
  write(name, value) {
    try { localStorage.setItem('a6-city.' + name, value); }
    catch { /* Driving remains available when browser storage is disabled. */ }
  },
};

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
  const { cityChunks, landscape, obstacles, signals, streetLights } = city;
  renderer.upload(landscape);
  for (const chunk of cityChunks) renderer.upload(chunk.mesh);
  const vehicles = buildVehicles(renderer);
  const actorModels = createActorModels(renderer);
  const people = makeWalkers({ obstacles, heightAt: groundHeightAt, surfaceAt: roadSurfaceAt });
  const traffic = makeTraffic(roads, signals);
  const world = { roads, obstacles, roadSurfaceAt, groundHeightAt, traffic: traffic.actors, bounds: halfWorld,
    wetness: storage.read('wet-road') === '1' ? 1 : 0 };
  const drawMap = createMinimap($('minimap'), city, roads, roadHalfWidth, halfWorld);
  const camera = createCamera(), clock = createFixedStepClock(), audio = createDriveAudio();
  const orbit = createOrbitPose(), effects = createImpactEffects();
  const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  const adaptive = createAdaptiveResolution({
    minScale: touch ? 0.56 : 0.68, maxScale: touch ? 1.28 : 1.52, targetFps: touch ? 36 : 55,
    highFpsFactor: touch ? 1.20 : 1.06,
  });
  const car = { ...createVehicleState(), ...startPosition };
  const previous = { ...car }, visible = { ...car };
  for (const field of wheelFields) {
    previous[field] = car[field].slice();
    visible[field] = car[field].slice();
  }
  const trial = createTimeTrial(undefined, Number(storage.read('station-best')));
  const keys = new Set();
  const pointers = new Map();
  const input = { left: false, right: false, throttle: false, brake: false, handbrake: false };
  const controls = [...document.querySelectorAll('[data-key]')];
  let started = false, paused = false, failed = false, audioEnabled = false;
  const qualityPreference = qualityModes.indexOf(storage.read('quality'));
  let cameraMode = 0, qualityIndex = Math.max(0, qualityPreference), prevTime = 0, lastHud = -Infinity, collisionAt = -Infinity;
  let raf = 0, toastTimer;
  let steeringGain = clamp(Number(storage.read('steering')) || 1, 0.65, 1.15);
  let dusk = storage.read('dusk') === '1' ? 1 : 0, duskTarget = dusk;
  let headlights = duskTarget > 0, signal = 0, signalTime = 0;
  let baseInput = { ...input };
  let gamepadsAvailable = typeof navigator.getGamepads === 'function';
  let impactShake = 0;
  let wet = world.wetness;
  const clearOrbit = installOrbitGestures(canvas, orbit, () => {
    if (!started || paused || failed) return false;
    if (cameraMode !== ORBIT_MODE) selectCamera(ORBIT_MODE, false);
    return true;
  });

  function notify(text) {
    $('toast').textContent = text;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 1450);
  }

  function updateInput() {
    baseInput = { left: 0, right: 0, throttle: 0, brake: 0, handbrake: 0 };
    for (const key of keys) baseInput[keyActions[key]] = 1;
    for (const button of pointers.values()) baseInput[button.dataset.key] = 1;
    for (const button of controls) button.classList.toggle('active', Boolean(baseInput[button.dataset.key]));
  }

  function readInput() {
    Object.assign(input, baseInput);
    let pad;
    if (gamepadsAvailable && document.hasFocus()) {
      try { pad = Array.from(navigator.getGamepads()).find(device => device?.connected && device.mapping === 'standard'); }
      catch { gamepadsAvailable = false; }
    }
    if (pad) {
      const axis = pad.axes[0] || 0;
      if (Math.abs(axis) > 0.14) {
        const magnitude = (Math.abs(axis) - 0.14) / 0.86;
        input[axis < 0 ? 'left' : 'right'] = Math.max(input[axis < 0 ? 'left' : 'right'], magnitude);
      }
      input.throttle = Math.max(input.throttle, pad.buttons[7]?.value || 0);
      input.brake = Math.max(input.brake, pad.buttons[6]?.value || 0);
      input.handbrake = Math.max(input.handbrake, pad.buttons[0]?.value || 0);
    }
    input.left = Math.min(1, input.left * steeringGain);
    input.right = Math.min(1, input.right * steeringGain);
  }

  function rememberPose() {
    for (const field of visualFields) previous[field] = car[field];
    previous.heading = car.heading;
    for (const field of wheelFields) for (let i = 0; i < 4; i++) previous[field][i] = car[field][i];
  }

  function clearInput() {
    keys.clear();
    pointers.clear();
    clearOrbit();
    updateInput();
  }

  function draw(dt, interpolation = 1) {
    for (const field of ['damage', 'dents', 'wheelDamage', 'axleDamage']) visible[field] = car[field];
    visible.rpm = car.rpm;
    for (const field of ['brakeLights', 'reverseLights']) visible[field] = car[field];
    for (const field of visualFields) visible[field] = lerp(previous[field], car[field], interpolation);
    visible.heading = mixAngle(previous.heading, car.heading, interpolation);
    for (const field of wheelFields) for (let i = 0; i < 4; i++) visible[field][i] = lerp(previous[field][i], car[field][i], interpolation);
    dusk = lerp(dusk, duskTarget, 1 - Math.exp(-dt * 2.8));
    if (Math.abs(dusk - duskTarget) < 0.004) dusk = duskTarget;
    wet = lerp(wet, world.wetness, 1 - Math.exp(-dt * 3.2));
    if (Math.abs(wet - world.wetness) < 0.004) wet = world.wetness;
    const view = camera.update(visible, cameraMode, dt, obstacles, orbit);
    if (motion && impactShake > 0.004) {
      view.eye[1] += Math.sin(signalTime * 37) * impactShake * 0.084;
      view.target[1] -= Math.sin(signalTime * 43) * impactShake * 0.089;
    }
    const device = window.devicePixelRatio || 1;
    const quality = qualityModes[qualityIndex];
    const scale = Math.min(device, adaptive.scale);
    const blink = signalTime % 0.72 < 0.39 ? signal : 0;
    const street = dusk > 0.04 ? streetLights.slice().sort((a, b) =>
      (a[0] - visible.x) ** 2 + (a[2] - visible.z) ** 2 - ((b[0] - visible.x) ** 2 + (b[2] - visible.z) ** 2)).slice(0, 4) : [];
    const scene = vehicles.scene(visible, traffic.actors, signals, traffic.signalColor, {
      cockpit: cameraMode === COCKPIT_MODE, far: GRAPHICS[quality].trafficDistance, headlights, blink, dusk, gate: trial.gate, street,
    });
    scene.objects.push(...actorModels(people.actors, visible, wet));
    renderer.render({ ...view, scale, quality, chunks: cityChunks, landscape, ...scene,
      dusk, headlights, heading: visible.heading, focus: [visible.x, visible.heave, visible.z],
      beamStrength: 1 - car.damage[0] * 0.86, street, effects: effects.view(), wet });
  }

  function updateHud() {
    $('speed').textContent = Math.round(Math.abs(car.speed) * 3.6);
    $('gear').textContent = car.gear;
    $('rpm').textContent = rpmFormat.format(car.rpm);
    $('rpmb').style.width = `${Math.min(100, car.rpm / 64)}%`;
    $('dist').textContent = distanceFormat.format(car.km) + ' km';
    const damage = Math.max(...car.damage);
    $('condition').textContent = damage < 0.035 ? 'Intakt' : damage < 0.23 ? 'Spuren' : damage < 0.65 ? 'Beschädigt' : 'Stark beschädigt';
    for (const [index, panel] of [...$('conditionPanels').children].entries()) {
      panel.dataset.level = car.damage[index] < 0.035 ? 'intact' : car.damage[index] < 0.32 ? 'scuffed' : 'damaged';
    }
    const wheel = Math.max(...car.wheelDamage);
    const axle = Math.max(...car.axleDamage);
    const runningGear = $('runningGear');
    runningGear.hidden = wheel < 0.10 && axle < 0.11;
    if (!runningGear.hidden) {
      const corner = car.wheelDamage.indexOf(wheel);
      const label = wheel >= axle ? wheelNames[corner] : car.axleDamage[0] >= car.axleDamage[1] ? 'Vorderachse' : 'Hinterachse';
      runningGear.textContent = label;
    }
    $('place').textContent = districtAt(car.x, car.z) + ' · ' + surfaces[car.surface] + (world.wetness ? ' nass' : '');
    $('leftSignal').classList.toggle('lit', signal < 0 && signalTime % 0.72 < 0.39);
    $('rightSignal').classList.toggle('lit', signal > 0 && signalTime % 0.72 < 0.39);
    drawMap(car, traffic.actors, trial.gate);
    const phase = trial.phase;
    $('routePanel').hidden = phase === 'free';
    if (phase !== 'free') {
      $('trialPhase').textContent = phase === 'ready' ? 'Zum Starttor' : phase === 'finished'
        ? trial.record ? 'Neue Bestzeit' : 'Runde beendet' : 'Tor ' + trial.index + ' / ' + trial.total;
      $('trialTime').textContent = formatTrialTime(trial.elapsed);
      $('trialBest').textContent = trial.best === null ? '' : 'Bestzeit ' + formatTrialTime(trial.best);
    }
  }

  function update(dt, time) {
    rememberPose();
    traffic.step(dt, car, vehicleOverlapsTraffic, roadHalfWidth);
    stepVehicle(car, input, dt, world);
    people.step(dt, car);
    effects.step(dt);
    effects.drive(car, dt, world.wetness, qualityModes[qualityIndex] === 'performance');
    impactShake *= Math.exp(-dt * 8.2);
    signalTime += dt;
    const result = trial.step(dt, previous, car);
    if (result && audioEnabled) audio.chime(result === 'finish');
    if (result === 'finish') {
      if (trial.record) storage.write('station-best', trial.best);
      updateTrialButton();
    }
    if (car.impact && time - collisionAt > 260) {
      effects.emit(car.impact);
      impactShake = Math.min(2.4, car.impact.closingSpeed / 8);
      if (car.impact.change > 0.09) {
        const region = car.impact.wheelChange >= 0.10 ? wheelNames[car.impact.wheel] : damageAreas[car.impact.area];
        notify('Aufprall · ' + region);
      }
      if (audioEnabled) audio.impact(car.impact);
      collisionAt = time;
    }
  }

  function frame(time) {
    raf = 0;
    if (!started || paused || failed || document.hidden) return;
    const dt = Math.min(0.06, Math.max(0.001, (time - prevTime) / 1000));
    prevTime = time;
    readInput();
    const result = clock.tick(time, step => update(step, time));
    draw(dt, result.interpolation);
    if (time - lastHud >= 90) {
      updateHud();
      if (audioEnabled) audio.update(car, input.throttle, true, cameraMode === 2 || cameraMode === COCKPIT_MODE, world.wetness);
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

  function reset(announce = true) {
    Object.assign(car, createVehicleState(), startPosition);
    rememberPose();
    collisionAt = -Infinity;
    impactShake = 0;
    effects.clear();
    camera.reset();
    clock.reset();
    clearInput();
    updateHud();
    draw(0.016);
    if (announce) notify('Fahrzeug am Start');
  }

  function resetDrive() {
    if (trial.phase === 'free') reset();
    else armTrial();
  }

  function armTrial() {
    trial.arm();
    traffic.restart();
    reset(false);
    updateTrialButton();
  }

  function switchTrial() {
    if (!started || paused || failed) return;
    if (trial.phase === 'free' || trial.phase === 'finished') {
      armTrial();
      notify('Bahnhofsrunde · Zum Starttor fahren');
    } else {
      trial.cancel();
      notify('Freie Fahrt');
    }
    updateTrialButton();
    updateHud();
  }

  function updateTrialButton() {
    const active = trial.phase === 'ready' || trial.phase === 'running';
    buttons.trial.setAttribute('aria-pressed', String(active));
    buttons.trial.querySelector('span').textContent = active ? 'Abbrechen' : trial.phase === 'finished' ? 'Wiederholen' : 'Zeitfahrt';
  }

  function switchCamera() {
    if (!started || paused || failed) return;
    selectCamera((cameraMode + 1) % cameraNames.length);
  }

  function selectCamera(mode, announce = true) {
    cameraMode = mode;
    $('game').classList.toggle('cockpit-view', mode === COCKPIT_MODE);
    camera.reset();
    buttons.camera.querySelector('span').textContent = cameraNames[cameraMode];
    if (announce) notify(cameraMode === ORBIT_MODE ? 'Ziehen zum Drehen · Pinch oder Mausrad zum Zoomen' : cameraNames[cameraMode]);
  }

  function switchQuality() {
    if (!started || paused || failed) return;
    qualityIndex = (qualityIndex + 1) % qualityModes.length;
    adaptive.reset();
    const quality = qualityModes[qualityIndex];
    storage.write('quality', quality);
    buttons.quality.querySelector('span').textContent = GRAPHICS[quality].label;
    notify('Grafik · ' + GRAPHICS[quality].label);
  }

  function setHeadlights(value) {
    headlights = value;
    buttons.headlights.setAttribute('aria-pressed', String(value));
    buttons.headlights.querySelector('span').textContent = value ? 'Licht an' : 'Licht aus';
  }

  function setSignal(direction) {
    if (!started || paused || failed) return;
    signal = signal === direction ? 0 : direction;
    signalTime = 0;
    buttons.leftSignal.setAttribute('aria-pressed', String(signal < 0));
    buttons.rightSignal.setAttribute('aria-pressed', String(signal > 0));
    updateHud();
  }

  function switchDusk() {
    duskTarget = 1 - duskTarget;
    storage.write('dusk', duskTarget);
    buttons.dusk.textContent = duskTarget ? 'Abend' : 'Tag';
    setHeadlights(Boolean(duskTarget));
    if (paused) {
      dusk = duskTarget;
      draw(0.016);
    }
  }

  function switchWeather() {
    world.wetness = 1 - world.wetness;
    storage.write('wet-road', world.wetness);
    buttons.weather.textContent = world.wetness ? 'Nass' : 'Trocken';
    if (paused) {
      wet = world.wetness;
      updateHud();
      draw(0.016);
    }
  }

  buttons.start.addEventListener('click', start);
  buttons.camera.addEventListener('click', switchCamera);
  buttons.quality.addEventListener('click', switchQuality);
  buttons.audio.addEventListener('click', () => setAudio(!audioEnabled));
  buttons.pause.addEventListener('click', () => setPaused(true));
  buttons.resume.addEventListener('click', () => setPaused(false));
  buttons.reset.addEventListener('click', () => { resetDrive(); setPaused(false); });
  buttons.quickReset.addEventListener('click', () => { if (started && !paused && !failed) resetDrive(); });
  buttons.headlights.addEventListener('click', () => setHeadlights(!headlights));
  buttons.trial.addEventListener('click', switchTrial);
  buttons.dusk.addEventListener('click', switchDusk);
  buttons.weather.addEventListener('click', switchWeather);
  buttons.leftSignal.addEventListener('click', () => setSignal(-1));
  buttons.rightSignal.addEventListener('click', () => setSignal(1));
  $('steeringGain').value = steeringGain;
  $('steeringGain').addEventListener('input', event => {
    steeringGain = Number(event.target.value);
    storage.write('steering', steeringGain);
  });
  $('audioVolume').value = clamp(Number(storage.read('volume') ?? 0.75), 0, 1);
  audio.setVolume(Number($('audioVolume').value));
  $('audioVolume').addEventListener('input', event => {
    audio.setVolume(Number(event.target.value));
    storage.write('volume', event.target.value);
  });
  buttons.quality.querySelector('span').textContent = GRAPHICS[qualityModes[qualityIndex]].label;
  buttons.dusk.textContent = duskTarget ? 'Abend' : 'Tag';
  buttons.weather.textContent = world.wetness ? 'Nass' : 'Trocken';
  setHeadlights(headlights);
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
    if (key === 'r' && !paused) resetDrive();
    if (key === 't') switchTrial();
    if (key === 'l' && !paused) setHeadlights(!headlights);
    if (key === 'q') setSignal(-1);
    if (key === 'e') setSignal(1);
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
