import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixedStepClock, FIXED_STEP_SECONDS as dt } from '../src/simulation/fixed-step.js';
import { createVehicleState, stepVehicle, vehicleOverlapsTraffic } from '../src/simulation/vehicle.js';

const openRoad = { bounds: 3000 };

function drive(car, input, seconds, world = openRoad) {
  for (let tick = 0; tick < Math.round(seconds / dt); tick++) stepVehicle(car, input, dt, world);
}

test('stationary car idles without creeping and tracks zero distance', () => {
  const car = createVehicleState();
  drive(car, {}, 5);
  assert.equal(car.speed, 0);
  assert.equal(car.km, 0);
  assert.equal(car.rpm, 850);
  assert.equal(car.gear, 'N');
  assert.equal(car.brakeLights, false);
  assert.equal(car.reverseLights, false);
});

test('full throttle reaches 100 km/h with automatic shifts and plausible timing', () => {
  const car = createVehicleState();
  const gears = new Set();
  let elapsed;
  for (let tick = 1; tick <= 13 / dt; tick++) {
    stepVehicle(car, { throttle: 1 }, dt, openRoad);
    gears.add(car.gear);
    assert.ok(car.rpm >= 850 && car.rpm <= 6400);
    if (car.speed >= 100 / 3.6) {
      elapsed = tick * dt;
      break;
    }
  }
  assert.ok(elapsed >= 8 && elapsed <= 12, `0–100 time: ${elapsed} s`);
  assert.deepEqual([...gears], ['D1', 'D2', 'D3']);
  assert.ok(car.pitch < 0 && car.spin > 0 && car.km > 0);
});

test('service brake stops within a plausible distance and held brake never engages reverse', () => {
  const car = createVehicleState();
  car.vz = 100 / 3.6;
  drive(car, { brake: 1 }, 0.5);
  assert.ok(car.pitch > 0);
  assert.equal(car.brakeLights, true);
  drive(car, { brake: 1 }, 7);
  assert.equal(car.speed, 0);
  assert.ok(car.z > 36 && car.z < 48, `100–0 distance: ${car.z} m`);
  assert.equal(car.reverseLights, false);
  assert.ok(Math.abs(car.pitch) < 0.001);

  stepVehicle(car, {}, dt, openRoad);
  const spinBefore = car.spin;
  drive(car, { brake: 1 }, 2);
  assert.ok(car.speed < -3 && car.spin < spinBefore);
  assert.equal(car.gear, 'R');
  assert.equal(car.brakeLights, false);
  assert.equal(car.reverseLights, true);

  drive(car, { throttle: 1 }, 2.5);
  assert.ok(car.speed > 0);
  assert.equal(car.reverseLights, false);
});

test('speed-dependent steering and body roll remain stable under sustained cornering', () => {
  const slow = createVehicleState();
  const fast = createVehicleState();
  slow.vz = 4;
  fast.vz = 26;
  drive(slow, { right: 1 }, 0.6);
  drive(fast, { right: 1 }, 0.6);
  assert.ok(slow.steer > fast.steer * 2.5);
  for (const car of [slow, fast]) {
    assert.ok(car.x > 0 && car.yaw > 0 && car.roll > 0);
  }
  drive(fast, { right: 1, throttle: 1 }, 30);
  assert.ok([fast.x, fast.z, fast.speed, fast.heading, fast.yaw, fast.roll, fast.pitch].every(Number.isFinite));
  assert.ok(Math.abs(fast.roll) < 0.11 && Math.abs(fast.pitch) < 0.08);
  assert.ok(fast.speed > 0 && fast.speed < 60);
});

test('grass weakens traction and a steering handbrake slide is stronger than coasting', () => {
  const asphalt = createVehicleState();
  const grass = createVehicleState();
  drive(asphalt, { throttle: 1 }, 4);
  drive(grass, { throttle: 1 }, 4, { ...openRoad, roadSurfaceAt: () => 'grass' });
  assert.ok(grass.speed < asphalt.speed * 0.65);
  assert.equal(grass.road, false);
  assert.equal(grass.surface, 'grass');

  const coasting = createVehicleState();
  const handbrake = createVehicleState();
  coasting.vz = handbrake.vz = 15;
  drive(coasting, { right: 1 }, 0.6);
  drive(handbrake, { right: 1, handbrake: 1 }, 0.6);
  assert.ok(handbrake.speed < coasting.speed - 1);
  assert.ok(handbrake.skid > coasting.skid);
  assert.ok(handbrake.yaw > coasting.yaw);
});

test('wheels follow a curb independently and the body settles after descending', () => {
  const car = createVehicleState();
  car.vz = 3.1;
  const curb = { ...openRoad, groundHeightAt: (x, z) => x > 0.65 && z > 3 && z < 6 ? 0.16 : 0 };
  drive(car, {}, 52 * dt, curb);

  const [frontLeft, frontRight, rearLeft, rearRight] = car.wheelTravel;
  assert.ok(frontRight > 0.15 && frontRight < 0.17);
  assert.ok([frontLeft, rearLeft, rearRight].every((height) => Math.abs(height) < 0.004));
  assert.ok(car.heave > 0.03 && car.heave < 0.055);
  assert.ok(car.pitch < -0.02 && car.roll > 0.04);

  drive(car, {}, 1.15, curb);
  assert.ok(car.wheelTravel[3] > 0.15);
  drive(car, { throttle: 0.18 }, 3, curb);
  assert.ok(car.z > 8);
  assert.ok(car.wheelTravel.every((height) => Math.abs(height) < 0.006));
  assert.ok(Math.abs(car.heave) < 0.006 && Math.abs(car.roll) < 0.02);
});

test('front tire contact gives mixed surfaces intermediate traction', () => {
  const asphalt = createVehicleState();
  const grass = createVehicleState();
  const split = createVehicleState();
  drive(asphalt, { throttle: 1 }, 3);
  drive(grass, { throttle: 1 }, 3, { ...openRoad, roadSurfaceAt: () => 'grass' });
  drive(split, { throttle: 1 }, 3, { ...openRoad, roadSurfaceAt: (x) => x < -0.25 ? 'grass' : 'asphalt' });
  assert.equal(split.surface, 'asphalt');
  assert.ok(grass.speed < split.speed - 1 && split.speed < asphalt.speed - 1);
});

test('inner front wheel steers more and handbrake stops rear wheel rotation', () => {
  const car = createVehicleState();
  car.vz = 5;
  drive(car, { right: 1 }, 0.35);
  assert.ok(car.wheelSteer[1] > car.wheelSteer[0] && car.wheelSteer[0] > 0);
  assert.ok(car.wheelSpin[2] > car.wheelSpin[3]);
  assert.equal(car.wheelSteer[2], 0);
  assert.equal(car.wheelSteer[3], 0);
  const spin = [...car.wheelSpin];
  drive(car, { handbrake: 1 }, 0.25);
  assert.ok(car.wheelSpin[0] > spin[0]);
  assert.deepEqual(car.wheelSpin.slice(2), spin.slice(2));
});

test('quick 70 km/h steering reversals recenter promptly and mirror left and right', () => {
  const right = createVehicleState(), left = createVehicleState();
  right.vz = left.vz = 70 / 3.6;
  for (let tick = 0; tick < 180; tick++) {
    const steer = tick < 30 ? 0 : tick < 60 ? 1 : tick < 100 ? -1 : 0;
    stepVehicle(right, { steer }, dt, openRoad);
    stepVehicle(left, { steer: -steer }, dt, openRoad);
    if (tick === 65) assert.ok(right.steer < 0 && left.steer > 0);
    assert.ok(Math.abs(right.yaw) < 0.8 && Math.abs(left.yaw) < 0.8);
  }
  assert.ok(Math.abs(right.x + left.x) < 1e-9);
  assert.ok(Math.abs(right.z - left.z) < 1e-9);
  assert.ok(Math.abs(right.heading + left.heading) < 1e-9);
  assert.ok(right.speed > 17 && Math.abs(right.yaw) < 0.03);
});

test('analog steering preserves partial and opposing inputs', () => {
  const full = createVehicleState(), partial = createVehicleState(), opposing = createVehicleState();
  drive(full, { right: 1 }, 0.5);
  drive(partial, { right: 0.4 }, 0.5);
  drive(opposing, { right: 0.7, left: 0.3 }, 0.5);
  assert.ok(Math.abs(partial.steer - full.steer * 0.4) < 1e-9);
  assert.ok(Math.abs(partial.steer - opposing.steer) < 1e-9);

  const lightThrottle = createVehicleState(), fullThrottle = createVehicleState();
  drive(lightThrottle, { throttle: 0.3 }, 1);
  drive(fullThrottle, { throttle: 1 }, 1);
  assert.ok(lightThrottle.speed > 0 && lightThrottle.speed < fullThrottle.speed * 0.6);
});

test('swept footprint catches a thin central obstacle even between the four corners', () => {
  const car = createVehicleState();
  const world = { obstacles: [{ x0: -0.08, x1: 0.08, z0: 12, z1: 12.10 }] };
  car.vz = 55;
  let impact = 0;
  for (let tick = 0; tick < 30; tick++) {
    stepVehicle(car, {}, dt, world);
    impact = Math.max(impact, car.collisionImpact);
    assert.ok(car.z + 2.4 <= 12);
  }
  assert.ok(impact > 40);
  assert.ok(car.z > 8);
  assert.ok(car.speed < 0);
});

test('a shallow wall impact preserves forward motion and respects world edges', () => {
  const car = createVehicleState();
  car.x = 0.4;
  car.vx = 5;
  car.vz = 18;
  stepVehicle(car, {}, dt, { obstacles: [{ x0: 1.35, x1: 7, z0: -50, z1: 50 }] });
  assert.ok(car.collisionImpact > 4);
  assert.ok(car.x <= 0.46);
  assert.ok(car.vz > 14 && car.vx < 0);

  const edge = createVehicleState();
  edge.z = 7.5;
  edge.vz = 20;
  stepVehicle(edge, {}, dt, { bounds: 10 });
  assert.ok(edge.z <= 7.6);
  assert.ok(edge.collisionImpact > 19);
});

test('traffic collision uses each vehicle orientation', () => {
  const car = createVehicleState();
  const traffic = { x: 2.8, z: 0.6, heading: 0 };
  assert.equal(vehicleOverlapsTraffic(car, traffic), false);
  traffic.heading = Math.PI / 2;
  assert.equal(vehicleOverlapsTraffic(car, traffic), true);
  traffic.z = 7;
  car.vz = 20;
  drive(car, {}, 0.5, { traffic: [traffic] });
  assert.ok(car.z + 2.4 <= traffic.z - 0.91);
  traffic.x = 8;
  assert.equal(vehicleOverlapsTraffic(car, traffic), false);
});

test('matched fixed-step inputs yield identical trajectories on 30 and 60 Hz displays', () => {
  const simulate = (refreshRate) => {
    const car = createVehicleState();
    const clock = createFixedStepClock();
    let step = 0;
    for (let tick = 0; tick <= refreshRate * 9; tick++) {
      clock.tick(tick * 1000 / refreshRate, (delta) => {
        stepVehicle(car, { throttle: step < 440, right: step > 150 && step < 250, brake: step > 480 }, delta, openRoad);
        step++;
      });
    }
    assert.equal(step, 540);
    return car;
  };
  assert.deepEqual(simulate(30), simulate(60));
});
