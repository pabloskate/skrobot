import { BufferAttribute, Group, Mesh, type BufferGeometry, type ShaderMaterial } from 'three';
import { cross3, dot3, mixHex, norm3, scale3, smoothstep, sub3, add3, type V3 } from '../../math';
import type { Expression } from '../look';
import { SHOE_HALF_HEIGHT, shiftFrame, softFloor, type Frame3, type Rig } from '../../motion/skeleton';
import { Capsule } from '../../three/geometry';
import {
  HUMAN_HEAD,
  HUMAN_SCALE,
  HUMAN_SHIN,
  HUMAN_THIGH,
  SEAT,
  SKULL_AT,
  shinRadius,
  thighRadius,
  SLEEVE,
  TEE,
  beanieGeometry,
  curlGeometry,
  earGeometry,
  forearmGeometry,
  hairGeometry,
  handGeometries,
  noseGeometry,
  seatGeometry,
  shinGeometry,
  skullAt,
  skullGeometry,
  sleeveGeometry,
  teeChestWeight,
  teeGeometry,
  thighGeometry,
  upperArmGeometry,
} from './humanGeometry';
import { beanieMaterial, humanFaceMaterial, pantsMaterial, seatMaterial, sleeveMaterial, sneakerMaterial, teeMaterial } from './humanMaterials';
import { FEATURES, inkInfo, INK_ROBOT, toonMaterial } from '../../three/materials';
import { shoeGeometries, upperTop } from '../shoe3d';
import { dirToThree, toThree, type StageView, type Vec3 } from '../../camera/view';
import { crossThree, hipsFrame, placeFrame, setMatrix } from '../placement';

/**
 * A human skater, as an alternative rider to the robot: a teen in a cuffed
 * beanie with curls coming out of it, an oversized tee with Skate Robot's
 * bot on the chest, cargo pants cut to break over the shoes, and the
 * robot's sculpted skate shoes in black suede with a side stripe.
 *
 * Posed from the same rig as the robot, so every trick, grind, and fall is
 * the same motion (humanRig.ts grows it to a grown-up's size over the same
 * feet), and drawn the way humanGeometry.ts sizes it. Drawn
 * the same way too: two cel tones a color, ink outlines from the screen
 * pass, matte, and the body parts sorted for the outlines by the robot's
 * paint order.
 */

export interface HumanLook {
  skin: string;
  hair: string;
  eyes: string;
  lips: string;
  beanie: string;
  tee: string;
  print: string;
  pants: string;
  shoe: string;
  stripe: string;
  sole: string;
}

export const SKATER_LOOK: Readonly<HumanLook> = Object.freeze({
  skin: '#c98e62',
  hair: '#2e1d17',
  eyes: '#5b3a24',
  lips: '#8e4b3b',
  beanie: '#eaa53c',
  tee: '#ef6c4c',
  print: '#fbf1df',
  pants: '#3d4b70',
  shoe: '#2c2a3a',
  stripe: '#f8f1e4',
  sole: '#f8f1e4',
});

/** Outline widths (world units): a hair finer than the robot's, the person has smaller parts. */
const INK = 1.05;
const HEAD_INK = 1.1;
const FINE_INK = 0.9;
const NOSE_INK = 0.75;

/**
 * Part ids for the outline pass. Above every id the sets and the board use,
 * so the rider is always outlined against them.
 */
const ID = {
  leftArm: 236, rightArm: 237, leftSleeve: 238, rightSleeve: 239, leftLeg: 240, rightLeg: 241,
  leftShoe: 242, rightShoe: 243, torso: 244, head: 245, hair: 246, beanie: 247, seat: 248, neck: 249, nose: 250, ears: 251,
} as const;
/** The tee and its sleeves are one garment: no seam inked at the shoulders, only where a sleeve passes in front of the body or behind it. */
const TEE_GARMENT = 1;
/** The face, its nose, and ears are one too, as features: only the nose's far side and tip, and the ears' rims, are inked over the face. */
const FACE = FEATURES + 1;
/** Paint order (back to front) where parts touch: the robot's, with clothes over what they cover. */
const PRIORITY = { armFar: 40, legFar: 50, legNear: 55, seat: 58, neck: 59, torso: 60, head: 70, hair: 72, beanie: 74, armNear: 80 } as const;
const OVER = 2;

/** Curls springing out from under the cuff: skull-local spot, size, and how they turn (degrees about up). */
const CURLS: ReadonlyArray<{ at: Vec3; size: number; turn: number; tip: number }> = [
  { at: [8.6, 6.0, -3.6], size: 0.95, turn: -10, tip: -150 },
  { at: [8.8, 6.3, 0.6], size: 1.05, turn: 6, tip: -160 },
  { at: [7.4, 5.6, 5.4], size: 0.9, turn: 30, tip: -145 },
  { at: [-6.6, -4.6, -6.8], size: 1.1, turn: -150, tip: -60 },
  { at: [-8.4, -4.2, -2.4], size: 1.2, turn: -175, tip: -55 },
  { at: [-8.4, -4.4, 2.6], size: 1.15, turn: 175, tip: -58 },
  { at: [-6.4, -4.8, 7], size: 1.05, turn: 150, tip: -62 },
  { at: [-1.6, -2.2, -11], size: 0.95, turn: -95, tip: -60 },
  { at: [-1.4, -2.4, 11], size: 0.95, turn: 95, tip: -60 },
];

/**
 * A part that's the same either side of its own x-y plane (a shoe), placed
 * unmirrored whichever way the frame's side points: the rig's shoe frames
 * come out mirrored for some stances. Drawn `s` times its size about the
 * point `floor` below its origin, which stays put.
 */
function placeSymmetric(mesh: Mesh | Group, frame: Frame3, s = 1, floor = 0): Placement {
  const x = dirToThree(frame.fwd);
  const y = dirToThree(frame.up);
  const z = crossThree(x, y);
  const o = toThree(frame.origin);
  const drop = floor * (s - 1);
  const at: Vec3 = [o[0] + y[0] * drop, o[1] + y[1] * drop, o[2] + y[2] * drop];
  setMatrix(mesh, at, x, y, z, s);
  return { o: at, x, y, z };
}

/**
 * A bone's mesh from `a` to `b` (x along it), rolled so its z lies along
 * `hinge` (any direction square-ish to the bone), drawn `along` times its
 * modelled length and `across` times its modelled girth.
 */
function placeBone(mesh: Mesh, a: V3, b: V3, hinge: V3, along: number, across = along) {
  const { o, x, y, z } = boneAxes(a, b, hinge);
  setMatrix(mesh, o, x, y, z, along, across);
}

/** A bone's three-world placement: at `a`, x toward `b`, z along `hinge` squared to it. */
function boneAxes(a: V3, b: V3, hinge: V3): Placement {
  const x = norm3(sub3(b, a));
  const z = norm3(sub3(hinge, scale3(x, dot3(hinge, x))));
  // The third axis is crossed in three's world: physics is y-down, its mirror image.
  const tx = dirToThree(x);
  const tz = dirToThree(z);
  return { o: toThree(a), x: tx, y: crossThree(tz, tx), z: tz };
}

/** A frame's three-world placement: origin, and axes as long as a modelled unit is drawn. */
interface Placement {
  o: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
}
const placementOf = (frame: Frame3, s: number): Placement => ({
  o: toThree(frame.origin), x: scale(dirToThree(frame.fwd), s), y: scale(dirToThree(frame.up), s), z: scale(dirToThree(frame.side), s),
});
const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];

/** A limb the cloth has to stay outside of: a bone from `a` to `b`, its radius by distance from `a`. */
export interface ClothObstacle {
  a: Vec3;
  b: Vec3;
  radius: (along: number) => number;
  /** Cloth hanging over it drapes onto its top and lies along it (a thigh); otherwise it's only pushed aside. */
  drape?: boolean;
}

/** How far cloth stands off a limb it rests on, and how softly it starts to give before it touches. */
const CLOTH_CLEAR = 0.7;
const CLOTH_SOFT = 1.8;
/** Passes of spreading a push through the cloth's neighbors. */
const CLOTH_SPREAD = 4;
/** Of the height a limb lifts cloth by, the share it then lies forward along the limb: the fabric keeps its length. */
const DRAPE_SLIDE = 0.8;

/** The most a limb lifts cloth by; anything that would need more just gets pushed aside. */
const DRAPE_MAX = 18;
/**
 * A bone starts to drape cloth as it swings across the body: from sin² of
 * its angle to the body's up of DRAPE_FROM (about 23°, a leg hanging
 * straight), fully by DRAPE_FROM + DRAPE_FADE (about 45°), so the shirt
 * eases onto a rising thigh instead of jumping onto it.
 */
const DRAPE_FROM = 0.15;
const DRAPE_FADE = 0.35;
/** How far out along a thigh, past the hip joint, the shirt is fully resting on it; behind the joint it hangs free. */
const DRAPE_BEHIND = 9;

/**
 * Where a line up through `p` (along the body's `up`, the way the shirt
 * hangs) leaves the top of a bone's capsule: how far up from `p`, or null
 * if the line misses it or runs along the bone.
 */
function topAbove(p: Vec3, up: Vec3, bone: ClothObstacle, u: Vec3, length: number): number | null {
  const ax = p[0] - bone.a[0], ay = p[1] - bone.a[1], az = p[2] - bone.a[2];
  // Across the bone: p's offset, and the line's direction, with the along-bone parts taken out.
  const along = ax * u[0] + ay * u[1] + az * u[2];
  const wx = ax - u[0] * along, wy = ay - u[1] * along, wz = az - u[2] * along;
  const eu = up[0] * u[0] + up[1] * u[1] + up[2] * u[2];
  const ex = up[0] - u[0] * eu, ey = up[1] - u[1] * eu, ez = up[2] - u[2] * eu;
  const ee = ex * ex + ey * ey + ez * ez;
  // A bone running with the body (a leg hanging, or lying in line with a fallen torso) has no top to drape over.
  if (ee < DRAPE_FROM) return null;
  let r = bone.radius(Math.max(0, Math.min(length, along)));
  let t = 0;
  for (let pass = 0; pass < 2; pass++) {
    const we = wx * ex + wy * ey + wz * ez;
    const ww = wx * wx + wy * wy + wz * wz;
    const disc = we * we - ee * (ww - r * r);
    if (disc < 0) return null;
    t = (-we + Math.sqrt(disc)) / ee;
    // The radius where the line comes out, for a tapering bone.
    const s = along + t * eu;
    if (s < -r || s > length + r) return null;
    r = bone.radius(Math.max(0, Math.min(length, s)));
  }
  return t;
}

/**
 * A mesh held by two frames, each vertex blended between where either frame
 * would carry it (linear blend skinning, done on the CPU: a tee is a couple
 * of thousand vertices), then kept off the limbs inside it. Built in the
 * second frame's local axes; `weight` is how much of a vertex the second
 * frame holds. `unit` is how big a modelled unit is drawn: the cloth's
 * give and drape are sized in modelled units too.
 */
class TwoFrameSkin {
  readonly geometry: BufferGeometry;
  private readonly unit: number;
  private readonly rest: Float32Array;
  private readonly weight: Float32Array;
  private readonly pos: Float32Array;
  /** Where the frames alone put each vertex, how far the limbs moved it, and a buffer for spreading that. */
  private readonly skinned: Float32Array;
  private readonly shift: Float32Array;
  private readonly spread: Float32Array;
  private readonly neighborStart: Uint32Array;
  private readonly neighbors: Uint32Array;

  constructor(geometry: BufferGeometry, weight: (x: number, y: number, z: number) => number, unit = 1) {
    this.geometry = geometry;
    this.unit = unit;
    this.rest = Float32Array.from(geometry.getAttribute('position').array);
    this.weight = new Float32Array(this.rest.length / 3);
    for (let i = 0; i < this.weight.length; i++) this.weight[i] = weight(this.rest[i * 3], this.rest[i * 3 + 1], this.rest[i * 3 + 2]);
    this.pos = new Float32Array(this.rest.length);
    this.skinned = new Float32Array(this.rest.length);
    this.shift = new Float32Array(this.rest.length);
    this.spread = new Float32Array(this.rest.length);
    // Each vertex's neighbors along the mesh, for spreading a push through the cloth.
    const sets = Array.from({ length: this.weight.length }, () => new Set<number>());
    const index = geometry.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      sets[a].add(b).add(c);
      sets[b].add(a).add(c);
      sets[c].add(a).add(b);
    }
    this.neighborStart = new Uint32Array(sets.length + 1);
    for (let i = 0; i < sets.length; i++) this.neighborStart[i + 1] = this.neighborStart[i] + sets[i].size;
    this.neighbors = new Uint32Array(this.neighborStart[sets.length]);
    for (let i = 0; i < sets.length; i++) this.neighbors.set([...sets[i]], this.neighborStart[i]);
    // Paint goes on by the rest pose, wherever the frames carry the cloth.
    geometry.setAttribute('rest', new BufferAttribute(this.rest, 3));
    geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
  }

  /**
   * `a` holds 1 - weight of each vertex, `b` the weight; `shiftA` moves b's
   * local origin into a's local axes. Then the limbs move the cloth the way
   * a body moves a loose shirt, which hangs down the body (b's up): a thigh
   * raised across it lifts what hangs over it onto its top, and that cloth
   * lies forward along the thigh
   * (draping, not tearing); any limb still coming through pushes the cloth
   * out over itself, easing in just before it touches so it bulges rather
   * than creases.
   */
  update(a: Placement, b: Placement, shiftA: Vec3, obstacles: readonly ClothObstacle[]) {
    const { rest, weight, pos, unit } = this;
    const up = scale(b.y, 1 / Math.hypot(b.y[0], b.y[1], b.y[2]));
    const clear = CLOTH_CLEAR * unit;
    for (let i = 0, k = 0; i < weight.length; i++, k += 3) {
      const w = weight[i];
      const x = rest[k], y = rest[k + 1], z = rest[k + 2];
      const ax = x + shiftA[0], ay = y + shiftA[1], az = z + shiftA[2];
      for (let c = 0; c < 3; c++) {
        const pa = a.o[c] + a.x[c] * ax + a.y[c] * ay + a.z[c] * az;
        const pb = b.o[c] + b.x[c] * x + b.y[c] * y + b.z[c] * z;
        pos[k + c] = pa + (pb - pa) * w;
      }
    }
    this.skinned.set(pos);
    for (const bone of obstacles) {
      if (!bone.drape) continue;
      const length = Math.hypot(bone.b[0] - bone.a[0], bone.b[1] - bone.a[1], bone.b[2] - bone.a[2]) || 1e-6;
      const u: Vec3 = [(bone.b[0] - bone.a[0]) / length, (bone.b[1] - bone.a[1]) / length, (bone.b[2] - bone.a[2]) / length];
      const across = 1 - (u[0] * up[0] + u[1] * up[1] + u[2] * up[2]) ** 2;
      const fade = smoothstep((across - DRAPE_FROM) / DRAPE_FADE);
      if (fade <= 0) continue;
      // Lying along the bone means moving down it, toward the knee.
      for (let k = 0; k < pos.length; k += 3) {
        const t = topAbove([pos[k], pos[k + 1], pos[k + 2]], up, bone, u, length);
        if (t == null || t <= -clear || t > DRAPE_MAX * unit) continue;
        // Cloth behind the hip joint hangs down behind the seat; only what's out over the thigh rides up onto it.
        const front = smoothstep(((pos[k] - bone.a[0]) * u[0] + (pos[k + 1] - bone.a[1]) * u[1] + (pos[k + 2] - bone.a[2]) * u[2]) / (DRAPE_BEHIND * unit));
        const lift = (t + clear) * fade * front;
        const p: Vec3 = [pos[k] + up[0] * lift, pos[k + 1] + up[1] * lift, pos[k + 2] + up[2] * lift];
        // Lay it forward along the bone by most of the height it came up, then back onto the top there.
        const along = (p[0] - bone.a[0]) * u[0] + (p[1] - bone.a[1]) * u[1] + (p[2] - bone.a[2]) * u[2];
        const slide = Math.max(0, Math.min(length - along, lift * DRAPE_SLIDE));
        for (let c = 0; c < 3; c++) p[c] += u[c] * slide;
        const settle = topAbove(p, up, bone, u, length);
        const rise = settle == null ? 0 : Math.max(0, settle + clear) * fade * front;
        pos[k] = p[0] + up[0] * rise;
        pos[k + 1] = p[1] + up[1] * rise;
        pos[k + 2] = p[2] + up[2] * rise;
      }
    }
    this.pushOut(obstacles);
    // Cloth spreads a push: smooth how far each vertex moved over its
    // neighbors, so the shirt bulges round a leg instead of fraying into
    // spikes where neighbors were pushed different ways. Then make sure the
    // smoothing left nothing inside a leg.
    const { skinned, shift, spread, neighborStart, neighbors } = this;
    for (let k = 0; k < pos.length; k++) shift[k] = pos[k] - skinned[k];
    for (let pass = 0; pass < CLOTH_SPREAD; pass++) {
      for (let i = 0; i < this.weight.length; i++) {
        let sx = 0, sy = 0, sz = 0;
        const from = neighborStart[i], to = neighborStart[i + 1];
        for (let n = from; n < to; n++) {
          const j = neighbors[n] * 3;
          sx += shift[j];
          sy += shift[j + 1];
          sz += shift[j + 2];
        }
        const count = to - from || 1;
        const k = i * 3;
        spread[k] = 0.5 * shift[k] + (0.5 * sx) / count;
        spread[k + 1] = 0.5 * shift[k + 1] + (0.5 * sy) / count;
        spread[k + 2] = 0.5 * shift[k + 2] + (0.5 * sz) / count;
      }
      shift.set(spread);
    }
    for (let k = 0; k < pos.length; k++) pos[k] = skinned[k] + shift[k];
    this.pushOut(obstacles);
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /** Pushes every vertex inside a limb back out over it, easing in just before it touches. */
  private pushOut(obstacles: readonly ClothObstacle[]) {
    const { pos, unit } = this;
    const clear = CLOTH_CLEAR * unit;
    const soft = CLOTH_SOFT * unit;
    for (const bone of obstacles) {
      const ux = bone.b[0] - bone.a[0], uy = bone.b[1] - bone.a[1], uz = bone.b[2] - bone.a[2];
      const length = Math.hypot(ux, uy, uz) || 1e-6;
      const dx = ux / length, dy = uy / length, dz = uz / length;
      // Skip what's nowhere near: the bone's fattest reach, plus the soft band.
      const reach = Math.max(bone.radius(0), bone.radius(length / 2), bone.radius(length)) + clear + soft;
      for (let k = 0; k < pos.length; k += 3) {
        const px = pos[k] - bone.a[0], py = pos[k + 1] - bone.a[1], pz = pos[k + 2] - bone.a[2];
        const s = Math.max(0, Math.min(length, px * dx + py * dy + pz * dz));
        const vx = px - dx * s, vy = py - dy * s, vz = pz - dz * s;
        const d = Math.hypot(vx, vy, vz);
        if (d >= reach || d < 1e-4) continue;
        const to = softFloor(d, bone.radius(s) + clear, soft);
        if (to <= d) continue;
        const k2 = to / d;
        pos[k] = bone.a[0] + dx * s + vx * k2;
        pos[k + 1] = bone.a[1] + dy * s + vy * k2;
        pos[k + 2] = bone.a[2] + dz * s + vz * k2;
      }
    }
  }
}

/**
 * Where a pant leg may be against its shoe, in the shoe's own (modelled)
 * axes: above the upper, or inside it (hidden), but not low beside it or
 * under the sole. `CUFF_BESIDE` is how far out past the upper's edge (a
 * share of its reach) still counts as beside it; `margin` 1 keeps the
 * cloth a little way off the upper's surface either side, 0 asks only
 * whether it shows through.
 */
const CUFF_CLEAR = 0.3;
const CUFF_BESIDE = 0.3;
const CUFF_INSIDE = 0.06;
const SOLE_UNDER = -SHOE_HALF_HEIGHT + 0.6;
export function clearOfShoe(x: number, y: number, z: number, margin = 1): boolean {
  if (y < SOLE_UNDER) return false;
  const top = upperTop(x, z);
  return top.out >= 1 + CUFF_BESIDE || top.out <= 1 - CUFF_INSIDE * margin || y >= top.height + CUFF_CLEAR * margin;
}

/** How fast a gathered hem eases back out to full width up the leg (share of its width per world unit). */
const CUFF_EASE = 0.12;

/**
 * A pant leg's shin, drawn in the world each frame so it goes into the
 * shoe instead of through it. Carried rigidly down the shin, the hem would
 * run on out through the shoe's side wherever the shin comes in at a slant
 * (a deck tipped in a slide, a foot rolled on the pop). Cloth gathers
 * instead: each ring of the leg is drawn in round toward the shin, just as
 * far as it takes to keep out of the shoe's sides, and the gathering eases
 * off up the leg, so the hem tucks into the collar.
 */
class PantShin {
  readonly geometry: BufferGeometry;
  private readonly rest: Float32Array;
  private readonly pos: Float32Array;
  /** Each vertex's ring (by distance down the leg), the rings' distances, and how far each is drawn in. */
  private readonly ring: Uint16Array;
  private readonly ringAlong: Float32Array;
  private readonly gather: Float32Array;

  constructor(geometry: BufferGeometry) {
    this.geometry = geometry;
    this.rest = Float32Array.from(geometry.getAttribute('position').array);
    this.pos = new Float32Array(this.rest.length);
    const count = this.rest.length / 3;
    const keys = [...new Set(Array.from({ length: count }, (_, i) => Math.round(this.rest[i * 3] * 20)))].sort((a, b) => a - b);
    const index = new Map(keys.map((key, i) => [key, i]));
    this.ring = Uint16Array.from({ length: count }, (_, i) => index.get(Math.round(this.rest[i * 3] * 20))!);
    this.ringAlong = Float32Array.from(keys, (key) => key / 20);
    this.gather = new Float32Array(keys.length);
    // Paint goes on by the shin's own axes, however the hem is gathered.
    geometry.setAttribute('rest', new BufferAttribute(this.rest, 3));
    geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
  }

  /** `bone` carries the shin; `shoe` is the shoe as drawn, `size` times its modelled size from its origin. */
  update(bone: Placement, shoe: Placement, size: number) {
    const { rest, pos, ring, ringAlong, gather } = this;
    // A point `k` of the way out from the shin to vertex i, in the shoe's axes: is it clear of the shoe?
    const clear = (i: number, k: number) => {
      const x = rest[i], y = rest[i + 1] * k, z = rest[i + 2] * k;
      let sx = 0, sy = 0, sz = 0;
      for (let c = 0; c < 3; c++) {
        const d = bone.o[c] + bone.x[c] * x + bone.y[c] * y + bone.z[c] * z - shoe.o[c];
        sx += d * shoe.x[c];
        sy += d * shoe.y[c];
        sz += d * shoe.z[c];
      }
      return clearOfShoe(sx / size, sy / size, sz / size);
    };
    gather.fill(1);
    for (let i = 0; i < rest.length; i += 3) {
      if (clear(i, 1)) continue;
      // The furthest out this point can be and stay clear, by bisection.
      let lo = 0;
      let hi = 1;
      for (let step = 0; step < 8; step++) {
        const mid = (lo + hi) / 2;
        if (clear(i, mid)) lo = mid;
        else hi = mid;
      }
      const r = ring[i / 3];
      gather[r] = Math.min(gather[r], lo);
    }
    // Ease the gathering out along the leg both ways, so it reads as cloth drawn in, not a notch.
    for (let r = 1; r < gather.length; r++) gather[r] = Math.min(gather[r], gather[r - 1] + CUFF_EASE * (ringAlong[r] - ringAlong[r - 1]));
    for (let r = gather.length - 2; r >= 0; r--) gather[r] = Math.min(gather[r], gather[r + 1] + CUFF_EASE * (ringAlong[r + 1] - ringAlong[r]));
    for (let i = 0; i < rest.length; i += 3) {
      const k = gather[ring[i / 3]];
      const x = rest[i], y = rest[i + 1] * k, z = rest[i + 2] * k;
      for (let c = 0; c < 3; c++) pos[i + c] = bone.o[c] + bone.x[c] * x + bone.y[c] * y + bone.z[c] * z;
    }
    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}



/** A grown-up's skate shoes: bigger than the robot's, grown about the middle of the sole so it stays on the grip. */
const SHOE_SIZE = 1.15;
const SOLE_FLOOR = -SHOE_HALF_HEIGHT;

/** Where the torso frame's origin sits over the hips (skeleton-local: 14 up, 1 forward). */
const CHEST_OVER_HIPS: Vec3 = [1, 14, 0];

function staticMesh(geometry: BufferGeometry, material: ShaderMaterial): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  return mesh;
}

interface ArmParts {
  sleeve: Mesh;
  upper: Mesh;
  fore: Mesh;
  hand: Group;
  skin: ShaderMaterial[];
  cloth: ShaderMaterial;
}

interface LegParts {
  thigh: Mesh;
  shin: PantShin;
  shoe: Group;
  cloth: ShaderMaterial[];
  shoeMaterials: ShaderMaterial[];
}

/** Alternative finishes share the human's clothing deformation and foot contact. */
export interface HumanAppearance {
  finish?: (material: ShaderMaterial) => ShaderMaterial;
  /** Replaces the illustrated face and hair; the knitted beanie is retained. */
  head?: Group;
  outlines?: boolean;
}

export class Human3D {
  readonly group = new Group();
  private readonly head = new Group();
  private readonly torso: Mesh;
  private readonly tee: TwoFrameSkin;
  private readonly seat: Mesh;
  private readonly neck = new Capsule();
  private readonly face: ShaderMaterial;
  private readonly headMaterials: ShaderMaterial[] = [];
  private readonly neckMaterial: ShaderMaterial;
  private readonly hairMaterial: ShaderMaterial;
  private readonly beanieMaterial: ShaderMaterial;
  private readonly arms: Record<'left' | 'right', ArmParts>;
  private readonly legs: Record<'left' | 'right', LegParts>;
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: ShaderMaterial[] = [];

  constructor(look: HumanLook = SKATER_LOOK, appearance: HumanAppearance = {}) {
    const geometry = <T extends BufferGeometry>(g: T) => {
      this.geometries.push(g);
      return g;
    };
    const material = (m: ShaderMaterial) => {
      const finished = appearance.finish?.(m) ?? m;
      this.materials.push(finished);
      return finished;
    };
    const skin = () => material(toonMaterial(look.skin));
    const darker = (hex: string, k: number) => mixHex(hex, '#1d1438', k);

    // Head: skull with the face painted on, ears, nose, neck; then hair and beanie over it.
    this.head.matrixAutoUpdate = false;
    this.face = material(humanFaceMaterial({
      skin: look.skin, white: '#fbf4e8', iris: look.eyes, pupil: '#1c1210', brow: look.hair, mouth: '#4a1e2a', lip: look.lips,
    }));
    const skull = staticMesh(geometry(skullGeometry()), this.face);
    const earMaterial = skin();
    const ears = ([1, -1] as const).map((m) => staticMesh(geometry(earGeometry(m)), earMaterial));
    const noseMaterial = skin();
    const nose = staticMesh(geometry(noseGeometry()), noseMaterial);
    const neckMaterial = skin();
    const neck = new Mesh(this.neck.geometry, neckMaterial);
    neck.frustumCulled = false;
    this.headMaterials.push(this.face, earMaterial, noseMaterial);
    this.neckMaterial = neckMaterial;

    this.hairMaterial = material(toonMaterial(look.hair));
    const hair = staticMesh(geometry(hairGeometry()), this.hairMaterial);
    const curls = CURLS.map((c, i) => {
      const mesh = staticMesh(geometry(curlGeometry(c.size, i % 2 === 0 ? 1 : -1)), this.hairMaterial);
      const turn = (c.turn * Math.PI) / 180;
      const tip = (c.tip * Math.PI) / 180;
      // Curl axes: x out along the turn, tipped down by `tip`; z round the head.
      const out: Vec3 = [Math.cos(turn) * Math.cos(tip), Math.sin(tip), Math.sin(turn) * Math.cos(tip)];
      const around: Vec3 = [-Math.sin(turn), 0, Math.cos(turn)];
      setMatrix(mesh, c.at, out, crossThree(around, out), around);
      return mesh;
    });
    this.beanieMaterial = material(beanieMaterial({ knit: look.beanie, rib: darker(look.beanie, 0.22), label: look.print }));
    const beanie = staticMesh(geometry(beanieGeometry()), this.beanieMaterial);
    this.head.add(skull, ...ears, nose, hair, ...curls, beanie);
    if (appearance.head) {
      this.head.remove(skull, ...ears, nose, hair, ...curls);
      this.head.add(appearance.head);
    }

    // Torso: the tee.
    const rib = darker(look.tee, 0.2);
    this.tee = new TwoFrameSkin(geometry(teeGeometry()), (_x, y) => teeChestWeight(y), HUMAN_SCALE);
    this.torso = staticMesh(this.tee.geometry, material(teeMaterial({ tee: look.tee, rib, print: look.print, screen: '#271f58', glow: '#ff7aa2' })));
    this.torso.matrixAutoUpdate = false;

    // Arms: a sleeve over a bare arm, and a hand.
    const sleeveShape = geometry(sleeveGeometry());
    const upperShape = geometry(upperArmGeometry());
    const foreShape = geometry(forearmGeometry());
    const arm = (side: 'left' | 'right'): ArmParts => {
      const cloth = material(sleeveMaterial({ tee: look.tee, rib }, SLEEVE.start + SLEEVE.length));
      const skinMaterial = skin();
      const hand = new Group();
      hand.matrixAutoUpdate = false;
      for (const g of handGeometries(side === 'left' ? 1 : -1)) hand.add(staticMesh(geometry(g), skinMaterial));
      return {
        sleeve: staticMesh(sleeveShape, cloth),
        upper: staticMesh(upperShape, skinMaterial),
        fore: staticMesh(foreShape, skinMaterial),
        hand,
        skin: [skinMaterial],
        cloth,
      };
    };
    this.arms = { left: arm('left'), right: arm('right') };

    // Legs: pants, and the robot's shoe in the skater's colors.
    const thighShape = geometry(thighGeometry());
    const shoeShape = shoeGeometries();
    geometry(shoeShape.sole);
    geometry(shoeShape.upper);
    const seam = darker(look.pants, 0.3);
    this.seat = staticMesh(geometry(seatGeometry()), material(seatMaterial({ cloth: look.pants, seam }, SEAT.top)));
    const leg = (side: 'left' | 'right'): LegParts => {
      const out = side === 'left' ? 1 : -1;
      const thighMaterial = material(pantsMaterial({ cloth: look.pants, seam }, { thigh: true, length: HUMAN_THIGH, out }));
      const shinMaterial = material(pantsMaterial({ cloth: look.pants, seam }, { thigh: false, length: HUMAN_SHIN, out }));
      const shin = new PantShin(geometry(shinGeometry()));
      const sole = material(sneakerMaterial({ upper: look.shoe, sole: look.sole, stripe: look.stripe }, null));
      const upper = material(sneakerMaterial({ upper: look.shoe, sole: look.sole, stripe: look.stripe }, shoeShape.toeCap));
      const shoe = new Group();
      shoe.matrixAutoUpdate = false;
      shoe.add(staticMesh(shoeShape.sole, sole), staticMesh(shoeShape.upper, upper));
      return {
        thigh: staticMesh(thighShape, thighMaterial),
        shin,
        shoe,
        cloth: [thighMaterial, shinMaterial],
        shoeMaterials: [sole, upper],
      };
    };
    this.legs = { left: leg('left'), right: leg('right') };

    this.group.add(this.head, neck, this.torso, this.seat);
    for (const a of Object.values(this.arms)) this.group.add(a.sleeve, a.upper, a.fore, a.hand);
    for (const l of Object.values(this.legs)) {
      this.group.add(l.thigh, staticMesh(l.shin.geometry, l.cloth[1]), l.shoe);
    }

    const ink = (materials: ShaderMaterial[], id: number, width = INK, garment = 0) => {
      for (const m of materials) inkInfo(id, 0, appearance.outlines === false ? 0 : width, appearance.outlines === false ? 0 : INK_ROBOT, m.uniforms.uInfo.value, 0, garment);
    };
    ink([this.face], ID.head, HEAD_INK, FACE);
    ink([earMaterial], ID.ears, FINE_INK, FACE);
    ink([noseMaterial], ID.nose, NOSE_INK, FACE);
    ink([neckMaterial], ID.neck, FINE_INK);
    ink([this.hairMaterial], ID.hair, FINE_INK);
    ink([this.beanieMaterial], ID.beanie, HEAD_INK);
    ink([this.torso.material as ShaderMaterial], ID.torso, INK, TEE_GARMENT);
    ink([this.seat.material as ShaderMaterial], ID.seat);
    ink(this.arms.left.skin, ID.leftArm, FINE_INK);
    ink(this.arms.right.skin, ID.rightArm, FINE_INK);
    ink([this.arms.left.cloth], ID.leftSleeve, INK, TEE_GARMENT);
    ink([this.arms.right.cloth], ID.rightSleeve, INK, TEE_GARMENT);
    ink(this.legs.left.cloth, ID.leftLeg);
    ink(this.legs.right.cloth, ID.rightLeg);
    ink(this.legs.left.shoeMaterials, ID.leftShoe);
    ink(this.legs.right.shoeMaterials, ID.rightShoe);
  }

  update(rig: Rig, expression: Expression, view: StageView) {
    const { cam } = view;
    const hips = hipsFrame(rig);
    // The tee hangs over the pants: each leg in it, thigh and shin, pushes it out of the way.
    const obstacles: ClothObstacle[] = [];
    for (const leg of rig.legs) {
      obstacles.push(
        { a: toThree(leg.hip), b: toThree(leg.knee), radius: thighRadius, drape: true },
        { a: toThree(leg.knee), b: toThree(leg.ankle), radius: shinRadius },
      );
    }
    this.tee.update(placementOf(hips, HUMAN_SCALE), placementOf(rig.torso, HUMAN_SCALE), CHEST_OVER_HIPS, obstacles);
    placeFrame(this.seat, hips, HUMAN_SCALE);
    placeFrame(this.head, shiftFrame(rig.head, SKULL_AT.f * HUMAN_HEAD, SKULL_AT.u * HUMAN_HEAD, 0), HUMAN_HEAD);
    const jaw = skullAt(-7.5);
    this.neck.set(
      toThree(rig.torso.at(0.6 * HUMAN_SCALE, (TEE.top - 4) * HUMAN_SCALE, 0)),
      toThree(rig.head.at((SKULL_AT.f + jaw.forward - 3) * HUMAN_HEAD, (SKULL_AT.u - 6.5) * HUMAN_HEAD, 0)),
      4.5 * HUMAN_SCALE,
      4.1 * HUMAN_HEAD,
    );
    this.face.uniforms.uExpression.value = EXPRESSIONS[expression];

    for (const arm of rig.arms) {
      const parts = this.arms[arm.side];
      const hinge = cross3(sub3(arm.elbow, arm.shoulder), sub3(arm.hand, arm.elbow));
      const bend = add3(hinge, scale3(rig.torso.side, 30));
      placeBone(parts.sleeve, arm.shoulder, arm.elbow, bend, HUMAN_SCALE);
      placeBone(parts.upper, arm.shoulder, arm.elbow, bend, HUMAN_SCALE);
      placeBone(parts.fore, arm.elbow, arm.hand, bend, HUMAN_SCALE);
      // The hand hangs on with its palm to the body and the thumb forward.
      const x = norm3(sub3(arm.hand, arm.elbow));
      const out = scale3(rig.torso.side, arm.side === 'right' ? 1 : -1);
      const y = norm3(sub3(out, scale3(x, dot3(out, x))));
      const tx = dirToThree(x);
      const ty = dirToThree(y);
      setMatrix(parts.hand, toThree(arm.hand), tx, ty, crossThree(tx, ty), HUMAN_SCALE);
    }
    for (const leg of rig.legs) {
      const parts = this.legs[leg.side];
      // The knee's hinge; a straight leg falls back to the way the toes point.
      const u = norm3(sub3(leg.ankle, leg.hip));
      const hinge = add3(cross3(sub3(leg.knee, leg.hip), sub3(leg.ankle, leg.knee)), scale3(cross3(leg.shoe.fwd, u), 40));
      placeBone(parts.thigh, leg.hip, leg.knee, hinge, 1);
      const shoe = placeSymmetric(parts.shoe, leg.shoe, SHOE_SIZE, SOLE_FLOOR);
      parts.shin.update(boneAxes(leg.knee, leg.ankle, hinge), shoe, SHOE_SIZE);
    }

    // Who paints over whom where parts touch: near and far by depth, as for the robot.
    const [armA, armB] = rig.arms;
    const nearArm = cam.depthOf(armA.shoulder) >= cam.depthOf(armB.shoulder) ? armA.side : armB.side;
    const [legA, legB] = rig.legs;
    const legDepth = (l: typeof legA) => cam.depthOf(scale3(add3(l.knee, l.ankle), 0.5));
    const nearLeg = legDepth(legA) >= legDepth(legB) ? legA.side : legB.side;
    const prioritize = (materials: ShaderMaterial[], priority: number) => {
      for (const m of materials) m.uniforms.uInfo.value.y = priority / 255;
    };
    for (const side of ['left', 'right'] as const) {
      const arm = side === nearArm ? PRIORITY.armNear : PRIORITY.armFar;
      prioritize(this.arms[side].skin, arm);
      prioritize([this.arms[side].cloth], arm + OVER);
      const leg = side === nearLeg ? PRIORITY.legNear : PRIORITY.legFar;
      prioritize(this.legs[side].cloth, leg);
      prioritize(this.legs[side].shoeMaterials, leg + OVER);
    }
    prioritize([this.torso.material as ShaderMaterial], PRIORITY.torso);
    prioritize([this.seat.material as ShaderMaterial], PRIORITY.seat);
    prioritize(this.headMaterials, PRIORITY.head);
    prioritize([this.neckMaterial], PRIORITY.neck);
    prioritize([this.hairMaterial], PRIORITY.hair);
    prioritize([this.beanieMaterial], PRIORITY.beanie);
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    this.neck.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}

const EXPRESSIONS: Record<Expression, number> = { open: 0, focus: 1, happy: 2, wince: 3 };
