import { Mesh, OrthographicCamera, PlaneGeometry, type ShaderMaterial, type WebGLRenderer } from 'three';

/** Each renderer owns its post camera, including its forward/reversed mode. */
export class ScreenPass {
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  constructor(material: ShaderMaterial) {
    this.mesh = new Mesh(new PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
  }

  render(renderer: WebGLRenderer) { renderer.render(this.mesh, this.camera); }
  dispose() { this.mesh.geometry.dispose(); }
}
