const noise = `
float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
`;

const atmosphere = `
uniform vec3 uSun;
vec3 horizon(vec3 ray) {
  vec3 flatRay = normalize(vec3(ray.x, 0.02, ray.z));
  vec3 flatSun = normalize(vec3(uSun.x, 0.02, uSun.z));
  float gold = pow(max(dot(flatRay, flatSun), 0.0), 3.0);
  return mix(vec3(0.66, 0.72, 0.76), vec3(0.94, 0.78, 0.61), 0.63 * gold);
}
vec3 skyColor(vec3 ray) {
  return mix(horizon(ray), vec3(0.26, 0.51, 0.74), pow(max(ray.y, 0.0), 0.52));
}
`;

export const skyVertex = `
attribute vec2 aPos;
varying vec2 vScreen;
void main() {
  vScreen = aPos;
  gl_Position = vec4(aPos, 1.0, 1.0);
}
`;

export const skyFragment = `
precision highp float;
varying vec2 vScreen;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uFrame;
${noise}
${atmosphere}
void main() {
  vec3 ray = normalize(uForward + uRight * vScreen.x * uFrame.x + uUp * vScreen.y * uFrame.y);
  vec3 rgb = skyColor(ray);
  float sun = max(0.0, dot(ray, uSun));
  rgb += vec3(0.16, 0.11, 0.05) * pow(sun, 28.0);
  rgb += vec3(1.0, 0.81, 0.49) * smoothstep(0.99972, 0.99993, sun);
  vec2 cloud = ray.xz * (1.35 / (max(0.06, ray.y) + 0.14));
  float layers = noise2(cloud * 2.7 + vec2(13.0, 2.1)) * 0.65
               + noise2(cloud * 6.0) * 0.23 + noise2(cloud * 13.0) * 0.12;
  float density = smoothstep(0.57, 0.75, layers) * smoothstep(0.02, 0.26, ray.y);
  rgb = mix(rgb, vec3(0.96, 0.92, 0.84), density * 0.78);
  gl_FragColor = vec4(rgb, 1.0);
}
`;

export const meshVertex = `
attribute vec3 aPos;
attribute vec3 aColor;
attribute vec3 aNormal;
attribute float aMaterial;
uniform mat4 uVP;
uniform mat4 uModel;
uniform mat4 uLight;
uniform vec3 uEye;
varying vec3 vEyeDelta;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vShadow;
varying float vMaterial;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vEyeDelta = uEye - world.xyz;
  vLocal = aPos;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  vMaterial = aMaterial;
  vShadow = uLight * world;
  gl_Position = uVP * world;
}
`;

export const meshFragment = `
precision highp float;
uniform vec3 uTint;
uniform vec3 uContact;
uniform float uStyle;
uniform float uEmission;
uniform float uShadows;
uniform float uTexel;
uniform sampler2D uDepth;
varying vec3 vEyeDelta;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vShadow;
varying float vMaterial;
${noise}
${atmosphere}

float sunlight(float incidence) {
  if (uShadows < 0.5) return 1.0;
  vec3 p = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  if (p.x < 0.003 || p.y < 0.003 || p.z < 0.0 || p.x > 0.997 || p.y > 0.997 || p.z > 1.0) return 1.0;
  float bias = 0.0011 + (1.0 - incidence) * 0.0018;
  float visible = 0.0;
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      float depth = texture2D(uDepth, p.xy + vec2(float(x), float(y)) * (uTexel * 1.25)).r;
      visible += step(p.z - bias, depth);
    }
  }
  float edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
  return mix(1.0, visible / 9.0, smoothstep(0.003, 0.10, edge));
}

float surfaceGrain(vec3 n, float d) {
  if (vMaterial < 0.5 || vMaterial > 6.5) return 1.0;
  vec2 xz = vWorld.xz;
  float closeup = 1.0 - smoothstep(9.0, 42.0, d);
  if (vMaterial < 1.5) {
    float patch = noise2(xz * 0.46) - 0.5;
    float gravel = noise2(xz * 35.0) - 0.5;
    float track = 0.96 + 0.04 * sin(xz.x * 1.7) * sin(xz.y * 1.7);
    return track + 0.12 * patch + closeup * 0.43 * gravel;
  }
  if (vMaterial < 2.5) {
    vec2 p = xz * vec2(2.8, 2.5);
    p.x += mod(floor(p.y), 2.0) * 0.5;
    float joint = smoothstep(0.02, 0.09, min(fract(p.x), fract(p.y)));
    return 1.03 + (hash(floor(p)) * 0.18 - 0.09 - 0.19 * (1.0 - joint)) * closeup;
  }
  if (vMaterial < 3.5) return 0.87 + 0.22 * noise2(xz * 1.1) + closeup * 0.19 * noise2(xz * 17.0);
  vec2 wall = vec2(abs(n.x) > abs(n.z) ? vWorld.z : vWorld.x, vWorld.y);
  if (vMaterial < 4.5) return 0.94 + 0.11 * noise2(xz * 3.8) - 0.16 * closeup * (1.0 - smoothstep(0.04, 0.16, fract(xz.y * 3.15)));
  if (vMaterial < 5.5) return 0.94 + noise2(wall * 8.0) * 0.13;
  vec2 brick = wall * vec2(3.35, 7.5);
  brick.x += mod(floor(brick.y), 2.0) * 0.5;
  float mortar = 1.0 - smoothstep(0.05, 0.14, min(fract(brick.x), fract(brick.y)));
  return 1.0 + (hash(floor(brick)) * 0.16 - 0.08 - mortar * 0.19) * closeup;
}

void main() {
  if (uStyle > 3.5) {
    vec2 oval = vLocal.xz / vec2(1.35, 2.85);
    float alpha = 0.47 * (1.0 - smoothstep(0.22, 1.0, length(oval)));
    gl_FragColor = vec4(0.05, 0.07, 0.09, alpha);
    return;
  }
  vec3 n = normalize(vNormal);
  vec3 delta = vEyeDelta;
  float d = length(delta);
  vec3 toEye = delta / max(d, 0.01);
  float direct = max(0.0, dot(n, uSun));
  float sky = n.y * 0.5 + 0.5;
  float visibility = sunlight(direct);
  vec3 ambient = mix(vec3(0.32, 0.33, 0.35), vec3(0.56, 0.63, 0.71), sky);
  vec3 light = ambient + visibility * direct * vec3(0.78, 0.64, 0.49);
  vec3 base = vColor * uTint;
  vec3 lit = base * (0.32 + 0.75 * light) * surfaceGrain(n, d);
  float groundShadow = 1.0 - 0.30 * exp(-dot((vWorld.xz - uContact.xz) * 0.67, (vWorld.xz - uContact.xz) * 0.67));
  lit *= mix(1.0, groundShadow, (1.0 - smoothstep(0.04, 0.22, vWorld.y)) * step(0.5, vMaterial));
  vec3 reflected = reflect(-toEye, n);
  float edge = pow(1.0 - clamp(dot(toEye, n), 0.0, 1.0), 3.0);
  float shine = max(0.0, dot(normalize(uSun + toEye), n));
  vec3 environment = skyColor(reflected) * (0.19 + 0.81 * smoothstep(-0.23, 0.34, reflected.y));
  if (uStyle > 0.5 && uStyle < 1.5) {
    lit += environment * (0.060 + 0.25 * edge);
    lit += vec3(1.0, 0.87, 0.69) * pow(shine, 70.0) * visibility * 0.48;
  }
  if ((uStyle > 1.5 && uStyle < 2.5) || vMaterial > 6.5) {
    float amount = uStyle > 1.5 ? 0.23 : 0.12;
    lit = mix(lit, environment, amount + 0.4 * edge);
    lit += vec3(0.83, 0.88, 0.90) * pow(shine, 86.0) * 0.26 * visibility;
  }
  lit += base * uEmission;
  float fog = 1.0 - exp(-d * d * 0.000021);
  vec3 fogColor = horizon(normalize(-delta));
  gl_FragColor = vec4(mix(lit, fogColor, fog * 0.94), 1.0);
}
`;

export const depthVertex = `
attribute vec3 aPos;
uniform mat4 uLight;
uniform mat4 uModel;
void main() {
  gl_Position = uLight * uModel * vec4(aPos, 1.0);
}
`;

export const depthFragment = `
precision mediump float;
void main() {
  gl_FragColor = vec4(0.0);
}
`;
