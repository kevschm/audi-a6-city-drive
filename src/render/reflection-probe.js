// OpenGL cube coordinates: each face's +S and +T axes point right and up
// in the framebuffer. Only complete six-face captures become visible.
export const cubeAxes = [
  [[1,0,0], [0,0,-1], [0,-1,0]], [[-1,0,0], [0,0,1], [0,-1,0]],
  [[0,1,0], [1,0,0], [0,0,1]], [[0,-1,0], [1,0,0], [0,0,-1]],
  [[0,0,1], [1,0,0], [0,-1,0]], [[0,0,-1], [-1,0,0], [0,-1,0]],
].map(([forward, right, up]) => ({forward, right, up}));

export function createReflectionProbe(gl) {
  const size = 64;
  const cubes = Array.from({length: 2}, () => {
    const cube = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
    for (let i = 0; i < 6; i++) gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return cube;
  });
  const target = gl.createFramebuffer(), depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, size, size);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, cubes[1], 0);
  const supported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  let front = 0, face = 0, ready = false, origin, phase, scene;
  return {
    get texture() { return cubes[front]; },
    get ready() { return ready; },
    update(focus, dusk, landscape, spacing, drawFace) {
      if (!supported) return;
      if (scene !== landscape) { ready = false; face = 0; scene = landscape; }
      if (face === 0) {
        if (ready && Math.hypot(focus[0] - origin[0], focus[2] - origin[2]) < spacing && Math.abs(dusk - phase) < .12) return;
        origin = [focus[0], focus[1] + 1.18, focus[2]];
        phase = dusk;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, cubes[1 - front], 0);
      gl.viewport(0, 0, size, size);
      drawFace(origin, cubeAxes[face]);
      if (++face === 6) { face = 0; front = 1 - front; ready = true; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
  };
}
