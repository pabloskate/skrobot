import { afterEach, describe, expect, it, vi } from 'vitest';

// Building a real renderer needs WebGL; the pool only cares that one was built and when it's let go.
vi.mock('./renderer', () => ({
  SceneRenderer: class {
    disposed = false;
    constructor(readonly canvas: unknown, readonly look: unknown, readonly set: string) {}
    dispose() {
      this.disposed = true;
    }
  },
}));
vi.stubGlobal('document', { createElement: () => ({}) });

const { borrowRenderer, lookFor, returnRenderer } = await import('./rendererPool');

const robot = { avatar: { body: '#5b8def', accent: '#f2a541', variant: 0 as const } };

describe('renderer pool', () => {
  afterEach(() => vi.useRealTimers());

  it('hands a returned renderer to the next stage with the same set, rider, and colors', () => {
    const first = borrowRenderer(lookFor(robot, 'robot'), 'waterfront');
    returnRenderer(first);
    expect(borrowRenderer(lookFor(robot, 'robot'), 'waterfront')).toBe(first);
  });

  it('builds a new one for another set or rider, and never lends one renderer twice', () => {
    const a = borrowRenderer(lookFor(robot, 'robot'), 'plaza');
    const b = borrowRenderer(lookFor(robot, 'robot'), 'plaza');
    expect(b).not.toBe(a);
    returnRenderer(a);
    expect(borrowRenderer(lookFor(robot, 'realistic'), 'plaza')).not.toBe(a);
    expect(borrowRenderer(lookFor(robot, 'robot'), 'el-toro')).not.toBe(a);
  });

  it('lets go of renderers nobody asks for again', () => {
    vi.useFakeTimers();
    const kept = borrowRenderer(lookFor(robot, 'realistic'), 'el-toro') as unknown as { disposed: boolean };
    returnRenderer(kept as never);
    expect(kept.disposed).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(kept.disposed).toBe(true);
  });

  it('keeps only a couple idle, disposing the oldest', () => {
    const sets = ['plaza', 'waterfront', 'el-toro'] as const;
    const borrowed = sets.map((set) => borrowRenderer(lookFor(robot, 'robot'), set) as unknown as { disposed: boolean });
    for (const renderer of borrowed) returnRenderer(renderer as never);
    expect(borrowed.map((r) => r.disposed)).toEqual([true, false, false]);
  });
});
