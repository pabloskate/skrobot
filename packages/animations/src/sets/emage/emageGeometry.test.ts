import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { MAX_CANOPIES, MAX_CONTACTS, SURFACE, WALL } from '../surfaces';
import { WEED_LIMIT_Z, buildEmageGeometry } from './emageGeometry';
import { EMAGE_LOOK } from './emage3d';
import {
  EMAGE_BANK_TOP, EMAGE_DROP, EMAGE_EDGE_Z, EMAGE_FOOT as F, EMAGE_PATH_END, EMAGE_RUN, EMAGE_STAIR_Z0,
  EMAGE_WATER_EDGE, EMAGE_WATER_Y, emageBank,
} from './emageLayout';
import { BRUSH_YELLOW } from './emagePalette';
import { Bake } from '../../three/bake';
import { buildApartments, buildBridge, bridgePoint } from './emageBuildings';
import { FILMER_LOW_Z, buildPlanting, emageTrees } from './emageTrees';

const geometries = (built: ReturnType<typeof buildEmageGeometry>) => [built.ground, built.props, built.decals, built.wireMesh.geometry];

describe('Emage realistic groundwork', () => {
  it('keeps room for later dressing within every shader and geometry budget', () => {
    const built = buildEmageGeometry();
    try {
      expect(geometries(built).reduce((sum, g) => sum + g.getAttribute('position').count, 0)).toBeLessThan(100_000);
      expect(built.railSegments.length).toBeLessThanOrEqual(48);
      expect(built.shadowBoxes.length).toBeLessThanOrEqual(12);
      expect(built.contacts.length).toBeLessThanOrEqual(MAX_CONTACTS);
      expect(built.canopies.length).toBeLessThanOrEqual(MAX_CANOPIES);
      expect(built.shadowBoxes).toHaveLength(7); // Three deck sections and four apartment wings.
      // Lane feet (2), every riser's foot, the curbs' backs, the outer wall (2), the tiers' ends, two buildings.
      expect(built.contacts).toHaveLength(9);
      expect(built.canopies.length).toBeGreaterThan(0);
      expect(EMAGE_LOOK.light).toBe('shader');
      // Emage's own dressing: wall wear, gravel aggregate, panelled plaza, urethane marks. Nothing it doesn't name.
      for (const key of ['marks', 'pavers', 'walls', 'asphalt'] as const) expect(EMAGE_LOOK[key]).toBeDefined();
      for (const key of ['stairs', 'sash', 'lockers', 'brick', 'gum', 'mortar'] as const) expect(EMAGE_LOOK[key]).toBeUndefined();
      const solids = Array.from(built.ground.getAttribute('aInfo').array).filter((_, i) => i % 4 === 3).map(v => Math.floor(Math.round(v * 255) / 4));
      for (const surface of ['concrete', 'soil', 'grass', 'asphalt', 'pavers', 'stucco'] as const) expect(solids, surface).toContain(SURFACE[surface]);
    } finally { geometries(built).forEach(g => g.dispose()); }
  });

  it('lays every level decal just proud of the ground under it, or of the river below the weir', () => {
    const built = buildEmageGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const ground = new Mesh(built.ground, material), props = new Mesh(built.props, material);
    try {
      const position = built.decals.getAttribute('position');
      let checked = 0, foam = 0;
      for (let i = 0; i < position.count; i += 3) {
        const [x, y, z] = [0, 1, 2].map(axis => [0, 1, 2].reduce((sum, k) => sum + position.getComponent(i + k, axis), 0) / 3);
        const where = `decal at ${x / F}, ${z / F} ft`;
        const hit = new Raycaster(new Vector3(x, y + F, z), new Vector3(0, -1, 0)).intersectObject(ground)[0];
        if (x > EMAGE_WATER_EDGE) {
          // Foam on the river: on the running water, and never under the pool held up behind the weir.
          expect(y - EMAGE_WATER_Y, where).toBeGreaterThan(0.2);
          expect(y - EMAGE_WATER_Y, where).toBeLessThan(0.6);
          const over = new Raycaster(new Vector3(x, y + 2 * F, z), new Vector3(0, -1, 0), 0, 2 * F - 0.1).intersectObject(props);
          expect(over.some(h => Math.abs(h.point.y - EMAGE_WATER_Y - 1.5 * F) < 0.01), where).toBe(false);
          foam++;
        } else {
          const lift = y - (hit?.point.y ?? Infinity);
          expect(lift, where).toBeGreaterThan(0.2);
          expect(lift, where).toBeLessThan(0.6);
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(300);
      expect(foam).toBeGreaterThan(100);
    } finally { material.dispose(); geometries(built).forEach(g => g.dispose()); }
  });

  it('keeps every decal on one level, never across a step, into a wall or under a shrub', () => {
    const built = buildEmageGeometry();
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const ground = new Mesh(built.ground, material);
    const masses = buildPlanting(new Bake());
    try {
      const position = built.decals.getAttribute('position');
      for (let i = 0; i < position.count; i += 3) {
        const corners = [0, 1, 2].map(k => new Vector3().fromBufferAttribute(position, i + k));
        const middle = corners.reduce((sum, c) => sum.add(c), new Vector3()).divideScalar(3);
        const where = `decal at ${middle.x / F}, ${middle.z / F} ft`;
        if (middle.x > EMAGE_WATER_EDGE) continue;
        // Every corner, a hair in from its edge, lies over the same ground as the middle: no decal hangs over a
        // riser's edge or runs into the face of a wall.
        const under = new Raycaster(new Vector3(middle.x, middle.y + F, middle.z), new Vector3(0, -1, 0)).intersectObject(ground)[0].point.y;
        for (const corner of corners) {
          const p = corner.clone().lerp(middle, 0.1);
          const hit = new Raycaster(new Vector3(p.x, p.y + F, p.z), new Vector3(0, -1, 0)).intersectObject(ground)[0];
          expect(hit, where).toBeDefined();
          expect(Math.abs(hit.point.y - under), where).toBeLessThan(0.2);
        }
        // And none is hidden under a planted mass.
        for (const m of masses) {
          const d = ((middle.x - m.x) / m.rx) ** 2 + ((middle.y - m.y) / m.ry) ** 2 + ((middle.z - m.z) / m.rz) ** 2;
          expect(d, where).toBeGreaterThan(1);
        }
      }
    } finally { material.dispose(); geometries(built).forEach(g => g.dispose()); }
  });

  it('weathers the risers, curbs and stones per pixel, never in baked tones', () => {
    const built = buildEmageGeometry();
    try {
      const band = built.ground.getAttribute('aBand'), position = built.ground.getAttribute('position'), color = built.ground.getAttribute('aColor');
      const normal = built.ground.getAttribute('normal'), corner = built.ground.getAttribute('aCorner');
      let risers = 0;
      for (let v = 0; v < position.count; v += 6) {
        const x = (position.getX(v) + position.getX(v + 1) + position.getX(v + 2)) / 3, z = (position.getZ(v) + position.getZ(v + 1) + position.getZ(v + 2)) / 3;
        // The tall risers facing down the stairs, on the terrace side of the stones.
        const upright = Math.abs(normal.getX(v) - 1) < 1e-6;
        if (!upright || x < 0 || x > EMAGE_RUN || z > EMAGE_STAIR_Z0 - 0.5 * F || z < -37 * F) continue;
        risers++;
        // Each carries the look's wall wear, as cast concrete, knowing where it is on its wall.
        for (let k = 0; k < 6; k++) {
          expect(band.getX(v + k)).toBe(WALL.cast);
          expect(corner.getY(v + k) + corner.getZ(v + k)).toBeGreaterThan(0);
        }
        // One flat paint across each face: its wear is the shader's, not a gradient in its vertices.
        for (let k = 1; k < 6; k++) for (const c of [0, 1, 2]) expect(color.getComponent(v + k, c)).toBe(color.getComponent(v, c));
      }
      expect(risers).toBeGreaterThanOrEqual(20);
    } finally { geometries(built).forEach(g => g.dispose()); }
  });

  it('keeps weeds, grass and shrubs off the lane, eight feet clear of it on the terraces, and out of the run-out', () => {
    const built = buildEmageGeometry();
    try {
      const position = built.props.getAttribute('position'), info = built.props.getAttribute('aInfo');
      let leaves = 0;
      for (let v = 0; v < position.count; v++) {
        if (Math.floor(Math.round(info.getW(v) * 255) / 4) !== 13) continue;
        leaves++;
        const x = position.getX(v) / F, z = position.getZ(v) / F, where = `leaves at ${x.toFixed(1)}, ${z.toFixed(1)} ft`;
        // On the stairs and terraces, nothing between the bank-side edge and eight feet inland of the lane.
        if (x > 0 && x < EMAGE_RUN / F) expect(z > WEED_LIMIT_Z / F && z < EMAGE_EDGE_Z / F, where).toBe(false);
        // Nothing on the plaza run-up, the rail's roll-in, or the apron ahead of the stairs.
        expect(x > -80 && x < 0 && Math.abs(z) < 6, where).toBe(false);
        expect(x > -30 && x < -0.3 && z > 0 && z < 8, where).toBe(false);
        expect(x > EMAGE_RUN / F && x < EMAGE_BANK_TOP / F && Math.abs(z) < 10, where).toBe(false);
      }
      expect(leaves).toBeGreaterThan(10_000);
    } finally { geometries(built).forEach(g => g.dispose()); }
  });

  it('keeps the thicket, and its one yellowing shrub, low in front of the side filmer', () => {
    const masses = buildPlanting(new Bake());
    const front = masses.filter(m => m.x + m.rx > 0 && m.x - m.rx < 30 * F && m.z - m.rz < FILMER_LOW_Z && m.z + m.rz > EMAGE_EDGE_Z);
    expect(front.length).toBeGreaterThan(40);
    for (const m of front) expect(m.y + m.ry - emageBank(m.x), `mass at ${m.x / F}, ${m.z / F}`).toBeLessThan(2.5 * F);
    const yellow = masses.filter(m => m.color === BRUSH_YELLOW);
    expect(yellow).toHaveLength(1);
    expect(front).toContain(yellow[0]);
  });

  it('keeps every tree trunk clear of the lane, both rail roll-ins and the trail', () => {
    for (const { at: [x, y, z] } of emageTrees()) {
      expect(x > -35 * F && x < EMAGE_RUN && Math.abs(z) < 6 * F).toBe(false);
      expect(x >= EMAGE_RUN && x <= EMAGE_PATH_END).toBe(false);
      if (x > EMAGE_RUN && x < EMAGE_BANK_TOP) expect(y).toBe(-EMAGE_DROP);
    }
  });
});


describe('Emage surveyed mass clearances', () => {
  it('keeps tree trunks and tall shrub bounds outside riding and filming corridors', () => {
    const masses=buildPlanting(new Bake());
    for(const {x,z,rx,rz,ry,y} of masses) {
      // Low groundcover is deliberately retained in the side filmer's view.
      if(ry*2 < 2.5*F) continue;
      const overlaps=(a:number,b:number,c:number,d:number)=>x+rx>a*F && x-rx<b*F && z+rz>c*F && z-rz<d*F;
      expect(overlaps(-80,22,-6,6)).toBe(false);
      expect(overlaps(-30,0,0,8)).toBe(false);
      expect(overlaps(22,62,-10,10)).toBe(false);
      expect(overlaps(0,30,4,22.5)).toBe(false);
      expect(y+ry).toBeGreaterThan(y);
    }
    for(const {at:[x,,z]} of emageTrees()) {
      expect(x>=-80*F && x<=62*F && Math.abs(z)<10*F).toBe(false);
      expect(x>=0 && x<=36*F && z>=4*F && z<=26*F).toBe(false);
      if(x>=50*F && x<=66*F) expect(Math.abs(z)).toBeGreaterThan(25*F);
    }
  });
  it('clears the side filmer box and provides seven feet of trail headroom', () => {
    const b=new Bake(); buildBridge(b,new Bake(),[]);
    const g=b.geometry(), material=new MeshBasicMaterial({side:DoubleSide}), mesh=new Mesh(g,material);
    try {
      const position=g.getAttribute('position');
      for(let i=0;i<position.count;i++) {
        const x=position.getX(i)/F,z=position.getZ(i)/F;
        expect(x>=20 && x<=36 && z<26).toBe(false);
      }
      for(let x=22;x<=32;x+=2) {
        const z=29+0.404*(x+10);
        const hit=new Raycaster(new Vector3(x*F,-10*F,z*F),new Vector3(0,1,0)).intersectObject(mesh)[0];
        expect(hit).toBeDefined();
        expect(hit.distance/F).toBeGreaterThanOrEqual(7);
      }
      expect(bridgePoint(0,0,0)).toEqual([-10*F,0,29*F]);
    } finally {g.dispose();material.dispose();}
  });
  it('keeps both apartment masses and balconies outside the plaza run-up', () => {
    const b=new Bake();buildApartments(b,new Bake(),[]);
    const g=b.geometry(), material=new MeshBasicMaterial({side:DoubleSide}), mesh=new Mesh(g,material);
    try {
      for(let x=-80;x<=0;x+=5) for(let z=-6;z<=8;z+=2) {
        expect(new Raycaster(new Vector3(x*F,80*F,z*F),new Vector3(0,-1,0)).intersectObject(mesh)).toHaveLength(0);
      }
    } finally {g.dispose();material.dispose();}
  });
});
