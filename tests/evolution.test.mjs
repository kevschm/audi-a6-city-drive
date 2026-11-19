import test from 'node:test';
import assert from 'node:assert/strict';
import { createCrashScenario } from './contact-fixtures.mjs';
import { createPropWorld } from '../src/simulation/rigid-props.js';
import { moveVehicle } from '../src/simulation/vehicle-collision.js';
import { createVehicleState, stepVehicle } from '../src/simulation/vehicle.js';
import { FIXED_STEP_SECONDS as dt } from '../src/simulation/fixed-step.js';

function wallHit(speed, left = -4, right = 4, heading = 0) {
  const car = Object.assign(createVehicleState(), {vz: speed / 3.6, heading});
  const world = {obstacles: [{x0: left, x1: right, z0: 3, z1: 3.3}]};
  for (let i = 0; i < 50 && !car.impact; i++) moveVehicle(car, dt, world);
  return car;
}

test('20, 50 and 100 km/h deform both front rails progressively without shortening the rear', () => {
  const results = [20, 50, 100].map(v => wallHit(v));
  let previous = 0;
  for (const car of results) {
    const [left, right, rearLeft, rearRight] = car.railCrush;
    assert.ok(left > previous + .065 && left <= .721);
    assert.equal(left, right);
    assert.equal(rearLeft + rearRight, 0);
    assert.ok(car.impact.contactWidth > 1.75 && Math.abs(car.yaw) < 1e-8);
    previous = left;
  }
  assert.ok(results[0].mechanical.engine === 0 && results[2].mechanical.stalled);
});

test('the contact patch follows the clipped faces at offset and oblique incidence', () => {
  const left = wallHit(65, -.90, -.52), right = wallHit(65, .52, .90);
  assert.ok(right.impact.contactWidth < .38 && Math.abs(right.impact.localX - .705) < .003);
  assert.ok(right.railCrush[1] > right.railCrush[0] * 3);
  assert.equal(left.railCrush[0], right.railCrush[1]);
  assert.ok(Math.abs(left.yaw + right.yaw) < 1e-8 && right.yaw > 1);
  assert.ok(wallHit(65, -5, 5, .42).impact.contactWidth < .22);
});

test('braking on split friction creates mirrored wheel forces and yaw toward the dry side', () => {
  const results = [-1,1].map(sign => {
    const car = Object.assign(createVehicleState(), {vz: 22});
    const world = { roadSurfaceAt: x => sign * x > 0 ? 'asphalt' : 'grass' };
    for (let i = 0; i < 18; i++) stepVehicle(car, {brake: 1}, dt, world);
    return car;
  });
  assert.ok(results[1].tireBrake[1] > results[1].tireBrake[0] && results[1].yaw > .05);
  assert.ok(Math.abs(results[0].yaw + results[1].yaw) < 1e-8);
});

test('a concentrated wheel strike releases exactly one physical wheel and the unsupported corner drops', () => {
  const setup = createCrashScenario('wheel', 100);
  const car = Object.assign(createVehicleState(), setup.spawn);
  const props = createPropWorld(() => 0, setup.obstacles, 52);
  for (let i = 0; i < 200; i++) {
    stepVehicle(car, {}, dt, {...setup, props: props.bodies});
    if (car.impact) props.detach(car, car.impact);
    props.step(dt);
  }
  assert.equal(car.lostWheels, 2);
  assert.ok(car.sideGlass[5] > .65 && car.sideGlass[3] === 0 && car.sideGlass[2] === 0);
  const wheels = props.bodies.filter(b => b.kind === 'wheel');
  assert.equal(wheels.length, 1);
  assert.ok(Math.abs(wheels[0].pitch) > .3 && wheels[0].mass === 19);
  assert.ok(car.wheelTravel[1] < -.17 && car.tireGrip[1] < car.tireGrip[0] * .15);
  assert.equal(createVehicleState().lostWheels, 0);
});
