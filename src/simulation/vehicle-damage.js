export const damageAreas = ['Front', 'Heck', 'links', 'rechts'];

export function impactArea(nx, nz, heading) {
  const sin = Math.sin(heading), cos = Math.cos(heading);
  const forward = nx * sin + nz * cos;
  const right = nx * cos - nz * sin;
  if (Math.abs(forward) >= Math.abs(right)) return forward < 0 ? 0 : 1;
  return right > 0 ? 2 : 3;
}

export function applyImpact(car, closingSpeed, scrapeSpeed, nx, nz, x, z) {
  const area = impactArea(nx, nz, car.heading);
  // Energy scales with closing speed squared. A brush at parking speed leaves
  // only a small mark, while repeated impacts accumulate over the same panel.
  const energy = Math.max(0, closingSpeed ** 2 - 2.15) / 240;
  const scrape = closingSpeed > 0.55 ? Math.min(0.045, scrapeSpeed * closingSpeed * 0.0016) : 0;
  const change = Math.min(0.86, energy + scrape);
  car.damage[area] += (1 - car.damage[area]) * change;
  if (closingSpeed > 1.6 || (closingSpeed > 0.6 && scrapeSpeed > 6)) {
    car.impact = { area, x, z, nx, nz, closingSpeed, scrapeSpeed, change };
  }
}

export function availablePower(damage) {
  return 1 - 0.42 * damage[0] ** 1.45 - 0.10 * damage[1] ** 2;
}
