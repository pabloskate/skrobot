import { describe, expect, it } from 'vitest';
import { Bar3D } from './bar3d';

describe('flat bar finish', () => {
  it('keeps its mesh when the rider scrolls and changes its finish when switching spots at the same length', () => {
    const bar = new Bar3D();
    const span = { x0: 0, x1: 180 };
    try {
      bar.update(span, true);
      const steel = bar.group.children[0];
      bar.update({ x0: 20, x1: 200 }, true);
      expect(bar.group.children[0]).toBe(steel);

      bar.update(null, false);
      expect(bar.group.visible).toBe(false);
      bar.update(span, false);
      expect(bar.group.visible).toBe(true);
      expect(bar.group.children[0]).not.toBe(steel);
    } finally {
      bar.dispose();
    }
  });
});
