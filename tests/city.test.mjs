import assert from 'node:assert/strict';
import test from 'node:test';
import { Mesh } from '../src/render/mesh.js';
import { buildCity, districtAt, groundHeightAt, halfWorld, roadHalfWidth, roads, roadSurfaceAt } from '../src/world/city.js';

const city = buildCity({ Mesh });

test('city scenery fits its culling bounds and includes the mapped districts', () => {
  assert.equal(city.districts.length, 36);
  assert.deepEqual(new Set(city.districts.map(district => district.kind)),
    new Set(['residential', 'park', 'historic', 'mixed', 'market', 'service', 'station']));
  assert.equal(districtAt(-35, 35), 'Marktplatz');
  assert.equal(districtAt(35, 35), 'Bahnhofstraße');
  assert.equal(districtAt(35, -35), 'Am Stadtpark');
  assert.ok(city.cityChunks.length > 1);
  for (const { mesh, minX, maxX, minZ, maxZ } of city.cityChunks) {
    assert.equal(mesh.vertices.length, mesh.count * 10);
    assert.equal(mesh.count % 3, 0);
    for (let i = 0; i < mesh.vertices.length; i += 10) {
      const x = mesh.vertices[i], y = mesh.vertices[i + 1], z = mesh.vertices[i + 2];
      if (!Number.isFinite(y) || !(x >= minX && x <= maxX && z >= minZ && z <= maxZ)) {
        assert.fail(`Vertex (${x}, ${y}, ${z}) is outside its culling bounds`);
      }
    }
  }
});

test('all road approaches and world axes remain passable for a car', () => {
  const lane = 3.4;
  const halfWidth = .91;
  const halfLength = 2.4;
  const overlaps = (x0, z0, x1, z1) => city.obstacles.find(o => x1 > o.x0 && x0 < o.x1 && z1 > o.z0 && z0 < o.z1);
  for (const center of roads) {
    assert.ok(roadHalfWidth(center) >= lane + halfWidth);
    for (const side of [-1, 1]) for (let along = -halfWorld + 3; along <= halfWorld - 3; along += 1) {
      const across = center + side * lane;
      assert.equal(roadSurfaceAt(across, along), 'asphalt');
      assert.equal(roadSurfaceAt(along, across), 'asphalt');
      const vertical = overlaps(across - halfWidth, along - halfLength, across + halfWidth, along + halfLength);
      const horizontal = overlaps(along - halfLength, across - halfWidth, along + halfLength, across + halfWidth);
      if (vertical || horizontal) assert.fail(`Lane obstructed by ${(vertical ?? horizontal).kind} at road ${center}, offset ${side * lane}, position ${along}`);
    }
  }
  assert.equal(roadSurfaceAt(-50, -50), 'grass');
  assert.equal(roadSurfaceAt(-35, -50), 'paving');
  assert.equal(roadSurfaceAt(-40, 40), 'paving');
  const bayEdge = 70 - roadHalfWidth(70);
  assert.equal(roadSurfaceAt(bayEdge - 1, -104), 'asphalt');
  assert.equal(roadSurfaceAt(bayEdge - 3, -104), 'paving');
  assert.equal(roadSurfaceAt(0, halfWorld + 1), 'grass');
});

test('signal housings mark every approach and parked vehicles occupy roadside bays', () => {
  assert.equal(city.signals.length, 36);
  const approaches = new Set();
  for (const signal of city.signals) {
    assert.equal(roadSurfaceAt(signal.x, signal.z), 'paving');
    const forwardX = Math.sin(signal.heading), forwardZ = Math.cos(signal.heading);
    const distance = forwardX * (signal.intersectionX - signal.x) + forwardZ * (signal.intersectionZ - signal.z);
    const cross = signal.axis === 0 ? signal.intersectionZ : signal.intersectionX;
    const setback = distance - roadHalfWidth(cross);
    assert.ok(setback > 5.2 && setback < 6.2);
    approaches.add([signal.intersectionX, signal.intersectionZ, signal.heading].join(','));
  }
  assert.equal(approaches.size, 36);
  const parkedCars = city.obstacles.filter(obstacle => obstacle.kind === 'vehicle');
  assert.ok(parkedCars.length >= 10);
  for (const { x0, x1, z0, z1 } of parkedCars) {
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    assert.equal(roadSurfaceAt(x, z), 'asphalt');
    assert.ok(roads.every(center => Math.abs(x - center) > roadHalfWidth(center)));
  }
});

test('wheel contact height rises at pavement curbs and parking-bay edges', () => {
  const curb = roadHalfWidth(0);
  assert.equal(groundHeightAt(curb - .02, 22), 0);
  const bevel = groundHeightAt(curb + .08, 22);
  assert.ok(bevel > .131 && bevel < .16);
  assert.equal(groundHeightAt(curb + .24, 22), .16);

  const bayEdge = 70 - roadHalfWidth(70) - 2.7;
  assert.equal(groundHeightAt(bayEdge + .08, -104), 0);
  assert.ok(groundHeightAt(bayEdge - .08, -104) < .16);
  assert.equal(groundHeightAt(bayEdge - .24, -104), .16);
  assert.equal(groundHeightAt(-50, -50), .17);
  assert.equal(groundHeightAt(241, 241), -.032);
});

test('all street ends have solid barriers aligned before the world boundary', () => {
  const barriers = city.obstacles.filter(obstacle => obstacle.kind === 'road-end');
  assert.equal(barriers.length, roads.length * 4);
  for (const barrier of barriers) {
    assert.equal(Math.max(Math.abs(barrier.x0), Math.abs(barrier.z0), Math.abs(barrier.x1), Math.abs(barrier.z1)), halfWorld);
  }
});
