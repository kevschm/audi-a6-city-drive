const restPose = [
  [0, 0.84, 0], [0, 1.23, 0], [0, 1.54, 0],
  [-0.21, 1.32, 0], [-0.27, 1.07, 0.02], [-0.27, 0.86, 0.065],
  [0.21, 1.32, 0], [0.27, 1.07, 0.02], [0.27, 0.86, 0.065],
  [-0.096, 0.83, 0], [-0.12, 0.46, 0.035], [-0.12, 0.11, 0.047],
  [0.096, 0.83, 0], [0.12, 0.46, 0.035], [0.12, 0.11, 0.047],
];
const radii = [0.15, 0.17, 0.12, 0.075, 0.065, 0.05, 0.075, 0.065, 0.05, 0.09, 0.075, 0.075, 0.09, 0.075, 0.075];
export const ragdollSegments = [
  [0, 1, 'coat'], [1, 2, 'neck'], [3, 4, 'arm'], [4, 5, 'arm'], [6, 7, 'arm'], [7, 8, 'arm'],
  [9, 10, 'leg'], [10, 11, 'leg'], [12, 13, 'leg'], [13, 14, 'leg'],
];
const links = [...ragdollSegments, [1, 3], [1, 6], [3, 6], [3, 0], [6, 0], [0, 9], [0, 12], [9, 12],
  [3, 5, null, 0.20], [6, 8, null, 0.20], [9, 11, null, 0.29], [12, 14, null, 0.29]]
  .map(([a, b, , min]) => ({ a, b, min, distance: Math.hypot(...restPose[a].map((value, i) => value - restPose[b][i])) }));

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export function walkerContact(actor, previous, player) {
  if (!previous || !Number.isFinite(player.heading)) return false;
  const sin = Math.sin(player.heading), cos = Math.cos(player.heading);
  const a = [actor.x - previous.x, actor.z - previous.z], b = [actor.x - player.x, actor.z - player.z];
  const axes = [[cos, -sin, 1.03], [sin, cos, 2.54]];
  let entry = 0, exit = 1;
  for (const [ax, az, span] of axes) {
    const start = a[0] * ax + a[1] * az, end = b[0] * ax + b[1] * az;
    const delta = end - start;
    if (Math.abs(delta) < 1e-7) {
      if (Math.abs(start) > span) return false;
      continue;
    }
    const low = (-span - start) / delta, high = (span - start) / delta;
    entry = Math.max(entry, Math.min(low, high));
    exit = Math.min(exit, Math.max(low, high));
    if (entry > exit) return false;
  }
  return true;
}

export function createRagdoll(actor, vx, vz, dt) {
  const sin = Math.sin(actor.heading), cos = Math.cos(actor.heading);
  const speed = Math.hypot(vx, vz);
  const push = Math.min(0.71, 11.5 / Math.max(0.1, speed));
  const nodes = restPose.map(([x, y, z], i) => {
    const position = [actor.x + x * cos + z * sin, actor.y + y, actor.z - x * sin + z * cos];
    const transfer = y < 1.1 ? 1 : 0.63;
    const lift = Math.min(3.8, speed * 0.15) * (y < 1.1 ? 1 : 0.73);
    return { position, prior: [position[0] - vx * push * transfer * dt,
      position[1] - lift * dt, position[2] - vz * push * transfer * dt],
      radius: radii[i], inverseMass: i < 2 ? 0.25 : i === 2 ? 0.52 : 1 };
  });
  return { nodes, age: 0, rest: 0 };
}

export function stepRagdoll(rig, dt, heightAt, obstacles, props) {
  rig.age += dt;
  if (rig.rest > 1) return;
  const center = rig.nodes[0].position;
  const walls = obstacles.filter(w => w.x0 < center[0] + 3 && w.x1 > center[0] - 3 && w.z0 < center[2] + 3 && w.z1 > center[2] - 3);
  let activity = 0;
  for (const node of rig.nodes) {
    const { position: p, prior, radius } = node;
    const vx = (p[0] - prior[0]) * 0.992, vy = (p[1] - prior[1]) * 0.992, vz = (p[2] - prior[2]) * 0.992;
    prior[0] = p[0]; prior[1] = p[1]; prior[2] = p[2];
    p[0] += vx; p[1] += vy - 9.81 * dt * dt; p[2] += vz;
    activity = Math.max(activity, Math.hypot(vx, vy, vz));
    for (const prop of props) {
      const dx = prop.x - p[0], dz = prop.z - p[2], distance = Math.hypot(dx, dz);
      if (distance < 0.005 || distance > radius + prop.radius || Math.abs(prop.y - p[1]) > prop.floor + radius) continue;
      const nx = dx / distance, nz = dz / distance;
      const relative = (vx / dt - prop.vx) * nx + (vz / dt - prop.vz) * nz;
      if (relative <= 0.15) continue;
      const push = Math.min(3.5, relative * 4.7 / (prop.mass + 4.7));
      prop.vx += push * nx; prop.vz += push * nz;
      prop.tumble += push * 0.65;
      prop.asleep = false;
      prior[0] += vx * 0.23; prior[2] += vz * 0.23;
    }
  }
  for (let iteration = 0; iteration < 6; iteration++) {
    for (const { a, b, min, distance } of links) {
      const one = rig.nodes[a], two = rig.nodes[b], p = one.position, q = two.position;
      const delta = q.map((v, axis) => v - p[axis]);
      const length = Math.hypot(...delta);
      if (length < 1e-6 || (min && length >= min)) continue;
      const factor = (length - (min || distance)) / length / (one.inverseMass + two.inverseMass);
      for (let axis = 0; axis < 3; axis++) {
        p[axis] += delta[axis] * factor * one.inverseMass;
        q[axis] -= delta[axis] * factor * two.inverseMass;
      }
    }
    for (const { position: p, prior, radius } of rig.nodes) {
      const ground = heightAt(p[0], p[2]) + radius;
      if (p[1] < ground) {
        const down = prior[1] - p[1];
        p[1] = ground;
        prior[1] = ground - clamp(down * 0.13, 0, 0.10);
        prior[0] += (p[0] - prior[0]) * 0.18;
        prior[2] += (p[2] - prior[2]) * 0.18;
      }
      for (const wall of walls) {
        const x = clamp(p[0], wall.x0, wall.x1), z = clamp(p[2], wall.z0, wall.z1);
        if (Math.hypot(p[0] - x, p[2] - z) >= radius) continue;
        const left = p[0] - wall.x0, right = wall.x1 - p[0], back = p[2] - wall.z0, front = wall.z1 - p[2];
        const nearest = Math.min(left, right, back, front);
        if (nearest === left) p[0] = prior[0] = wall.x0 - radius;
        else if (nearest === right) p[0] = prior[0] = wall.x1 + radius;
        else if (nearest === back) p[2] = prior[2] = wall.z0 - radius;
        else p[2] = prior[2] = wall.z1 + radius;
      }
    }
  }
  rig.rest = activity < 0.017 ? rig.rest + dt : 0;
}

export function stepPedestrianRigs(actors, dt, previous, player, heightAt, obstacles, props) {
  let count = actors.reduce((total, actor) => total + Number(Boolean(actor.rig)), 0);
  for (const actor of actors) {
    if (!actor.rig && count < 3 && Math.hypot(player.vx, player.vz) > 2.2 && walkerContact(actor, previous, player)) {
      actor.rig = createRagdoll(actor, player.vx, player.vz, dt);
      player.vx *= 0.975;
      player.vz *= 0.975;
      player.speed *= 0.975;
      count++;
    }
    if (!actor.rig) continue;
    stepRagdoll(actor.rig, dt, heightAt, obstacles, props);
    [actor.x, actor.y, actor.z] = actor.rig.nodes[0].position;
  }
}
