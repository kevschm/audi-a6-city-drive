import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXED_STEP_SECONDS as dt } from '../src/simulation/fixed-step.js';
import { createTimeTrial } from '../src/simulation/time-trial.js';
import { createVehicleState, stepVehicle, vehicleOverlapsTraffic } from '../src/simulation/vehicle.js';
import { WHEELBASE } from '../src/simulation/vehicle-suspension.js';
import { buildCity, groundHeightAt, halfWorld, roads, roadHalfWidth, roadSurfaceAt, startPosition } from '../src/world/city.js';
import { makeTraffic } from '../src/world/traffic.js';

// Build the production scene and footprints without a WebGL context.
class GeometrySink {
  box() {} cylY() {} quad() {} sphere() {} tri() {}
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

function driveLine() {
  const path = [];
  function point(x, z, heading, turn = false) {
    const previous = path.at(-1);
    path.push({ x, z, heading, turn, distance: previous ? previous.distance + Math.hypot(x - previous.x, z - previous.z) : 0 });
  }
  function straight(x, z, endX, endZ, heading) {
    const samples = Math.ceil(Math.hypot(endX - x, endZ - z) / 0.22);
    for (let i = 0; i <= samples; i++) point(x + (endX - x) * i / samples, z + (endZ - z) * i / samples, heading);
  }
  const radius = 7.55;
  function rightTurn(x, z, heading) {
    for (let i = 0; i <= 50; i++) {
      const angle = heading + i * Math.PI / 100;
      point(x - radius * Math.cos(angle), z + radius * Math.sin(angle), angle, true);
    }
  }
  const nearLane = 3.2, farLane = 66.8;
  straight(nearLane, startPosition.z, nearLane, farLane - radius, 0);
  rightTurn(nearLane + radius, farLane - radius, 0);
  straight(nearLane + radius, farLane, farLane - radius, farLane, Math.PI / 2);
  rightTurn(farLane - radius, farLane - radius, Math.PI / 2);
  straight(farLane, farLane - radius, farLane, nearLane + radius, Math.PI);
  rightTurn(farLane - radius, nearLane + radius, Math.PI);
  straight(farLane - radius, nearLane, 1, nearLane, 3 * Math.PI / 2);
  return path;
}

function nearestPoint(path, position, first = 0, end = path.length) {
  let closest = first;
  for (let index = first + 1; index < end; index++) {
    if (distanceSquared(path[index], position) < distanceSquared(path[closest], position)) closest = index;
  }
  return closest;
}

test('the full station time trial is drivable with the actual physics, scenery and traffic', () => {
  const { obstacles, signals } = buildCity({ Mesh: GeometrySink });
  const traffic = makeTraffic(roads, signals);
  const world = { roads, obstacles, roadSurfaceAt, groundHeightAt, traffic: traffic.actors, bounds: halfWorld };
  const trial = createTimeTrial(), car = { ...createVehicleState(), ...startPosition };
  trial.arm();
  const path = driveLine();
  const setback = (crossRoad) => roadHalfWidth(crossRoad) + 5.2 + 2.4;
  const signalsAhead = [
    { axis: 0, ix: 0, iz: 0, x: 3.2, z: -setback(0) },
    { axis: 0, ix: 0, iz: 70, x: 3.2, z: 70 - setback(70) },
    { axis: 1, ix: 70, iz: 70, x: 70 - setback(70), z: 66.8 },
    { axis: 0, ix: 70, iz: 0, x: 66.8, z: setback(0) },
  ].map(signal => ({ ...signal, distance: path[nearestPoint(path, signal)].distance }));

  let closest = 0, nextSignal = 0;
  const events = [];
  for (let tick = 0; tick < 120 / dt && trial.phase !== 'finished'; tick++) {
    closest = nearestPoint(path, car, Math.max(0, closest - 8), Math.min(path.length, closest + 32));
    const traveled = path[closest].distance;
    const speed = car.speed;
    let ahead = closest;
    while (ahead < path.length - 1 && path[ahead].distance - traveled < Math.max(2.65, speed * 0.58)) ahead++;
    const dx = path[ahead].x - car.x, dz = path[ahead].z - car.z;
    const lateral = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    const angle = Math.atan2(2 * WHEELBASE * lateral, dx * dx + dz * dz);
    const steeringLimit = (0.53 + 0.009 * Math.abs(speed)) / (1 + (Math.abs(speed) / 10) ** 1.65);

    // Hold a road speed on the straights. Slow for the three turns and for
    // actual traffic and signals, using the same proportional pedals as UI input.
    let desired = 10.8;
    for (let index = closest; index < Math.min(path.length, closest + 92); index++) {
      if (path[index].turn) desired = Math.min(desired, Math.sqrt(5.1 ** 2 + 4 * (path[index].distance - traveled)));
    }
    while (nextSignal < signalsAhead.length && traveled - signalsAhead[nextSignal].distance > 1.2) nextSignal++;
    const signal = signalsAhead[nextSignal];
    if (signal) {
      const phase = traffic.signalColor(signal.axis, signal.ix, signal.iz);
      const distance = signal.distance - traveled;
      if (phase === 'red' || (phase === 'amber' && distance > speed * speed / 8)) {
        desired = Math.min(desired, Math.sqrt(Math.max(0, distance) * 3.8));
      }
    }
    for (let index = closest; index < Math.min(path.length, closest + 56); index += 4) {
      if (traffic.actors.some(actor => vehicleOverlapsTraffic(path[index], actor))) {
        desired = Math.min(desired, Math.sqrt(Math.max(0, path[index].distance - traveled - 0.65) * 6));
      }
    }
    const error = desired - speed;
    const previous = { x: car.x, z: car.z };
    traffic.step(dt, car, vehicleOverlapsTraffic, roadHalfWidth);
    stepVehicle(car, {
      steer: clamp(angle / steeringLimit, -1, 1),
      throttle: error > 0.06 ? clamp(error * 0.44, 0.04, 1) : 0,
      brake: error < -0.12 && speed > 0.15 ? clamp(-error * 0.43, 0.05, 1) : 0,
    }, dt, world);
    const event = trial.step(dt, previous, car);
    if (event) events.push(event);
    assert.equal(car.surface, 'asphalt', `left course at simulation tick ${tick}`);
    assert.equal(car.collisionImpact, 0, `collision on course at simulation tick ${tick}`);
  }
  assert.equal(trial.phase, 'finished');
  assert.deepEqual(events, ['start', ...Array(trial.total - 1).fill('checkpoint'), 'finish']);
  assert.equal(trial.best, trial.elapsed);
});
