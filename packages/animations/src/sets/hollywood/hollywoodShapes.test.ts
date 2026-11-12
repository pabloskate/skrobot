import { describe, expect, it } from 'vitest';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { buildHollywoodGeometry } from './hollywood3d';
import { HOLLYWOOD_CURB_Z, HOLLYWOOD_FAR_CURB_Z, HOLLYWOOD_WALKWAY, HOLLYWOOD_FILMERS, HOLLYWOOD_FOOT as F } from './hollywoodLayout';
import { HOLLYWOOD_TREES } from './hollywoodTrees';

describe('Hollywood 2012 site plan', () => {
  it('sets the ruler dimensions without moving the fence filmer', () => {
    expect(HOLLYWOOD_WALKWAY / F).toBe(72);
    expect(HOLLYWOOD_CURB_Z / F).toBe(-28);
    expect(HOLLYWOOD_FAR_CURB_Z / F).toBeCloseTo(-107.1, 8);
    expect(HOLLYWOOD_FILMERS.obstacles!.fence!.stands.bottom.z / F).toBe(-21.5);
  });
  it('leaves the retaining wall bare of black pickets between the stairs', () => {
    const built = buildHollywoodGeometry();
    try {
      const position = built.props.getAttribute('position'), info = built.props.getAttribute('aInfo');
      for (let i = 0; i < position.count; i++) {
        if (Math.round(info.getX(i) * 255) !== 73) continue;
        expect(position.getX(i) > -69 * F + 3 && position.getX(i) < -3 * F - 3).toBe(false);
      }
    } finally { built.ground.dispose(); built.props.dispose(); built.decals.dispose(); }
  });
  it('keeps the school-side filmer below the roof with an unobstructed stair view', () => {
    const built = buildHollywoodGeometry(), material = new MeshBasicMaterial({ side: DoubleSide });
    try {
      const mesh = new Mesh(built.props, material);
      const eye = new Vector3(30 * F, -2.5 * F, 12 * F);
      const up = new Raycaster(eye, new Vector3(0, 1, 0));
      expect(up.intersectObject(mesh)[0].point.y / F).toBeCloseTo(1, 5);
      for (const [x, y, z] of [[0, 1, -4], [8, -3, -4], [16, -7.5, -4]]) {
        const target = new Vector3(x * F, y * F, z * F), delta = target.clone().sub(eye);
        const ray = new Raycaster(eye, delta.clone().normalize(), 0, delta.length() - 1);
        expect(ray.intersectObject(mesh)).toHaveLength(0);
      }
      for (const tree of HOLLYWOOD_TREES) for (const shot of [HOLLYWOOD_FILMERS.stairs, HOLLYWOOD_FILMERS.obstacles!.fence!]) {
        for (const stand of [...Object.values(shot.stands), ...Object.values(shot.across ?? {})]) {
          expect(Math.hypot(tree.at[0] - stand.u, tree.at[2] - stand.z)).toBeGreaterThan(12 * F);
        }
      }
    } finally { material.dispose(); built.ground.dispose(); built.props.dispose(); built.decals.dispose(); }
  });
});
