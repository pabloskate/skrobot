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
