import { describe, expect, it } from 'vitest';
import {
  orientTrickRotation,
  resolveRiderMechanics,
  type RiderMechanics,
  type RiderStance,
  type Stance,
} from '@skrobot/animations';

interface MechanicsCase {
  riderStance: RiderStance;
  trickStance: Stance;
  expected: RiderMechanics;
}

const CASES: MechanicsCase[] = [
  {
    riderStance: 'regular',
    trickStance: 'regular',
    expected: {
      orientationSign: 1,
      bodyYawDegrees: 0,
      noseFoot: 'left',
      tailFoot: 'right',
      frontArm: 'left',
      backArm: 'right',
      travelDirection: 1,
      popFoot: 'right',
      flickFoot: 'left',
    },
  },
  {
    riderStance: 'regular',
    trickStance: 'fakie',
    expected: {
      orientationSign: 1,
      bodyYawDegrees: 0,
      noseFoot: 'left',
      tailFoot: 'right',
      frontArm: 'left',
      backArm: 'right',
      travelDirection: -1,
      popFoot: 'right',
      flickFoot: 'left',
    },
  },
  {
    riderStance: 'regular',
    trickStance: 'switch',
    expected: {
      orientationSign: -1,
      bodyYawDegrees: 0,
      noseFoot: 'right',
      tailFoot: 'left',
      frontArm: 'right',
      backArm: 'left',
      travelDirection: 1,
      popFoot: 'left',
      flickFoot: 'right',
    },
  },
  {
    riderStance: 'regular',
    trickStance: 'nollie',
    expected: {
      orientationSign: 1,
      bodyYawDegrees: 0,
      noseFoot: 'left',
      tailFoot: 'right',
      frontArm: 'left',
      backArm: 'right',
      travelDirection: 1,
      popFoot: 'left',
      flickFoot: 'right',
    },
  },
  {
    riderStance: 'goofy',
    trickStance: 'regular',
    expected: {
      orientationSign: -1,
      bodyYawDegrees: 0,
      noseFoot: 'right',
      tailFoot: 'left',
      frontArm: 'right',
      backArm: 'left',
      travelDirection: 1,
      popFoot: 'left',
      flickFoot: 'right',
    },
  },
  {
    riderStance: 'goofy',
    trickStance: 'fakie',
    expected: {
      orientationSign: -1,
      bodyYawDegrees: 0,
      noseFoot: 'right',
      tailFoot: 'left',
      frontArm: 'right',
      backArm: 'left',
      travelDirection: -1,
      popFoot: 'left',
      flickFoot: 'right',
    },
  },
  {
    riderStance: 'goofy',
    trickStance: 'switch',
    expected: {
      orientationSign: 1,
      bodyYawDegrees: 0,
      noseFoot: 'left',
      tailFoot: 'right',
      frontArm: 'left',
      backArm: 'right',
      travelDirection: 1,
      popFoot: 'right',
      flickFoot: 'left',
    },
  },
  {
    riderStance: 'goofy',
    trickStance: 'nollie',
    expected: {
      orientationSign: -1,
      bodyYawDegrees: 0,
      noseFoot: 'right',
      tailFoot: 'left',
      frontArm: 'right',
      backArm: 'left',
      travelDirection: 1,
      popFoot: 'right',
      flickFoot: 'left',
    },
  },
];

describe('rider stance mechanics', () => {
  it.each(CASES)('resolves $riderStance rider mechanics in $trickStance', ({ riderStance, trickStance, expected }) => {
    expect(resolveRiderMechanics(riderStance, trickStance)).toEqual(expected);
  });

  it.each<RiderStance>(['regular', 'goofy'])('treats fakie as a travel-only change for a %s rider', (riderStance) => {
    const regular = resolveRiderMechanics(riderStance, 'regular');
    const fakie = resolveRiderMechanics(riderStance, 'fakie');

    expect(fakie).toEqual({ ...regular, travelDirection: -1 });
  });

  it.each<RiderStance>(['regular', 'goofy'])('treats nollie as a pop-and-flick swap for a %s rider', (riderStance) => {
    const regular = resolveRiderMechanics(riderStance, 'regular');
    const nollie = resolveRiderMechanics(riderStance, 'nollie');

    expect(nollie).toEqual({
      ...regular,
      popFoot: regular.noseFoot,
      flickFoot: regular.tailFoot,
    });
  });

  it.each<RiderStance>(['regular', 'goofy'])('treats switch as the opposite footedness for a %s rider', (riderStance) => {
    const regular = resolveRiderMechanics(riderStance, 'regular');
    const switched = resolveRiderMechanics(riderStance, 'switch');

    expect(switched).toEqual({
      ...regular,
      orientationSign: regular.orientationSign * -1,
      bodyYawDegrees: regular.bodyYawDegrees,
      noseFoot: regular.tailFoot,
      tailFoot: regular.noseFoot,
      frontArm: regular.backArm,
      backArm: regular.frontArm,
      popFoot: regular.noseFoot,
      flickFoot: regular.tailFoot,
    });
  });

  it('gives switch the same un-turned skeleton as the natural stances', () => {
    const regular = resolveRiderMechanics('regular', 'regular');
    const goofy = resolveRiderMechanics('goofy', 'regular');
    const goofySwitch = resolveRiderMechanics('goofy', 'switch');

    expect(regular).toMatchObject({
      noseFoot: 'left',
      bodyYawDegrees: 0,
      orientationSign: 1,
    });
    expect(goofy).toMatchObject({
      noseFoot: 'right',
      bodyYawDegrees: 0,
      orientationSign: -1,
    });
    // Switch = the rider's opposite stance, not a backward-facing body.
    expect(goofySwitch).toMatchObject({
      noseFoot: 'left',
      bodyYawDegrees: 0,
      orientationSign: 1,
    });
  });

  it.each([
    { riderStance: 'regular' as const, kickflip: 360, heelflip: -360 },
    { riderStance: 'goofy' as const, kickflip: -360, heelflip: 360 },
  ])('keeps kickflip and heelflip opposite for a $riderStance rider', ({ riderStance, kickflip, heelflip }) => {
    const mechanics = resolveRiderMechanics(riderStance, 'regular');

    expect(orientTrickRotation(mechanics, { flipDeg: 360, yawDeg: 0, bodyYawDeg: 0 }).flipDeg).toBe(kickflip);
    expect(orientTrickRotation(mechanics, { flipDeg: -360, yawDeg: 0, bodyYawDeg: 0 }).flipDeg).toBe(heelflip);
  });

  it.each([
    { riderStance: 'regular' as const, frontside: 180, backside: -180 },
    { riderStance: 'goofy' as const, frontside: -180, backside: 180 },
  ])('derives frontside/backside rotation from a $riderStance body', ({ riderStance, frontside, backside }) => {
    const mechanics = resolveRiderMechanics(riderStance, 'regular');

    expect(orientTrickRotation(mechanics, { flipDeg: 0, yawDeg: -180, bodyYawDeg: -180 })).toMatchObject({
      yawDeg: frontside,
    });
    expect(orientTrickRotation(mechanics, { flipDeg: 0, yawDeg: 180, bodyYawDeg: 180 })).toMatchObject({
      yawDeg: backside,
    });
  });
});
