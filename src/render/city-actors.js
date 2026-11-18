import { color, Mesh } from './mesh.js';
import { transform } from './math.js';

function pedestrian(withUmbrella) {
  const mesh = new Mesh();
  mesh.sphere(0, 1.53, 0.015, 0.119, 0.142, 0.112, '#dcc1a3', 9, 5);
  mesh.sphere(0, 1.595, -0.022, 0.115, 0.095, 0.113, '#382f2a', 9, 4);
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
  return mesh;
}

export function createActorModels(renderer) {
  const dry = pedestrian(false), rainy = pedestrian(true);
  renderer.upload(dry);
  renderer.upload(rainy);
  return function walkObjects(actors, car, wet) {
    return actors.filter(actor => Math.hypot(actor.x - car.x, actor.z - car.z) < 58).map(actor => {
      const { x, y, z } = actor;
      return {
        mesh: wet > 0.5 && actor.umbrella ? rainy : dry,
        model: transform(x, z, actor.heading, y),
        tint: color(actor.tint).map(channel => 0.62 + channel * 0.49),
        stride: actor.moving ? Math.sin(actor.phase) : 0,
        bounds: { minX: x - 0.62, maxX: x + 0.62, minY: y, maxY: y + 2, minZ: z - 0.62, maxZ: z + 0.62 },
      };
    });
  };
}
