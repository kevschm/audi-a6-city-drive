import { dentLimit } from '../simulation/vehicle-damage.js';

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

const deformation = `
uniform vec4 uDamage;
uniform vec4 uDents[${dentLimit}];
uniform float uRim;
vec3 dent(vec3 p, out float distress, out vec2 normalShift) {
  distress = 0.0;
  normalShift = vec2(0.0);
  if (uRim > 0.001) {
    float angle = atan(p.y, p.z + 0.00001);
    float flatSpot = max(0.0, cos(angle - 1.2));
    flatSpot *= flatSpot * flatSpot;
    p.yz *= 1.0 - uRim * (0.16 + 0.25 * flatSpot);
    p.x += uRim * p.y * 0.23;
    distress = uRim * flatSpot * 0.75;
  }
  if (dot(uDamage, vec4(1.0)) < 0.0001) return p;
  vec3 moved = p;
  float height = 1.0 - smoothstep(0.84, 1.34, p.y);
  for (int i = 0; i < ${dentLimit}; i++) {
    vec4 hit = uDents[i];
    bool bumper = hit.w < 1.5;
    vec2 inward = bumper ? vec2(0.0, hit.w < 0.5 ? -1.0 : 1.0)
                         : vec2(hit.w < 2.5 ? 1.0 : -1.0, 0.0);
    vec2 delta = p.xz - hit.xy;
    vec2 scaled = delta / (bumper ? vec2(0.63, 1.25) : vec2(0.67, 0.91));
    float envelope = max(0.0, 1.0 - dot(scaled, scaled));
    float force = hit.z * height * envelope;
    distress += force;
    float crease = 0.81 + 0.19 * sin(19.0 * dot(delta, inward.yx) + p.y * 11.0);
    moved.xz += inward * force * envelope * crease * (bumper ? 0.55 : 0.39);
    moved.y -= force * envelope * 0.11 * sin(p.y * 8.0 + 1.5);
    if (bumper) {
      float fold = max(0.0, hit.z - 0.28) * max(0.0, 1.0 - dot(scaled * vec2(1.0, 0.73), scaled * vec2(1.0, 0.73)));
      float deck = smoothstep(0.72, 0.96, p.y) * (1.0 - smoothstep(1.03, 1.15, p.y));
      moved.y += fold * deck * (0.10 + 0.14 * sin(abs(delta.y) * 6.4));
      normalShift.y += inward.y * fold * deck * 0.66;
    }
    normalShift -= scaled * force * envelope * 0.87;
  }
  distress = min(1.0, distress);
  return p + clamp(moved - p, vec3(-0.50, -0.15, -0.58), vec3(0.50, 0.15, 0.58));
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
uniform float uStride;
varying vec3 vEyeDelta;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vShadow;
varying float vMaterial;
varying float vDistress;
${deformation}
void main() {
  vec2 normalShift;
  vec3 local = dent(aPos, vDistress, normalShift);
  if (uStride != 0.0 && local.y < 0.85) {
    float stride = uStride * sign(local.x) * (1.0 - local.y / 0.85);
    local.z += 0.22 * stride;
    local.y += max(0.0, stride) * 0.071;
  }
  vec4 world = uModel * vec4(local, 1.0);
  vWorld = world.xyz;
  vEyeDelta = uEye - world.xyz;
  vLocal = aPos;
  vNormal = mat3(uModel) * normalize(aNormal + vec3(normalShift.x, 0.0, normalShift.y));
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
uniform vec4 uPane;
uniform float uShadows;
uniform float uTexel;
uniform float uDetail;
uniform float uHeadLamp;
uniform vec2 uHeadAxis;
uniform vec3 uStreet[4];
uniform sampler2D uDepth;
uniform float uWet;
uniform float uMirrorPass;
uniform float uMirrorOn;
uniform mat4 uMirrorVP;
uniform sampler2D uMirror;
varying vec3 vEyeDelta;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vWorld;
varying vec3 vLocal;
varying vec4 vShadow;
varying float vMaterial;
varying float vDistress;
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

float wetPatches(vec2 position) {
  float pools = noise2(position * 0.14) * 0.66 + noise2(position * 0.31) * 0.34;
  return smoothstep(0.38, 0.73, pools);
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
  if (ahead < 0.18 || ahead > 48.0) return 0.0;
  float across = dot(displacement, vec2(uHeadAxis.y, -uHeadAxis.x));
  float spread = 0.82 + ahead * 0.23;
  float left = 1.0 - smoothstep(0.23, 1.0, abs(across + 0.57) / spread);
  float right = 1.0 - smoothstep(0.23, 1.0, abs(across - 0.57) / spread);
  float height = vWorld.y - uContact.y;
  float cutoff = (1.0 - smoothstep(0.70, 0.97, height - max(0.0, across) * 0.027));
  float incidence = max(0.0, dot(n, normalize(vec3(-uHeadAxis.x * ahead, 0.84 - height, -uHeadAxis.y * ahead))));
  float falloff = 142.0 / (ahead * ahead + across * across + 36.0);
  return uHeadLamp * 0.5 * (left + right) * falloff * cutoff *
         (0.13 + incidence) * smoothstep(0.28, 3.8, ahead) * (1.0 - smoothstep(32.0, 48.0, ahead));
}

float streetLight(vec3 normal) {
  if (uDusk < 0.04 || vWorld.y > 8.0) return 0.0;
  float intensity = 0.0;
  for (int i = 0; i < 4; i++) {
    if (uStreet[i].y < 0.0) continue;
    vec3 delta = uStreet[i] - vWorld;
    float radius = dot(delta.xz, delta.xz);
    if (radius > 200.0 || delta.y < -0.3) continue;
    float shine = max(0.0, dot(normal, normalize(delta)));
    intensity += (1.0 - smoothstep(45.0, 200.0, radius)) * shine * 11.0 / (dot(delta, delta) + 8.0);
  }
  return intensity * uDusk * uDusk;
}

vec3 displayColor(vec3 linear) {
  return pow(linear / (0.86 + 0.25 * linear), vec3(0.455));
}

float crackPattern(vec2 uv, float severity) {
  float radius = length(uv);
  float a = atan(uv.y, uv.x + 0.00001);
  float branch = abs(sin(a * 7.0 + sin(a * 3.0) + radius * 5.5));
  float spokes = 1.0 - smoothstep(0.075, 0.23, branch);
  float rings = 1.0 - smoothstep(0.015, 0.095, abs(fract(radius * 5.8 + sin(a * 6.0) * 0.18) - 0.5));
  return max(spokes, rings * 0.67) * (1.0 - smoothstep(severity * 0.26, 0.28 + severity, radius));
}

void main() {
  if (uMirrorPass > 0.5 && vWorld.y < 0.045) discard;
  if (uStyle > 3.5 && uStyle < 4.5) {
    vec2 oval = vLocal.xz / vec2(1.35, 2.85);
    float alpha = 0.47 * (1.0 - smoothstep(0.22, 1.0, length(oval)));
    gl_FragColor = vec4(0.05, 0.07, 0.09, alpha);
    return;
  }
  if (uStyle > 6.5) {
    vec2 uv = vec2((vLocal.x - uPane.y) * 1.75, (vLocal.y - 1.10) * 4.0);
    float cracks = crackPattern(uv, uPane.x);
    gl_FragColor = vec4(vec3(0.78, 0.86, 0.88), cracks * min(0.82, uPane.x * 1.38));
    return;
  }
  vec3 n = normalize(vNormal);
  vec3 delta = vEyeDelta;
  float d = length(delta);
  vec3 toEye = delta / max(d, 0.01);
  bool water = vMaterial > 7.5 && vMaterial < 8.5;
  if (water) n = normalize(n + 0.028 * vec3(sin(vWorld.z * 8.5), 0.0, sin(vWorld.x * 11.0)));
  float direct = max(0.0, dot(n, uSun));
  bool lens = uStyle > 5.5;
  float sky = n.y * 0.5 + 0.5;
  float visibility = sunlight(direct);
  vec3 ambient = mix(vec3(0.31, 0.35, 0.42), vec3(0.59, 0.72, 0.92), sky)
    * mix(vec3(1.0), vec3(0.40, 0.46, 0.61), uDusk);
  vec3 sunLight = mix(vec3(1.07, 0.88, 0.67), vec3(0.74, 0.39, 0.20), uDusk);
  vec3 baseColor = max(vColor * uTint, vec3(0.0));
  if (uStyle > 1.5 && uStyle < 2.5 && dot(uPane, vec4(1.0)) > 0.01) {
    float side = smoothstep(0.55, 0.82, abs(vLocal.x));
    float severity = mix(vLocal.z > 0.15 ? uPane.x : uPane.y, vLocal.x < 0.0 ? uPane.z : uPane.w, side);
    vec2 uv = vec2(mix(vLocal.x + 0.16, fract(vLocal.z * 0.8) - 0.5, side) * 2.2, (vLocal.y - 1.16) * 4.0);
    float cracks = crackPattern(uv, severity) * smoothstep(0.07, 0.32, severity);
    if (severity > 0.73 && side > 0.85 && cracks < 0.31) discard;
    baseColor = mix(baseColor, vec3(0.66, 0.74, 0.76), cracks * 0.85);
  }
  if (vDistress > 0.03) {
    float scoring = noise2(vLocal.xz * vec2(33.0, 20.0) + vLocal.y * 32.0);
    float abrasion = smoothstep(0.57, 0.82, scoring) * vDistress;
    vec3 exposed = mix(vec3(0.19, 0.185, 0.17), vec3(0.55, 0.53, 0.49), smoothstep(0.10, 0.57, vDistress));
    baseColor = mix(baseColor, exposed, abrasion * 0.72);
    if (lens && vDistress > 0.25) {
      vec2 pane = vec2(vLocal.x * 41.0 + vLocal.z * 24.0, vLocal.y * 68.0);
      float shift = noise2(pane * 0.45);
      float web = min(abs(fract(pane.x + pane.y * 0.76 + shift * 0.8) - 0.5),
        abs(fract(pane.y * 0.6 - pane.x * 0.42 + shift * 0.64) - 0.5));
      float broken = (1.0 - smoothstep(0.06, 0.19, web)) * smoothstep(0.25, 0.68, vDistress);
      baseColor = mix(baseColor * (1.0 - 0.52 * vDistress), vec3(0.52, 0.60, 0.64), broken * 0.78);
    }
  }
  vec3 base = baseColor * baseColor;
  vec3 lit = base * (ambient + visibility * direct * sunLight) * surfaceGrain(n, d);
  if (vMaterial > 9.5 && vMaterial < 10.5) {
    float density = noise2((vWorld.xz + vWorld.y * vec2(0.43, 0.59)) * 12.0);
    lit *= 0.86 + 0.29 * density;
    lit += base * pow(max(0.0, dot(-n, uSun)), 2.0) * vec3(0.24, 0.35, 0.13);
  }
  if (vMaterial > 10.5) {
    vec2 surface = vec2(vLocal.x + vLocal.z * 0.37, vLocal.y + vLocal.z * 0.63);
    if (vMaterial < 11.5) {
      lit *= mix(1.0, 0.92 + 0.16 * noise2(surface * 430.0), 1.0 - smoothstep(0.4, 1.5, d));
    } else {
      float curl = noise2(surface * 13.0);
      float grain = sin(surface.y * 245.0 + surface.x * 28.0 + curl * 9.0) * 0.5 + 0.5;
      lit *= 0.68 + grain * 0.32 + 0.27 * curl;
    }
  }
  lit += base * headlight(n) * vec3(1.0, 0.85, 0.66);
  lit += base * streetLight(n) * vec3(1.0, 0.72, 0.39);

  bool paint = uStyle > 0.5 && uStyle < 1.5;
  bool glass = (uStyle > 1.5 && uStyle < 2.5) || (vMaterial > 6.5 && vMaterial < 7.5);
  bool metal = (uStyle > 4.5 && uStyle < 5.5) || (vMaterial > 8.5 && vMaterial < 9.5);
  if (paint || glass || metal || water || lens) {
    float roughness = glass || lens ? 0.16 : metal ? 0.27 : 0.17;
    float f0 = glass || water ? 0.045 : metal ? 0.45 : 0.038;
    float edge = pow(1.0 - clamp(dot(toEye, n), 0.0, 1.0), 5.0);
    float fresnel = f0 + (1.0 - f0) * edge * (paint ? 0.58 : 0.87);
    vec3 reflectedDir = reflect(-toEye, n);
    vec3 surroundings = reflectedLight(reflectedDir, roughness);
    if (paint || glass) {
      float cloud = noise2(reflectedDir.xz * (2.6 / (0.28 + abs(reflectedDir.y))) + vec2(0.7, 2.4));
      surroundings += vec3(0.30, 0.34, 0.40) * smoothstep(0.52, 0.78, cloud) * smoothstep(0.03, 0.5, reflectedDir.y);
    }
    vec3 glossy = surroundings * surroundings;
    float shine = max(0.0, dot(normalize(uSun + toEye), n));
    lit = lit * (1.0 - fresnel * 0.78) + glossy * fresnel;
    lit += sunLight * pow(shine, 2.0 / (roughness * roughness)) * visibility * direct * (metal ? 0.75 : 0.37);
  }
  lit += base * uEmission * (lens ? 1.0 - 0.65 * vDistress : 1.0);
  float haze = min(d * mix(0.0042, 0.005, uDusk), 3.0);
  float fog = 1.0 - exp(-haze * haze);
  vec3 fogColor = horizon(-toEye);
  vec3 rgb = mix(displayColor(lit), fogColor, fog * 0.93);
  if (uWet > 0.007 && uMirrorPass < 0.5 && vMaterial > 0.5 && vMaterial < 2.5 && n.y > 0.65) {
    float pools = wetPatches(vWorld.xz);
    float moisture = uWet * (0.34 + 0.66 * pools) * (1.0 - smoothstep(105.0, 160.0, d));
    float fresnel = pow(1.0 - max(0.0, dot(n, toEye)), 3.5);
    vec3 ray = reflect(-toEye, n);
    vec3 reflected = skyColor(ray);
    float strength = moisture * (0.08 + fresnel * 0.48);
    if (uMirrorOn > 0.5 && vWorld.y < 0.055) {
      vec4 projected = uMirrorVP * vec4(vWorld.x, 0.01, vWorld.z, 1.0);
      vec2 uv = projected.xy / max(0.1, projected.w) * 0.5 + 0.5;
      float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
      float weight = smoothstep(0.015, 0.10, edge) * smoothstep(0.1, 1.0, projected.w);
      if (weight > 0.0) {
        float rough = (1.0 - pools) * 0.0028;
        vec2 rippled = uv + vec2(sin(vWorld.z * 11.7), cos(vWorld.x * 13.3)) * rough;
        reflected = mix(reflected, texture2D(uMirror, rippled).rgb, weight);
        strength += moisture * weight * fresnel * 0.30;
      }
    }
    rgb = mix(rgb * (1.0 - moisture * 0.28), reflected, clamp(strength, 0.0, 0.74));
  }
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
${deformation}
void main() {
  float distress;
  vec2 normalShift;
  gl_Position = uLight * uModel * vec4(dent(aPos, distress, normalShift), 1.0);
}
`;

export const particleVertex = `
attribute vec3 aPos;
attribute vec3 aColor;
uniform mat4 uVP;
uniform float uViewport;
varying vec2 vAppearance;
void main() {
  gl_Position = uVP * vec4(aPos, 1.0);
  gl_PointSize = clamp(aColor.x * uViewport / max(1.0, gl_Position.w), 1.0, 48.0);
  vAppearance = aColor.yz;
}
`;

export const particleFragment = `
precision highp float;
varying vec2 vAppearance;
void main() {
  float radial = length(gl_PointCoord * 2.0 - 1.0);
  float edge = 1.0 - smoothstep(0.13, 1.0, radial);
  float spark = step(0.92, vAppearance.y);
  float shard = step(0.78, vAppearance.y) * (1.0 - spark);
  float vapor = step(0.19, vAppearance.y);
  vec3 rgb = mix(vec3(0.61, 0.56, 0.49), vec3(0.78, 0.82, 0.86), vapor);
  rgb = mix(rgb, vec3(1.0, 0.69, 0.28), spark);
  float opacity = mix(0.24, 0.18, vapor);
  rgb = mix(rgb, vec3(0.67, 0.85, 0.88), shard);
  gl_FragColor = vec4(rgb, edge * vAppearance.x * mix(opacity, 1.0, max(spark, shard * 0.8)));
}
`;

export const depthFragment = `
precision mediump float;
void main() {
  gl_FragColor = vec4(0.0);
}
`;
