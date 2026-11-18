import { clamp } from '../render/math.js';

export function createOrbitPose() {
  let azimuth = 0.4, elevation = 0.30, distance = 6.8;
  return {
    get azimuth() { return azimuth; },
    get elevation() { return elevation; },
    get distance() { return distance; },
    drag(dx, dy) {
      azimuth = (azimuth - dx * 0.009) % (2 * Math.PI);
      elevation = clamp(elevation + dy * 0.006, 0.045, 1.35);
    },
    zoom(factor) {
      if (factor > 0 && Number.isFinite(factor)) distance = clamp(distance * factor, 3.65, 21);
    },
  };
}

export function installOrbitGestures(canvas, pose, activate) {
  const points = new Map();
  const pair = () => [...points.values()];
  const midpoint = (a, b) => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });
  const spread = (a, b) => Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
  const point = event => ({ x: event.clientX, y: event.clientY });

  canvas.addEventListener('pointerdown', event => {
    if (points.size >= 2 || (event.pointerType === 'mouse' && event.button !== 0)) return;
    points.set(event.pointerId, point(event));
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    const old = points.get(event.pointerId);
    if (!old) return;
    const next = point(event);
    const dx = next.x - old.x, dy = next.y - old.y;
    if (Math.hypot(dx, dy) < 1.5) return;
    const before = pair();
    points.set(event.pointerId, next);
    if (!activate()) return;
    if (points.size === 1) {
      pose.drag(dx, dy);
    } else {
      const after = pair();
      const a = midpoint(...before), b = midpoint(...after);
      pose.drag(b.x - a.x, b.y - a.y);
      pose.zoom(spread(...before) / spread(...after));
    }
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(event, pointer => points.delete(pointer.pointerId));
  }
  canvas.addEventListener('wheel', event => {
    if (!activate()) return;
    event.preventDefault();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 270 : 1;
    pose.zoom(Math.exp(clamp(event.deltaY * units, -200, 200) * 0.0031));
  }, { passive: false });
  return () => points.clear();
}
