import { boardHalfWidth } from '../../board/boardDimensions';
import { WHEEL_BOTTOM } from '../../board/board';
import { deckTopY, TIP_X } from '../../board/deck';
import { add3, cross3, dot3, lerp3, norm3, rad, scale3, smoothstep, sub3, type V3 } from '../../math';
import { GRAVITY } from '../../units';
import { carriedFrame, carriedRig, mapUpper, shiftRig } from '../dynamics';
import { SHOE_HALF_HEIGHT, SHOE_HALF_LENGTH, SHOE_HALF_WIDTH, moveFrame, type ArmRig, type BoardRig, type LegRig, type Rig } from '../skeleton';
import { LIMB_RADII, twoBone, type BodyDims } from './body';
import { level, rightOf, UP } from './footing';
import { bodyClearance, trunkInGround } from './rollOut';
import { legsApart, turnLeg } from './selfContact';
import { frameQuat, qaxis, qconj, qframe, qmul, qrot, qslerp } from './rotation';

type Ground = (x: number, z: number) => number;

function withinReach(root: V3, end: V3, max: number): V3 {
  const d = sub3(end, root);
  const length = Math.hypot(d.x, d.y, d.z);
  return length > max ? add3(root, scale3(d, max / length)) : end;
}

/** Rotate a bent knee or elbow about its two fixed endpoints until the joint clears the landing. */
function jointAbove(root: V3, end: V3, a: number, b: number, pole: V3, radius: number, ground: Ground): V3 {
  const solve = (p: V3) => twoBone(root, end, a, b, p);
  const initial = solve(pole);
  if (initial.y + radius <= ground(initial.x, initial.z)) return initial;
  const high = solve(UP);
  if (high.y + radius >= ground(high.x, high.z)) return high;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 10; i++) {
    const k = (lo + hi) / 2;
    const p = solve(lerp3(norm3(pole), UP, k));
    if (p.y + radius > ground(p.x, p.z)) lo = k;
    else hi = k;
  }
  return solve(lerp3(norm3(pole), UP, hi));
}

/** A shoe that's still crossing the board comes down onto the grip before it reaches the concrete. */
function floorByDeck(board: BoardRig, p: V3, ground: Ground): number {
  const offset = sub3(p, board.center);
  const floor = ground(p.x, p.z);
  // When a deck leaves a bank lip, a peeling foot drops through the extra
  // height over its outward travel. A fixed edge blend snaps it onto the lower slab.
  const releaseWidth = 8 + Math.max(0, floor - board.center.y - WHEEL_BOTTOM);
  if (Math.hypot(offset.x, offset.z) > Math.hypot(TIP_X + releaseWidth, boardHalfWidth(0) + releaseWidth)) return floor;
  const up = board.dir(UP);
  if (up.y > -0.25) return floor;
  const onPlane = { x: offset.x, y: -(up.x * offset.x + up.z * offset.z) / up.y, z: offset.z };
  const x = dot3(onPlane, board.dir({ x: 1, y: 0, z: 0 }));
  const z = dot3(onPlane, board.dir({ x: 0, y: 0, z: 1 }));
  const edge = Math.max(Math.abs(x) - TIP_X, Math.abs(z) - boardHalfWidth(0));
  const grip = board.center.y + onPlane.y - deckTopY(x) / up.y;
  return floor - Math.max(0, floor - grip) * (1 - smoothstep(edge / releaseWidth));
}

/** The most a loose leg is swung up at its hip to keep it out of the ground (degrees). */
const LEG_LIFT_MOST = 75;

/**
 * The rig with its legs giving to the ground it lies on: they swing up at the hip by as much as their lowest point is in
 * it (a few passes, each as smooth as the pose, so nothing snaps), as much as the feet are `loose` to (0 → 1). Both swing
 * together: lying on its side, the legs stay one on the other.
 */
export function legsOnGround(rig: Rig, body: BodyDims, ground: Ground, loose: number): Rig {
  if (loose <= 0) return rig;
  const k = body.scale;
  let legs = rig.legs;
  let lifted = 0;
  for (let pass = 0; pass < 5 && lifted < LEG_LIFT_MOST; pass++) {
    let depth = 0;
    let reach: V3 | null = null;
    for (const leg of legs) {
      const check = (p: V3, r: number) => {
        const into = p.y + r - ground(p.x, p.z);
        if (into > depth) {
          depth = into;
          reach = sub3(p, leg.hip);
        }
      };
      check(leg.knee, LIMB_RADII.knee * k);
      check(leg.ankle, LIMB_RADII.ankle * k);
      for (const f of [-1, 1]) for (const u of [-1, 1]) for (const s of [-1, 1]) {
        check(leg.shoe.at(f * SHOE_HALF_LENGTH * k, u * SHOE_HALF_HEIGHT * k, s * SHOE_HALF_WIDTH * k), 0);
      }
    }
    if (!reach) break;
    // About the level axis square to the hip's line to that point, which takes it straight up.
    const out: V3 = reach;
    const along = Math.hypot(out.x, out.z);
    if (along < 1e-3) break;
    const axis = cross3(norm3(out), UP);
    // (A point right under the hip can't be swung out of the ground either way: there the body rides up on it instead.)
    const leg = body.thigh + body.shin;
    const turn = Math.min(LEG_LIFT_MOST - lifted, (Math.asin(Math.min(1, depth / Math.max(along, 0.3 * leg))) * 180) / Math.PI)
      * Math.min(1, along / (0.15 * leg));
    lifted += turn;
    legs = legs.map(leg => turnLeg(leg, norm3(axis), turn * loose)) as Rig['legs'];
  }
  return lifted > 0 ? { ...rig, legs } : rig;
}

/** The soles slip in the deck's direction. The rider keeps travelling over them, loads one hip and braces on the low arm. */
export function washOutBody(
  caught: Rig, board: BoardRig, elapsed: number, side: number, travel: V3, dims: BodyDims, ground: Ground,
): Rig {
  const deckShift = sub3(board.center, caught.board.center);
  const slip = scale3(rightOf(travel), side);
  const tip = smoothstep((elapsed - 0.025) / 0.46);
  const slide = smoothstep((elapsed - 0.32) / 0.55);
  const settle = smoothstep((elapsed - 0.82) / 0.54);
  const axis = scale3(travel, side);
  const roll = qaxis(axis, rad(56 * tip - 3 * settle));
  const hips = lerp3(caught.legs[0].hip, caught.legs[1].hip, 0.5);
  // Rotate about the rider's middle. As the head goes one way the pelvis goes slightly the other.
  const pivot = add3(hips, scale3(UP, 11 * dims.scale));
  const turn = (v: V3) => qrot(roll, v);
  let body = carriedRig(caught, p => add3(pivot, turn(sub3(p, pivot))), turn);
  // Compression has pitched the chest either into or away from the fall depending
  // on the trick. The low shoulder rolls across the hip in the direction of travel.
  const shoulderAxis = level(add3(axis, scale3(slip, 0.46 * side)));
  const shoulderRoll = qaxis(shoulderAxis, rad(69 * tip + 7 * slide - 4 * settle));
  const chest = frameQuat(caught.torso);
  const square = qslerp(chest, qframe(level(caught.torso.fwd), UP), tip);
  const twist = qaxis(UP, rad(side * (13 * tip + 20 * slide)));
  const chestTurn = qmul(qmul(shoulderRoll, qmul(twist, square)), qconj(frameQuat(body.torso)));
  const sitting = lerp3(body.legs[0].hip, body.legs[1].hip, 0.5);
  const aboutHip = (p: V3) => add3(sitting, qrot(chestTurn, sub3(p, sitting)));
  body = mapUpper(body, aboutHip, f => carriedFrame(f, aboutHip, d => qrot(chestTurn, d)));
  // The neck flexes away from the landing while the shoulder goes down.
  const neck = body.head.at(0, -17 * dims.scale, 0);
  const tuck = qaxis(axis, -rad(23 * tip));
  body.head = carriedFrame(body.head, p => add3(neck, qrot(tuck, sub3(p, neck))), d => qrot(tuck, d));
  // The ridden pose supplies the impact compression. As lateral support disappears the hip
  // falls under gravity, until the lowest point on the pelvis, shoulder or chest carries weight.
  const freeTime = Math.max(0, elapsed - 0.085);
  const drop = Math.min(deckShift.y * (1 - tip) + GRAVITY * freeTime * freeTime / 2,
    // The bracing palm and bent leg bear some of the weight as the shoulder rolls through.
    ground(sitting.x, sitting.z) - sitting.y - (14 - 5 * settle) * dims.scale,
    -trunkInGround(body, dims, ground));
  body = shiftRig(body, { x: 0, y: drop, z: 0 });

  const lead = dot3(sub3(caught.legs[0].shoe.origin, caught.legs[1].shoe.origin), travel) > 0 ? 0 : 1;
  const legLength = dims.thigh + dims.shin;
  body.legs = body.legs.map((leg, i) => {
    const start = caught.legs[i];
    const leading = i === lead;
    const loose = smoothstep((elapsed - (leading ? 0.055 : 0.025)) / (leading ? 0.33 : 0.27));
    const carried = add3(start.shoe.origin, deckShift);
    // The leading leg slides long on its heel. The other folds and comes down beside the hip.
    const slideLimit = legLength * (leading ? 0.65 : 0.27);
    const sideways = slideLimit * smoothstep((elapsed - 0.025) / (leading ? 0.54 : 0.36));
    const rest = add3(start.shoe.origin, add3(scale3(slip, sideways),
      scale3(travel, legLength * (leading ? 0.32 - 0.19 * slide : -0.08 - 0.29 * slide))));
    rest.y = ground(rest.x, rest.z);
    const at = lerp3(carried, rest, loose);
    const toe = level(add3(level(start.shoe.fwd), scale3(travel, leading ? 0.45 : -0.22)));
    const shoeQ = frameQuat(start.shoe);
    const endQ = qframe(add3(toe, scale3(UP, leading ? 0.42 : 0.09)), UP);
    const delta = qmul(qslerp(shoeQ, endQ, loose), qconj(shoeQ));
    const shoeTurn = (v: V3) => qrot(delta, v);
    let shoe = carriedFrame(start.shoe, p => add3(at, shoeTurn(sub3(p, start.shoe.origin))), shoeTurn);
    let clearance = Infinity;
    for (const f of [-SHOE_HALF_LENGTH, 0, SHOE_HALF_LENGTH]) {
      for (const s of [-SHOE_HALF_WIDTH, 0, SHOE_HALF_WIDTH]) {
        const sole = shoe.at(f, -SHOE_HALF_HEIGHT, s);
        clearance = Math.min(clearance, floorByDeck(board, sole, ground) - sole.y);
      }
    }
    // A released foot skims over the deck edge before its heel lands.
    const lift = (leading ? 3 : 7) * dims.scale * Math.sin(Math.PI * loose);
    shoe = moveFrame(shoe, { x: 0, y: Math.min(0, clearance) - lift, z: 0 });
    const desired = add3(shoe.origin, shoeTurn(sub3(start.ankle, start.shoe.origin)));
    const ankle = withinReach(leg.hip, desired, legLength * 0.9999);
    shoe = moveFrame(shoe, sub3(ankle, desired));
    const pole = lerp3(norm3(sub3(start.knee, start.hip)), norm3(add3(scale3(UP, leading ? 0.5 : 0.8), level(start.shoe.fwd))), loose);
    const knee = jointAbove(leg.hip, ankle, dims.thigh, dims.shin, pole, LIMB_RADII.knee * dims.scale, ground);
    return { ...leg, ankle, knee, shoe };
  }) as [LegRig, LegRig];

  const low = dot3(sub3(caught.arms[0].shoulder, caught.arms[1].shoulder), slip) < 0 ? 0 : 1;
  const armLength = dims.upperArm + dims.forearm;
  body.arms = body.arms.map((arm, i) => {
    const brace = i === low;
    const reach = smoothstep(elapsed / (brace ? 0.22 : 0.32));
    // The lower hand meets the ground, then its elbow yields as the hip slides past.
    // The free arm balances the fall and folds across the chest.
    const target = brace
      ? add3(arm.shoulder, add3(scale3(slip, -armLength * (0.43 - 0.14 * settle)), scale3(travel, armLength * 0.30)))
      : body.torso.at(17 * dims.scale, 12 * dims.scale, (i === 0 ? -1 : 1) * 2 * dims.scale);
    if (brace) target.y = ground(target.x, target.z) - LIMB_RADII.hand * dims.scale;
    const desired = lerp3(arm.hand, target, reach);
    desired.y = Math.min(desired.y, ground(desired.x, desired.z) - LIMB_RADII.hand * dims.scale);
    const hand = withinReach(arm.shoulder, desired, 0.995 * armLength);
    const elbowOut = brace ? add3(scale3(slip, -0.7), scale3(travel, -0.7)) : sub3(arm.shoulder, body.torso.origin);
    const pole = lerp3(norm3(sub3(arm.elbow, arm.shoulder)), norm3(elbowOut), reach);
    const elbow = jointAbove(arm.shoulder, hand, dims.upperArm, dims.forearm, pole, LIMB_RADII.forearm * dims.scale, ground);
    return { ...arm, elbow, hand };
  }) as [ArmRig, ArmRig];
  // Folding down onto the hip, one leg comes off the other rather than through it.
  body = legsOnGround(legsApart(body, dims, tip), dims, ground, 1);
  // A bank or lip can rise into the reaching joints from the side.
  const gap = bodyClearance(body, dims, ground);
  if (gap < 0) body = shiftRig(body, { x: 0, y: gap, z: 0 });
  return { ...body, board, free: tip };
}
