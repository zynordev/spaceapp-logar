// Procedural planet and star shaders. No textures: every surface is 3D
// simplex noise evaluated on the unit sphere, so the view works offline.
// Simplex noise: Ashima Arts / Stefan Gustavson (MIT licence).

const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int k = 0; k < 5; k++) {
    s += a * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
`;

export const PLANET_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vViewW;
void main() {
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewW = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

/** uKind: 0 Earth, 1 Moon, 2 Mars. Colours are display values (no tone mapping). */
export const PLANET_FRAG = /* glsl */ `
uniform float uKind;
uniform vec3 uSun;
uniform float uTime;
uniform float uSeed;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vViewW;
${NOISE}
void main() {
  vec3 p = normalize(vObj);
  vec3 n = normalize(vNormalW);
  vec3 v = normalize(vViewW);
  float ndl = dot(n, uSun);
  float lit = smoothstep(-0.08, 0.35, ndl) * (0.25 + 0.75 * max(ndl, 0.0));
  vec3 col;
  float spec = 0.0;
  vec3 atm = vec3(0.0);

  if (uKind < 0.5) {
    float h = fbm(p * 1.05 + uSeed);
    float land = smoothstep(0.07, 0.12, h);
    vec3 ocean = mix(vec3(0.015, 0.075, 0.13), vec3(0.03, 0.16, 0.24), smoothstep(-0.45, 0.06, h));
    float dry = smoothstep(0.0, 0.5, fbm(p * 3.7 + 4.0));
    vec3 ground = mix(vec3(0.16, 0.25, 0.14), vec3(0.40, 0.35, 0.23), dry);
    col = mix(ocean, ground, land);
    float lat = abs(p.y) + h * 0.12;
    col = mix(col, vec3(0.80, 0.85, 0.87), smoothstep(0.86, 0.93, lat));
    vec3 hv = normalize(uSun + v);
    spec = (1.0 - land) * pow(max(dot(n, hv), 0.0), 48.0) * 0.28;
    vec3 q = p * 2.4 + vec3(uTime * 0.012, 0.0, uTime * 0.004);
    float c = fbm(q + 0.6 * fbm(q * 1.4 + 2.0));
    float cloud = smoothstep(0.1, 0.5, c) * 0.82;
    col = mix(col, vec3(0.90, 0.93, 0.94), cloud);
    spec *= 1.0 - cloud;
    atm = vec3(0.42, 0.68, 0.92) * 0.5;
  } else if (uKind < 1.5) {
    float b = fbm(p * 2.6 + uSeed);
    col = vec3(0.47, 0.47, 0.45) + b * 0.10;
    float maria = smoothstep(0.08, 0.28, fbm(p * 1.2 + 7.0));
    col = mix(col, vec3(0.25, 0.25, 0.25), maria * 0.8);
    float cr = 1.0 - abs(snoise(p * 11.0 + uSeed));
    col += pow(cr, 8.0) * 0.08;
  } else {
    float b = fbm(p * 2.1 + uSeed);
    col = mix(vec3(0.50, 0.23, 0.12), vec3(0.72, 0.40, 0.22), smoothstep(-0.4, 0.4, b));
    float dark = smoothstep(0.12, 0.34, fbm(p * 1.3 + 11.0));
    col = mix(col, vec3(0.30, 0.15, 0.09), dark * 0.75);
    col = mix(col, vec3(0.86, 0.84, 0.80), smoothstep(0.90, 0.95, p.y + b * 0.04));
    atm = vec3(0.80, 0.52, 0.38) * 0.16;
  }

  vec3 outc = col * (0.03 + lit) + spec * lit;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  outc += atm * fres * smoothstep(-0.2, 0.45, ndl);
  gl_FragColor = vec4(outc, 1.0);
}
`;

export const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPx;
varying vec3 vC;
void main() {
  vC = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPx;
}
`;

export const STAR_FRAG = /* glsl */ `
varying vec3 vC;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, r);
  gl_FragColor = vec4(vC * a, a);
}
`;
