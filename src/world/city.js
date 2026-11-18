import { color } from '../render/mesh.js';

const BLOCK_SIZE = 70;
const EDGE = 242;
const CURB = .16;
const BAY_LENGTH = 28;
const BAY_DEPTH = 2.7;

export const roads = Object.freeze([-210, -140, -70, 0, 70, 140, 210]);
export const halfWorld = EDGE;
export const startPosition = Object.freeze({ x: 3.2, z: -18 });
const widths = [4.9, 5.2, 6.35, 6.8, 5.9, 5.25, 4.9];

export function roadHalfWidth(center) {
  return widths[roads.indexOf(center)] ?? 0;
}

function blockKind(ix, iz) {
  if (iz === 2 && (ix === 2 || ix === 3)) return 'park';
  if (ix === 2 && iz === 3) return 'market';
  if (ix === 3 && iz === 3) return 'station';
  if (ix === 5 && iz === 1) return 'service';
  if (ix === 0 || ix === 5 || iz === 0 || iz === 5) return 'residential';
  return ix === 2 || ix === 3 ? 'historic' : 'mixed';
}

const districtNames = {
  park: 'Am Stadtpark', market: 'Marktplatz', station: 'Bahnhofstraße',
  service: 'Am Betriebshof', residential: 'Wohngebiet', historic: 'Altstadt', mixed: 'Innenstadt',
};

function blockAt(x, z) {
  const ix = Math.floor((x - roads[0]) / BLOCK_SIZE);
  const iz = Math.floor((z - roads[0]) / BLOCK_SIZE);
  return ix >= 0 && ix < 6 && iz >= 0 && iz < 6 ? { ix, iz } : null;
}

function baySide(ix, iz) {
  return (ix + iz) % 3 === 0 ? 0 : iz % 2 === 0 ? -1 : 1;
}

export function districtAt(x, z) {
  const block = blockAt(x, z);
  return block ? districtNames[blockKind(block.ix, block.iz)] : 'Stadtrand';
}

export function roadSurfaceAt(x, z) {
  if (Math.abs(x) > EDGE || Math.abs(z) > EDGE) return 'grass';
  if (roads.some((center, index) => Math.abs(center - x) <= widths[index]
    || Math.abs(center - z) <= widths[index])) return 'asphalt';
  const block = blockAt(x, z);
  if (!block) return 'grass';
  const { ix, iz } = block;
  const centerZ = roads[iz] + BLOCK_SIZE / 2;
  if (Math.abs(z - centerZ) < BAY_LENGTH / 2) {
    const side = baySide(ix, iz);
    if (side < 0 && x < roads[ix] + widths[ix] + BAY_DEPTH) return 'asphalt';
    if (side > 0 && x > roads[ix + 1] - widths[ix + 1] - BAY_DEPTH) return 'asphalt';
  }
  if (blockKind(ix, iz) === 'park'
      && x > roads[ix] + 13 && x < roads[ix + 1] - 13
      && z > roads[iz] + 13 && z < roads[iz + 1] - 13
      && Math.abs(x - roads[ix] - BLOCK_SIZE / 2) > 2.4
      && Math.abs(z - centerZ) > 2.4) return 'grass';
  return 'paving';
}

function randomFrom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function ground(mesh, x0, z0, x1, z1, y, hex, material) {
  if (x1 <= x0 || z1 <= z0) return;
  mesh.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], color(hex), material);
}

function footprint(obstacles, x0, z0, x1, z1, kind) {
  obstacles.push({ x0, x1, z0, z1, kind });
}

const PALETTES = [
  { wall: '#dcc39e', trim: '#f2dcbb', roof: '#784b43', base: '#8b7970', frame: '#435b55' },
  { wall: '#bc816c', trim: '#eeccad', roof: '#515d63', base: '#837573', frame: '#4d4946' },
  { wall: '#bebfac', trim: '#e7deca', roof: '#565e67', base: '#818578', frame: '#45585c' },
  { wall: '#dccdb5', trim: '#eae0cb', roof: '#83564c', base: '#8f8780', frame: '#70594b' },
  { wall: '#9eaaa0', trim: '#dce0ce', roof: '#545b5e', base: '#757c74', frame: '#445951' },
  { wall: '#b88672', trim: '#d9b699', roof: '#6a5150', base: '#877670', frame: '#4b5356' },
  { wall: '#ae9681', trim: '#e2d5bc', roof: '#77716e', base: '#7b7370', frame: '#47605f' },
];
const GLASS = ['#526a71', '#57747f', '#698b96', '#78919a', '#40535d', '#8b9b9d'];
const PARKED_PAINTS = ['#71878a', '#785045', '#385460', '#959288', '#adaba0', '#4c5057'];
const LAMP_METAL = '#464c4a';
const CURB_STONE = '#b8aea0';
const FOOTWAY = '#a7a095';
const ROAD = '#4a4b4c';
const PAINT = '#d8d4c3';

function facadeFace(mesh, x, z, dx, dz) {
  const point = (u, y, offset) => [x + dz * u + dx * offset, y, z - dx * u + dz * offset];
  function panel(u0, y0, u1, y1, offset, hex, material) {
    mesh.quad(point(u0, y0, offset), point(u1, y0, offset), point(u1, y1, offset), point(u0, y1, offset), color(hex), material);
  }
  function ledge(u0, y0, u1, y1, offset, hex) {
    const a = point(u0, y0, .01);
    const b = point(u1, y1, offset);
    mesh.box(Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]), hex);
  }
  return { panel, ledge, point };
}

function pitchedRoof(mesh, x, z, width, depth, height, rise, palette, style) {
  const x0 = x - width / 2 - .32;
  const x1 = x + width / 2 + .32;
  const z0 = z - depth / 2 - .32;
  const z1 = z + depth / 2 + .32;
  const hip = style === 'gable' ? 0 : width * .19;
  const peak0 = [x0 + hip, height + rise, z];
  const peak1 = [x1 - hip, height + rise, z];
  mesh.quad([x0, height, z0], peak0, peak1, [x1, height, z0], color(palette.roof, .91), 'roof');
  mesh.quad(peak0, [x0, height, z1], [x1, height, z1], peak1, color(palette.roof), 'roof');
  mesh.tri([x0, height, z0], [x0, height, z1], peak0, color(hip > 0 ? palette.roof : palette.wall), hip ? 'roof' : 'plaster');
  mesh.tri([x1, height, z1], [x1, height, z0], peak1, color(hip > 0 ? palette.roof : palette.wall, .93), hip ? 'roof' : 'plaster');
  const chimneyX = x - width * .16;
  mesh.box(chimneyX - .44, height + rise * .63, z + .7, chimneyX + .44, height + rise + .8, z + 1.45, '#9b7566', 'brick');
  mesh.box(chimneyX - .54, height + rise + .68, z + .6, chimneyX + .54, height + rise + .9, z + 1.55, '#403e3d');
}

function windowBay(face, center, bottom, width, height, palette, glass, shutters, balcony) {
  const low = center - width / 2;
  const high = center + width / 2;
  face.panel(low - .12, bottom - .1, high + .12, bottom + height + .13, .023, palette.trim);
  face.panel(low, bottom, high, bottom + height, .032, palette.frame);
  face.panel(low + .075, bottom + .08, high - .075, bottom + height - .08, .041, glass, 'glass');
  face.panel(center - .036, bottom + .07, center + .036, bottom + height - .06, .052, palette.frame);
  face.panel(low + .06, bottom + height * .67, high - .06, bottom + height * .67 + .05, .054, palette.frame);
  face.ledge(low - .19, bottom - .12, high + .19, bottom - .03, .2, palette.trim);
  if (shutters) {
    face.panel(low - .46, bottom, low - .12, bottom + height, .044, palette.frame);
    face.panel(high + .12, bottom, high + .46, bottom + height, .044, palette.frame);
  }
  if (!balcony) return;
  face.ledge(low - .24, bottom - .24, high + .24, bottom - .13, .67, palette.base);
  face.panel(low - .21, bottom + .35, high + .21, bottom + .41, .68, '#454a48');
  for (let slat = low - .2; slat < high + .23; slat += .24) {
    face.panel(slat, bottom - .13, slat + .037, bottom + .39, .68, '#515552');
  }
}

function storefront(mesh, face, width, palette, stripes) {
  const units = Math.floor(width / 4.7);
  const bay = width / units;
  for (let unit = 0; unit < units; unit++) {
    const center = (unit + .5) * bay - width / 2;
    const low = center - bay * .43;
    const high = center + bay * .43;
    face.panel(low, .25, high, 3.25, .031, palette.frame);
    face.panel(low + .1, .52, high - .1, 2.48, .043, unit % 2 ? '#6b8587' : '#8b9284', 'glass');
    face.panel(low + .1, 2.06, high - .1, 2.13, .06, palette.frame);
    face.panel(low + .16, 2.68, high - .16, 3.11, .05, stripes[unit % stripes.length]);
    if (unit % 2) continue;
    const band = (high - low) / 9;
    for (let stripe = 0; stripe < 9; stripe++) {
      const a = low + stripe * band;
      const b = a + band;
      const hue = stripe % 2 ? '#ded4b6' : stripes[unit % stripes.length];
      mesh.quad(face.point(a, 2.4, 1.05), face.point(b, 2.4, 1.05),
        face.point(b, 2.77, .03), face.point(a, 2.77, .03), color(hue));
      face.panel(a, 2.26, b, 2.41, 1.05, hue);
    }
  }
}

function building(mesh, obstacles, random, x, z, width, depth, floors, style, palette, front = 1) {
  const x0 = x - width / 2;
  const x1 = x + width / 2;
  const z0 = z - depth / 2;
  const z1 = z + depth / 2;
  const height = 3.55 + (floors - 1) * 3.04;
  const modern = style === 'modern';
  const retail = style === 'shop' || style === 'brick';
  const trim = modern ? '#a0a9a5' : palette.trim;
  const wallMaterial = style === 'brick' ? 'brick' : 'plaster';
  footprint(obstacles, x0 - .03, z0 - .03, x1 + .03, z1 + .03, 'building');
  mesh.box(x0, CURB, z0, x1, height, z1, palette.wall, wallMaterial);
  mesh.box(x0 - .08, CURB, z0 - .08, x1 + .08, .53, z1 + .08, palette.base);
  mesh.box(x0 - .13, height - .27, z0 - .13, x1 + .13, height, z1 + .13, trim);
  if (modern) {
    mesh.box(x0 + .18, height, z0 + .18, x1 - .18, height + .44, z1 - .18, '#626d6d');
    mesh.box(x - width * .22, height, z + depth * .09, x + width * .13, height + 1.7, z + depth * .35, palette.base);
  } else {
    pitchedRoof(mesh, x, z, width, depth, height, style === 'gable' ? 2.7 : 2.35, palette, style);
  }
  const faces = [
    { face: facadeFace(mesh, x, z1, 0, 1), span: width, front: front === 1 },
    { face: facadeFace(mesh, x, z0, 0, -1), span: width, front: front === -1 },
    { face: facadeFace(mesh, x1, z, 1, 0), span: depth, front: false },
    { face: facadeFace(mesh, x0, z, -1, 0), span: depth, front: false },
  ];
  for (const { face, span, front: main } of faces) {
    const bays = Math.max(2, Math.round(span / (modern ? 3.4 : style === 'gable' ? 3.7 : 3.15)));
    const bayWidth = span / bays;
    if (main && retail) storefront(mesh, face, span, palette, ['#746349', '#704e47', '#455e56']);
    for (let level = 0; level < floors; level++) {
      const y = level ? 3.55 + (level - 1) * 3.04 : .23;
      if (!modern && level) face.panel(-span / 2, y, span / 2, y + .13, .017, trim);
      if (main && retail && level === 0) continue;
      for (let slot = 0; slot < bays; slot++) {
        const center = (slot + .5) * bayWidth - span / 2;
        if (main && !level && slot === Math.floor(bays / 2)) {
          face.panel(center - .81, .23, center + .81, 2.87, .032, palette.trim);
          face.panel(center - .66, .23, center + .66, 2.76, .045, palette.frame);
          face.panel(center - .4, 1.47, center + .4, 2.6, .053, '#5d7378', 'glass');
          continue;
        }
        const glaze = GLASS[Math.floor(random() * GLASS.length)];
        windowBay(face, center, y + (level ? .48 : .72), bayWidth * (modern ? .83 : .49),
          modern ? 1.91 : 1.67, palette, glaze, main && style === 'gable', main && style === 'historic' && level === 2 && slot % 2 === 0);
      }
    }
  }
}

function tree(mesh, obstacles, x, z, size, y = CURB) {
  mesh.cylY(x, y, z, .22 * size, 2.7 * size, '#665444', 6);
  mesh.cylY(x, y + .01, z, .58 * size, .06, '#746b50', 8);
  mesh.sphere(x, y + 3.48 * size, z, 1.32 * size, 1.62 * size, 1.31 * size, '#506d44', 8, 5);
  mesh.sphere(x - .68 * size, y + 3.72 * size, z + .29 * size, 1.13 * size, 1.3 * size, .96 * size, '#658451', 7, 4);
  mesh.sphere(x + .57 * size, y + 4.01 * size, z - .38 * size, .96 * size, 1.38 * size, 1.16 * size, '#789154', 7, 4);
  footprint(obstacles, x - .21 * size, z - .21 * size, x + .21 * size, z + .21 * size, 'tree');
}

function bench(mesh, obstacles, x, z) {
  for (let i = 0; i < 3; i++) {
    mesh.box(x - 1.04, .65, z - .24 + i * .17, x + 1.04, .73, z - .10 + i * .17, '#8f7051');
    mesh.box(x - 1.04, .81 + i * .115, z + .2, x + 1.04, .90 + i * .115, z + .27, '#8b7156');
  }
  for (const side of [-.82, .82]) {
    mesh.box(x + side - .06, CURB, z - .14, x + side + .06, .68, z + .17, '#444948');
    mesh.box(x + side - .06, .68, z + .19, x + side + .06, 1.15, z + .24, '#444948');
  }
  footprint(obstacles, x - 1.05, z - .27, x + 1.05, z + .29, 'street-furniture');
}

function streetLamp(mesh, obstacles, x, z, height, direction = 1) {
  mesh.cylY(x, CURB, z, .115, height, LAMP_METAL, 6);
  mesh.cylY(x, CURB, z, .20, .45, '#383d3b', 7);
  const armX = x + direction * 1.2;
  mesh.box(Math.min(x, armX) - .05, height + .06, z - .066, Math.max(x, armX) + .05, height + .19, z + .066, LAMP_METAL);
  mesh.box(armX - .32, height + .06, z - .14, armX + .32, height + .23, z + .14, '#5e6461');
  mesh.box(armX - .25, height + .035, z - .104, armX + .25, height + .09, z + .104, '#e5dbc1');
  footprint(obstacles, x - .2, z - .2, x + .2, z + .2, 'street-furniture');
}

function trafficSignal(mesh, obstacles, signals, intersectionX, intersectionZ, axis, direction) {
  const [forwardX, forwardZ] = axis === 0 ? [0, direction] : [direction, 0];
  const rightX = forwardZ;
  const rightZ = -forwardX;
  const curb = (axis === 0 ? roadHalfWidth(intersectionX) : roadHalfWidth(intersectionZ)) + .92;
  const stopDistance = (axis === 0 ? roadHalfWidth(intersectionZ) : roadHalfWidth(intersectionX)) + 5.7;
  const x = intersectionX - forwardX * stopDistance + rightX * curb;
  const z = intersectionZ - forwardZ * stopDistance + rightZ * curb;
  const backX = x + forwardX * .17;
  const backZ = z + forwardZ * .17;
  const frontX = x - forwardX * .17;
  const frontZ = z - forwardZ * .17;
  mesh.cylY(x, CURB, z, .104, 3.44, LAMP_METAL, 7);
  const housingX = axis === 0 ? .22 : 0;
  const housingZ = axis === 0 ? 0 : .22;
  mesh.box(Math.min(backX, frontX) - housingX, 2.61, Math.min(backZ, frontZ) - housingZ,
    Math.max(backX, frontX) + housingX, 3.44, Math.max(backZ, frontZ) + housingZ, '#303735');
  const face = facadeFace(mesh, frontX, frontZ, -forwardX, -forwardZ);
  for (const lens of [2.78, 3.02, 3.26]) {
    mesh.box(frontX - housingX - .04, lens + .09, frontZ - housingZ - .04,
      frontX + housingX + .04, lens + .13, frontZ + housingZ + .04, '#333836');
    face.panel(-.101, lens - .093, .101, lens + .093, .004, '#202722');
  }
  const heading = axis === 0 ? (direction > 0 ? 0 : Math.PI) : direction * Math.PI / 2;
  signals.push({ x: frontX - forwardX * .014, z: frontZ - forwardZ * .014, y: 3.02, heading, axis, intersectionX, intersectionZ });
  footprint(obstacles, x - .14, z - .14, x + .14, z + .14, 'street-furniture');
}

function parkingSign(mesh, obstacles, x, z, side) {
  mesh.cylY(x, CURB, z, .038, 2.6, '#747873', 6);
  const face = facadeFace(mesh, x, z, side, 0);
  const back = facadeFace(mesh, x, z, -side, 0);
  back.panel(-.3, 2.19, .3, 2.79, .025, '#77827d');
  face.panel(-.3, 2.19, .3, 2.79, .027, '#285e84');
  // Glyphs use the view's +X-right convention while façade rectangles follow their outward normal.
  const glyphStroke = (u0, y0, u1, y1) => face.panel(-u1, y0, -u0, y1, .035, '#f2f0de');
  glyphStroke(-.17, 2.27, -.105, 2.71);
  glyphStroke(-.105, 2.64, .12, 2.71);
  glyphStroke(.095, 2.49, .165, 2.665);
  glyphStroke(-.105, 2.47, .12, 2.53);
  footprint(obstacles, x - .045, z - .045, x + .045, z + .045, 'street-furniture');
}

function parkedCar(mesh, obstacles, x, z, hue, direction) {
  const point = (a, y, b) => [x + a * direction, y, z + b * direction];
  const box = (x0, y0, z0, x1, y1, z1, hex) => {
    const a = point(x0, y0, z0);
    const b = point(x1, y1, z1);
    mesh.box(Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]), hex);
  };
  box(-.87, .28, -2.03, .87, .94, 2.03, hue);
  box(-.89, .29, -2.10, .89, .44, 2.10, '#383c3b');
  const canopy = color('#566c71');
  mesh.quad(point(-.71, 1.4, -.75), point(-.71, 1.4, .5), point(.71, 1.4, .5), point(.71, 1.4, -.75), color(hue), 'plaster');
  mesh.quad(point(.79, .93, 1.03), point(.71, 1.4, .5), point(-.71, 1.4, .5), point(-.79, .93, 1.03), canopy, 'glass');
  mesh.quad(point(-.78, .93, -1.67), point(-.71, 1.4, -.75), point(.71, 1.4, -.75), point(.78, .93, -1.67), canopy, 'glass');
  for (const side of [-1, 1]) {
    const windows = [point(side * .78, .93, -1.67), point(side * .79, .93, 1.03), point(side * .71, 1.4, .5), point(side * .71, 1.4, -.75)];
    if (side > 0) windows.reverse();
    mesh.quad(...windows, canopy, 'glass');
    box(.75 * side - .026, .95, -.23, .75 * side + .026, 1.36, -.16, '#354b4e');
    box(.61 * side - .19, .62, 2.02, .61 * side + .19, .83, 2.059, '#d1cdb4');
    box(.61 * side - .19, .61, -2.059, .61 * side + .19, .84, -2.02, '#9e453d');
    for (const end of [-1.33, 1.3]) {
      const wheelX = x + side * .83;
      const wheelZ = z + end * direction;
      mesh.sphere(wheelX, .31, wheelZ, .135, .3, .315, '#202626', 8, 5);
      mesh.sphere(wheelX + side * .078, .31, wheelZ, .063, .18, .18, '#a6a9a3', 7, 4);
    }
  }
  box(-.23, .53, -2.067, .23, .67, -2.058, '#e0dccc');
  box(-.18, .56, -2.074, .18, .625, -2.068, '#535650');
  footprint(obstacles, x - .98, z - 2.10, x + .98, z + 2.10, 'vehicle');
}

function park(mesh, obstacles, x, z) {
  ground(mesh, x - 22, z - 22, x + 22, z + 22, CURB + .01, '#829464', 'grass');
  ground(mesh, x - 2.4, z - 22, x + 2.4, z + 22, CURB + .02, '#bdb29b', 'paving');
  ground(mesh, x - 22, z - 2.4, x + 22, z + 2.4, CURB + .022, '#bdb29b', 'paving');
  for (const [dx, dz, scale] of [[-7, -13, 1.25], [-16, -7, .94], [15, -8, 1.18], [9, -16, 1.05], [8, 15, 1.26], [-16, 13, 1.15], [-10, 7, .89], [17, 10, 1.13]]) {
    tree(mesh, obstacles, x + dx, z + dz, scale);
  }
  for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
    const px = x + dx * 15;
    const pz = z + dz * 16;
    mesh.box(px - 1.8, CURB, pz - 1.2, px + 1.8, .38, pz + 1.2, '#8f8d70', 'plaster');
    for (let i = 0; i < 3; i++) mesh.sphere(px + i * .89 - .9, .67, pz, .72, .41, .65, '#5c7955', 7, 4);
    footprint(obstacles, px - 1.8, pz - 1.2, px + 1.8, pz + 1.2, 'planter');
    bench(mesh, obstacles, x + dx * 6.4, z + dz * 4.8);
  }
}

function market(mesh, obstacles, x, z, random) {
  const blockStone = '#b8ae9d';
  ground(mesh, x - 23, z - 22, x + 23, z + 22, CURB + .011, blockStone, 'paving');
  ground(mesh, x - 19, z - 16, x + 19, z + 16, CURB + .016, '#a99b89', 'paving');
  ground(mesh, x - 18.7, z - 15.7, x + 18.7, z + 15.7, CURB + .019, '#c4b7a0', 'paving');
  building(mesh, obstacles, random, x - 14.2, z + 13.6, 19, 15.7, 3, 'brick', PALETTES[5], -1);
  building(mesh, obstacles, random, x + 9, z + 13.6, 23, 15.7, 3, 'shop', PALETTES[0], -1);
  const fountainX = x + 3.8;
  const fountainZ = z - 8.1;
  mesh.cylY(fountainX, CURB, fountainZ, 4.25, .44, '#9f998c', 20);
  mesh.cylY(fountainX, .58, fountainZ, 3.84, .039, '#708b88', 20, 'water');
  mesh.cylY(fountainX, .59, fountainZ, .69, 1.42, '#b7ada0', 12);
  mesh.cylY(fountainX, 1.8, fountainZ, 1.55, .29, '#a49f91', 16);
  mesh.sphere(fountainX, 2.13, fountainZ, .88, .22, .88, '#97b7ac', 12, 4, 'water');
  for (const [start, end, width] of [[-4.1, -3, 2.06], [-3, -1.5, 3.39], [-1.5, 1.5, 4.08], [1.5, 3, 3.39], [3, 4.1, 2.06]]) {
    footprint(obstacles, fountainX - width, fountainZ + start, fountainX + width, fountainZ + end, 'fountain');
  }
  tree(mesh, obstacles, x - 15, z - 12.2, 1.08);
  tree(mesh, obstacles, x + 17, z - 12.2, 1.17);
  bench(mesh, obstacles, x - 11, z - 8.2);
  bench(mesh, obstacles, x + 15, z - 8.2);
}

function station(mesh, obstacles, x, z, random) {
  const palette = { wall: '#b3a597', trim: '#d8c7ac', roof: '#5e5651', base: '#827973', frame: '#3e4f4e' };
  ground(mesh, x - 24, z - 22, x + 24, z + 22, CURB + .02, '#a5a097', 'paving');
  building(mesh, obstacles, random, x, z + 6, 38, 19, 3, 'brick', palette, -1);
  mesh.box(x - 4.8, .18, z - 5.4, x + 4.8, 3.5, z - 3.51, '#9d907d', 'plaster');
  mesh.box(x - 5.5, 3.36, z - 5.9, x + 5.5, 3.8, z - 3.4, palette.trim);
  const face = facadeFace(mesh, x, z - 5.4, 0, -1);
  face.panel(-4.1, .25, 4.1, 2.83, .023, '#374949', 'glass');
  for (let n = -4; n <= 4; n++) face.panel(n - .045, .25, n + .045, 2.85, .04, '#bbb19f');
  mesh.box(x - 3.95, 3.72, z - 4.75, x + 3.95, 15, z + 3.9, palette.wall, 'plaster');
  mesh.box(x - 4.15, 14.8, z - 4.97, x + 4.15, 15.1, z + 4.12, palette.trim);
  pitchedRoof(mesh, x, z - .43, 8.2, 9, 15.12, 3.45, palette, 'historic');
  const tower = facadeFace(mesh, x, z - 4.75, 0, -1);
  tower.panel(-3.72, 10.5, 3.72, 10.66, .025, palette.trim);
  for (const [radius, offset, hue] of [[1.2, .022, '#54534d'], [1.04, .036, '#d9d1b7']]) {
    for (let tick = 0; tick < 20; tick++) {
      const a = tick * Math.PI / 10;
      const b = (tick + 1) * Math.PI / 10;
      mesh.tri(tower.point(0, 12.9, offset), tower.point(radius * Math.cos(a), 12.9 + radius * Math.sin(a), offset),
        tower.point(radius * Math.cos(b), 12.9 + radius * Math.sin(b), offset), color(hue));
    }
  }
  tower.panel(-.03, 12.9, .04, 13.68, .044, '#474a44');
  tower.panel(-.55, 12.87, .03, 12.94, .045, '#474a44');
  footprint(obstacles, x - 4.8, z - 5.4, x + 4.8, z - 3.51, 'building');
  bench(mesh, obstacles, x - 14.5, z - 12);
  bench(mesh, obstacles, x + 14.5, z - 12);
  tree(mesh, obstacles, x - 20, z - 15, .86);
  tree(mesh, obstacles, x + 20, z - 15, .9);
}

function service(mesh, obstacles, x, z, random) {
  building(mesh, obstacles, random, x + 5, z + 11, 27, 17, 1, 'modern', PALETTES[2], -1);
  ground(mesh, x - 19, z - 20, x + 19, z + 2, CURB + .01, '#636563', 'paving');
  mesh.box(x - 18, 4.65, z - 20, x + 18, 5.08, z - 7, '#566f63');
  mesh.box(x - 18, 4.88, z - 20.01, x + 18, 4.96, z - 19.98, '#c3bda1');
  for (const dx of [-13, 0, 13]) {
    mesh.box(x + dx - .74, CURB, z - 14.8, x + dx + .74, .31, z - 11.65, '#a5a093');
    mesh.box(x + dx - .5, .29, z - 14.3, x + dx + .5, 1.84, z - 13.12, '#c0c3ac');
    mesh.box(x + dx - .44, 1.04, z - 14.33, x + dx + .44, 1.52, z - 14.30, '#4b5b56');
    mesh.cylY(x + dx, 1.84, z - 11.96, .19, 2.82, '#6d746c', 8);
    footprint(obstacles, x + dx - .74, z - 14.8, x + dx + .74, z - 11.65, 'street-furniture');
  }
}

function sidewalk(mesh, x0, z0, x1, z1, paving) {
  if (x1 <= x0 || z1 <= z0) return;
  mesh.box(x0, -.012, z0, x1, CURB - .029, z1, CURB_STONE);
  mesh.box(x0 + .16, CURB - .03, z0 + .16, x1 - .16, CURB, z1 - .16, paving, 'paving');
}

function sidewalkBlock(mesh, obstacles, ix, iz, x, z, kind) {
  const x0 = roads[ix] + widths[ix];
  const x1 = roads[ix + 1] - widths[ix + 1];
  const z0 = roads[iz] + widths[iz];
  const z1 = roads[iz + 1] - widths[iz + 1];
  const side = baySide(ix, iz);
  const hue = kind === 'market' || kind === 'historic' ? '#b8ae9e' : FOOTWAY;
  if (side === 0) {
    sidewalk(mesh, x0, z0, x1, z1, hue);
    return;
  }
  const start = z - BAY_LENGTH / 2;
  const end = z + BAY_LENGTH / 2;
  const min = x0 + (side === -1 ? BAY_DEPTH : 0);
  const max = x1 - (side === 1 ? BAY_DEPTH : 0);
  sidewalk(mesh, x0, z0, x1, start, hue);
  sidewalk(mesh, min, start, max, end, hue);
  sidewalk(mesh, x0, end, x1, z1, hue);
  const bay = side === -1 ? x0 : max;
  const stripeX = side === -1 ? bay + .09 : bay + BAY_DEPTH - .19;
  ground(mesh, bay, start, bay + BAY_DEPTH, end, .002, '#50504f', 'asphalt');
  ground(mesh, stripeX, start + .55, stripeX + .10, end - .55, .011, '#d1cbb8');
  for (let i = 0; i < 6; i++) {
    const line = start + .7 + i * 5.3;
    ground(mesh, bay + .08, line, bay + BAY_DEPTH - .08, line + .057, .011, '#d1cbb8');
  }
  parkingSign(mesh, obstacles, side === -1 ? min + .47 : max - .47, start + .85, side);
  for (let i = 0; i < 5; i++) {
    if ((i + ix * 3 + iz) % 4 > 0) continue;
    parkedCar(mesh, obstacles, bay + BAY_DEPTH / 2, start + 3.3 + i * 5.3,
      PARKED_PAINTS[(ix * 3 + iz + i) % PARKED_PAINTS.length], -side);
  }
}

function neighborhood(mesh, obstacles, random, ix, iz, x, z, kind) {
  const palette = salt => PALETTES[(ix * 5 + iz * 3 + salt) % PALETTES.length];
  if (kind === 'residential') {
    for (const side of [-1, 1]) {
      const street = side * (12.5 + random() * 2);
      const frontage = side > 0 ? 1 : -1;
      building(mesh, obstacles, random, x + street, z + side * 9.5, 13 + random() * 2, 13 + random() * 2,
        random() < .35 ? 3 : 2, 'gable', palette(side + 1), frontage);
      tree(mesh, obstacles, x + street + side * 4, z - side * 13.5, .76 + .28 * random());
    }
    return;
  }
  if (kind === 'historic') {
    for (const side of [-1, 1]) {
      const rowOffset = side * (12.8 + random() * 1.7);
      for (const wing of [-1, 1]) {
        building(mesh, obstacles, random, x + wing * 11.1, z + rowOffset, 19.8, 13.8,
          3 + Math.floor(random() * 2), side === -1 && wing === 1 ? 'shop' : 'historic', palette((side + 1) + (wing + 1) * 2), side);
      }
    }
  } else if ((ix + iz) % 2 === 0) {
    building(mesh, obstacles, random, x - 4, z + 3, 34, 28, 4 + (iz % 2), 'modern', palette(0), -1);
    tree(mesh, obstacles, x + 20.7, z + 10, .81);
  } else {
    building(mesh, obstacles, random, x, z + 12, 35, 16.5, 4, 'brick', palette(2), -1);
    building(mesh, obstacles, random, x - 8.5, z - 11, 18.6, 15, 3, 'shop', palette(5), -1);
  }
  tree(mesh, obstacles, x - 22, z - 20.8, .88 + random() * .22);
  tree(mesh, obstacles, x + 22, z + 21.2, .87 + random() * .3);
  if (kind === 'mixed') bench(mesh, obstacles, x + 18, z - 18);
}

function roadSegment(mesh, axis, center, width, start, end) {
  const patch = (u0, v0, u1, v1, y, hex, material) => {
    if (axis === 0) ground(mesh, u0, v0, u1, v1, y, hex, material);
    else ground(mesh, v0, u0, v1, u1, y, hex, material);
  };
  patch(center - width, start, center + width, end, .002, ROAD, 'asphalt');
  patch(center - width, start, center - width + .28, end, .005, '#65635d', 'asphalt');
  patch(center + width - .28, start, center + width, end, .005, '#65635d', 'asphalt');
  const boulevard = width > 6.2;
  for (const sign of [-1, 1]) {
    const u = center + sign * (boulevard ? 4.83 : width - .42);
    patch(u - .046, start + 4.5, u + .046, end - 4.5, .009, '#b8b5a8');
    if (boulevard) {
      const outer = center + sign * (width - .28);
      patch(Math.min(u, outer), start + 4.5, Math.max(u, outer), end - 4.5, .005, '#675752', 'asphalt');
    }
  }
  const length = boulevard ? 3.7 : 2.8;
  for (let v = start + 8; v + length < end - 5; v += length + 5.8) {
    patch(center - .07, v, center + .07, v + length, .011, PAINT);
  }
  if (end - start > 22) {
    const slot = (start + end) / 2;
    patch(center - width + .47, slot - .24, center - width + 1.01, slot + .24, .008, '#696b66');
    patch(center + .95, slot + 3.5, center + 3.2, slot + 5.2, .007, '#565552', 'asphalt');
  }
}

const isSignalized = (x, z) => Math.abs(x) <= 70 && Math.abs(z) <= 70;

function crosswalk(mesh, x, z, spanX, spanZ, lights) {
  const patch = (axis, u0, v0, u1, v1) => {
    if (axis === 0) ground(mesh, x + u0, z + v0, x + u1, z + v1, .015, PAINT);
    else ground(mesh, x + v0, z + u0, x + v1, z + u1, .015, PAINT);
  };
  for (const axis of [0, 1]) {
    const across = axis === 0 ? spanX : spanZ;
    const along = axis === 0 ? spanZ : spanX;
    for (const dir of [-1, 1]) {
      const line = dir * (along + 2.75);
      for (let k = .55 - across; k < across - .85; k += 1.15) {
        patch(axis, k, line - 1.07, k + .52, line + 1.07);
      }
      if (!lights) continue;
      const stop = dir * (along + 5.2);
      const lane = dir * (axis === 0 ? 1 : -1) * (across - .43);
      patch(axis, Math.min(.16, lane), stop - .13, Math.max(-.16, lane), stop + .13);
    }
  }
}

export function buildCity({ Mesh, seed = 364844 }) {
  const random = randomFrom(seed);
  const landscape = new Mesh();
  const chunks = new Map();
  const obstacles = [];
  const districts = [];
  const signals = [];

  function meshAt(x, z, reach) {
    const key = `${Math.floor((x + EDGE) / 100)},${Math.floor((z + EDGE) / 100)}`;
    if (!chunks.has(key)) {
      chunks.set(key, { mesh: new Mesh(), minX: x - reach, maxX: x + reach, minZ: z - reach, maxZ: z + reach });
    }
    const chunk = chunks.get(key);
    chunk.minX = Math.min(chunk.minX, x - reach);
    chunk.maxX = Math.max(chunk.maxX, x + reach);
    chunk.minZ = Math.min(chunk.minZ, z - reach);
    chunk.maxZ = Math.max(chunk.maxZ, z + reach);
    return chunk.mesh;
  }

  ground(landscape, -490, -490, 490, 490, -.032, '#77895e', 'grass');
  for (let i = 0; i < 78; i++) {
    const angle = i * Math.PI * 2 / 78;
    const distance = 352 + random() * 88;
    const x = Math.sin(angle) * distance;
    const z = Math.cos(angle) * distance;
    const height = 6 + random() * 19;
    const width = 7 + random() * 13;
    landscape.box(x - width * .5, -.04, z - width * .4, x + width * .5, height, z + width * .4, '#8d9690');
    if (i % 3 === 0) landscape.box(x - width * .3, height, z - width * .26, x + width * .3, height + 1.9, z + width * .26, '#7a8984');
  }

  for (let i = 0; i < roads.length; i++) {
    const center = roads[i];
    for (let j = 0; j <= roads.length; j++) {
      const start = j ? roads[j - 1] + widths[j - 1] : -EDGE;
      const end = j < roads.length ? roads[j] - widths[j] : EDGE;
      const mid = (start + end) / 2;
      const reach = Math.max(widths[i], (end - start) / 2);
      roadSegment(meshAt(center, mid, reach), 0, center, widths[i], start, end);
      roadSegment(meshAt(mid, center, reach), 1, center, widths[i], start, end);
    }
    for (let j = 0; j < roads.length; j++) {
      const z = roads[j];
      const mesh = meshAt(center, z, Math.max(widths[i], widths[j]) + 8);
      const lights = isSignalized(center, z);
      ground(mesh, center - widths[i], z - widths[j], center + widths[i], z + widths[j], .002, '#4d4e4d', 'asphalt');
      if (lights || (i > 0 && j > 0 && i < 6 && j < 6 && (i + j) % 2 === 0)) {
        crosswalk(mesh, center, z, widths[i], widths[j], lights);
      }
      if (i < 6 && j < 6) streetLamp(mesh, obstacles, center + widths[i] + 1.65, z + widths[j] + 7.3, 5.75, -1);
      if (!lights) continue;
      for (const axis of [0, 1]) for (const direction of [-1, 1]) {
        trafficSignal(mesh, obstacles, signals, center, z, axis, direction);
      }
    }
  }

  for (let ix = 0; ix < 6; ix++) for (let iz = 0; iz < 6; iz++) {
    const x = roads[ix] + BLOCK_SIZE / 2;
    const z = roads[iz] + BLOCK_SIZE / 2;
    const kind = blockKind(ix, iz);
    const mesh = meshAt(x, z, BLOCK_SIZE / 2);
    const x0 = roads[ix] + widths[ix];
    const x1 = roads[ix + 1] - widths[ix + 1];
    const z0 = roads[iz] + widths[iz];
    const z1 = roads[iz + 1] - widths[iz + 1];
    districts.push({ kind, name: districtNames[kind], x0, x1, z0, z1 });
    sidewalkBlock(mesh, obstacles, ix, iz, x, z, kind);
    if (kind === 'park') park(mesh, obstacles, x, z);
    else if (kind === 'market') market(mesh, obstacles, x, z, random);
    else if (kind === 'station') station(mesh, obstacles, x, z, random);
    else if (kind === 'service') service(mesh, obstacles, x, z, random);
    else neighborhood(mesh, obstacles, random, ix, iz, x, z, kind);
  }

  return { landscape, cityChunks: [...chunks.values()], obstacles, districts, signals };
}
