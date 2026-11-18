export const color = (hex, brightness = 1) => {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [16, 8, 0].map(shift => Math.min(1, (value >> shift & 255) / 255 * brightness));
};

const materialId = { asphalt: 1, paving: 2, grass: 3, roof: 4, plaster: 5, brick: 6, glass: 7, water: 8, metal: 9, foliage: 10, vinyl: 11, veneer: 12 };

export class Mesh {
  constructor() {
    this.vertices = [];
    this.count = 0;
    this.buffer = null;
  }

  tri(a, b, c, fill, material, cornerNormals) {
    const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
    const bx = c[0] - a[0], by = c[1] - a[1], bz = c[2] - a[2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-10) return;
    const [red, green, blue] = typeof fill === 'string' ? color(fill) : fill;
    const surface = materialId[material] || 0;
    if (cornerNormals) {
      // The optional array contains unit normals ordered like the three corners.
      const [na, nb, nc] = cornerNormals;
      this.vertices.push(
        ...a, red, green, blue, ...na, surface,
        ...b, red, green, blue, ...nb, surface,
        ...c, red, green, blue, ...nc, surface,
      );
    } else {
      this.vertices.push(
        ...a, red, green, blue, nx / length, ny / length, nz / length, surface,
        ...b, red, green, blue, nx / length, ny / length, nz / length, surface,
        ...c, red, green, blue, nx / length, ny / length, nz / length, surface,
      );
    }
    this.count += 3;
  }

  quad(a, b, c, d, fill, material, cornerNormals) {
    this.tri(a, b, c, fill, material, cornerNormals?.slice(0, 3));
    this.tri(a, c, d, fill, material, cornerNormals && [cornerNormals[0], cornerNormals[2], cornerNormals[3]]);
  }

  box(x0, y0, z0, x1, y1, z1, fill, material) {
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
    const a = [x0, y0, z0], b = [x1, y0, z0], c = [x1, y0, z1], d = [x0, y0, z1];
    const A = [x0, y1, z0], B = [x1, y1, z0], C = [x1, y1, z1], D = [x0, y1, z1];
    this.quad(A, D, C, B, fill, material);
    this.quad(d, c, C, D, fill, material);
    this.quad(b, a, A, B, fill, material);
    this.quad(a, d, D, A, fill, material);
    this.quad(c, b, B, C, fill, material);
    this.quad(a, b, c, d, fill, material);
  }

  cylY(x, y, z, radius, height, fill, segments = 8, material) {
    const point = (i, yy) => [x + radius * Math.cos(i * 2 * Math.PI / segments), yy, z + radius * Math.sin(i * 2 * Math.PI / segments)];
    for (let i = 0; i < segments; i++) {
      const p = point(i, y), q = point(i + 1, y);
      const top = point(i, y + height), next = point(i + 1, y + height);
      this.quad(p, top, next, q, fill, material);
      this.tri([x, y + height, z], next, top, fill, material);
    }
  }

  sphere(x, y, z, rx, ry, rz, fill, slices = 9, stacks = 5, material) {
    function point(i, j) {
      const a = i * 2 * Math.PI / slices, b = -Math.PI / 2 + j * Math.PI / stacks;
      return [x + rx * Math.cos(a) * Math.cos(b), y + ry * Math.sin(b), z + rz * Math.sin(a) * Math.cos(b)];
    }
    const normal = p => {
      const n = [(p[0] - x) / (rx * rx), (p[1] - y) / (ry * ry), (p[2] - z) / (rz * rz)];
      const length = Math.hypot(...n);
      return n.map(value => value / length);
    };
    for (let j = 0; j < stacks; j++) {
      for (let i = 0; i < slices; i++) {
        const corners = [point(i, j), point(i, j + 1), point(i + 1, j + 1), point(i + 1, j)];
        this.quad(...corners, fill, material, material === 'foliage' ? corners.map(normal) : undefined);
      }
    }
  }

  upload(gl) {
    if (!this.count || this.buffer) return;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
    this.vertices = null;
  }
}
