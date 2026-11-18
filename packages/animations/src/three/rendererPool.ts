import type { Robot } from '../types';
import { mixHex } from '../math';
import { readableAccent } from '../ui/robotColors';
import type { StageSet } from '../sets/sets';
import type { Skater } from '../riders/skaters';
import { SceneRenderer, type RendererLook } from './renderer';

/**
 * Renderers outlive the stages that borrow them. Building one creates a
 * WebGL context, compiles every shader, and builds the rider and a set,
 * which is a visible hitch on a phone; a stage remounts for every new trick
 * and every retry in the game. A stage borrows a renderer for its rider and
 * colors, and hands it back on unmount; the next stage that asks for the
 * same gets it back already built. A renderer draws any set (it swaps them
 * under its rider and keeps the last few built), so a stage puts its own on
 * with `stage`, or `load`s it first to keep the page live meanwhile.
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

/** The selected rider and its roster colors. */
export function lookFor(robot: Pick<Robot, 'avatar'>, skater: Skater): RendererLook {
  const { body, variant } = robot.avatar;
  const accent = readableAccent(robot.avatar.accent);
  return {
    robot: { body, accent, variant },
    board: { graphic: accent, stripe: mixHex(body, '#ffffff', 0.35) },
    skater,
  };
}

const keyOf = (look: RendererLook) =>
  [look.skater ?? 'robot', look.robot.body, look.robot.accent, look.robot.variant, look.board.graphic, look.board.stripe].join('|');

/** Take an idle renderer out of the pool. */
function lend(at: number): SceneRenderer {
  const [entry] = idle.splice(at, 1);
  clearTimeout(entry.timer);
  return entry.renderer;
}

function release(entry: Idle) {
  clearTimeout(entry.timer);
  entry.renderer.dispose();
}

/** Whether `renderer` is one for this rider and colors. */
export const rendererFits = (renderer: SceneRenderer, look: RendererLook) => keys.get(renderer) === keyOf(look);

/**
 * An idle renderer for this rider and colors that has `set` built already,
 * so a stage can show it at once; null if there is none.
 */
export function borrowBuilt(look: RendererLook, set: StageSet): SceneRenderer | null {
  const key = keyOf(look);
  const at = idle.findIndex((entry) => entry.key === key && entry.renderer.has(set));
  return at >= 0 ? lend(at) : null;
}

/**
 * A renderer for this rider and colors: an idle one (by choice one with
 * `set` built), else a new one with nothing on stage yet. The borrower
 * stages `set`. Throws without WebGL 2.
 */
export function borrowRenderer(look: RendererLook, set: StageSet): SceneRenderer {
  const built = borrowBuilt(look, set);
  if (built) return built;
  const key = keyOf(look);
  const at = idle.findIndex((entry) => entry.key === key);
  if (at >= 0) return lend(at);
  const renderer = new SceneRenderer(document.createElement('canvas'), look, null);
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
