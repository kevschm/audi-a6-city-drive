import { identity, multiply, translate } from './math.js';
import { Mesh } from './mesh.js';

export function dialAngle(value, maximum) {
  return (225 - 270 * Math.min(1, Math.max(0, value / maximum))) * Math.PI / 180;
}

const segmented = (mesh, x, y, z, inner, outer, start, end, hue) => {
  const segments = Math.max(1, Math.ceil(Math.abs(end - start) / 0.17));
  const at = (r, a) => [x + r * Math.cos(a), y + r * Math.sin(a), z];
  for (let j = 0; j < segments; j++) {
    const a = start + (end - start) * j / segments, b = start + (end - start) * (j + 1) / segments;
    mesh.quad(at(inner, a), at(outer, a), at(outer, b), at(inner, b), hue);
  }
};

export function createCockpit() {
  const shell = new Mesh(), hood = new Mesh(), instruments = new Mesh(), wheel = new Mesh(), needle = new Mesh();
  const dashFront = [
    [-0.80, 0.940], [-0.65, 1.015], [-0.56, 1.114], [-0.36, 1.132],
    [-0.19, 1.072], [-0.11, 0.992], [0.49, 0.967], [0.79, 0.946],
  ];
  for (let i = 1; i < dashFront.length; i++) {
    const [x, y] = dashFront[i - 1], [xx, yy] = dashFront[i];
    shell.quad([x, 0.70, 0.62], [x, y, 0.64], [xx, yy, 0.64], [xx, 0.70, 0.62], '#25292a');
    shell.quad([x, y, 0.64], [x, 1.061, 1.12], [xx, 1.061, 1.12], [xx, yy, 0.64], '#34383a');
  }
  shell.box(-0.65, 0.84, 0.606, 0.65, 0.862, 0.647, '#42443d');
  shell.box(-0.08, 0.67, 0.594, 0.25, 0.93, 0.66, '#121617');
  for (const x of [-0.69, -0.045, 0.20, 0.51]) {
    shell.box(x - 0.088, 0.908, 0.593, x + 0.088, 0.948, 0.63, '#14181a');
    for (let row = 0; row < 3; row++) shell.box(x - 0.075, 0.916 + row * 0.009, 0.589, x + 0.075, 0.92 + row * 0.009, 0.595, '#5c6461');
  }
  shell.box(-0.038, 0.829, 0.584, 0.201, 0.855, 0.600, '#313a30');
  instruments.box(0.01, 0.829, 0.579, 0.150, 0.846, 0.585, '#8da775');
  for (const side of [-1, 1]) {
    shell.quad([side * 0.738, 1.05, 1.106], [side * 0.815, 1.047, 1.105],
      [side * 0.712, 1.412, 0.46], [side * 0.651, 1.406, 0.49], '#313431');
    shell.box(side > 0 ? 0.61 : -0.795, 0.756, 0.12, side > 0 ? 0.795 : -0.61, 0.86, 0.66, '#252a29');
    hood.quad([0, 0.980, 1.09], [0, 0.893, 2.36], [side * 0.79, 0.854, 2.36], [side * 0.817, 0.932, 1.12], '#152027');
  }
  shell.quad([-0.718, 1.412, 0.46], [0.718, 1.412, 0.46], [0.706, 1.453, 0.43], [-0.706, 1.453, 0.43], '#454442');
  shell.quad([-0.706, 1.453, 0.43], [0.706, 1.453, 0.43], [0.681, 1.468, -0.65], [-0.681, 1.468, -0.65], '#524e49');
  shell.box(-0.135, 1.342, 0.426, 0.135, 1.393, 0.458, '#242729');
  shell.box(-0.119, 1.349, 0.422, 0.119, 1.386, 0.430, '#50616b');
  shell.box(-0.018, 1.387, 0.451, 0.018, 1.432, 0.479, '#33383b');
  for (const x of [-0.482, -0.298]) {
    segmented(instruments, x, 1.021, 0.631, 0, 0.084, 0, Math.PI * 2, '#101416');
    segmented(instruments, x, 1.021, 0.629, 0.081, 0.087, 0, Math.PI * 2, '#596161');
    for (let i = 0; i <= 24; i++) {
      const angle = dialAngle(i, 24);
      segmented(instruments, x, 1.021, 0.628, i % 4 === 0 ? 0.063 : 0.072,
        0.077, angle - 0.013, angle + 0.013, i >= 21 && x > -0.35 ? '#d46c50' : '#cfddd0');
    }
  }
  segmented(wheel, 0, 0, -0.012, 0.154, 0.178, 0, Math.PI * 2, '#333a3b');
  segmented(wheel, 0, 0, -0.018, 0.162, 0.173, 0, Math.PI * 2, '#252b2c');
  for (const [a, b] of [[3.02, 3.31], [6.1, 6.42], [4.44, 4.80]]) {
    segmented(wheel, 0, 0, -0.008, 0.02, 0.159, a, b, '#303639');
  }
  segmented(wheel, 0, 0, -0.022, 0, 0.068, 0, Math.PI * 2, '#414546');
  for (let i = 0; i < 4; i++) segmented(wheel, -0.028 + i * 0.019, 0, -0.025, 0.010, 0.012, 0, Math.PI * 2, '#b6b8b0');
  needle.tri([-0.014, -0.007, 0], [0.075, 0, 0], [-0.014, 0.007, 0], '#f26f45');
  return { shell, hood, instruments, wheel, needle };
}

export function dialPose(body, x, y, z, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotation = identity();
  rotation.set([c, s, 0, 0, -s, c], 0);
  return multiply(body, multiply(translate(x, y, z), rotation));
}
