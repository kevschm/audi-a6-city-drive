import assert from 'node:assert/strict';
import test from 'node:test';
import { crossedGate, createTimeTrial, formatTrialTime, stationRoute } from '../src/simulation/time-trial.js';
import { roadSurfaceAt } from '../src/world/city.js';

const route = [{ x: 0, z: 0, heading: 0 }, { x: 0, z: 20, heading: 0 }, { x: 10, z: 25, heading: Math.PI / 2 }];
const sample = (x, z, heading = 0, speed = 10) => ({ x, z, heading, speed });

test('checkpoint requires crossing its width in the intended direction while driving forward', () => {
  assert.equal(crossedGate(route[0], sample(0, -1), sample(0, 1)), 0.5);
  assert.equal(crossedGate(route[0], sample(4, -1), sample(4, 1)), null);
  assert.equal(crossedGate(route[0], sample(0, 1), sample(0, -1, Math.PI)), null);
  assert.equal(crossedGate(route[0], sample(0, -1), sample(0, 1, Math.PI, -10)), null);
  assert.equal(crossedGate(route[0], sample(3, -4), sample(-1, 4)), 0.5);
});

test('time trial starts on the gate, counts only supplied sim time and records a finish', () => {
  const trial = createTimeTrial(route, 120);
  trial.arm();
  assert.equal(trial.step(3, sample(0, -10), sample(0, -1)), null);
  assert.equal(trial.elapsed, 0);
  assert.equal(trial.step(0.2, sample(0, -1), sample(0, 1)), 'start');
  assert.equal(trial.step(1, sample(9, 25), sample(11, 25, Math.PI / 2)), null);
  assert.equal(trial.step(2, sample(0, 19), sample(0, 21)), 'checkpoint');
  assert.equal(trial.step(0.2, sample(9, 25), sample(11, 25, Math.PI / 2)), 'finish');
  assert.equal(trial.phase, 'finished');
  assert.equal(trial.best, 3.2);
  assert.equal(trial.record, true);
  trial.cancel();
  assert.equal(trial.best, 3.2);
  assert.equal(trial.phase, 'free');
});

test('production checkpoint centers are on asphalt, and timing rounds cleanly across a minute', () => {
  for (const gate of stationRoute) assert.equal(roadSurfaceAt(gate.x, gate.z), 'asphalt');
  assert.equal(formatTrialTime(59.999), '1:00,00');
});
