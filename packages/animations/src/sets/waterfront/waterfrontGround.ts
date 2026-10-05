import { GLSL3, ShaderMaterial, Vector2, Vector3, Vector4 } from 'three';
import { X0 } from '../../motion/trick';
import { PALETTE } from '../../camera/camera';
import { mixHex } from '../../math';
import { LEDGE_FRONT_Z, PROM_Z, SLAB, TREE_Z, WALL_Z, WATER_Z, WF } from './waterfrontLayout';
import { rgb } from '../../three/materials';

/**
 * The waterfront's ground for TrickScene3D: plazaGround in waterfront.tsx,
 * drawn per pixel on the asphalt plane instead of as paths. The plaza's
 * concrete with its uneven slabs, granite bands, cracks, stains and gum, the
 * slab joints, the promenade's pavers in running bond with a soldier course,
 * skid marks along the riding lane, manhole covers, the iron grates round
 * the palms, the ledges' contact shadows, then the props' shadows and the
 * rider's. Every random choice is setKit's hash2 on stable copy indices, so
 * each slab, crack, and stain stays put as the street scrolls, and lines keep
 * their on-screen widths. Past the sea wall the ground is see-through: the
 * bay is a far layer under the canvas.
 */

const c = (hex: string) => `vec3(${rgb(hex).map((v) => v.toFixed(5)).join(', ')})`;
const f = (n: number) => n.toFixed(2);

const SLAB_ROW0 = LEDGE_FRONT_Z + SLAB * 0.5;
const SLAB_ROWS = Math.ceil((760 - SLAB_ROW0) / SLAB);
const NEAR = 2600;

const FRAG = /* glsl */ `
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outInfo;
in vec3 vWorld;
uniform vec4 uBox;
uniform vec2 uRes;
uniform float uHorizon;
uniform float uPlazaNear;
uniform float uScroll;
uniform float uPxPerUnit;
uniform sampler2D uShadow;
uniform vec3 uShadowOpacity;

const vec3 CONCRETE = ${c(WF.concrete)};
const vec3 CONCRETE_FAR = ${c(WF.concreteFar)};
const vec3 SLAB_DARK = ${c(WF.slabDark)};
const vec3 SLAB_LIGHT = ${c(WF.slabLight)};
const vec3 JOINT = ${c(WF.joint)};
const vec3 CRACK = ${c(WF.crack)};
const vec3 PAVER = ${c(WF.paver)};
const vec3 PAVER_DARK = ${c(WF.paverDark)};
const vec3 PAVER_JOINT = ${c(WF.paverJoint)};
const vec3 BAND = ${c(WF.band)};
const vec3 STAIN = ${c(WF.stain)};
const vec3 SKID = ${c(WF.skid)};
const vec3 GRATE = ${c(WF.grate)};
const vec3 GRATE_EDGE = ${c(mixHex(WF.grate, PALETTE.ink, 0.3))};
const vec3 SHADOW = ${c(PALETTE.shadow)};

float hash2(int i, int j, int salt) {
  uint h = (uint(i) * 0x27d4eb2du) ^ (uint(j) * 0x165667b1u) ^ (uint(salt) * 0x9e3779b1u);
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return float(h ^ (h >> 16u)) / 4294967296.0;
}

// Screen pixels per world unit along a direction on the ground.
mat2 toScreen;
float pxAlong(vec2 dir) { return length(toScreen * dir); }
/** Coverage of a shape from its signed world distance (negative inside) and outward direction. */
float fill(float sd, vec2 dir) { return clamp(0.5 - sd * pxAlong(dir), 0.0, 1.0); }
/** Coverage of a line from its world distance, its stroke width given in viewBox units. */
float stroke(float d, vec2 dir, float width) { return clamp(0.5 * width * uPxPerUnit - abs(d) * pxAlong(dir) + 0.5, 0.0, 1.0); }
/** Distance to the nearest of a repeating set of lines at coord = phase + k * period. */
float repeatDist(float coord, float phase, float period) {
  return coord - phase - period * floor((coord - phase) / period + 0.5);
}
/** Signed distance to an axis-aligned rectangle, with the direction it's nearest along. */
float rectDist(vec2 p, vec2 lo, vec2 hi, out vec2 dir) {
  vec2 c = 0.5 * (lo + hi);
  vec2 h = 0.5 * (hi - lo);
  vec2 q = abs(p - c) - h;
  dir = q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  return max(q.x, q.y);
}
float rectFill(vec2 p, vec2 lo, vec2 hi) {
  vec2 dir;
  float d = rectDist(p, lo, hi, dir);
  return fill(d, dir);
}
float segDist(vec2 p, vec2 a, vec2 b, out vec2 dir) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  vec2 q = pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(q);
  dir = d > 1e-4 ? q / d : vec2(0.0, 1.0);
  return d;
}

void main() {
  float z = vWorld.z;
  if (z < ${f(WATER_Z)}) discard;
  // The street's own coordinate: the plaza is laid out in it and slides by the scroll.
  float x = vWorld.x + ${f(X0)};
  float u = x + uScroll;
  vec2 g = vec2(u, z);
  vec2 du = vec2(dFdx(u), dFdy(u));
  vec2 dz = vec2(dFdx(z), dFdy(z));
  // Screen pixels per world unit: invert the screen-to-ground Jacobian.
  float det = du.x * dz.y - du.y * dz.x;
  toScreen = abs(det) > 1e-12 ? mat2(dz.y, -dz.x, -du.y, du.x) / det : mat2(0.0);

  vec2 frag = gl_FragCoord.xy;
  vec2 vb = vec2(uBox.x + frag.x / uRes.x * uBox.z, uBox.y + (1.0 - frag.y / uRes.y) * uBox.w);
  vec3 color = mix(CONCRETE_FAR, CONCRETE, clamp((vb.y - uHorizon) / (uPlazaNear - uHorizon), 0.0, 1.0));
  if (z < ${f(PROM_Z)}) color = PAVER;

  // Slab tones: a few slabs a shade darker or lighter, and now and then a crack.
  float crack = 0.0;
  float row = floor((z - ${f(SLAB_ROW0)}) / ${f(SLAB)});
  if (row >= 0.0 && row < ${f(SLAB_ROWS - 1)}) {
    int r = int(row);
    float z0 = ${f(SLAB_ROW0)} + row * ${f(SLAB)};
    int i = int(floor(u / ${f(SLAB)}));
    float cellX = float(i) * ${f(SLAB)};
    float at = cellX - uScroll;
    if (at >= ${f(X0 - 1500)} && at < ${f(X0 + 1500)}) {
      float h = hash2(i, r, 1);
      if (h <= 0.3 || h >= 0.82) {
        float tone = rectFill(g, vec2(cellX + 1.0, z0 + 1.0), vec2(cellX + ${f(SLAB - 1)}, z0 + ${f(SLAB - 1)}));
        color = mix(color, h <= 0.3 ? SLAB_DARK : SLAB_LIGHT, tone);
        if (hash2(i, r, 2) > 0.9) {
          float zz = z0 + 8.0 + 30.0 * hash2(i, r, 5);
          float best = 1e3;
          vec2 bestDir = vec2(0.0, 1.0);
          vec2 prev = vec2(cellX + 6.0, zz - 3.0 * hash2(i, r, 6));
          for (int k = 1; k <= 4; k++) {
            vec2 next = vec2(cellX + 6.0 + 13.0 * float(k), zz + (k % 2 == 1 ? 5.0 : -3.0) * hash2(i, r, 6 + k));
            vec2 dir;
            float d = segDist(g, prev, next, dir);
            if (d < best) {
              best = d;
              bestDir = dir;
            }
            prev = next;
          }
          crack = 0.75 * stroke(best, bestDir, 0.8);
        }
      }
    }
  }
  // Granite bands across the plaza every six slabs, then the cracks over them.
  {
    float bandX = repeatDist(u, ${f(SLAB * 2)}, ${f(SLAB * 6)});
    float bandAt = u - bandX - uScroll;
    if (z >= ${f(PROM_Z)} && z < ${f(NEAR)} && bandAt >= ${f(X0 - 2000)} && bandAt < ${f(X0 + 2000)}) {
      color = mix(color, BAND, fill(abs(bandX) - 7.0, vec2(1.0, 0.0)));
    }
  }
  color = mix(color, CRACK, crack);
  // Old stains and gum spots.
  {
    float stain = 0.0;
    float gum = 0.0;
    int base = int(floor((u - 60.0) / 340.0));
    for (int di = -1; di <= 1; di++) {
      int i = base + di;
      float copyX = 60.0 + float(i) * 340.0;
      if (copyX - uScroll < ${f(X0 - 1400)} || copyX - uScroll >= ${f(X0 + 1400)}) continue;
      for (int k = 0; k < 2; k++) {
        float cx = copyX + 300.0 * hash2(i, k, 50);
        float cz = -260.0 + 560.0 * hash2(i, k, 51);
        float r = 8.0 + 16.0 * hash2(i, k, 52);
        // The blob: nine points round the center at uneven radii, stretched along the street.
        vec2 d = g - vec2(cx, cz);
        if (dot(d, d) < 50.0 * 50.0) {
          float inside = 1e3;
          vec2 dirOut = vec2(0.0, 1.0);
          bool odd = false;
          for (int j = 0; j < 9; j++) {
            float a0 = float(j) / 9.0 * 6.2831853;
            float a1 = float(j + 1) / 9.0 * 6.2831853;
            float r0 = r * (0.6 + 0.5 * hash2(i * 9 + j, k, 53));
            float r1 = r * (0.6 + 0.5 * hash2(i * 9 + (j + 1) % 9, k, 53));
            vec2 p0 = vec2(cos(a0) * r0 * 1.4, sin(a0) * r0);
            vec2 p1 = vec2(cos(a1) * r1 * 1.4, sin(a1) * r1);
            vec2 dir;
            float e = segDist(d, p0, p1, dir);
            if (e < inside) {
              inside = e;
              dirOut = dir;
            }
            if ((p0.y > d.y) != (p1.y > d.y) && d.x < p0.x + (d.y - p0.y) * (p1.x - p0.x) / (p1.y - p0.y)) odd = !odd;
          }
          stain = max(stain, fill(odd ? -inside : inside, dirOut));
        }
        for (int j = 0; j < 4; j++) {
          vec2 at = vec2(cx + 90.0 * (hash2(i, j, 54) - 0.5), cz + 70.0 * (hash2(i, j, 55) - 0.5));
          gum = max(gum, rectFill(g, at, at + vec2(2.2, 2.0)));
        }
      }
    }
    color = mix(color, STAIN, 0.1 * stain);
    color = mix(color, STAIN, 0.35 * gum);
  }
  // Slab joints: rows across the plaza, and lines along it that slide with the street.
  {
    float joints = 0.0;
    float rowZ = repeatDist(z, ${f(SLAB_ROW0)}, ${f(SLAB)});
    float rowIndex = floor((z - ${f(SLAB_ROW0)}) / ${f(SLAB)} + 0.5);
    if (rowIndex >= 0.0 && rowIndex < ${f(SLAB_ROWS)}) joints = max(joints, stroke(rowZ, vec2(0.0, 1.0), 1.3));
    if (z > ${f(PROM_Z)} - 1.0 && z < ${f(NEAR)}) joints = max(joints, stroke(repeatDist(u, 0.0, ${f(SLAB)}), vec2(1.0, 0.0), 1.3));
    color = mix(color, JOINT, 0.8 * joints);
  }
  // The promenade's running bond, the wall's edge, then the soldier course along the plaza.
  if (z < ${f(PROM_Z)} + 1.0) {
    float bond = 0.0;
    float rowZ = repeatDist(z, ${f(PROM_Z)}, 30.0);
    float rowIndex = floor((${f(PROM_Z)} - z) / 30.0 + 0.5);
    if (rowIndex >= 0.0 && ${f(PROM_Z)} - rowIndex * 30.0 > ${f(WALL_Z + 1)}) bond = max(bond, stroke(rowZ, vec2(0.0, 1.0), 1.0));
    float r = floor((${f(PROM_Z)} - z) / 30.0);
    if (r >= 0.0 && ${f(PROM_Z)} - (r + 1.0) * 30.0 > ${f(WALL_Z + 1)}) {
      float phase = mod(r, 2.0) > 0.5 ? 32.0 : 0.0;
      float dx = repeatDist(u, phase, 64.0);
      float at = u - dx - uScroll;
      if (at >= ${f(X0 - 1600)} && at < ${f(X0 + 1600)}) bond = max(bond, stroke(dx, vec2(1.0, 0.0), 1.0));
    }
    bond = max(bond, stroke(z - ${f(WALL_Z)}, vec2(0.0, 1.0), 1.0));
    color = mix(color, PAVER_JOINT, 0.7 * bond);
    color = mix(color, PAVER_DARK, rectFill(g, vec2(-1e6, ${f(PROM_Z - 10)}), vec2(1e6, ${f(PROM_Z)})));
  }
  // Skid marks and wax along the riding lane.
  {
    float skid = 0.0;
    int i = int(floor((u - 140.0) / 520.0));
    float copyX = 140.0 + float(i) * 520.0;
    if (copyX - uScroll >= ${f(X0 - 1400)} && copyX - uScroll < ${f(X0 + 1400)}) {
      for (int k = 0; k < 3; k++) {
        float len = 30.0 + 70.0 * hash2(i, k, 7);
        float sz = -46.0 + 92.0 * hash2(i, k, 8);
        float sx = copyX + 160.0 * hash2(i, k, 9);
        skid = max(skid, rectFill(g, vec2(sx, sz), vec2(sx + len, sz + 1.6 + 1.6 * hash2(i, k, 10))));
      }
    }
    color = mix(color, SKID, 0.13 * skid);
  }
  // A manhole cover in the foreground now and then.
  {
    int i = int(floor((u - 620.0) / 1700.0 + 0.5));
    float cx = 620.0 + float(i) * 1700.0;
    if (cx - uScroll >= ${f(X0 - 1200)} && cx - uScroll < ${f(X0 + 1200)}) {
      vec2 d = g - vec2(cx, 150.0);
      float r = length(d);
      vec2 radial = r > 1e-3 ? d / r : vec2(1.0, 0.0);
      color = mix(color, GRATE, 0.55 * fill(r - 21.0, radial));
      color = mix(color, CONCRETE, 0.5 * stroke(r - 17.0, radial, 1.0));
      float grid = 0.0;
      for (int k = -2; k <= 2; k++) {
        float off = float(k) * 6.5;
        float half_ = sqrt(max(0.0, 225.0 - off * off));
        vec2 dir;
        float e = segDist(g, vec2(cx - half_, 150.0 + off), vec2(cx + half_, 150.0 + off), dir);
        grid = max(grid, stroke(e, dir, 0.9));
      }
      color = mix(color, CONCRETE, 0.45 * grid);
    }
  }
  // Iron grates round the palms' roots.
  if (abs(z - ${f(TREE_Z)}) < 20.0) {
    for (int p = 0; p < 2; p++) {
      float offset = p == 0 ? 120.0 : 520.0;
      float cx = offset + 800.0 * floor((u - offset) / 800.0 + 0.5);
      vec2 dir;
      float d = rectDist(g, vec2(cx - 18.0, ${f(TREE_Z - 18)}), vec2(cx + 18.0, ${f(TREE_Z + 18)}), dir);
      color = mix(color, GRATE, fill(d, dir));
      color = mix(color, GRATE_EDGE, stroke(d, dir, 0.8));
    }
  }
  // The ledges' contact shadows, a strip along each one's foot.
  if (z > ${f(LEDGE_FRONT_Z)} - 1.0 && z < ${f(LEDGE_FRONT_Z + 6)}) {
    float contact = 0.0;
    for (int l = 0; l < 3; l++) {
      float offset = l == 0 ? 0.0 : l == 1 ? 290.0 : 500.0;
      float len = l == 0 ? 190.0 : l == 1 ? 120.0 : 210.0;
      float lx = offset + 800.0 * floor((u - offset) / 800.0);
      contact = max(contact, rectFill(g, vec2(lx - 2.0, ${f(LEDGE_FRONT_Z)}), vec2(lx + len + 2.0, ${f(LEDGE_FRONT_Z + 5)})));
    }
    color = mix(color, SHADOW, 0.14 * contact);
  }

  // Shadows: the props' (crisp), then the rider's (softened).
  vec4 s = texture(uShadow, frag / uRes);
  color = mix(color, SHADOW, 0.26 * s.a);
  float a = 1.0 - (1.0 - uShadowOpacity.x * s.r) * (1.0 - uShadowOpacity.y * s.g) * (1.0 - uShadowOpacity.z * s.b);
  outColor = vec4(mix(color, SHADOW, a), 1.0);
  outInfo = vec4(0.0);
}
`;

const VERT = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export function waterfrontGroundMaterial() {
  return new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uBox: { value: new Vector4() },
      uRes: { value: new Vector2() },
      uHorizon: { value: 0 },
      uPlazaNear: { value: 0 },
      uScroll: { value: 0 },
      uPxPerUnit: { value: 1 },
      uShadow: { value: null },
      uShadowOpacity: { value: new Vector3() },
    },
  });
}
