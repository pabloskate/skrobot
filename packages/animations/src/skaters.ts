/**
 * Who rides in TrickScene3D: the robot, or a human skater on the same rig
 * (three/human3d.ts). Same tricks, same motion; a different body.
 */
export type Skater = 'robot' | 'human';

export const SKATERS: ReadonlyArray<{ id: Skater; label: string }> = [
  { id: 'robot', label: 'Robot' },
  { id: 'human', label: 'Human' },
];
