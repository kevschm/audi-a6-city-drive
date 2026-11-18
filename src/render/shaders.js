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
uniform float uDusk;
vec3 horizon(vec3 ray) {
  vec3 flatRay = normalize(vec3(ray.x, 0.02, ray.z));
  vec3 flatSun = normalize(vec3(uSun.x, 0.02, uSun.z));
  float gold = pow(max(dot(flatRay, flatSun), 0.0), 3.0);
  vec3 day = mix(vec3(0.61, 0.73, 0.83), vec3(0.98, 0.82, 0.63), 0.64 * gold);
  vec3 dusk = mix(vec3(0.29, 0.34, 0.47), vec3(0.98, 0.54, 0.26), gold);
  return mix(day, dusk, uDusk);
}
vec3 skyColor(vec3 ray) {
  vec3 zenith = mix(vec3(0.14, 0.37, 0.64), vec3(0.071, 0.16, 0.30), uDusk);
  return mix(horizon(ray), zenith, pow(max(ray.y, 0.0), 0.56));
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
  rgb += vec3(0.21, 0.12, 0.05) * pow(sun, 20.0);
  rgb += vec3(1.0, 0.81, 0.49) * smoothstep(0.99978, 0.99993, sun);
  vec2 cloud = ray.xz / (max(0.035, ray.y) + 0.13);
  vec2 drift = cloud + vec2(noise2(cloud * 0.7), noise2(-cloud * 0.91)) * 0.68;
  float layers = noise2(drift * 2.35 + vec2(13.0, 2.1)) * 0.62
               + noise2(drift * 5.0) * 0.27 + noise2(drift * 10.6) * 0.11;
  float density = smoothstep(0.49, 0.70, layers) * smoothstep(0.01, 0.23, ray.y);
  vec3 cloudLight = mix(vec3(0.95, 0.94, 0.91), vec3(0.47, 0.36, 0.37) + vec3(0.32, 0.18, 0.11) * pow(sun, 5.0), uDusk);
  rgb = mix(rgb, cloudLight, density * 0.75);
  rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
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
uniform float uDetail;
uniform float uHeadLamp;
uniform vec2 uHeadAxis;
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
  float bias = 0.00065 + (1.0 - incidence) * 0.0013;
  vec2 offset = vec2(0.55, 1.28) * uTexel;
  float threshold = p.z - bias;
  float visible = step(threshold, texture2D(uDepth, p.xy + vec2(-offset.x, -offset.y)).r)
                + step(threshold, texture2D(uDepth, p.xy + vec2( offset.y, -offset.x)).r)
                + step(threshold, texture2D(uDepth, p.xy + vec2( offset.x,  offset.y)).r)
                + step(threshold, texture2D(uDepth, p.xy + vec2(-offset.y,  offset.x)).r);
  float edge = min(min(p.x, 1.0 - p.x), min(p.y, 1.0 - p.y));
  return mix(1.0, visible * 0.25, smoothstep(0.003, 0.10, edge));
}

float surfaceGrain(vec3 n, float d) {
  if (vMaterial < 0.5 || vMaterial > 6.5) return 1.0;
  vec2 xz = vWorld.xz;
  float closeup = 1.0 - smoothstep(8.0, 32.0, d);
  if (vMaterial < 1.5) {
    float patches = noise2(xz * 0.30) - 0.5;
    float aggregate = noise2(xz * 18.0) - 0.5;
    float fine = uDetail > 0.5 && d < 18.0 ? hash(floor(xz * 51.0)) - 0.5 : 0.0;
    return 0.96 + 0.12 * patches + closeup * (0.21 * aggregate + 0.10 * fine);
  }
  if (vMaterial < 2.5) {
    vec2 p = xz * vec2(2.8, 2.5);
    p.x += mod(floor(p.y), 2.0) * 0.5;
    float joint = smoothstep(0.02, 0.09, min(fract(p.x), fract(p.y)));
    return 1.03 + (hash(floor(p)) * 0.18 - 0.09 - 0.19 * (1.0 - joint)) * closeup;
  }
  if (vMaterial < 3.5) return 0.83 + 0.25 * noise2(xz * 0.56) + closeup * 0.15 * noise2(xz * 17.0);
  vec2 wall = vec2(abs(n.x) > abs(n.z) ? vWorld.z : vWorld.x, vWorld.y);
  if (vMaterial < 4.5) return 0.94 + 0.11 * noise2(xz * 3.8) - 0.16 * closeup * (1.0 - smoothstep(0.04, 0.16, fract(xz.y * 3.15)));
  if (vMaterial < 5.5) {
    float weathering = (noise2(wall * vec2(2.7, 0.62)) - 0.5) * 0.10;
    return 0.95 + weathering + noise2(wall * 8.0) * 0.09 - 0.13 * (1.0 - smoothstep(0.2, 2.5, vWorld.y));
  }
  vec2 brick = wall * vec2(3.35, 7.5);
  brick.x += mod(floor(brick.y), 2.0) * 0.5;
  float mortar = 1.0 - smoothstep(0.05, 0.14, min(fract(brick.x), fract(brick.y)));
  return 1.0 + (hash(floor(brick)) * 0.16 - 0.08 - mortar * 0.19) * closeup;
}

vec3 reflectedLight(vec3 ray, float roughness) {
  // Approximate the skyline and lit asphalt as broad reflection sources.
  vec2 azimuth = ray.xz / max(0.27, length(ray.xz));
  float roof = 0.025 + 0.145 * noise2(azimuth * 3.6 + vec2(3.0, 1.1));
  float skyLine = smoothstep(roof - roughness * 0.36, roof + roughness * 0.32, ray.y);
  vec3 ground = mix(vec3(0.085, 0.077, 0.065), vec3(0.033, 0.045, 0.071), uDusk);
  vec3 facade = mix(vec3(0.36, 0.33, 0.28), vec3(0.12, 0.10, 0.11), uDusk);
  vec3 surroundings = mix(ground, facade, smoothstep(-0.36, -0.04, ray.y));
  return mix(surroundings, skyColor(ray), skyLine);
}

float headlight(vec3 n) {
  if (uHeadLamp < 0.01 || vWorld.y > 3.2) return 0.0;
  vec2 displacement = vWorld.xz - uContact.xz;
  float ahead = dot(displacement, uHeadAxis) - 2.40;
  if (ahead < 0.15 || ahead > 43.0) return 0.0;
  float across = abs(dot(displacement, vec2(uHeadAxis.y, -uHeadAxis.x)));
  float cone = 1.0 - smoothstep(0.27, 1.0, across / (1.0 + ahead * 0.25));
  float falloff = smoothstep(0.15, 4.4, ahead) * (1.0 - smoothstep(11.0, 41.0, ahead));
  float cutOff = 1.0 - smoothstep(0.72 + ahead * 0.016, 1.12 + ahead * 0.016, vWorld.y - uContact.y);
  return uHeadLamp * cone * falloff * cutOff * (0.35 + 0.65 * max(0.0, n.y));
}

vec3 displayColor(vec3 linear) {
  return pow(linear / (0.86 + 0.25 * linear), vec3(0.455));
}

void main() {
  if (uStyle > 3.5 && uStyle < 4.5) {
    vec2 oval = vLocal.xz / vec2(1.35, 2.85);
    float alpha = 0.47 * (1.0 - smoothstep(0.22, 1.0, length(oval)));
    gl_FragColor = vec4(0.05, 0.07, 0.09, alpha);
    return;
  }
  vec3 n = normalize(vNormal);
  vec3 delta = vEyeDelta;
  float d = length(delta);
  vec3 toEye = delta / max(d, 0.01);
  bool water = vMaterial > 7.5 && vMaterial < 8.5;
  if (water) n = normalize(n + 0.028 * vec3(sin(vWorld.z * 8.5), 0.0, sin(vWorld.x * 11.0)));
  float direct = max(0.0, dot(n, uSun));
  float sky = n.y * 0.5 + 0.5;
  float visibility = sunlight(direct);
  vec3 ambient = mix(vec3(0.31, 0.35, 0.42), vec3(0.59, 0.72, 0.92), sky)
    * mix(vec3(1.0), vec3(0.40, 0.46, 0.61), uDusk);
  vec3 sunLight = mix(vec3(1.07, 0.88, 0.67), vec3(0.74, 0.39, 0.20), uDusk);
  vec3 baseColor = max(vColor * uTint, vec3(0.0));
  vec3 base = baseColor * baseColor;
  vec3 lit = base * (ambient + visibility * direct * sunLight) * surfaceGrain(n, d);
  lit += base * headlight(n) * vec3(1.0, 0.85, 0.66);

  bool paint = uStyle > 0.5 && uStyle < 1.5;
  bool glass = (uStyle > 1.5 && uStyle < 2.5) || (vMaterial > 6.5 && vMaterial < 7.5);
  bool metal = (uStyle > 4.5 && uStyle < 5.5) || vMaterial > 8.5;
  if (paint || glass || metal || water) {
    float roughness = glass ? 0.16 : metal ? 0.27 : 0.22;
    float f0 = glass || water ? 0.045 : metal ? 0.45 : 0.038;
    float edge = pow(1.0 - clamp(dot(toEye, n), 0.0, 1.0), 5.0);
    float fresnel = f0 + (1.0 - f0) * edge * (paint ? 0.58 : 0.87);
    vec3 surroundings = reflectedLight(reflect(-toEye, n), roughness);
    vec3 glossy = surroundings * surroundings;
    float shine = max(0.0, dot(normalize(uSun + toEye), n));
    lit = lit * (1.0 - fresnel * 0.78) + glossy * fresnel;
    lit += sunLight * pow(shine, 2.0 / (roughness * roughness)) * visibility * direct * (metal ? 0.75 : 0.37);
  }
  lit += base * uEmission;
  float haze = min(d * mix(0.0042, 0.005, uDusk), 3.0);
  float fog = 1.0 - exp(-haze * haze);
  vec3 fogColor = horizon(-toEye);
  vec3 rgb = mix(displayColor(lit), fogColor, fog * 0.93);
  gl_FragColor = vec4(rgb + (hash(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
}
`;

export const presentFragment = `
precision highp float;
varying vec2 vScreen;
uniform sampler2D uImage;
uniform vec2 uPixel;

float luminance(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = vScreen * 0.5 + 0.5;
  vec3 center = texture2D(uImage, uv).rgb;
  float mid = luminance(center);
  float nw = luminance(texture2D(uImage, uv + vec2(-1.0, -1.0) * uPixel).rgb);
  float ne = luminance(texture2D(uImage, uv + vec2( 1.0, -1.0) * uPixel).rgb);
  float sw = luminance(texture2D(uImage, uv + vec2(-1.0,  1.0) * uPixel).rgb);
  float se = luminance(texture2D(uImage, uv + vec2( 1.0,  1.0) * uPixel).rgb);
  float low = min(mid, min(min(nw, ne), min(sw, se)));
  float high = max(mid, max(max(nw, ne), max(sw, se)));
  if (high - low < max(0.035, high * 0.15)) {
    gl_FragColor = vec4(center, 1.0);
    return;
  }
  vec2 direction = vec2(-(nw + ne - sw - se), nw + sw - ne - se);
  float reduction = max((nw + ne + sw + se) * 0.03125, 0.0078125);
  direction = clamp(direction / (min(abs(direction.x), abs(direction.y)) + reduction), -6.0, 6.0) * uPixel;
  vec3 narrow = 0.5 * (texture2D(uImage, uv - direction / 6.0).rgb + texture2D(uImage, uv + direction / 6.0).rgb);
  vec3 broad = 0.5 * narrow + 0.25 * (texture2D(uImage, uv - direction * 0.5).rgb + texture2D(uImage, uv + direction * 0.5).rgb);
  float broadLum = luminance(broad);
  gl_FragColor = vec4(broadLum < low || broadLum > high ? narrow : broad, 1.0);
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
