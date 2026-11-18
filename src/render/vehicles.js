import { buildAvant, AVANT_WHEELS } from './avant.js';
import { multiply, rotateX, rotateY, transform, translate } from './math.js';
import { color, Mesh } from './mesh.js';
import { MATERIAL } from './renderer.js?drive-080';
import { createCockpit, dialAngle, dialPose } from './cockpit.js';
import { GATE_HALF_WIDTH } from '../simulation/time-trial.js';

const volume = (x, y, z, radius, height) =>
  ({ minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius, minY: y, maxY: y + height });

function buildTrafficCar() {
  const paint = new Mesh(), glass = new Mesh(), trim = new Mesh(), tail = new Mesh();
  paint.box(-0.84, 0.29, -2.03, 0.84, 0.89, 2.00, '#d2d3d3');
  paint.box(-0.80, 0.89, -2.00, 0.80, 1.00, 1.82, '#dedede');
  paint.box(-0.68, 1.44, -0.96, 0.68, 1.47, 0.49, '#dbdbdb');
  glass.quad([-0.77, 1.00, 1.21], [0.77, 1.00, 1.21], [0.68, 1.44, 0.49], [-0.68, 1.44, 0.49], '#465965');
  glass.quad([0.77, 1.00, -1.68], [-0.77, 1.00, -1.68], [-0.68, 1.44, -0.96], [0.68, 1.44, -0.96], '#3f515b');
  trim.box(-0.86, 0.39, -2.09, 0.86, 0.55, -2.024, '#45474a');
  trim.box(-0.85, 0.39, 1.991, 0.85, 0.54, 2.07, '#45474a');
  trim.box(-0.25, 0.57, -2.044, 0.25, 0.68, -2.031, '#d6d8d2');
  for (const side of [-1, 1]) {
    const a = [side * 0.77, 1.00, -1.68], b = [side * 0.77, 1.00, 1.21];
    const c = [side * 0.68, 1.44, 0.49], d = [side * 0.68, 1.44, -0.96];
    glass.quad(...(side > 0 ? [b, a, d, c] : [a, b, c, d]), '#435461');
    const x0 = side < 0 ? -0.80 : 0.48;
    tail.box(x0, 0.70, -2.05, x0 + 0.32, 0.93, -2.025, '#9f312e');
    trim.box(x0, 0.72, 2.001, x0 + 0.31, 0.89, 2.023, '#e8ddba');
    trim.box(side * 0.82 - 0.09, 1.00, 0.74, side * 0.82 + 0.09, 1.12, 0.97, '#343836');
    for (const z of [-1.25, 1.22]) {
      trim.sphere(side * 0.75, 0.29, z, 0.14, 0.288, 0.288, '#202024', 8, 5);
      trim.sphere(side * 0.866, 0.29, z, 0.034, 0.159, 0.159, '#a2a7a4', 7, 5);
    }
  }
  return { paint, glass, trim, tail };
}

export function buildVehicles(renderer) {
  const avant = Object.fromEntries([
    'body', 'paint', 'glass', 'wheel', 'tailLights', 'brakeLights', 'reverseLights',
    'headLights', 'leftSignals', 'rightSignals', 'brightwork',
  ].map(name => [name, new Mesh()]));
  buildAvant(avant);
  const cityCar = buildTrafficCar();
  const cabin = createCockpit();
  const contact = new Mesh();
  contact.quad([-1.36, 0.027, -2.86], [-1.36, 0.027, 2.86], [1.36, 0.027, 2.86], [1.36, 0.027, -2.86], '#191a1c');
  const lenses = ['#ff5942', '#ffbd48', '#63f381'].map(fill => {
    const mesh = new Mesh();
    mesh.sphere(0, 0, 0, 0.091, 0.091, 0.026, fill, 8, 4);
    return mesh;
  });
  const gateMesh = new Mesh();
  const streetLamp = new Mesh();
  streetLamp.box(-0.248, -0.009, -0.102, 0.248, 0.009, 0.102, '#ffcd84');
  for (const side of [-1, 1]) {
    const x = side * GATE_HALF_WIDTH;
    gateMesh.box(x - 0.038, 0.034, -0.08, x + 0.038, 1.14, 0.08, '#ffc263');
    gateMesh.box(x - 0.10, 1.07, -0.075, x + 0.10, 1.22, 0.075, '#ffe5aa');
    gateMesh.quad([x - 0.14, 0.022, -0.45], [x - 0.14, 0.022, 0.42], [x + 0.14, 0.022, 0.42], [x + 0.14, 0.022, -0.45], '#ffc263');
  }
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.59;
    gateMesh.quad([x - 0.23, 0.024, -0.10], [x - 0.23, 0.024, 0.10], [x + 0.23, 0.024, 0.10], [x + 0.23, 0.024, -0.10], '#ffe5aa');
  }
  for (const mesh of [...Object.values(avant), ...Object.values(cityCar), ...Object.values(cabin), contact, gateMesh, streetLamp, ...lenses]) renderer.upload(mesh);

  function scene(car, traffic, signals, signalColor, { cockpit, far, headlights, blink, dusk, gate, street }) {
    const objects = [], contacts = [];
    for (const actor of traffic) {
      const distance = Math.hypot(actor.x - car.x, actor.z - car.z);
      if (distance > far) continue;
      const model = transform(actor.x, actor.z, actor.heading);
      const bounds = volume(actor.x, 0, actor.z, 2.88, 1.6);
      objects.push(
        { mesh: cityCar.paint, model, bounds, style: MATERIAL.paint, tint: color(actor.color), castsShadow: true },
        { mesh: cityCar.trim, model, bounds },
        { mesh: cityCar.glass, model, bounds, style: MATERIAL.glass },
        { mesh: cityCar.tail, model, bounds, emission: actor.braking ? 1.2 : 0.25 + dusk * 0.31 },
      );
      if (distance < 34) contacts.push({ mesh: contact, model, bounds, style: MATERIAL.contact });
    }
    for (const signal of signals) {
      if (Math.hypot(signal.x - car.x, signal.z - car.z) > 72) continue;
      const phase = signalColor(signal.axis, signal.intersectionX, signal.intersectionZ);
      const index = ['red', 'amber', 'green'].indexOf(phase);
      objects.push({
        mesh: lenses[index], model: transform(signal.x, signal.z, signal.heading, signal.y + (1 - index) * 0.24),
        bounds: volume(signal.x, signal.y - 0.36, signal.z, 0.12, 0.72), emission: 0.48,
      });
    }
    if (gate && Math.hypot(gate.x - car.x, gate.z - car.z) < 125) {
      objects.push({ mesh: gateMesh, model: transform(gate.x, gate.z, gate.heading), emission: 0.45 + dusk * 0.55 });
    }
    for (const [x, y, z] of street) objects.push({
      mesh: streetLamp, model: translate(x, y, z), emission: dusk * 1.6,
      bounds: volume(x, y - 0.02, z, 0.28, 0.04),
    });
    if (!cockpit) {
      const body = transform(car.x, car.z, car.heading, car.heave, car.roll, car.pitch);
      contacts.push({ mesh: contact, model: transform(car.x, car.z, car.heading, Math.max(0, Math.min(car.heave, 0.16))), style: MATERIAL.contact });
      const damage = car.damage;
      const front = 1 - damage[0] * 0.23, rear = 1 - damage[1] * 0.23;
      const shell = { model: body, damage, dents: car.dents };
      objects.push(
        { ...shell, mesh: avant.body, castsShadow: true },
        { ...shell, mesh: avant.paint, style: MATERIAL.paint, castsShadow: true },
        { ...shell, mesh: avant.glass, style: MATERIAL.glass },
        { ...shell, mesh: avant.brightwork, style: MATERIAL.chrome },
        { ...shell, mesh: avant.tailLights, style: MATERIAL.lens, emission: headlights ? 0.74 * rear : 0.12 },
        { ...shell, mesh: avant.brakeLights, style: MATERIAL.lens, emission: car.brakeLights ? 2.85 * rear : 0.06 },
        { ...shell, mesh: avant.reverseLights, style: MATERIAL.lens, emission: car.reverseLights ? 1.15 * rear : 0 },
        { ...shell, mesh: avant.headLights, style: MATERIAL.lens, emission: headlights ? 0.85 * front : 0 },
        { ...shell, mesh: avant.leftSignals, style: MATERIAL.lens, emission: blink === -1 ? 2.2 * (1 - damage[2] * 0.9) : 0 },
        { ...shell, mesh: avant.rightSignals, style: MATERIAL.lens, emission: blink === 1 ? 2.2 * (1 - damage[3] * 0.9) : 0 },
      );
      const chassis = transform(car.x, car.z, car.heading);
      let index = 0;
      for (const z of [AVANT_WHEELS.front, AVANT_WHEELS.rear]) {
        for (const side of [-1, 1]) {
          const rim = car.wheelDamage[index];
          const axle = car.axleDamage[index < 2 ? 0 : 1];
          const mount = translate(side * AVANT_WHEELS.halfTrack, AVANT_WHEELS.radius + car.wheelTravel[index] - rim * 0.055, z);
          const steer = car.wheelSteer?.[index] ?? (z > 0 ? car.steer : 0);
          const spin = car.wheelSpin?.[index] ?? car.spin;
          const camber = dialPose(mount, 0, 0, 0, side * (rim * 0.31 + axle * 0.075) + Math.sin(spin) * rim * 0.048);
          const model = multiply(chassis, multiply(camber, multiply(rotateY(steer), rotateX(spin))));
          objects.push({ mesh: avant.wheel, model, rim, castsShadow: true });
          index++;
        }
      }
    } else {
      const body = transform(car.x, car.z, car.heading, car.heave, car.roll * 0.64, car.pitch);
      objects.push(
        { mesh: cabin.shell, model: body, cockpit: true },
        { mesh: cabin.hood, model: body, cockpit: true, style: MATERIAL.paint, damage: car.damage, dents: car.dents },
        { mesh: cabin.instruments, model: body, cockpit: true, emission: headlights ? 0.64 : 0.34 + dusk * 0.16 },
        { mesh: cabin.wheel, model: dialPose(body, -0.396, 0.909, 0.382, -car.steer * 2.90), cockpit: true },
        { mesh: cabin.needle, model: dialPose(body, -0.486, 1.026, 0.619, dialAngle(Math.abs(car.speed) * 3.6, 240)), cockpit: true, emission: 0.55 },
        { mesh: cabin.needle, model: dialPose(body, -0.297, 1.026, 0.619, dialAngle(car.rpm, 7000)), cockpit: true, emission: 0.55 },
      );
    }
    return { objects, contacts };
  }

  return { scene };
}
