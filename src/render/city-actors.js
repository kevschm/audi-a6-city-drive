import { color, Mesh } from './mesh.js';
import { transform, unit } from './math.js';
import { ragdollSegments } from '../simulation/ragdoll.js';

function pedestrian(withUmbrella, dummy = false) {
  const mesh = new Mesh();
  mesh.sphere(0, 1.53, 0.015, 0.119, 0.142, 0.112, dummy ? '#dbad5a' : '#dcc1a3', 9, 5);
  if (!dummy) mesh.sphere(0, 1.595, -0.022, 0.115, 0.095, 0.113, '#382f2a', 9, 4);
  mesh.sphere(0, 1.17, 0, 0.222, 0.252, 0.118, '#d0ccc7', 8, 5);
  mesh.box(-0.156, 0.82, -0.105, 0.156, 1.16, 0.108, '#beb7ad');
  for (const side of [-1, 1]) {
    const x = side * 0.09;
    mesh.box(x - 0.059, 0.098, -0.064, x + 0.059, 0.875, 0.067, '#4b4e54');
    mesh.box(x - 0.065, 0.026, -0.056, x + 0.065, 0.12, 0.109, '#302c2c');
    mesh.sphere(side * 0.218, 1.12, 0.013, 0.059, 0.233, 0.066, '#b8b0a5', 7, 4);
    mesh.sphere(side * 0.215, 0.896, 0.029, 0.045, 0.061, 0.048, '#dbc5aa', 6, 4);
  }
  if (withUmbrella) {
    mesh.cylY(0.19, 1.02, 0.10, 0.016, 0.90, '#454751', 6);
    const center = [0.072, 1.99, 0.08];
    for (let i = 0; i < 10; i++) {
      const point = (j, radius, y) => [center[0] + Math.cos(j * Math.PI / 5) * radius, y, center[2] + Math.sin(j * Math.PI / 5) * radius];
      const a = point(i, 0.39, 1.91), b = point(i + 1, 0.39, 1.91);
      mesh.tri(center, a, b, i % 2 ? '#6b6e76' : '#535d67');
      mesh.quad(a, point(i, 0.55, 1.80), point(i + 1, 0.55, 1.80), b, i % 2 ? '#6b6e76' : '#535d67');
    }
  }
  if (dummy) {
    mesh.box(-0.15, 1.12, 0.10, 0.15, 1.22, 0.125, '#31281e');
    mesh.box(-0.04, 1.135, 0.124, 0.04, 1.207, 0.128, '#e8ae4e');
  }
  return mesh;
}

function boneTransform(p, q) {
  const delta = q.map((value, i) => value - p[i]);
  const up = unit(delta);
  const right = Math.abs(up[1]) < 0.97 ? unit([up[2], 0, -up[0]]) : [1, 0, 0];
  const front = unit([right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]]);
  return new Float32Array([...right, 0, ...delta, 0, ...front, 0, ...p, 1]);
}

export function createActorModels(renderer) {
  const dry = pedestrian(false), rainy = pedestrian(true), dummy = pedestrian(false, true);
  const limbs = {};
  for (const [key, radius, depth, fill] of [
    ['coat', 0.207, 0.119, '#c4bdb0'], ['neck', 0.068, 0.071, '#a69a89'],
    ['arm', 0.072, 0.068, '#b8b0a5'], ['leg', 0.087, 0.081, '#4b4e54'], ['head', 0.113, 0.117, '#d9b99a'],
  ]) {
    const mesh = new Mesh();
    mesh.sphere(0, key === 'head' ? 0 : 0.5, 0, radius, key === 'head' ? 0.138 : 0.63, depth, fill, 7, 4);
    limbs[key] = mesh;
  }
  for (const mesh of [dry, rainy, dummy, ...Object.values(limbs)]) renderer.upload(mesh);
  return function walkObjects(actors, car, wet) {
    return actors.filter(actor => Math.hypot(actor.x - car.x, actor.z - car.z) < 58).flatMap(actor => {
      const { x, y, z } = actor;
      const tint = color(actor.tint).map(channel => (actor.dummy ? 0.34 : 0.62) + channel * 0.51);
      if (actor.rig) {
        const nodes = actor.rig.nodes.map(node => node.position);
        const bounds = { minX: x - 1.9, maxX: x + 1.9, minY: y - 1.9, maxY: y + 1.9, minZ: z - 1.9, maxZ: z + 1.9 };
        const objects = ragdollSegments.map(([a, b, style]) => ({
          mesh: limbs[style], model: boneTransform(nodes[a], nodes[b]), bounds,
          tint: style === 'coat' || style === 'arm' || actor.dummy ? tint : undefined,
        }));
        objects.push({ mesh: limbs.head, model: transform(nodes[2][0], nodes[2][2], 0, nodes[2][1]), bounds,
          tint: actor.dummy ? tint : undefined });
        return objects;
      }
      return {
        mesh: actor.dummy ? dummy : wet > 0.5 && actor.umbrella ? rainy : dry,
        model: transform(x, z, actor.heading, y),
        tint,
        stride: actor.moving ? Math.sin(actor.phase) : 0,
        bounds: { minX: x - 0.62, maxX: x + 0.62, minY: y, maxY: y + 2, minZ: z - 0.62, maxZ: z + 0.62 },
      };
    });
  };
}
