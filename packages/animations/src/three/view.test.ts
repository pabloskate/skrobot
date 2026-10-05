import { describe, expect, it } from 'vitest';
import { GROUND, X0 } from '../TrickAnimation';
import { SCENE_CAMERA_BOUNDS, type SceneCamera } from '../scene/camera';
import { fitViewBox, projectThree, stageView, STOCK_VIEW, toThree } from './view';

const { yaw, pitch, lens } = SCENE_CAMERA_BOUNDS;
const CAMERAS: SceneCamera[] = [
  { yaw: -26, pitch: 9, lens: 1 },
  { yaw: yaw.min, pitch: pitch.min, lens: lens.min },
  { yaw: yaw.max, pitch: pitch.max, lens: lens.max },
  { yaw: 0, pitch: 3, lens: 1.25 },
  { yaw: 58, pitch: 14, lens: 0.85 },
  ...[-180, -125, -90, 0, 90, 175].map((yaw) => ({ yaw, pitch: 6, lens: 1, targetZ: -174 })),
];

describe('TrickScene3D camera', () => {
  it('projects every point exactly where the scene camera does', () => {
    for (const camera of CAMERAS) {
      for (const lift of [0, 40, -25]) {
        const view = stageView(lift, camera);
        for (const p of [
          { x: X0, y: GROUND, z: 0 },
          { x: X0 + 40, y: GROUND - 130, z: 12 },
          { x: X0 - 200, y: GROUND - 30, z: -60 },
          { x: X0 + 900, y: GROUND, z: -440 },
        ]) {
          // Past the near plane the scene camera clamps instead of projecting.
          if (!view.cam.sees(p)) continue;
          const want = view.cam.project(p);
          const got = projectThree(view, toThree(p));
          expect(got.x).toBeCloseTo(want.x, 6);
          expect(got.y).toBeCloseTo(want.y, 6);
        }
      }
    }
  });

  it('frames the stock picture on a canvas of its own shape, and shows more scene on any other', () => {
    expect(fitViewBox(STOCK_VIEW, STOCK_VIEW.width / STOCK_VIEW.height)).toEqual(STOCK_VIEW);
    const wide = fitViewBox(STOCK_VIEW, 2);
    expect(wide.height).toBe(STOCK_VIEW.height);
    expect(wide.x + wide.width / 2).toBeCloseTo(STOCK_VIEW.x + STOCK_VIEW.width / 2);
    const tall = fitViewBox(STOCK_VIEW, 0.5);
    expect(tall.width).toBe(STOCK_VIEW.width);
    expect(tall.y + tall.height / 2).toBeCloseTo(STOCK_VIEW.y + STOCK_VIEW.height / 2);
  });

  it('moves the orbit center without changing lens, distance, or camera axes at any yaw', () => {
    for (const yaw of [-180, -125, -90, 0, 90, 175]) {
      const stock = stageView(30, { yaw, pitch: 6, lens: 1 });
      const centered = stageView(30, { yaw, pitch: 6, lens: 1, targetZ: -174 });
      expect(centered.eye[0]).toBeCloseTo(stock.eye[0], 9);
      expect(centered.eye[1]).toBeCloseTo(stock.eye[1], 9);
      expect(centered.eye[2]).toBeCloseTo(stock.eye[2] - 174, 9);
      expect(centered.distance).toBeCloseTo(stock.distance, 9);
      expect(centered.focal).toBeCloseTo(stock.focal, 9);
      expect(centered.anchor.x).toBeCloseTo(stock.anchor.x, 9);
      expect(centered.anchor.y).toBeCloseTo(stock.anchor.y, 9);
      expect(centered.back).toEqual(stock.back);
      expect(centered.up).toEqual(stock.up);
      expect(centered.right).toEqual(stock.right);
    }
  });

  it('keeps the frustum and the picture in step', () => {
    const view = stageView(0, CAMERAS[0], 1.6, 1.4);
    // The frustum's edges, pushed out to the target's depth, land on the picture's edges.
    const { focal, anchor, box, frustum } = view;
    expect(anchor.x + frustum.left * focal).toBeCloseTo(box.x);
    expect(anchor.x + frustum.right * focal).toBeCloseTo(box.x + box.width);
    expect(anchor.y - frustum.top * focal).toBeCloseTo(box.y);
    expect(anchor.y - frustum.bottom * focal).toBeCloseTo(box.y + box.height);
  });
});
