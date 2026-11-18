import assert from 'node:assert/strict';
import test from 'node:test';
import { AVANT_WHEELS, buildAvant } from '../src/render/avant.js';
import { Mesh } from '../src/render/mesh.js';

const parts = ['body', 'paint', 'glass', 'brightwork', 'wheel', 'headLights', 'tailLights', 'brakeLights', 'reverseLights', 'leftSignals', 'rightSignals'];

function collectAvant() {
  const batches = {};
  const meshes = {};
  for (const part of parts) {
    const triangles = batches[part] = [];
    const mesh = meshes[part] = {
      tri: (a, b, c, color) => triangles.push({ points: [a, b, c], color, part }),
      quad(a, b, c, d, color) {
        mesh.tri(a, b, c, color);
        mesh.tri(a, c, d, color);
      },
      box(x0, y0, z0, x1, y1, z1, color) {
        mesh.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color);
        mesh.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color);
        mesh.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color);
        mesh.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color);
        mesh.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color);
      },
    };
  }
  buildAvant(meshes);
  return batches;
}

function visibleInEndView(triangles, x, y, end) {
  let visible;
  let depth = -Infinity;
  for (const tri of triangles) {
    const [a, b, c] = tri.points;
    const area = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(area) < 1e-10) continue;
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / area;
    const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / area;
    const w = 1 - u - v;
    if (Math.min(u, v, w) < 0) continue;
    const z = end * (u * a[2] + v * b[2] + w * c[2]);
    if (z <= depth) continue;
    depth = z;
    visible = tri;
  }
  return visible;
}

test('Avant meshes use valid metre-scale vertices and share the driving geometry', () => {
  const batches = collectAvant();
  for (const [part, triangles] of Object.entries(batches)) {
    assert.ok(triangles.length > 0, `${part} must contain geometry`);
    for (const { points, color } of triangles) {
      assert.ok(points.flat().every(Number.isFinite), `${part} has an invalid coordinate`);
      assert.ok(color.every(value => value >= 0 && value <= 1), `${part} has an invalid color`);
    }
  }

  const paint = batches.paint.flatMap(tri => tri.points);
  assert.ok(paint.every(([x, y, z]) => Math.abs(x) <= 1.02 && y > .20 && y < 1.45 && Math.abs(z) < 2.43));
  assert.ok(Math.abs(AVANT_WHEELS.front - AVANT_WHEELS.rear - 2.69) < 1e-8);
  const wheel = batches.wheel.flatMap(tri => tri.points);
  const radius = Math.max(...wheel.map(([, y, z]) => Math.hypot(y, z)));
  assert.ok(Math.abs(radius - AVANT_WHEELS.radius) < .001);
});

test('headlamps and separately animated rear lenses sit in front of the shell', () => {
  const { wheel, ...batches } = collectAvant();
  const silhouette = Object.values(batches).flat();
  for (const side of [-1, 1]) {
    const headlamp = visibleInEndView(silhouette, side * .54, .81, 1);
    assert.equal(headlamp.part, 'headLights');
    assert.ok(Math.min(...headlamp.color) > .60);
    assert.equal(visibleInEndView(silhouette, side * .57, .818, -1).part, 'tailLights');
    assert.equal(visibleInEndView(silhouette, side * .57, .902, -1).part, 'brakeLights');
    assert.equal(visibleInEndView(silhouette, side * .787, .902, -1).part, 'brakeLights');
    assert.equal(visibleInEndView(silhouette, side * .57, .774, -1).part, 'reverseLights');
  }
  assert.equal(visibleInEndView(silhouette, .05, 1.312, -1).part, 'brakeLights');
});

test('both direction indicators are visible from both ends and independent by side', () => {
  const { wheel, ...batches } = collectAvant();
  const silhouette = Object.values(batches).flat();
  for (const [side, part] of [[-1, 'leftSignals'], [1, 'rightSignals']]) {
    assert.equal(visibleInEndView(silhouette, side * .784, .818, 1).part, part);
    assert.equal(visibleInEndView(silhouette, side * .75, .773, -1).part, part);
    const points = batches[part].flatMap(triangle => triangle.points);
    assert.ok(points.every(([x]) => side * x > .65));
    assert.ok(points.some(([, , z]) => z > 1.80 && z < 1.90), `${part} missing wing repeater`);
  }
});

test('the packed body surface and alloy wheels retain unit corner normals', () => {
  const meshes = Object.fromEntries(parts.map(part => [part, new Mesh()]));
  buildAvant(meshes);
  for (const mesh of [meshes.paint, meshes.wheel]) {
    let smoothFaces = 0;
    for (let face = 0; face < mesh.vertices.length; face += 30) {
      const normals = [6, 16, 26].map(offset => mesh.vertices.slice(face + offset, face + offset + 3));
      for (const normal of normals) assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-8);
      if (normals[0].some((value, axis) => value !== normals[1][axis])) smoothFaces++;
    }
    assert.ok(smoothFaces > 150);
  }
  assert.ok(meshes.wheel.vertices.some((value, index) => index % 10 === 9 && value === 9));
});

test('the blue plate marker faces the left of the game camera at both ends', () => {
  const { wheel, ...batches } = collectAvant();
  const silhouette = Object.values(batches).flat();
  const front = visibleInEndView(silhouette, .234, .520, 1).color;
  const rear = visibleInEndView(silhouette, -.234, .789, -1).color;
  for (const [r, g, b] of [front, rear]) {
    assert.ok(b > g && g > r);
    assert.ok(r < .2);
  }
});
