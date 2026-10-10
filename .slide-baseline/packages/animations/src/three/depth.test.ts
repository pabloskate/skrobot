import { describe, expect, it } from 'vitest';
import { AlwaysDepth, EqualDepth, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, ShaderMaterial, Vector4, type Camera, type Object3D, type WebGLRenderer } from 'three';
import { WebGLRenderLists } from 'three/src/renderers/webgl/WebGLRenderLists.js';
import { WebGLProperties } from 'three/src/renderers/webgl/WebGLProperties.js';
import { ReversedDepthFuncs } from 'three/src/utils.js';
import { SCENE_FAR, SCENE_NEAR, SceneCamera3D, prepareReversedDepth, sceneNear } from './depth';
import { ScreenPass } from './screenPass';

const frustum = { left: -0.21, right: 0.49, top: 0.19, bottom: -0.35 };
function cameraFor(reversed: boolean) {
  const camera = new SceneCamera3D(reversed);
  camera.setFrustum(frustum);
  camera.updateProjectionMatrix();
  return camera;
}
function depthAt(camera: SceneCamera3D, z: number) {
  const p = new Vector4(0, 0, -z, 1).applyMatrix4(camera.projectionMatrix);
  return camera.reversedDepth ? p.z / p.w : (p.z / p.w + 1) / 2;
}
function viewDepth(d: number, reversed: boolean) {
  return SCENE_NEAR * SCENE_FAR / (SCENE_NEAR + (reversed ? d : 1 - d) * (SCENE_FAR - SCENE_NEAR));
}

describe('scene depth precision', () => {
  it('keeps sky first and depth-copy passes active through the installed backend reversal', () => {
    const scene = new Scene(), overlay = new Scene();
    const geometry = new PlaneGeometry(2, 2);
    const paint = new MeshBasicMaterial({ depthFunc: EqualDepth, polygonOffsetUnits: -2 });
    const ink = new ShaderMaterial({ depthFunc: AlwaysDepth });
    const sky = new Mesh(geometry, paint), floor = new Mesh(geometry, paint), rider = new Mesh(geometry, paint);
    sky.renderOrder = -100;
    floor.renderOrder = -50;
    scene.add(rider, floor, sky);
    overlay.add(new Mesh(geometry, paint));
    try {
      prepareReversedDepth([scene, overlay], [ink]);
      const list = new WebGLRenderLists(new WebGLProperties()).get(scene, 0);
      for (const object of [rider, floor, sky]) list.push(object, geometry, paint, 0, 0.5, null);
      // Use the real installed sorter and depth mapping, including their quirks.
      list.sort(undefined as never, undefined as never, true);
      expect(list.opaque.map(item => item.object)).toEqual([sky, floor, rider]);
      expect(ReversedDepthFuncs[ink.depthFunc]).toBe(AlwaysDepth);
      expect(ReversedDepthFuncs[paint.depthFunc]).toBe(EqualDepth);
      expect(paint.polygonOffsetUnits).toBe(2);
    } finally {
      geometry.dispose();
      paint.dispose();
      ink.dispose();
    }
  });

  it('does not share a post camera between forward and reversed renderers', () => {
    const paint = new ShaderMaterial();
    const reversePass = new ScreenPass(paint), forwardPass = new ScreenPass(paint);
    const cameras: Camera[] = [];
    const renderer = {
      render(object: Object3D, camera: Camera) {
        expect(object.frustumCulled).toBe(false);
        cameras.push(camera);
      },
    } as unknown as WebGLRenderer;
    try {
      reversePass.render(renderer);
      Reflect.set(cameras[0], '_reversedDepth', true);
      forwardPass.render(renderer);
      expect(cameras[1]).not.toBe(cameras[0]);
      expect(cameras[1].reversedDepth).toBe(false);
    } finally {
      reversePass.dispose();
      forwardPass.dispose();
      paint.dispose();
    }
  });

  it('keeps close tripods clear while allocating more precision to forward-depth scenery', () => {
    expect(sceneNear(80.2593, false)).toBeLessThan(36.634);
    expect(sceneNear(149.9565, false)).toBeLessThan(58.621);
    expect(sceneNear(1000, false)).toBe(60);
    expect(sceneNear(80.2593, true)).toBe(2);
  });
  it.each([false, true])('keeps the asymmetric framing and decodes eye distances (reversed=%s)', reversed => {
    const camera = cameraFor(reversed);
    for (const z of [SCENE_NEAR, 300, 1000, 4000, 10000, SCENE_FAR]) {
      expect(viewDepth(depthAt(camera, z), reversed)).toBeCloseTo(z, 5);
      for (const [x, y] of [[frustum.left, frustum.bottom], [frustum.right, frustum.top]]) {
        const p = new Vector4(x * z, y * z, -z, 1).applyMatrix4(camera.projectionMatrix);
        expect(p.x / p.w).toBeCloseTo(x === frustum.left ? -1 : 1, 10);
        expect(p.y / p.w).toBeCloseTo(y === frustum.bottom ? -1 : 1, 10);
      }
    }
    expect(depthAt(camera, SCENE_NEAR)).toBeCloseTo(reversed ? 1 : 0, 10);
    expect(depthAt(camera, SCENE_FAR)).toBeCloseTo(reversed ? 0 : 1, 10);
  });

  it('distinguishes thin surface details throughout the scene in floating reversed depth', () => {
    const camera = cameraFor(true);
    // These distances formerly collapse 0.02-unit surface details into the
    // same 24-bit depth value, causing colors to alternate as the view moves.
    for (const z of [1000, 2000, 4000, 10000, 30000]) {
      const base = Math.fround(depthAt(camera, z));
      const detail = Math.fround(depthAt(camera, z - 0.02));
      expect(detail).toBeGreaterThan(base);
      expect(viewDepth(detail, true)).toBeLessThan(viewDepth(base, true));
      expect(Math.abs(viewDepth(base, true) - z)).toBeLessThan(0.003);
    }
  });
});
