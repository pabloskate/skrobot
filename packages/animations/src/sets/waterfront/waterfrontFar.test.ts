import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_CAMERA } from '../../camera/camera';
import { stageView } from '../../camera/view';
import WaterfrontFar, { WaterfrontFarImage } from './waterfrontFar';

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;

describe('waterfront far panorama', () => {
  it('films as one image with every layer the stage shows, framed and slid the same way', () => {
    for (const scroll of [0, 180, -320]) {
      const view = stageView(30, { ...DEFAULT_SCENE_CAMERA, yaw: 20 }, 1.3, 1280 / 1034);
      const props = { cam: view.cam, scroll, view: view.box };
      const page = renderToStaticMarkup(createElement(WaterfrontFar, { ...props, idBase: 'stage' }));
      const image = renderToStaticMarkup(createElement(WaterfrontFarImage, { ...props, width: 1280, height: 1034 }));

      const { x, y, width, height } = view.box;
      expect(image.startsWith(`<svg viewBox="${x} ${y} ${width} ${height}" width="1280" height="1034"`)).toBe(true);
      // Each of the page's layer SVGs is a nested SVG in the image, inside the outer one.
      const layers = count(page, /<svg/g);
      expect(layers).toBeGreaterThan(3);
      expect(count(image, /<svg/g)).toBe(layers + 1);
      // Every layer the page slides with a transform is slid in the image too.
      expect(count(image, /<g transform="translate\([^"]*\)"><svg /g)).toBe(count(page, /translateX\(/g));
      // Painted to a canvas, the image has no page around it: no CSS, only SVG.
      expect(image).not.toContain('style=');
    }
  });
});
