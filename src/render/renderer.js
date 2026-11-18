import { basis, identity, intersectsFrustum, multiply, orthographic, perspective, unit, view } from './math.js';
import { depthFragment, depthVertex, meshFragment, meshVertex, presentFragment, skyFragment, skyVertex } from './shaders.js?webgl-android-fix-20261118-050';

export const MATERIAL = { solid: 0, paint: 1, glass: 2, glow: 3, contact: 4, chrome: 5 };
export const GRAPHICS = {
  performance: { label: 'Performance', maxScale: 0.82, pixels: 780_000, far: 182, trafficDistance: 95 },
  balanced: { label: 'Balanced', maxScale: 1.45, pixels: 1_430_000, far: 265, trafficDistance: 135 },
  quality: { label: 'Quality', maxScale: 1.58, pixels: 2_200_000, far: 320, trafficDistance: 165 },
};
const daytimeSun = [-0.62, 0.58, -0.52];
const eveningSun = [-0.81, 0.12, -0.58];
const world = identity();
const white = [1, 1, 1];
const shadowRange = 48;
const shadowSize = 1536;

function pipeline(gl, vertex, fragment, uniforms) {
  const program = gl.createProgram();
  const sources = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]];
  for (const [type, source] of sources) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  ['aPos', 'aColor', 'aNormal', 'aMaterial'].forEach((name, index) => gl.bindAttribLocation(program, index, name));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const locations = Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, 'u' + name)]));
  return { program, ...locations };
}

function texture(gl) {
  const result = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, result);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return result;
}

function shadowTarget(gl) {
  if (!gl.getExtension('WEBGL_depth_texture')) return null;
  const depth = texture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, shadowSize, shadowSize, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  const color = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, color);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA4, shadowSize, shadowSize);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (ok) return { framebuffer, depth };
  gl.deleteFramebuffer(framebuffer);
  gl.deleteRenderbuffer(color);
  gl.deleteTexture(depth);
  return null;
}

function sceneTarget(gl) {
  const framebuffer = gl.createFramebuffer();
  const image = texture(gl);
  const depth = gl.createRenderbuffer();
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  let width = 0, height = 0, ready = false;
  return {
    framebuffer, image,
    size(w, h) {
      if (width === w && height === h) return ready;
      width = w; height = h;
      gl.bindTexture(gl.TEXTURE_2D, image);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, image, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return ready;
    },
  };
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL konnte nicht gestartet werden.');
  const highPrecision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision > 0;
  const precision = highPrecision ? 'highp' : 'mediump';
  const shader = source => 'precision ' + precision + ' float;\n' + source.replace('precision highp float;', '');
  const sky = pipeline(gl, shader(skyVertex), shader(skyFragment), ['Forward', 'Right', 'Up', 'Frame', 'Sun', 'Dusk']);
  const lit = pipeline(gl, shader(meshVertex), shader(meshFragment), [
    'VP', 'Model', 'Light', 'Eye', 'Sun', 'Dusk', 'Tint', 'Contact', 'Style', 'Emission', 'Shadows', 'Texel',
    'Depth', 'Detail', 'HeadLamp', 'HeadAxis',
  ]);
  const depth = pipeline(gl, depthVertex, depthFragment, ['Light', 'Model']);
  const present = pipeline(gl, shader(skyVertex), shader(presentFragment), ['Image', 'Pixel']);
  const shadow = highPrecision ? shadowTarget(gl) : null;
  const color = sceneTarget(gl);
  const blank = texture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  const screen = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, screen);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  let calls = 0;
  let shadowKey, cachedLight;

  function drawScreen() {
    gl.bindBuffer(gl.ARRAY_BUFFER, screen);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    calls++;
  }

  function draw(mesh, allAttributes) {
    if (!mesh.buffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
    if (allAttributes) {
      gl.enableVertexAttribArray(1);
      gl.enableVertexAttribArray(2);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
      gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
    }
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    calls++;
  }

  function drawLit({ mesh, model = world, style = MATERIAL.solid, tint = white, emission = 0 }) {
    gl.uniformMatrix4fv(lit.Model, false, model);
    gl.uniform3fv(lit.Tint, tint);
    gl.uniform1f(lit.Style, style);
    gl.uniform1f(lit.Emission, emission);
    draw(mesh, true);
  }

  function render({ eye, target, fov, scale, quality, chunks, landscape, objects, contacts, focus, dusk = 0, headlights = false, heading = 0 }) {
    calls = 0;
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    const profile = GRAPHICS[quality];
    const qualityPass = quality === 'quality';
    const ratio = Math.min(scale, profile.maxScale, Math.sqrt(profile.pixels / (width * height)));
    const rw = Math.max(1, Math.round(width * ratio)), rh = Math.max(1, Math.round(height * ratio));
    if (rw !== canvas.width || rh !== canvas.height) {
      canvas.width = rw;
      canvas.height = rh;
    }

    const axes = basis(eye, target);
    // World convention: +Z forward, +X to the driver's right.
    axes.right = axes.right.map(value => -value);
    const vp = multiply(perspective(fov, width / height, 0.12, profile.far), view(eye, axes));
    const sun = unit(daytimeSun.map((value, index) => value + dusk * (eveningSun[index] - value)));
    let light = world;
    const useShadow = shadow && quality !== 'performance';
    if (useShadow) {
      const step = qualityPass ? 2 : 6;
      const center = [Math.round(focus[0] / step) * step, 0, Math.round(focus[2] / step) * step];
      const key = `${center[0]}:${center[2]}:${Math.round(dusk * 18)}`;
      if (qualityPass || shadowKey !== key) {
        const lightEye = center.map((value, index) => value + sun[index] * 105);
        cachedLight = multiply(orthographic(shadowRange, 2, 200), view(lightEye, basis(lightEye, center)));
        shadowKey = qualityPass ? undefined : key;
        gl.bindTexture(gl.TEXTURE_2D, blank);
        gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.framebuffer);
        gl.viewport(0, 0, shadowSize, shadowSize);
        gl.colorMask(false, false, false, false);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.55, 2);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.useProgram(depth.program);
        gl.uniformMatrix4fv(depth.Light, false, cachedLight);
        gl.uniformMatrix4fv(depth.Model, false, world);
        for (const chunk of chunks) {
          if (intersectsFrustum(cachedLight, chunk)) draw(chunk.mesh, false);
        }
        if (qualityPass) for (const object of objects) {
          if (!object.castsShadow || (object.bounds && !intersectsFrustum(cachedLight, object.bounds))) continue;
          gl.uniformMatrix4fv(depth.Model, false, object.model);
          draw(object.mesh, false);
        }
        gl.colorMask(true, true, true, true);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      light = cachedLight;
    }

    const useAntialias = qualityPass && color.size(rw, rh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, useAntialias ? color.framebuffer : null);
    gl.viewport(0, 0, rw, rh);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(sky.program);
    gl.uniform3fv(sky.Forward, axes.forward);
    gl.uniform3fv(sky.Right, axes.right);
    gl.uniform3fv(sky.Up, axes.up);
    gl.uniform3fv(sky.Sun, sun);
    gl.uniform1f(sky.Dusk, dusk);
    const slope = Math.tan(fov * 0.5);
    gl.uniform2f(sky.Frame, slope * width / height, slope);
    drawScreen();
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);

    gl.useProgram(lit.program);
    gl.uniformMatrix4fv(lit.VP, false, vp);
    gl.uniformMatrix4fv(lit.Light, false, light);
    gl.uniform3fv(lit.Eye, eye);
    gl.uniform3fv(lit.Sun, sun);
    gl.uniform1f(lit.Dusk, dusk);
    gl.uniform1f(lit.Detail, quality === 'performance' ? 0 : 1);
    gl.uniform1f(lit.HeadLamp, headlights ? 0.22 + dusk * 1.95 : 0);
    gl.uniform2f(lit.HeadAxis, Math.sin(heading), Math.cos(heading));
    gl.uniform3fv(lit.Contact, focus);
    gl.uniform1f(lit.Shadows, useShadow ? 1 : 0);
    gl.uniform1f(lit.Texel, 1 / shadowSize);
    gl.uniform1i(lit.Depth, 0);
    gl.bindTexture(gl.TEXTURE_2D, useShadow ? shadow.depth : blank);
    drawLit({ mesh: landscape });
    for (const chunk of chunks) {
      if (intersectsFrustum(vp, chunk)) drawLit(chunk);
    }
    for (const object of objects) {
      if (!object.bounds || intersectsFrustum(vp, object.bounds)) drawLit(object);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const contact of contacts) {
      if (!contact.bounds || intersectsFrustum(vp, contact.bounds)) drawLit(contact);
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    if (useAntialias) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(present.program);
      gl.uniform1i(present.Image, 0);
      gl.uniform2f(present.Pixel, 1 / rw, 1 / rh);
      gl.bindTexture(gl.TEXTURE_2D, color.image);
      drawScreen();
      gl.enable(gl.DEPTH_TEST);
    }
  }

  return {
    upload: mesh => mesh.upload(gl),
    render,
    get shadowMaps() { return Boolean(shadow); },
    get drawCalls() { return calls; },
  };
}
