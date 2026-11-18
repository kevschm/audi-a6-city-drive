import test from 'node:test';
import assert from 'node:assert/strict';
import { meshVertex, meshFragment } from '../src/render/shaders.js';

test('view-space camera uniform exists only in the vertex shader', () => {
  // Some mobile WebGL drivers fail linking when uEye is declared as a
  // uniform in both shader stages with different inferred precision.
  assert.match(meshVertex, /uniform\s+vec3\s+uEye\s*;/);
  assert.doesNotMatch(meshFragment, /uniform\s+\\w+\s+uEye\s*;/);
  assert.match(meshVertex, /vEyeDelta\s*=\s*uEye\s*-\s*world\.xyz\s*;/);
  assert.match(meshFragment, /vec3\s+delta\s*=\s*vEyeDelta\s*;/);
});

test('camera-to-fragment vector is carried by a matching varying', () => {
  for (const shader of [meshVertex, meshFragment]) {
    assert.match(shader, /varying\s+vec3\s+vEyeDelta\s*;/);
  }
  assert.ok(meshVertex.includes('gl_Position = uVP * world;'));
  assert.ok(meshFragment.includes('vec3 toEye = delta / max(d, 0.01);'));
});
