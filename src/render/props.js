import { Mesh } from './mesh.js';
import { transform } from './math.js';

export function createPropModels(renderer) {
  const cone = new Mesh(), drum = new Mesh(), crate = new Mesh();
  cone.box(-0.22, -0.25, -0.22, 0.22, -0.20, 0.22, '#323335');
  const point = (i, r, y) => [Math.cos(i * Math.PI / 6) * r, y, Math.sin(i * Math.PI / 6) * r];
  for (let i = 0; i < 12; i++) for (const [r0, y0, r1, y1, color] of [
    [0.162, -0.20, 0.105, 0.01, '#da602d'],
    [0.105, 0.01, 0.072, 0.119, '#f5ebcd'],
    [0.072, 0.119, 0.037, 0.246, '#f17a33'],
  ]) cone.quad(point(i + 1, r0, y0), point(i, r0, y0), point(i, r1, y1), point(i + 1, r1, y1), color);
  drum.cylY(0, -0.43, 0, 0.35, 0.86, '#b28a34', 16);
  for (const y of [-0.429, -0.19, 0.14, 0.40]) drum.cylY(0, y, 0, 0.36, 0.032, '#5e5738', 16, 'metal');
  drum.cylY(0.17, 0.43, 0, 0.057, 0.022, '#2e3031', 8, 'metal');
  crate.box(-0.39, -0.35, -0.39, 0.39, 0.35, 0.39, '#876241', 'veneer');
  for (const y of [-0.368, 0.28]) crate.box(-0.41, y, -0.41, 0.41, y + 0.105, 0.41, '#b0895a', 'veneer');
  for (const x of [-0.33, 0.33]) crate.box(x - 0.026, -0.29, -0.407, x + 0.026, 0.28, 0.407, '#4e4840');
  for (const z of [-0.394, 0.394]) for (let row = 0; row < 3; row++) {
    crate.box(-0.39, -0.15 + row * 0.132, z - 0.004, 0.39, -0.14 + row * 0.132, z + 0.004, '#58422f');
  }
  const models = { cone, crate, drum };
  for (const mesh of Object.values(models)) renderer.upload(mesh);
  return (bodies, car, far) => {
    const objects = [];
    for (const body of bodies) {
      if (body.debris || Math.abs(body.x - car.x) > far || Math.abs(body.z - car.z) > far) continue;
      const { x, y, z, heading, pitch } = body, r = body.radius + 0.30;
      objects.push({ mesh: models[body.kind], model: transform(x, z, heading, y, 0, pitch), castsShadow: true,
        bounds: { minX: x - r, maxX: x + r, minY: y - r, maxY: y + r, minZ: z - r, maxZ: z + r } });
    }
    return objects;
  };
}
