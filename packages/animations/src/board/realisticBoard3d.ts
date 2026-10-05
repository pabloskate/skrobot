import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, LatheGeometry, Mesh, Quaternion, TorusGeometry, Vector2, Vector3 } from 'three';
import { HANGER_BOTTOM, WHEEL_HALF_W, WHEEL_INNER, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z, type WheelSpin } from './board';
import { THICKNESS, kickY } from './deck';
import type { BoardRig } from '../motion/skeleton';
import { BOARD_WIDTH_SCALE } from './boardDimensions';
import { deckGeometry, roundedBoxGeometry, solidHullGeometry } from '../three/geometry';
import { BOARD_SURFACE as S, realisticBoardMaterial } from './realisticBoardMaterials';
import { dirToThree, toThree, type StageView, type Vec3 } from '../camera/view';

/** One static draw for deck and trucks, and four shared wheel assemblies. */
class Assembly {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly surfaces: number[] = [];
  private readonly layers: number[] = [];

  add(g: BufferGeometry, surface: number, deck = false): void {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const kind = g.getAttribute('kind');
    const index = g.getIndex();
    for (let i = 0; i < (index?.count ?? p.count); i++) {
      const at = index ? index.getX(i) : i;
      this.positions.push(p.getX(at), p.getY(at), p.getZ(at));
      this.normals.push(n.getX(at), n.getY(at), n.getZ(at));
      this.surfaces.push(deck ? kind.getX(at) : surface);
      this.layers.push(deck ? (p.getY(at) + kickY(p.getX(at)) + THICKNESS / 2) / THICKNESS : 0);
    }
    g.dispose();
  }
  cylinder(a: Vec3, b: Vec3, ra: number, rb: number, surface: number, segments = 20): void {
    const axis = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const g = new CylinderGeometry(rb, ra, axis.length(), segments, 1);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axis.normalize()));
    this.add(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), surface);
  }
  ring(z: number, radius: number, thickness: number, surface: number): void {
    this.add(new TorusGeometry(radius, thickness, 6, 32).translate(0, 0, z), surface);
  }
  finish(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('aSurface', new Float32BufferAttribute(this.surfaces, 1));
    g.setAttribute('aLayer', new Float32BufferAttribute(this.layers, 1));
    // This is the existing 3D board's width, including its running gear.
    g.scale(1, 1, BOARD_WIDTH_SCALE);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

function boardAssembly(): BufferGeometry {
  const a = new Assembly();
  // Exact shared deck surface: kicktails, sole contacts and flip clearances
  // remain the same. Layering and grain are evaluated on this geometry.
  a.add(deckGeometry(), S.grip, true);
  for (const tx of [-WHEEL_X, WHEEL_X]) {
    const underside = kickY(tx) + THICKNESS / 2;
    a.add(roundedBoxGeometry({ f: 4.2, u: 0.55, s: 2.6, r: 0.5 }, 2).translate(tx, -(underside + 1.2) / 2, 0), S.aluminum);
    // Retain the grind-contact hanger hull and flat underside exactly.
    const round = 0.8;
    const corners: Vec3[] = [];
    for (const f of [-1, 1]) for (const side of [-1, 1]) corners.push(
      [f * 1.9, -(4.5 + round), side * 1.1], [f * 1.9, -(HANGER_BOTTOM - round), side * 1.1],
      [f * 1.2, -(WHEEL_Y - 1.3 + round), side * (WHEEL_INNER - round)],
      [f * 1.2, -(HANGER_BOTTOM - round), side * (WHEEL_INNER - round)],
    );
    a.add(solidHullGeometry(corners, round).translate(tx, 0, 0), S.aluminum);
    // Dark urethane cushions, polished compression washers and a steel kingpin.
    const sign = Math.sign(tx);
    a.cylinder([tx - sign * 1.2, -1.1, 0], [tx + sign * 0.25, -5.1, 0], 0.47, 0.47, S.steel);
    a.cylinder([tx - sign * 0.9, -1.6, 0], [tx - sign * 0.1, -3.7, 0], 1.35, 1.15, S.bushing, 24);
    a.cylinder([tx - sign * 0.93, -1.48, 0], [tx - sign * 0.85, -1.72, 0], 1.55, 1.55, S.steel, 24);
    a.cylinder([tx - sign * 0.12, -3.65, 0], [tx + sign * 0.04, -4.1, 0], 1.4, 1.4, S.steel, 24);
    a.cylinder([tx + sign * 0.05, -4.15, 0], [tx + sign * 0.23, -4.75, 0], 0.95, 0.95, S.steel, 6);
    a.cylinder([tx, -WHEEL_Y, -(WHEEL_Z + WHEEL_HALF_W + 0.35)], [tx, -WHEEL_Y, WHEEL_Z + WHEEL_HALF_W + 0.35], 0.46, 0.46, S.steel, 16);
    // A cast bridge ridge and pivot cup, kept above the hanger's grind plane.
    a.cylinder([tx + sign * 2.7, -1.1, 0], [tx + sign * 1.25, -5.8, 0], 0.7, 0.95, S.aluminum, 16);
    a.cylinder([tx + sign * 2.7, -0.8, 0], [tx + sign * 2.4, -1.7, 0], 0.97, 0.84, S.rubber, 16);
    // Eight flush mounting bolts, plus their underside nuts. The grip surface
    // stays authoritative; screw recesses sit inside each head's top face.
    for (const dx of [-2.6, 2.6]) for (const z of [-1.85, 1.85]) {
      const x = tx + dx;
      const top = -kickY(x) + THICKNESS / 2;
      a.cylinder([x, top - 0.18, z], [x, top + 0.008, z], 0.24, 0.47, S.bolt, 16);
      for (const turn of [0, Math.PI / 2]) {
        const slot = roundedBoxGeometry({ f: 0.27, u: 0.006, s: 0.065, r: 0.005 }, 1).rotateY(turn).translate(x, top + 0.013, z);
        a.add(slot, S.rubber);
      }
      a.cylinder([x, -1.0, z], [x, -1.55, z], 0.56, 0.56, S.steel, 6);
    }
  }
  return a.finish();
}

function wheelAssembly(): BufferGeometry {
  const a = new Assembly();
  const w = WHEEL_HALF_W;
  // Rounded urethane lips, a full-radius contact patch and recessed bearing
  // sockets, all inside the original wheel radius and half width.
  const profile: Array<[number, number]> = [
    [0.72, -w], [1.36, -w], [2.15, -w + 0.13], [3.3, -w],
    [4, -w + 0.22], [4.4, -w + 0.58], [WHEEL_R, -w + 0.93],
    [WHEEL_R, w - 0.93], [4.4, w - 0.58], [4, w - 0.22],
    [3.3, w], [2.15, w - 0.13], [1.36, w], [0.72, w], [0.72, -w],
  ];
  a.add(new LatheGeometry(profile.map(([r, z]) => new Vector2(r, z)), 48).rotateX(Math.PI / 2), S.urethane);
  for (const side of [-1, 1]) {
    const face = side * (w + 0.035);
    a.cylinder([0, 0, side * (w - 0.28)], [0, 0, face], 1.51, 1.51, S.rubber, 32);
    a.ring(face, 1.34, 0.13, S.steel);
    a.ring(face + side * 0.02, 0.73, 0.1, S.steel);
    a.cylinder([0, 0, face - side * 0.03], [0, 0, face + side * 0.29], 0.79, 0.79, S.steel, 6);
    a.cylinder([0, 0, face + side * 0.3], [0, 0, face + side * 0.32], 0.29, 0.29, S.bolt, 12);
  }
  return a.finish();
}

/** The humanoid's board, sharing the exact motion and ground-contact contract. */
export class RealisticBoard3D {
  readonly group = new Group();
  private readonly material = realisticBoardMaterial();
  private readonly geometries: BufferGeometry[];
  private disposed = false;

  constructor() {
    this.group.name = 'humanoid-realistic-board';
    this.group.matrixAutoUpdate = false;
    const body = boardAssembly();
    const wheel = wheelAssembly();
    this.geometries = [body, wheel];
    const deck = new Mesh(body, this.material);
    deck.name = 'realistic-deck-and-trucks';
    this.group.add(deck);
    for (const tx of [-WHEEL_X, WHEEL_X]) for (const side of [-1, 1]) {
      const mesh = new Mesh(wheel, this.material);
      mesh.name = 'realistic-wheel';
      mesh.position.set(tx, -WHEEL_Y, side * WHEEL_Z * BOARD_WIDTH_SCALE);
      this.group.add(mesh);
    }
  }

  update(board: BoardRig, spin: WheelSpin, view: StageView): void {
    void view;
    const o = toThree(board.point({ x: 0, y: 0, z: 0 }));
    const x = dirToThree(board.dir({ x: 1, y: 0, z: 0 }));
    const y = dirToThree(board.dir({ x: 0, y: -1, z: 0 }));
    const z = dirToThree(board.dir({ x: 0, y: 0, z: 1 }));
    this.group.matrix.set(x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2], 0, 0, 0, 1);
    this.group.matrixWorldNeedsUpdate = true;
    this.material.uniforms.uAngle.value = spin.angle;
    this.material.uniforms.uSweep.value = spin.sweep;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.geometries) geometry.dispose();
    this.material.dispose();
  }
}
