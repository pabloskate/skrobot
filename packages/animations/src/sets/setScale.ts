import { FOOT } from '../units';
import type { Handrail } from '../motion/grind';
import type { DropTerrain } from './elToro/stairs';

/**
 * The spots are laid out and drawn at their own scale, SET_FOOT units to
 * the foot: each set's measured layout, its scenery, where its filmers
 * stand. On the stage a set's foot is a real one (units.ts), so a set stands
 * SET_SCALE bigger there than it's drawn, keeping its real size around the
 * 31-inch board and the rider. What a set hands the stage — the terrain a
 * trick flies down, the handrails and ledges a grind rides, the scenery the
 * renderer draws, its cameras — is scaled on the way out.
 */
export const SET_FOOT = 29;
export const SET_SCALE = FOOT / SET_FOOT;

const k = SET_SCALE;

/** A drop laid out in set units, in the stage's. */
export function stageTerrain(terrain: DropTerrain): DropTerrain {
  const { ground, surface, slope, entry, dropIn, brush } = terrain;
  return {
    ...terrain,
    drop: terrain.drop * k,
    run: terrain.run * k,
    landPast: terrain.landPast * k,
    laneZ: terrain.laneZ * k,
    ...(terrain.runout !== undefined && { runout: terrain.runout * k }),
    ...(brush && { brush: (u: number, z: number) => brush(u / k, z / k) }),
    ground: (u) => k * ground(u / k),
    ...(surface && { surface: (x: number, z: number) => k * surface(x / k, z / k) }),
    ...(slope && { slope: (u: number) => slope(u / k) }),
    ...(entry && { entry: { ...entry, x: entry.x * k, z: entry.z * k } }),
    ...(dropIn && { dropIn: { x: dropIn.x * k, speed: dropIn.speed * k } }),
  };
}

/** A handrail or a ledge laid out in set units, in the stage's. */
export function stageHandrail(rail: Handrail): Handrail {
  const { ground, rest, takeoff, brush } = rail;
  const across = (z?: number) => (z === undefined ? undefined : z / k);
  return {
    ...rail,
    start: rail.start * k,
    end: rail.end * k,
    top: rail.top * k,
    radius: rail.radius * k,
    speed: rail.speed * k,
    ...(rail.runout !== undefined && { runout: rail.runout * k }),
    ...(brush && { brush: (s: number, z?: number) => brush(s / k, across(z)) }),
    ground: (s, z) => k * ground(s / k, across(z)),
    rest: (s, z) => k * rest(s / k, across(z)),
    ...(takeoff && { takeoff: { s: takeoff.s * k, off: takeoff.off * k, lock: takeoff.lock * k } }),
  };
}
