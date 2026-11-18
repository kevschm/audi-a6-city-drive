import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXED_STEP_SECONDS as dt } from '../src/simulation/fixed-step.js';
import { createVehicleState, stepVehicle, vehicleOverlapsTraffic } from '../src/simulation/vehicle.js';
import { buildCity, halfWorld, roadHalfWidth, roadSurfaceAt, roads, startPosition } from '../src/world/city.js';
import { makeTraffic } from '../src/world/traffic.js';

// Generate the production layout and footprints without creating a GPU context.
class GeometrySink {
  box() {}
  cylY() {}
  quad() {}
  sphere() {}
  tri() {}
}

const city = buildCity({ Mesh: GeometrySink });
const outside = { x: 1000, z: 1000, heading: 0 };

function advance(traffic, seconds, player = outside) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    traffic.step(dt, player, vehicleOverlapsTraffic, roadHalfWidth);
  }
}

test('restarting the time trial restores the traffic and signal phases in place', () => {
  const traffic = makeTraffic(roads, city.signals);
  const snapshot = traffic.actors.map(actor => ({ ...actor }));
  const phase = traffic.signalColor(0, 0, 0);
  advance(traffic, 13);
  assert.notEqual(traffic.signalColor(0, 0, 0), phase);
  assert.notDeepEqual(traffic.actors, snapshot);
  const actors = traffic.actors;
  traffic.restart();
  assert.equal(traffic.actors, actors);
  assert.deepEqual(traffic.actors, snapshot);
  assert.equal(traffic.signalColor(0, 0, 0), phase);
});

test('traffic stays in the right-hand lanes and the player can leave the actual spawn', () => {
  const traffic = makeTraffic(roads, city.signals);
  const player = { ...createVehicleState(), ...startPosition };
  const world = { obstacles: city.obstacles, traffic: traffic.actors, roadSurfaceAt, bounds: halfWorld };
  assert.ok(traffic.actors.length > 0);
  for (let i = 0; i < 2 / dt; i++) {
    traffic.step(dt, player, vehicleOverlapsTraffic, roadHalfWidth);
    stepVehicle(player, { throttle: 1 }, dt, world);
    assert.equal(player.collisionImpact, 0);
    assert.equal(player.surface, 'asphalt');
    for (const actor of traffic.actors) {
      assert.equal(roadSurfaceAt(actor.x, actor.z), 'asphalt');
      assert.ok((actor.lane - actor.road) * (actor.axis ? -actor.dir : actor.dir) > 0);
      assert.equal(vehicleOverlapsTraffic(player, actor), false);
    }
  }
  assert.ok(player.z > startPosition.z + 6 && player.speed > 6);
});

test('signal stops approaching traffic and gives the intersection back on green', () => {
  const intersectionX = 0, intersectionZ = 0;
  const traffic = makeTraffic(roads, city.signals);
  const actor = traffic.actors.find(({ axis, road }) => axis === 0 && road === intersectionX);
  traffic.actors.splice(0, traffic.actors.length, actor);
  advance(traffic, 13);
  const marking = intersectionZ - actor.dir * (roadHalfWidth(intersectionZ) + 5.2);
  actor.z = marking - actor.dir * 16.2;
  actor.speed = 8;

  assert.equal(traffic.signalColor(0, intersectionX, intersectionZ), 'red');
  assert.equal(traffic.signalColor(1, intersectionX, intersectionZ), 'green');
  advance(traffic, 4);
  const bumperDistance = (marking - actor.z) * actor.dir - 2.15;
  assert.ok(bumperDistance >= 0.04 && bumperDistance < 0.1);
  assert.ok(actor.speed < 1e-5);
  assert.equal(actor.braking, true);

  advance(traffic, 14);
  assert.equal(traffic.signalColor(0, intersectionX, intersectionZ), 'green');
  assert.ok((actor.z - intersectionZ) * actor.dir > 0);
  assert.ok(actor.speed > 0);
});

function trafficBodiesOverlap(a, b) {
  const x1 = a.axis ? 2.15 : 0.91, z1 = a.axis ? 0.91 : 2.15;
  const x2 = b.axis ? 2.15 : 0.91, z2 = b.axis ? 0.91 : 2.15;
  return Math.abs(a.x - b.x) < x1 + x2 && Math.abs(a.z - b.z) < z1 + z2;
}

test('two simultaneous arrivals at an uncontrolled junction cross in turn', () => {
  const traffic = makeTraffic(roads, city.signals);
  const [north, east] = traffic.actors.filter(({ road }) => road === 210);
  traffic.actors.splice(0, traffic.actors.length, north, east);
  north.z = east.x = 194;
  north.speed = east.speed = 8;
  north.cruise = east.cruise = 8;
  const passed = new Set();
  let yielded = false;
  for (let tick = 0; tick < 12 / dt; tick++) {
    traffic.step(dt, outside, vehicleOverlapsTraffic, roadHalfWidth);
    assert.equal(trafficBodiesOverlap(north, east), false);
    if (north.z > 218) passed.add(north);
    if (east.x > 218) passed.add(east);
    if (east.braking && east.x < 210 - roadHalfWidth(210)) yielded = true;
  }
  assert.equal(passed.size, 2);
  assert.equal(yielded, true);
});

test('all traffic routes keep moving without overlaps over five simulated minutes', () => {
  const traffic = makeTraffic(roads, city.signals);
  const stoppedSince = traffic.actors.map(() => 0);
  const wraps = traffic.actors.map(() => 0);
  const positions = traffic.actors.map(({ axis, x, z }) => axis ? x : z);
  for (let tick = 0; tick < 300 / dt; tick++) {
    traffic.step(dt, outside, vehicleOverlapsTraffic, roadHalfWidth);
    for (let first = 0; first < traffic.actors.length; first++) {
      const a = traffic.actors[first];
      const position = a.axis ? a.x : a.z;
      const moved = Math.abs(position - positions[first]);
      if (moved > 400) wraps[first]++;
      if (moved > 0.001) stoppedSince[first] = tick;
      positions[first] = position;
      assert.ok((tick - stoppedSince[first]) * dt < 26, `route ${first} stopped through a full light cycle`);
      for (let second = first + 1; second < traffic.actors.length; second++) {
        assert.equal(trafficBodiesOverlap(a, traffic.actors[second]), false, `routes ${first} and ${second} overlapped at ${tick * dt} s`);
      }
    }
  }
  assert.ok(wraps.every((count) => count >= 2));
});

test('traffic yields to the player footprint when it crosses a lane', () => {
  const traffic = makeTraffic(roads, []);
  traffic.actors.splice(1);
  const [actor] = traffic.actors;
  actor.z = -8;
  actor.speed = 8;
  const player = { x: actor.x + 2.9, z: 0, heading: Math.PI / 2 };

  advance(traffic, 2, player);
  assert.ok(actor.z > -4 && actor.z < -3);
  assert.equal(actor.speed, 0);
  assert.equal(actor.braking, true);
  assert.equal(vehicleOverlapsTraffic(player, actor), false);

  advance(traffic, 4);
  assert.ok(actor.z > 0);
  assert.ok(actor.speed > 0);
});
