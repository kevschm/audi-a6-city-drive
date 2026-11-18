export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mixAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export const unit = v => {
  const length = Math.hypot(...v) || 1;
  return v.map(value => value / length);
};
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

export const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export const translate = (x, y, z) => {
  const result = identity();
  result.set([x, y, z], 12);
  return result;
};

export function multiply(a, b) {
  const result = new Float32Array(16);
  for (let col = 0; col < 16; col += 4) {
    for (let row = 0; row < 4; row++) {
      result[col + row] = a[row] * b[col] + a[4 + row] * b[col + 1] + a[8 + row] * b[col + 2] + a[12 + row] * b[col + 3];
    }
  }
  return result;
}

export function rotateX(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

export function rotateY(angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

export function transform(x, z, heading, y = 0, roll = 0, pitch = 0) {
  const matrix = rotateY(heading);
  if (roll || pitch) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const lean = new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    matrix.set(multiply(matrix, multiply(lean, rotateX(pitch))));
  }
  matrix.set([x, y, z], 12);
  return matrix;
}

export function basis(eye, target) {
  const forward = unit(subtract(target, eye));
  const right = unit(cross(forward, [0, 1, 0]));
  return { forward, right, up: cross(right, forward) };
}

export function view(eye, { forward, right, up }) {
  return new Float32Array([
    right[0], up[0], -forward[0], 0,
    right[1], up[1], -forward[1], 0,
    right[2], up[2], -forward[2], 0,
    -dot(right, eye), -dot(up, eye), dot(forward, eye), 1,
  ]);
}

export function perspective(fov, aspect, near, far) {
  const s = 1 / Math.tan(fov / 2);
  return new Float32Array([s / aspect, 0, 0, 0, 0, s, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * near * far / (near - far), 0]);
}

export function orthographic(size, near, far) {
  return new Float32Array([1 / size, 0, 0, 0, 0, 1 / size, 0, 0, 0, 0, 2 / (near - far), 0, 0, 0, (far + near) / (near - far), 1]);
}

export function intersectsFrustum(matrix, bounds) {
  const { minX, maxX, minY = -1, maxY = 80, minZ, maxZ } = bounds;
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const x = matrix[3] + sign * matrix[axis];
      const y = matrix[7] + sign * matrix[4 + axis];
      const z = matrix[11] + sign * matrix[8 + axis];
      const offset = matrix[15] + sign * matrix[12 + axis];
      if (x * (x > 0 ? maxX : minX) + y * (y > 0 ? maxY : minY) + z * (z > 0 ? maxZ : minZ) + offset < 0) return false;
    }
  }
  return true;
}
