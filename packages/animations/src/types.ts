import type { ReactNode } from 'react';
import type { Expression } from './riders/look';

export type Stance = 'regular' | 'fakie' | 'switch' | 'nollie';
export type RiderStance = 'regular' | 'goofy';
export type BodySide = 'left' | 'right';

/**
 * Small, cosmetic differences in how a robot performs the same trick.
 * Every value is a multiplier centered on 1; the animation package clamps
 * authored values to a deliberately narrow range before using them.
 */
export interface SkateStyle {
  /** Vertical pop arc. Lower values stay closer to the ground. */
  popHeight: number;
  /** Board/body rotation speed. Faster rotation also produces an earlier catch. */
  rotationSpeed: number;
  /** How far the flicking foot extends away from the board. */
  flickStrength: number;
}

export interface Robot {
  id: string;
  name: string;
  avatar: { body: string; accent: string; variant: 0 | 1 | 2 | 3 };
  /** Omitted robots use the neutral animation style. */
  skateStyle?: SkateStyle;
}

export interface Trick {
  id: string;
  name: string;
  base: string;
  stance: Stance;
}

/** A head move layered on the rider's own, and optionally a face. */
export interface HeadPose {
  /** Degrees; positive tips the face up. */
  pitch: number;
  /** Degrees about the face's forward axis. */
  roll: number;
  expression?: Expression;
}

/**
 * A beat played on the stage before the trick, such as the robot calling its
 * set. The robot cruises in the trick's t = 0 pose with the street rolling,
 * so the last lead-in frame is the attempt's first. Every callback runs on
 * the trick's clock, which is negative during the lead-in. Only the first run
 * has the lead-in: a replay is just the trick.
 */
export interface LeadIn {
  seconds: number;
  /** Stage button label during the lead-in, when the trick may still be a secret. */
  label: string;
  /** Head pose over the rider's own, or null for none. May run past t = 0. */
  head?: (t: number) => HeadPose | null;
  /** Drawn over the stage. May run past t = 0. */
  overlay?: (t: number) => ReactNode;
  /** A tap on the stage before this time jumps to it. */
  skipTo?: number;
  /** Fires once, when the trick's clock reaches t = 0. */
  onEnd?: () => void;
}
