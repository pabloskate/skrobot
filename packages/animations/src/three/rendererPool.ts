import type { Robot } from '../types';
import { readableAccent } from '../ui/robotColors';
import { mixHex } from '../math';
import type { StageSet } from '../sets/sets';
import type { Skater } from '../riders/skaters';
import { SceneRenderer, type RendererLook } from './renderer';

/**
 * Renderers outlive the stages that borrow them. Building one creates a
 * WebGL context, compiles every shader, and builds the whole set, which is
 * a visible hitch on a phone; a stage remounts for every new trick and every
 * retry in the game. A stage borrows a renderer for its set, rider, and
 * colors, and hands it back on unmount; the next stage that asks for the
 * same one gets it back already built.
 */

/** Idle renderers kept for reuse. One per stage on screen is plenty. */
const KEEP = 2;
/** An idle renderer nobody asks for again is let go after this long. */
const IDLE_MS = 30_000;

interface Idle {
  key: string;
  renderer: SceneRenderer;
  timer: ReturnType<typeof setTimeout>;
}

const idle: Idle[] = [];
const keys = new WeakMap<SceneRenderer, string>();

/** How a robot's colors dress the rider and the board. */
export function lookFor(robot: Pick<Robot, 'avatar'>, skater: Skater): RendererLook {
  const { body, variant } = robot.avatar;
  const accent = readableAccent(robot.avatar.accent);
  return {
    robot: { body, accent, variant },
    board: { graphic: accent, stripe: mixHex(body, '#ffffff', 0.35) },
    skater,
  };
}

const keyOf = (look: RendererLook, set: StageSet) =>
  [set, look.skater ?? 'robot', look.robot.body, look.robot.accent, look.robot.variant, look.board.graphic, look.board.stripe].join('|');

function release(entry: Idle) {
  clearTimeout(entry.timer);
  entry.renderer.dispose();
}

/** A renderer for this set and rider, reused if one is idle. Throws without WebGL 2. */
export function borrowRenderer(look: RendererLook, set: StageSet): SceneRenderer {
  const key = keyOf(look, set);
  const at = idle.findIndex((entry) => entry.key === key);
  if (at >= 0) {
    const [entry] = idle.splice(at, 1);
    clearTimeout(entry.timer);
    return entry.renderer;
  }
  const renderer = new SceneRenderer(document.createElement('canvas'), look, set);
  keys.set(renderer, key);
  return renderer;
}

/** Hand a borrowed renderer back; its canvas should already be out of the page. */
export function returnRenderer(renderer: SceneRenderer) {
  const key = keys.get(renderer);
  if (key == null) {
    renderer.dispose();
    return;
  }
  const entry: Idle = {
    key,
    renderer,
    timer: setTimeout(() => {
      const at = idle.indexOf(entry);
      if (at >= 0) release(idle.splice(at, 1)[0]);
    }, IDLE_MS),
  };
  idle.unshift(entry);
  while (idle.length > KEEP) release(idle.pop()!);
}
