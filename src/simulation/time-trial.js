export const stationRoute = Object.freeze([
  { x: 3.2, z: 10, heading: 0 },
  { x: 3.2, z: 33, heading: 0 },
  { x: 35, z: 66.8, heading: Math.PI / 2 },
  { x: 66.8, z: 34, heading: Math.PI },
  { x: 35, z: 3.2, heading: -Math.PI / 2 },
  { x: 9, z: 3.2, heading: -Math.PI / 2 },
].map(gate => Object.freeze(gate)));

export const GATE_HALF_WIDTH = 2.45;

export function crossedGate(gate, previous, current) {
  const sx = Math.sin(gate.heading), sz = Math.cos(gate.heading);
  const distance = point => (point.x - gate.x) * sx + (point.z - gate.z) * sz;
  const before = distance(previous), after = distance(current);
  if (before >= 0 || after < 0) return null;
  if (Math.cos(current.heading - gate.heading) < 0.25 || current.speed <= 0.4) return null;
  const fraction = -before / (after - before);
  const x = previous.x + fraction * (current.x - previous.x) - gate.x;
  const z = previous.z + fraction * (current.z - previous.z) - gate.z;
  return Math.abs(x * sz - z * sx) <= GATE_HALF_WIDTH ? fraction : null;
}

export function createTimeTrial(route = stationRoute, bestTime = null) {
  let phase = 'free';
  let index = 0;
  let elapsed = 0;
  let best = Number.isFinite(bestTime) && bestTime > 0 ? bestTime : null;
  let record = false;

  return {
    get phase() { return phase; },
    get elapsed() { return elapsed; },
    get index() { return index; },
    get total() { return route.length - 1; },
    get gate() { return phase === 'ready' || phase === 'running' ? route[index] : null; },
    get best() { return best; },
    get record() { return record; },
    arm() {
      phase = 'ready';
      index = 0;
      elapsed = 0;
      record = false;
    },
    cancel() {
      phase = 'free';
      elapsed = 0;
      index = 0;
      record = false;
    },
    step(dt, previous, car) {
      if (phase !== 'ready' && phase !== 'running') return null;
      const crossing = crossedGate(route[index], previous, car);
      if (phase === 'ready') {
        if (crossing === null) return null;
        phase = 'running';
        index++;
        elapsed = dt * (1 - crossing);
        return 'start';
      }
      if (crossing === null) {
        elapsed += dt;
        return null;
      }
      index++;
      if (index < route.length) {
        elapsed += dt;
        return 'checkpoint';
      }
      elapsed += crossing * dt;
      phase = 'finished';
      record = best === null || elapsed < best;
      if (record) best = elapsed;
      return 'finish';
    },
  };
}

export function formatTrialTime(seconds) {
  const centiseconds = Math.round(seconds * 100);
  const elapsedSeconds = Math.floor(centiseconds / 100);
  return Math.floor(elapsedSeconds / 60) + ':' + String(elapsedSeconds % 60).padStart(2, '0') + ',' + String(centiseconds % 100).padStart(2, '0');
}
