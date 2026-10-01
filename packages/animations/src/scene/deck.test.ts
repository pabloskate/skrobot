import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { GROUND, X0 } from '../TrickAnimation';
import { makeCamera, type SceneCamera } from './camera';
import { deckBottomY, deckTopY, drawDeck } from './deck';
import { boardRigAt } from './grindRig';

/**
 * The deck is drawn as facets that each decide whether they face the camera.
 * These pin what that buys: a kick that curls toward the camera shows its
 * underside in front of the grip behind it, instead of the grip painting over
 * everything and the two faces showing through each other.
 */

const PAINT = { grip: 'GRIP', graphic: 'GRAPHIC', stripe: 'STRIPE', ink: 2 };

/** The fill of every surface facet the deck paints, far to near. */
function surfaces(yaw: number, pitch: number, roll: number, camera: SceneCamera) {
  const board = boardRigAt({ x: X0, y: GROUND - 60, z: 0 }, { yaw, pitch, roll });
  const deck = drawDeck(makeCamera(0, camera), board, PAINT) as ReactElement<{ children: ReactElement<{ fill?: string }>[] }>;
  return deck.props.children.map((el) => el.props.fill).filter((fill) => fill === 'GRIP' || fill === 'GRAPHIC');
}

describe('Deck layering', () => {
  const LOW: SceneCamera = { yaw: -26, pitch: 3, lens: 1 };
  const STOCK: SceneCamera = { yaw: -26, pitch: 9, lens: 1 };

  it('shows mostly the grip from above and mostly the underside from below', () => {
    // A kick tip curling away from the eye shows a sliver of the other face, as
    // a real one does; the rest of the deck shows the face that looks at us.
    const count = (fills: string[], face: string) => fills.filter((fill) => fill === face).length;
    for (const yaw of [0, 40, 90, 140, 180]) {
      const up = surfaces(yaw, 0, 0, STOCK);
      expect(count(up, 'GRIP'), `yaw ${yaw} upright`).toBeGreaterThan(2 * count(up, 'GRAPHIC'));
      const down = surfaces(yaw, 0, 180, STOCK);
      expect(count(down, 'GRAPHIC'), `yaw ${yaw} flipped`).toBeGreaterThan(2 * count(down, 'GRIP'));
    }
  });

  it('paints the underside of a kick curling toward the camera over the grip behind it', () => {
    // Looking down the length of the deck from a low camera, the near kick
    // rises toward the eye: its underside is what shows there.
    for (const yaw of [75, 100, 130]) {
      const fills = surfaces(yaw, 0, 0, LOW);
      expect(fills, `yaw ${yaw}`).toContain('GRIP');
      expect(fills, `yaw ${yaw}`).toContain('GRAPHIC');
      expect(fills.lastIndexOf('GRAPHIC'), `yaw ${yaw}`).toBeGreaterThan(fills.lastIndexOf('GRIP'));
    }
  });

  it('keeps the deck a solid of the same thickness the feet and the bar are measured from', () => {
    for (const x of [-48, -30, 0, 30, 48]) expect(deckBottomY(x) - deckTopY(x)).toBeCloseTo(2.4, 9);
  });
});
