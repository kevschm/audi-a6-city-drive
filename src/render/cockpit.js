import { identity, multiply, translate } from './math.js';
import { Mesh } from './mesh.js';

export function dialAngle(value, maximum) {
  return (225 - 270 * Math.min(1, Math.max(0, value / maximum))) * Math.PI / 180;
}

const segmented = (mesh, x, y, z, inner, outer, start, end, hue, material) => {
  const segments = Math.max(1, Math.ceil(Math.abs(end - start) / 0.17));
  const at = (r, a) => [x + r * Math.cos(a), y + r * Math.sin(a), z];
  for (let j = 0; j < segments; j++) {
    const a = start + (end - start) * j / segments, b = start + (end - start) * (j + 1) / segments;
    mesh.quad(at(inner, b), at(outer, b), at(outer, a), at(inner, a), hue, material);
  }
};

const numerals = [
  '111101101101111', '010110010010111', '111001111100111', '111001111001111',
  '101101111001001', '111100111001111', '111100111101111', '111001010010010',
  '111101111101111', '111101111001111',
];

function number(mesh, value, x, y, z, size, color) {
  const text = String(value);
  const start = x - (text.length * 4 - 1) * size * 0.5;
  Array.from(text).forEach((digit, position) => {
    const pixels = numerals[Number(digit)];
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] !== '1') continue;
      const u = start + (position * 4 + i % 3) * size;
      const v = y + (2 - Math.floor(i / 3)) * size;
      mesh.quad([u, v, z], [u, v + size, z], [u + size, v + size, z], [u + size, v, z], color);
    }
  });
}

function gauge(shell, instruments, { x, y, radius, maximum, step, redline }) {
  const circle = Math.PI * 2;
  segmented(shell, x, y, 0.628, 0, radius + 0.006, 0, circle, '#0c0e10');
  segmented(shell, x, y, 0.621, radius, radius + 0.006, 0, circle, '#6a6861', 'metal');
  const intervals = maximum / step;
  for (let i = 0; i <= intervals * 4; i++) {
    const major = i % 4 === 0;
    const angle = dialAngle(i, intervals * 4);
    const color = i / 4 * step >= redline ? '#ed674d' : '#f2dfbf';
    segmented(instruments, x, y, 0.625, radius * (major ? 0.79 : 0.88), radius * 0.96,
      angle - 0.013, angle + 0.013, color);
    if (major) number(instruments, i / 4 * step, x + Math.cos(angle) * radius * 0.63,
      y + Math.sin(angle) * radius * 0.63, 0.625, 0.0023, color);
  }
}

export function createCockpit() {
  const shell = new Mesh(), hood = new Mesh(), instruments = new Mesh(), wheel = new Mesh(), needle = new Mesh();
  const damagedScreen = new Mesh();
  damagedScreen.quad([-0.74, 1.055, 1.10], [0.74, 1.055, 1.10],
    [0.68, 1.415, 0.29], [-0.68, 1.415, 0.29], '#b3cede');
  const dashFront = [
    [-0.80, 0.940], [-0.65, 1.015], [-0.56, 1.114], [-0.36, 1.132],
    [-0.19, 1.072], [-0.11, 0.992], [0.49, 0.967], [0.79, 0.946],
  ];
  for (let i = 1; i < dashFront.length; i++) {
    const [x, y] = dashFront[i - 1], [xx, yy] = dashFront[i];
    shell.quad([x, 0.70, 0.62], [x, y, 0.64], [xx, yy, 0.64], [xx, 0.70, 0.62], '#282725', 'vinyl');
    shell.quad([x, y, 0.64], [x, 1.061, 1.12], [xx, 1.061, 1.12], [xx, yy, 0.64], '#393837', 'vinyl');
  }
  for (const [left, right] of [[-0.75, -0.125], [0.333, 0.733]]) {
    shell.box(left, 0.834, 0.601, right, 0.876, 0.647, '#79513b', 'veneer');
    shell.box(left, 0.869, 0.599, right, 0.873, 0.604, '#98725d');
  }
  shell.box(-0.092, 0.675, 0.590, 0.313, 0.958, 0.66, '#1b1b19', 'vinyl');
  for (const x of [-0.691, -0.020, 0.111, 0.242, 0.652]) {
    shell.box(x - 0.061, 0.901, 0.577, x + 0.061, 0.949, 0.632, '#4e4b43');
    shell.box(x - 0.056, 0.906, 0.574, x + 0.056, 0.944, 0.585, '#131413');
    for (let row = 0; row < 4; row++) {
      const y = 0.909 + row * 0.009;
      shell.box(x - 0.052, y, 0.568, x + 0.052, y + 0.003, 0.577, '#55534c');
    }
    shell.box(x - 0.009, 0.920, 0.564, x + 0.009, 0.929, 0.573, '#716d62');
  }
  for (let i = 0; i < 7; i++) {
    const x = -0.061 + i * 0.050;
    shell.box(x, 0.861, 0.574, x + 0.042, 0.886, 0.591, i === 3 ? '#742f26' : '#403b34');
  }
  instruments.tri([0.100, 0.868, 0.572], [0.110, 0.881, 0.572], [0.120, 0.868, 0.572], '#f07247');
  shell.box(-0.056, 0.774, 0.574, 0.274, 0.850, 0.594, '#373630');
  shell.box(-0.004, 0.807, 0.568, 0.196, 0.840, 0.575, '#1d201b');
  shell.box(0.003, 0.788, 0.565, 0.188, 0.795, 0.575, '#0a0b0a');
  for (const x of [-0.030, 0.239]) segmented(shell, x, 0.812, 0.562, 0, 0.015, 0, 2 * Math.PI, '#767063', 'vinyl');
  number(instruments, 987, 0.094, 0.822, 0.565, 0.0041, '#e99154');
  instruments.box(0.100, 0.812, 0.563, 0.104, 0.816, 0.567, '#e99154');
  shell.box(-0.041, 0.711, 0.574, 0.258, 0.759, 0.594, '#302c27');
  for (const x of [-0.019, 0.188]) {
    shell.box(x, 0.722, 0.569, x + 0.055, 0.747, 0.575, '#492b1e');
    number(instruments, 21, x + 0.026, 0.734, 0.566, 0.0033, '#ec884f');
  }
  for (let i = 0; i < 3; i++) {
    const x = 0.052 + i * 0.040;
    shell.box(x, 0.723, 0.568, x + 0.033, 0.746, 0.579, '#4d4942');
  }
  for (const side of [-1, 1]) {
    shell.quad([side * 0.738, 1.05, 1.106], [side * 0.815, 1.047, 1.105],
      [side * 0.712, 1.412, 0.28], [side * 0.651, 1.406, 0.30], '#313431', 'vinyl');
    shell.box(side > 0 ? 0.61 : -0.795, 0.756, 0.12, side > 0 ? 0.795 : -0.61, 0.86, 0.66, '#252a29');
    hood.quad([0, 0.980, 1.09], [0, 0.893, 2.36], [side * 0.79, 0.854, 2.36], [side * 0.817, 0.932, 1.12], '#152027');
  }
  shell.quad([-0.718, 1.412, 0.28], [0.718, 1.412, 0.28], [0.706, 1.453, 0.25], [-0.706, 1.453, 0.25], '#454442', 'vinyl');
  shell.quad([-0.706, 1.453, 0.25], [0.706, 1.453, 0.25], [0.681, 1.468, -0.65], [-0.681, 1.468, -0.65], '#524e49', 'vinyl');
  shell.box(-0.135, 1.342, 0.426, 0.135, 1.393, 0.458, '#242729');
  shell.box(-0.119, 1.349, 0.422, 0.119, 1.386, 0.430, '#50616b');
  shell.box(-0.018, 1.383, 0.438, 0.018, 1.420, 0.460, '#33383b');
  shell.quad([-0.016, 1.404, 0.43], [0.016, 1.404, 0.43], [0.019, 1.430, 0.25], [-0.019, 1.430, 0.25], '#3e3a35');
  gauge(shell, instruments, { x: -0.486, y: 1.026, radius: 0.075, maximum: 240, step: 40 });
  gauge(shell, instruments, { x: -0.297, y: 1.026, radius: 0.075, maximum: 7, step: 1, redline: 6.25 });
  shell.box(-0.458, 0.843, 0.394, -0.331, 0.930, 0.631, '#272622', 'vinyl');
  for (const [x, angle] of [[-0.584, 1.2], [-0.198, 2.0]]) {
    segmented(shell, x, 1.010, 0.626, 0, 0.028, 0.15, Math.PI - 0.15, '#131211');
    for (let i = 1; i < 5; i++) segmented(instruments, x, 1.010, 0.623, 0.019, 0.024,
      0.58 * i - 0.04, 0.58 * i + 0.04, '#f2dfbf');
    segmented(instruments, x, 1.010, 0.619, 0.003, 0.021, angle - 0.075, angle + 0.075, '#ee7b51');
  }
  const ring = (i, across) => {
    const angle = i * Math.PI / 32;
    const facet = across * Math.PI / 4;
    const r = 0.167 + 0.015 * Math.cos(facet);
    return [r * Math.cos(angle), r * Math.sin(angle), 0.015 * Math.sin(facet) - 0.011];
  };
  for (let i = 0; i < 64; i++) for (let facet = 0; facet < 8; facet++) {
    wheel.quad(ring(i, facet), ring(i, facet + 1), ring(i + 1, facet + 1), ring(i + 1, facet),
      facet === 5 || facet === 6 ? '#3f3b36' : '#302d29', 'vinyl');
  }
  for (const side of [-1, 1]) {
    wheel.quad([side * 0.050, 0.025, -0.012], [side * 0.169, 0.051, -0.007],
      [side * 0.168, 0.020, -0.008], [side * 0.059, -0.006, -0.016], '#46413a', 'vinyl');
    wheel.quad([side * 0.026, -0.033, -0.013], [side * 0.087, -0.153, -0.009],
      [side * 0.116, -0.134, -0.008], [side * 0.064, -0.020, -0.013], '#39352e', 'vinyl');
  }
  wheel.sphere(0, -0.009, -0.019, 0.087, 0.049, 0.021, '#3e3933', 32, 8, 'vinyl');
  for (let i = 0; i < 4; i++) segmented(wheel, -0.027 + i * 0.018, -0.005, -0.042, 0.010, 0.012, 0, Math.PI * 2, '#b6b5ae', 'metal');
  needle.tri([-0.011, -0.003, 0], [-0.011, 0.003, 0], [0.069, 0, 0], '#f26f45');
  segmented(needle, 0, 0, -0.001, 0, 0.006, 0, Math.PI * 2, '#93513f');
  return { shell, hood, instruments, wheel, needle, damagedScreen };
}

export function dialPose(body, x, y, z, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotation = identity();
  rotation.set([c, s, 0, 0, -s, c], 0);
  return multiply(body, multiply(translate(x, y, z), rotation));
}
