import { buildAvant, AVANT_WHEELS } from './avant.js';
import { multiply, rotateX, rotateY, transform, translate } from './math.js';
import { color, Mesh } from './mesh.js';
import { MATERIAL } from './renderer.js';

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
  const avant = Object.fromEntries(['body', 'paint', 'glass', 'wheel', 'tailLights', 'brakeLights', 'reverseLights'].map(name => [name, new Mesh()]));
  buildAvant(avant);
  const cityCar = buildTrafficCar();
  const contact = new Mesh();
  contact.quad([-1.36, 0.027, -2.86], [-1.36, 0.027, 2.86], [1.36, 0.027, 2.86], [1.36, 0.027, -2.86], '#191a1c');
  const lenses = ['#ff5942', '#ffbd48', '#63f381'].map(fill => {
    const mesh = new Mesh();
    mesh.sphere(0, 0, 0, 0.091, 0.091, 0.026, fill, 8, 4);
    return mesh;
  });
  for (const mesh of [...Object.values(avant), ...Object.values(cityCar), contact, ...lenses]) renderer.upload(mesh);

  function scene(car, traffic, signals, signalColor, showBody, far) {
    const objects = [], contacts = [];
    for (const actor of traffic) {
      if (Math.hypot(actor.x - car.x, actor.z - car.z) > far) continue;
      const model = transform(actor.x, actor.z, actor.heading);
      objects.push(
        { mesh: cityCar.paint, model, style: MATERIAL.paint, tint: color(actor.color), castsShadow: true },
        { mesh: cityCar.trim, model },
        { mesh: cityCar.glass, model, style: MATERIAL.glass },
        { mesh: cityCar.tail, model, emission: actor.braking ? 1.2 : 0.25 },
      );
      if (Math.hypot(actor.x - car.x, actor.z - car.z) < 34) contacts.push({ mesh: contact, model, style: MATERIAL.contact });
    }
    for (const signal of signals) {
      if (Math.hypot(signal.x - car.x, signal.z - car.z) > 72) continue;
      const phase = signalColor(signal.axis, signal.intersectionX, signal.intersectionZ);
      const index = ['red', 'amber', 'green'].indexOf(phase);
      objects.push({ mesh: lenses[index], model: transform(signal.x, signal.z, signal.heading, signal.y + (1 - index) * 0.24), emission: 0.48 });
    }
    if (showBody) {
      const body = transform(car.x, car.z, car.heading, car.heave, car.roll, car.pitch);
      contacts.push({ mesh: contact, model: transform(car.x, car.z, car.heading), style: MATERIAL.contact });
      objects.push(
        { mesh: avant.body, model: body, castsShadow: true },
        { mesh: avant.paint, model: body, style: MATERIAL.paint, castsShadow: true },
        { mesh: avant.glass, model: body, style: MATERIAL.glass },
        { mesh: avant.tailLights, model: body, emission: 0.42 },
        { mesh: avant.brakeLights, model: body, emission: car.brakeLights ? 2.6 : 0.05 },
        { mesh: avant.reverseLights, model: body, emission: car.reverseLights ? 1.6 : 0 },
      );
      const chassis = transform(car.x, car.z, car.heading);
      for (const side of [-1, 1]) {
        for (const z of [AVANT_WHEELS.front, AVANT_WHEELS.rear]) {
          const mount = translate(side * AVANT_WHEELS.halfTrack, AVANT_WHEELS.radius, z);
          const rotation = multiply(rotateY(z > 0 ? car.steer : 0), rotateX(car.spin));
          const model = multiply(chassis, multiply(mount, rotation));
          objects.push({ mesh: avant.wheel, model, castsShadow: true });
        }
      }
    }
    return { objects, contacts };
  }

  return { scene };
}
