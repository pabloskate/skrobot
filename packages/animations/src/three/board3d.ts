import { Group, Matrix4, Mesh, type BufferGeometry, type ShaderMaterial } from 'three';
import { PALETTE, lambert, tone } from '../scene/camera';
import { HANGER_BOTTOM, WHEEL_R, WHEEL_X, WHEEL_Y, WHEEL_Z, type BoardLook, type WheelSpin } from '../scene/board';
import { THICKNESS, kickY } from '../scene/deck';
import { dot3, norm3, sub3 } from '../scene/math';
import type { BoardRig } from '../scene/skeleton';
import { deckGeometry, roundedBoxGeometry, solidHullGeometry, wheelGeometry } from './geometry';
import { deckMaterial, inkInfo, INK_ROBOT, rgb, toonMaterial, wheelMaterial } from './materials';
import { dirToThree, toThree, type StageView } from './view';
import { BOARD_WIDTH_SCALE } from './boardDimensions';

/**
 * The TrickScene skateboard in 3D (board.tsx and deck.tsx are the
 * reference): the popsicle deck with its grip, printed underside, and ply
 * edge; silver trucks of baseplate, bushing, and a hanger flaring out to the
 * axle; cream wheels whose printed mark turns with the street and smears
 * over a frame's sweep. The board sits on the rig's board transform, so
 * flips, shuvs, and grind locks follow the SVG board's motion.
 */

/** Truck dimensions, as board.tsx draws them (board-local, y down from the deck). */
const PLATE = { f: 4.2, u: 0.55, s: 2.6, r: 0.5 };
const BUSHING = { f: 1.5, u: 1.75, s: 1.45, r: 1.2 };
const PLATE_BOTTOM = 1.2;
const HUMP_TOP = 4.5;
const HANGER_ROUND = 0.8;
const HUMP = { f: 1.9, s: 1.1 };
const WHEEL_INNER = 5;
const WING = { f: 1.2, s: WHEEL_INNER - HANGER_ROUND, top: WHEEL_Y - 1.3 };
const WHEEL_HALF_W = WHEEL_R * 0.46;

/** Outline widths (world units), from board.tsx's ink: the deck's contour and crease, and the running gear's. */
const DECK_INK = 2 * 1.15 * 0.85 * 0.62;
const CREASE_INK = 2 * 1.15 * 0.85 * 0.8;
const GEAR_INK = 1.15 * 0.85;

/** The deck's grip, underside, and ply are one solid: the crease between them is inked by priority. */
const SOLID_DECK = 1;
const ID = { grip: 10, underside: 11, ply: 12, truck: [13, 14], wheel: [15, 16, 17, 18] } as const;
/** Paint order: the deck over its gear seen from above, under it from below; the ply's crease ink falls on the grip. */
const PRIORITY = { deck: 25, ply: 27, gearUnder: 21, gearOver: 29 } as const;

export class Board3D {
  readonly group = new Group();
  private readonly deck: ShaderMaterial;
  private readonly trucks: ShaderMaterial[][] = [];
  private readonly wheels: ShaderMaterial[] = [];
  private readonly geometries: BufferGeometry[] = [];

  constructor(private readonly look: BoardLook) {
    this.group.matrixAutoUpdate = false;
    const keep = <T extends BufferGeometry>(g: T) => {
      g.scale(1, 1, BOARD_WIDTH_SCALE);
      this.geometries.push(g);
      return g;
    };
    this.deck = deckMaterial();
    this.group.add(new Mesh(keep(deckGeometry()), this.deck));
    inkInfo(ID.grip, PRIORITY.deck, DECK_INK, INK_ROBOT, this.deck.uniforms.uInfoGrip.value, SOLID_DECK);
    inkInfo(ID.underside, PRIORITY.deck, DECK_INK, INK_ROBOT, this.deck.uniforms.uInfoUnder.value, SOLID_DECK);
    inkInfo(ID.ply, PRIORITY.ply, CREASE_INK, INK_ROBOT, this.deck.uniforms.uInfoPly.value, SOLID_DECK);
    this.deck.uniforms.uStripe.value.set(...rgb(look.stripe));

    const plate = keep(roundedBoxGeometry(PLATE, 2));
    const bushing = keep(roundedBoxGeometry(BUSHING, 3));
    // The hanger: a hump under the bushing sloping out into wings to the axle.
    const humpTop = -(HUMP_TOP + HANGER_ROUND);
    const bottom = -(HANGER_BOTTOM - HANGER_ROUND);
    const wingTop = -(WING.top + HANGER_ROUND);
    const corners: Array<[number, number, number]> = [];
    for (const sf of [-1, 1]) {
      for (const ss of [-1, 1]) {
        corners.push(
          [sf * HUMP.f, humpTop, ss * HUMP.s], [sf * HUMP.f, bottom, ss * HUMP.s],
          [sf * WING.f, wingTop, ss * WING.s], [sf * WING.f, bottom, ss * WING.s],
        );
      }
    }
    const hanger = keep(solidHullGeometry(corners, HANGER_ROUND));
    const wheel = keep(wheelGeometry(WHEEL_R, WHEEL_HALF_W));

    for (const [i, tx] of [-WHEEL_X, WHEEL_X].entries()) {
      const underside = kickY(tx) + THICKNESS / 2;
      const parts = [
        { geometry: plate, color: PALETTE.metal, y: (underside + PLATE_BOTTOM) / 2 },
        { geometry: bushing, color: look.graphic, y: (PLATE_BOTTOM + HUMP_TOP) / 2 },
        { geometry: hanger, color: PALETTE.metal, y: 0 },
      ];
      const materials: ShaderMaterial[] = [];
      for (const part of parts) {
        const material = toonMaterial(part.color);
        const mesh = new Mesh(part.geometry, material);
        // Board-local y runs down in the physics and up here.
        mesh.position.set(tx, -part.y, 0);
        this.group.add(mesh);
        materials.push(material);
      }
      this.trucks.push(materials);
      for (const [j, wz] of [-WHEEL_Z, WHEEL_Z].entries()) {
        const material = wheelMaterial(WHEEL_R);
        const mesh = new Mesh(wheel, material);
        mesh.position.set(tx, -WHEEL_Y, wz * BOARD_WIDTH_SCALE);
        this.group.add(mesh);
        inkInfo(ID.wheel[i * 2 + j], PRIORITY.gearOver, GEAR_INK, INK_ROBOT, material.uniforms.uInfo.value);
        this.wheels.push(material);
      }
    }
  }

  update(board: BoardRig, spin: WheelSpin, view: StageView) {
    const o = toThree(board.point({ x: 0, y: 0, z: 0 }));
    const x = dirToThree(board.dir({ x: 1, y: 0, z: 0 }));
    const y = dirToThree(board.dir({ x: 0, y: -1, z: 0 }));
    const z = dirToThree(board.dir({ x: 0, y: 0, z: 1 }));
    this.group.matrix.copy(new Matrix4().set(x[0], y[0], z[0], o[0], x[1], y[1], z[1], o[1], x[2], y[2], z[2], o[2], 0, 0, 0, 1));
    this.group.matrixWorldNeedsUpdate = true;

    // The grip and the printed underside take one tone each, from the board's facing to the sun.
    const up = norm3(board.dir({ x: 0, y: -1, z: 0 }));
    const lamUp = lambert(up);
    this.deck.uniforms.uGrip.value.set(...rgb(tone(PALETTE.grip, lamUp)));
    this.deck.uniforms.uGraphic.value.set(...rgb(tone(this.look.graphic, 1 - lamUp)));
    this.deck.uniforms.uStripe.value.set(...rgb(tone(this.look.stripe, 1 - lamUp)));

    // Seen from above the deck paints over its trucks; from below they paint over it.
    const seeingTop = dot3(sub3(view.cam.eye, board.center), up) > 0;
    const gear = seeingTop ? PRIORITY.gearUnder : PRIORITY.gearOver;
    for (const [i, materials] of this.trucks.entries()) {
      for (const m of materials) inkInfo(ID.truck[i], gear, GEAR_INK, INK_ROBOT, m.uniforms.uInfo.value);
    }
    for (const [i, m] of this.wheels.entries()) {
      inkInfo(ID.wheel[i], gear + 1, GEAR_INK, INK_ROBOT, m.uniforms.uInfo.value);
      m.uniforms.uAngle.value = spin.angle;
      m.uniforms.uSweep.value = spin.sweep;
    }
  }

  dispose() {
    for (const g of this.geometries) g.dispose();
    this.group.traverse((o) => {
      if (o instanceof Mesh) (o.material as ShaderMaterial).dispose();
    });
  }
}
