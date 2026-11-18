import { applyImpact, createDamageState } from './vehicle-damage.js';
import { CONTACT_MATERIALS, solveContact } from './contact-impulse.js';

// The collision envelope includes the bumpers and tires. Mirrors are cosmetic.
const PLAYER_HALF_WIDTH = 0.89;
const PLAYER_HALF_LENGTH = 2.40;
export const TRAFFIC_HALF_WIDTH = 0.91;
export const TRAFFIC_HALF_LENGTH = 2.15;
const SWEEP_STEP = 0.38;
const limit = (value, max) => Math.max(-max, Math.min(max, value));
const fixedBody = { x: 0, z: 0, mass: Infinity, inertia: Infinity, vx: 0, vz: 0, yaw: 0 };

function rectangle(x, z, heading, halfWidth, halfLength) {
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  return {
    x, z, sin, cos, halfWidth, halfLength,
    spanX: halfWidth * Math.abs(cos) + halfLength * Math.abs(sin),
    spanZ: halfWidth * Math.abs(sin) + halfLength * Math.abs(cos),
  };
}

function projectedHalfSpan(shape, x, z) {
  return shape.halfWidth * Math.abs(x * shape.cos - z * shape.sin) +
    shape.halfLength * Math.abs(x * shape.sin + z * shape.cos);
}

// Clip the rectangle to a thin layer behind its supporting face. A corner
// touching at an angle exposes a narrow patch even beside a very wide wall.
function faceInterval(shape, nx, nz, direction, depth) {
  const tx = -nz, tz = nx;
  const corners = [[-1,-1], [1,-1], [1,1], [-1,1]].map(([sx, sz]) => {
    const x = shape.x + sx * shape.halfWidth * shape.cos + sz * shape.halfLength * shape.sin;
    const z = shape.z - sx * shape.halfWidth * shape.sin + sz * shape.halfLength * shape.cos;
    return [direction * (x * nx + z * nz), x * tx + z * tz];
  });
  const support = Math.max(...corners.map(p => p[0]));
  const plane = support - Math.min(.10, .035 + depth);
  const points = [];
  for (let i = 0; i < 4; i++) {
    const [da, ta] = corners[i], [db, tb] = corners[(i + 1) % 4];
    if (da >= plane) points.push(ta);
    if ((da < plane) !== (db < plane)) points.push(ta + (tb - ta) * (plane - da) / (db - da));
  }
  return { min: Math.min(...points), max: Math.max(...points), support: support * direction };
}

function overlap(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  if (Math.abs(dx) >= a.spanX + b.spanX || Math.abs(dz) >= a.spanZ + b.spanZ) return null;

  // A separating axis can be normal to a side of either rectangle.
  const axes = [a.cos, -a.sin, a.sin, a.cos, b.cos, -b.sin, b.sin, b.cos];
  let depth = Infinity, nx = 0, nz = 0;
  for (let i = 0; i < axes.length; i += 2) {
    const x = axes[i], z = axes[i + 1];
    const candidate = projectedHalfSpan(a, x, z) + projectedHalfSpan(b, x, z) - Math.abs(dx * x + dz * z);
    if (candidate <= 0) return null;
    if (candidate < depth) {
      const side = dx * x + dz * z < 0 ? -1 : 1;
      depth = candidate;
      nx = x * side;
      nz = z * side;
    }
  }
  const aa = faceInterval(a, nx, nz, -1, depth), bb = faceInterval(b, nx, nz, 1, depth);
  const lo = Math.max(aa.min, bb.min), hi = Math.min(aa.max, bb.max);
  const tangent = (lo + hi) / 2, normal = (aa.support + bb.support) / 2;
  return { depth, nx, nz, contactWidth: Math.max(.035, hi - lo),
    cx: normal * nx - tangent * nz, cz: normal * nz + tangent * nx };
}

function trafficRectangle(actor) {
  return rectangle(actor.x, actor.z, actor.heading ?? 0, actor.halfWidth ?? TRAFFIC_HALF_WIDTH, actor.halfLength ?? TRAFFIC_HALF_LENGTH);
}

export function vehicleOverlapsTraffic(vehicle, actor) {
  const body = rectangle(vehicle.x, vehicle.z, vehicle.heading, PLAYER_HALF_WIDTH, PLAYER_HALF_LENGTH);
  return overlap(body, trafficRectangle(actor)) !== null;
}

function impactPoint(pose, hit, width, length) {
  const { x, z, heading } = pose;
  const sin = Math.sin(heading), cos = Math.cos(heading);
  if (hit.cx !== undefined) {
    const dx = hit.cx - x, dz = hit.cz - z;
    const localX = limit(dx * cos - dz * sin, width), localZ = limit(dx * sin + dz * cos, length);
    return { x: x + localX * cos + localZ * sin, z: z - localX * sin + localZ * cos, localX, localZ };
  }
  const preferredX = (hit.targetX ?? x) - x, preferredZ = (hit.targetZ ?? z) - z;
  const lateral = -hit.nx * cos + hit.nz * sin;
  const longitudinal = -hit.nx * sin - hit.nz * cos;
  const localX = Math.abs(lateral) > 0.075
    ? Math.sign(lateral) * width
    : limit(preferredX * cos - preferredZ * sin, width);
  const localZ = Math.abs(longitudinal) > 0.075
    ? Math.sign(longitudinal) * length
    : limit(preferredX * sin + preferredZ * cos, length);
  return { x: x + cos * localX + sin * localZ, z: z - sin * localX + cos * localZ, localX, localZ };
}

function contactAt(vehicle, width, length, x, z, heading, { obstacles = [], traffic = [], props = [], bounds = 238 }) {
  const body = rectangle(x, z, heading, width, length);
  const xOverflow = Math.abs(x) + body.spanX - bounds;
  const zOverflow = Math.abs(z) + body.spanZ - bounds;
  if (xOverflow > 0 || zOverflow > 0) {
    return xOverflow > zOverflow
      ? { depth: xOverflow, nx: -Math.sign(x), nz: 0 }
      : { depth: zOverflow, nx: 0, nz: -Math.sign(z) };
  }
  for (const obstacle of obstacles) {
    if (x + body.spanX <= obstacle.x0 || x - body.spanX >= obstacle.x1 ||
        z + body.spanZ <= obstacle.z0 || z - body.spanZ >= obstacle.z1) continue;
    const centerX = (obstacle.x0 + obstacle.x1) * 0.5;
    const centerZ = (obstacle.z0 + obstacle.z1) * 0.5;
    const halfWidth = (obstacle.x1 - obstacle.x0) * 0.5;
    const halfLength = (obstacle.z1 - obstacle.z0) * 0.5;
    const hit = overlap(body, rectangle(centerX, centerZ, 0, halfWidth, halfLength));
    if (hit) return { ...hit, material: obstacle.material, targetX: Math.max(obstacle.x0, Math.min(obstacle.x1, x)), targetZ: Math.max(obstacle.z0, Math.min(obstacle.z1, z)) };
  }
  for (const actor of traffic) {
    // Avoid trigonometry for lanes far from the player.
    if (actor === vehicle || Math.abs(actor.x - x) > 5 || Math.abs(actor.z - z) > 5) continue;
    const hit = overlap(body, trafficRectangle(actor));
    if (hit) return { ...hit, targetX: actor.x, targetZ: actor.z, actor, material: 'car' };
  }
  for (const prop of props) {
    if (prop.clearance > 0 || prop.y - prop.floor > 0.92 ||
        Math.abs(prop.x - x) > body.spanX + prop.radius || Math.abs(prop.z - z) > body.spanZ + prop.radius) continue;
    const hit = overlap(body, rectangle(prop.x, prop.z, 0, prop.radius, prop.radius));
    if (hit) return { ...hit, targetX: prop.x, targetZ: prop.z, prop, material: prop.material };
  }
  return null;
}

export function moveVehicle(vehicle, dt, world) {
  const { x, z, heading } = vehicle;
  const width = vehicle.halfWidth ?? PLAYER_HALF_WIDTH, length = vehicle.halfLength ?? PLAYER_HALF_LENGTH;
  const dx = vehicle.vx * dt, dz = vehicle.vz * dt, turn = vehicle.yaw * dt;
  const distance = Math.hypot(dx, dz);
  if (distance + Math.abs(turn) < 1e-9) return;
  const steps = Math.max(1, Math.ceil((distance + Math.abs(turn) * Math.hypot(width, length)) / SWEEP_STEP));

  // A traffic vehicle or a relocated obstacle can already be overlapping the
  // player. Permit escape while overlap with that contact is decreasing.
  const at = fraction => contactAt(vehicle, width, length, x + dx * fraction, z + dz * fraction, heading + turn * fraction, world);
  const initial = at(0);
  const blockingContact = (fraction) => {
    const hit = at(fraction);
    if (initial && hit && initial.nx * hit.nx + initial.nz * hit.nz > 0.99 && hit.depth < initial.depth) return null;
    return hit;
  };
  let allowed = 0;
  for (let step = 1; step <= steps; step++) {
    const candidate = step / steps;
    let hit = blockingContact(candidate);
    if (!hit) {
      allowed = candidate;
      continue;
    }

    // Resolve up to the last clear pose before changing the motion. Retain
    // tangent velocity so a shallow scrape doesn't bounce the whole car back.
    let blocked = candidate;
    for (let i = 0; i < 8; i++) {
      const middle = (allowed + blocked) * 0.5;
      const next = blockingContact(middle);
      if (next) {
        blocked = middle;
        hit = next;
      } else {
        allowed = middle;
      }
    }
    const pose = { x: x + dx * allowed, z: z + dz * allowed, heading: heading + turn * allowed };
    const point = impactPoint(pose, hit, width, length);
    const actor = hit.actor, prop = hit.prop;
    const peer = actor || prop;
    const materialName = hit.material || 'concrete';
    const material = CONTACT_MATERIALS[materialName];
    const other = actor ? {
      x: actor.x, z: actor.z, mass: actor.mass ?? 1420, inertia: actor.inertia ?? 2180,
      vx: actor.vx ?? (actor.speed || 0) * Math.sin(actor.heading || 0),
      vz: actor.vz ?? (actor.speed || 0) * Math.cos(actor.heading || 0), yaw: actor.yaw ?? 0,
    } : prop || fixedBody;
    const impact = solveContact({ ...pose, vx: vehicle.vx, vz: vehicle.vz, yaw: vehicle.yaw,
      mass: vehicle.mass, inertia: vehicle.inertia }, other, hit.nx, hit.nz, point.x, point.z, material);
    const { ix, iz, aYaw, bYaw, closingSpeed, scrapeSpeed, energy, deltaV } = impact;
    vehicle.vx += ix / vehicle.mass;
    vehicle.vz += iz / vehicle.mass;
    vehicle.yaw += aYaw;
    vehicle.collisionImpact = deltaV;
    const contactWidth = hit.contactWidth ?? width * 2;
    const crushEnergy = energy * material.crushShare;
    if (peer && impact.normalImpulse > 0) {
      if (actor && !actor.wrecked) {
        Object.assign(actor, createDamageState(), { wrecked: true, mass: other.mass, inertia: other.inertia,
          halfWidth: TRAFFIC_HALF_WIDTH, halfLength: TRAFFIC_HALF_LENGTH, km: 0 });
      }
      peer.vx = other.vx - ix / other.mass;
      peer.vz = other.vz - iz / other.mass;
      peer.yaw = other.yaw + bYaw;
      if (actor) {
        const sin = Math.sin(actor.heading), cos = Math.cos(actor.heading);
        const rx = point.x - other.x, rz = point.z - other.z;
        applyImpact(actor, closingSpeed, scrapeSpeed, -hit.nx, -hit.nz, point.x, point.z,
          limit(rx * cos - rz * sin, TRAFFIC_HALF_WIDTH), limit(rx * sin + rz * cos, TRAFFIC_HALF_LENGTH),
          actor.heading, { crushEnergy: energy * (1 - material.crushShare), contactWidth });
      }
      if (prop) {
        prop.asleep = false;
        prop.vy = Math.max(prop.vy, Math.min(3.6, closingSpeed * 0.14));
        prop.tumble += Math.min(6, closingSpeed * 0.29);
        // Let a light object clear the car's footprint during the remaining step.
        const rest = (1 - allowed) * dt;
        prop.x += prop.vx * rest;
        prop.z += prop.vz * rest;
        allowed += (1 - allowed) * Math.max(0, 1 - deltaV / Math.max(0.1, Math.hypot(dx, dz) / dt));
      }
    }
    applyImpact(vehicle, closingSpeed, scrapeSpeed, hit.nx, hit.nz, point.x, point.z, point.localX, point.localZ, pose.heading,
      { ...impact, crushEnergy, contactWidth, material: materialName, stepG: deltaV / (9.81 * dt) });
    break;
  }

  vehicle.x = x + dx * allowed;
  vehicle.z = z + dz * allowed;
  vehicle.heading = heading + turn * allowed;
  vehicle.km += distance * allowed / 1000;
}

export function stepTrafficWrecks(actors, dt, world) {
  for (const actor of actors) {
    if (!actor.wrecked) continue;
    const drag = Math.exp(-dt * 1.55);
    actor.vx *= drag;
    actor.vz *= drag;
    actor.yaw *= Math.exp(-dt * 2.7);
    actor.speed = Math.hypot(actor.vx, actor.vz);
    actor.braking = true;
    if (actor.speed > 0.045 || Math.abs(actor.yaw) > 0.065) moveVehicle(actor, dt, world);
    else actor.vx = actor.vz = actor.yaw = actor.speed = 0;
  }
}
