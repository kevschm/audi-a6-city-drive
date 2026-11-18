import { WHEEL_CONTACTS } from './vehicle-suspension.js';

export const damageAreas = ['Front', 'Heck', 'links', 'rechts'];
export const wheelNames = ['Vorderrad links', 'Vorderrad rechts', 'Hinterrad links', 'Hinterrad rechts'];
export const dentLimit = 6;
const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

export const detachableParts = [
  { kind: 'frontBumper', x: 0, y: 0.50, z: 2.35, mass: 12, radius: 0.60, floor: 0.18, material: 'plastic' },
  { kind: 'rearBumper', x: 0, y: 0.50, z: -2.35, mass: 11, radius: 0.60, floor: 0.18, material: 'plastic' },
  { kind: 'leftMirror', x: -0.93, y: 1.11, z: 0.80, mass: 1.5, radius: 0.16, floor: 0.08, material: 'plastic' },
  { kind: 'rightMirror', x: 0.93, y: 1.11, z: 0.80, mass: 1.5, radius: 0.16, floor: 0.08, material: 'plastic' },
];

export function createDamageState() {
  return {
    damage: [0, 0, 0, 0], dents: new Float32Array(4 * dentLimit),
    wheelDamage: [0, 0, 0, 0], axleDamage: [0, 0], glass: [0, 0, 0, 0],
    detached: 0, mechanical: { engine: 0, cooling: 0, brakes: 0, temperature: 90, stalled: false },
  };
}

export function updateMechanicalDamage(car, dt) {
  const state = car.mechanical;
  const coolingLoss = state.cooling;
  const target = 90 + coolingLoss * (car.throttle * 48 + 57);
  state.temperature += (target - state.temperature) * (1 - Math.exp(-dt * (0.17 + coolingLoss * 0.28)));
  if (state.engine >= 0.92 || state.temperature >= 150) state.stalled = true;
}

export function impactArea(nx, nz, heading) {
  const sin = Math.sin(heading), cos = Math.cos(heading);
  const forward = nx * sin + nz * cos;
  const right = nx * cos - nz * sin;
  if (Math.abs(forward) >= Math.abs(right)) return forward < 0 ? 0 : 1;
  return right > 0 ? 2 : 3;
}

function addDent(dents, x, z, amount, area) {
  if (amount < 0.016) return;
  let weakest = 0;
  for (let i = 0; i < dents.length; i += 4) {
    if (dents[i + 2] < dents[weakest + 2]) weakest = i;
    if (dents[i + 2] > 0 && dents[i + 3] === area && Math.hypot(x - dents[i], z - dents[i + 1]) < 0.38) {
      dents[i + 2] += (1 - dents[i + 2]) * amount;
      return;
    }
  }
  if (amount > dents[weakest + 2]) dents.set([x, z, amount, area], weakest);
}

export function applyImpact(car, closingSpeed, scrapeSpeed, nx, nz, x, z, localX, localZ, heading = car.heading, contact) {
  const area = impactArea(nx, nz, heading);
  const crushEnergy = contact?.crushEnergy ?? closingSpeed ** 2 * 787.5;
  const concentration = contact?.contactWidth === undefined ? 1 : 1.07 - Math.min(1.6, contact.contactWidth) * 0.04375;
  const energy = Math.max(0, crushEnergy - 1700) / 188_000 * concentration;
  const scrape = closingSpeed > 0.55 ? Math.min(0.045, scrapeSpeed * closingSpeed * 0.0016) : 0;
  const change = Math.min(0.86, energy + scrape);
  car.damage[area] += (1 - car.damage[area]) * change;
  const anchorX = localX ?? (area === 2 ? -0.89 : area === 3 ? 0.89 : 0);
  const anchorZ = localZ ?? (area === 0 ? 2.40 : area === 1 ? -2.40 : 0);
  addDent(car.dents, anchorX, anchorZ, change, area);

  const mechanical = car.mechanical;
  if (area === 0) {
    const center = 1 - Math.min(0.78, Math.abs(anchorX) * 0.83);
    mechanical.cooling = Math.min(1, mechanical.cooling + Math.max(0, crushEnergy - 32_000) / 215_000 * (0.64 + center * 0.36));
    mechanical.engine = Math.min(1, mechanical.engine + Math.max(0, crushEnergy - 96_000) / 278_000 * (0.56 + center * 0.44));
  }

  const reach = clamp(0.69 + closingSpeed * 0.027, 0.72, 1.36);
  let wheel = -1;
  let wheelChange = 0;
  WHEEL_CONTACTS.forEach(([wx, wz], i) => {
    const separation = Math.hypot((wx - anchorX) * 1.67, wz - anchorZ);
    const closeness = clamp(1 - separation / reach, 0, 1);
    const increment = (1 - car.wheelDamage[i]) * change * closeness * 0.96;
    car.wheelDamage[i] += increment;
    if (increment > wheelChange) {
      wheelChange = increment;
      wheel = i;
    }
  });

  if (change > 0.22) {
    const axle = anchorZ < 0 ? 1 : 0;
    // A wheel hit concentrates the load. A hard central hit can bend the
    // corresponding axle even when the bumper shielded the two wheels.
    const leverage = Math.max(wheelChange * 0.64, (change - 0.22) * (area < 2 ? 0.46 : 0.27));
    car.axleDamage[axle] += (1 - car.axleDamage[axle]) * leverage;
    mechanical.brakes = Math.min(1, mechanical.brakes + wheelChange * 0.33 + Math.max(0, crushEnergy - 230_000) / 720_000);
  }
  const glassBefore = car.glass[area];
  const nearMirror = area < 2 || Math.abs(anchorZ - 0.80) < 0.95;
  const glassThreshold = area < 2 ? 47_000 : 23_000;
  const glassChange = Math.max(0, crushEnergy - glassThreshold) / (area < 2 ? 240_000 : 95_000);
  car.glass[area] = Math.min(1, glassBefore + glassChange);
  const glassBreak = glassBefore < 0.72 && car.glass[area] >= 0.72;
  const partThreshold = area < 2 ? 132_000 : 51_000;
  const part = 1 << area;
  const detached = nearMirror && crushEnergy > partThreshold && !(car.detached & part) ? area : -1;
  if (detached >= 0) car.detached |= part;
  if (mechanical.engine >= 0.92) mechanical.stalled = true;
  if (closingSpeed > 1.6 || (closingSpeed > 0.6 && scrapeSpeed > 6)) {
    car.impact = { ...contact, area, x, z, localX: anchorX, localZ: anchorZ, nx, nz, closingSpeed, scrapeSpeed, change,
      wheel, wheelChange, detached, glassBreak };
  }
}

export function availablePower(damage, mechanical) {
  const heat = mechanical ? Math.max(0, mechanical.temperature - 104) / 70 : 0;
  return (1 - 0.42 * damage[0] ** 1.45 - 0.10 * damage[1] ** 2) *
    Math.max(0, 1 - (mechanical?.engine ?? 0) * 0.70 - heat);
}
