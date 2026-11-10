import type { RailBail } from '../motion/fall/railBail';
import { resolveSkateStyle } from '../motion/style';
import type { FallVariant } from '../motion/trick';
import type { Skater } from '../riders/skaters';
import type { Obstacle, RailChoice, StageSet } from '../sets/sets';
import type { RiderStance, SkateStyle, Trick } from '../types';
import { planStage, stageFrame } from './stage';

/** Where the rider is in a spot at a moment of the attempt, in stage units: along the drop from its lip, and across the set. */
export interface PathPoint {
  t: number;
  u: number;
  z: number;
}

/** How many moments a path is sampled at. */
const SAMPLES = 48;

/**
 * The line an attempt takes through its spot, from the first frame to the
 * last, as the stage itself plays it: the set slides under a rider who stays
 * put, so where they are in the spot is how far it has slid.
 */
export function riderPath(
  trick: Pick<Trick, 'id' | 'name' | 'base' | 'stance'>,
  options: {
    landed: boolean;
    riderStance: RiderStance;
    style?: SkateStyle;
    fall?: FallVariant;
    skater?: Skater;
    set: StageSet;
    rail?: RailChoice;
    obstacle?: Obstacle;
    railBail?: RailBail;
  },
): PathPoint[] {
  const stage = planStage(trick as Trick, { ...options, style: resolveSkateStyle(options.style), fall: options.fall ?? 'kickout', shankProgress: 0.5 });
  const points: PathPoint[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = (stage.end * i) / SAMPLES;
    const frame = stageFrame(stage, t, 1);
    points.push({ t, u: frame.scroll, z: (frame.stairs?.across ?? 0) + (frame.track ?? 0) });
  }
  return points;
}
