import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { RobotLook } from '../riders/look';
import type { Skater } from '../riders/skaters';
import type { StageSet } from '../sets/sets';
import type { SceneRenderer } from './renderer';
import { borrowBuilt, borrowRenderer, lookFor, rendererFits, returnRenderer } from './rendererPool';

/** Device pixels drawn per CSS pixel: supersampled on ordinary screens, native on retina. */
const PIXEL_RATIO = 2;
/** A tab that isn't being drawn gets no animation frames; a load there starts after this long instead. */
const UNPAINTED_MS = 120;

/**
 * Resolves once the page has painted what it was just told to show, so work
 * that will stall it starts with that already on screen.
 */
function painted(): Promise<void> {
  return new Promise((resolve) => {
    const late = setTimeout(resolve, UNPAINTED_MS);
    // An animation frame's callback runs just before that frame is painted; a timer set in it, just after.
    requestAnimationFrame(() => {
      clearTimeout(late);
      setTimeout(resolve, 0);
    });
  });
}

/** Size `scene` to the box its canvas fills. */
function fit(box: HTMLDivElement | null, scene: SceneRenderer | null) {
  if (!box) return;
  const rect = box.getBoundingClientRect();
  scene?.setSize(rect.width, rect.height, PIXEL_RATIO);
}

interface Options {
  /** The box the picture fills, and the element inside it the canvas goes in. */
  host: RefObject<HTMLDivElement | null>;
  slot: RefObject<HTMLDivElement | null>;
  look: RobotLook;
  skater: Skater;
  set: StageSet;
  /** Draws the current frame on `renderer`; called whenever the picture needs redrawing. */
  draw: RefObject<() => void>;
  /** See TrickScene3D's `onLoading`. */
  onLoading?: (loading: boolean) => void;
}

/**
 * The renderer a stage draws with: borrowed from the pool for the rider and
 * colors, its canvas put in the page, the stage's set put on it, and kept the
 * size of its box.
 *
 * A scene that's already built (the same renderer with the set still in it,
 * or an idle one from the pool) is on screen in the same frame. One that has
 * to be built either is built right there, stalling the page until it's done
 * (a stage with its own clock can't wait), or, with `onLoading`, is loaded a
 * step at a time off the click: the host is told, the last picture stays up
 * untouched until the new one is ready to take its place, then the host is
 * told it's done.
 *
 * `renderer` is null while there is nothing right to draw on (before the
 * first scene, and while the picture on screen is the last scene's).
 */
export function useStageRenderer({ host, slot, look, skater, set, draw, onLoading }: Options) {
  const renderer = useRef<SceneRenderer | null>(null);
  /** The renderer whose canvas is in the page. It stays through a change of set or rider until the next scene takes over. */
  const shown = useRef<SceneRenderer | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const deferred = onLoading != null;
  const told = useRef({ onLoading, loading: false });
  useEffect(() => {
    told.current.onLoading = onLoading;
  });
  const tellLoading = useCallback((loading: boolean) => {
    if (told.current.loading === loading) return;
    told.current.loading = loading;
    told.current.onLoading?.(loading);
  }, []);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    const observer = new ResizeObserver(() => {
      fit(box, shown.current);
      draw.current();
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [host, draw]);

  // Only the robot's colors and the rider need a different renderer; a new set is swapped into it, and a new trick reuses it as it is.
  const { body, accent, variant } = look;
  useEffect(() => {
    const into = slot.current;
    if (!into) return;
    const wanted = lookFor({ avatar: { body, accent, variant } }, skater);
    let live = true;

    /** Put `scene` in the page in place of whatever is there, with the set on its stage, and draw. */
    const show = (scene: SceneRenderer) => {
      const last = shown.current;
      if (last !== scene) {
        if (last) {
          last.canvas.remove();
          returnRenderer(last);
        }
        const canvas = scene.canvas;
        canvas.setAttribute('aria-hidden', 'true');
        Object.assign(canvas.style, { display: 'block', width: '100%', height: '100%' });
        into.append(canvas);
        shown.current = scene;
      }
      scene.stage(set);
      renderer.current = scene;
      fit(host.current, scene);
      draw.current();
      // A paused or reduced-motion scene has no animation tick to repaint decoded textures.
      void scene.ready.then(() => { if (live && renderer.current === scene) draw.current(); });
      tellLoading(false);
    };
    /** No WebGL 2: say so in place of the picture. */
    const fail = () => {
      setUnsupported(true);
      tellLoading(false);
    };

    const mine = shown.current && rendererFits(shown.current, wanted) ? shown.current : null;
    try {
      if (!deferred) {
        show(mine ?? borrowRenderer(wanted, set));
        return () => { live = false; };
      }
      const built = mine?.has(set) ? mine : mine ? null : borrowBuilt(wanted, set);
      if (built) {
        show(built);
        return () => { live = false; };
      }
    } catch {
      fail();
      return () => { live = false; };
    }

    // It has to be built. Leave the last picture up, untouched, and build off the click.
    renderer.current = null;
    tellLoading(true);
    void (async () => {
      await painted();
      if (!live) return;
      let scene: SceneRenderer;
      try {
        scene = mine ?? borrowRenderer(wanted, set);
      } catch {
        fail();
        return;
      }
      try {
        await scene.load(set);
      } catch {
        // Whatever went wrong getting it ready early, staging builds what's missing.
      }
      if (!live) {
        // Superseded while loading. What it built stays in the renderer, should the viewer come back to it.
        if (scene !== shown.current) returnRenderer(scene);
        return;
      }
      show(scene);
    })();
    return () => { live = false; };
  }, [body, accent, variant, skater, set, deferred, host, slot, draw, tellLoading]);

  // Gone for good: out of the page and back to the pool.
  useEffect(() => () => {
    const scene = shown.current;
    shown.current = null;
    renderer.current = null;
    if (scene) {
      scene.canvas.remove();
      returnRenderer(scene);
    }
    tellLoading(false);
  }, [tellLoading]);

  return { renderer, unsupported };
}
