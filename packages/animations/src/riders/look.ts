/** The rider's face: how the robot's visor (and a person's face) reads through an attempt. */
export type Expression = 'open' | 'focus' | 'happy' | 'wince';

/** A robot's colors: its shell, its accent, and which antenna it wears. */
export interface RobotLook {
  body: string;
  accent: string;
  variant: 0 | 1 | 2 | 3;
}
