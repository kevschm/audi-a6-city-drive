import { lerp, mixAngle } from '../render/math.js';

export const cameraNames = ['Verfolger', 'Schrägansicht', 'Motorhaube'];

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
  let heading, clearance;

  function update(car, mode, dt, obstacles) {
    const speed = Math.abs(car.speed);
    heading = heading === undefined ? car.heading : mixAngle(heading, car.heading, 1 - Math.exp(-dt * (mode === 2 ? 18 : 7)));
    const s = Math.sin(heading), c = Math.cos(heading);
    const back = mode === 0 ? 7.2 + Math.min(speed * 0.074, 2.5) : mode === 1 ? 6.4 : -1.85;
    const side = mode === 0 ? -1.1 : mode === 1 ? -6.2 : 0;
    const dx = c * side - s * back, dz = -s * side - c * back;
    const maxDistance = mode === 2 ? 1 : cameraClearance(car.x, car.z, dx, dz, obstacles);
    clearance = clearance === undefined ? maxDistance : Math.min(maxDistance, lerp(clearance, maxDistance, 1 - Math.exp(-dt * 4)));
    const high = mode === 0 ? 2.95 : mode === 1 ? 5.6 : 1.43;
    const eye = [car.x + dx * clearance, high + (mode === 2 ? car.heave - car.pitch * 1.85 : 0), car.z + dz * clearance];
    const ahead = mode === 0 ? 4.1 : mode === 1 ? 2.1 : 27;
    const target = [car.x + s * ahead, mode === 2 ? 1.64 - car.pitch * 6 : 1.03, car.z + c * ahead];
    const fov = (mode === 0 ? 53 + Math.min(speed * 0.22, 8) : mode === 1 ? 56 : 61) * Math.PI / 180;
    return { eye, target, fov };
  }

  return { update, reset() { heading = clearance = undefined; } };
}
