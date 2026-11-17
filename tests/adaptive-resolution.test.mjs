import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdaptiveResolution } from '../src/performance/adaptive-resolution.js';

const runForSeconds = (controller, fps, seconds, startingAt = 0) => {
  for (let i = 0; i <= fps * seconds; i++) {
    controller.sample(startingAt + i * 1000 / fps);
  }
};

test('scales down after sustained slow frames', () => {
  const controller = createAdaptiveResolution({ targetFps: 40 });
  runForSeconds(controller, 20, 5);
  assert.ok(controller.scale < 1.65);
  assert.ok(controller.scale >= 0.8);
  assert.equal(controller.fps, 20);
});

test('does not downscale during brief frame-rate instability', () => {
  const controller = createAdaptiveResolution({ targetFps: 40, lowSamples: 2 });
  runForSeconds(controller, 20, 1);
  assert.equal(controller.scale, 1.65);
});

test('raises resolution again when performance recovers', () => {
  const controller = createAdaptiveResolution({ targetFps: 40 });
  runForSeconds(controller, 20, 12);
  const reduced = controller.scale;
  assert.ok(reduced < 1.65);
  runForSeconds(controller, 60, 9, 13_000);
  assert.ok(controller.scale > reduced);
  assert.ok(controller.scale <= 1.65);
});

test('never drops below configured minimum', () => {
  const controller = createAdaptiveResolution({ minScale: 0.9, maxScale: 1.4 });
  runForSeconds(controller, 15, 55);
  assert.equal(controller.scale, 0.9);
});

test('handles regression in timestamp and restores initial state', () => {
  const controller = createAdaptiveResolution();
  controller.sample(5_000);
  controller.sample(4_000);
  assert.equal(controller.fps, 0);
  controller.reset();
  assert.equal(controller.scale, 1.65);
  assert.equal(controller.fps, 0);
});

test('rejects invalid configuration', () => {
  assert.throws(() => createAdaptiveResolution({ maxScale: 0.4, minScale: 0.9 }), RangeError);
  assert.throws(() => createAdaptiveResolution({ sampleMs: 0 }), RangeError);
});
