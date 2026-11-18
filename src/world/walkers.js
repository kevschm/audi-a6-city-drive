import { stepPedestrianRigs } from '../simulation/ragdoll.js';

// Sidewalk and park paths around the station, marketplace and green squares.
const paths = [
  [[11, -57], [11, -39]], [[11, -31], [11, -15]],
  [[-10, -58], [-10, -39]], [[-11, -31], [-11, -14]],
  [[-54, -35], [-38, -35]], [[-32, -35], [-17, -35]],
  [[17, -35], [32, -35]], [[38, -35], [53, -35]],
  [[16, 16], [50, 16]], [[13, 21], [13, 43]],
  [[52, 14], [59, 14]], [[54, 22], [54, 37]],
  [[-55, 16], [-16, 16]], [[-13, 21], [-13, 45]],
  [[-54, 22], [-50, 27]], [[10, 54], [10, 61]],
  [[-62, -9], [-44, -9]], [[23, -11], [55, -11]],
];
const coats = ['#46545c', '#8b5b44', '#60504f', '#66705d', '#3d4858', '#a19a80', '#603b3d'];

export function makeWalkers({ obstacles, heightAt, surfaceAt }) {
  const actors = [];
  function clear(x, z) {
    return surfaceAt(x, z) === 'paving' && !obstacles.some(o => x > o.x0 - 0.36 && x < o.x1 + 0.36 &&
      z > o.z0 - 0.36 && z < o.z1 + 0.36);
  }
  for (const [id, [a, b]] of paths.entries()) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    const samples = Math.ceil(length / 0.4);
    const valid = Array.from({ length: samples + 1 }, (_, i) => clear(a[0] + dx * i / samples, a[1] + dz * i / samples));
    let first = 0, best = 0, bestEnd = 0;
    for (let i = 0; i <= samples; i++) {
      if (!valid[i]) first = i + 1;
      else if (i - first > best) { best = i - first; bestEnd = i; }
    }
    if (best * length / samples < 3.5) continue;
    const start = (bestEnd - best) / samples;
    const range = best / samples;
    actors.push({
      x: a[0], y: 0.16, z: a[1], phase: id * 2.61, moving: true,
      progress: 0.18 + (id * 0.271 % 0.67), direction: id % 2 === 0 ? 1 : -1,
      pace: 0.91 + id % 5 * 0.105, angle: Math.atan2(dx, dz),
      baseX: a[0] + dx * start, baseZ: a[1] + dz * start, dx: dx * range, dz: dz * range,
      length: length * range, tint: coats[id % coats.length], umbrella: id % 3 !== 0, heading: 0,
    });
  }

  function step(dt, player, previous, props = []) {
    stepPedestrianRigs(actors, dt, previous, player, heightAt, obstacles, props);
    for (const actor of actors) {
      if (actor.rig) continue;
      const dx = actor.x - player.x, dz = actor.z - player.z;
      const clearance = Math.hypot(dx, dz);
      const speed = Math.hypot(player.vx || 0, player.vz || 0);
      const ahead = (dx * (player.vx || 0) + dz * (player.vz || 0)) / Math.max(0.1, speed);
      const danger = speed > 2.4 && ahead > 0 && ahead < 12 && clearance ** 2 - ahead ** 2 < 7.3;
      if (danger && clearance > 1) {
        const away = actor.dx * dx + actor.dz * dz;
        actor.direction = away >= 0 ? 1 : -1;
      }
      const atEnd = actor.direction < 0 ? actor.progress <= 0 : actor.progress >= 1;
      const pace = actor.pace * (danger ? 2.25 : 1);
      actor.moving = !danger || !atEnd;
      if (actor.moving) actor.progress += actor.direction * pace * dt / actor.length;
      if (actor.progress <= 0 || actor.progress >= 1) {
        if (!danger) actor.direction *= -1;
        actor.progress = Math.max(0, Math.min(1, actor.progress));
      }
      actor.x = actor.baseX + actor.dx * actor.progress;
      actor.z = actor.baseZ + actor.dz * actor.progress;
      actor.y = heightAt(actor.x, actor.z);
      actor.heading = actor.angle + (actor.direction < 0 ? Math.PI : 0);
      if (actor.moving) actor.phase += dt * pace * 7.7;
    }
  }
  step(0, { x: 1000, z: 1000, speed: 0 });
  function reset() {
    for (const actor of actors) actor.rig = null;
    step(0, { x: 1000, z: 1000 });
  }
  return { actors, step, reset };
}
