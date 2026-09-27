import type { ReactElement } from 'react';
import { PALETTE, type Camera } from './camera';
import { ball, facePath, facing, newGroup, renderGroup, roundedBox, roundedRectPts, tube, OUTLINE, type BoxSpec, type Group } from './draw';
import { dot3, mixHex, smoothstep, sub3, type V3 } from './math';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, shiftFrame, type Frame3, type Rig } from './rig';

/**
 * The TrickScene robot.
 *
 * A chunky toy build: an oversized box head with a dark visor screen, a
 * tapered chest, graphite limbs, mitt hands in the shell color and skate
 * shoes in the accent color. Identity lives in shape and color, not in
 * extra parts — the face screen carries expression, the antenna carries the
 * per-robot variant.
 */

export type Expression = 'open' | 'focus' | 'happy' | 'wince';

export interface RobotLook {
  body: string;
  accent: string;
  variant: 0 | 1 | 2 | 3;
}

const HEAD: BoxSpec = { f: 14, u: 15, s: 18, r: 8.5 };
const TORSO: BoxSpec = { f: 11, u: 25, s: 15.5, r: 8.5, taper: 0.7 };
const SHOE: BoxSpec = { f: SHOE_HALF_LENGTH, u: SHOE_HALF_HEIGHT, s: 6, r: 3.6 };
/** Sole thickness. The whole shoe is filled sole-cream, then the upper is
 *  painted over it, so only the band a real sole would show stays cream. */
const SOLE_H = 2.4;
const UPPER: BoxSpec = { f: SHOE_HALF_LENGTH, u: SHOE_HALF_HEIGHT - SOLE_H / 2, s: 6, r: 2.8 };
/** Limb widths taper root → joint → tip. */
const ARM_W = [9, 7.4, 6.4] as const;
const LEG_W = [12.5, 9.4, 7] as const;
const HAND_R = 5.2;
const SCREEN = '#271f58';

const avg = (a: V3, b: V3): V3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

function drawFace(g: Group, cam: Camera, head: Frame3, look: RobotLook, expression: Expression, opacity: number) {
  const front = HEAD.f + 0.15;
  const screenPts = roundedRectPts(front, -0.5, 0, 9.6, 14, 5.6);
  const els: ReactElement[] = [
    <path key="screen" d={facePath(cam, head, screenPts)} fill={SCREEN} />,
    // One soft glare band sells the visor as glass.
    <path key="glare" d={facePath(cam, head, [
      [front + 0.1, 7.2, -11], [front + 0.1, 7.2, -6.5], [front + 0.1, 1.8, -12.4], [front + 0.1, -0.4, -12.4],
    ])} fill="#ffffff" opacity={0.16} />,
  ];
  const s = cam.project(head.origin).s;
  const eyeF = front + 0.2;
  const eyeU = 0.2;
  const eyeS = 6.2;
  const glow = look.accent;
  for (const side of [-1, 1] as const) {
    const c = side * eyeS;
    const key = `eye${side}`;
    if (expression === 'happy') {
      els.push(
        <path key={key} d={facePath(cam, head, [[eyeF, eyeU - 1.6, c - 2.8], [eyeF, eyeU + 1.6, c], [eyeF, eyeU - 1.6, c + 2.8]], false)}
          fill="none" stroke={glow} strokeWidth={1.9 * s} strokeLinecap="round" strokeLinejoin="round" />,
      );
    } else if (expression === 'wince') {
      const tip = -side;
      els.push(
        <path key={key} d={facePath(cam, head, [[eyeF, eyeU + 2.4, c - tip * 2.2], [eyeF, eyeU, c + tip * 1.8], [eyeF, eyeU - 2.4, c - tip * 2.2]], false)}
          fill="none" stroke={glow} strokeWidth={1.8 * s} strokeLinecap="round" strokeLinejoin="round" />,
      );
    } else {
      const halfU = expression === 'focus' ? 1.5 : 3.1;
      els.push(
        <path key={key} d={facePath(cam, head, roundedRectPts(eyeF, eyeU, c, halfU, 1.9, 1.85, 3))} fill={glow} />,
      );
    }
  }
  g.fill.push(<g key="face" opacity={opacity}>{els}</g>);
}

function drawAntenna(g: Group, cam: Camera, head: Frame3, look: RobotLook) {
  const top = HEAD.u;
  const stalk = PALETTE.limb;
  switch (look.variant) {
    case 1: {
      // Swept single antenna, set off to one side.
      const base = head.at(-2, top - 1, 7);
      const tip = head.at(-6, top + 10, 9);
      tube(g, cam, base, tip, 2.2, stalk);
      ball(g, cam, tip, 2.8, look.accent);
      break;
    }
    case 2: {
      // Low crest instead of an antenna.
      roundedBox(g, cam, shiftFrame(head, -1, top + 1.2, 0), { f: 8.5, u: 3.2, s: 2, r: 1.8 }, look.accent);
      break;
    }
    case 3: {
      // Twin antennae.
      for (const side of [-1, 1]) {
        const base = head.at(0, top - 1, side * 9);
        const tip = head.at(-1, top + 7.5, side * 11.5);
        tube(g, cam, base, tip, 2, stalk);
        ball(g, cam, tip, 2.4, look.accent);
      }
      break;
    }
    default: {
      const base = head.at(0, top - 1, 0);
      const tip = head.at(0, top + 9, 0);
      tube(g, cam, base, tip, 2.2, stalk);
      ball(g, cam, tip, 3, look.accent);
    }
  }
}

/**
 * The robot and the board it rides, in paint order (back to front).
 *
 * Legs normally paint over the board they stand on. The flicking foot is the
 * exception: it leaves the deck over the far rail, and when the deck rolls up
 * between it and the camera (a regular kickflip seen from the front) the
 * board hides it. Drawing it on top there made the heelside flick read as a
 * toeside one. It fades between the two paint orders by how far the shoe is
 * past the deck plane, so the switch never pops.
 */
export function drawRobot(cam: Camera, rig: Rig, look: RobotLook, expression: Expression, board: ReactElement): ReactElement[] {
  const limb = mixHex(PALETTE.limb, look.body, 0.16);

  // Near/far from shoulder depth: shoulders don't swing, so this stays
  // stable through the crouch instead of flickering with the forearm.
  const [armA, armB] = rig.arms;
  const aNear = cam.depthOf(armA.shoulder) >= cam.depthOf(armB.shoulder);
  const nearArm = aNear ? armA : armB;
  const farArm = aNear ? armB : armA;
  const [legA, legB] = rig.legs;
  const legDepth = (l: typeof legA) => cam.depthOf(avg(l.knee, l.ankle));
  const aLegNear = legDepth(legA) >= legDepth(legB);
  const nearLeg = aLegNear ? legA : legB;
  const farLeg = aLegNear ? legB : legA;

  const armGroup = (key: string, arm: typeof armA) => {
    const g = newGroup(key);
    tube(g, cam, arm.shoulder, arm.elbow, ARM_W[0], limb, ARM_W[1]);
    tube(g, cam, arm.elbow, arm.hand, ARM_W[1], limb, ARM_W[2]);
    ball(g, cam, arm.hand, HAND_R, look.body);
    return g;
  };
  const legGroup = (key: string, leg: typeof legA) => {
    const g = newGroup(key);
    const limbs = (into: Group) => {
      tube(into, cam, leg.hip, leg.knee, LEG_W[0], limb, LEG_W[1]);
      tube(into, cam, leg.knee, leg.ankle, LEG_W[1], limb, LEG_W[2]);
    };
    // The leg rises out of the top of the shoe, so it paints over the shoe
    // while the camera looks down on that top (all of riding), and tucks
    // behind it once a fall turns the sole to the camera. The two paint
    // orders cross-fade so the swap never pops.
    const topShows = smoothstep((facing(cam, leg.ankle, leg.shoe.up) + 0.1) / 0.15);
    if (topShows < 1) limbs(g);
    const shoe = roundedBox(g, cam, leg.shoe, SHOE, PALETTE.wheel);
    roundedBox(g, cam, shiftFrame(leg.shoe, 0, SOLE_H / 2, 0), UPPER, look.accent, { outline: 0, clip: shoe });
    if (topShows > 0) {
      const over = newGroup(`${key}Over`);
      limbs(over);
      if (topShows < 1) {
        g.fill.push(<g key={over.key} opacity={topShows}>{over.fill}</g>);
      } else {
        g.outline.push(...over.outline);
        g.fill.push(...over.fill);
      }
    }
    return g;
  };

  const torso = newGroup('torso');
  roundedBox(torso, cam, rig.torso, TORSO, look.body);

  const head = newGroup('head');
  tube(head, cam, rig.torso.at(0, TORSO.u - 4, 0), rig.head.at(-1, -HEAD.u + 1, 0), 8, limb);
  drawAntenna(head, cam, rig.head, look);
  roundedBox(head, cam, rig.head, HEAD, look.body, { outline: OUTLINE * 1.1 });
  // The screen turns away gradually: fade it across the last stretch before
  // edge-on instead of switching it off when the face plane crosses the eye.
  const faceP = smoothstep((facing(cam, rig.head.at(HEAD.f, 0, 0), rig.head.fwd) - 0.02) / 0.24);
  if (faceP > 0) drawFace(head, cam, rig.head, look, expression, faceP);

  const deckCenter = rig.board.point({ x: 0, y: 0, z: 0 });
  const grip = rig.board.dir({ x: 0, y: -1, z: 0 });
  // Which face of the deck the camera sees, eased through edge-on (where
  // the wheels still have area) instead of flipping sign.
  const toEye = Math.max(-1, Math.min(1, dot3(sub3(cam.eye, deckCenter), grip) / 60));
  const hiddenBy = (leg: typeof legA) => {
    if (!leg.flicking || rig.flickOut === 0) return 0;
    const past = -toEye * dot3(sub3(leg.shoe.origin, deckCenter), grip);
    return rig.flickOut * smoothstep((past + 2) / 8);
  };
  const legs = [
    { group: legGroup('legFar', farLeg), hidden: hiddenBy(farLeg) },
    { group: legGroup('legNear', nearLeg), hidden: hiddenBy(nearLeg) },
  ];
  const behind = legs.filter((l) => l.hidden > 0.001);
  const front = legs.filter((l) => l.hidden < 0.999);

  return [
    ...behind.map((l) => <g key={`${l.group.key}Behind`}>{renderGroup(l.group)}</g>),
    board,
    renderGroup(armGroup('armFar', farArm)),
    ...front.map((l) => l.hidden > 0.001
      ? <g key={l.group.key} opacity={1 - l.hidden}>{renderGroup(l.group)}</g>
      : renderGroup(l.group)),
    renderGroup(torso),
    renderGroup(head),
    renderGroup(armGroup('armNear', nearArm)),
  ];
}
