import type { Vec3 } from '../../camera/view';
import { Bake, type Ink } from '../../three/bake';
import {
  CARLSBAD_FOOT as F,
  CARLSBAD_RISER,
  CARLSBAD_WING_YAW,
  carlsbadWingPoint,
  CARLSBAD_TREAD,
  CARLSBAD_JOINTS,
  carlsbadSurface,
  carlsbadBank,
  carlsbadPaved,
  carlsbadBankEnd,
  carlsbadUpperEdge,
  carlsbadCheekTop,
  carlsbadLanding,
  carlsbadPathOuter,
  carlsbadCapBack,
  carlsbadCurbOffset,
  carlsbadCurbSample,
  carlsbadCurbTop,
  carlsbadLawnBounds,
  carlsbadToeTop,
} from './carlsbadLayout';
import { stairContacts, SURFACE, type ContactLine, type SpotLook } from '../surfaces';
import { mixHex, PAVING, pavingColor, turfColor, valueNoise, type PavingPart } from './carlsbadWear';
const tag = (solid: number, id = 0): Ink => ({
  solid,
  id,
  priority: 0,
  width: 0,
  kind: 0,
});
const concrete = PAVING.stair,
  wall = '#ddd6c6',
  metal = '#737a73';
type Segment = {
  a: Vec3;
  b: Vec3;
  radius: number;
};
type ShadowBox = {
  yaw?: number;
  min: Vec3;
  max: Vec3;
};
const point = (x: number, y: number, z: number): Vec3 => [x * F, y * F, z * F];
function faceNormal(a: Vec3, c: Vec3, d: Vec3): Vec3 {
  const u = c.map((q, i) => q - a[i]),
    v = d.map((q, i) => q - a[i]);
  const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  return n.map((q) => q / l) as Vec3;
}
function triangle(b: Bake, a: Vec3, c: Vec3, d: Vec3, color: string, solid: number) {
  b.triangle(a, c, d, faceNormal(a, c, d), { color }, tag(solid));
}
function quad(b: Bake, a: Vec3, c: Vec3, d: Vec3, e: Vec3, color: string, solid: number) {
  triangle(b, a, c, d, color, solid);
  triangle(b, a, d, e, color, solid);
}
function box(b: Bake, a: Vec3, c: Vec3, color: string, solid: number) {
  b.box(a, c, color, color, tag(solid), 'tbfkle', false);
}
function tube(b: Bake, spine: Vec3[], radius: number, color: string, solid = 18, shadows?: Segment[]) {
  b.tube(
    spine,
    spine.map(() => radius),
    { color },
    tag(solid, solid === 18 ? 60 : 0),
    10,
    true,
  );
  if (shadows) {
    for (let i = 1; i < spine.length; i++) {
      shadows.push({ a: spine[i - 1], b: spine[i], radius });
    }
  }
}
/**
 * One conforming triangulated height field. Rows include both sides of each
 * discontinuity; the almost vertical connecting strips close risers and cheeks.
 * The zipper shares every edge even where a curved boundary adds a row vertex.
 * No independent bank/runout patches (and therefore no hidden T junctions).
 */
function terrain(b: Bake) {
  const eps = 1e-7;
  const zs = [-800, -170, -150, -110, -96, -79, -75, -71, -66, -62, -60, -56.5, -49.5, -41.5, -33, -29, -26.6, -25, -17.5, -7.66, -7.2, 17];
  for (let z = -79; z < -12.5; z += 0.75) zs.push(z);
  for (let z = -68; z < -62; z += 0.25) zs.push(z);
  for (let z = -15; z <= 24; z += 1) {
    zs.push(z);
  }
  zs.push(1.33, 31, 40, 50, 62, 100, 800);
  for (let z = -12.5; z < -6.5; z += 0.1) {
    zs.push(z);
  }
  for (let z = -6.5; z < -5; z += 0.05) {
    zs.push(z);
  }
  for (const z of [4.33, 5, 16, 16.67]) {
    zs.push(z - eps, z, z + eps);
  }
  const tip = carlsbadCurbSample(0);
  const ratio = tip.tangent[0] / tip.tangent[1],
    wallSlope = -0.8 / 9.33;
  for (const d of [2 / 3, 2 / 3 + 1, 2 / 3 + 2, 2 / 3 + 3, 2 / 3 + 4, 2 / 3 + 6]) {
    zs.push(-5 + (d * (tip.inward[0] - tip.inward[1] * ratio + 1)) / (wallSlope - ratio));
  }
  zs.sort((a, c) => a - c);
  const rows = [...new Set(zs)].map((z) => {
    const end = carlsbadBankEnd(z * F) / F,
      edge = carlsbadUpperEdge(z * F) / F;
    const back = carlsbadCapBack(z * F) / F;
    const xs = [
      ...carlsbadLawnBounds(z * F).map((x) => x / F),
      edge + 1.25,
      edge + 2.5,
      -800,

      ...(z >= 4.33 && z <= 16.67 ? [-2-eps,-2,-2+eps] : []),
      edge,
      ...[0.5,1,1.5,2,2.5,3,4,6].map((d) => carlsbadCurbOffset(z * F, (2 / 3 + d) * F) / F),
      back - eps,
      back,
      back + eps,
      end - 0.1,
      end,
      end + eps,
      ...(z >= 4.33 && z <= 16.67 ? [12.2,12.2+eps] : []),
      27,
      carlsbadPathOuter(z * F) / F,
      66,
      800,
    ];
    if (z < -60 && z > -72) {
      for (const d of [0.25,0.75,1.25,1.75]) xs.push(carlsbadCurbOffset(z*F,(2/3+d)*F)/F);
    }
    if (z < -15) {
      for (let x=edge+2.5; x<back; x+=1.5) xs.push(x);
    } else {
      for (let x=0;x<=56;x+=x<32?2:4) xs.push(x);
    }
    for (let i = 0; i < 11; i++) {
      const x = (i * CARLSBAD_TREAD) / F;
      if (z >= 4.33 && z <= 16.67) xs.push(x - eps, x, x + eps);
      else if (z > -15) xs.push(x);
    }
    return [...new Set(xs)].sort((a, c) => a - c).map((x) => [x * F, carlsbadSurface(x * F, z * F), z * F] as Vec3);
  });
  function tri(a: Vec3, c: Vec3, d: Vec3) {
    const x = (a[0] + c[0] + d[0]) / 3,
      z = (a[2] + c[2] + d[2]) / 3;
    const cap = x >= carlsbadCapBack(z) && x <= carlsbadBankEnd(z) + 0.001 * F && z < 4.33 * F;
    const cheek = ((z >= 4.33 * F && z < 5 * F) || (z > 16 * F && z <= 16.67 * F)) && x >= -2 * F && x <= 12.2 * F;
    const paved = carlsbadPaved(x, z) || cap || cheek;
    if (!paved && z < 4.33 * F && x > carlsbadUpperEdge(z) && x < carlsbadCapBack(z)) {
      for (const p of [a, c, d]) {
        const e = 0.02 * F;
        const dx = (carlsbadBank(p[0] + e, p[2]) - carlsbadBank(p[0] - e, p[2])) / (2 * e);
        const dz = (carlsbadBank(p[0], p[2] + e) - carlsbadBank(p[0], p[2] - e)) / (2 * e);
        const length = Math.hypot(dx, 1, dz);
        b.vertex(p, [-dx / length, 1 / length, -dz / length], { color: turfColor(p[0], p[2]) }, tag(14));
      }
    } else {
      // Flat-shaded, but painted per corner: wear and grime vary across the big paving triangles.
      const n = faceNormal(a, c, d);
      const part: PavingPart = cap ? 'cap' : cheek ? 'cheek' : 'paved';
      for (const p of [a, c, d]) {
        b.vertex(p, n, { color: paved ? pavingColor(p, n, part) : turfColor(p[0], p[2]) }, tag(paved ? 15 : 14));
      }
    }
  }
  // Constrain the zipper at the curb and outside path edge so no triangle
  // crosses a material boundary on the curved path.
  const cuts = (z: number) => {
    const e = carlsbadBankEnd(z);
    return [
      -800 * F,
      ...carlsbadLawnBounds(z),
      // The stair-head blocks' uphill faces (the rows that have them): without a cut there the zipper
      // ran each five-inch face out into a wedge the length of the pad. Elsewhere it folds onto the edge.
      z >= 4.33 * F && z <= 16.67 * F ? -2 * F : carlsbadUpperEdge(z),
      carlsbadUpperEdge(z),
      ...[6,4,3,2.5,2,1.5,1,0.5].map((d) => carlsbadCurbOffset(z, (2 / 3 + d) * F)),
      carlsbadCapBack(z),
      e - 0.1 * F,
      e,
      e + eps * F,
      Math.max(e + eps * F, carlsbadPathOuter(z)),
      800 * F,
    ].sort((a,b)=>a-b);
  };
  for (let r = 1; r < rows.length; r++) {
    const ca = cuts(rows[r - 1][0][2]),
      cc = cuts(rows[r][0][2]);
    for (let band = 0; band < ca.length - 1; band++) {
      const clip = (row: Vec3[], lo: number, hi: number) => row.filter((p) => p[0] >= lo - 1e-8 && p[0] <= hi + 1e-8);
      const a = clip(rows[r - 1], ca[band], ca[band + 1]),
        c = clip(rows[r], cc[band], cc[band + 1]);
      let i = 0,
        j = 0;
      // A step up at one x: on a tie it waits for the level row to catch up, or it is stretched into a fin.
      const riser = (row: Vec3[], k: number) =>
        k < row.length - 1 && row[k + 1][0] - row[k][0] < 1e-5 * F && row[k + 1][1] !== row[k][1];
      while (i < a.length - 1 || j < c.length - 1) {
        const ta = i < a.length - 1 ? (a[i + 1][0] - ca[band]) / (ca[band + 1] - ca[band]) : Infinity;
        const tc = j < c.length - 1 ? (c[j + 1][0] - cc[band]) / (cc[band + 1] - cc[band]) : Infinity;
        const wait = ta === tc && riser(a, i) && j < c.length - 1 && !riser(c, j);
        if (i < a.length - 1 && ta <= tc && !wait) {
          tri(a[i], c[j], a[i + 1]);
          i++;
        } else {
          tri(a[i], c[j], c[j + 1]);
          j++;
        }
      }
    }
  }
}
function stairs(p: Bake, marks: Bake, rails: Segment[]) {
  for (let i = 0; i < 11; i++) {
    const x = (i * CARLSBAD_TREAD) / F,
      y = (-i * CARLSBAD_RISER) / F;
    // The paint covers each nose: the riser almost to its foot and a good five inches of the tread above it,
    // so from the landing the flight reads as bands of yellow (refs/03, 163 and 02 from below) and from the
    // stair head as stripes as wide as the bare concrete between them (refs/191). Painted per corner by how
    // worn it is: the look chips duller paint more, so it is barest on the noses and down the middle where
    // people walk and boards slide, freshest by the cheeks and at the risers' feet.
    const zs = [5, 6.4, 8.5, 12.5, 14.6, 16];
    const back = x - 0.45, foot = y - CARLSBAD_RISER / F + 0.05;
    const paint = (z: number, nose: number) => ({ color: stairPaint(z, nose, i) });
    for (let k = 1; k < zs.length; k++) {
      const z0 = zs[k - 1], z1 = zs[k];
      marks.quadCorners(point(back, y + 0.006, z0), point(x + 0.004, y + 0.006, z0), point(x + 0.004, y + 0.006, z1),
        point(back, y + 0.006, z1), [0, 1, 0], [paint(z0, 0), paint(z0, 1), paint(z1, 1), paint(z1, 0)], tag(15));
      marks.quadCorners(point(x + 0.004, y + 0.006, z0), point(x + 0.004, foot, z0), point(x + 0.004, foot, z1),
        point(x + 0.004, y + 0.006, z1), [1, 0, 0], [paint(z0, 1), paint(z0, 0.3), paint(z1, 0.3), paint(z1, 1)], tag(15));
    }
  }
  for (const z of [4.665, 16.335]) {
    // Flared level head pedestal and short foot block.
    const pedestal = [
      point(-2, 5 / 12, z - 0.65),
      point(-2, 5 / 12, z + 0.65),
      point(0, 5 / 12, z + 0.335),
      point(0, 5 / 12, z - 0.335),
    ];
    quad(p, ...(pedestal as [Vec3, Vec3, Vec3, Vec3]), concrete, 15);
    for (let k = 0; k < 4; k++) {
      const a = pedestal[k],
        c = pedestal[(k + 1) % 4];
      quad(p, [a[0], 0, a[2]], [c[0], 0, c[2]], c, a, concrete, 15);
    }
    const low = carlsbadCheekTop(11 * F) / F;
    // The foot block stands an eighth of an inch proud of the terrain's cheek top and its step down to the
    // landing: flush, the two coplanar faces z-fought into a flickering patch as the camera moved.
    box(p, point(11, -6, z - 0.45), point(12.21, low + 0.01, z + 0.45), concrete, 15);
    const spine: Vec3[] = [];
    // P crook rises over the head post and returns to the descending pipe.
    const top: [[number, number], ...[number, number][]] = [
      [-0.55, 0.42],
      [-0.55, 1.95],
      [-0.7, 2.13],
      [-1.05, 2.08],
      [-1.4, 2.22],
      [-1.56, 2.55],
      [-1.5, 2.87],
      [-1.27, 3.1],
      [-0.95, 3.16],
      [0, 2.83],
    ];
    for (const [x, y] of top) {
      spine.push(point(x, y, z));
    }
    spine.push(point(10.8, (-10.8 * CARLSBAD_RISER) / CARLSBAD_TREAD + 2.83, z));
    for (const [x, y] of [
      [11.12, -2.55],
      [11.48, -2.48],
      [11.72, -2.65],
      [11.74, -2.94],
      [11.56, -3.18],
      [11.2, -3.22],
      [11.03, -3.42],
      [11.03, low],
    ]) {
      spine.push(point(x, y, z));
    }
    tube(p, spine, (1.9 / 24) * F, metal, 18, rails);
    const x = 5.5,
      y = carlsbadCheekTop(x * F) / F;
    tube(
      p,
      [point(x, y, z), point(x, (-x * CARLSBAD_RISER) / CARLSBAD_TREAD + 2.83, z)],
      (1.9 / 24) * F,
      metal,
      18,
      rails,
    );
  }
}
/** A box transformed in the wing frame; no axis-aligned proxy geometry. */
function wingBox(p: Bake, a: Vec3, b: Vec3, color: string, solid=17, offset: Vec3=[0,0,0]) {
  const at=(u:number,y:number,v:number): Vec3 => {
    const [x,z]=carlsbadWingPoint(u,v); return [x+offset[0]*F,(y+offset[1])*F,z+offset[2]*F];
  };
  const v=[at(a[0],a[1],a[2]),at(b[0],a[1],a[2]),at(b[0],b[1],a[2]),at(a[0],b[1],a[2]),
    at(a[0],a[1],b[2]),at(b[0],a[1],b[2]),at(b[0],b[1],b[2]),at(a[0],b[1],b[2])];
  for (const face of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]])
    quad(p,v[face[0]],v[face[1]],v[face[2]],v[face[3]],color,solid);
}
/** The wing's outward facade normal (toward the covered walk), in three's axes. */
const WING_OUT: Vec3 = (() => {
  const [x, z] = carlsbadWingPoint(0, 1);
  const l = Math.hypot(x, z);
  return [x / l, 0, z / l];
})();
/** A flat face square to the wing at depth `v`, facing the walk: frames, plaques, trim (one quad, not a box). */
function wingQuad(p: Bake, u0: number, u1: number, y0: number, y1: number, v: number, color: string, solid: number) {
  const at = (u: number, y: number): Vec3 => {
    const [x, z] = carlsbadWingPoint(u, v);
    return [x, y * F, z];
  };
  p.quad(at(u0, y0), at(u1, y0), at(u1, y1), at(u0, y1), WING_OUT, { color }, tag(solid));
}
/** A level face in the wing frame at height `y` (a sill's top, a threshold, a mat). */
function wingFloor(p: Bake, u0: number, u1: number, v0: number, v1: number, y: number, color: string, solid: number) {
  const at = (u: number, v: number): Vec3 => {
    const [x, z] = carlsbadWingPoint(u, v);
    return [x, y * F, z];
  };
  p.quad(at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), [0, 1, 0], { color }, tag(solid));
}
/** The wing's glazed bays: five 4.5 ft windows from u = 5.05, the run repeating every 41.6 ft down the wing. */
const BAY = { from: 5.05, width: 4.5, period: 41.6, sill: 3.9, head: 8 } as const;
/**
 * The wing windows' pale steel sash, for the look to draw on their glass (SpotLook.sash): jambs, two mullions,
 * head and sill rails and three transoms (refs/163's small panes). Bars an inch wide built as faces flickered in
 * and out at a distance; drawn per pixel they settle into the window's average tone.
 */
export const CARLSBAD_SASH = {
  yaw: CARLSBAD_WING_YAW,
  from: BAY.from,
  period: BAY.period,
  width: BAY.width,
  columns: [[-0.12, 0.12], [BAY.width - 0.12, BAY.width + 0.12], [BAY.width / 3 - 0.035, BAY.width / 3 + 0.035], [(2 * BAY.width) / 3 - 0.035, (2 * BAY.width) / 3 + 0.035]],
  rows: [[BAY.sill, BAY.sill + 0.12], [BAY.head - 0.12, BAY.head], [5.27, 5.34], [6.12, 6.19], [7.02, 7.09]],
  frame: '#e4e1d6',
} satisfies NonNullable<SpotLook['sash']>;
/** Facade paint, circa 2000 (refs/163, 03): cream render, a paler band below the sills, pale frames, dark doors. */
const FACADE = {
  wainscot: '#e2ddd0',
  frame: CARLSBAD_SASH.frame,
  sill: '#5d665a',
  door: '#4f3f2e',
  doorFrame: '#3b3328',
  soffit: '#bcb5a3',
  fascia: '#5d665a',
  steel: '#a7aaa4',
} as const;
function hallwayWing(p: Bake, shadows: ShadowBox[]) {
  const wb=(a:Vec3,b:Vec3,c=wall,solid=17)=>wingBox(p,a,b,c,solid);
  wb([-140,0,-40.7],[40.1,9.4,-17]);
  // Recessed doors and glazed bays with pale frames; blank facade fills the gaps.
  const openings: {a:number,b:number,sill:number,head:number,door:boolean}[]=[];
  for (let repeat=0;repeat<4;repeat++) {
    for (const u of [3.3-repeat*41.6,-12.3-repeat*41.6]) {
      if(u>-138) openings.push({a:u-1.75,b:u+1.75,sill:0,head:7,door:true});
    }
    for(let i=0;i<5;i++) {
      const u=BAY.from+i*BAY.width-repeat*BAY.period;
      if(u>-140) openings.push({a:u,b:u+BAY.width,sill:BAY.sill,head:BAY.head,door:false});
    }
  }
  openings.sort((a,b)=>a.a-b.a);
  // Blank wall between openings: the paler band below sill height, cream render above.
  const blank = (u0: number, u1: number) => {
    wb([u0,0,-17],[u1,3.75,-16.7],FACADE.wainscot);
    wb([u0,3.75,-17],[u1,9.4,-16.7]);
  };
  const fv = -16.8;
  let last=-140;
  for(const o of openings) {
    if(o.a<last-1e-8) continue;
    if(o.a>last+1e-8) blank(last,o.a);
    if(o.sill) wb([o.a,0,-17],[o.b,o.sill,-16.7],FACADE.wainscot);
    wb([o.a,o.head,-17],[o.b,9.4,-16.7]);
    wb([o.a,o.sill,-16.95],[o.b,o.head,-16.88],o.door?FACADE.door:'#1d1713',o.door?18:SURFACE.sash);
    if (o.door) {
      // Dark steel frame, a kick plate, the room number plaque and a threshold onto the walk.
      for (const [u0,u1] of [[o.a,o.a+0.16],[o.b-0.16,o.b]]) wingQuad(p,u0,u1,0,o.head,fv,FACADE.doorFrame,18);
      wingQuad(p,o.a,o.b,o.head-0.16,o.head,fv,FACADE.doorFrame,18);
      wingQuad(p,o.a+0.16,o.b-0.16,0,0.75,-16.87,'#7e7b70',18);
      const c=(o.a+o.b)/2;
      wingQuad(p,c-0.21,c+0.21,5.55,5.95,-16.86,'#e9e6dc',17);
      wingQuad(p,c-0.13,c+0.13,5.72,5.79,-16.855,'#3a3a36',17);
      wingFloor(p,o.a,o.b,-16.95,-16.45,0.018,'#8b8c84',18);
    } else {
      // The pale steel sash is drawn on the glass (CARLSBAD_SASH).
      // The dark sill line (refs/03, 163): its top and front.
      wingFloor(p,o.a,o.b,-16.7,-16.52,3.9,FACADE.sill,17);
      wingQuad(p,o.a,o.b,3.76,3.9,-16.52,FACADE.sill,17);
    }
    last=o.b;
  }
  blank(last,40.1);
  // Drinking fountain between the doors (refs/03): a steel back plate, the bowl on its bracket.
  wingQuad(p,-5.05,-3.95,2.1,3.45,-16.69,FACADE.steel,18);
  wb([-4.95,2.55,-16.7],[-4.05,2.95,-15.85],FACADE.steel,18);
  wingFloor(p,-4.85,-4.15,-16.6,-15.95,2.952,'#5b5e5a',18);
  wb([-4.62,1.55,-16.7],[-4.38,2.55,-16.45],'#8e918b',18);
  // A downpipe down the facade near the wing's downhill end, onto a splash block.
  wb([38.9,0.1,-16.7],[39.2,9.4,-16.4],'#8f938c',18);
  wb([38.6,0,-16.7],[39.5,0.12,-15.2],concrete,15);
  // A dark green trash can against the wall below the windows, well off the riders' line (refs/163).
  {
    const [x,z]=carlsbadWingPoint(11.6,-15.55);
    p.tube([[x,0,z],[x,2.9*F,z]],[0.95*F,1.0*F],{color:'#2e3a30'},tag(18),12,true);
    p.tube([[x,2.9*F,z],[x,3.05*F,z]],[1.06*F,1.06*F],{color:'#27312a'},tag(18),12,true);
  }
  const at=(u:number,y:number,v:number):Vec3=> {const [x,z]=carlsbadWingPoint(u,v);return [x,y*F,z];};
  // Sloped cantilever soffit and closed pale roof, without hallway posts; a dark fascia on the walk's edge.
  for(const [v0,v1,y0,y1] of [[-43.7,-28,9.4,10.713],[-28,-7.7,10.713,8.4]]) {
    const vs=[at(-143,y0,v0),at(43.1,y0,v0),at(43.1,y1,v1),at(-143,y1,v1)];
    // Wound so every face's normal points out of the slab: the soffit faces down, the roof up.
    quad(p,vs[0],vs[1],vs[2],vs[3],FACADE.soffit,17);
    const top=vs.map(v=>[v[0],v[1]+0.8*F,v[2]] as Vec3);
    quad(p,top[3],top[2],top[1],top[0],'#c6c5b8',17);
    for(let i=0;i<4;i++) quad(p,top[i],top[(i+1)%4],vs[(i+1)%4],vs[i],i===2&&v1>-8?FACADE.fascia:wall,17);
  }
  const soffitY=(v:number)=>10.713+(v+28)/20.3*(8.4-10.713);
  for(let u=-139;u<43;u+=7.75) {
    // Deepest beam remains above the 7.5-foot rider clearance.
    wb([u,8.05,-16.7],[u+0.3,8.4,-7.7],FACADE.soffit);
    // A light fitting in every other bay, out toward the fascia (refs/163).
    if (Math.round((u+139)/7.75)%2===0 && u+7.75<43) {
      const c=u+0.15+7.75/2, y=soffitY(-10.75);
      wb([c-0.75,y-0.22,-11.2],[c+0.75,y+0.1,-10.6],'#ebe9df');
    }
  }
  const yaw=CARLSBAD_WING_YAW*Math.PI/180;
  shadows.push({min:point(-140,0,-40.7),max:point(40.1,9.4,-16.7),yaw},
    {min:point(-143,8.4,-43.7),max:point(43.1,9.2,-7.7),yaw});
}
/** A shrub in a planting strip: a squat leafy blob (leaves, solid 13). */
function shrub(p: Bake, x: number, y: number, z: number, size: number) {
  p.tube([point(x, y - 0.05, z), point(x, y + 0.55 * size, z), point(x, y + 1.15 * size, z)],
    [0.45 * size * F, 0.85 * size * F, 0.25 * size * F], { color: '#55703a' }, tag(13), 8, true);
}
/**
 * The portables (refs/191): vertical board siding (the look's siding surface, no modelled battens), a dark
 * skirt, a low roof with a fascia and overhang, a framed window, two doors on a stoop, and a mulched
 * planting strip with a few shrubs along the front.
 */
function portable(p: Bake, x0: number, x1: number, z0: number, z1: number, shrubs: boolean) {
  const floor = carlsbadLanding(x0 * F) / F;
  box(p, point(x0, floor, z0), point(x1, floor + 9, z1), '#c8bd9f', SURFACE.siding);
  // Skirting where the building stands on its piers.
  p.box(point(x0 - 0.06, floor - 0.05, z0 - 0.06), point(x1 + 0.06, floor + 0.85, z1 + 0.06), '#8a816d', '#8a816d', tag(17), 'fkle', false);
  // Roof: pale membrane on top, a fascia around the overhang, its underside in shade.
  p.box(point(x0 - 1.1, floor + 9, z0 - 1.1), point(x1 + 1.1, floor + 9.75, z1 + 1.1), '#7d776a', '#7d776a', tag(17), 'fkle', false);
  p.box(point(x0 - 1.1, floor + 9, z0 - 1.1), point(x1 + 1.1, floor + 9.75, z1 + 1.1), '#d9d8cd', '#d9d8cd', tag(17), 'tb', false);
  const face = (zz0: number, zz1: number, y0: number, y1: number, d: number, color: string, solid: number) =>
    p.quad(point(x0 - d, floor + y0, zz0), point(x0 - d, floor + y0, zz1), point(x0 - d, floor + y1, zz1), point(x0 - d, floor + y1, zz0),
      [-1, 0, 0], { color }, tag(solid));
  // A window with an aluminium frame.
  face(z0 + 12, z0 + 18, 3.5, 7, 0.03, '#283431', SURFACE.glass);
  for (const [a, c, y0, y1] of [[z0 + 11.85, z0 + 12.05, 3.4, 7.1], [z0 + 17.95, z0 + 18.15, 3.4, 7.1], [z0 + 14.96, z0 + 15.04, 3.5, 7]] as const)
    face(a, c, y0, y1, 0.06, '#b8b8b0', SURFACE.metal);
  for (const [y0, y1] of [[3.4, 3.55], [6.95, 7.1]]) face(z0 + 11.85, z0 + 18.15, y0, y1, 0.065, '#b8b8b0', SURFACE.metal);
  // Two doors in steel frames, each with a narrow vision light.
  for (const z of [z0 + 22, z0 + 26]) {
    face(z - 0.15, z + 3.15, 0.35, 7.15, 0.04, '#5c5f58', SURFACE.metal);
    face(z, z + 3, 0.35, 7, 0.06, '#3a3f39', SURFACE.metal);
    face(z + 0.45, z + 0.85, 4, 6.3, 0.07, '#283431', SURFACE.glass);
  }
  box(p, point(x0 - 2, floor - 0.1, z0 + 21), point(x0, floor + 0.35, z0 + 30), concrete, 15);
  // A downpipe at the front corner.
  box(p, point(x0 - 0.35, floor, z0 + 0.4), point(x0 - 0.05, floor + 9, z0 + 0.7), '#8f938c', SURFACE.metal);
  // Mulched planting strip along the front.
  box(p, point(x0 - 4, floor - 0.2, z0), point(x0, floor - 0.08, z0 + 20.5), '#4b4032', 14);
  box(p, point(x0 - 4, floor - 0.2, z0 + 30.5), point(x0, floor - 0.08, z1), '#4b4032', 14);
  if (shrubs) for (const [z, s] of [[z0 + 3, 1], [z0 + 8.5, 0.8], [z0 + 19, 1.1], [z0 + 33, 0.9], [z0 + 38.5, 1]]) shrub(p, x0 - 2, floor - 0.1, z, s);
}
/** The building across the pad (refs/163's background, 01): painted block, a darker base, high windows, doors, a fascia. */
function acrossPad(p: Bake) {
  const off: Vec3 = [-32, 0, 53];
  wingBox(p,[-130,0,0],[0,12,110],'#cdc7b6',10,off);
  wingBox(p,[-130,12,0],[0,13,110],'#6d665a',17,off);
  wingBox(p,[-130,13,0],[0,13.15,110],'#373b36',17,off);
  // Faces on its pad side (v = 0, facing the wing) and its downhill end (u = 0).
  const side = (u0: number, u1: number, y0: number, y1: number, color: string, solid: number, d = 0.03) => {
    const at = (u: number, y: number): Vec3 => {
      const [x, z] = carlsbadWingPoint(u, -d);
      return [x + off[0] * F, y * F, z + off[2] * F];
    };
    p.quad(at(u0, y0), at(u1, y0), at(u1, y1), at(u0, y1), [-WING_OUT[0], 0, -WING_OUT[2]], { color }, tag(solid));
  };
  const end = (v0: number, v1: number, y0: number, y1: number, color: string, solid: number, d = 0.03) => {
    const at = (v: number, y: number): Vec3 => {
      const [x, z] = carlsbadWingPoint(d, v);
      return [x + off[0] * F, y * F, z + off[2] * F];
    };
    p.quad(at(v0, y0), at(v1, y0), at(v1, y1), at(v0, y1), [WING_OUT[2], 0, -WING_OUT[0]], { color }, tag(solid));
  };
  side(-130, 0, 0, 1.2, '#9d978a', 10);
  end(0, 110, 0, 1.2, '#9d978a', 10);
  for (let u = -126; u < -4; u += 8) side(u, u + 5.5, 8.3, 10.6, '#2b302d', SURFACE.glass);
  for (let v = 6; v < 104; v += 8) end(v, v + 5.5, 8.3, 10.6, '#2b302d', SURFACE.glass);
  for (const u of [-36, -84]) {
    side(u - 0.2, u + 6.2, 0, 7.4, '#5c5f58', SURFACE.metal, 0.05);
    side(u, u + 2.95, 0, 7.2, '#3d4a43', SURFACE.metal, 0.07);
    side(u + 3.05, u + 6, 0, 7.2, '#3d4a43', SURFACE.metal, 0.07);
  }
  end(40, 46.4, 0, 7.4, '#5c5f58', SURFACE.metal, 0.05);
  end(40.2, 46.2, 0, 7.2, '#3d4a43', SURFACE.metal, 0.07);
}
function campusBuildings(p:Bake, shadows:ShadowBox[]) {
  for(const [x0,x1,z0,z1,shrubs] of [[31,71,18,108,1],[23,66,-170,-74,0]]) {
    portable(p,x0,x1,z0,z1,shrubs===1);
    const floor=carlsbadLanding(x0*F)/F;
    shadows.push({min:point(x0,floor,z0),max:point(x1,floor+9.75,z1)});
  }
  acrossPad(p);
  const yaw=CARLSBAD_WING_YAW*Math.PI/180, u=-32*Math.cos(yaw)+53*Math.sin(yaw),v=53*Math.cos(yaw)+32*Math.sin(yaw);
  shadows.push({min:point(u-130,0,v),max:point(u,13.15,v+110),yaw});
}
/** Safety-yellow nose paint, duller the more worn: `nose` 1 at the nosing, 0 at the band's back; step `i` from the top. */
function stairPaint(z: number, nose: number, i: number): string {
  const middle = Math.exp(-(((z - 10.5) / 3.2) ** 2));
  const wear = Math.min(1, 0.03 + 0.26 * middle + 0.16 * nose + 0.12 * valueNoise(z * 0.7, i * 3.1) + (i > 7 ? 0.05 : 0));
  return mixHex('#cea824', '#b9a457', wear);
}
/** A thin line drawn flat on the ground: dark down its middle, dirty either side, fading into the paint under it. */
function groundLine(p: Bake, pts: [number, number][], core: number, fringe: number, dark: string, dirty: string,
  under: (q: Vec3) => string, height: (x: number, z: number) => number) {
  const up: Vec3 = [0, 1, 0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], c = pts[i];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const across = [-(c[1] - a[1]) / l, (c[0] - a[0]) / l];
    const at = (q: [number, number], off: number): Vec3 => {
      const x = q[0] + across[0] * off, z = q[1] + across[1] * off;
      return [x, height(x, z) + 0.3, z];
    };
    const rows = [-core - fringe, -core, 0, core, core + fringe].map((off) => [at(a, off), at(c, off)]);
    const paints: Array<(q: Vec3) => string> = [under, () => dirty, () => dark, () => dirty, under];
    for (let k = 0; k < 4; k++) {
      const [l0, l1] = rows[k], [r0, r1] = rows[k + 1];
      const pl = paints[k], pr = paints[k + 1];
      p.quadCorners(l0, l1, r1, r0, up, [{ color: pl(l0) }, { color: pl(l1) }, { color: pr(r1) }, { color: pr(r0) }], tag(15));
    }
  }
}
/** A wandering crack from a to b (feet), jittered by value noise so no two read alike. */
function crackPath(a: [number, number], b: [number, number], steps: number, wander: number, seed: number): [number, number][] {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps, w = i === 0 || i === steps ? 0 : wander * (valueNoise(i * 0.9 + seed, seed * 1.7) - 0.5) * 2;
    return [(a[0] + (b[0] - a[0]) * t + n[0] * w) * F, (a[1] + (b[1] - a[1]) * t + n[1] * w) * F];
  });
}
/**
 * Small things that make the spot used: the documented crack before the lip and a few on the lower path,
 * the drain's stain on the wall and the path below it, buffed-out graffiti patches on the toe wall (refs/03),
 * and the round drain grate in the path beside the stair foot (refs/191).
 */
function weathering(p: Bake) {
  const pave = (q: Vec3) => pavingColor(q, [0, 1, 0], 'paved');
  // The crack across the pad a few feet before the lip (refs/REFERENCE_NOTES: Keen's replica account).
  groundLine(p, crackPath([-3.4, -7.2], [-3.9, 4.4], 16, 0.35, 11), 0.018 * F, 0.06 * F, '#5a574f', '#a29c8c', pave,
    (x, z) => carlsbadSurface(x, z));
  groundLine(p, crackPath([-3.6, -1.2], [-6.2, 1.6], 5, 0.25, 4), 0.012 * F, 0.04 * F, '#615e55', '#a7a191', pave,
    (x, z) => carlsbadSurface(x, z));
  // Hairline cracks across two lower-path slabs.
  for (const [a, b, seed] of [[[23.4, -6.3], [24.5, 3.5], 2], [[29.5, -9], [33.5, -3.5], 7]] as const)
    groundLine(p, crackPath([...a], [...b], 9, 0.4, seed), 0.012 * F, 0.05 * F, '#6a675e', '#a29c8c', pave, (x) => carlsbadLanding(x));
  // The toe wall's straight face, from the stair cheek to the corner, and its outward normal.
  const toe = (t: number, d = 0.012): [number, number] => [(12.2 + 0.8 * t) + 0.997 * d, 4.33 - 9.33 * t + 0.085 * d];
  const faceN: Vec3 = [0.995, 0, 0.0853];
  const wallAt = (x: number, y: number, z: number): Vec3 => [x * F, y * F, z * F];
  /** A wall's own paint part of the way up from its foot to its cap, as the bake blends it between those two rows. */
  const facePaint = (foot: Vec3, top: number, y: number, n: Vec3) => {
    const up = Math.min(1, Math.max(0, (y - foot[1]) / (top - foot[1])));
    return mixHex(pavingColor(foot, n, 'cap'), pavingColor([foot[0], top, foot[2]], n, 'cap'), up);
  };
  // The drain's stain: a dark streak down the wall below the mouth, and a wet-looking fan on the path.
  {
    const z = 3.73, x = carlsbadBankEnd(z * F) / F, floor = carlsbadLanding(x * F) / F, mouth = floor + 5 / 12 - 0.17;
    const col = (zz: number, y: number, k: number) =>
      ({ color: mixHex(facePaint(wallAt(x + 0.012, floor, zz), carlsbadToeTop(zz * F), y * F, faceN), '#6f6c62', k) });
    for (const side of [-1, 1]) {
      const zc = z, ze = z + side * 0.42;
      const pts = [wallAt(x + 0.012, floor, zc), wallAt(x + 0.012, floor, ze), wallAt(x + 0.012, mouth, ze), wallAt(x + 0.012, mouth, zc)];
      p.quadCorners(pts[0], pts[1], pts[2], pts[3], faceN, [col(zc, floor, 0.65), col(ze, floor, 0), col(ze, mouth, 0), col(zc, mouth, 0.5)], tag(15));
    }
    // Fan on the path: dark at the wall foot, spreading along the foot of the wall.
    const centre: Vec3 = [carlsbadBankEnd(z * F - 0.3 * F) + 0.02 * F, 0, z * F - 0.3 * F];
    const ring = (angle: number, k: number): Vec3 => {
      const px = centre[0] + Math.cos(angle) * 1.15 * F * k, pz = centre[2] + Math.sin(angle) * 2.4 * F * k;
      return [Math.max(px, carlsbadBankEnd(pz) + 0.02 * F), 0, pz];
    };
    const lift = (q: Vec3): Vec3 => [q[0], carlsbadLanding(q[0]) + 0.3, q[2]];
    const stain = (q: Vec3, k: number) => ({ color: mixHex(pave(q), '#7b776b', k) });
    for (let i = 0; i < 12; i++) {
      const a0 = -Math.PI / 2 + (i * Math.PI) / 12, a1 = -Math.PI / 2 + ((i + 1) * Math.PI) / 12;
      const wob = (a: number) => 0.8 + 0.35 * valueNoise(a * 3 + 1, 2);
      const m0 = lift(ring(a0, 0.5 * wob(a0))), m1 = lift(ring(a1, 0.5 * wob(a1)));
      const o0 = lift(ring(a0, wob(a0))), o1 = lift(ring(a1, wob(a1)));
      const c = lift(centre);
      p.vertex(c, [0, 1, 0], stain(c, 0.55), tag(15));
      p.vertex(m1, [0, 1, 0], stain(m1, 0.35), tag(15));
      p.vertex(m0, [0, 1, 0], stain(m0, 0.35), tag(15));
      p.quadCorners(m0, m1, o1, o0, [0, 1, 0], [stain(m0, 0.35), stain(m1, 0.35), stain(o1, 0), stain(o0, 0)], tag(15));
    }
  }
  // Buffed-out graffiti (refs/03): rectangles of pale paint rollered over a tag, a little uneven along
  // their edges and feathered into the wall, the older ones weathered back toward its grey. Each is built
  // in columns standing on the face (so a curved face keeps the patch on its surface), a hair proud of it.
  type FacePoint = (s: number, y: number) => { at: Vec3; n: Vec3; under: string };
  const FEATHER = 0.09;
  /** `s0`…`s1` feet along the face and `y0`…`y1` feet up it; `cover` is how much of the wall the paint hides. */
  const rolled = (face: FacePoint, s0: number, s1: number, y0: number, y1: number, color: string, cover: number, seed: number) => {
    const columns = Math.max(2, Math.round((s1 - s0) / 0.45));
    const along = [s0 - FEATHER, ...Array.from({ length: columns + 1 }, (_, i) => s0 + ((s1 - s0) * i) / columns), s1 + FEATHER];
    // The roller went a little further in some strokes than others.
    const uneven = (i: number, k: number) => 0.16 * (valueNoise(i * 1.3 + seed, k) - 0.5);
    const column = (i: number) => {
      const end = i === 0 || i === along.length - 1;
      const lo = Math.max(0.08, y0 + uneven(i, 3.1)), hi = y1 + uneven(i, 7.7);
      return [lo - FEATHER, lo, hi, hi + FEATHER].map((y, row) => {
        const q = face(along[i], y);
        return { at: q.at, n: q.n, paint: { color: mixHex(q.under, color, end || row === 0 || row === 3 ? 0 : cover) } };
      });
    };
    for (let i = 0; i < along.length - 1; i++) {
      const a = column(i), b = column(i + 1);
      for (let row = 0; row < 3; row++)
        p.quadCorners(a[row].at, b[row].at, b[row + 1].at, a[row + 1].at, a[row].n,
          [a[row].paint, b[row].paint, b[row + 1].paint, a[row + 1].paint], tag(15));
    }
  };
  // Along the straight face, in feet from the stair cheek (9.4 ft to the corner).
  const onToe = (proud: number): FacePoint => (s, y) => {
    const [x, z] = toe(s / 9.4, proud);
    const foot = wallAt(x, carlsbadLanding(x * F) / F, z);
    return { at: [foot[0], foot[1] + y * F, foot[2]], n: faceN, under: facePaint(foot, carlsbadToeTop(z * F), foot[1] + y * F, faceN) };
  };
  // One past the drain, rolled nearly the height of the wall and gone grey; one fresher past the middle,
  // over an older, wider pass (refs/03).
  rolled(onToe(0.012), 1.15, 2.55, 0.2, 1.62, '#c9c6bb', 0.6, 3);
  rolled(onToe(0.012), 4.3, 7.6, 0.3, 1.25, '#bdbaae', 0.45, 8);
  rolled(onToe(0.024), 5.9, 7.5, 0.42, 1.5, '#d6d3c9', 0.85, 5);
  const onCurb: FacePoint = (s, y) => {
    const q = carlsbadCurbSample(s * F);
    const x = q.point[0] - q.inward[0] * 0.012 * F, z = q.point[1] - q.inward[1] * 0.012 * F;
    const n: Vec3 = [-q.inward[0], 0, -q.inward[1]], foot: Vec3 = [x, carlsbadLanding(x), z];
    return { at: [x, foot[1] + y * F, z], n, under: facePaint(foot, carlsbadCurbTop(s * F), foot[1] + y * F, n) };
  };
  // And one round the lobe's face, mostly weathered away.
  rolled(onCurb, 4.2, 7.4, 0.3, 1.2, '#c4c1b6', 0.5, 12);
  // The drain grate in the path beside the stair foot: a round cast-iron disc with slots.
  {
    const cx = 14.4 * F, cz = 18.4 * F, r = 0.85 * F;
    const y = (x: number) => carlsbadLanding(x) + 0.3;
    const up: Vec3 = [0, 1, 0];
    for (let i = 0; i < 14; i++) {
      const a0 = (i / 14) * Math.PI * 2, a1 = ((i + 1) / 14) * Math.PI * 2;
      const e0: Vec3 = [cx + Math.cos(a0) * r, 0, cz + Math.sin(a0) * r], e1: Vec3 = [cx + Math.cos(a1) * r, 0, cz + Math.sin(a1) * r];
      e0[1] = y(e0[0]); e1[1] = y(e1[0]);
      p.triangle([cx, y(cx), cz], e1, e0, up, { color: '#4d4b45' }, tag(SURFACE.metal));
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), w = 0.035 * F;
      const at = (k: number, side: number): Vec3 => {
        const x = cx + ca * r * k - sa * w * side, z = cz + sa * r * k + ca * w * side;
        return [x, y(x) + 0.05, z];
      };
      p.quad(at(0.25, -1), at(0.8, -1), at(0.8, 1), at(0.25, 1), up, { color: '#22211e' }, tag(SURFACE.metal));
    }
  }
}
/**
 * Sawn and tooled slab joints as flat strips on the paving: a fine dark line with a little dirt either side,
 * fading into the concrete's own paint at its edges (the same surface and paint, so no seam shows).
 */
function joints(p: Bake) {
  const up: Vec3 = [0, 1, 0];
  const core = 0.03 * F, fringe = 0.06 * F, lift = 0.3;
  const onFlat = (x: number, z: number) =>
    carlsbadPaved(x, z) && (x <= carlsbadUpperEdge(z) || Math.abs(carlsbadSurface(x, z) - carlsbadLanding(x)) < 0.01 * F);
  for (const line of CARLSBAD_JOINTS) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], c = line[i];
      const length = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const count = Math.max(1, Math.ceil(length / (1.5 * F)));
      const across = [-(c[1] - a[1]) / length, (c[0] - a[0]) / length];
      // Every row of a sample takes the height under the joint's own line, so a strip ending beside a step
      // (the stair head's pedestal) stays flat rather than tilting up to it.
      const centre = (t: number) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t];
      const at = (t: number, off: number): Vec3 => {
        const [x0, z0] = centre(t);
        return [x0 + across[0] * off, carlsbadSurface(x0, z0) + lift, z0 + across[1] * off];
      };
      // Runs of samples on level paving (across the strip's whole width), thinned to where the paving's height
      // bends (the landing's ease).
      const level = (t: number) => {
        const [x0, z0] = centre(t), y0 = carlsbadSurface(x0, z0);
        return [-1, 0, 1].every((k) => {
          const x = x0 + across[0] * k * (core + fringe), z = z0 + across[1] * k * (core + fringe);
          return onFlat(x, z) && Math.abs(carlsbadSurface(x, z) - y0) < 0.01 * F;
        });
      };
      const runs: number[][] = [[]];
      for (let j = 0; j <= count; j++) {
        if (level(j / count)) runs[runs.length - 1].push(j / count);
        else if (runs[runs.length - 1].length) runs.push([]);
      }
      for (const run of runs) {
        const kept = run.filter((t, k) => {
          if (k === 0 || k === run.length - 1) return true;
          const y = at(t, 0)[1], y0 = at(run[k - 1], 0)[1], y1 = at(run[k + 1], 0)[1];
          return Math.abs(y - (y0 + y1) / 2) > 0.002 * F;
        });
        for (let j = 1; j < kept.length; j++) {
          const t0 = kept[j - 1], t1 = kept[j];
          const dark = { color: '#6e6b62' }, dirty = { color: '#a8a293' };
          const edge = (q: Vec3) => ({ color: pavingColor(q, up, 'paved') });
          // Darkest down its middle and graded out either side: a hard-edged hairline breaks into dots
          // wherever it is thinner than a pixel.
          const rows = [-core - fringe, -core, 0, core, core + fringe].map((off) => [at(t0, off), at(t1, off)]);
          const paints: Array<(q: Vec3) => { color: string }> = [edge, () => dirty, () => dark, () => dirty, edge];
          for (let k = 0; k < 4; k++) {
            const [l0, l1] = rows[k], [r0, r1] = rows[k + 1];
            const pl = paints[k], pr = paints[k + 1];
            p.quadCorners(l0, l1, r1, r0, up, [pl(l0), pl(l1), pr(r1), pr(r0)], tag(15));
          }
        }
      }
    }
  }
}
/**
 * Contact shade on the ground (the look's contact lines): along the toe wall's foot, round the lobe's curb
 * foot in short chords, and at every riser's foot down the stairs.
 */
function contactLines(): ContactLine[] {
  const foot = (x: number, z: number): Vec3 => [x, carlsbadLanding(x), z];
  const lines: ContactLine[] = [{ a: foot(12.2 * F, 4.33 * F), b: foot(13 * F, -5 * F), reach: 1.1 * F, strength: 0.34 }];
  const stops = [0, 9, 20, 32, 46, 62, 80];
  for (let i = 1; i < stops.length; i++) {
    const a = carlsbadCurbSample(stops[i - 1] * F).point, b = carlsbadCurbSample(stops[i] * F).point;
    lines.push({ a: foot(a[0], a[1]), b: foot(b[0], b[1]), reach: 1.0 * F, strength: 0.3 });
  }
  lines.push(stairContacts(0, 0, 5 * F, 16 * F, CARLSBAD_TREAD, CARLSBAD_RISER, 11, 0.55 * F, 0.3));
  return lines;
}
export function buildCarlsbadGeometry() {
  // Marks lying on the ground's faces are baked apart from the props: they are drawn as ground, shaded as it is.
  const ground = new Bake(),
    props = new Bake(),
    decals = new Bake();
  const railSegments: Segment[] = [],
    shadowBoxes: ShadowBox[] = [];
  terrain(ground);
  stairs(props, decals, railSegments);
  hallwayWing(props, shadowBoxes);
  const floor = carlsbadLanding(66 * F) / F;
  box(props, point(66, floor, -74), point(66.67, floor + 8, 18), '#aaa99f', 10);
  box(props, point(65.9, floor + 8, -74), point(66.77, floor + 8.25, 18), '#b9b8ac', 10);
  campusBuildings(props, shadowBoxes);
  // Triangular cheek-to-wall gusset, closed on both faces.
  const low = carlsbadCheekTop(11 * F) / F,
    high = carlsbadToeTop(4.33 * F) / F;
  for (const x of [11.53, 12.2]) {
    const a = point(x, low, 5),
      b = point(x, high, 4.33);
    triangle(props, point(x, low, 4.33), x < 12 ? a : b, x < 12 ? b : a, concrete, 15);
  }
  quad(
    props,
    point(11.53, high, 4.33),
    point(12.2, high, 4.33),
    point(12.2, low, 5),
    point(11.53, low, 5),
    concrete,
    15,
  );
  quad(
    props,
    point(11.53, low, 4.33),
    point(12.2, low, 4.33),
    point(12.2, high, 4.33),
    point(11.53, high, 4.33),
    concrete,
    15,
  );
  quad(props, point(11.53, low, 4.33), point(11.53, low, 5), point(12.2, low, 5), point(12.2, low, 4.33), concrete, 15);
  // Drain mouth recessed inside a short concrete collar, near the stair end.
  const z = 3.73,
    x = carlsbadBankEnd(z * F) / F,
    y = carlsbadLanding(x * F) / F + 5 / 12;
  tube(props, [point(x - 0.08, y, z), point(x + 0.012, y, z)], (1 / 6) * F, '#30332e', 15);
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI) / 10,
      b = ((i + 1) * Math.PI) / 10;
    const rim = (angle: number, radius: number, depth: number) =>
      point(x + depth, y + Math.sin(angle) * radius, z + Math.cos(angle) * radius);
    quad(props, rim(a, 0.21, 0.06), rim(b, 0.21, 0.06), rim(b, 1 / 6, 0.012), rim(a, 1 / 6, 0.012), concrete, 15);
  }
  joints(decals);
  weathering(decals);
  return {
    ground: ground.geometry(),
    props: props.geometry(),
    decals: decals.geometry(),
    railSegments,
    shadowBoxes,
    contacts: contactLines(),
  };
}
