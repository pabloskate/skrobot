import { afterEach, describe, expect, it, vi } from 'vitest';

// Building a real renderer needs WebGL; the pool only cares that one was built, what it has staged, and when it's let go.
vi.mock('./renderer', () => ({
  SceneRenderer: class {
    disposed = false;
    readonly staged: string[] = [];
    constructor(readonly canvas: unknown, readonly look: unknown, set: string | null) {
      if (set) this.staged.push(set);
    }
    has(set: string) {
      return this.staged.includes(set);
    }
    stage(set: string) {
      if (!this.has(set)) this.staged.push(set);
    }
    dispose() {
      this.disposed = true;
    }
  },
}));
vi.stubGlobal('document', { createElement: () => ({}) });

const { borrowBuilt, borrowRenderer, lookFor, rendererFits, returnRenderer } = await import('./rendererPool');

const robot = { avatar: { body: '#5b8def', accent: '#f2a541', variant: 0 as const } };
const other = { avatar: { body: '#e2574c', accent: '#f2a541', variant: 0 as const } };

describe('renderer pool', () => {
  afterEach(() => vi.useRealTimers());

  it('hands a returned renderer to the next stage with the same rider and colors, whatever its set', () => {
    const first = borrowRenderer(lookFor(robot, 'robot'), 'waterfront');
    first.stage('waterfront');
    returnRenderer(first);
    expect(borrowRenderer(lookFor(robot, 'robot'), 'el-toro')).toBe(first);
  });

  it('builds a new one, with nothing staged, for another rider or colors, and never lends one renderer twice', () => {
    const a = borrowRenderer(lookFor(robot, 'robot'), 'plaza');
    const b = borrowRenderer(lookFor(robot, 'robot'), 'plaza');
    expect(b).not.toBe(a);
    expect(a.has('plaza')).toBe(false);
    returnRenderer(a);
    expect(borrowRenderer(lookFor(robot, 'realistic'), 'plaza')).not.toBe(a);
    expect(borrowRenderer(lookFor(other, 'robot'), 'plaza')).not.toBe(a);
    expect(rendererFits(a, lookFor(robot, 'robot'))).toBe(true);
    expect(rendererFits(a, lookFor(robot, 'realistic'))).toBe(false);
  });

  it('prefers the idle renderer that has the set built, and offers no other as built', () => {
    const look = lookFor(robot, 'robot');
    const plaza = borrowRenderer(look, 'plaza');
    const toro = borrowRenderer(look, 'el-toro');
    plaza.stage('plaza');
    toro.stage('el-toro');
    returnRenderer(toro);
    returnRenderer(plaza);
    expect(borrowBuilt(look, 'waterfront')).toBeNull();
    expect(borrowBuilt(lookFor(other, 'robot'), 'el-toro')).toBeNull();
    expect(borrowRenderer(look, 'el-toro')).toBe(toro);
    expect(borrowBuilt(look, 'plaza')).toBe(plaza);
  });

  it('lets go of renderers nobody asks for again', () => {
    vi.useFakeTimers();
    const kept = borrowRenderer(lookFor(robot, 'alien'), 'el-toro') as unknown as { disposed: boolean };
    returnRenderer(kept as never);
    expect(kept.disposed).toBe(false);
    vi.advanceTimersByTime(60_000);
    expect(kept.disposed).toBe(true);
  });

  it('keeps only a couple idle, disposing the oldest', () => {
    const skaters = ['robot', 'realistic', 'windup'] as const;
    const borrowed = skaters.map((skater) => borrowRenderer(lookFor(robot, skater), 'plaza') as unknown as { disposed: boolean });
    for (const renderer of borrowed) returnRenderer(renderer as never);
    expect(borrowed.map((r) => r.disposed)).toEqual([true, false, false]);
  });
});
