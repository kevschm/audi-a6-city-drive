const wall = { x0: -6, x1: 6, z0: 8, z1: 9.2, material: 'concrete' };
const perimeter = [
  { x0: -18, x1: -17.5, z0: -49, z1: 49, material: 'concrete' },
  { x0: 17.5, x1: 18, z0: -49, z1: 49, material: 'concrete' },
  { x0: -18, x1: 18, z0: -49, z1: -48.5, material: 'concrete' },
  { x0: -18, x1: 18, z0: 48.5, z1: 49, material: 'concrete' },
];

export const testScenarios = {
  front: { label: 'Frontalaufprall', from: -22, walls: [wall] },
  offset: { label: 'Versetzter Aufprall', from: -22, walls: [{ ...wall, x0: 0.52 }] },
  rear: { label: 'Heckaufprall', from: 37, reverse: true, walls: [wall] },
  side: { label: 'Seitlicher Fahrzeugtreffer', from: -22, targets: [{ x: 0.8, z: 8, heading: Math.PI / 2, color: '#3f8178' }] },
  dummy: { label: 'Crashtest-Dummy', from: -22, dummy: true },
  rollover: { label: 'Bordstein-Kippversuch', from: 0, lateral: true },
  wheel: { label: 'Radaufhängung am Pfosten', from: 0, crosswise: true,
    walls: [{x0: 2.2, x1: 2.5, z0: 1.24, z1: 1.54, material: 'steel'}] },
  chain: {
    label: 'Kettenkollision', from: -22,
    targets: [
      { x: 0.15, z: 4, heading: 0, color: '#bd8e42' },
      { x: 0.15, z: 9.8, heading: 0, color: '#627c91', model: 1 },
      { x: 0.15, z: 15.3, heading: 0, color: '#743e38', model: 2 },
    ],
  },
  objects: {
    label: 'Lose Hindernisse', from: -22,
    props: [
      { kind: 'drum', x: 0.43, z: 2 }, { kind: 'drum', x: 0.40, z: 5 },
      { kind: 'crate', x: 0.68, z: 8.2 }, { kind: 'crate', x: -1.0, z: 9 },
      { kind: 'cone', x: -0.65, z: 1.2 }, { kind: 'cone', x: -0.66, z: 4.1 },
      { kind: 'cone', x: -0.67, z: 6.0 }, { kind: 'cone', x: 1.26, z: 3.6 },
    ],
  },
};

export function createCrashScenario(name, kmh) {
  const spec = testScenarios[name] || testScenarios.front;
  const speed = Math.max(10, Math.min(130, Number(kmh) || 70)) / 3.6 * (spec.reverse ? -1 : 1);
  return {
    label: spec.label, spawn: { x: spec.lateral ? -4.8 : 0, z: spec.from, speed, vx: spec.lateral || spec.crosswise ? speed : 0,
      vz: spec.lateral || spec.crosswise ? 0 : speed, lateralTest: Boolean(spec.lateral), reverseLights: Boolean(spec.reverse), gear: spec.reverse ? 'R' : 'N' },
    obstacles: [...perimeter, ...(spec.walls ?? [])],
    traffic: (spec.targets ?? []).map(target => ({ ...target, speed: 0, braking: false })),
    dummies: spec.dummy ? [{ x: 0.32, y: 0, z: 1, heading: 0, tint: '#ecac36', dummy: true }] : [],
    props: (spec.props ?? []).map(prop => ({ ...prop })), impact: null,
  };
}
