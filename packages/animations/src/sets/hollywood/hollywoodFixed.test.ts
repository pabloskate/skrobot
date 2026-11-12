import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildHollywoodGeometry } from './hollywood3d';
import { HOLLYWOOD_12_RUN, HOLLYWOOD_FENCE_Z, HOLLYWOOD_FOOT as F, HOLLYWOOD_RUN } from './hollywoodLayout';

/**
 * The riding hardware never moves when the scenery round it is rebuilt.
 * Each flight is checked in its own frame, near its own stairs, so the
 * walkway between the two can change length without these changing:
 * its handrails (inks 60 to 62) from six feet before the lip to six past
 * the bottom step, and the black pickets (73) and their posts (144) from
 * three feet before the lip to twelve past the bottom step, which is the
 * stretch the fence line crosses. Ink ids count up across a box's faces, so
 * another box can share 144: only what stands on the fence line is a post.
 */
const digest = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 12);
const round = (value: number) => (Math.round(value * 100) / 100 + 0).toFixed(2);

const FIXED = {
  sixteen: {
    run: HOLLYWOOD_RUN,
    rails: [3024, '3de967a3f610'], pickets: [3160, '3873290a0eac'], posts: [24, '6924bbf11351'],
    segments: [15, 'a45953e9236e'],
  },
  twelve: {
    run: HOLLYWOOD_12_RUN,
    rails: [2160, '89b66185e445'], pickets: [2590, 'c5a7939a6f21'], posts: [24, '35c02d38e42b'],
    segments: [11, '0f4c33a78b83'],
  },
} as const;

describe('Hollywood fixed riding hardware', () => {
  it.each(['sixteen', 'twelve'] as const)('keeps every rail, picket and post of the %s where it stands', (flight) => {
    const fixed = FIXED[flight];
    const built = buildHollywoodGeometry(flight);
    try {
      const position = built.props.getAttribute('position');
      const info = built.props.getAttribute('aInfo');
      const fingerprint = (ids: number[], from: number, to: number, onFence = false) => {
        const points: string[] = [];
        for (let i = 0; i < position.count; i++) {
          if (!ids.includes(Math.round(info.getX(i) * 255))) continue;
          const x = position.getX(i);
          if (x <= from || x >= to) continue;
          // The twelve's scene is turned, so its fence is at the same distance the other side.
          if (onFence && Math.abs(Math.abs(position.getZ(i)) - Math.abs(HOLLYWOOD_FENCE_Z)) > 6) continue;
          points.push([x, position.getY(i), position.getZ(i)].map(round).join(','));
        }
        return [points.length, digest(points.sort().join(';'))];
      };
      expect(fingerprint([60, 61, 62], -6 * F, fixed.run + 6 * F), 'handrails').toEqual(fixed.rails);
      expect(fingerprint([73], -3 * F + 1, fixed.run + 12 * F - 1), 'pickets').toEqual(fixed.pickets);
      expect(fingerprint([144], -3 * F + 1, fixed.run + 12 * F - 1, true), 'picket posts').toEqual(fixed.posts);

      const near = built.railSegments.filter(({ a, b }) =>
        [a[0], b[0]].every(x => x > -6 * F && x < fixed.run + 6 * F));
      expect([near.length, digest(JSON.stringify(near, (_key, value) =>
        typeof value === 'number' ? Math.round(value * 100) / 100 : value))], 'rail shadow segments').toEqual(fixed.segments);
    } finally {
      built.ground.dispose(); built.props.dispose(); built.decals.dispose();
    }
  });
});
