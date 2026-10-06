import { AlwaysDepth, Camera, EqualDepth, Mesh, NeverDepth, NotEqualDepth, type Material, type Object3D } from 'three';
import type { StageView } from '../camera/view';

export const SCENE_NEAR = 2;
export const SCENE_FAR = 40000;

/** Forward depth needs a larger near plane; close tripods still keep the rider. */
export function sceneNear(distance: number, reversed: boolean) {
  return reversed ? SCENE_NEAR : Math.min(60, Math.max(SCENE_NEAR, distance * 0.1));
}

/** Preserve explicit ordering and invariant tests through Three r185's reversal. Call once per scene. */
export function prepareReversedDepth(roots: Object3D[], passes: Material[]) {
  const adjusted = new Set<Material>();
  const material = (paint: Material) => {
    if (adjusted.has(paint)) return;
    adjusted.add(paint);
    if (paint.depthFunc === AlwaysDepth) paint.depthFunc = NeverDepth;
    else if (paint.depthFunc === NeverDepth) paint.depthFunc = AlwaysDepth;
    else if (paint.depthFunc === EqualDepth) paint.depthFunc = NotEqualDepth;
    else if (paint.depthFunc === NotEqualDepth) paint.depthFunc = EqualDepth;
    // The backend reverses the slope factor itself, but not the constant term.
    paint.polygonOffsetUnits *= -1;
  };
  for (const root of roots) root.traverse(object => {
    object.renderOrder *= -1;
    if (object instanceof Mesh) {
      for (const paint of Array.isArray(object.material) ? object.material : [object.material]) material(paint);
    }
  });
  passes.forEach(material);
}

/** The crane has an asymmetric frustum; Three may rebuild it to reverse depth. */
export class SceneCamera3D extends Camera {
  private frustum: StageView['frustum'] = { left: -1, right: 1, top: 1, bottom: -1 };
  near = SCENE_NEAR;

  constructor(private readonly reverse: boolean) { super(); }

  // Sorting happens before Three's first camera update. The first frame must
  // already advertise the mode used by this renderer's depth buffer.
  override get reversedDepth() { return this.reverse; }

  setFrustum(frustum: StageView['frustum'], near = this.near) {
    this.frustum = frustum;
    this.near = near;
    this.updateProjectionMatrix();
  }

  updateProjectionMatrix() {
    const { left, right, top, bottom } = this.frustum;
    this.projectionMatrix.makePerspective(
      left * this.near, right * this.near, top * this.near, bottom * this.near,
      this.near, SCENE_FAR, this.coordinateSystem, this.reversedDepth,
    );
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}

/** All depth-reading passes use the same convention and a world-space tolerance. */
export const GLSL_DEPTH = /* glsl */ `
uniform float uNear;
uniform float uFar;
float viewZ(float d) {
  #ifdef USE_REVERSED_DEPTH_BUFFER
    return (uNear * uFar) / (uNear + d * (uFar - uNear));
  #else
    return (uNear * uFar) / (uNear + (1.0 - d) * (uFar - uNear));
  #endif
}
float nearerDepth(float a, float b) {
  #ifdef USE_REVERSED_DEPTH_BUFFER
    return max(a, b);
  #else
    return min(a, b);
  #endif
}
bool behindScene(float fragmentDepth, float sceneDepth) {
  return viewZ(fragmentDepth) > viewZ(sceneDepth) + 0.5;
}
`;
