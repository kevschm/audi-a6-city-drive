import { clamp, lerp, mixAngle } from '../render/math.js';

export const cameraNames = ['Verfolger', 'Schrägansicht', 'Motorhaube', 'Frontansicht', 'Frei', 'Cockpit'];
export const ORBIT_MODE = 4;
export const COCKPIT_MODE = 5;

function cameraClearance(x, z, dx, dz, obstacles) {
  let nearest = 1;
  for (const { x0, x1, z0, z1 } of obstacles) {
    // Slab intersection from the vehicle to the desired eye.
    if (Math.abs(dx) < 1e-6 && (x < x0 - 0.36 || x > x1 + 0.36)) continue;
    if (Math.abs(dz) < 1e-6 && (z < z0 - 0.36 || z > z1 + 0.36)) continue;
    const tx0 = (x0 - 0.36 - x) / (dx || 1e-6), tx1 = (x1 + 0.36 - x) / (dx || 1e-6);
    const tz0 = (z0 - 0.36 - z) / (dz || 1e-6), tz1 = (z1 + 0.36 - z) / (dz || 1e-6);
    const near = Math.max(Math.min(tx0, tx1), Math.min(tz0, tz1));
    const far = Math.min(Math.max(tx0, tx1), Math.max(tz0, tz1));
    if (near >= 0 && near <= far && near < nearest) nearest = near;
  }
  return Math.max(0.06, nearest - (nearest < 1 ? 0.05 : 0));
}

export function createCamera() {
  let heading, clearance, speed, height, fieldOfView;

  function update(car, mode, dt, obstacles, orbit) {
    if (mode === COCKPIT_MODE) {
      const s = Math.sin(car.heading), c = Math.cos(car.heading);
      const x = car.x - 0.40 * c, z = car.z + 0.40 * s;
      return {
        eye: [x - 0.12 * s, 1.302 + car.heave, z - 0.12 * c],
        target: [x + s * 20, 0.99 + car.heave - car.pitch * 7, z + c * 20],
        fov: 61 * Math.PI / 180,
      };
    }
    if (mode === ORBIT_MODE) {
      const angle = car.heading + orbit.azimuth;
      const flatDistance = orbit.distance * Math.cos(orbit.elevation);
      const dx = -Math.sin(angle) * flatDistance, dz = -Math.cos(angle) * flatDistance;
      const rise = Math.sin(orbit.elevation) * orbit.distance;
      const maxDistance = cameraClearance(car.x, car.z, dx, dz, obstacles);
      clearance = clearance === undefined ? maxDistance : Math.min(maxDistance, lerp(clearance, maxDistance, 1 - Math.exp(-dt * 7)));
      const target = [car.x, 0.85 + car.heave, car.z];
      return {
        eye: [car.x + dx * clearance, target[1] + Math.max(0.36, rise * clearance), car.z + dz * clearance],
        target, fov: 51 * Math.PI / 180,
      };
    }
    const hood = mode === 2;
    speed = speed === undefined ? Math.abs(car.speed) : lerp(speed, Math.abs(car.speed), 1 - Math.exp(-dt * 3.8));
    heading = heading === undefined || hood ? car.heading : mixAngle(heading, car.heading, 1 - Math.exp(-dt * (5 + speed * 0.09)));
    const s = Math.sin(heading), c = Math.cos(heading);
    const back = [7.05 + Math.min(speed * 0.062, 2.5), 5.65, -1.18, -5.45][mode];
    const side = [-0.83, -6.4, 0, -4.25][mode];
    const dx = c * side - s * back, dz = -s * side - c * back;
    const maxDistance = hood ? 1 : cameraClearance(car.x, car.z, dx, dz, obstacles);
    clearance = clearance === undefined ? maxDistance : Math.min(maxDistance, lerp(clearance, maxDistance, 1 - Math.exp(-dt * 4)));
    const base = [2.72 + Math.min(speed * 0.011, 0.42), 4.45, 1.37, 2.4][mode];
    const elevation = base + (hood ? car.heave - car.pitch * 1.18 : 0.68 * car.heave);
    height = height === undefined || hood ? elevation : lerp(height, elevation, 1 - Math.exp(-dt * 4.4));
    const eye = [car.x + dx * clearance, height + (hood ? 0 : (1 - clearance) * 0.5), car.z + dz * clearance];
    const ahead = [3.20 + speed * 0.06, 1.0, 27, 0.15][mode];
    const turn = mode === 0 ? clamp(car.yaw || 0, -0.7, 0.7) * Math.min(speed * 0.027, 0.66) : 0;
    const target = [car.x + s * ahead + c * turn, (hood ? 1.54 - car.pitch * 3.8 : mode === 0 ? 0.69 : 0.94) + car.heave, car.z + c * ahead - s * turn];
    const fov = ([51 + Math.min(speed * 0.21, 7), 52, 64, 55][mode]) * Math.PI / 180;
    fieldOfView = fieldOfView === undefined ? fov : lerp(fieldOfView, fov, 1 - Math.exp(-dt * 3.2));
    return { eye, target, fov: fieldOfView };
  }

  return { update, reset() { heading = clearance = speed = height = fieldOfView = undefined; } };
}
