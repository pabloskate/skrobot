import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { H, SKY_PAD, W, X0 } from '../TrickAnimation';
import type { Robot, Trick } from '../types';
import TrickScene from './TrickScene';
import { SCENE_CAMERA_BOUNDS, SCENE_ZOOM, makeCamera, zoomedViewBox, type SceneCamera } from './camera';
import { FAR_OVERSCAN, tileLayer } from './waterfront';
import { panorama, spanOf } from './waterfrontPanorama';

/**
 * The waterfront set is all backdrop: it never touches the trick, so these
 * pin what can go wrong with a backdrop. It draws cleanly from every camera
 * the explorer allows, it's the same picture every time it's drawn, the far
 * panorama always reaches both edges of the frame, and the stock plaza is
 * still what a scene gets when it doesn't ask for a set.
 */

const robot: Robot = { id: 'test', name: 'Test', avatar: { body: '#5b8def', accent: '#f2a541', variant: 0 } };
const grind: Trick = { id: 'g', name: 'Frontside 50-50 Grind', base: 'Frontside 50-50 Grind', stance: 'regular' };
const flat: Trick = { id: 'k', name: 'Kickflip', base: 'Kickflip', stance: 'fakie' };

const { yaw: YAW, pitch: PITCH, lens: LENS } = SCENE_CAMERA_BOUNDS;
const VIEWS: SceneCamera[] = [YAW.min, -26, 0, YAW.max].flatMap((yaw) =>
  [PITCH.min, 30, PITCH.max].flatMap((pitch) => [LENS.min, 1, LENS.max].map((lens) => ({ yaw, pitch, lens }))));

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(TrickScene, { robot, trick: grind, landed: true, knewIt: true, onDone: () => {}, ...props }));

describe('Waterfront set', () => {
  it('draws from every camera and zoom in the bounds without a broken path', () => {
    for (const camera of VIEWS) {
      for (const [trick, time] of [[grind, 0.4], [grind, 1.2], [flat, 0.9]] as const) {
        for (const zoom of [SCENE_ZOOM.min, 1, SCENE_ZOOM.max]) {
          const html = render({ trick, fixedTime: time, camera, zoom, set: 'waterfront' });
          const where = `${trick.name} t=${time} ${JSON.stringify(camera)} zoom ${zoom}`;
          expect(html, where).toContain('data-set="waterfront"');
          expect(html, where).not.toMatch(/NaN|Infinity/);
        }
      }
    }
  }, 30_000);

  it('is the same picture every time it is drawn', () => {
    for (const fixedTime of [0, 0.75, 1.6]) {
      expect(render({ fixedTime, set: 'waterfront' })).toBe(render({ fixedTime, set: 'waterfront' }));
    }
  });

  it('keeps the far panorama reaching both edges of the frame from every angle and zoom', () => {
    const tiles = panorama('none');
    for (const view of VIEWS) {
      const cam = makeCamera(0, view);
      const k = cam.farScale;
      for (const zoom of [SCENE_ZOOM.min, 1, SCENE_ZOOM.max]) {
        const frame = zoomedViewBox(zoom, { x: 0, y: -SKY_PAD, width: W, height: H + SKY_PAD });
        for (const tile of tiles) {
          for (const scroll of [-900, 0, 37, 2400]) {
            const layer = tileLayer(cam, tile, 'art', scroll, cam.horizonY, frame);
            if (!layer) continue;
            const where = `${tile.key} ${JSON.stringify(view)} zoom ${zoom} scroll ${scroll}`;
            const shift = layer.shift ?? 0;
            expect(Math.abs(shift), where).toBeLessThanOrEqual(FAR_OVERSCAN / 2 + 1e-9);
            expect(layer.box.x + shift, where).toBeLessThanOrEqual(frame.x);
            expect(layer.box.x + layer.box.width + shift, where).toBeGreaterThanOrEqual(frame.x + frame.width);
            // Slid into place, every copy lands where the tile's drift puts it.
            const xs = [...renderToStaticMarkup(layer.art).matchAll(/translate\((-?[\d.]+) /g)].map((m) => Number(m[1]));
            expect(xs[0], where).toBeLessThanOrEqual(layer.box.x);
            expect(xs[xs.length - 1] + tile.period * k, where).toBeGreaterThanOrEqual(layer.box.x + layer.box.width);
            const drift = tile.drift * scroll * cam.drift;
            for (const x of xs) {
              const n = Math.round((x - X0 - k * (tile.origin - cam.pan - drift) - shift) / (k * tile.period));
              expect(x + shift, where).toBeCloseTo(X0 + k * (tile.origin + n * tile.period - cam.pan - drift), 1);
            }
          }
        }
      }
    }
  });

  it('slides the far panorama for a while before redrawing it', () => {
    const cam = makeCamera(0, { yaw: -26, pitch: 9, lens: 1 });
    const frame = zoomedViewBox(1, { x: 0, y: -SKY_PAD, width: W, height: H + SKY_PAD });
    for (const tile of panorama('none')) {
      const markup = (scroll: number) => renderToStaticMarkup(tileLayer(cam, tile, 'art', scroll, cam.horizonY, frame)!.art);
      // A frame's worth of street barely moves a tile: the same art, just slid.
      let redraws = 0;
      for (let scroll = 0; scroll < 2000; scroll += 5) if (markup(scroll) !== markup(scroll + 5)) redraws++;
      expect(redraws, tile.key).toBeLessThanOrEqual(Math.ceil((2000 * tile.drift) / FAR_OVERSCAN) + 1);
    }
  });

  it('frames every panorama tile tightly around its art', () => {
    expect(spanOf(['M0 -3h5v6h-5Z'])).toEqual([-3, 3]);
    expect(spanOf(['M10 -4a4 4 0 1 1 8 0a4 4 0 1 1 -8 0Z'])).toEqual([-8, 0]);
    expect(spanOf(['M0 0Q5 -12 10 0Q5 2 0 0Z'])).toEqual([-12, 2]);
    expect(spanOf(['M0 3L8 -20L16 3Z', 'M0 -1v-4.2'])).toEqual([-20, 3]);
    expect(() => spanOf(['M0 0C1 1 2 2 3 3'])).toThrow(/unsupported/);
    for (const tile of panorama('none')) {
      const [top, bottom] = tile.artSpan;
      expect(top, tile.key).toBeLessThan(0);
      expect(bottom, tile.key).toBeLessThan(10);
      if (tile.reflection) {
        const [rTop, rBottom] = tile.reflectionSpan;
        expect(rTop, tile.key).toBeGreaterThan(-2);
        expect(rBottom, tile.key).toBeGreaterThan(20);
      }
    }
  });

  it('leaves the stock plaza as the set a scene gets by default', () => {
    for (const fixedTime of [0.3, 1.1]) {
      const stock = render({ fixedTime });
      expect(stock).toContain('data-set="plaza"');
      expect(stock).toBe(render({ fixedTime, set: 'plaza' }));
      expect(stock).not.toBe(render({ fixedTime, set: 'waterfront' }));
    }
  });
});
