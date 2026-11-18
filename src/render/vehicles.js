import { buildAvant, AVANT_WHEELS } from './avant.js';
import { multiply, rotateX, rotateY, transform, translate } from './math.js';
import { color, Mesh } from './mesh.js';
import { MATERIAL } from './renderer.js?drive-090';
import { createCockpit, dialAngle, dialPose } from './cockpit.js';
import { GATE_HALF_WIDTH } from '../simulation/time-trial.js';
import { detachableParts } from '../simulation/vehicle-damage.js';

const volume = (x, y, z, radius, height) =>
  ({ minX: x - radius, maxX: x + radius, minZ: z - radius, maxZ: z + radius, minY: y, maxY: y + height });

function buildTrafficCar({ roof, rearRoof, baseRear, frontRoof }) {
  const paint = new Mesh(), glass = new Mesh(), trim = new Mesh(), tail = new Mesh();
  const sections = [
    [-2.11, 0.66, 0.79, 0.43], [-2.00, 0.79, 0.93, 0.36], [-1.60, 0.83, 0.98, 0.32],
    [-1.34, 0.84, 0.98, 0.48], [-1.24, 0.84, 0.99, 0.59], [-1.07, 0.84, 0.99, 0.51],
    [-0.91, 0.83, 0.99, 0.29], [0.89, 0.83, 0.97, 0.29], [1.05, 0.83, 0.96, 0.50],
    [1.22, 0.83, 0.93, 0.59], [1.39, 0.82, 0.92, 0.49], [1.57, 0.81, 0.90, 0.32],
    [1.94, 0.77, 0.85, 0.36], [2.09, 0.66, 0.76, 0.43],
  ];
  const section = ([z, width, top, floor], side) => [
    [width * side * 0.93, floor, z], [width * side, 0.66, z], [width * side * 0.95, top, z],
  ];
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i];
    for (const side of [-1, 1]) {
      const p = section(a, side), q = section(b, side);
      for (let level = 0; level < 2; level++) {
        const quad = [p[level], q[level], q[level + 1], p[level + 1]];
        paint.quad(...(side < 0 ? quad : quad.reverse()), level === 0 ? '#bbbbbb' : '#dfdfdf');
      }
    }
    const aLeft = section(a, -1)[2], aRight = section(a, 1)[2];
    const bLeft = section(b, -1)[2], bRight = section(b, 1)[2];
    paint.quad(aLeft, bLeft, [0, b[2] + 0.034, b[0]], [0, a[2] + 0.034, a[0]], '#dedede');
    paint.quad([0, a[2] + 0.034, a[0]], [0, b[2] + 0.034, b[0]], bRight, aRight, '#dedede');
  }
  for (const [end, spec] of [[-1, sections[0]], [1, sections.at(-1)]]) {
    const [z, width, top, floor] = spec;
    const face = [[-width, floor, z], [width, floor, z], [width, top, z], [-width, top, z]];
    paint.quad(...(end > 0 ? face : face.reverse()), '#bababa');
    trim.box(-0.67, 0.43, z - 0.026, 0.67, 0.51, z + 0.026, '#353b3d');
    trim.box(-0.235, 0.53, z - 0.018, 0.235, 0.635, z + 0.018, '#cbc9b9');
  }
  paint.quad([-0.625, roof, rearRoof], [-0.625, roof, frontRoof],
    [0.625, roof, frontRoof], [0.625, roof, rearRoof], '#d3d3d0');
  glass.quad([-0.745, 0.991, 1.24], [0.745, 0.991, 1.24], [0.625, roof, frontRoof], [-0.625, roof, frontRoof], '#36444b');
  glass.quad([0.762, 1.005, baseRear], [-0.762, 1.005, baseRear], [-0.625, roof, rearRoof], [0.625, roof, rearRoof], '#293740');
  for (const side of [-1, 1]) {
    const a = [side * 0.762, 1.005, baseRear], b = [side * 0.745, 0.991, 1.24];
    const c = [side * 0.625, roof, frontRoof], d = [side * 0.625, roof, rearRoof];
    glass.quad(...(side > 0 ? [b, a, d, c] : [a, b, c, d]), '#33424a');
    trim.quad([side * 0.762, 1.006, -0.26], [side * 0.764, 1.006, -0.18],
      [side * 0.63, roof, -0.11], [side * 0.63, roof, -0.20], '#282d30');
    const x0 = side > 0 ? 0.33 : -0.70, x1 = side > 0 ? 0.70 : -0.33;
    tail.box(x0, 0.64, -2.113, x1, 0.76, -2.102, '#9f312e');
    trim.box(x0, 0.665, 2.088, x1, 0.748, 2.105, '#bfc6be');
    for (const z of [-0.96, 0.08]) {
      const x = side * 0.815;
      trim.box(x - 0.014, 0.883, z, x + 0.014, 0.906, z + 0.13, '#393e40');
    }
    trim.sphere(side * 0.81, 1.06, 0.73, 0.098, 0.054, 0.080, '#363a3d', 8, 5);
    for (const z of [-1.25, 1.22]) {
      trim.sphere(side * 0.742, 0.29, z, 0.13, 0.288, 0.288, '#202024', 12, 6);
      trim.sphere(side * 0.868, 0.29, z, 0.023, 0.162, 0.162, '#757d80', 10, 6, 'metal');
      trim.sphere(side * 0.887, 0.29, z, 0.012, 0.074, 0.074, '#a7afab', 9, 5, 'metal');
    }
  }
  return { paint, glass, trim, tail };
}

export function buildVehicles(renderer) {
  const avant = Object.fromEntries([
    'body', 'paint', 'glass', 'wheel', 'tailLights', 'brakeLights', 'reverseLights',
    'headLights', 'leftSignals', 'rightSignals', 'brightwork',
  ].map(name => [name, new Mesh()]));
  const components = detachableParts.map(() => ({ paint: new Mesh(), trim: new Mesh(), bright: new Mesh() }));
  buildAvant(avant, components);
  const trafficModels = [
    { roof: 1.43, rearRoof: -0.69, baseRear: -1.55, frontRoof: 0.49 },
    { roof: 1.53, rearRoof: -1.43, baseRear: -1.87, frontRoof: 0.44 },
    { roof: 1.48, rearRoof: -1.07, baseRear: -1.52, frontRoof: 0.38 },
  ].map(buildTrafficCar);
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
  const attached = components.flatMap(Object.values);
  for (const mesh of [...Object.values(avant), ...trafficModels.flatMap(Object.values), ...Object.values(cabin), ...attached,
    contact, gateMesh, streetLamp, ...lenses]) renderer.upload(mesh);

  function addComponent(objects, index, shell, emission = 0) {
    const { paint, trim, bright } = components[index];
    objects.push({ ...shell, mesh: paint, style: MATERIAL.paint, castsShadow: true }, { ...shell, mesh: trim });
    if (bright.count) objects.push({ ...shell, mesh: bright, style: index === 0 ? MATERIAL.lens : MATERIAL.chrome, emission });
  }

  function scene(car, traffic, signals, signalColor, { cockpit, far, headlights, blink, dusk, gate, street, debris = [] }) {
    const objects = [], contacts = [];
    for (const actor of traffic) {
      const distance = Math.hypot(actor.x - car.x, actor.z - car.z);
      if (distance > far) continue;
      const model = transform(actor.x, actor.z, actor.heading);
      const cityCar = trafficModels[actor.model ?? 0];
      const bounds = volume(actor.x, 0, actor.z, 2.88, 1.6);
      const shell = { model, bounds, damage: actor.damage, dents: actor.dents };
      objects.push(
        { ...shell, mesh: cityCar.paint, style: MATERIAL.paint, tint: color(actor.color), castsShadow: true },
        { ...shell, mesh: cityCar.trim },
        { ...shell, mesh: cityCar.glass, style: MATERIAL.glass, panes: actor.glass },
        { ...shell, mesh: cityCar.tail, style: MATERIAL.lens, emission: actor.braking ? 1.2 : 0.25 + dusk * 0.31 },
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
        { ...shell, mesh: avant.glass, style: MATERIAL.glass, panes: car.glass },
        { ...shell, mesh: avant.brightwork, style: MATERIAL.chrome },
        { ...shell, mesh: avant.tailLights, style: MATERIAL.lens, emission: headlights ? 0.74 * rear : 0.12 },
        { ...shell, mesh: avant.brakeLights, style: MATERIAL.lens, emission: car.brakeLights ? 2.85 * rear : 0.06 },
        { ...shell, mesh: avant.reverseLights, style: MATERIAL.lens, emission: car.reverseLights ? 1.15 * rear : 0 },
        { ...shell, mesh: avant.headLights, style: MATERIAL.lens, emission: headlights ? 0.85 * front : 0 },
        { ...shell, mesh: avant.leftSignals, style: MATERIAL.lens, emission: blink === -1 ? 2.2 * (1 - damage[2] * 0.9) : 0 },
        { ...shell, mesh: avant.rightSignals, style: MATERIAL.lens, emission: blink === 1 ? 2.2 * (1 - damage[3] * 0.9) : 0 },
      );
      for (let i = 0; i < components.length; i++) {
        if (!(car.detached & 1 << i)) addComponent(objects, i, shell, headlights ? 0.32 * front : 0);
      }
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
      if (car.glass[0] > 0.065) {
        let origin = 0;
        let strength = 0;
        for (let i = 0; i < car.dents.length; i += 4) if (car.dents[i + 3] === 0 && car.dents[i + 2] > strength) {
          origin = car.dents[i] * 0.56;
          strength = car.dents[i + 2];
        }
        contacts.push({ mesh: cabin.damagedScreen, model: body, style: MATERIAL.crackedScreen, panes: [car.glass[0], origin, 0, 0] });
      }
    }
    for (const part of debris) {
      if (!part.debris || Math.hypot(part.x - car.x, part.z - car.z) > far) continue;
      const index = detachableParts.findIndex(spec => spec.kind === part.kind);
      const spec = detachableParts[index];
      const pivot = transform(part.x, part.z, part.heading, part.y, 0, part.pitch);
      const model = multiply(pivot, translate(-spec.x, -spec.y, -spec.z));
      addComponent(objects, index, { model, bounds: volume(part.x, part.y - 0.9, part.z, 1.25, 1.8) });
    }
    return { objects, contacts };
  }

  return { scene };
}
