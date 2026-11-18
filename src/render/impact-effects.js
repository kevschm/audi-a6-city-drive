const limit = 72;

export function createImpactEffects() {
  const items = [];
  const vertices = new Float32Array(limit * 6);

  function emit(impact) {
    const { x, z, nx, nz, closingSpeed, scrapeSpeed } = impact;
    const sparks = Math.round(Math.min(20, (closingSpeed + scrapeSpeed * 0.65) * 1.25));
    const dust = Math.round(Math.min(9, closingSpeed * 0.55));
    for (let i = 0; i < sparks + dust; i++) {
      const hot = i < sparks;
      const lateral = (Math.random() - 0.5) * 7;
      const rebound = 1.1 + Math.random() * 2.8;
      const life = hot ? 0.22 + Math.random() * 0.38 : 0.6 + Math.random() * 0.62;
      if (items.length === limit) items.shift();
      items.push({
        x: x + nx * 0.16, z: z + nz * 0.16, y: 0.35 + Math.random() * 0.26,
        vx: nx * rebound - nz * lateral, vz: nz * rebound + nx * lateral,
        vy: hot ? 0.65 + Math.random() * 2.5 : Math.random() * 0.42,
        life, age: 0, hot,
      });
    }
  }

  function step(dt) {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      item.age += dt;
      if (item.age >= item.life) { items.splice(i, 1); continue; }
      item.x += item.vx * dt;
      item.z += item.vz * dt;
      item.y = Math.max(0.045, item.y + item.vy * dt);
      if (item.hot) item.vy -= 8.2 * dt;
      else { item.vx *= 0.91; item.vz *= 0.91; }
    }
  }

  function view() {
    let offset = 0;
    for (const item of items) {
      const life = 1 - item.age / item.life;
      vertices.set([item.x, item.y, item.z, item.hot ? 0.043 : 0.19 + item.age * 0.62, life, item.hot ? 1 : 0], offset);
      offset += 6;
    }
    return vertices.subarray(0, offset);
  }

  return { emit, step, view, clear() { items.length = 0; } };
}
