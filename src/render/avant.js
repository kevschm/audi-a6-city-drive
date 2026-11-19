// Photo-referenced C5 Avant geometry in metres. The model faces +Z, with Y up.
export const AVANT_WHEELS = Object.freeze({ halfTrack: .759, radius: .315, front: 1.39, rear: -1.30 });

const rgb = (r, g, b) => [r / 255, g / 255, b / 255];
const lacquer = rgb(16, 19, 21);
const paintEdge = rgb(23, 28, 34);
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
  panel(mesh, outward, color, points);
}

function panel(mesh, outward, color, points, normalAt, material) {
  points = points.filter((point, index) => point.some((value, axis) => Math.abs(value - points[(index + 1) % points.length][axis]) > 1e-7));
  if (points.length < 3) return;
  const [a, b, c] = points;
  const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
  const u = c[0] - a[0], v = c[1] - a[1], w = c[2] - a[2];
  const normalDirection = outward[0] * (y * w - z * v)
    + outward[1] * (z * u - x * w) + outward[2] * (x * v - y * u);
  if (normalDirection < 0) points.reverse();
  const normals = normalAt && points.map(normalAt);
  if (points.length === 3) mesh.tri(...points, color, material, normals);
  else mesh.quad(...points, color, material, normals);
}

const lerp = (a, b, amount) => a + (b - a) * amount;
const pointBetween = (a, b, amount) => a.map((v, i) => lerp(v, b[i], amount));

function surfaceNormal(point, a, b, outward) {
  const step = .0005;
  const da0 = point(a - step, b), da1 = point(a + step, b);
  const db0 = point(a, b - step), db1 = point(a, b + step);
  const [ax, ay, az] = da1.map((value, axis) => value - da0[axis]);
  const [bx, by, bz] = db1.map((value, axis) => value - db0[axis]);
  const normal = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
  const length = Math.hypot(...normal);
  if (!length) return outward;
  const orientation = normal.reduce((sum, value, axis) => sum + value * outward[axis], 0) < 0 ? -1 : 1;
  return normal.map(value => orientation * value / length);
}

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
  if (right < 0) return stations.at(-1);
  if (!right) return stations[0];
  const left = stations[right - 1], end = stations[right];
  const span = end[0] - left[0], t = (z - left[0]) / span;
  const before = stations[Math.max(0, right - 2)], after = stations[Math.min(stations.length - 1, right + 1)];
  // Shape-preserving Hermite loft. Flatten the tangent at a local maximum
  // instead of overshooting the surveyed section or kinking the highlight.
  const tangent = (a, b) => a * b <= 0 ? 0 : 2 * a * b / (a + b);
  return left.map((value, i) => {
    if (!i) return z;
    const secant = (end[i] - value) / span;
    const m0 = before === left ? secant : tangent((value - before[i]) / (left[0] - before[0]), secant);
    const m1 = after === end ? secant : tangent(secant, (after[i] - end[i]) / (after[0] - end[0]));
    return lerp(value, end[i], t * t * (3 - 2 * t)) + span * t * (1 - t) * ((1 - t) * m0 - t * m1);
  });
}

function wheelOpening(z) {
  const distance = Math.min(Math.abs(z - AVANT_WHEELS.front), Math.abs(z - AVANT_WHEELS.rear));
  if (distance >= archRadius - 1e-8) {
    // The sill sweeps up behind each wheel into the valance.
    const t = Math.min(1, Math.max(0, (Math.abs(z) - 1.72) / .61));
    return sillHeight + .135 * t * t * (3 - 2 * t);
  }
  return AVANT_WHEELS.radius + Math.sqrt(archRadius ** 2 - distance ** 2);
}

function flankPoint(side, z, y) {
  const [, sill, flank, shoulder, shoulderY] = bodySection(z);
  const widestY = .735;
  const width = y <= widestY ? lerp(sill, flank, 1 - (1 - (y - sillHeight) / (widestY - sillHeight)) ** 1.55)
    : lerp(flank, shoulder, ((y - widestY) / (shoulderY - widestY)) ** 1.35);
  const axleDistance = Math.min(Math.hypot(z - AVANT_WHEELS.front, y - AVANT_WHEELS.radius),
    Math.hypot(z - AVANT_WHEELS.rear, y - AVANT_WHEELS.radius));
  const lip = .030 * Math.exp(-((axleDistance - archRadius - .032) ** 2) / .0028);
  return [side * (width + lip), y, z];
}

function bodyPoint(side, z, y) {
  const pt = flankPoint(side, z, y);
  pt[0] += side * .005;
  return pt;
}

function flankTrace(mesh, side, points, width, color) {
  for (let i = 1; i < points.length; i++) {
    const [z0, y0] = points[i - 1], [z1, y1] = points[i];
    const cuts = [0, .2, .4, .6, .8, 1, (.735 - y0) / (y1 - y0), ...stations.map(([z]) => (z - z0) / (z1 - z0))];
    const path = cuts.filter(t => t >= 0 && t <= 1).sort((a, b) => a - b)
      .map(t => bodyPoint(side, lerp(z0, z1, t), lerp(y0, y1, t)));
    trace(mesh, path, width, [side, 0, 0], color);
  }
}

function deckPoint(side, z, fraction) {
  const [, , , width, height, crown] = bodySection(z);
  const ridge = Math.exp(-((Math.abs(fraction) - .72) ** 2) / .013);
  const hood = Math.max(0, Math.min(1, (z - .92) * 3, (2.39 - z) * 7));
  return [side * width * fraction, crown - (crown - height) * Math.abs(fraction) ** 2.1 + .010 * ridge * hood, z];
}

function buildShell(body, paint, components) {
  const longitudinal = stations.map(station => station[0]);
  longitudinal.push(-2.23, 1.115);
  for (let z = -2.28; z < 2.34; z += .095) longitudinal.push(z);
  for (const axle of [AVANT_WHEELS.rear, AVANT_WHEELS.front]) {
    for (let step = 0; step <= 16; step++) longitudinal.push(axle - archRadius * Math.cos(Math.PI * step / 16));
    longitudinal.push(axle - archRadius + .001, axle + archRadius - .001);
  }
  longitudinal.sort((a, b) => a - b);

  for (let i = 1; i < longitudinal.length; i++) {
    const za = longitudinal[i - 1], zb = longitudinal[i];
    const [, , , , ya] = bodySection(za), [, , , , yb] = bodySection(zb);
    for (const side of sides) {
      const out = [side, 0, 0];
      const crease = .735;
      const lowA = wheelOpening(za), lowB = wheelOpening(zb);
      const flank = (z, y) => flankPoint(side, z, y);
      const flankNormal = ([, y, z]) => surfaceNormal(flank, z, y, out);
      const levelsA = [lowA, lerp(lowA, crease, .12), lerp(lowA, crease, .52), crease, lerp(crease, ya, .55), ya];
      const levelsB = [lowB, lerp(lowB, crease, .12), lerp(lowB, crease, .52), crease, lerp(crease, yb, .55), yb];
      for (let level = 1; level < levelsA.length; level++) {
        panel(paint, out, lacquer, [flank(za, levelsA[level - 1]), flank(zb, levelsB[level - 1]),
          flank(zb, levelsB[level]), flank(za, levelsA[level])], flankNormal);
      }
      const a = flank(za, lowA), b = flank(zb, lowB);
      // Rolled inner lip follows the real wheel cutout, with dark inner fenders.
      const behind = point => [point[0] - side * .064, point[1] - .008, point[2]];
      face(body, [0, -1, 0], seal, a, behind(a), behind(b), b);
      const up = [0, 1, 0];
      const deck = (z, fraction) => deckPoint(side, z, fraction);
      const deckNormal = ([x, , z]) => surfaceNormal(deck, z, Math.abs(x) / bodySection(z)[3], up);
      const fractions = za >= -2.23 && zb <= 1.115 ? [.92, 1] : [0, .32, .56, .67, .72, .79, .91, 1];
      for (let strip = 1; strip < fractions.length; strip++) {
        const from = fractions[strip - 1], to = fractions[strip];
        panel(paint, up, paintEdge, [deck(za, from), deck(zb, from), deck(zb, to), deck(za, to)], deckNormal);
      }
      const trimY = .595;
      trace(body, [bodyPoint(side, za, trimY), bodyPoint(side, zb, trimY)], .014, out, molding);
      if (wheelOpening((za + zb) / 2) === sillHeight) {
        trace(body, [bodyPoint(side, za, .284), bodyPoint(side, zb, .284)], .032, out, rubber);
      }
    }
  }

  for (const end of sides) {
    const z = end * 2.39, [, low, , topWidth, top, crown] = bodySection(z);
    const out = [0, 0, end];
    const sillZ = z - end * .075;
    const nose = (x, y) => [x * lerp(low, topWidth, y), lerp(wheelOpening(z), top, y), lerp(sillZ, z, y)];
    // Keep enough vertices across both ends for a dent to follow an offset hit.
    for (let i = -5; i < 5; i++) {
      const a = i / 5, b = (i + 1) / 5;
      for (const [lower, upper] of [[0, .13], [.13, .46], [.46, .76], [.76, 1]]) {
        if (end > 0 && i >= -4 && i < 4 && lower >= .13 && upper <= .76) continue;
        face(paint, out, lacquer, nose(a, lower), nose(b, lower), nose(b, upper), nose(a, upper));
      }
      face(paint, out, paintEdge, nose(a, 1), nose(b, 1), [b * topWidth, lerp(top, crown, 1 - Math.abs(b)), z],
        [a * topWidth, lerp(top, crown, 1 - Math.abs(a)), z]);
    }
    for (const side of sides) {
      face(body, [side, 0, 0], seal, [side * low, wheelOpening(z), sillZ], [side * low, wheelOpening(z), z], [side * topWidth, top, z]);
    }
    const part = components?.[end > 0 ? 0 : 1];
    if (end > 0) {
      const core = rgb(59,62,59);
      body.box(-.57,.293,2.22,.57,.747,2.243,seal);
      for (let row = 0; row < 17; row++) {
        const y = .31 + row * .026;
        body.box(-.54,y,2.244,.54,y + .009,2.250,core);
      }
      for (const x of [-.55,-.27,0,.27,.55]) body.box(x-.012,.30,2.25,x+.012,.746,2.266,molding);
    }
    face(body, out, rgb(46, 48, 49), [-.66, .449, end * 2.375], [.66, .449, end * 2.375],
      [.65, .559, end * 2.379], [-.65, .559, end * 2.379]);
    for (const x of [-.44, .44]) body.box(x - .068, .415, end * 2.365 - .012, x + .068, .570, end * 2.365 + .012, rgb(96, 99, 94));
    bumper(part?.paint ?? paint, part?.trim ?? body, end);
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
    const bonnetShutLine = [[1.15, .95], [1.43, .896], [1.96, .84], [2.2, .82], [2.33, .81], [2.376, .79]].map(([z, t]) => {
      const point = deckPoint(side, z, t);
      point[1] += .0045;
      return point;
    });
    trace(body, bonnetShutLine, .007, [0, 1, 0], seal);
  }
}

function bumper(paint, body, end) {
  // The section steps back at the ends so the bumpers wrap onto both quarters.
  const archEnd = end > 0 ? 1.77 : 1.68;
  const quarter = [[.864, archEnd], [.873, archEnd + .11], [.866, 2.09], [.851, 2.235], [.817, 2.314],
    [.755, 2.366], [.675, 2.398], [.530, 2.412], [.35, 2.412], [.18, 2.412]];
  const edge = [...quarter.map(([x,z]) => [-x,z]), [0,2.412], ...quarter.slice().reverse()];
  const normals = edge.map((p, i) => {
    const a = edge[Math.max(0, i - 1)], b = edge[Math.min(edge.length - 1, i + 1)];
    const nx = a[1] - b[1], nz = b[0] - a[0], len = Math.hypot(nx,nz);
    return [nx / len, end * nz / len];
  });
  for (let i = 1; i < edge.length; i++) {
    const rail = (index, y, inset) => [edge[index][0] - normals[index][0] * inset, y, end * edge[index][1] - normals[index][1] * inset];
    const a = (y, inset = 0) => rail(i - 1, y, inset);
    const b = (y, inset = 0) => rail(i, y, inset);
    const out = [normals[i-1][0] + normals[i][0], 0, normals[i-1][1] + normals[i][1]];
    const section = [[.389, .034], [.414, .009], [.45, -.004], [.51, -.010], [.57, -.006], [.625, .003]];
    for (let j = 1; j < section.length; j++) {
      const [lo, d0] = section[j - 1], [hi, d1] = section[j];
      const round = ([x, y, z]) => {
        const dist = k => Math.hypot(x - edge[k][0], z - end * edge[k][1]);
        const [nx, nz] = normals[dist(i) < dist(i-1) ? i : i-1];
        const ny = (y - .51) * 3.6, len = Math.hypot(nx, ny, nz);
        return [nx / len, ny / len, nz / len];
      };
      panel(paint, out, lacquer, [a(lo, d0), b(lo, d0), b(hi, d1), a(hi, d1)], round);
    }
    face(body, out, molding, a(.586, -.003), b(.586, -.003), b(.639, -.003), a(.639, -.003));
    face(body, [0, -1, 0], rubber, a(.389, .034), b(.389, .034), b(.347, .048), a(.347, .048));
    face(paint, [0, 1, 0], paintEdge, a(.639), b(.639), b(.656, .095), a(.656, .095));
  }
}

const cabinLine = [
  // Lower z, upper z, belt height, roof height, lower width, roof width.
  [-2.230, -1.75, 1.006, 1.368, .786, .642],
  [-1.951, -1.61, 1.036, 1.409, .815, .681],
  [-1.28, -1.237, 1.046, 1.428, .825, .688],
  [-.676, -.651, 1.050, 1.442, .830, .699],
  [-.146, -.187, 1.055, 1.444, .830, .699],
  [ .752,  .245, 1.057, 1.420, .822, .693],
  [ 1.115,  .435, 1.066, 1.371, .782, .681],
];

function cabinPoint(side, section, height, offset = 0) {
  const [z0, z1, y0, y1, w0, w1] = section;
  return [side * (lerp(w0, w1, height) + .017 * Math.sin(Math.PI * height) + offset), lerp(y0, y1, height), lerp(z0, z1, height)];
}

function buildCabin(body, paint, glass, brightwork, components) {
  for (let i = 1; i < cabinLine.length; i++) {
    const a = cabinLine[i - 1], b = cabinLine[i];
    for (const side of sides) {
      const out = [side, .37, 0];
      for (const [lo, hi] of [[0, .12], [.85, 1]]) {
        face(paint, out, lacquer, cabinPoint(side, a, lo), cabinPoint(side, b, lo), cabinPoint(side, b, hi), cabinPoint(side, a, hi));
      }
      const roof = (section, fraction) => {
        const [, z, , y, , width] = section;
        return [side * width * fraction, y + .035 * (1 - fraction ** 6.3), z];
      };
      const slope = point => {
        const station = point[2] === a[1] ? a : b;
        const across = point[0] / station[5];
        const longitudinal = (b[3] - a[3]) / (b[1] - a[1]);
        const normal = [Math.sign(across) * .32 * Math.abs(across) ** 5.3, 1, -longitudinal];
        return normal.map(value => value / Math.hypot(...normal));
      };
      const fractions = [0, .69, .84, .94, 1];
      for (let strip = 1; strip < fractions.length; strip++) {
        const inner = fractions[strip - 1], outer = fractions[strip];
        panel(paint, [0, 1, 0], lacquer, [roof(a, inner), roof(b, inner), roof(b, outer), roof(a, outer)], slope);
      }
    }
  }
  for (const side of sides) {
    const out = [side, .36, 0];
    // Rear quarter glass, rear door, and front door, each with a continuous gasket.
    for (const [first, last, insetA, insetB] of [[0, 2, .175, .075], [2, 4, .075, .033], [4, 6, .033, .092]]) {
      // The pillars are placed by cross-section interpolation so window edges follow the body.
      const p0 = (i, f) => pointBetween(cabinLine[i], cabinLine[i + 1], f);
      const start = p0(first, insetA), end = p0(last - 1, 1 - insetB);
      for (const [a, b] of [[cabinLine[first], start], [end, cabinLine[last]]]) {
        face(paint, out, lacquer, cabinPoint(side, a, .10), cabinPoint(side, b, .10), cabinPoint(side, b, .89), cabinPoint(side, a, .89));
      }
      const sections = [start, ...cabinLine.slice(first + 1, last), end];
      for (let i = 1; i < sections.length; i++) {
        const a = sections[i - 1], b = sections[i];
        const f = (s, height, offset = .004) => cabinPoint(side, s, height, offset);
        const trim = [f(a, .082), f(b, .082), f(b, .887), f(a, .887)];
        trace(body, trim.slice(0, 2), .014, out, seal);
        trace(body, trim.slice(2), .014, out, seal);
        if (i === 1) trace(body, [trim[0], trim[3]], .018, out, seal);
        if (i === sections.length - 1) trace(body, [trim[1], trim[2]], .018, out, seal);
        const windowPoint = (s, f, height) => cabinPoint(side, pointBetween(s, f, .011), height, .007);
        const left = i === 1 ? b : a, right = i === sections.length - 1 ? a : b;
        face(glass, out, blackGlass, windowPoint(a, left, .121), windowPoint(b, right, .121), windowPoint(b, right, .57), windowPoint(a, left, .57));
        face(glass, out, blackGlass, windowPoint(a, left, .57), windowPoint(b, right, .57), windowPoint(b, right, .87), windowPoint(a, left, .87));
        trace(brightwork, [f(a, .074, .008), f(b, .074, .008)], .011, out, nickel);
        trace(brightwork, [f(a, .92, .005), f(b, .92, .005)], .010, out, nickel);
      }
    }

    // Roof rack with tapered rails and attachment feet.
    const railX = side * .537;
    for (const z of [-1.53, -.73, .22]) {
      const pos = z > .1 ? 0 : z < -1.0 ? -.014 : .012;
      body.box(railX - .031, 1.425 + pos, z - .059, railX + .031, 1.516 + pos, z + .049, molding);
    }
    const rail = [[railX, 1.451, -1.66], [railX, 1.525, -1.52], [railX, 1.546, -.67], [railX, 1.507, .20], [railX, 1.449, .32]];
    sweep(brightwork, rail, .026, 10, chrome);

    // Rounded body-colour housing, recessed matte rim and mirror glass.
    const mirror = components?.[side < 0 ? 2 : 3];
    const mirrorTrim = mirror?.trim ?? body, mirrorPaint = mirror?.paint ?? paint, mirrorFace = mirror?.bright ?? brightwork;
    sweep(mirrorTrim, [[side * .774, 1.091, .834], [side * .89, 1.101, .805]], .045, 6, molding);
    const outline = [[-.72, -.83], [.72, -.83], [.95, -.44], [.93, .44], [.65, .82], [-.66, .91], [-.91, .53], [-.98, -.43]];
    const mirrorRing = (index, scale, z) => {
      const [x, y] = outline[index];
      return [side * (.929 + .092 * x * scale), 1.117 + .052 * y * scale, z - x * 0.013];
    };
    for (let j = 0; j < outline.length; j++) {
      const i = (j + 1) % outline.length;
      const back = mirrorRing(j, 1, .759), backNext = mirrorRing(i, 1, .759);
      const front = mirrorRing(j, .75, .852), frontNext = mirrorRing(i, .75, .852);
      const normalAt = ([x, y, z]) => {
        const n = [side * (Math.abs(x) - .929) * 8, (y - 1.117) * 12, (z - .805) * 8];
        return n.map(value => value / Math.hypot(...n));
      };
      const normal = normalAt(back);
      panel(mirrorPaint, normal, lacquer, [back, backNext, frontNext, front], normalAt);
      face(mirrorPaint, [0, 0, 1], lacquer, [side * .929, 1.117, .867], front, frontNext);
      face(mirrorTrim, [0, 0, -1], seal, backNext, back, mirrorRing(j, .87, .755), mirrorRing(i, .87, .755));
      face(mirrorFace, [0, 0, -1], glassTop,
        [side * .929, 1.117, .753], mirrorRing(i, .87, .753), mirrorRing(j, .87, .753));
    }
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
    const pillar = i === 1 || i === rows.length - 1;
    for (const [lo, hi] of pillar ? [[0, 1]] : [[0, .10], [.89, 1]]) {
      face(paint, out, lacquer, at(a, lo), at(b, lo), at(b, hi), at(a, hi));
    }
    face(paint, [0, 1, 0], paintEdge, at(a, 1), at(b, 1),
      [at(b, 1)[0], station[3] + .033 * (1 - b * b), station[1]], [at(a, 1)[0], station[3] + .033 * (1 - a * a), station[1]]);
    if (i === 1 || i === rows.length - 1) continue;
    for (const h of [.096, .89]) trace(body, [at(a, h, .009), at(b, h, .009)], .010, out, seal);
    const normalAt = point => {
      const h = (point[1] - .010 - station[2]) / (station[3] - station[2]);
      const width = lerp(station[4], station[5], h);
      return surfaceNormal((x, y) => at(x, y, .010), point[0] / width, h, out);
    };
    panel(glass, out, blackGlass, [at(a, .095, .010), at(b, .095, .010), at(b, .891, .010), at(a, .891, .010)], normalAt);
  }
  if (end < 0) {
    for (const h of [.22, .34, .46, .58, .70, .82]) {
      const tint = h < .51 ? rgb(48, 56, 60) : rgb(73, 84, 91);
      trace(body, rows.slice(1, -1).map(x => at(x, h, .018)), .0023, out, tint);
    }
    trace(body, [at(.32, .150, .024), at(.29, .202, .024), at(-.48, .186, .024)], .016, out, seal);
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
  2: [[[.02, .79], [.20, .96], [.76, .96], [.95, .79], [.92, .61], [.06, .12], [.06, .02], [.98, .02]]],
  6: [[[.95, .91], [.31, .95], [.03, .65], [.03, .17], [.25, .02], [.8, .02], [.96, .15], [.96, .42], [.73, .55], [.06, .52]]],
  0: [[[.2, .02], [.77, .02], [.96, .24], [.96, .82], [.77, .98], [.2, .98], [.03, .82], [.03, .24], [.2, .02]]],
  4: [[[.78, 0], [.78, 1], [.01, .29], [1, .29]]],
  8: [[[.22, .47], [.06, .64], [.06, .84], [.26, .98], [.73, .98], [.93, .85], [.93, .63], [.78, .49], [.23, .47], [.06, .31], [.06, .14], [.27, .02], [.74, .02], [.95, .15], [.95, .32], [.78, .49]]],
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

function lensEllipse(mesh, point, outward, x, y, rx, ry, depth, color, segments = 16) {
  const center = point(x, y, depth + .002);
  const perimeter = i => point(x + Math.cos(tau * i / segments) * rx, y + Math.sin(tau * i / segments) * ry, depth);
  for (let i = 0; i < segments; i++) face(mesh, outward, color, center, perimeter(i), perimeter(i + 1));
}

function buildHatch(body, paint, brightwork) {
  const out = [0, 0, -1];
  const hatch = (x, y, depth) => [x, y, -depth];
  const inset = (x, y) => hatch(x, y, 2.397);
  face(body, out, rgb(25, 28, 31), inset(-.433, .686), inset(.433, .686), inset(.395, .852), inset(-.395, .852));
  face(paint, out, lacquer, hatch(-.482, .698, 2.413), inset(-.431, .694), inset(-.393, .851), hatch(-.471, .879, 2.414));
  face(paint, out, lacquer, inset(.431, .694), hatch(.482, .698, 2.413), hatch(.471, .879, 2.414), inset(.393, .851));
  face(paint, out, lacquer, hatch(-.471, .879, 2.414), hatch(.471, .879, 2.414), hatch(.466, .930, 2.391), hatch(-.466, .930, 2.391));
  face(paint, out, paintEdge, hatch(-.466, .930, 2.391), hatch(.466, .930, 2.391), hatch(.439, 1.019, 2.329), hatch(-.439, 1.019, 2.329));
  face(body, [0, -1, -1], molding, hatch(-.402, .851, 2.399), hatch(.402, .851, 2.399), hatch(.467, .869, 2.415), hatch(-.467, .869, 2.415));
  const grip = (x, y) => hatch(x, y, 2.417);
  trace(body, [grip(-.118, .867), grip(.118, .867)], .014, out, seal);
  trace(brightwork, [hatch(-.298, .881, 2.416), hatch(.298, .881, 2.416)], .007, out, rgb(106, 116, 125));
  trace(brightwork, [hatch(-.57, .675, 2.401), hatch(-.46, .664, 2.420), hatch(.46, .664, 2.420), hatch(.57, .675, 2.401)], .014, out, chrome);
}

function buildLighting({ body, paint, brightwork, headLights, tailLights, brakeLights, reverseLights, leftSignals, rightSignals }, frontBumper) {
  const grilleEdge = [0, 0, 1];
  const front = (x, y, z) => [x, y, z];
  const grilleWidth = y => lerp(.321, .345, (y - .761) / .124);
  face(brightwork, grilleEdge, nickel, front(-.334, .751, 2.396), front(.334, .751, 2.396), front(.361, .895, 2.396), front(-.361, .895, 2.396));
  for (let i = -3; i < 3; i++) {
    const left = i / 3, right = (i + 1) / 3;
    const slat = (x, y, z = 2.401) => front(x * grilleWidth(y), y, z);
    face(body, grilleEdge, seal, slat(left, .761), slat(right, .761), slat(right, .885), slat(left, .885));
    for (let row = 0; row < 6; row++) {
      const y = .773 + row * .019;
      const a = slat(left, y, 2.410), b = slat(right, y, 2.410);
      face(body, grilleEdge, rgb(28, 33, 36), a, b, slat(right, y + .006, 2.415), slat(left, y + .006, 2.415));
      trace(body, [slat(left, y + .006, 2.416), slat(right, y + .006, 2.416)], .0024, grilleEdge, rgb(99, 104, 105));
    }
  }
  const grilleTrim = [front(-.338, .752, 2.407), front(.338, .752, 2.407), front(.359, .889, 2.407), front(-.359, .889, 2.407)];
  trace(brightwork, [...grilleTrim, grilleTrim[0]], .009, grilleEdge, chrome);
  rings(brightwork, 1, .838, 2.417);
  buildHatch(body, paint, brightwork);
  rings(brightwork, -1, .977, 2.370);
  const frontTrim = frontBumper?.trim ?? body, fog = frontBumper?.bright ?? headLights;
  plate(frontTrim, 1, .507);
  plate(body, -1, .772);

  for (const side of sides) {
    const indicator = side < 0 ? leftSignals : rightSignals;
    const amberGlass = rgb(170, 154, 119), amberRib = rgb(145, 133, 107);
    const hd = (x, y, z) => [x * side, y, z];
    const frontOut = [side * .32, 0, 1];
    const lamp = (x, y, depth = 0) => hd(x, y, 2.395 - Math.max(0, x - .59) * .33 + depth);
    lampPanel(body, frontOut, lamp, .59, seal, .366, .831, .731, .745, .897, .901);
    lampPanel(brightwork, frontOut, lamp, .59, rgb(117, 127, 130), .377, .729, .747, .756, .881, .885, .003);
    lampPanel(headLights, frontOut, lamp, .59, rgb(198, 204, 193), .388, .718, .761, .768, .867, .874, .007);
    lensEllipse(headLights, lamp, frontOut, .459, .818, .053, .043, .009, rgb(159, 165, 155));
    lensEllipse(headLights, lamp, frontOut, .459, .818, .034, .027, .012, rgb(207, 210, 190));
    lensEllipse(headLights, lamp, frontOut, .620, .817, .071, .042, .009, rgb(163, 170, 160));
    lensEllipse(headLights, lamp, frontOut, .620, .817, .053, .031, .011, rgb(218, 216, 194));
    lensEllipse(headLights, lamp, frontOut, .466, .818, .024, .028, .016, rgb(97, 120, 138));
    lampPanel(indicator, frontOut, lamp, .59, amberGlass, .737, .825, .755, .759, .875, .882, .011);
    for (const x of [.754, .773, .793, .811]) {
      trace(indicator, [lamp(x, .764, .013), lamp(x, .873, .013)], .0021, frontOut, amberRib);
    }
    face(indicator, [side, 0, 1], amberGlass, lamp(.823, .759, .011), hd(.852, .774, 2.226),
      hd(.852, .862, 2.226), lamp(.823, .874, .011));
    face(frontTrim, [0, 0, 1], seal, hd(.337, .475, 2.416), hd(.686, .475, 2.397), hd(.677, .543, 2.402), hd(.337, .543, 2.416));
    face(fog, [0, 0, 1], rgb(171, 177, 159), hd(.545, .488, 2.419), hd(.659, .488, 2.411), hd(.656, .530, 2.412), hd(.545, .530, 2.419));
    for (const x of [.376, .406, .436, .466, .496]) {
      trace(frontTrim, [hd(x, .484, 2.421), hd(x, .534, 2.421)], .008, frontOut, rgb(56, 60, 62));
    }
    trace(frontTrim, [hd(.19, .434, 2.415), hd(.51, .434, 2.415), hd(.671, .435, 2.403),
      hd(.778, .451, 2.350)], .019, frontOut, rubber);
    const washer = (x, z) => {
      const point = deckPoint(side, z, x);
      point[1] += .005;
      return point;
    };
    face(body, [0, 1, 0], molding, washer(.55, 2.26), washer(.65, 2.26), washer(.65, 2.29), washer(.55, 2.29));

    const wing = (z, y, bulge) => {
      const p = bodyPoint(side, z, y);
      p[0] += side * bulge;
      return p;
    };
    face(body, [side, 0, 0], seal, wing(1.890, .812, .002), wing(1.815, .812, .002), wing(1.804, .843, .002), wing(1.877, .846, .002));
    face(indicator, [side, 0, 0], amberGlass, wing(1.886, .818, .005), wing(1.819, .818, .005),
      wing(1.813, .837, .005), wing(1.876, .841, .005));

    const tailOut = [side * .32, 0, -1];
    const tail = (x, y, depth = 0) => [side * x, y, -(2.395 - Math.max(0, x - .658) * .325 + depth)];
    lampPanel(body, tailOut, tail, .658, seal, .558, .838, .648, .671, .977, .985);
    lampPanel(tailLights, tailOut, tail, .658, rgb(158, 23, 32), .570, .831, .655, .680, .971, .978, .008);
    lampPanel(brakeLights, tailOut, tail, .658, rgb(171, 32, 42), .582, .829, .831, .835, .965, .974, .012);
    lampPanel(reverseLights, tailOut, tail, .658, rgb(189, 190, 181), .600, .740, .762, .764, .814, .817, .014);
    lampPanel(indicator, tailOut, tail, .658, rgb(184, 179, 160), .740, .819, .764, .768, .814, .817, .015);
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
  const tireNormal = (i, angle) => {
    const [x0, r0] = tread[Math.max(0, i - 1)], [x1, r1] = tread[Math.min(tread.length - 1, i + 1)];
    const across = x1 - x0, radial = r0 - r1;
    const length = Math.hypot(across, radial);
    return [radial / length, Math.sin(angle) * across / length, Math.cos(angle) * across / length];
  };
  for (let i = 0; i < segments; i++) {
    const a = angle(i), b = angle(i + 1), middle = angle(i + .5);
    for (let j = 1; j < tread.length; j++) {
      const [x0, r0] = tread[j - 1], [x1, r1] = tread[j];
      const normal = [(r0 - r1) * 12, Math.sin(middle), Math.cos(middle)];
      const normalAt = ([x, y, z]) => {
        const firstRing = x !== x1 || (x === x0 && Math.abs(Math.hypot(y, z) - r0) < .001);
        return tireNormal(firstRing ? j - 1 : j, Math.atan2(y, z));
      };
      panel(wheel, normal, j >= 4 && j <= 6 ? rgb(30, 31, 32) : rubber,
        [p(x0, r0, a), p(x1, r1, a), p(x1, r1, b), p(x0, r0, b)], normalAt);
    }
    for (const side of sides) {
      face(wheel, [0, Math.sin(middle), Math.cos(middle)], seal, p(side * .059, .3155, a), p(side * .079, .310, a + .041), p(side * .079, .310, a + .061), p(side * .059, .3155, a + .021));
      const ring = (x, r, a) => p(side * x, r, a);
      const disk = (x, r, color, material) => panel(wheel, [side, 0, 0], color, [[side * x, 0, 0], ring(x, r, a), ring(x, r, b)], null, material);
      const strip = (x0, r0, x1, r1, color, material) => panel(wheel, [side, 0, 0], color,
        [ring(x0, r0, a), ring(x1, r1, a), ring(x1, r1, b), ring(x0, r0, b)], null, material);
      strip(.1047, .261, .105, .257, rgb(30, 32, 34));
      strip(.1047, .250, .105, .246, rgb(13, 15, 17));
      strip(.103, .233, .108, .224, rgb(108, 119, 125), 'metal');
      strip(.108, .224, .109, .213, chrome, 'metal');
      strip(.109, .213, .095, .204, nickel, 'metal');
      disk(.090, .209, rgb(48, 55, 58));
      disk(.096, .155, rgb(66, 69, 70));
      strip(.106, .072, .112, .056, rgb(145, 157, 161), 'metal');
      disk(.113, .057, chrome, 'metal');
      disk(.115, .024, rgb(82, 92, 99), 'metal');
    }
  }
  for (const side of sides) {
    const out = [side, 0, 0];
    for (let spoke = 0; spoke < 5; spoke++) {
      const a = spoke * tau / 5;
      const q = (x, radius, offset) => p(side * x, radius, a + offset);
      panel(wheel, out, nickel, [q(.112,.055,-.22), q(.112,.142,-.09), q(.112,.142,.09), q(.112,.055,.22)], null, 'metal');
      for (const branch of [-1, 1]) {
        const offset = branch * .19;
        panel(wheel, out, chrome, [q(.113,.127,-.10),q(.108,.212,offset-.047),q(.108,.212,offset+.047),q(.113,.127,.10)], null, 'metal');
      }
      const lug = (angle, radius, x) => [side * x, Math.sin(a) * .039 + Math.sin(angle) * radius, Math.cos(a) * .039 + Math.cos(angle) * radius];
      for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        face(wheel, out, rgb(62, 69, 74), lug(0, 0, .114), lug(faceIndex * tau / 6, .006, .114), lug((faceIndex + 1) * tau / 6, .006, .114));
      }
    }
  }
}

// Geometry visible through the exterior glazing, batched with the trim.
// The cabin floor, seats and head restraints occlude the far-side windows.
function passengerCompartment(mesh) {
  const upholstery = rgb(60, 60, 57), seam = rgb(39, 41, 41), cloth = rgb(75, 74, 69);
  mesh.box(-.71, .208, -2.20, .71, .285, 2.22, rgb(48, 49, 46));
  for (const side of sides) {
    const x = side * .56;
    mesh.box(x - .055, .177, -1.87, x + .055, .215, 1.96, rgb(62, 63, 59));
    for (const z of [AVANT_WHEELS.front, AVANT_WHEELS.rear]) {
      sweep(mesh, [[side * .29,.205,z - .22],[side * .72,.25,z]], .036, 6, rgb(65,66,62));
      const hub = (a, r, x) => [side * x, .315 + r * Math.cos(a), z + r * Math.sin(a)];
      for (let i = 0; i < 16; i++) {
        const a = i * tau / 16, b = (i + 1) * tau / 16;
        face(mesh, [side,0,0], nickel, hub(a,.129,.775), hub(b,.129,.775), hub(b,.061,.78), hub(a,.061,.78));
        face(mesh, [side,0,0], molding, hub(a,.061,.78), hub(b,.061,.78), hub(0,0,.80));
      }
    }
  }
  sweep(mesh, [[.09,.181,1.43],[.09,.17,.2],[-.29,.17,-.88],[-.50,.20,-1.75],[-.56,.28,-2.30]], .041, 8, rgb(118,112,97));
  mesh.box(-.69,.15,-2.06,-.34,.262,-1.55,rgb(116,111,97));
  mesh.box(-.77, .50, -2.20, .77, .59, 1.15, seam);
  mesh.box(-.73, .88, -2.20, .73, .96, -1.20, molding);
  mesh.box(-.75, .84, .60, .75, 1.036, 1.12, rgb(46, 48, 46));
  for (const side of sides) {
    mesh.box(side < 0 ? -.80 : .73, .59, -2.18, side < 0 ? -.73 : .80, 1.04, .94, molding);
    for (const [x, z, rear] of [[side * .389, .02, false], [side * .36, -1.03, true]]) {
      const pad = (cx, cy, cz, w, h, thick, fill) => {
        const outline = [[-.78,-1],[.78,-1],[1,-.75],[.94,.70],[.70,1],[-.70,1],[-.94,.70],[-1,-.75]];
        const vertex = (i, face) => {
          const [u,v] = outline[i];
          return [cx + w * u, cy + h * v, cz - v * h * .20 + face * thick];
        };
        for (let i = 0; i < outline.length; i++) {
          const j = (i + 1) % outline.length;
          for (const end of sides) face(mesh, [0,0,end], fill, [cx,cy,cz + end * (thick + .014)], vertex(i,end), vertex(j,end));
          face(mesh, [outline[i][0],outline[i][1],0], seam, vertex(i,-1), vertex(j,-1), vertex(j,1), vertex(i,1));
        }
      };
      pad(x, .916, z, rear ? .342 : .267, .205, .065, upholstery);
      for (const dx of [-.064, .064]) mesh.box(x + dx - .009, 1.105, z - .054, x + dx + .009, 1.19, z - .035, nickel);
      pad(x, rear ? 1.169 : 1.217, z - .056, .137, .071, .058, cloth);
    }
  }
  const rim = Array.from({ length: 21 }, (_, i) => {
    const a = tau * i / 20;
    return [-.39 + .16 * Math.cos(a), .974 + .143 * Math.sin(a), .49 + .055 * Math.sin(a)];
  });
  sweep(mesh, rim, .017, 6, rubber);
  mesh.box(-.47, .942, .48, -.31, 1.005, .505, seal);
}

export function buildAvant(parts, components) {
  const { body, paint, glass, brightwork, wheel } = parts;
  buildShell(body, paint, components);
  buildCabin(body, paint, glass, brightwork, components);
  passengerCompartment(body);
  buildLighting(parts, components?.[0]);
  buildWheel(wheel);
}
