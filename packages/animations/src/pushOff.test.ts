import { describe, expect, it } from 'vitest';
import { createPushOffTimeline, pushOffFrame } from './pushOff';

describe('Push Off timeline', () => {
  for (const count of [3, 5]) {
    it(`hits ${count} letters on grounded front-wheel clacks, then stops centered`, () => {
      const ride = createPushOffTimeline(count);
      expect(ride.letterTimes).toHaveLength(count);
      expect(ride.letterTimes).toEqual(ride.frontClacks.slice(0, count));
      expect(ride.letterTimes[count - 1]).toBeLessThan(ride.pop);
      expect(ride.frontClacks.filter((t) => t > ride.pop && t < ride.land)).toEqual([]);
      expect(ride.backClacks.filter((t) => t > ride.pop && t < ride.land)).toEqual([]);
      expect(ride.pop).toBeLessThan(ride.land);
      expect(ride.land).toBeLessThan(ride.slide);
      expect(ride.slide).toBeLessThan(ride.stop);
      expect(ride.stop).toBeLessThan(ride.exit);
      expect(ride.end).toBeLessThan(3.5);
      const stopped = pushOffFrame(ride, ride.stop);
      expect(stopped.speed).toBe(0);
      expect(stopped.x - stopped.camera).toBeCloseTo(195, 3);
    });
  }
});
