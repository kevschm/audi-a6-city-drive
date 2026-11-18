import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrbitPose, installOrbitGestures } from '../src/ui/orbit.js';
import { createCamera, ORBIT_MODE } from '../src/ui/camera.js';

test('orbit can rotate freely, clamps extremes and avoids a wall', () => {
  const orbit = createOrbitPose();
  orbit.drag(0.4 / 0.009, -10000);
  orbit.zoom(100);
  assert.equal(orbit.distance, 21);
  assert.equal(orbit.elevation, 0.045);
  const camera = createCamera();
  const car = { x: 0, z: 0, heave: 0, heading: 0 };
  const wall = { x0: -5, x1: 5, z0: -6, z1: -4 };
  const frame = camera.update(car, ORBIT_MODE, 1 / 60, [wall], orbit);
  assert.ok(frame.eye[2] > wall.z1);
  orbit.zoom(0.000001);
  assert.equal(orbit.distance, 3.65);
});

test('canvas drag and pinch use independent pointers and cancel cleanly', () => {
  const handlers = new Map();
  const canvas = { addEventListener: (name, cb) => handlers.set(name, cb), setPointerCapture() {} };
  const orbit = createOrbitPose();
  let activations = 0;
  installOrbitGestures(canvas, orbit, () => { activations++; return true; });
  const pointer = (type, id, x, y) => handlers.get(type)({ pointerId: id, clientX: x, clientY: y, pointerType: 'touch' });
  pointer('pointerdown', 4, 20, 25);
  pointer('pointermove', 4, 31, 25);
  const turn = orbit.azimuth;
  assert.notEqual(turn, 0.4);
  pointer('pointerdown', 5, 60, 25);
  pointer('pointermove', 5, 94, 25);
  assert.ok(orbit.distance < 6.8);
  pointer('pointercancel', 4, 0, 0);
  pointer('pointercancel', 5, 0, 0);
  pointer('pointermove', 5, 99, 25);
  assert.equal(activations, 2);
});
