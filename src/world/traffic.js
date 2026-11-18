import { TRAFFIC_HALF_LENGTH, TRAFFIC_HALF_WIDTH } from '../simulation/vehicle-collision.js';

const laneOffset = 3.2;
const edge = 238;
const signalMarkingOffset = 5.2;
const bumperGap = 0.05;
// An actor can still overlap crossing traffic after its center passes the
// intersection center. Include lane offset, both bodies and clearance.
const crossingClearance = laneOffset + TRAFFIC_HALF_LENGTH + TRAFFIC_HALF_WIDTH + 0.25;
const stopLineTolerance = 0.12;
const paint = ['#b2b6b3', '#943b37', '#476385', '#4d705e', '#b4a48a', '#55515a', '#bdbcbc'];

export function makeTraffic(roads, signals) {
  const junctions = new Set(signals.map(({ intersectionX, intersectionZ }) => `${intersectionX},${intersectionZ}`));
  const actors = Array.from({ length: 14 }, (_, index) => {
    const axis = index % 2;
    const dir = index % 4 < 2 ? 1 : -1;
    const road = roads[Math.floor(index / 2)];
    const lane = road + (axis ? -dir : dir) * laneOffset;
    const position = [-179, 125, 95, -50, 113, -113, -152, 165, 168, -85, -47, 102, 33, -61][index];
    return {
      axis, dir, lane, road, color: paint[index % paint.length], speed: 7.1,
      cruise: 7.6 + (index % 5) * 0.85,
      x: axis ? position : lane,
      z: axis ? lane : position,
      heading: axis ? dir * Math.PI / 2 : dir > 0 ? 0 : Math.PI,
      braking: false,
    };
  });
  let elapsed = 0;

  function signalColor(axis, intersectionX, intersectionZ) {
    const offset = ((intersectionX + intersectionZ + 420) / 70 % 5) * 2;
    const phase = (elapsed + offset) % 26;
    const local = (phase + (axis ? 13 : 0)) % 26;
    return local < 10 ? 'green' : local < 12 ? 'amber' : 'red';
  }

  function crossingPriority(roadHalfWidth) {
    const approaches = new Map();
    const leaders = new Map();
    for (const actor of actors) {
      const { axis, dir, road, speed } = actor;
      const position = axis ? actor.x : actor.z;
      for (const cross of roads) {
        const distance = (cross - position) * dir;
        if (distance < -crossingClearance || distance > 38) continue;

        const ix = axis ? cross : road, iz = axis ? road : cross;
        const key = `${ix},${iz}`;
        const hasSignal = junctions.has(key);
        const stopLineOffset = TRAFFIC_HALF_LENGTH + bumperGap + (hasSignal ? signalMarkingOffset : 0);
        const toStop = distance - roadHalfWidth(cross) - stopLineOffset;
        const occupied = toStop < -stopLineTolerance;
        const status = hasSignal ? signalColor(axis, ix, iz) : 'green';
        const canStop = toStop >= speed * speed / 12 + 0.25;
        const red = !occupied && (status === 'red' || (status === 'amber' && canStop));
        approaches.set(actor, { key, toStop, occupied, red });
        if (red) continue;

        // Clear vehicles already crossing first, then let the nearest
        // eligible approach enter. Stable actor order breaks exact ties.
        const arrival = occupied ? -Infinity : Math.max(0, toStop) / Math.max(speed, actor.cruise * 0.5);
        const leader = leaders.get(key);
        if (!leader || arrival < leader.arrival) leaders.set(key, { actor, arrival });
      }
    }
    return { approaches, leaders };
  }

  function step(dt, player, overlaps, roadHalfWidth) {
    elapsed += dt;
    const { approaches, leaders } = crossingPriority(roadHalfWidth);
    const peers = [...actors, player];
    const proposed = [];
    for (const actor of actors) {
      const { axis, dir, lane, speed } = actor;
      const position = axis ? actor.x : actor.z;
      let free = Infinity;
      for (const peer of peers) {
        if (peer === actor) continue;
        const across = axis ? peer.z : peer.x;
        const ahead = dir * ((axis ? peer.x : peer.z) - position);
        if (ahead > 0 && Math.abs(across - lane) < 2.0) free = Math.min(free, Math.max(0, ahead - 5.1));
      }
      const approach = approaches.get(actor);
      if (approach && !approach.occupied && (approach.red || leaders.get(approach.key)?.actor !== actor)) {
        free = Math.min(free, Math.max(0, approach.toStop));
      }
      const target = Math.min(actor.cruise, Math.sqrt(free * 6));
      const nextSpeed = Math.max(0, speed + Math.max(-6 * dt, Math.min(2.0 * dt, target - speed)));
      let nextPosition = position + dir * Math.min(nextSpeed * dt, free);
      if (Math.abs(nextPosition) > edge) nextPosition = -dir * edge;
      const next = { ...actor, x: axis ? nextPosition : lane, z: axis ? lane : nextPosition };
      const blocked = overlaps(player, next) || (Math.abs(nextPosition - position) > edge && actors.some(peer =>
        peer !== actor && Math.hypot(peer.x - next.x, peer.z - next.z) < 6));
      proposed.push(blocked
        ? { x: actor.x, z: actor.z, speed: 0, braking: true }
        : { x: next.x, z: next.z, speed: free === 0 ? 0 : nextSpeed, braking: target < speed - 0.4 || target < 0.3 });
    }
    actors.forEach((actor, index) => Object.assign(actor, proposed[index]));
  }

  return { actors, step, signalColor };
}
