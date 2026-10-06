/**
 * Who rides: the robot, illustrated human, realistic human, or humanoid.
 * All ride the same trick and board motion. The people wear a
 * person's proportions on the robot's rig (human/humanRig.ts); each one's
 * meshes, and the board they ride, are picked in three/renderer.ts.
 */
export type Skater = 'robot' | 'human' | 'realistic' | 'humanoid';

export interface SkaterInfo {
  id: Skater;
  /** What the skater picker calls them. */
  label: string;
  /** A person's proportions, grown from the robot's rig over the same feet. */
  person: boolean;
}

export const SKATERS: readonly SkaterInfo[] = [
  { id: 'robot', label: 'Robot', person: false },
  { id: 'human', label: 'Human', person: true },
  { id: 'realistic', label: 'Realistic', person: true },
  { id: 'humanoid', label: 'Humanoid', person: true },
];

const BY_ID = new Map(SKATERS.map((skater) => [skater.id, skater]));

/** A skater's entry; the robot for anything unknown. */
export const skaterInfo = (id: Skater): SkaterInfo => BY_ID.get(id) ?? SKATERS[0];
