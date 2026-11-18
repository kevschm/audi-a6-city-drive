const limit = 72;

export function createImpactEffects(random = Math.random) {
  const items = [];
  const vertices = new Float32Array(limit * 6);
  let trail = 0, exhaust = 0, steam = 0;

  function add(item) {
    if (items.length === limit) items.shift();
    items.push({ age: 0, ...item });
  }

  function emit(impact) {
    const { x, z, nx, nz, closingSpeed, scrapeSpeed } = impact;
    const height = impact.y ?? (impact.wheelChange > 0.10 ? 0.18 : 0.35);
    const hard = !['wood', 'plastic'].includes(impact.material);
    const sparks = hard ? Math.round(Math.min(18, (Math.max(0, closingSpeed - 3) + scrapeSpeed * 0.65) * 1.2)) : 0;
    const dust = Math.round(Math.min(9, closingSpeed * 0.55));
    for (let i = 0; i < sparks + dust; i++) {
      const hot = i < sparks;
      const lateral = (random() - 0.5) * 7;
      const rebound = 1.1 + random() * 2.8;
      const life = hot ? 0.22 + random() * 0.38 : 0.6 + random() * 0.62;
      add({
        x: x + nx * 0.16, z: z + nz * 0.16, y: height + random() * 0.26,
        vx: nx * rebound - nz * lateral, vz: nz * rebound + nx * lateral,
        vy: hot ? 0.65 + random() * 2.5 : random() * 0.42,
        life, type: hot ? 1 : 0, size: hot ? 0.043 : 0.19,
      });
    }
    if (impact.glassBreak) for (let i = 0; i < 12; i++) add({
      x: x + nx * 0.35, y: (impact.y ?? 1.05) + random() * 0.23, z: z + nz * 0.35,
      vx: nx * 2.8 + (random() - 0.5) * 5, vy: 0.5 + random() * 2.6, vz: nz * 2.8 + (random() - 0.5) * 4,
      life: 0.36 + random() * 0.40, type: 0.82, size: 0.034,
    });
  }

  function trailAt(car, across, forward, height, type, life, size, drift = 0) {
    const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
    add({
      x: car.x + cos * across + sin * forward,
      z: car.z - sin * across + cos * forward,
      y: Math.max(0.09, height + car.heave),
      vx: car.vx * drift + cos * (random() - 0.5) * 0.69,
      vz: car.vz * drift - sin * (random() - 0.5) * 0.69,
      vy: type === 0.58 ? 0.18 : 0.43 + random() * 0.23,
      life, type, size,
    });
  }

  function drive(car, dt, wet, low) {
    if (car.lateralTest) return;
    const speed = Math.abs(car.speed);
    const grounds = car.surface !== 'asphalt';
    const skid = Math.max(0, (car.skid || 0) - 0.33);
    trail += dt * (low ? 0.55 : 1) * Math.min(20, wet * speed * 0.79 + skid * 15 + (grounds ? speed * 0.50 : 0));
    if (trail >= 1) {
      trail -= 1;
      trailAt(car, random() < 0.5 ? -0.76 : 0.76, -1.31, 0.13,
        wet > 0.4 ? 0.58 : grounds ? 0 : 0.35, 0.50 + random() * 0.43, 0.17, 0.19);
    }
    exhaust += car.mechanical?.stalled ? 0 : dt * (low ? 1.8 : 3.6) * (0.45 + (car.throttle || 0) * 1.15) / (1 + speed * 0.035);
    if (exhaust >= 1) {
      exhaust -= 1;
      trailAt(car, -0.56, -2.47, 0.29, 0.35, 0.62, 0.11, 0.06);
    }
    const leak = Math.max(car.damage[0] - 0.48, (car.mechanical?.cooling ?? 0) * 0.67);
    steam += dt * leak * (low ? 9 : 19);
    if (steam >= 1) {
      steam -= 1;
      trailAt(car, -0.16 + random() * 0.34, 1.72, 0.86, 0.35, 1.13, 0.19, 0.16);
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
      if (item.type >= 0.8) item.vy -= 9.81 * dt;
      else { item.vx *= 0.91; item.vz *= 0.91; }
    }
  }

  function view() {
    let offset = 0;
    for (const item of items) {
      const life = 1 - item.age / item.life;
      vertices[offset++] = item.x;
      vertices[offset++] = item.y;
      vertices[offset++] = item.z;
      vertices[offset++] = item.size + item.age * (item.type >= 0.8 ? 0 : 0.49);
      vertices[offset++] = life;
      vertices[offset++] = item.type;
    }
    return vertices.subarray(0, offset);
  }

  return { emit, step, drive, view, clear() { items.length = 0; trail = exhaust = steam = 0; } };
}
