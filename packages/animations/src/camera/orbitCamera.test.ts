import { describe, expect, it } from 'vitest';
import { DEFAULT_SCENE_CAMERA, SCENE_CAMERA_BOUNDS, SCENE_ORBIT_BOUNDS, clampOrbitCamera, clampSceneCamera, makeCamera, wrapOrbitYaw } from './camera';

describe('3D orbit controls', () => {
  it('wraps full turns to the same angle and normalizes the shared seam', () => {
    for (const yaw of [-180, -125.5, -90, 0, 90, 179.5]) {
      for (const turns of [-100, -2, -1, 0, 1, 2, 100]) expect(wrapOrbitYaw(yaw + turns * 360)).toBe(yaw);
    }
    expect(wrapOrbitYaw(180)).toBe(-180);
    expect(Object.is(wrapOrbitYaw(-360), -0)).toBe(false);
  });

  it('keeps invalid and out-of-range controls finite without widening the framed bounds', () => {
    expect(clampOrbitCamera({})).toEqual(DEFAULT_SCENE_CAMERA);
    expect(clampOrbitCamera({ yaw: Number.NaN, pitch: Infinity, lens: -Infinity })).toEqual(DEFAULT_SCENE_CAMERA);
    expect(clampOrbitCamera({ yaw: 400, pitch: -20, lens: 99 })).toEqual({ yaw: 40, pitch: 0, lens: SCENE_ORBIT_BOUNDS.lens.max });
    expect(clampSceneCamera({ yaw: 180, pitch: 99, lens: 1 })).toEqual({ yaw: SCENE_CAMERA_BOUNDS.yaw.max, pitch: SCENE_CAMERA_BOUNDS.pitch.max, lens: 1 });
    expect(SCENE_CAMERA_BOUNDS.yaw).toEqual({ min: -75, max: 75 });
    expect(clampOrbitCamera({ targetZ: -999 }).targetZ).toBe(SCENE_ORBIT_BOUNDS.targetZ.min);
    expect(clampOrbitCamera({ targetZ: 999 }).targetZ).toBe(SCENE_ORBIT_BOUNDS.targetZ.max);
    expect(clampOrbitCamera({ targetZ: Infinity })).toEqual(DEFAULT_SCENE_CAMERA);
    expect(clampSceneCamera({ yaw: -90, targetZ: -174 })).not.toHaveProperty('targetZ');
  });

  it('places bottom-center ahead of travel and bottom-right on the negative-z bank side', () => {
    const center = makeCamera(0, { yaw: -90, pitch: 6, lens: 1 }).eye;
    const right = makeCamera(0, { yaw: -125, pitch: 9, lens: 1 }).eye;
    const side = makeCamera(0, { yaw: 0, pitch: 6, lens: 1 }).eye;
    expect(center.x).toBeGreaterThan(side.x);
    expect(center.z).toBeCloseTo(0, 8);
    expect(right.x).toBeGreaterThan(side.x);
    expect(right.z).toBeLessThan(0);
  });
});
