import { Texture, TextureLoader, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stageView } from '../../camera/view';
import { HarborPanorama } from './waterfrontPanorama';

afterEach(() => vi.restoreAllMocks());

describe('waterfront panorama', () => {
  it('registers the center and corners of the photograph with the stage camera across an orbit', async () => {
    vi.spyOn(TextureLoader.prototype, 'loadAsync').mockResolvedValue(new Texture());
    const sky = new HarborPanorama();
    await sky.ready;
    const u = sky.mesh.material.uniforms;
    for (const yaw of [-180, -90, -23.4, 0, 90, 179.9]) {
      for (const pitch of [0, 12.2, 60]) {
        for (const zoom of [0.5, 0.9, 2.5]) {
          const view = stageView(30, { yaw, pitch, lens: 0.95 }, zoom, 16 / 9);
          sky.update(view, 42);
          if (yaw === 0) expect(sky.waterInView).toBe(true);
          if (yaw === -180) expect(sky.waterInView).toBe(false);
          for (const [x, y] of [[0, 0], [-1, -1], [1, 1]]) {
            const ray: Vector3 = u.uForward.value.clone()
              .addScaledVector(u.uRight.value, x)
              .addScaledVector(u.uUp.value, y);
            const px = view.box.x + (1 + x) * view.box.width / 2;
            const py = view.box.y + (1 - y) * view.box.height / 2;
            expect(ray.dot(new Vector3(...view.right))).toBeCloseTo((px - view.anchor.x) / view.focal, 10);
            expect(ray.dot(new Vector3(...view.up))).toBeCloseTo((view.anchor.y - py) / view.focal, 10);
            expect(ray.dot(new Vector3(...view.back))).toBeCloseTo(-1, 10);
          }
        }
      }
    }
    // Seeking an export sets the exact phase. Between live frames the foreground stays cached.
    sky.update(stageView(30), 10);
    expect(u.uScroll.value).toBe(10);
    const foreground = new Texture();
    sky.compose(foreground, 0.25);
    expect(u.uTime.value).toBe(0.25);
    sky.compose(foreground, 1.75);
    expect(u.uForeground.value).toBe(foreground);
    expect(u.uTime.value).toBe(1.75);
    expect(u.uScroll.value).toBe(10);
    sky.dispose();
    foreground.dispose();
  });

  it('releases a photograph that finishes decoding after the set has been evicted', async () => {
    const texture = new Texture<HTMLImageElement>();
    const disposed = vi.spyOn(texture, 'dispose');
    let decoded!: (value: typeof texture) => void;
    vi.spyOn(TextureLoader.prototype, 'loadAsync').mockReturnValue(new Promise(resolve => { decoded = resolve; }));
    const sky = new HarborPanorama();
    sky.dispose();
    decoded(texture);
    await sky.ready;
    expect(disposed).toHaveBeenCalledOnce();
    expect(sky.mesh.material.uniforms.uHarbor.value).toBe(null);
  });
});
