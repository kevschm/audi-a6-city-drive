import assert from 'node:assert/strict';
import test from 'node:test';
import { applyImpact, availablePower, dentLimit, impactArea } from '../src/simulation/vehicle-damage.js';
import { moveVehicle } from '../src/simulation/vehicle-collision.js';
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

function collide(vx, vz, obstacle) {
  const car = { ...createVehicleState(), vx, vz };
  moveVehicle(car, dt, { obstacles: [obstacle] });
  return car;
}

test('an offset bumper hit damages the near wheel and rotates the car while a centered hit only loads the axle', () => {
  const offset = collide(0, 22, { x0: -0.91, x1: -0.62, z0: 2.50, z1: 2.70 });
  const center = collide(0, 22, { x0: -4, x1: 4, z0: 2.50, z1: 2.70 });
  assert.ok(Math.abs(offset.impact.localX + 0.62) < 0.005);
  assert.ok(Math.abs(offset.impact.z - 2.50) < 0.005);
  assert.equal(offset.impact.wheel, 0);
  assert.ok(offset.wheelDamage[0] > 0.10);
  assert.deepEqual(offset.wheelDamage.slice(1), [0, 0, 0]);
  assert.ok(offset.yaw < -0.35);
  assert.ok(Math.abs(center.yaw) < 1e-9);
  assert.deepEqual(center.wheelDamage, [0, 0, 0, 0]);
  assert.ok(center.axleDamage[0] > 0.22);
  assert.equal(center.axleDamage[1], 0);
});

test('side and rear contacts select individual wheels in vehicle space', () => {
  const side = collide(16, 0, { x0: 0.98, x1: 1.20, z0: 1.22, z1: 1.51 });
  const rear = collide(0, -19, { x0: 0.63, x1: 0.91, z0: -2.70, z1: -2.50 });
  assert.equal(side.impact.area, 3);
  assert.equal(side.impact.wheel, 1);
  assert.ok(side.wheelDamage[1] > 0.55 && side.axleDamage[0] > 0.3);
  assert.equal(rear.impact.wheel, 3);
  assert.ok(rear.axleDamage[1] > 0.22);
  assert.equal(rear.axleDamage[0], 0);
  const rotated = { ...createVehicleState(), heading: Math.PI * 0.5, vx: 22 };
  moveVehicle(rotated, dt, { obstacles: [{ x0: 2.50, x1: 2.70, z0: 0.62, z1: 0.91 }] });
  assert.equal(rotated.impact.area, 0);
  assert.equal(rotated.impact.wheel, 0);
});

test('nearby impacts accumulate one dent, separated impacts keep their own coordinates and reset clears every part', () => {
  const car = createVehicleState();
  for (const x of [-0.62, -0.57, 0.55]) applyImpact(car, 12, 0, 0, -1, x, 2.40, x, 2.40);
  assert.equal(car.dents.length, dentLimit * 4);
  assert.ok(car.dents[0] < -0.60 && car.dents[4] > 0.50);
  assert.ok(car.dents[2] > car.dents[6]);
  assert.equal(car.dents[10], 0);
  Object.assign(car, createVehicleState());
  assert.ok(car.dents.every(value => value === 0));
  assert.deepEqual(car.wheelDamage, [0, 0, 0, 0]);
  assert.deepEqual(car.axleDamage, [0, 0]);
});

test('wheel-specific damage pulls the car to the damaged side and adds rolling drag', () => {
  const [intact, left, right] = [null, 0, 1].map(wheel => {
    const car = { ...createVehicleState(), vz: 18 };
    if (wheel !== null) car.wheelDamage[wheel] = 0.75;
    for (let i = 0; i < 75; i++) stepVehicle(car, {}, dt, {});
    return car;
  });
  assert.ok(left.x < -1 && right.x > 1);
  assert.ok(Math.abs(left.x + right.x) < 1e-6);
  assert.ok(left.speed < intact.speed && right.speed < intact.speed);
});
