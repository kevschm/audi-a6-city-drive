// Original C4 Avant geometry in metres. The model faces +Z, with Y up.
export const AVANT_WHEELS = Object.freeze({ halfTrack: .759, radius: .315, front: 1.39, rear: -1.30 });

const rgb = (r, g, b) => [r / 255, g / 255, b / 255];
const lacquer = rgb(25, 30, 36);
const paintEdge = rgb(29, 34, 41);
const rubber = rgb(23, 25, 27);
const seal = rgb(15, 19, 23);
const molding = rgb(32, 36, 39);
const nickel = rgb(132, 147, 157);
const chrome = rgb(190, 203, 209);
const blackGlass = rgb(40, 54, 63);
const glassTop = rgb(66, 85, 96);
const tau = Math.PI * 2;
const sides = [-1, 1];

function face(mesh, outward, color, ...points) {
  points = points.filter((point, index) => point.some((value, axis) => Math.abs(value - points[(index + 1) % points.length][axis]) > 1e-7));
  if (points.length < 3) return;
  const [a, b, c] = points;
  const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
  const u = c[0] - a[0], v = c[1] - a[1], w = c[2] - a[2];
  const normalDirection = outward[0] * (y * w - z * v)
    + outward[1] * (z * u - x * w) + outward[2] * (x * v - y * u);
  if (normalDirection < 0) points.reverse();
  if (points.length === 3) mesh.tri(...points, color);
  else mesh.quad(...points, color);
}

const lerp = (a, b, amount) => a + (b - a) * amount;
const pointBetween = (a, b, amount) => a.map((v, i) => lerp(v, b[i], amount));

// Ribbon projected onto a panel, used for gaskets, shut lines, and pressed creases.
function trace(mesh, points, width, outward, color) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
    const offset = [y * outward[2] - z * outward[1], z * outward[0] - x * outward[2], x * outward[1] - y * outward[0]];
    const length = Math.hypot(...offset);
    if (length < 1e-7) continue;
    const edge = (p, direction) => p.map((v, j) => v + direction * offset[j] * width / (2 * length));
    face(mesh, outward, color, edge(a, -1), edge(b, -1), edge(b, 1), edge(a, 1));
  }
}

// Cross-sections through the bonnet, quarters and wings. Each lists longitudinal
// position, sill width, widest flank, shoulder width, shoulder height and deck crown.
const stations = [
  [-2.39, .68, .69, .67, .865, .882],
  [-2.35, .76, .79, .76, .920, .972],
  [-2.27, .81, .85, .79, .975, 1.032],
  [-2.11, .829, .87, .81, .998, 1.067],
  [-1.62, .843, .887, .827, 1.001, 1.069],
  [-.93, .836, .881, .837, 1.014, 1.068],
  [0, .825, .874, .837, 1.025, 1.072],
  [.99, .839, .881, .831, 1.030, 1.077],
  [1.43, .84, .887, .823, 1.024, 1.061],
  [1.96, .813, .863, .801, .981, 1.018],
  [2.2, .783, .826, .768, .937, .986],
  [2.33, .735, .774, .725, .908, .958],
  [2.39, .655, .690, .670, .884, .930],
];

const archRadius = .365;
const sillHeight = .235;

function bodySection(z) {
  const right = stations.findIndex(s => s[0] >= z);
  if (right < 1) return stations[Math.max(0, right)];
  const left = stations[right - 1], end = stations[right];
  return pointBetween(left, end, (z - left[0]) / (end[0] - left[0]));
}

function wheelOpening(z) {
  const distance = Math.min(Math.abs(z - AVANT_WHEELS.front), Math.abs(z - AVANT_WHEELS.rear));
  if (distance >= archRadius - 1e-8) return sillHeight;
  return AVANT_WHEELS.radius + Math.sqrt(archRadius ** 2 - distance ** 2);
}

function flankPoint(side, z, y) {
  const [, sill, flank, shoulder, shoulderY] = bodySection(z);
  const widestY = .735;
  const width = y <= widestY ? lerp(sill, flank, (y - sillHeight) / (widestY - sillHeight))
    : lerp(flank, shoulder, (y - widestY) / (shoulderY - widestY));
  return [side * width, y, z];
}

function bodyPoint(side, z, y) {
  const pt = flankPoint(side, z, y);
  pt[0] += side * .005;
  return pt;
}

function flankTrace(mesh, side, points, width, color) {
  for (let i = 1; i < points.length; i++) {
    const [z0, y0] = points[i - 1], [z1, y1] = points[i];
    const cuts = [0, 1, (.735 - y0) / (y1 - y0), ...stations.map(([z]) => (z - z0) / (z1 - z0))];
    const path = cuts.filter(t => t >= 0 && t <= 1).sort((a, b) => a - b)
      .map(t => bodyPoint(side, lerp(z0, z1, t), lerp(y0, y1, t)));
    trace(mesh, path, width, [side, 0, 0], color);
  }
}

function buildShell(body, paint) {
  const longitudinal = stations.map(station => station[0]);
  for (const axle of [AVANT_WHEELS.rear, AVANT_WHEELS.front]) {
    for (let step = 0; step <= 16; step++) longitudinal.push(axle - archRadius * Math.cos(Math.PI * step / 16));
    longitudinal.push(axle - archRadius + .001, axle + archRadius - .001);
  }
  longitudinal.sort((a, b) => a - b);

  for (let i = 1; i < longitudinal.length; i++) {
    const za = longitudinal[i - 1], zb = longitudinal[i];
    const [, , , wa, ya, ca] = bodySection(za), [, , , wb, yb, cb] = bodySection(zb);
    for (const side of sides) {
      const out = [side, 0, 0];
      const a = flankPoint(side, za, wheelOpening(za)), b = flankPoint(side, zb, wheelOpening(zb));
      const crease = .735;
      face(paint, out, lacquer, a, b, flankPoint(side, zb, crease), flankPoint(side, za, crease));
      face(paint, [side, .35, 0], paintEdge, flankPoint(side, za, crease), flankPoint(side, zb, crease), [side * wb, yb, zb], [side * wa, ya, za]);
      // Rolled inner lip follows the real wheel cutout, with dark inner fenders.
      const behind = point => [point[0] - side * .064, point[1] - .008, point[2]];
      face(body, [0, -1, 0], seal, a, behind(a), behind(b), b);
      face(paint, [0, 1, 0], lacquer, [side * wa, ya, za], [side * wb, yb, zb], [side * .58 * wb, cb - .016, zb], [side * .58 * wa, ca - .016, za]);
      face(paint, [0, 1, 0], paintEdge, [side * .58 * wa, ca - .016, za], [side * .58 * wb, cb - .016, zb], [0, cb, zb], [0, ca, za]);
      const trimY = .714;
      trace(body, [bodyPoint(side, za, trimY), bodyPoint(side, zb, trimY)], .029, out, molding);
      if (wheelOpening((za + zb) / 2) === sillHeight) {
        trace(body, [bodyPoint(side, za, .284), bodyPoint(side, zb, .284)], .032, out, rubber);
      }
    }
  }

  for (const end of sides) {
    const z = end * 2.39, [, low, , topWidth, top, crown] = bodySection(z);
    const out = [0, 0, end];
    face(paint, out, lacquer, [-low, sillHeight, z], [low, sillHeight, z], [topWidth, top, z], [-topWidth, top, z]);
    face(paint, out, paintEdge, [-topWidth, top, z], [topWidth, top, z], [0, crown, z]);
    bumper(paint, body, end);
  }

  for (const side of sides) {
    const out = [side, .15, 0];
    for (const [z0, z1, bottom] of [[-1.28, -.96, .35], [-.15, -.15, .304], [.80, .94, .304]]) {
      flankTrace(body, side, [[z0, .994], [z1, .653], [z1 + .022, bottom + .012]], .009, seal);
    }
    for (const z of [-1.086, .03]) {
      trace(body, [bodyPoint(side, z - .12, .919), bodyPoint(side, z + .075, .919)], .043, out, seal);
      const handle = y => [z - .103, z + .059].map(zz => {
        const p = bodyPoint(side, zz, y);
        p[0] += side * .004;
        return p;
      });
      face(body, out, rgb(70, 75, 78), ...handle(.934), ...handle(.921).reverse());
    }
    trace(body, [[side * .758, 1.059, 1.04], [side * .572, 1.042, 1.64], [side * .494, .963, 2.26]], .011, [0, 1, 0], lacquer);
    const badge = bodyPoint(side, 1.815, .827);
    trace(body, [[badge[0], badge[1], badge[2]], [badge[0] - side * .004, badge[1] + .002, badge[2] + .062]], .031, out, rgb(208, 153, 75));
  }
}

function bumper(paint, body, end) {
  const out = [0, 0, end];
  // The section steps back at the ends so the bumpers wrap onto both quarters.
  const edge = [[-.862, 2.255], [-.820, 2.327], [-.675, 2.398], [-.530, 2.412], [.530, 2.412], [.675, 2.398], [.820, 2.327], [.862, 2.255]];
  for (let i = 1; i < edge.length; i++) {
    const [xa, za] = edge[i - 1], [xb, zb] = edge[i];
    const a = (y, inset = 0) => [xa, y, end * (za - inset)];
    const b = (y, inset = 0) => [xb, y, end * (zb - inset)];
    face(paint, out, lacquer, a(.42), b(.42), b(.625), a(.625));
    face(body, out, molding, a(.586, -.003), b(.586, -.003), b(.639, -.003), a(.639, -.003));
    face(body, [0, -1, 0], rubber, a(.42), b(.42), b(.347, .048), a(.347, .048));
    face(paint, [0, 1, 0], paintEdge, a(.639), b(.639), b(.656, .095), a(.656, .095));
  }
}

const cabinLine = [
  // Lower z, upper z, belt height, roof height, lower width, roof width.
  [-2.230, -1.91, 1.029, 1.338, .756, .651],
  [-1.951, -1.80, 1.052, 1.383, .815, .669],
  [-1.28, -1.237, 1.061, 1.394, .825, .688],
  [-.676, -.651, 1.066, 1.407, .830, .699],
  [-.146, -.187, 1.070, 1.406, .830, .699],
  [ .752,  .324, 1.068, 1.408, .822, .693],
  [ 1.115,  .473, 1.066, 1.366, .782, .681],
];

function cabinPoint(side, section, height, offset = 0) {
  const [z0, z1, y0, y1, w0, w1] = section;
  return [side * (lerp(w0, w1, height) + offset), lerp(y0, y1, height), lerp(z0, z1, height)];
}

function buildCabin(body, paint, glass) {
  for (let i = 1; i < cabinLine.length; i++) {
    const a = cabinLine[i - 1], b = cabinLine[i];
    for (const side of sides) {
      const out = [side, .37, 0];
      face(paint, out, lacquer, cabinPoint(side, a, 0), cabinPoint(side, b, 0), cabinPoint(side, b, 1), cabinPoint(side, a, 1));
      const edgeA = cabinPoint(side, a, 1), edgeB = cabinPoint(side, b, 1);
      const roof = v => [v[0] * .84, v[1] + .026, v[2]];
      face(paint, [0, 1, 0], paintEdge, edgeA, edgeB, roof(edgeB), roof(edgeA));
      face(paint, [0, 1, 0], lacquer, roof(edgeA), roof(edgeB), [.0, edgeB[1] + .035, edgeB[2]], [.0, edgeA[1] + .035, edgeA[2]]);
    }
  }
  for (const side of sides) {
    const out = [side, .36, 0];
    // Rear quarter glass, rear door, and front door, each with a continuous gasket.
    for (const [first, last, insetA, insetB] of [[0, 2, .175, .075], [2, 4, .075, .033], [4, 6, .033, .092]]) {
      // The pillars are placed by cross-section interpolation so window edges follow the body.
      const p0 = (i, f) => pointBetween(cabinLine[i], cabinLine[i + 1], f);
      const start = p0(first, insetA), end = p0(last - 1, 1 - insetB);
      const sections = [start, ...cabinLine.slice(first + 1, last), end];
      for (let i = 1; i < sections.length; i++) {
        const a = sections[i - 1], b = sections[i];
        const f = (s, height, offset = .004) => cabinPoint(side, s, height, offset);
        const trim = [f(a, .082), f(b, .082), f(b, .887), f(a, .887)];
        face(body, out, seal, ...trim);
        const windowPoint = (s, f, height) => cabinPoint(side, pointBetween(s, f, .011), height, .007);
        const left = i === 1 ? b : a, right = i === sections.length - 1 ? a : b;
        face(glass, out, blackGlass, windowPoint(a, left, .121), windowPoint(b, right, .121), windowPoint(b, right, .57), windowPoint(a, left, .57));
        face(glass, out, glassTop, windowPoint(a, left, .57), windowPoint(b, right, .57), windowPoint(b, right, .855), windowPoint(a, left, .855));
        trace(body, [f(a, .074, .008), f(b, .074, .008)], .011, out, nickel);
      }
    }

    // Roof rack with tapered rails and attachment feet.
    const railX = side * .537;
    for (const z of [-1.65, -.73, .26]) {
      const pos = z > .1 ? 0 : z < -1.0 ? -.014 : .012;
      body.box(railX - .031, 1.405 + pos, z - .059, railX + .031, 1.471 + pos, z + .049, molding);
    }
    const rail = [[railX, 1.424, -1.811], [railX, 1.488, -1.56], [railX, 1.498, -.67], [railX, 1.484, .218], [railX, 1.431, .393]];
    sweep(body, rail, .025, 6, rgb(83, 89, 93));

    // Folded mirrors and blue-grey mirror glass insert.
    sweep(body, [[side * .774, 1.091, .834], [side * .89, 1.101, .805]], .045, 6, molding);
    const shell = (x, y, z) => [side * x, y, z];
    face(paint, [0, 0, 1], lacquer, shell(.852, 1.060, .860), shell(1.001, 1.074, .836), shell(.991, 1.159, .832), shell(.859, 1.166, .856));
    face(paint, [0, 1, 0], paintEdge, shell(.859, 1.166, .856), shell(.991, 1.159, .832), shell(1.016, 1.149, .762), shell(.855, 1.167, .757));
    face(paint, [side, 0, 0], lacquer, shell(1.001, 1.074, .836), shell(1.012, 1.076, .765), shell(1.016, 1.149, .762), shell(.991, 1.159, .832));
    face(body, [0, 0, -1], seal, shell(.852, 1.062, .757), shell(1.012, 1.076, .765), shell(1.016, 1.149, .762), shell(.855, 1.167, .757));
    face(glass, [0, 0, -1], glassTop, shell(.866, 1.077, .748), shell(.998, 1.087, .756), shell(1.002, 1.138, .754), shell(.867, 1.153, .748));
  }

  for (const end of sides) buildWindscreen(body, paint, glass, end);
}

function windscreenPoint(end, x, h, offset = 0) {
  const station = end === -1 ? cabinLine[0] : cabinLine.at(-1);
  const p = cabinPoint(1, station, h);
  return [x * p[0], p[1] + offset, p[2] + end * (offset + .048 * (1 - x * x))];
}

function buildWindscreen(body, paint, glass, end) {
  const station = end === -1 ? cabinLine[0] : cabinLine.at(-1);
  const out = [0, 1, end];
  const at = (x, h, offset) => windscreenPoint(end, x, h, offset);
  const rows = [-1, -.91, -.55, 0, .55, .91, 1];
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    face(paint, out, lacquer, at(a, 0), at(b, 0), at(b, 1), at(a, 1));
    face(paint, [0, 1, 0], paintEdge, at(a, 1), at(b, 1),
      [at(b, 1)[0], station[3] + .033 * (1 - b * b), station[1]], [at(a, 1)[0], station[3] + .033 * (1 - a * a), station[1]]);
    if (i === 1 || i === rows.length - 1) continue;
    face(body, out, seal, at(a, .059, .005), at(b, .059, .005), at(b, .925, .005), at(a, .925, .005));
    face(glass, out, blackGlass, at(a, .095, .010), at(b, .095, .010), at(b, .51, .010), at(a, .51, .010));
    face(glass, out, glassTop, at(a, .51, .010), at(b, .51, .010), at(b, .891, .010), at(a, .891, .010));
  }
  if (end < 0) {
    for (const h of [.22, .34, .46, .58, .70, .82]) {
      const tint = h < .51 ? rgb(48, 56, 60) : rgb(73, 84, 91);
      trace(glass, rows.slice(1, -1).map(x => at(x, h, .018)), .004, out, tint);
    }
    trace(body, [at(.065, .084, .018), at(.11, .237, .018), at(-.56, .305, .018)], .016, out, seal);
  } else {
    for (const offset of [-.42, .31]) {
      trace(body, [at(offset, .08, .015), at(offset + .09, .205, .018), at(offset - .26, .247, .021)], .015, out, seal);
    }
  }
}

// A short polygon tube in arbitrary orientation, used for hardware and exhaust.
function sweep(mesh, points, radius, facets, color) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const tangent = b.map((v, j) => v - a[j]);
    const [x, y, z] = tangent;
    const horizontal = Math.hypot(x, z);
    const u = horizontal < 1e-7 ? [1, 0, 0] : [z / horizontal, 0, -x / horizontal];
    const length = Math.hypot(x, y, z);
    const v = [(y * u[2] - z * u[1]) / length, (z * u[0] - x * u[2]) / length, (x * u[1] - y * u[0]) / length];
    const offset = angle => u.map((value, j) => value * Math.cos(angle) + v[j] * Math.sin(angle));
    const around = (p, angle) => offset(angle).map((q, j) => p[j] + q * radius);
    for (let facet = 0; facet < facets; facet++) {
      const angle = facet * tau / facets, nextAngle = (facet + 1) * tau / facets;
      face(mesh, offset((angle + nextAngle) / 2), color, around(a, angle), around(b, angle), around(b, nextAngle), around(a, nextAngle));
    }
  }
}

const glyphs = {
  K: [[[0, 0], [0, 1]], [[0, .48], [.9, 1]], [[0, .48], [1, 0]]],
  L: [[[0, 1], [0, 0], [1, 0]]],
  A: [[[0, 0], [.5, 1], [1, 0]], [[.25, .47], [.75, .47]]],
  6: [[[.95, .91], [.31, .95], [.03, .65], [.03, .17], [.25, .02], [.8, .02], [.96, .15], [.96, .42], [.73, .55], [.06, .52]]],
  0: [[[.2, .02], [.77, .02], [.96, .24], [.96, .82], [.77, .98], [.2, .98], [.03, .82], [.03, .24], [.2, .02]]],
  4: [[[.78, 0], [.78, 1], [.01, .29], [1, .29]]],
};

function plate(body, end, y) {
  const outward = [0, 0, end];
  // +X is the driver's right in the game's view convention.
  const at = (x, height, depth) => [-x * end, y + height, end * depth];
  const panel = (x0, y0, x1, y1, depth, color) => face(body, outward, color, at(x0, y0, depth), at(x1, y0, depth), at(x1, y1, depth), at(x0, y1, depth));
  panel(-.272, -.061, .272, .061, 2.421, molding);
  panel(-.256, -.051, .256, .051, 2.425, rgb(222, 222, 213));
  panel(-.254, -.049, -.215, .049, 2.427, rgb(34, 66, 124));
  for (const [i, char] of [...'KL A 604'].entries()) {
    if (!glyphs[char]) continue;
    for (const path of glyphs[char]) {
      trace(body, path.map(([x, h]) => at(-.19 + i * .050 + x * .032, -.031 + h * .062, 2.427)), .007, outward, seal);
    }
  }
}

function rings(mesh, end, y, z) {
  const out = [0, 0, end];
  for (const index of [0, 1, 2, 3]) {
    const cx = (index - 1.5) * .037;
    const at = (r, a) => [cx + r * Math.cos(a), y + r * Math.sin(a), end * z];
    for (let i = 0; i < 18; i++) {
      const a = i * tau / 18, b = (i + 1) * tau / 18;
      face(mesh, out, chrome, at(.024, a), at(.0185, a), at(.0185, b), at(.024, b));
    }
  }
}

function lampPanel(mesh, outward, point, bend, color, x0, x1, y0, y1, y2, y3, depth = 0) {
  const cuts = bend > x0 && bend < x1 ? [x0, bend, x1] : [x0, x1];
  const edge = (x, a, b) => point(x, lerp(a, b, (x - x0) / (x1 - x0)), depth);
  for (let i = 1; i < cuts.length; i++) {
    const a = cuts[i - 1], b = cuts[i];
    face(mesh, outward, color, edge(a, y0, y1), edge(b, y0, y1), edge(b, y3, y2), edge(a, y3, y2));
  }
}

function buildLighting(body, tailLights, brakeLights, reverseLights) {
  const grilleEdge = [0, 0, 1];
  const front = (x, y, z) => [x, y, z];
  face(body, grilleEdge, nickel, front(-.334, .751, 2.396), front(.334, .751, 2.396), front(.361, .895, 2.396), front(-.361, .895, 2.396));
  face(body, grilleEdge, seal, front(-.321, .762, 2.402), front(.321, .762, 2.402), front(.347, .884, 2.402), front(-.347, .884, 2.402));
  for (let i = 0; i < 6; i++) {
    const y = .775 + i * .018;
    trace(body, [front(-.315, y, 2.406), front(.315, y, 2.406)], .006, grilleEdge, rgb(77, 85, 92));
  }
  rings(body, 1, .838, 2.413);
  rings(body, -1, .981, 2.371);
  plate(body, 1, .507);
  plate(body, -1, .772);

  for (const side of sides) {
    const hd = (x, y, z) => [x * side, y, z];
    const frontOut = [side * .32, 0, 1];
    const lamp = (x, y, depth = 0) => hd(x, y, 2.395 - Math.max(0, x - .59) * .385 + depth);
    lampPanel(body, frontOut, lamp, .59, seal, .366, .831, .731, .745, .897, .901);
    lampPanel(body, frontOut, lamp, .59, rgb(160, 174, 174), .377, .817, .746, .754, .882, .886, .001);
    lampPanel(body, frontOut, lamp, .59, rgb(218, 227, 220), .382, .727, .765, .769, .865, .871, .002);
    lampPanel(body, frontOut, lamp, .59, rgb(179, 168, 139), .731, .818, .758, .759, .876, .877, .003);
    for (let i = 0; i < 20; i++) {
      const x = .391 + i * .016;
      trace(body, [lamp(x, .767, .004), lamp(x, .867, .004)], .0028, frontOut, rgb(173, 186, 185));
    }
    face(body, [0, 0, 1], seal, hd(.337, .475, 2.416), hd(.686, .475, 2.397), hd(.677, .543, 2.402), hd(.337, .543, 2.416));
    face(body, [0, 0, 1], rgb(179, 184, 168), hd(.545, .488, 2.414), hd(.659, .488, 2.406), hd(.656, .530, 2.407), hd(.545, .530, 2.414));

    const tailOut = [side * .32, 0, -1];
    const tail = (x, y, depth = 0) => [side * x, y, -(2.395 - Math.max(0, x - .658) * .325 + depth)];
    lampPanel(body, tailOut, tail, .658, seal, .470, .835, .730, .723, .970, .971);
    lampPanel(tailLights, tailOut, tail, .658, rgb(131, 38, 44), .480, .828, .797, .791, .838, .840, .007);
    lampPanel(brakeLights, tailOut, tail, .658, rgb(160, 41, 46), .480, .830, .844, .843, .955, .956, .010);
    for (let i = 0; i < 4; i++) {
      const y = .850 + i * .024;
      trace(brakeLights, [tail(.486, y, .012), tail(.658, y, .012), tail(.827, y, .012)], .004, tailOut, rgb(111, 24, 33));
    }
    lampPanel(reverseLights, tailOut, tail, .658, rgb(127, 132, 129), .480, .670, .739, .738, .790, .794, .008);
    lampPanel(body, tailOut, tail, .658, rgb(151, 97, 49), .674, .827, .736, .734, .786, .791, .008);
    // Short continuation of the rear light into the quarter panel.
    face(tailLights, tailOut, rgb(115, 30, 37), tail(.826, .792, .010), [side * .865, .796, -2.252], [side * .863, .935, -2.253], tail(.826, .958, .010));
  }

  const high = (x, h) => windscreenPoint(-1, x, h, .020);
  face(brakeLights, [0, 1, -1], rgb(154, 36, 41), high(-.24, .820), high(.24, .820), high(.24, .887), high(-.24, .887));
  for (const x of [-.606, -.521]) {
    sweep(body, [[x, .293, -2.232], [x, .277, -2.386]], .033, 10, nickel);
    const tip = a => [x + .027 * Math.cos(a), .277 + .025 * Math.sin(a), -2.386];
    for (let i = 0; i < 10; i++) {
      face(body, [0, 0, -1], seal, [x, .277, -2.379], tip(i * tau / 10), tip((i + 1) * tau / 10));
    }
  }
}

function buildWheel(wheel) {
  const segments = 32;
  const angle = i => i * tau / segments;
  const p = (x, r, a) => [x, Math.sin(a) * r, Math.cos(a) * r];
  const tread = [[-.1045, .233], [-.1045, .272], [-.101, .293], [-.086, .307], [-.054, .315], [.054, .315], [.086, .307], [.101, .293], [.1045, .272], [.1045, .233]];
  for (let i = 0; i < segments; i++) {
    const a = angle(i), b = angle(i + 1), middle = angle(i + .5);
    for (let j = 1; j < tread.length; j++) {
      const [x0, r0] = tread[j - 1], [x1, r1] = tread[j];
      const normal = [(r0 - r1) * 12, Math.sin(middle), Math.cos(middle)];
      face(wheel, normal, j >= 4 && j <= 6 ? rgb(30, 31, 32) : rubber, p(x0, r0, a), p(x1, r1, a), p(x1, r1, b), p(x0, r0, b));
    }
    for (const side of sides) {
      face(wheel, [0, Math.sin(middle), Math.cos(middle)], seal, p(side * .059, .3155, a), p(side * .079, .310, a + .041), p(side * .079, .310, a + .061), p(side * .059, .3155, a + .021));
      const ring = (x, r, a) => p(side * x, r, a);
      const disk = (x, r, color) => face(wheel, [side, 0, 0], color, [side * x, 0, 0], ring(x, r, a), ring(x, r, b));
      const strip = (x0, r0, x1, r1, color) => face(wheel, [side, 0, 0], color, ring(x0, r0, a), ring(x1, r1, a), ring(x1, r1, b), ring(x0, r0, b));
      strip(.103, .233, .108, .224, rgb(108, 119, 125));
      strip(.108, .224, .109, .213, chrome);
      strip(.109, .213, .095, .204, nickel);
      disk(.090, .209, rgb(48, 55, 58));
      disk(.096, .155, rgb(66, 69, 70));
      strip(.106, .072, .112, .056, rgb(145, 157, 161));
      disk(.113, .057, chrome);
      disk(.115, .029, nickel);
    }
  }
  for (const side of sides) {
    const out = [side, 0, 0];
    for (let spoke = 0; spoke < 6; spoke++) {
      const a = spoke * tau / 6;
      const q = (x, radius, offset) => p(side * x, radius, a + offset);
      face(wheel, out, rgb(173, 186, 190), q(.112, .063, -.27), q(.106, .213, -.105), q(.107, .213, .060), q(.111, .063, .26));
      face(wheel, out, rgb(114, 129, 139), q(.111, .063, .26), q(.107, .213, .060), q(.097, .212, .138), q(.100, .065, .48));
    }
  }
}

export function buildAvant({ body, paint, glass, wheel, tailLights, brakeLights, reverseLights }) {
  buildShell(body, paint);
  buildCabin(body, paint, glass);
  buildLighting(body, tailLights, brakeLights, reverseLights);
  buildWheel(wheel);
}
