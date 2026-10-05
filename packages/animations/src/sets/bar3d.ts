import { Group, Mesh, type BufferGeometry, type ShaderMaterial } from 'three';
import { X0 } from '../motion/trick';
import { PALETTE } from '../camera/camera';
import { BAR_HALF, BAR_TOP_Y } from '../motion/grindDefinitions';
import { mixHex } from '../math';
import { POST_HALF, POST_INSET, type BarSpan } from './bar';
import { faceBoxGeometry } from '../three/geometry';
import { boxMaterial, inkInfo, INK_ROBOT } from '../three/materials';
import { toThree } from '../camera/view';

/**
 * The flat bar in 3D (laid out in rail.ts): a square steel tube on two
 * square posts in the plaza's paint, its top worn back toward bare metal. Each
 * face is its own part for the outline pass, so every edge is inked. It is
 * laid out once and slid along the street.
 */

const WORN = mixHex(PALETTE.paint, PALETTE.metal, 0.6);
const INK = 1.15 * 0.8;
const PRIORITY = 15;

export class Bar3D {
  readonly group = new Group();
  private readonly materials: ShaderMaterial[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private length = -1;

  constructor() {
    this.group.visible = false;
  }

  private build(length: number) {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.group.clear();
    this.geometries.length = 0;
    this.materials.length = 0;
    // The bar keeps its height over the board's physics; its posts reach down to the asphalt.
    const top = toThree({ x: X0, y: BAR_TOP_Y, z: 0 })[1];
    const bottom = top - 2 * BAR_HALF;
    const tube = faceBoxGeometry([0, bottom, -BAR_HALF], [length, top, BAR_HALF]);
    const posts = [POST_INSET, length - POST_INSET].map((x) =>
      faceBoxGeometry([x - POST_HALF, 0, -POST_HALF], [x + POST_HALF, bottom, POST_HALF]));
    for (const [i, geometry] of [tube, ...posts].entries()) {
      const material = boxMaterial(PALETTE.paint, i === 0 ? WORN : PALETTE.paint);
      // Six faces a box, each its own id, so each is outlined.
      inkInfo(20 + i * 6, PRIORITY, INK, INK_ROBOT, material.uniforms.uInfo.value, 2 + i);
      this.group.add(new Mesh(geometry, material));
      this.geometries.push(geometry);
      this.materials.push(material);
    }
    this.length = length;
  }

  update(span: BarSpan | null) {
    this.group.visible = span != null;
    if (!span) return;
    const length = span.x1 - span.x0;
    if (Math.abs(length - this.length) > 1e-6) this.build(length);
    this.group.position.set(span.x0 - X0, 0, 0);
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
