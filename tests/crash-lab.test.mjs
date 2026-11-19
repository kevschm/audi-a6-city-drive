import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTACT_MATERIALS, solveContact } from '../src/simulation/contact-impulse.js';
import { createCrashScenario } from './contact-fixtures.mjs';
import { createFixedStepClock, FIXED_STEP_SECONDS as dt } from '../src/simulation/fixed-step.js';
import { createPropWorld } from '../src/simulation/rigid-props.js';
import { createRagdoll, ragdollSegments, stepPedestrianRigs, stepRagdoll } from '../src/simulation/ragdoll.js';
import { stepTrafficWrecks } from '../src/simulation/vehicle-collision.js';
import { createVehicleState, stepVehicle } from '../src/simulation/vehicle.js';

const kinetic = body => 0.5 * (body.mass * (body.vx ** 2 + body.vz ** 2) + body.inertia * body.yaw ** 2);
const angular = body => body.inertia * body.yaw + body.mass * (body.z * body.vx - body.x * body.vz);
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} vs ${b}`);

test('contact impulse conserves linear and angular momentum, dissipates energy and obeys Coulomb friction', () => {
  const a = { x: 0, z: 0, vx: 5, vz: 22, yaw: 0.13, mass: 1575, inertia: 2650 };
  const b = { x: 0.26, z: 4.47, vx: -3, vz: -5, yaw: 0.2, mass: 1420, inertia: 2180 };
  const material = CONTACT_MATERIALS.car;
  const hit = solveContact(a, b, 0, -1, 0.64, 2.4, material);
  const nextA = { ...a, vx: a.vx + hit.ix / a.mass, vz: a.vz + hit.iz / a.mass, yaw: a.yaw + hit.aYaw };
  const nextB = { ...b, vx: b.vx - hit.ix / b.mass, vz: b.vz - hit.iz / b.mass, yaw: b.yaw + hit.bYaw };
  for (const v of ['vx', 'vz']) near(a.mass * a[v] + b.mass * b[v], a.mass * nextA[v] + b.mass * nextB[v]);
  near(angular(a) + angular(b), angular(nextA) + angular(nextB));
  assert.ok(kinetic(nextA) + kinetic(nextB) < kinetic(a) + kinetic(b));
  assert.ok(Math.abs(hit.frictionImpulse) <= material.friction * hit.normalImpulse);
  assert.ok(hit.aYaw > 0 && hit.angle > 0 && hit.energy > 0);
  const separated = solveContact({ ...a, vz: -18 }, b, 0, -1, 0.64, 2.4, material);
  assert.equal(separated.normalImpulse, 0);
});

function run(name, kmh, frames = 200) {
  const s = createCrashScenario(name, kmh);
  const car = { ...createVehicleState(), ...s.spawn };
  const props = createPropWorld(() => 0, s.obstacles, 52);
  props.reset(s.props);
  const world = { bounds: 52, obstacles: s.obstacles, traffic: s.traffic, props: props.bodies };
  let impact;
  for (let i = 0; i < frames; i++) {
    const previous = { x: car.x, z: car.z };
    stepVehicle(car, {}, dt, world);
    if (car.impact) {
      props.detach(car, car.impact);
      if (!impact || car.impact.energy > impact.energy) impact = car.impact;
    }
    stepTrafficWrecks(s.traffic, dt, world);
    props.step(dt);
    stepPedestrianRigs(s.dummies, dt, previous, car, () => 0, s.obstacles, props.bodies);
  }
  return { car, props, impact, scenario: s };
}

test('impact energy separates a low speed brush from a crash with glass, detached parts and a stalled engine', () => {
  const low = run('front', 12, 900);
  const high = run('front', 105);
  assert.ok(low.car.damage[0] < 0.1 && !low.car.detached && !low.car.mechanical.stalled);
  assert.ok(high.impact.energy > 100 * (low.impact?.energy ?? 1000));
  assert.equal(high.impact.detached, 0);
  assert.equal(high.impact.glassBreak, true);
  assert.equal(high.car.detached, 1);
  assert.equal(high.car.mechanical.stalled, true);
  assert.ok(high.car.mechanical.cooling > 0.9 && high.car.mechanical.brakes > 0.2);
  assert.equal(high.props.bodies.length, 1);
  const [debris] = high.props.bodies;
  assert.ok(debris.debris && debris.pitch > 0.4 && debris.z <= 8 - debris.radius + 1e-6);
  const broken = high.car;
  for (let i = 0; i < 180; i++) stepVehicle(broken, { throttle: 1 }, dt);
  assert.ok(Math.abs(broken.speed) < 2 && broken.rpm < 45);
  const fresh = createVehicleState();
  assert.equal(fresh.detached, 0);
  assert.equal(fresh.mechanical.temperature, 90);
  assert.ok(fresh.glass.every(severity => severity === 0));
});

test('offset, rear and side tests produce distinct damage and traffic transmits the next impact', () => {
  const front = run('front', 95), offset = run('offset', 95), rear = run('rear', 95);
  near(front.impact.localX, 0);
  assert.ok(offset.impact.contactWidth < front.impact.contactWidth * 0.4);
  assert.ok(offset.impact.localX > 0.4 && offset.impact.aYaw > 1 && offset.car.wheelDamage[1] > 0.05);
  assert.equal(rear.impact.area, 1);
  assert.equal(rear.car.detached, 2);
  assert.equal(rear.car.mechanical.engine, 0);
  assert.ok(rear.car.glass[1] > 0.3);
  const side = run('side', 105);
  const [target] = side.scenario.traffic;
  assert.ok(target.wrecked && target.damage[3] > 0.25 && target.z > 15);
  const chain = run('chain', 105);
  assert.ok(chain.scenario.traffic.every(actor => actor.wrecked));
  assert.ok(chain.scenario.traffic[2].z > 17);
});

test('a light prop can move a second prop and all bodies settle on resettable ground', () => {
  const props = createPropWorld(() => 0, [], 50);
  props.reset([{ kind: 'drum', x: 0, z: 0 }, { kind: 'crate', x: 0, z: 1.15 }]);
  const [drum, crate] = props.bodies;
  drum.asleep = false;
  drum.vz = 7;
  for (let i = 0; i < 330; i++) props.step(dt);
  assert.ok(crate.z > 2.4 && Math.abs(crate.pitch) > 0.3);
  assert.equal(crate.y, crate.floor);
  assert.equal(crate.asleep, true);
  props.reset([]);
  assert.equal(props.bodies.length, 0);
});

test('joint constraints keep ragdolls bounded and a harder hit makes a longer airborne trajectory', () => {
  const actor = { x: 0, y: 0, z: 0, heading: 0 };
  const gentle = createRagdoll(actor, 0, 4, dt), hard = createRagdoll(actor, 0, 21, dt);
  for (let i = 0; i < 18; i++) {
    stepRagdoll(gentle, dt, () => 0, [], []);
    stepRagdoll(hard, dt, () => 0, [], []);
  }
  assert.ok(hard.nodes[0].position[2] > gentle.nodes[0].position[2] + 1.0);
  assert.ok(hard.nodes[0].position[1] > gentle.nodes[0].position[1] + 0.2);
  for (let i = 0; i < 420; i++) stepRagdoll(hard, dt, () => 0, [], []);
  for (const node of hard.nodes) assert.ok(node.position.every(Number.isFinite) && node.position[1] >= node.radius - 1e-4);
  for (const [a, b] of ragdollSegments) {
    const p = hard.nodes[a].position, q = hard.nodes[b].position;
    assert.ok(Math.hypot(...p.map((value, i) => value - q[i])) < 0.52);
  }
  assert.ok(run('dummy', 75, 100).scenario.dummies[0].rig);
});

test('an airborne articulated body can knock a loose prop into motion', () => {
  const rig = createRagdoll({ x: 0, y: 0, z: 0, heading: 0 }, 0, 15, dt);
  const props = createPropWorld(() => 0, [], 30);
  props.reset([{ kind: 'drum', x: -0.1, z: 1.3 }]);
  for (let i = 0; i < 40; i++) {
    stepRagdoll(rig, dt, () => 0, [], props.bodies);
    props.step(dt);
  }
  const [drum] = props.bodies;
  assert.ok(drum.z > 2.4 && !drum.asleep && drum.pitch > 0.3);
});

test('slow motion advances fewer whole fixed steps', () => {
  const clock = createFixedStepClock();
  const steps = [];
  clock.tick(0, step => steps.push(step), 0.28);
  for (let tick = 1; tick <= 60; tick++) clock.tick(tick * 1000 / 60, step => steps.push(step), 0.28);
  assert.equal(steps.length, 16);
  assert.ok(steps.every(step => step === dt));
});
