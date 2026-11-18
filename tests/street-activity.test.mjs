import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCity, groundHeightAt, roadSurfaceAt } from '../src/world/city.js';
import { makeWalkers } from '../src/world/walkers.js';
import { createImpactEffects } from '../src/render/impact-effects.js';

class MeshSink { box() {} cylY() {} sphere() {} quad() {} tri() {} }

test('people walk on unoccupied sidewalks and park paths', () => {
  const { obstacles } = buildCity({ Mesh: MeshSink });
  const walkers = makeWalkers({ obstacles, heightAt: groundHeightAt, surfaceAt: roadSurfaceAt });
  assert.ok(walkers.actors.length >= 10);
  const initial = walkers.actors.map(a => [a.x, a.z]);
  for (let i = 0; i < 400; i++) {
    walkers.step(0.25, { x: 999, z: 999, speed: 0 });
    for (const { x, z, y } of walkers.actors) {
      assert.equal(roadSurfaceAt(x, z), 'paving');
      assert.equal(y, groundHeightAt(x, z));
      assert.ok(!obstacles.some(o => x >= o.x0 && x <= o.x1 && z >= o.z0 && z <= o.z1));
    }
  }
  assert.notDeepEqual(walkers.actors.map(a => [a.x, a.z]), initial);
});

test('spray and engine vapor have a finite particle budget and reset clears them', () => {
  const effects = createImpactEffects(() => 0.5);
  const car = { x: 0, z: 0, heading: 0, heave: 0, speed: 23, vx: 0, vz: 23, skid: 0.8,
    throttle: 1, surface: 'asphalt', damage: [0.8, 0, 0, 0] };
  for (let i = 0; i < 360; i++) {
    effects.drive(car, 1 / 60, 1, false);
    effects.step(1 / 60);
  }
  const vertices = effects.view();
  const appearances = Array.from(vertices).filter((_, index) => index % 6 === 5);
  assert.ok(appearances.some(value => Math.abs(value - 0.58) < 0.001));
  assert.ok(appearances.some(value => Math.abs(value - 0.35) < 0.001));
  assert.ok(appearances.length <= 72);
  effects.clear();
  assert.equal(effects.view().length, 0);
});
