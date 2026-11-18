import { WHEEL_CONTACTS } from './vehicle-suspension.js';

export const damageAreas = ['Front', 'Heck', 'links', 'rechts'];
export const wheelNames = ['Vorderrad links', 'Vorderrad rechts', 'Hinterrad links', 'Hinterrad rechts'];
export const dentLimit = 6;
const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

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

export function applyImpact(car, closingSpeed, scrapeSpeed, nx, nz, x, z, localX, localZ, heading = car.heading) {
  const area = impactArea(nx, nz, heading);
  // Energy scales with closing speed squared. A brush at parking speed leaves
  // only a small mark, while repeated impacts accumulate over the same panel.
  const energy = Math.max(0, closingSpeed ** 2 - 2.15) / 240;
  const scrape = closingSpeed > 0.55 ? Math.min(0.045, scrapeSpeed * closingSpeed * 0.0016) : 0;
  const change = Math.min(0.86, energy + scrape);
  car.damage[area] += (1 - car.damage[area]) * change;
  const anchorX = localX ?? (area === 2 ? -0.89 : area === 3 ? 0.89 : 0);
  const anchorZ = localZ ?? (area === 0 ? 2.40 : area === 1 ? -2.40 : 0);
  addDent(car.dents, anchorX, anchorZ, change, area);

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
  }
  if (closingSpeed > 1.6 || (closingSpeed > 0.6 && scrapeSpeed > 6)) {
    car.impact = { area, x, z, localX: anchorX, localZ: anchorZ, nx, nz, closingSpeed, scrapeSpeed, change, wheel, wheelChange };
  }
}

export function availablePower(damage) {
  return 1 - 0.42 * damage[0] ** 1.45 - 0.10 * damage[1] ** 2;
}
