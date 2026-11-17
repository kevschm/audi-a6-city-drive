import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixedStepClock, FIXED_STEP_SECONDS } from '../src/simulation/fixed-step.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('fixed steps always receive the same delta at irregular frame intervals', () => {
  const clock = createFixedStepClock();
  const deltas = [];
  clock.tick(0, (dt) => deltas.push(dt));
  clock.tick(8, (dt) => deltas.push(dt));
  clock.tick(20, (dt) => deltas.push(dt));
  clock.tick(50, (dt) => deltas.push(dt));
  clock.tick(100, (dt) => deltas.push(dt));
  assert.equal(deltas.length, 6);
  deltas.forEach((dt) => close(dt, FIXED_STEP_SECONDS));
});

test('high refresh screens may render frames without a physics update', () => {
  const clock = createFixedStepClock();
  let steps = 0;
  for (let ms = 0; ms <= 50; ms += 5) clock.tick(ms, () => steps++);
  assert.equal(steps, 3);
});

test('clock reset prevents simulation jumps after pause or tab sleep', () => {
  const clock = createFixedStepClock();
  let steps = 0;
  clock.tick(0, () => steps++);
  clock.tick(100, () => steps++);
  assert.equal(steps, 6);
  clock.reset(10_000);
  const state = clock.tick(10_008, () => steps++);
  assert.equal(state.updates, 0);
  assert.equal(steps, 6);
});

test('backlog and negative elapsed time are bounded', () => {
  const clock = createFixedStepClock({ maxFrameSeconds: 1, maxUpdatesPerFrame: 4 });
  let steps = 0;
  clock.tick(100, () => steps++);
  clock.tick(11_000, () => steps++);
  assert.equal(steps, 4);
  clock.tick(10_000, () => steps++);
  assert.equal(steps, 4);
});

test('rejects invalid clock parameters', () => {
  assert.throws(() => createFixedStepClock({ stepSeconds: 0 }), RangeError);
  assert.throws(() => createFixedStepClock({ maxUpdatesPerFrame: -1 }), RangeError);
});
