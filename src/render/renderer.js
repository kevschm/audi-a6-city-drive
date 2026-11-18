import { basis, identity, intersectsFrustum, multiply, orthographic, perspective, unit, view } from './math.js';
import { depthFragment, depthVertex, meshFragment, meshVertex, skyFragment, skyVertex } from './shaders.js?webgl-android-fix-20261118';

export const MATERIAL = { solid: 0, paint: 1, glass: 2, glow: 3, contact: 4 };
const sun = unit([-0.59, 0.64, -0.49]);
const world = identity();
const white = [1, 1, 1];
const shadowRange = 48;
const shadowSize = 1024;

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

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL konnte nicht gestartet werden.');
  const highPrecision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision > 0;
  const precision = highPrecision ? 'highp' : 'mediump';
  const shader = source => 'precision ' + precision + ' float;\n' + source.replace('precision highp float;', '');
  const sky = pipeline(gl, shader(skyVertex), shader(skyFragment), ['Forward', 'Right', 'Up', 'Frame', 'Sun']);
  const lit = pipeline(gl, shader(meshVertex), shader(meshFragment), ['VP', 'Model', 'Light', 'Eye', 'Sun', 'Tint', 'Contact', 'Style', 'Emission', 'Shadows', 'Texel', 'Depth']);
  const depth = pipeline(gl, depthVertex, depthFragment, ['Light', 'Model']);
  const shadow = highPrecision ? shadowTarget(gl) : null;
  const blank = texture(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  const screen = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, screen);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  let calls = 0;

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

  function render({ eye, target, fov, scale, quality, chunks, landscape, objects, contacts, focus }) {
    calls = 0;
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    const pixelCap = quality === 'eco' ? 820_000 : quality === 'high' ? 2_500_000 : 1_600_000;
    const ratio = Math.min(scale, Math.sqrt(pixelCap / (width * height)));
    const rw = Math.max(1, Math.round(width * ratio)), rh = Math.max(1, Math.round(height * ratio));
    if (rw !== canvas.width || rh !== canvas.height) {
      canvas.width = rw;
      canvas.height = rh;
    }

    const axes = basis(eye, target);
    // World convention: +Z forward, +X to the driver's right.
    axes.right = axes.right.map(value => -value);
    const far = quality === 'eco' ? 185 : 320;
    const vp = multiply(perspective(fov, width / height, 0.12, far), view(eye, axes));
    let light = world;
    const useShadow = shadow && quality !== 'eco';
    if (useShadow) {
      const center = [Math.round(focus[0] / 2) * 2, 0, Math.round(focus[2] / 2) * 2];
      const lightEye = center.map((value, index) => value + sun[index] * 105);
      light = multiply(orthographic(shadowRange, 2, 200), view(lightEye, basis(lightEye, center)));
      gl.bindTexture(gl.TEXTURE_2D, blank);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.framebuffer);
      gl.viewport(0, 0, shadowSize, shadowSize);
      gl.colorMask(false, false, false, false);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(depth.program);
      gl.uniformMatrix4fv(depth.Light, false, light);
      gl.uniformMatrix4fv(depth.Model, false, world);
      for (const chunk of chunks) {
        if (intersectsFrustum(light, chunk)) draw(chunk.mesh, false);
      }
      for (const object of objects) {
        if (!object.castsShadow) continue;
        gl.uniformMatrix4fv(depth.Model, false, object.model);
        draw(object.mesh, false);
      }
      gl.colorMask(true, true, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, rw, rh);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(sky.program);
    gl.uniform3fv(sky.Forward, axes.forward);
    gl.uniform3fv(sky.Right, axes.right);
    gl.uniform3fv(sky.Up, axes.up);
    gl.uniform3fv(sky.Sun, sun);
    const slope = Math.tan(fov * 0.5);
    gl.uniform2f(sky.Frame, slope * width / height, slope);
    gl.bindBuffer(gl.ARRAY_BUFFER, screen);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    calls++;
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);

    gl.useProgram(lit.program);
    gl.uniformMatrix4fv(lit.VP, false, vp);
    gl.uniformMatrix4fv(lit.Light, false, light);
    gl.uniform3fv(lit.Eye, eye);
    gl.uniform3fv(lit.Sun, sun);
    gl.uniform3fv(lit.Contact, focus);
    gl.uniform1f(lit.Shadows, useShadow ? 1 : 0);
    gl.uniform1f(lit.Texel, 1 / shadowSize);
    gl.uniform1i(lit.Depth, 0);
    gl.bindTexture(gl.TEXTURE_2D, useShadow ? shadow.depth : blank);
    drawLit({ mesh: landscape });
    for (const chunk of chunks) {
      if (intersectsFrustum(vp, chunk)) drawLit(chunk);
    }
    for (const object of objects) drawLit(object);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const contact of contacts) drawLit(contact);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  return {
    upload: mesh => mesh.upload(gl),
    render,
    get shadowMaps() { return Boolean(shadow); },
    get drawCalls() { return calls; },
  };
}
