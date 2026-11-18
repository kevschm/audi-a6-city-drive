import { CONTACT_MATERIALS, solveContact } from './contact-impulse.js';
import { detachableParts } from './vehicle-damage.js';

const propTypes = {
  cone: { mass: 5, radius: 0.21, floor: 0.25, material: 'plastic' },
  drum: { mass: 44, radius: 0.36, floor: 0.44, material: 'steel' },
  crate: { mass: 28, radius: 0.53, floor: 0.39, material: 'wood' },
};
const MAX_DEBRIS = 8;

export function createPropWorld(groundHeightAt, obstacles, bounds) {
  const bodies = [];

  function reset(spawns) {
    bodies.length = 0;
    for (const spawn of spawns) {
      const spec = propTypes[spawn.kind];
      bodies.push({ ...spec, ...spawn, y: groundHeightAt(spawn.x, spawn.z) + spec.floor,
        inertia: spec.mass * spec.radius ** 2 * 0.65, vx: 0, vy: 0, vz: 0, yaw: 0, heading: 0,
        pitch: 0, tumble: 0, clearance: 0, asleep: true });
    }
  }

  function detach(car, impact) {
    const spec = detachableParts[impact.detached];
    if (!spec || bodies.filter(body => body.debris).length >= MAX_DEBRIS) return;
    const sin = Math.sin(car.heading), cos = Math.cos(car.heading);
    bodies.push({ ...spec, debris: true, asleep: false, clearance: 0.36, pitch: 0,
      x: car.x + cos * spec.x + sin * spec.z - impact.nx * 0.05,
      z: car.z - sin * spec.x + cos * spec.z - impact.nz * 0.05, y: car.heave + spec.y,
      vx: car.vx * 0.64 + impact.nx * impact.closingSpeed * 0.13,
      vz: car.vz * 0.64 + impact.nz * impact.closingSpeed * 0.13,
      vy: Math.min(3.7, 0.45 + impact.closingSpeed * 0.08),
      yaw: car.yaw * 0.55 + impact.localX * 2, heading: car.heading,
      tumble: Math.min(7, 1.4 + impact.closingSpeed * 0.20), inertia: spec.mass * spec.radius ** 2 * 0.65 });
  }

  function advance(body, dt) {
    const r = body.radius;
    body.clearance = Math.max(0, body.clearance - dt);
    if (body.asleep) return;
    body.vy -= 9.81 * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    body.z += body.vz * dt;
    body.heading += body.yaw * dt;
    body.pitch += body.tumble * dt;
    for (const wall of obstacles) {
      if (body.x + r <= wall.x0 || body.x - r >= wall.x1 || body.z + r <= wall.z0 || body.z - r >= wall.z1) continue;
      const left = body.x + r - wall.x0, right = wall.x1 - body.x + r;
      const back = body.z + r - wall.z0, front = wall.z1 - body.z + r;
      const nearest = Math.min(left, right, back, front);
      if (nearest === left || nearest === right) {
        const sign = nearest === left ? -1 : 1;
        body.x += sign * nearest;
        if (body.vx * sign < 0) body.vx *= -0.28;
      } else {
        const sign = nearest === back ? -1 : 1;
        body.z += sign * nearest;
        if (body.vz * sign < 0) body.vz *= -0.28;
      }
    }
    if (Math.abs(body.x) > bounds - r) { body.x = Math.sign(body.x) * (bounds - r); body.vx *= -0.33; }
    if (Math.abs(body.z) > bounds - r) { body.z = Math.sign(body.z) * (bounds - r); body.vz *= -0.33; }
    const ground = groundHeightAt(body.x, body.z) + body.floor;
    if (body.y <= ground) {
      body.y = ground;
      body.vy = body.vy < -0.65 ? -body.vy * 0.26 : 0;
      const drag = Math.exp(-dt * (body.kind === 'drum' ? 1.7 : 3.1));
      body.vx *= drag;
      body.vz *= drag;
      body.yaw *= drag;
      body.tumble *= drag;
      if (Math.hypot(body.vx, body.vz) < 0.095 && Math.abs(body.tumble) + Math.abs(body.yaw) < 0.13 && body.vy === 0) {
        body.asleep = true;
        body.vx = body.vz = body.yaw = body.tumble = 0;
      }
    }
  }

  function collideBodies() {
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      if ((a.asleep && b.asleep) || a.clearance || b.clearance || Math.abs(a.y - b.y) > a.floor + b.floor) continue;
      const dx = a.x - b.x, dz = a.z - b.z;
      const radii = a.radius + b.radius;
      if (Math.abs(dx) >= radii || Math.abs(dz) >= radii) continue;
      const distance = Math.hypot(dx, dz);
      if (distance >= radii) continue;
      const nx = distance > 0.001 ? dx / distance : 1;
      const nz = distance > 0.001 ? dz / distance : 0;
      const contact = solveContact(a, b, nx, nz, b.x + nx * b.radius, b.z + nz * b.radius, CONTACT_MATERIALS[b.material]);
      const fractionA = b.mass / (a.mass + b.mass);
      const correction = (radii - distance) * 0.66;
      a.x += nx * correction * fractionA;
      a.z += nz * correction * fractionA;
      b.x -= nx * correction * (1 - fractionA);
      b.z -= nz * correction * (1 - fractionA);
      if (!contact.normalImpulse) continue;
      a.asleep = b.asleep = false;
      a.vx += contact.ix / a.mass; a.vz += contact.iz / a.mass; a.yaw += contact.aYaw;
      b.vx -= contact.ix / b.mass; b.vz -= contact.iz / b.mass; b.yaw += contact.bYaw;
      b.tumble += Math.min(5, contact.closingSpeed * 0.23);
    }
  }

  function step(dt) {
    let maxMotion = 0;
    for (const body of bodies) {
      if (!body.asleep) maxMotion = Math.max(maxMotion, Math.hypot(body.vx, body.vz) * dt);
    }
    const substeps = Math.max(1, Math.min(5, Math.ceil(maxMotion / 0.19)));
    for (let i = 0; i < substeps; i++) {
      for (const body of bodies) advance(body, dt / substeps);
      collideBodies();
    }
  }

  return { bodies, reset, detach, step };
}
