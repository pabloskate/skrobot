/**
 * Who rides in TrickScene3D: the robot, the illustrated human, or the
 * detailed humanoid. All three use the same trick and board motion;
 * the two human bodies share the proportions adapted by humanRig.ts.
 */
export type Skater = 'robot' | 'human' | 'humanoid';

export const SKATERS: ReadonlyArray<{ id: Skater; label: string }> = [
  { id: 'robot', label: 'Robot' },
  { id: 'human', label: 'Human' },
  { id: 'humanoid', label: 'Humanoid' },
];
