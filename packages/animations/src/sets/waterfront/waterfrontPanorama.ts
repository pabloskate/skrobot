import { BufferGeometry, Float32BufferAttribute, Mesh, TextureLoader, Vector3, type Texture } from 'three';
import type { StageView } from '../../camera/view';
import { sceneMaterial } from '../../three/materials';
import { HARBOR_WATER } from './harborWater';

const PHOTO = new URL('./harbor.webp', import.meta.url).href;

/**
 * Four 90-degree photographic sectors share a mipmapped atlas. In image order
 * they face across the bay, along the quay, inland, and back along the quay.
 * Reconstruct the viewing ray from the frustum so an orbit, long lens or
 * asymmetric zoom samples the same part of the shore as the quay in front.
 */
const VERT = /* glsl */ `
uniform vec3 uForward, uRight, uUp;
out vec3 vRay;
void main() {
  vRay = uForward + position.x * uRight + position.y * uUp;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
layout(location = 0) out vec4 outColor;
uniform sampler2D uForeground;
uniform sampler2D uHarbor;
uniform bool uLoaded;
uniform float uScroll, uTime;
in vec3 vRay;
const float PI = 3.14159265;
uniform vec3 uEye;

// Each 2048 x 616 tile has 2040 x 600 image pixels plus a border sampled
// from the neighboring sector. Work in continuous angle space for the mip
// gradients so crossing a tile boundary never selects a blurry mip level.
vec3 sampleHarbor(vec3 ray) {
  float azimuth = atan(ray.x, -ray.z);
  float sector = azimuth * (2.0 / PI) + 0.5 + cos(azimuth) * uScroll * 0.0000048;
  float tile = mod(floor(sector), 4.0);
  float elevation = asin(clamp(ray.y, -1.0, 1.0));
  const float sectorWidth = 2040.0;
  const vec2 atlasSize = vec2(4096.0, 1232.0);
  float row = 360.0 - elevation * (sectorWidth * 2.0 / PI);
  float imageY = clamp(row, 0.5, 599.5);
  // atan jumps from +pi to -pi only at the back of the inland tile.
  vec2 ds = vec2(dFdx(sector), dFdy(sector));
  ds = (ds - 4.0 * round(ds / 4.0)) * sectorWidth;
  vec2 cell = vec2(mod(tile, 2.0) * 2048.0, floor(tile / 2.0) * 616.0);
  vec2 uv = (cell + vec2(4.0 + fract(sector) * sectorWidth, 8.0 + imageY)) / atlasSize;
  // TextureLoader flips the photograph vertically at upload.
  vec3 photo = textureGrad(uHarbor, vec2(uv.x, 1.0 - uv.y),
    vec2(ds.x, -dFdx(imageY)) / atlasSize, vec2(ds.y, -dFdy(imageY)) / atlasSize).rgb;
  return mix(photo, vec3(0.32, 0.56, 0.79), smoothstep(0.0, 130.0, -row));
}

${HARBOR_WATER}
void main() {
  // The foreground is premultiplied and already antialiased, including rail silhouettes and dust.
  vec4 foreground = texelFetch(uForeground, ivec2(gl_FragCoord.xy), 0);
  if (foreground.a == 1.0) { outColor = foreground; return; }
  vec3 ray = normalize(vRay);
  vec3 color = uLoaded ? harborWater(sampleHarbor(ray), ray, uEye, uTime)
                       : mix(vec3(0.30, 0.44, 0.49), vec3(0.69, 0.80, 0.86), smoothstep(-0.02, 0.04, ray.y));
  outColor = vec4(foreground.rgb + (1.0 - foreground.a) * color, 1.0);
}
`;

export class HarborPanorama {
  private readonly material = sceneMaterial(VERT, FRAG, {
    uForeground: { value: null as Texture | null },
    uEye: { value: new Vector3() }, uForward: { value: new Vector3() }, uRight: { value: new Vector3() }, uUp: { value: new Vector3() },
    uHarbor: { value: null as Texture | null }, uLoaded: { value: false },
    uScroll: { value: 0 }, uTime: { value: 0 },
  }, { depthTest: false, depthWrite: false });
  readonly mesh = new Mesh(new BufferGeometry(), this.material);
  readonly ready: Promise<void>;
  private disposed = false;

  constructor() {
    this.mesh.geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
    this.ready = new TextureLoader().loadAsync(PHOTO).then(texture => {
      if (this.disposed) {
        texture.dispose();
        return;
      }
      this.material.uniforms.uHarbor.value = texture;
      this.material.uniforms.uLoaded.value = true;
    }).catch(() => { /* The sky and sea keep their daylight colors if the image cannot load. */ });
  }

  waterInView = false;

  update(view: StageView, scroll: number) {
    const u = this.material.uniforms;
    const { left, right, top, bottom } = view.frustum;
    u.uRight.value.set(...view.right);
    u.uUp.value.set(...view.up);
    u.uForward.value.set(...view.back).negate()
      .addScaledVector(u.uRight.value, (left + right) / 2)
      .addScaledVector(u.uUp.value, (top + bottom) / 2);
    u.uRight.value.multiplyScalar((right - left) / 2);
    u.uUp.value.multiplyScalar((top - bottom) / 2);
    u.uEye.value.set(view.eye[0] + scroll, view.eye[1], view.eye[2]);
    u.uScroll.value = scroll;
    // A view whose rays all point inland cannot see the moving bay.
    this.waterInView = u.uForward.value.z < Math.abs(u.uRight.value.z) + Math.abs(u.uUp.value.z);
  }

  compose(foreground: Texture, time: number) {
    this.material.uniforms.uForeground.value = foreground;
    this.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.disposed = true;
    this.mesh.removeFromParent();
    this.material.uniforms.uHarbor.value?.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
