import assert from 'node:assert/strict';
import test from 'node:test';
import { applyImpact, availablePower, impactArea } from '../src/simulation/vehicle-damage.js';
import { createVehicleState, stepVehicle } from '../src/simulation/vehicle.js';
import { FIXED_STEP_SECONDS as dt } from '../src/simulation/fixed-step.js';

test('impacts select front, rear and sides in vehicle coordinates', () => {
  assert.equal(impactArea(0, -1, 0), 0);
  assert.equal(impactArea(0, 1, 0), 1);
  assert.equal(impactArea(1, 0, 0), 2);
  assert.equal(impactArea(-1, 0, 0), 3);
  assert.equal(impactArea(-1, 0, Math.PI / 2), 0);
});

test('parking touches stay minor and repeated impacts have bounded cumulative damage', () => {
  const car = createVehicleState();
  applyImpact(car, 0.4, 0, 0, -1, 0, 0);
  assert.deepEqual(car.damage, [0, 0, 0, 0]);
  assert.equal(car.impact, null);
  for (let i = 0; i < 17; i++) applyImpact(car, 13, 0, 0, -1, 0, 0);
  assert.ok(car.damage[0] > 0.95 && car.damage[0] <= 1);
  assert.ok(availablePower(car.damage) < 0.65);
  assert.deepEqual(createVehicleState().damage, [0, 0, 0, 0]);
});

test('an actual wall hit deforms the front, reduces traction power and stays outside the wall', () => {
  const car = createVehicleState();
  car.vz = 14;
  const wall = { obstacles: [{ x0: -5, x1: 5, z0: 2.5, z1: 2.65 }] };
  stepVehicle(car, {}, dt, wall);
  assert.ok(car.impact?.closingSpeed > 12);
  assert.equal(car.impact?.area, 0);
  assert.ok(car.damage[0] > 0.6);
  assert.ok(car.z + 2.4 <= 2.50001);
  assert.ok(car.speed < 0);
  const intact = createVehicleState();
  const damaged = { ...createVehicleState(), damage: car.damage.slice() };
  for (let i = 0; i < 360; i++) {
    stepVehicle(intact, { throttle: 1 }, dt);
    stepVehicle(damaged, { throttle: 1 }, dt);
  }
  assert.ok(damaged.speed < intact.speed * 0.91);
});
