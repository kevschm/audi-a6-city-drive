// Lateral sled experiment: translation of the centre of mass in X/Y and
// rotation about the longitudinal axis. The car enters sideways on locked
// wheels. Wheel edges, sills and roof rails supply unilateral contact points.
export const tripHeight = .24;
const cg = .56, inertia = 730;
const outline = [[-.76,0],[.76,0],[-.86,.20],[.86,.20],[-.87,.64],[.87,.64],
  [-.81,1.05],[.81,1.05],[-.66,1.40],[.66,1.40],[-.48,1.44],[.48,1.44]];

export function stepRollover(car, dt) {
  const state = car.sled ??= { x: car.x, y: cg, vy: 0, omega: 0, roofWork: 0 };
  car.impact = null;
  car.collisionImpact = 0;
  const sub = dt / 6;
  for (let k = 0; k < 6; k++) {
    const lastX = state.x, lastRoll = car.roll, oldCos = Math.cos(lastRoll), oldSin = Math.sin(lastRoll);
    state.vy -= 9.81 * sub;
    state.x += car.vx * sub;
    state.y += state.vy * sub;
    car.roll += state.omega * sub;
    const c = Math.cos(car.roll), s = Math.sin(car.roll);
    for (let j = 0; j < outline.length; j++) {
      const [lx, y] = outline[j], roof = y > 1.3;
      const ly = y - cg - (roof ? car.roofCrush[lx < 0 ? 0 : 1] : 0);
      const rx = c * lx - s * ly, ry = s * lx + c * ly;
      const px = state.x + rx, py = state.y + ry;
      const crossedLip = px >= 0 && lastX + oldCos * lx - oldSin * ly <= .0001 && py < tripHeight - .003;
      let nx = 0, ny = 1, depth = (px >= 0 ? tripHeight : 0) - py;
      if (crossedLip) { nx = -1; ny = 0; depth = px; }
      if (Math.abs(px) >= 17.5) { nx = -Math.sign(px); ny = 0; depth = Math.abs(px) - 17.5; }
      if (depth < 0) continue;
      state.x += nx * depth; state.y += ny * depth;
      const arm = rx * ny - ry * nx;
      const approach = -(nx * car.vx + ny * state.vy + arm * state.omega);
      if (approach <= 0) continue;
      const eff = 1 / (1 / car.mass + arm * arm / inertia);
      const restitution = approach > 2 ? .08 : 0;
      const impulse = (1 + restitution) * approach * eff;
      const initialSpeed = Math.hypot(car.vx, state.vy);
      const tx = -ny, ty = nx, lever = rx * ty - ry * tx;
      const slip = tx * car.vx + ty * state.vy + lever * state.omega;
      const after = slip + impulse * arm * lever / inertia;
      const friction = Math.max(-.63 * impulse, Math.min(.63 * impulse, -after / (1 / car.mass + lever * lever / inertia)));
      car.vx += (nx * impulse + tx * friction) / car.mass;
      state.vy += (ny * impulse + ty * friction) / car.mass;
      state.omega += (arm * impulse + lever * friction) / inertia;
      if (approach < 1.75) continue;
      const energy = .5 * eff * approach ** 2 * (1 - restitution ** 2);
      const side = lx < 0 ? 0 : 1, area = 2 + side;
      const change = Math.min(.68, energy / 145_000);
      const glassBefore = car.glass[area];
      if (roof) {
        state.roofWork += energy;
        car.roofCrush[side] = Math.min(.25, car.roofCrush[side] + energy / 410_000);
        car.glass[area] = Math.min(1, glassBefore + energy / 65_000);
        for (let i = 0; i < 3; i++) car.sideGlass[side * 3 + i] = car.glass[area];
      } else if (y < .3) {
        for (const wheel of [side, side + 2]) car.wheelDamage[wheel] += (1 - car.wheelDamage[wheel]) * change;
      }
      car.damage[area] += (1 - car.damage[area]) * change;
      if (!car.impact || car.impact.energy < energy) {
        const deltaV = Math.hypot(impulse, friction) / car.mass;
        car.impact = { area, x: px, z: car.z, y: py, nx, nz: 0, localX: lx, localZ: 0, material:'concrete',
          energy, change, impactSpeed: initialSpeed, closingSpeed: approach, scrapeSpeed: Math.abs(slip),
          angle: Math.atan2(Math.abs(slip), approach) * 180 / Math.PI, stepG: deltaV / (9.81 * dt), deltaV,
          wheelChange: 0, detached: -1, glassBreak: glassBefore < .72 && car.glass[area] >= .72, roof };
        car.collisionImpact = deltaV;
      }
    }
  }
  car.km += Math.abs(car.vx) * dt / 1000;
  car.x = state.x + cg * Math.sin(car.roll);
  car.heave = state.y - cg * Math.cos(car.roll);
  car.rollRate = state.omega;
  car.speed = Math.abs(car.vx);
}
