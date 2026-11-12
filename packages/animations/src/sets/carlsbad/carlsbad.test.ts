import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z } from '../../board/board';
import { DEFAULT_SCENE_CAMERA, type TripodId } from '../../camera/camera';
import { ASPHALT, toThree } from '../../camera/view';
import { resolveSkateStyle } from '../../motion/style';
import { X0 } from '../../motion/trick';
import { LEAN_PAST_TOUCHDOWN } from '../../stage/bank';
import { planStage, stageFrame } from '../../stage/stage';
import { isFiniteFrame } from '../../testing';
import type { RiderStance, Stance } from '../../types';
import { SET_SCALE } from '../setScale';
import { setInfo, setTimeline } from '../sets';
import { Carlsbad3D } from './carlsbad3d';
import { buildCarlsbadGeometry } from './carlsbadGeometry';
import {
  CARLSBAD_DROP,
  CARLSBAD_FOOTPRINTS,
  CARLSBAD_FILMERS,
  carlsbadUpperEdge,
  CARLSBAD_WING_YAW,
  carlsbadWingPoint,
  carlsbadPolygonDistance,
  CARLSBAD_FOOT as F,
  CARLSBAD_LANE_Z,
  CARLSBAD_RISER,
  CARLSBAD_RUN,
  CARLSBAD_STAIR_Z0,
  CARLSBAD_STAIR_Z1,
  CARLSBAD_STEPS,
  CARLSBAD_TREAD,
  CARLSBAD_CURB,
  CARLSBAD_TOE,
  CARLSBAD_CURB_LENGTH,
  CARLSBAD_CAP_WIDTH,
  carlsbadCurbSample,
  carlsbadCurbTop,
  carlsbadCheekTop,
  carlsbadPaved,
  carlsbadToeTop,
  carlsbadCapBack,
  carlsbadBank,
  carlsbadUpperLawn,
  CARLSBAD_UPHILL_END,
  CARLSBAD_UPHILL_EASE,
  carlsbadBankEnd,
  carlsbadLanding,
  carlsbadLandingSlope,
  carlsbadSurface,
} from './carlsbadLayout';
const attempt = (riderStance: RiderStance = 'regular', stance: Stance = 'regular') =>
  planStage(
    { id: 'kickflip', name: 'Kickflip', base: 'Kickflip', stance },
    {
      set: 'carlsbad-gap',
      landed: true,
      riderStance,
      skater: 'realistic',
      style: resolveSkateStyle(),
      fall: 'slam',
      shankProgress: 0.65,
    },
  );
describe('Carlsbad: the original grass gap and uphill landing', () => {
  it('registers a gap beside eleven stairs with its own scaled terrain and stationary filmers', () => {
    const info = setInfo('carlsbad-gap');
    expect(info.terrain!.run).toBe(CARLSBAD_RUN * SET_SCALE);
    expect(info.terrain!.drop).toBe(CARLSBAD_DROP * SET_SCALE);
    expect(info.terrain!.laneZ).toBe(CARLSBAD_LANE_Z * SET_SCALE);
    expect(info.grinds).toBe(false);
    expect(info.rails).toBeNull();
    expect(info.tripods).toEqual(['bottom', 'side', 'top']);
    expect(CARLSBAD_STEPS).toBe(11);
    expect(CARLSBAD_STAIR_Z0).toBeGreaterThan(CARLSBAD_LANE_Z);
    const built = buildCarlsbadGeometry();
    try {
      const p = built.ground.getAttribute('position'),
        n = built.ground.getAttribute('normal');
      const risers = new Set<number>();
      for (let i = 0; i < p.count; i += 3) {
        if (n.getX(i) < 0.99 || Math.abs(n.getY(i)) > 1e-6) {
          continue;
        }
        if (
          [i, i + 1, i + 2].some((k) => p.getZ(k) < CARLSBAD_STAIR_Z0 - 0.01 || p.getZ(k) > CARLSBAD_STAIR_Z1 + 0.01)
        ) {
          continue;
        }
        const heights = [p.getY(i), p.getY(i + 1), p.getY(i + 2)];
        if (Math.abs(Math.max(...heights) - Math.min(...heights) - CARLSBAD_RISER) < 0.01) {
          risers.add(Math.round(p.getX(i) * 100));
        }
      }
      expect(risers.size).toBe(11);
    } finally {
      built.ground.dispose();
      built.props.dispose();
    }
  });
  it('draws the same walk, bank, curved toe, stairs and uphill pavement the rider and shadows use', () => {
    const built = buildCarlsbadGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const mesh = new Mesh(built.ground, material);
    const samples: [number, number][] = [
      [9.484273709 * F, 1.37 * F],
      [8.2 * F, -11.4 * F],
      [10.3 * F, -9.4 * F],
      [24.853901136 * F, -6.63 * F],
      [-0.2 * F, 0],
      [0.7 * F, 0],
      [5.1 * F, 0],
      [10.3 * F, 0],
      [CARLSBAD_RUN + 1.7 * F, 0],
      [CARLSBAD_RUN + 13.1 * F, -2.3 * F],
      [CARLSBAD_UPHILL_END + 3.7 * F, 0],
      [CARLSBAD_UPHILL_END + CARLSBAD_UPHILL_EASE + F, 0],
    ];
    for (const z of [-80, -50, -33, -25, -19, -10, -5, -4.3, -2.3, 3.3, 7.3].map((z) => z * F)) {
      const end = carlsbadBankEnd(z);
      samples.push([end - 1.7 * F, z], [end - 0.1 * F, z], [end + 0.2 * F, z]);
    }
    for (let s = F; s < CARLSBAD_CURB_LENGTH - F; s += 1.7 * F) {
      const q = carlsbadCurbSample(s);
      for (const d of [-0.1, 0.1, 1 / 3, 2 / 3 + 0.01, 1, 3, 6]) {
        samples.push([q.point[0] + q.inward[0] * d * F, q.point[1] + q.inward[1] * d * F]);
      }
    }
    // Offset-strip miters must not create long triangles across the bank foot.
    for (let z = -12.4; z < -5.4; z += 0.5) {
      for (let x = 6.2; x < 12; x += 1) samples.push([x * F, z * F]);
    }
    for (let i = 0; i < CARLSBAD_STEPS - 1; i++) {
      samples.push([(i + 0.37) * CARLSBAD_TREAD, (CARLSBAD_STAIR_Z0 + CARLSBAD_STAIR_Z1) / 2]);
    }
    try {
      for (const [x, z] of samples) {
        const hit = new Raycaster(new Vector3(x, 2 * F, z), new Vector3(0, -1, 0)).intersectObject(mesh)[0];
        const context = `surface at ${x / F}, ${z / F} ft`;
        expect(hit, context).toBeDefined();
        expect(Math.abs(hit.point.y - carlsbadSurface(x, z)), context).toBeLessThan(0.04 * F);
      }
    } finally {
      material.dispose();
      built.ground.dispose();
      built.props.dispose();
    }
  });
  it('stretches no ground triangle off the surface it is sampled from, in sight of the gap', () => {
    const built = buildCarlsbadGeometry();
    const at = built.ground.getAttribute('position').array;
    let worst = 0,
      where = '';
    for (let t = 0; t + 8 < at.length; t += 9) {
      const v = [0, 3, 6].map((k) => [at[t + k], at[t + k + 1], at[t + k + 2]]);
      if (v.some((p) => p[0] < -70 * F || p[0] > 60 * F || p[2] < -75 * F || p[2] > 70 * F)) continue;
      // Risers and wall faces stand on a jump in the surface: only triangles with ground under them count.
      const area = Math.abs((v[1][0] - v[0][0]) * (v[2][2] - v[0][2]) - (v[2][0] - v[0][0]) * (v[1][2] - v[0][2])) / 2;
      if (area < 0.3 * F * F) continue;
      for (const w of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]]) {
        const p = [0, 1, 2].map((j) => w[0] * v[0][j] + w[1] * v[1][j] + w[2] * v[2][j]);
        const off = Math.abs(p[1] - carlsbadSurface(p[0], p[2])) / F;
        if (off > worst) {
          worst = off;
          where = `${(p[0] / F).toFixed(1)}, ${(p[2] / F).toFixed(1)} ft`;
        }
      }
    }
    built.ground.dispose();
    built.props.dispose();
    // The stair-head blocks once ran out as five-inch wedges the length of the pad.
    expect(worst, `ground off its surface at ${where}`).toBeLessThan(0.15);
  });
  it('follows the straight toe and rounded lobe plan and keeps the rollout paved', () => {
    for (const [x, z] of [...CARLSBAD_TOE, ...CARLSBAD_CURB]) {
      expect(carlsbadBankEnd(z)).toBeCloseTo(x, 5);
    }
    expect(carlsbadBankEnd(-33 * F) / F).toBeCloseTo(45);
    for (let x = 13.1; x <= 35; x += 0.25) {
      expect(carlsbadPaved(x * F, 0), String(x)).toBe(true);
    }
    for (let i = 0; i < 11; i++) {
      expect(carlsbadCheekTop(i * CARLSBAD_TREAD) + i * CARLSBAD_RISER).toBeCloseTo((5 / 12) * F);
    }
    expect(carlsbadLanding(CARLSBAD_RUN + 12 * F)).toBeGreaterThan(carlsbadLanding(CARLSBAD_RUN));
    expect(carlsbadLandingSlope(CARLSBAD_RUN + F)).toBeGreaterThan(0);
    expect(carlsbadLandingSlope(CARLSBAD_UPHILL_END + CARLSBAD_UPHILL_EASE)).toBe(0);
  });
  it('matches the raised wall, flat eight-inch cap, shoulder and west lawn', () => {
    for (const [z, height] of [
      [4.33, 2],
      [-5, 1.9],
      [-19, 1.1],
      [-50, 1.1],
    ]) {
      expect((carlsbadToeTop(z * F) - carlsbadLanding(carlsbadBankEnd(z * F))) / F).toBeCloseTo(height, 4);
    }
    expect(CARLSBAD_TOE[1]).toEqual([13 * F, -5 * F]);
    expect((carlsbadBankEnd(0) - carlsbadCapBack(0)) / F).toBeCloseTo(2 / 3, 6);
    for (const z of [0]) {
      const back = carlsbadCapBack(z * F),
        end = carlsbadBankEnd(z * F);
      expect(carlsbadSurface((back + end) / 2, z * F)).toBeCloseTo(carlsbadToeTop(z * F), 6);
      expect(carlsbadBank(back, z * F)).toBeCloseTo(carlsbadToeTop(z * F), 6);
    }
    expect(carlsbadBank(7 * F, 0) - carlsbadBank(5 * F, 0)).toBeCloseTo(
      carlsbadBank(9 * F, 0) - carlsbadBank(7 * F, 0),
      6,
    );
    expect(carlsbadUpperLawn(-10 * F, 3.1 * F)).toBe(false);
    expect(carlsbadUpperLawn(-14.9 * F, 3.1 * F)).toBe(false);
    expect(carlsbadUpperLawn(-14.9 * F, 8 * F)).toBe(false);
    expect(carlsbadUpperLawn(-7 * F, 21.5 * F)).toBe(true);
    for (let x = -22; x <= 0; x += 0.25) {
      expect(carlsbadPaved(x * F, 0)).toBe(true);
    }
  });
  it('keeps the curb level across its width and the grass flush along its back', () => {
    for (let s = F; s < CARLSBAD_CURB_LENGTH - F; s += 0.7 * F) {
      const q = carlsbadCurbSample(s),
        top = carlsbadCurbTop(s);
      for (const d of [0.05 * F, CARLSBAD_CAP_WIDTH / 2, CARLSBAD_CAP_WIDTH]) {
        const x = q.point[0] + q.inward[0] * d,
          z = q.point[1] + q.inward[1] * d;
        expect(Math.abs(carlsbadSurface(x, z) - top), `cap ${s / F}/${d / F}`).toBeLessThan(0.004 * F);
      }
      const d = CARLSBAD_CAP_WIDTH + 0.001 * F;
      expect(
        Math.abs(carlsbadBank(q.point[0] + q.inward[0] * d, q.point[1] + q.inward[1] * d) - top),
        `grass ${s / F}`,
      ).toBeLessThan(0.004 * F);
    }
  });
  it('has no grass slope jump across the wall-tip row', () => {
    const e = 0.001 * F;
    for (let x = 0; x <= 11.5; x += 0.25) {
      const h = carlsbadSurface(x * F, -5 * F);
      const before = (h - carlsbadSurface(x * F, -5 * F - e)) / e;
      const after = (carlsbadSurface(x * F, -5 * F + e) - h) / e;
      expect(Math.abs(before - after), String(x)).toBeLessThan(0.01);
    }
  });
  it('bakes concrete curb tops and recessed facade openings on the intended planes', () => {
    const built = buildCarlsbadGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const ground = new Mesh(built.ground, material),
      props = new Mesh(built.props, material);
    try {
      for (const z of [0, -10, -19, -33, -50]) {
        const x = (carlsbadCapBack(z * F) + carlsbadBankEnd(z * F)) / 2;
        const hit = new Raycaster(new Vector3(x, 2 * F, z * F), new Vector3(0, -1, 0)).intersectObject(ground)[0];
        expect(hit).toBeDefined();
        expect(Math.abs(hit.point.y - carlsbadToeTop(z * F))).toBeLessThan(0.04 * F);
        const packed = built.ground.getAttribute('aInfo').getW(hit.face!.a);
        expect(Math.floor((packed * 255) / 4 + 0.01)).toBe(15);
      }
      const yaw=CARLSBAD_WING_YAW*Math.PI/180;
      for (const [u,y,v,solid] of [[3.3,3,-16.88,18],[-12.3,3,-16.88,18],[8,5,-16.88,23],[8,2,-16.7,17]]) {
        const [x,z]=carlsbadWingPoint(u,-14);
        const hit=new Raycaster(new Vector3(x,y*F,z),new Vector3(Math.sin(yaw),0,-Math.cos(yaw))).intersectObject(props)[0];
        expect((hit.point.z*Math.cos(yaw)-hit.point.x*Math.sin(yaw))/F).toBeCloseTo(v,4);
        expect(Math.floor((built.props.getAttribute('aInfo').getW(hit.face!.a)*255)/4+0.01)).toBe(solid);
      }
      const [x,z]=carlsbadWingPoint(0,-8);
      const soffit=new Raycaster(new Vector3(x,7.8*F,z),new Vector3(0,1,0)).intersectObject(props)[0];
      expect(soffit.point.y/F).toBeGreaterThanOrEqual(8.05);
      expect(soffit.point.y/F).toBeLessThan(8.5);
    } finally {
      built.ground.dispose();
      built.props.dispose();
      material.dispose();
    }
  });
  it('has no open ground edges inside the playable area, including the old minus-25-foot seam', () => {
    const built = buildCarlsbadGeometry(),
      p = built.ground.getAttribute('position');
    try {
      const edges = new Map<
        string,
        {
          count: number;
          a: number[];
          b: number[];
        }
      >();
      const key = (v: number[]) => v.map((q) => Math.round(q * 1000)).join(',');
      for (let i = 0; i < p.count; i += 3) {
        const pts = [0, 1, 2].map((j) => [p.getX(i + j), p.getY(i + j), p.getZ(i + j)]);
        const keys = pts.map(key);
        if (new Set(keys).size < 3) {
          continue;
        }
        for (let j = 0; j < 3; j++) {
          const k = (j + 1) % 3,
            id = [keys[j], keys[k]].sort().join('/');
          const e = edges.get(id);
          if (e) {
            e.count++;
          } else {
            edges.set(id, { count: 1, a: pts[j], b: pts[k] });
          }
        }
      }
      const open = [...edges.values()].filter(
        (e) => e.count === 1 && [e.a, e.b].every((p) => Math.abs(p[0]) < 70 * F && p[2] > -100 * F && p[2] < 65 * F),
      );
      expect(open.slice(0, 5)).toEqual([]);
    } finally {
      built.ground.dispose();
      built.props.dispose();
    }
  });
  it('settles both trucks onto the uphill landing and loses speed rolling away in every stance', () => {
    for (const rider of ['regular', 'goofy'] as const) {
      for (const stance of ['regular', 'fakie', 'switch', 'nollie'] as const) {
        const plan = attempt(rider, stance);
        const timeline = setTimeline('carlsbad-gap', plan.style, true, 'stairs', stance, 'Kickflip');
        expect(plan.stairs!.land).toBe(timeline.land);
        expect(plan.end).toBe(timeline.end);
        const land = plan.stairs!.land;
        const touchdown = stageFrame(plan, land, 1);
        expect(touchdown.scroll).toBeCloseTo((CARLSBAD_RUN + 3 * F) * SET_SCALE);
        expect(touchdown.stairs!.across).toBe(CARLSBAD_LANE_Z * SET_SCALE);
        for (const t of [land + LEAN_PAST_TOUCHDOWN + 0.06, plan.end]) {
          const frame = stageFrame(plan, t, 1);
          expect(isFiniteFrame(frame)).toBe(true);
          const axis = frame.rig.board.dir({ x: 1, y: 0, z: 0 });
          expect(axis.y / axis.x).toBeCloseTo(-carlsbadLandingSlope(frame.scroll / SET_SCALE), 3);
          for (const x of [-WHEEL_X, WHEEL_X]) {
            for (const z of [-WHEEL_Z, WHEEL_Z]) {
              const wheel = frame.rig.board.point({
                x,
                y: WHEEL_Y + WHEEL_R,
                z,
              });
              const floor =
                carlsbadSurface(
                  (frame.scroll + wheel.x - X0) / SET_SCALE,
                  (frame.stairs!.across + wheel.z) / SET_SCALE,
                ) * SET_SCALE;
              expect(Math.abs(ASPHALT - wheel.y - floor), `${stance}/${rider} wheel at ${t}`).toBeLessThan(0.5);
            }
          }
        }
        const earlyDistance = stageFrame(plan, land + 0.3, 1).scroll - stageFrame(plan, land + 0.2, 1).scroll;
        const laterDistance = stageFrame(plan, land + 0.6, 1).scroll - stageFrame(plan, land + 0.5, 1).scroll;
        expect(earlyDistance).toBeGreaterThan(laterDistance);
        expect(laterDistance).toBeGreaterThan(0);
      }
    }
  });
  it('pins the riding surface from round 3', () => {
    const xs=[-40,-1,0,0.7,2.5,5,10,12,13,20,45,50,60];
    const rows=[
      [-3,[0,0,0,-0.040610033569814845,-0.46305901345043055,-1.3678168870015839,-3.1773326341038906,-3.901138932944813,-5.87,-5.415,-3.79,-3.54625,-3.465]],
      [0,[0,0,0,-0.0451764987811804,-0.4793678177767361,-1.400434495654195,-3.2425678514091123,-3.9442765273311893,-5.87,-5.415,-3.79,-3.54625,-3.465]],
      [3,[0,0,0,-0.06692083162092248,-0.7617075319331597,-1.8676793362887507,-4.079622944999933,-3.928842443729904,-5.87,-5.415,-3.79,-3.54625,-3.465]],
      [5,[0,0,0,-0.5454545454545454,-1.6363636363636362,-2.7272727272727275,-5.454545454545455,-5.935,-5.87,-5.415,-3.79,-3.54625,-3.465]],
    ] as const;
    for(const [z,heights] of rows) xs.forEach((x,i)=>expect(carlsbadSurface(x*F,z*F)/F).toBeCloseTo(heights[i],10));
  });
  it('places the facade at 28.5 degrees through (0,-19) and keeps the curb seven feet clear of roofs',()=>{
    for(const u of [-140,0,40.1]) {
      const [x,z]=carlsbadWingPoint(u,-16.7);
      expect(z/F+19+Math.tan(28.5*Math.PI/180)*x/F).toBeCloseTo(0,2);
    }
    for(let s=0;s<CARLSBAD_CURB_LENGTH;s+=0.1*F) {
      const q=carlsbadCurbSample(s);
      for(const {name,roof} of CARLSBAD_FOOTPRINTS)
        expect(carlsbadPolygonDistance(...q.point,roof)/F,name).toBeGreaterThanOrEqual(7);
    }
  });
  it('keeps the curved approach flat, paved and clear below 7.5 feet',()=>{
    const built=buildCarlsbadGeometry(), material=new MeshBasicMaterial({side:DoubleSide});
    const mesh=new Mesh(built.props,material);
    try {
      for(const [x,z,heading] of [[-38.6,9.4,-28.5],[-35.1,7.5,-28.5],[-29.4,4.4,-28.5],[-24.5,1.9,-22],[-21.1,0.8,-14],[-17.7,0.2,-6],[-12.2,0,0],[-0.7,0,0]]) {
        const h=heading*Math.PI/180;
        for(let d=-3;d<=3;d+=0.5) {
          const px=(x-Math.sin(h)*d)*F,pz=(z+Math.cos(h)*d)*F;
          expect(carlsbadSurface(px,pz)).toBe(0);
          expect(carlsbadPaved(px,pz)).toBe(true);
          expect(new Raycaster(new Vector3(px,0.05*F,pz),new Vector3(0,1,0),0,7.45*F).intersectObject(mesh)).toEqual([]);
        }
      }
    } finally {built.ground.dispose();built.props.dispose();material.dispose();}
  });
  it('stands beside the hallway on the bank and on the west lawn', () => {
    const {side,top,bottom}=CARLSBAD_FILMERS.stairs!.stands;
    expect(side.u).toBeGreaterThan(carlsbadUpperEdge(side.z));
    expect(carlsbadSurface(side.u,side.z)).toBeLessThan(0);
    expect(carlsbadUpperLawn(top.u,top.z)).toBe(true);
    for(const {roof} of CARLSBAD_FOOTPRINTS) expect(carlsbadPolygonDistance(bottom.u,bottom.z,roof)/F).toBeGreaterThanOrEqual(4);
  });
  it('paints each stair nose yellow: the riser nearly to its foot and five inches of tread behind it', () => {
    // refs/03, 163 and 02 from the landing (bands of yellow), 191 from the stair head (stripes as wide as the gaps).
    const built = buildCarlsbadGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const marks = new Mesh(built.decals, material), color = built.decals.getAttribute('aColor');
    const yellow = (ray: Raycaster) => {
      const hit = ray.intersectObject(marks)[0];
      if (!hit) return false;
      const i = hit.face!.a, blue = color.getZ(i);
      return color.getX(i) > 1.4 * blue && color.getY(i) > 1.25 * blue;
    };
    try {
      for (let i = 0; i < CARLSBAD_STEPS; i++) {
        const x = i * CARLSBAD_TREAD, y = -i * CARLSBAD_RISER;
        for (const z of [5.5, 10.5, 15.5]) {
          const riser = (down: number) => new Raycaster(new Vector3(x + 0.5 * F, y - down * CARLSBAD_RISER, z * F), new Vector3(-1, 0, 0), 0, F);
          for (const down of [0.05, 0.5, 0.88]) expect(yellow(riser(down)), `riser ${i}`).toBe(true);
          expect(yellow(riser(0.97)), `riser ${i} foot`).toBe(false);
          const tread = (back: number) => new Raycaster(new Vector3(x - back * F, y + 0.5 * F, z * F), new Vector3(0, -1, 0), 0, F);
          for (const back of [0.05, 0.4]) expect(yellow(tread(back)), `tread ${i}`).toBe(true);
          expect(yellow(tread(0.55)), `tread ${i} back`).toBe(false);
        }
      }
    } finally {
      built.ground.dispose();
      built.props.dispose();
      built.decals.dispose();
      material.dispose();
    }
  });
  it('lays its ground marks a hair proud of the paving they are drawn on, apart from the props', () => {
    const built = buildCarlsbadGeometry();
    try {
      const p = built.decals.getAttribute('position'), n = built.decals.getAttribute('normal');
      let flat = 0;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        // Level marks only, off the stairs (whose paint lies on treads the surface steps down between).
        const stairs = x > -F && x < 12 * F && z > CARLSBAD_STAIR_Z0 - F && z < CARLSBAD_STAIR_Z1 + F;
        if (n.getY(i) < 0.9 || stairs) continue;
        const lift = (p.getY(i) - carlsbadSurface(x, z)) / F;
        expect(lift, `${(x / F).toFixed(2)}, ${(z / F).toFixed(2)}`).toBeGreaterThan(0);
        expect(lift, `${(x / F).toFixed(2)}, ${(z / F).toFixed(2)}`).toBeLessThan(0.025);
        flat++;
      }
      expect(flat).toBeGreaterThan(1000);
      const [ground, , marks] = new Carlsbad3D().terrain();
      expect(marks.material).toBe(ground.material);
    } finally {
      built.ground.dispose();
      built.props.dispose();
      built.decals.dispose();
    }
  });
  it('keeps all baked geometry finite and below the mobile vertex and shadow budgets', () => {
    const built = buildCarlsbadGeometry();
    try {
      let vertices = 0;
      for (const geometry of [built.ground, built.props, built.decals]) {
        vertices += geometry.getAttribute('position').count;
        for (const name of ['position', 'normal', 'aColor', 'aCorner']) {
          expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite), name).toBe(true);
        }
      }
      expect(vertices).toBeLessThan(100000);
      expect(built.railSegments.length).toBeLessThanOrEqual(48);
      expect(built.shadowBoxes.length).toBeLessThanOrEqual(12);
    } finally {
      built.ground.dispose();
      built.props.dispose();
      built.decals.dispose();
    }
  });
  it('keeps the side and top filmer sightlines to the landing wheels clear of the grass lobe', () => {
    const spot = new Carlsbad3D(),
      built = buildCarlsbadGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const meshes = [new Mesh(built.ground, material), new Mesh(built.props, material)];
    try {
      for (const rider of ['regular', 'goofy'] as const) {
        const plan = attempt(rider);
        for (const tripod of ['side', 'top'] as const) {
          for (const aspect of [1.24, 390 / 640]) {
            const frame = stageFrame(plan, plan.stairs!.land + 0.1, 1);
            const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, aspect, tripod)!;
            const offset = new Vector3(frame.scroll, 0, frame.stairs!.across);
            const eye = new Vector3(...view.eye).add(offset).divideScalar(SET_SCALE);
            for (const wheel of [-WHEEL_X, WHEEL_X]) {
              const point = frame.rig.board.point({
                x: wheel,
                y: WHEEL_Y + WHEEL_R,
                z: WHEEL_Z,
              });
              const target = new Vector3(...toThree(point)).add(offset).divideScalar(SET_SCALE);
              const direction = target.sub(eye);
              const ray = new Raycaster(eye, direction.clone().normalize(), 0.1, direction.length() - 0.1);
              expect(ray.intersectObjects(meshes), rider).toEqual([]);
            }
          }
        }
      }
    } finally {
      spot.dispose();
      built.ground.dispose();
      built.props.dispose();
      material.dispose();
    }
  });

  it('films both rider stances from above the terrain with the rider and board inside the frame', () => {
    const spot = new Carlsbad3D();
    const failures = new Map<string, string>();
    try {
      for (const rider of ['regular', 'goofy'] as const) {
        const plan = attempt(rider);
        for (const tripod of [null, 'bottom', 'side', 'top'] as (TripodId | null)[]) {
          for (const aspect of [1.24, 390 / 640]) {
            for (let t = 0; t <= plan.end; t += 1 / 15) {
              const frame = stageFrame(plan, t, 1);
              const view = spot.view(frame, DEFAULT_SCENE_CAMERA, 1, aspect, tripod)!;
              const x = (view.eye[0] + frame.scroll) / SET_SCALE;
              const z = (view.eye[2] + frame.stairs!.across) / SET_SCALE;
              expect(view.eye.every(Number.isFinite)).toBe(true);
              expect(view.eye[1] / SET_SCALE, `${tripod}/${rider} camera at ${t}`).toBeGreaterThan(
                carlsbadSurface(x, z),
              );
              const points = [frame.rig.head.at(0, -30, 0)];
              for (const wheel of [-WHEEL_X, WHEEL_X]) {
                points.push(
                  frame.rig.board.point({
                    x: wheel,
                    y: WHEEL_Y + WHEEL_R,
                    z: WHEEL_Z,
                  }),
                );
              }
              for (const point of points) {
                const p = view.cam.project(point);
                const shot = `${tripod}/${aspect}/${rider}`;
                const outside =
                  p.x <= view.box.x ||
                  p.x >= view.box.x + view.box.width ||
                  p.y <= view.box.y ||
                  p.y >= view.box.y + view.box.height;
                if (outside && !failures.has(shot)) {
                  failures.set(
                    shot,
                    `at ${t.toFixed(2)}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}) outside ${JSON.stringify(view.box)}`,
                  );
                }
              }
            }
          }
        }
      }
      expect(Array.from(failures)).toEqual([]);
    } finally {
      spot.dispose();
    }
  });
});
