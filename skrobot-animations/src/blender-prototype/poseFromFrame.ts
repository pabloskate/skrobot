/**
 * Pose the Blender-exported GLB rig from a `computeFrame` sample.
 *
 * Blender authored the joint hierarchy and mesh; the shared animation package
 * owns the trick physics. This file is the seam between the two: art-unit
 * Frame channels → Three.js transforms on the named empties in the GLB.
 */

import * as THREE from 'three';
import {
  GROUND,
  X0,
  clampFootReach,
  orientTrickRotation,
  resolveRiderMechanics,
  type Frame,
  type RiderStance,
  type Spec,
} from '@skrobot/animations';

/** Same art-unit scale the Blender generator uses (`U = 1/60`). */
export const U = 1 / 60;
/** Deck centre height above asphalt when the wheels are down (art units). */
const DECK_REST_HEIGHT_ART = 13;
const THIGH = 35;
const SHIN = 35;
/** Raise foot targets onto the deck's top face (matches generate_prototype.py). */
const FOOT_DECK_LIFT = 4;
/** Mild torso yaw from travel toward toeside — matches TrickAnimation3D. */
const STANCE_BODY_YAW = 40;
/** Degrees the head stays toward travel relative to the torso yaw. */
const HEAD_LOOK_FORWARD = 16;
const ARM_SPLAY = 13;

export interface RigHandles {
  rider: THREE.Object3D;
  board: THREE.Object3D;
  stance: THREE.Object3D | null;
  torso: THREE.Object3D | null;
  head: THREE.Object3D | null;
  hipNose: THREE.Object3D | null;
  hipTail: THREE.Object3D | null;
  kneeNose: THREE.Object3D | null;
  kneeTail: THREE.Object3D | null;
  footNose: THREE.Object3D | null;
  footTail: THREE.Object3D | null;
  shoulderFront: THREE.Object3D | null;
  shoulderBack: THREE.Object3D | null;
  elbowFront: THREE.Object3D | null;
  elbowBack: THREE.Object3D | null;
}

export function bindRig(scene: THREE.Object3D): RigHandles | null {
  const rider = scene.getObjectByName('RobotRig');
  const board = scene.getObjectByName('SkateboardRig');
  if (!rider || !board) return null;
  return {
    rider,
    board,
    stance: scene.getObjectByName('Rig.Stance') ?? null,
    torso: scene.getObjectByName('Rig.Torso') ?? null,
    head: scene.getObjectByName('Rig.Head') ?? null,
    hipNose: scene.getObjectByName('Rig.Hip.Nose') ?? null,
    hipTail: scene.getObjectByName('Rig.Hip.Tail') ?? null,
    kneeNose: scene.getObjectByName('Rig.Knee.Nose') ?? null,
    kneeTail: scene.getObjectByName('Rig.Knee.Tail') ?? null,
    footNose: scene.getObjectByName('Rig.Foot.Nose') ?? null,
    footTail: scene.getObjectByName('Rig.Foot.Tail') ?? null,
    shoulderFront: scene.getObjectByName('Rig.Shoulder.Front') ?? null,
    shoulderBack: scene.getObjectByName('Rig.Shoulder.Back') ?? null,
    elbowFront: scene.getObjectByName('Rig.Elbow.Front') ?? null,
    elbowBack: scene.getObjectByName('Rig.Elbow.Back') ?? null,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

/** Two-bone IK matching `generate_prototype.py`: knees fold toward the nose. */
function solveLeg(footX: number, footY: number): { hipDeg: number; kneeDeg: number } {
  const reach = clamp(Math.hypot(footX, footY), 8, THIGH + SHIN - 0.4);
  const base = Math.atan2(footX, footY);
  const hipOffset = Math.acos(
    clamp((reach * reach + THIGH * THIGH - SHIN * SHIN) / (2 * reach * THIGH), -1, 1),
  );
  const kneeInterior = Math.acos(
    clamp((THIGH * THIGH + SHIN * SHIN - reach * reach) / (2 * THIGH * SHIN), -1, 1),
  );
  return {
    hipDeg: THREE.MathUtils.radToDeg(base + hipOffset),
    kneeDeg: THREE.MathUtils.radToDeg(Math.PI - kneeInterior),
  };
}

/**
 * Art space (x = travel, y = DOWN, z = toward camera) → Three.js after the
 * Blender glTF yup export. Generator V() wrote Blender (x, z, -yDown); yup
 * export maps that to glTF (x, -yDown, -z). Height h above asphalt is
 * yDown = -h, so it lands on +Y.
 */
function artToThree(x: number, yDown: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x * U, -yDown * U, -z * U);
}

function setEulerDeg(obj: THREE.Object3D | null, x: number, y: number, z: number) {
  if (!obj) return;
  obj.rotation.order = 'XYZ';
  obj.rotation.set(
    THREE.MathUtils.degToRad(x),
    THREE.MathUtils.degToRad(y),
    THREE.MathUtils.degToRad(z),
  );
}

function poseLeg(
  hip: THREE.Object3D | null,
  knee: THREE.Object3D | null,
  foot: THREE.Object3D | null,
  target: { x: number; y: number },
) {
  const clamped = clampFootReach(target);
  const { hipDeg, kneeDeg } = solveLeg(clamped.x, clamped.y - FOOT_DECK_LIFT);
  // Hip aims at the knee solution; knee bends by the interior angle. Signs
  // match the generator's (0, -hip, 0) / (0, +knee, 0) after the yup remap
  // turns Blender Y rotations into Three.js Z rotations.
  setEulerDeg(hip, 0, 0, hipDeg);
  setEulerDeg(knee, 0, 0, -kneeDeg);
  // Keep the boot flat on the deck regardless of the leg chain.
  setEulerDeg(foot, 0, 0, -(hipDeg - kneeDeg));
}

/**
 * Apply one physics frame to the rig.
 *
 * Foot channels are board roles (nose/tail), not anatomical left/right — the
 * same convention `computeFrame` uses — so goofy/switch only change the
 * resting stance yaw via `resolveRiderMechanics`.
 */
export function poseFromFrame(
  rig: RigHandles,
  frame: Frame,
  spec: Spec,
  riderStance: RiderStance,
) {
  const mechanics = resolveRiderMechanics(riderStance, spec.stance);
  const oriented = orientTrickRotation(mechanics, frame.spin3d);
  const restingBodyYaw = -STANCE_BODY_YAW * mechanics.orientationSign;
  const restingHeadYaw = -(STANCE_BODY_YAW - HEAD_LOOK_FORWARD) * mechanics.orientationSign;
  const uprightP = clamp(1 - Math.abs(frame.body.rot) / 55, 0, 1);
  const bodyYawDeg = oriented.bodyYawDeg + restingBodyYaw;
  const headYawDeg =
    oriented.bodyYawDeg + restingHeadYaw * uprightP + restingBodyYaw * (1 - uprightP);

  // Lift both roots by the deck rest height so wheels sit on the asphalt when
  // computeFrame reports board.y === GROUND (its ground plane is the midplane).
  const lift = DECK_REST_HEIGHT_ART;
  rig.rider.position.copy(artToThree(frame.body.x - X0, -(GROUND - frame.body.y + lift), 0));
  rig.board.position.copy(artToThree(frame.board.x - X0, -(GROUND - frame.board.y + lift), 0));

  // Fall lean folds the whole rider (art rotZ in the travel/vertical plane →
  // Three.js rotation around Z with a sign flip for y-up).
  setEulerDeg(rig.rider, 0, 0, -frame.body.rot);

  // Resting skate stance on Rig.Stance (Blender Z → Three.js Y after yup).
  setEulerDeg(rig.stance, 0, -bodyYawDeg, 0);
  setEulerDeg(rig.torso, 0, 0, 0);
  setEulerDeg(rig.head, 0, headYawDeg - bodyYawDeg, 0);

  poseLeg(rig.hipTail, rig.kneeTail, rig.footTail, frame.footL);
  poseLeg(rig.hipNose, rig.kneeNose, rig.footNose, frame.footR);

  const armFrontDeg = THREE.MathUtils.radToDeg(frame.armFront);
  const armBackDeg = THREE.MathUtils.radToDeg(frame.armBack);
  // Shoulders: splay on X, swing in the body plane on Z (same yup remap).
  setEulerDeg(rig.shoulderFront, ARM_SPLAY, 0, armFrontDeg);
  setEulerDeg(rig.shoulderBack, -ARM_SPLAY, 0, armBackDeg);
  setEulerDeg(rig.elbowFront, 0, 0, -Math.abs(armFrontDeg) * 0.5 - 18);
  setEulerDeg(rig.elbowBack, 0, 0, -Math.abs(armBackDeg) * 0.5 - 18);

  // Board: flip (long axis / X) → pitch (Z) → yaw (Y), matching boardPoint().
  const flipRad = THREE.MathUtils.degToRad(oriented.flipDeg);
  const pitchRad = THREE.MathUtils.degToRad(frame.board.rot + frame.spin3d.forwardPitchDeg);
  const yawRad = THREE.MathUtils.degToRad(oriented.yawDeg);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), flipRad);
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -pitchRad);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -yawRad);
  rig.board.quaternion.copy(qy).multiply(qz).multiply(qx);
}

/** Retint exported materials to the selected robot's avatar palette. */
export function applyRobotPalette(
  root: THREE.Object3D,
  colors: { body: string; accent: string },
) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      const named = material as THREE.MeshToonMaterial & { name?: string };
      if (!('color' in named) || !named.color) continue;
      const materialName = (named.name ?? '').toLowerCase();
      const objectName = object.name.toLowerCase();
      // Prefer the Blender material name ("SKR Accent" / "SKR Body") so limb
      // meshes named Body.Thigh.* keep the accent fill instead of the body tint.
      if (materialName.includes('accent') || objectName.startsWith('eye.') || objectName.includes('hub')) {
        named.color.set(colors.accent);
      } else if (materialName.includes('body') || objectName.includes('boot')) {
        named.color.set(colors.body);
      }
    }
  });
}
