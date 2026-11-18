import { Mesh } from './mesh.js';

export function createLabModels(renderer) {
  const landscape = new Mesh();
  landscape.quad([-500, -0.027, -500], [-500, -0.027, 500], [500, -0.027, 500], [500, -0.027, -500], '#817d66', 'grass');
  landscape.quad([-18, 0, -49], [-18, 0, 49], [18, 0, 49], [18, 0, -49], '#53585b', 'asphalt');
  for (const x of [-14.5, -2.1, 2.1, 14.5]) {
    landscape.box(x - 0.027, 0, -45, x + 0.027, 0.004, 45, '#d0c698');
  }
  for (let z = -40; z <= 42; z += 2) for (const x of [-2.4, 2.4]) {
    landscape.box(x - 0.47, 0, z - 0.032, x + 0.47, 0.004, z + 0.032, '#d8cab2');
  }
  for (const x of [-16.6, 16.6]) {
    landscape.box(x - 0.84, 0, -46, x + 0.84, 0.03, 46, '#77766c', 'paving');
    for (let z = -40; z <= 40; z += 20) {
      landscape.box(x - 0.055, 0.02, z - 0.055, x + 0.055, 7.4, z + 0.055, '#3b484c', 'metal');
      landscape.box(x - 0.39, 7.29, z - 0.11, x + 0.39, 7.52, z + 0.11, '#535751', 'metal');
    }
  }
  for (const x of [-26, 26]) for (const z of [-29, 12, 44]) {
    landscape.box(x - 6, 0, z - 10, x + 6, 5.0, z + 10, z === 12 ? '#556269' : '#a19b82', 'plaster');
    for (let i = -9; i <= 9; i += 2) {
      landscape.box(x - 6.06, 1, z + i, x + 6.06, 4.9, z + i + 0.06, '#535955', 'metal');
    }
  }
  renderer.upload(landscape);
  const obstacleModels = new Map();

  function chunks(obstacles) {
    return obstacles.map(({ x0, x1, z0, z1 }) => {
      const key = [x0, x1, z0, z1].join(',');
      if (obstacleModels.has(key)) return obstacleModels.get(key);
      const mesh = new Mesh();
      const tall = x1 - x0 <= 12 && z1 - z0 > 1;
      const height = tall ? 1.52 : 0.64;
      mesh.box(x0, 0, z0, x1, height, z1, '#b4ae9b', 'paving');
      if (tall) {
        for (let i = 0; i * 0.54 < x1 - x0; i++) {
          if (i % 2 === 0) continue;
          const x = x0 + i * 0.54, end = Math.min(x + 0.54, x1);
          mesh.box(x, 0.63, z0 - 0.008, end, 1.41, z1 + 0.008, '#7b5126');
        }
        mesh.box(x0, 0.015, z0 - 0.013, x1, 0.47, z1 + 0.013, '#6d7067', 'metal');
      }
      renderer.upload(mesh);
      const chunk = { mesh, minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: 0, maxY: height };
      obstacleModels.set(key, chunk);
      return chunk;
    });
  }

  return { landscape, chunks };
}
