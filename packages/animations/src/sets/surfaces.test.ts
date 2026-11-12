import { describe, expect, it } from 'vitest';
import type { ShaderMaterial } from 'three';
import type { Vec3 } from '../camera/view';
import { lambert, tone } from '../camera/camera';
import { Bake, celShade, DAYLIGHT, daylight, daylightIrradiance, NO_INK } from '../three/bake';
import { rgb, SUN } from '../three/materials';
import { ClassicSpot3D, type ClassicSpotConfig } from './classicSpot3d';
import { elToroPropMaterial } from './elToro/elToroMaterials';
import { canopiesFromTrees, lookSurfaceTest, MAX_CANOPIES, MAX_CONTACTS, resolveLook, stairContacts, SURFACE, surfaceInk, surfacesGlsl, type SpotLook } from './surfaces';
import { SET_FOOT } from './setScale';

const UP: Vec3 = [0, 1, 0];
const SUN_N: Vec3 = [SUN.x, SUN.y, SUN.z];
const hue = (hex: string) => {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 1e-6) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const luma = (hex: string) => { const [r, g, b] = rgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b; };

describe('neutral daylight bake', () => {
  it('keeps the authored color on a sunlit flat face', () => {
    for (const c of ['#c6c0b1', '#5d8a3a', '#26292a', '#e6e1d6']) {
      const out = rgb(daylight(c, UP)), want = rgb(c);
      out.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(1.5 / 255));
    }
    expect(daylightIrradiance(UP).every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
  });

  it('darkens faces turned from the sun without shifting their hue', () => {
    const wall = '#d8cdb8';
    const faces: Vec3[] = [[-SUN.x, 0, -SUN.z], [1, 0, 0], [0, 0, -1], [0, -1, 0], [-1, 0, 0]];
    for (const n of faces) {
      const out = daylight(wall, n);
      expect(luma(out)).toBeLessThan(luma(wall));
      expect(Math.abs(hue(out) - hue(wall))).toBeLessThan(8);
    }
    // The stock cel tone does shift it: that's what the look replaces.
    expect(Math.abs(hue(celShade(wall, [-SUN.x, 0, -SUN.z])) - hue(wall))).toBeGreaterThan(8);
  });

  it('is brightest facing the sun and loses the sun with exposure', () => {
    const c = '#9a9a9a';
    expect(luma(daylight(c, SUN_N))).toBeGreaterThan(luma(daylight(c, UP)));
    const away: Vec3 = [-SUN.x, -SUN.y, -SUN.z];
    expect(luma(daylight(c, UP))).toBeGreaterThan(luma(daylight(c, [1, 0, 0])));
    expect(luma(daylight(c, UP, { sun: 0 }))).toBeLessThan(luma(daylight(c, UP)) * 0.75);
    expect(luma(daylight(c, UP, { sun: 0, sky: 0.5 }))).toBeLessThan(luma(daylight(c, UP, { sun: 0 })));
    // A face turned fully away from the sun sees only sky and bounce, so blocking the sun changes nothing.
    expect(daylight(c, away, { sun: 0 })).toBe(daylight(c, away));
  });
});

describe('Bake shading', () => {
  it('lights boxes with the stock cel tone by default', () => {
    expect(celShade('#8899aa', [0, 1, 0])).toBe(tone('#8899aa', lambert({ x: 0, y: -1, z: 0 })));
    const stock = new Bake(), cel = new Bake(celShade);
    stock.box([0, 0, 0], [1, 1, 1], '#aa8866', '#ccbb99', NO_INK);
    cel.box([0, 0, 0], [1, 1, 1], '#aa8866', '#ccbb99', NO_INK);
    expect(Array.from(stock.geometry().getAttribute('aColor').array)).toEqual(Array.from(cel.geometry().getAttribute('aColor').array));
  });

  it('lights boxes with daylight when a spot opts in', () => {
    const bake = new Bake(daylight);
    bake.box([0, 0, 0], [1, 1, 1], '#aa8866', '#aa8866', NO_INK, 't');
    const c = bake.geometry().getAttribute('aColor').array;
    const want = rgb('#aa8866');
    for (let i = 0; i < 3; i++) expect(Math.abs(c[i] - want[i])).toBeLessThanOrEqual(1.5 / 255);
  });

  it('carries corner occlusion in paint alpha and blends corner paints', () => {
    const bake = new Bake();
    const q: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]];
    bake.quadAo(q[0], q[1], q[2], q[3], UP, { color: '#808080' }, NO_INK, [1, 0.5, 0.25, 0.75]);
    bake.quadCorners(q[0], q[1], q[2], q[3], UP, [{ color: '#ff0000' }, { color: '#00ff00' }, { color: '#0000ff' }, { color: '#ffffff' }], surfaceInk('grass'));
    const g = bake.geometry();
    const alpha = Array.from({ length: 6 }, (_, v) => g.getAttribute('aColor').getW(v));
    expect(alpha).toEqual([1, 0.5, 0.25, 1, 0.25, 0.75]);
    expect(g.getAttribute('aColor').getX(6)).toBe(1); // corner a: red
    expect(g.getAttribute('aColor').getY(7)).toBe(1); // corner b: green
    // Surface 14 in the ink's solid, decoded as the shader does.
    expect(Math.floor((g.getAttribute('aInfo').getW(6) * 255) / 4 + 0.01)).toBe(SURFACE.grass);
  });
});

describe('look helpers', () => {
  it('builds uninked surface inks for solids 14-24, under the 32 an ink can hold', () => {
    for (const name of Object.keys(SURFACE) as Array<keyof typeof SURFACE>) {
      const ink = surfaceInk(name);
      expect(ink).toEqual({ id: 0, priority: 0, width: 0, kind: 0, solid: SURFACE[name] });
      expect(ink.solid!).toBeGreaterThanOrEqual(14);
      expect(ink.solid!).toBeLessThan(32);
    }
  });

  it('adds soil and standing-seam roofing after the earlier surfaces, keeping their ids', () => {
    expect(SURFACE).toMatchObject({ grass: 14, concrete: 15, soil: 20, roofing: 21 });
    expect(new Set(Object.values(SURFACE)).size).toBe(Object.keys(SURFACE).length);
  });

  it('adds brick and asphalt after lockers, the last solids an ink can hold room for', () => {
    expect(SURFACE).toMatchObject({ lockers: 22, brick: 23, asphalt: 24 });
    expect(Math.max(...Object.values(SURFACE))).toBe(SURFACE.asphalt);
    // Each decodes from a baked face as the shader does.
    for (const solid of [SURFACE.brick, SURFACE.asphalt]) {
      const bake = new Bake();
      bake.quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], UP, { color: '#808080' }, { ...surfaceInk('concrete'), kind: 3, solid });
      expect(Math.floor((bake.geometry().getAttribute('aInfo').getW(0) * 255) / 4 + 0.01)).toBe(solid);
    }
  });

  it('places stair contacts at the first riser foot, repeating a tread down', () => {
    expect(stairContacts(100, 50, -20, 20, 12, 6, 8, 9)).toEqual({ a: [100, 44, -20], b: [100, 44, 20], reach: 9, strength: 0.32, step: [12, -6, 0], count: 8 });
  });

  it('puts tree crowns at their trees', () => {
    expect(canopiesFromTrees([{ at: [10, 2, 30], height: 100, yaw: 0 }])).toEqual([{ at: [10, 64, 30], radius: 30 }]);
  });

  it('resolves defaults, with distances in feet', () => {
    const look = resolveLook({});
    expect(look.ink).toBe('#70766e');
    expect(look.propShadows).toBe(false);
    expect(look.boxContact).toBeCloseTo(1.2 * SET_FOOT);
    expect(resolveLook({ haze: { from: 100, to: 400 } })).toMatchObject({ hazeFrom: 100 * SET_FOOT, hazeTo: 400 * SET_FOOT });
  });

  it('fills with the bake’s sky and bounce unless a spot sets its own, and darkens soffits only with prop shadows', () => {
    expect(resolveLook({})).toMatchObject({ sky: DAYLIGHT.sky, bounce: DAYLIGHT.bounce, soffit: 0 });
    expect(resolveLook({ fill: { bounce: 0.9 } })).toMatchObject({ sky: DAYLIGHT.sky, bounce: 0.9 });
    expect(resolveLook({ soffit: 0.6 }).soffit).toBe(0);
    expect(resolveLook({ soffit: 0.6, propShadows: true }).soffit).toBe(0.6);
    const stock = surfacesGlsl(resolveLook({})), filled = surfacesGlsl(resolveLook({ fill: { sky: 0.7, bounce: 0.9 } }));
    expect(stock).toContain(`* ${DAYLIGHT.sky.toFixed(3)} *`);
    expect(stock).toContain(`* ${DAYLIGHT.bounce.toFixed(3)} *`);
    expect(filled).toContain('* 0.700 *');
    expect(filled).toContain('* 0.900 *');
  });
});

const BRICK: NonNullable<SpotLook['brick']> = { length: 7.625 / 12, height: 2.25 / 12, joint: 0.375 / 12, mortar: '#c6bbac', paint: '#ae7c64' };
const ASPHALT: NonNullable<SpotLook['asphalt']> = { scale: 0.03, contrast: 0.16 };

const spotConfig = (look?: SpotLook, extra: Partial<ReturnType<ClassicSpotConfig['build']>> = {}): ClassicSpotConfig => ({
  build: () => {
    const ground = new Bake(), props = new Bake();
    ground.quad([0, 0, -100], [400, 0, -100], [400, 0, 100], [0, 0, 100], UP, { color: '#c6c0b1' }, surfaceInk('concrete'));
    props.box([100, 0, -10], [140, 30, 10], '#aaaaaa', '#bbbbbb', NO_INK);
    return { ground: ground.geometry(), props: props.geometry(), shadowBoxes: [{ min: [100, 0, -10], max: [140, 30, 10] }], ...extra };
  },
  laneZ: 0, ground: () => 0, grade: 0, run: 200, drop: 0, look,
});
const materials = (spot: ClassicSpot3D) => spot.terrain().map((m) => m.material as ShaderMaterial);

/** Uniform vectors a fragment shader declares (every float, vec3 or vec4 takes a slot; arrays one per element). */
function fragmentVectors(source: string): number {
  let total = 0;
  for (const m of source.matchAll(/uniform\s+(?:highp\s+|mediump\s+)?(float|int|vec[234]|mat[34]|sampler2D)\s+(\w+)(?:\[(\d+)\])?/g)) {
    const slots = m[1] === 'mat4' ? 4 : m[1] === 'mat3' ? 3 : 1;
    total += slots * Number(m[3] ?? 1);
  }
  return total;
}

describe('the realistic look is opt in', () => {
  it('leaves a spot without `look` on the stock shaders and ink', () => {
    const spot = new ClassicSpot3D(spotConfig());
    const [ground, props] = materials(spot);
    expect(spot.propInk).toBe('#70766e');
    expect(props.fragmentShader).toBe(elToroPropMaterial().fragmentShader);
    expect(props.vertexShader).toBe(elToroPropMaterial().vertexShader);
    for (const m of [ground, props]) {
      for (const word of ['lookSurface', 'lookContact', 'lookDapple', 'lookBoxShadow', 'lookMasonry', 'lookLit', 'lookSkyOpen', 'uLook', 'vAo']) {
        expect(m.fragmentShader).not.toContain(word);
        expect(m.vertexShader).not.toContain(word);
      }
      for (const name of ['uLook', 'uContactCount', 'uCanopyCount']) expect(m.uniforms[name]).toBeUndefined();
    }
  });

  it('compiles soil and roofing only into look shaders, behind the shared surface dispatch', () => {
    const [stockGround, stockProps] = materials(new ClassicSpot3D(spotConfig()));
    for (const m of [stockGround, stockProps]) for (const word of ['lookSoil', 'lookRoofing', 'lookLitter']) expect(m.fragmentShader).not.toContain(word);
    for (const m of materials(new ClassicSpot3D(spotConfig({})))) {
      expect(m.fragmentShader).toContain('vec3 lookSoil(vec3 c, vec2 q, vec3 n)');
      expect(m.fragmentShader).toContain('vec3 lookRoofing(vec3 c, vec3 n, vec3 local)');
      expect(m.fragmentShader).toContain('if (surface < 20.5) return lookSoil(c, local.xz, n);');
      expect(m.fragmentShader).toContain('return lookRoofing(c, n, local);');
      expect(m.fragmentShader).toContain('surface > 13.5 && surface < 21.5');
    }
    // The GLSL itself only arrives through the look source.
    expect(surfacesGlsl(resolveLook({}))).toContain('lookSoil');
  });

  it('compiles brick and asphalt only for a spot whose look sets them, each falling through to plain paint elsewhere', () => {
    const own = ['lookBrick', 'lookAsphalt', 'lookJointOver', 'abs(surface - 23.0)', 'abs(surface - 24.0)'];
    const stock = materials(new ClassicSpot3D(spotConfig()));
    const plain = materials(new ClassicSpot3D(spotConfig({ propShadows: true, lockers: { door: 1.25, tier: 6, from: 0 } })));
    for (const m of [...stock, ...plain]) for (const word of own) expect(m.fragmentShader).not.toContain(word);
    // A look without them dispatches exactly as before.
    expect(plain[1].fragmentShader).toContain('if (surface > 13.5 && surface < 22.5) {');
    expect(surfacesGlsl(resolveLook({}))).not.toContain('lookBrick');
    const both = materials(new ClassicSpot3D(spotConfig({ propShadows: true, brick: BRICK, asphalt: ASPHALT })));
    for (const m of both) {
      expect(m.fragmentShader).toContain('vec3 lookBrick(vec3 c, vec2 q, vec3 n, vec3 local)');
      expect(m.fragmentShader).toContain('vec3 lookAsphalt(vec3 c, vec2 q, bool road)');
      // Level, it is the road with its weathered binder; upright, the aggregate panels' coarser stones without it.
      expect(m.fragmentShader).toContain('return lookAsphalt(c, abs(n.y) > 0.5 ? local.xz : q * 0.4, abs(n.y) > 0.5);');
      expect(m.fragmentShader).toContain('if (surface > 13.5 && surface < 21.5 || abs(surface - 23.0) < 0.5 || abs(surface - 24.0) < 0.5) {');
      // Asphalt and brick are tested before the solids past roofing.
      const body = m.fragmentShader.slice(m.fragmentShader.indexOf('vec3 lookSurface('));
      expect(body.indexOf('return lookAsphalt(')).toBeLessThan(body.indexOf('return lookBrick('));
      expect(body.indexOf('return lookBrick(')).toBeLessThan(body.indexOf('return lookRoofing('));
    }
    // One without the other: the missing one's solid isn't sent to lookSurface, so it stays plain paint.
    expect(lookSurfaceTest(resolveLook({ brick: BRICK }))).toBe('surface > 13.5 && surface < 21.5 || abs(surface - 23.0) < 0.5');
    expect(lookSurfaceTest(resolveLook({ asphalt: ASPHALT, lockers: { door: 1, tier: 6, from: 0 } }))).toBe('surface > 13.5 && surface < 22.5 || abs(surface - 24.0) < 0.5');
    expect(surfacesGlsl(resolveLook({ asphalt: ASPHALT }))).not.toContain('lookBrick');
    expect(surfacesGlsl(resolveLook({ brick: BRICK }))).not.toContain('lookAsphalt');
  });

  it('shares a brick face’s paint between brick and mortar, so the wall far off is exactly its paint', () => {
    const glsl = surfacesGlsl(resolveLook({ brick: BRICK }));
    const vec = (pattern: RegExp) => glsl.match(pattern)![1].split(',').map(Number);
    const brick = vec(/vec3 brick = c \* vec3\(([^)]*)\)/), mortar = vec(/vec3 mortar = c \* vec3\(([^)]*)\)/);
    const bed = BRICK.joint / (BRICK.height + BRICK.joint), head = BRICK.joint / (BRICK.length + BRICK.joint);
    const share = bed + (1 - bed) * head;
    for (let i = 0; i < 3; i++) expect((1 - share) * brick[i] + share * mortar[i]).toBeCloseTo(1, 3);
    // Pale mortar, so the brick itself is deeper than the paint.
    expect(mortar.every((m) => m > 1)).toBe(true);
    expect(brick.every((b) => b < 1)).toBe(true);
    // Courses three to eight inches: modular brick.
    expect(glsl).toContain(`COURSE = ${(BRICK.height + BRICK.joint).toFixed(4)}`);
  });

  it('gives a spot with `look` its surfaces, shadows, contacts, canopies and knobs', () => {
    const contact = stairContacts(100, 30, -10, 10, 12, 6, 4, 9, 0.3);
    const spot = new ClassicSpot3D(spotConfig({ ink: '#6f6c66', propShadows: true, haze: { color: '#aabbcc' } }, {
      contacts: [contact], canopies: [{ at: [50, 80, 0], radius: 20 }],
    }));
    const [ground, props] = materials(spot);
    expect(spot.propInk).toBe('#6f6c66');
    expect(props.fragmentShader).toContain('lookSurface');
    expect(props.fragmentShader).toContain('lookBoxShadow');
    expect(props.uniforms.uBoxCount.value).toBe(1);
    expect(ground.fragmentShader).toContain('lookContact');
    expect(ground.fragmentShader).toContain('lookDapple');
    expect(ground.uniforms.uContactCount.value).toBe(1);
    expect(ground.uniforms.uContactA.value[0].toArray()).toEqual([...contact.a, contact.reach]);
    expect(ground.uniforms.uContactStep.value[0].toArray()).toEqual([12, -6, 0, 4]);
    expect(ground.uniforms.uCanopyCount.value).toBe(1);
    expect(ground.uniforms.uCanopy.value[0].toArray()).toEqual([50, 80, 0, 20]);
    const haze = rgb('#aabbcc').map((c) => c.toFixed(5)).join(', ');
    expect(ground.fragmentShader).toContain(haze);
    expect(props.fragmentShader).toContain(haze);
  });

  it('keeps props unshadowed unless asked, and canopies default to the street trees', () => {
    const spot = new ClassicSpot3D(spotConfig({}));
    const [ground, props] = materials(spot);
    expect(props.fragmentShader).toContain('lookSurface');
    expect(props.fragmentShader).not.toContain('lookBoxShadow');
    expect(ground.uniforms.uCanopyCount.value).toBe(0);
  });

  it('lights flat paint per pixel only when asked', () => {
    const baked = materials(new ClassicSpot3D(spotConfig({})));
    const lit = materials(new ClassicSpot3D(spotConfig({ light: 'shader' })));
    for (const m of baked) expect(m.fragmentShader).toContain('if (vBand.x < 1.5) color *= lookDaylight(n);');
    for (const m of lit) {
      expect(m.fragmentShader).not.toContain('vBand.x < 1.5');
      expect(m.fragmentShader.match(/color \*= lookDaylight\(n\);/g)!.length).toBe(2);
    }
  });

  it('leaves glass unlit and unshadowed (it carries its own reflection), and lays courses on block walls', () => {
    for (const look of [{}, { light: 'shader' }, { propShadows: true }] as SpotLook[]) {
      const [, props] = materials(new ClassicSpot3D(spotConfig(look)));
      expect(props.fragmentShader).toMatch(/if \(abs\(surface - 16\.0\) > 0\.5\) (?:if \(vBand\.x < 1\.5\) )?color \*= lookDaylight\(n\);/);
      expect(props.fragmentShader).toContain('if (surface == 10.0) {\n            color = lookMasonry(color');
      if (look.propShadows) expect(props.fragmentShader).toContain('if (abs(surface - 16.0) > 0.5) color = lookLit(color, n, lookBoxShadow(vLocal), 1.0);');
    }
  });

  it('opens soffits to the sky by the boxes overhead only when asked', () => {
    const plain = materials(new ClassicSpot3D(spotConfig({ propShadows: true })))[1];
    const soffit = materials(new ClassicSpot3D(spotConfig({ propShadows: true, soffit: 0.6 })))[1];
    const unshadowed = materials(new ClassicSpot3D(spotConfig({ soffit: 0.6 })))[1];
    expect(plain.fragmentShader).not.toContain('lookSkyOpen(vLocal)');
    expect(unshadowed.fragmentShader).not.toContain('lookSkyOpen');
    expect(soffit.fragmentShader).toContain('lookLit(color, n, lookBoxShadow(vLocal), 1.0 - 0.600 * (1.0 - lookSkyOpen(vLocal)))');
    expect(fragmentVectors(soffit.fragmentShader)).toBe(fragmentVectors(plain.fragmentShader));
  });

  it('draws a spot’s decals as ground: the ground’s material, so its shade and the rider’s shadow cross them', () => {
    const decals = new Bake();
    decals.quad([10, 0.3, -1], [60, 0.3, -1], [60, 0.3, 1], [10, 0.3, 1], UP, { color: '#6e6b62' }, surfaceInk('concrete'));
    const without = new ClassicSpot3D(spotConfig({})), spot = new ClassicSpot3D(spotConfig({}, { decals: decals.geometry() }));
    expect(without.terrain()).toHaveLength(2);
    const [ground, props, marks] = spot.terrain();
    expect(marks.material).toBe(ground.material);
    expect(marks.material).not.toBe(props.material);
    expect(marks.renderOrder).toBeGreaterThan(ground.renderOrder);
    // The stock shaders take them too.
    const stock = new ClassicSpot3D(spotConfig(undefined, { decals: decals.geometry() })).terrain();
    expect(stock[2].material).toBe(stock[0].material);
  });

  it('caps contacts and canopies at their uniform arrays', () => {
    const line = { a: [0, 0, 0] as Vec3, b: [1, 0, 0] as Vec3, reach: 5 };
    const spot = new ClassicSpot3D(spotConfig({}, {
      contacts: Array.from({ length: 20 }, () => line),
      canopies: Array.from({ length: 30 }, () => ({ at: [0, 50, 0] as Vec3, radius: 10 })),
    }));
    const [ground] = materials(spot);
    expect(ground.uniforms.uContactCount.value).toBe(MAX_CONTACTS);
    expect(ground.uniforms.uCanopyCount.value).toBe(MAX_CANOPIES);
  });

  it('stays inside WebGL2’s minimum fragment uniform vectors (224), with room for three’s own', () => {
    const stock = materials(new ClassicSpot3D(spotConfig()))[0];
    const look = materials(new ClassicSpot3D(spotConfig({ propShadows: true })));
    expect(fragmentVectors(look[0].fragmentShader) - fragmentVectors(stock.fragmentShader)).toBe(3 * MAX_CONTACTS + MAX_CANOPIES + 4); // + uLook, uDapple and the two counts
    for (const m of look) expect(fragmentVectors(m.fragmentShader)).toBeLessThan(200);
    // Brick and asphalt are compiled in as constants: no uniforms of their own.
    const surfaced = materials(new ClassicSpot3D(spotConfig({ propShadows: true, brick: BRICK, asphalt: ASPHALT })));
    surfaced.forEach((m, i) => expect(fragmentVectors(m.fragmentShader)).toBe(fragmentVectors(look[i].fragmentShader)));
  });
});
