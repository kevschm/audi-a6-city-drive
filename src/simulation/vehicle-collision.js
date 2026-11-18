import { applyImpact } from './vehicle-damage.js';

// The collision envelope includes the bumpers and tires. Mirrors are cosmetic.
const PLAYER_HALF_WIDTH = 0.89;
const PLAYER_HALF_LENGTH = 2.40;
export const TRAFFIC_HALF_WIDTH = 0.91;
export const TRAFFIC_HALF_LENGTH = 2.15;
const SWEEP_STEP = 0.38;
const MAX_CORNER_RADIUS = Math.hypot(PLAYER_HALF_WIDTH, PLAYER_HALF_LENGTH);
const limit = (value, max) => Math.max(-max, Math.min(max, value));

function rectangle(x, z, heading, halfWidth, halfLength) {
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  return {
    x, z, sin, cos, halfWidth, halfLength,
    spanX: halfWidth * Math.abs(cos) + halfLength * Math.abs(sin),
    spanZ: halfWidth * Math.abs(sin) + halfLength * Math.abs(cos),
  };
}

function axisDepth(a, b, dx, dz, x, z) {
  const span = (shape) => shape.halfWidth * Math.abs(x * shape.cos - z * shape.sin) +
    shape.halfLength * Math.abs(x * shape.sin + z * shape.cos);
  return span(a) + span(b) - Math.abs(dx * x + dz * z);
}

function overlap(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  if (Math.abs(dx) >= a.spanX + b.spanX || Math.abs(dz) >= a.spanZ + b.spanZ) return null;

  // A separating axis can be normal to a side of either rectangle.
  const axes = [a.cos, -a.sin, a.sin, a.cos, b.cos, -b.sin, b.sin, b.cos];
  let depth = Infinity, nx = 0, nz = 0;
  for (let i = 0; i < axes.length; i += 2) {
    const x = axes[i], z = axes[i + 1];
    const candidate = axisDepth(a, b, dx, dz, x, z);
    if (candidate <= 0) return null;
    if (candidate < depth) {
      const side = dx * x + dz * z < 0 ? -1 : 1;
      depth = candidate;
      nx = x * side;
      nz = z * side;
    }
  }
  return { depth, nx, nz };
}

function trafficRectangle(actor) {
  return rectangle(actor.x, actor.z, actor.heading ?? 0, TRAFFIC_HALF_WIDTH, TRAFFIC_HALF_LENGTH);
}

export function vehicleOverlapsTraffic(vehicle, actor) {
  const body = rectangle(vehicle.x, vehicle.z, vehicle.heading, PLAYER_HALF_WIDTH, PLAYER_HALF_LENGTH);
  return overlap(body, trafficRectangle(actor)) !== null;
}

function impactPoint(pose, hit) {
  const { x, z, heading } = pose;
  const sin = Math.sin(heading), cos = Math.cos(heading);
  const preferredX = (hit.targetX ?? x) - x, preferredZ = (hit.targetZ ?? z) - z;
  const lateral = -hit.nx * cos + hit.nz * sin;
  const longitudinal = -hit.nx * sin - hit.nz * cos;
  const localX = Math.abs(lateral) > 0.075
    ? Math.sign(lateral) * PLAYER_HALF_WIDTH
    : limit(preferredX * cos - preferredZ * sin, PLAYER_HALF_WIDTH);
  const localZ = Math.abs(longitudinal) > 0.075
    ? Math.sign(longitudinal) * PLAYER_HALF_LENGTH
    : limit(preferredX * sin + preferredZ * cos, PLAYER_HALF_LENGTH);
  return { x: x + cos * localX + sin * localZ, z: z - sin * localX + cos * localZ, localX, localZ };
}

function contactAt(x, z, heading, { obstacles = [], traffic = [], bounds = 238 }) {
  const body = rectangle(x, z, heading, PLAYER_HALF_WIDTH, PLAYER_HALF_LENGTH);
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
    if (hit) return { ...hit, targetX: Math.max(obstacle.x0, Math.min(obstacle.x1, x)), targetZ: Math.max(obstacle.z0, Math.min(obstacle.z1, z)) };
  }
  for (const actor of traffic) {
    // Avoid trigonometry for lanes far from the player.
    if (Math.abs(actor.x - x) > 5 || Math.abs(actor.z - z) > 5) continue;
    const hit = overlap(body, trafficRectangle(actor));
    if (hit) {
      const speed = actor.speed || 0, angle = actor.heading || 0;
      return { ...hit, targetX: actor.x, targetZ: actor.z, vx: speed * Math.sin(angle), vz: speed * Math.cos(angle) };
    }
  }
  return null;
}

export function moveVehicle(vehicle, dt, world) {
  const { x, z, heading } = vehicle;
  const dx = vehicle.vx * dt, dz = vehicle.vz * dt, turn = vehicle.yaw * dt;
  const distance = Math.hypot(dx, dz);
  if (distance + Math.abs(turn) < 1e-9) return;
  const steps = Math.max(1, Math.ceil((distance + Math.abs(turn) * MAX_CORNER_RADIUS) / SWEEP_STEP));

  // A traffic vehicle or a relocated obstacle can already be overlapping the
  // player. Permit escape while overlap with that contact is decreasing.
  const initial = contactAt(x, z, heading, world);
  const blockingContact = (fraction) => {
    const hit = contactAt(x + dx * fraction, z + dz * fraction, heading + turn * fraction, world);
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
    const point = impactPoint(pose, hit);
    const armX = point.x - pose.x, armZ = point.z - pose.z;
    const relativeX = vehicle.vx - (hit.vx || 0), relativeZ = vehicle.vz - (hit.vz || 0);
    const incoming = relativeX * hit.nx + relativeZ * hit.nz;
    const lever = armZ * hit.nx - armX * hit.nz;
    const closing = Math.max(0, -incoming - vehicle.yaw * lever);
    const tangent = (relativeZ - vehicle.yaw * armX) * hit.nx - (relativeX + vehicle.yaw * armZ) * hit.nz;
    const rub = Math.min(Math.abs(tangent), closing * 0.23);
    const friction = Math.sign(tangent) * rub;
    const rebound = closing * (closing < 4 ? 0.09 : 0.055);
    vehicle.collisionImpact = Math.max(closing, Math.abs(vehicle.yaw) * 0.6);
    const response = Math.max(0, -incoming) + rebound;
    vehicle.vx += response * hit.nx + friction * hit.nz;
    vehicle.vz += response * hit.nz - friction * hit.nx;
    const angularKick = limit(lever * closing * 0.051, 0.68);
    vehicle.yaw = vehicle.yaw * 0.44 + angularKick;
    applyImpact(vehicle, closing, Math.abs(tangent), hit.nx, hit.nz, point.x, point.z, point.localX, point.localZ, pose.heading);
    break;
  }

  vehicle.x = x + dx * allowed;
  vehicle.z = z + dz * allowed;
  vehicle.heading = heading + turn * allowed;
  vehicle.km += distance * allowed / 1000;
}
