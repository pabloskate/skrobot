import { describe, expect, it } from 'vitest';
import { WHEEL_X, WHEEL_Y, WHEEL_Z } from './board';
import { kickY } from './deck';
import { add3, rotX, rotY, rotZ, type V3 } from '../math';
import { frameOf, type BoardRig, type LegRig } from '../motion/skeleton';
import { BOARD_WIDTH_SCALE } from './boardDimensions';
import { capsuleIntersectsBoard, legBoardCollision, shoeIntersectsBoard } from './boardCollision';
import { Capsule, deckGeometry, roundedBoxGeometry } from '../three/geometry';

const origin: V3 = { x: 0, y: 0, z: 0 };
const boardAt = (flip = 0, pitch = 0, yaw = 0, translation = origin): BoardRig => {
  const dir = (point: V3) => rotY(rotZ(rotX(point, flip), pitch), yaw);
  return { center: translation, point: (point) => add3(translation, dir(point)), dir, flipDeg: flip, pitchDeg: pitch, yawDeg: yaw };
};
const shoeAt = (point: V3) => frameOf(point, (direction) => direction);
const sphereHit = (board: BoardRig, point: V3, radius = 0.1) => capsuleIntersectsBoard(board, point, point, radius);

describe('rendered board volume collisions', () => {
  it('detects the entire shoe against upright, edge-on and inverted decks', () => {
    for (const flip of [0, 90, 180, 270]) {
      const board = boardAt(flip);
      expect(shoeIntersectsBoard(board, shoeAt(origin)), `flip ${flip}`).toBe(true);
      expect(shoeIntersectsBoard(board, shoeAt({ x: 0, y: -40, z: 0 })), `flip ${flip}`).toBe(false);
    }
  });

  it('allows a sole clear of the grip, and detects a clearance margin', () => {
    const board = boardAt();
    const shoe = shoeAt({ x: 0, y: -6.3, z: 0 });
    expect(shoeIntersectsBoard(board, shoe)).toBe(false);
    expect(shoeIntersectsBoard(board, shoe, 0.2)).toBe(true);
  });

  it('uses the board point transform when a pitched pivot moves its rendered origin', () => {
    const board = boardAt(40, 55, 15, { x: 70, y: 20, z: -50 });
    // The shared rig's center is before the pop-foot pivot rotation.
    board.center = { x: -500, y: 400, z: 900 };
    expect(shoeIntersectsBoard(board, shoeAt(board.point(origin)))).toBe(true);
    expect(shoeIntersectsBoard(board, shoeAt(board.center))).toBe(false);
  });

  it('detects tapered capsule round caps and shin crossings independent of the shoes', () => {
    const board = boardAt();
    const ankle = { x: 0, y: -4, z: 0 };
    const knee = { x: 0, y: -30, z: 0 };
    expect(capsuleIntersectsBoard(board, knee, ankle, 4.7, 3.5)).toBe(true);
    expect(capsuleIntersectsBoard(board, knee, { ...ankle, y: -8 }, 4.7, 3.5)).toBe(false);
    const leg: LegRig = {
      side: 'left', hip: { x: 0, y: -55, z: 0 }, knee, ankle,
      shoe: shoeAt({ x: 100, y: -10, z: 0 }), flicking: false,
    };
    expect(legBoardCollision(board, leg)).toEqual({ shoe: false, shin: true, thigh: false });
  });

  it('finds a thin deck crossing a limb even when both limb endpoints are outside', () => {
    const board = boardAt(90, 25, -35);
    const a = board.point({ x: 0, y: -30, z: 0 });
    const b = board.point({ x: 0, y: 30, z: 0 });
    expect(sphereHit(board, a)).toBe(false);
    expect(sphereHit(board, b)).toBe(false);
    expect(capsuleIntersectsBoard(board, a, b, 0.1)).toBe(true);
  });

  it('preserves the rounded tip footprint rather than filling an enclosing box', () => {
    const board = boardAt();
    const tip = { x: 47, y: kickY(47), z: 0 };
    expect(sphereHit(board, tip)).toBe(true);
    expect(sphereHit(board, { ...tip, z: 8 })).toBe(false);
    expect(sphereHit(board, { ...tip, x: 49 })).toBe(false);
  });

  it('includes wheel and truck volumes on the underside', () => {
    const board = boardAt(180);
    expect(sphereHit(board, board.point({ x: WHEEL_X, y: WHEEL_Y, z: WHEEL_Z * BOARD_WIDTH_SCALE }))).toBe(true);
    expect(sphereHit(board, board.point({ x: WHEEL_X, y: 6, z: 0 }))).toBe(true);
    expect(sphereHit(board, board.point({ x: WHEEL_X, y: WHEEL_Y + 7, z: WHEEL_Z * BOARD_WIDTH_SCALE }))).toBe(false);
  });

  it('extrudes only downward, preventing a free foot from tunneling below a flipping deck', () => {
    const board = boardAt(90);
    const below = shoeAt({ x: 0, y: 40, z: 0 });
    const above = shoeAt({ x: 0, y: -40, z: 0 });
    const beside = shoeAt({ x: 0, y: 40, z: 40 });
    expect(shoeIntersectsBoard(board, below)).toBe(false);
    expect(shoeIntersectsBoard(board, below, 0, 200)).toBe(true);
    expect(shoeIntersectsBoard(board, above, 0, 200)).toBe(false);
    expect(shoeIntersectsBoard(board, beside, 0, 200)).toBe(false);
  });

  it('covers every rendered deck station after rotation and width scaling', () => {
    const geometry = deckGeometry();
    const positions = geometry.getAttribute('position');
    const board = boardAt(73, -28, 45, { x: 100, y: -50, z: 30 });
    for (let i = 0; i < positions.count; i += 5) {
      const point = board.point({ x: positions.getX(i), y: -positions.getY(i), z: positions.getZ(i) * BOARD_WIDTH_SCALE });
      expect(sphereHit(board, point, 0.02), `deck vertex ${i}`).toBe(true);
    }
    geometry.dispose();
  });

  it('detects contact against independently generated rounded shoe and capsule surfaces', () => {
    const shoe = shoeAt({ x: 0, y: -15, z: 0 });
    const shoeGeometry = roundedBoxGeometry({ f: 12, u: 4, s: 6, r: 3.6 }, 4);
    const shoeVertices = shoeGeometry.getAttribute('position');
    // Put the deck midpoint on a selection of actual shoe surface points.
    for (let i = 0; i < shoeVertices.count; i += 73) {
      const point = shoe.at(shoeVertices.getX(i), shoeVertices.getY(i), shoeVertices.getZ(i));
      expect(shoeIntersectsBoard(boardAt(90, 0, 0, point), shoe), `shoe vertex ${i}`).toBe(true);
    }
    const capsule = new Capsule();
    const a = { x: 0, y: -25, z: 0 };
    const b = { x: 0, y: -5, z: 0 };
    capsule.set([a.x, -a.y, a.z], [b.x, -b.y, b.z], 4.7, 3.5);
    const limbVertices = capsule.geometry.getAttribute('position');
    for (let i = 0; i < limbVertices.count; i += 13) {
      const point = { x: limbVertices.getX(i), y: -limbVertices.getY(i), z: limbVertices.getZ(i) };
      expect(capsuleIntersectsBoard(boardAt(90, 0, 0, point), a, b, 4.7, 3.5), `limb vertex ${i}`).toBe(true);
    }
    shoeGeometry.dispose();
    capsule.geometry.dispose();
  });
});
