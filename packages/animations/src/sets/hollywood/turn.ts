import type { Vec3 } from '../../camera/view';
import type { Bake, Ink, Paint } from '../../three/bake';

/**
 * Hollywood High has two ways down off one walkway: the 16 at one end and
 * the 12 at the other, falling the opposite way. A stage always runs its
 * stairs toward +x, so the 12 is staged in the same scenery turned half
 * round about the walkway (never mirrored). Paint stays authored and flat:
 * the one stage sun lights the turned normals per pixel.
 */

/** The parts of Bake the Hollywood scenery draws with, so a turned view of one can stand in for it. */
export type Baker = Pick<Bake, 'quad' | 'quadCorners' | 'triangle' | 'tube' | 'box' | 'frustum'>;

/**
 * Half a turn about up, around the line x = about / 2: (x, z) goes to
 * (about − x, −z). It's its own inverse, so the same turn maps the 12's
 * frame into the 16's and back.
 */
export const turnPoint = (about: number, [x, y, z]: Vec3): Vec3 => [about - x, y, -z];
const turnNormal = ([x, y, z]: Vec3): Vec3 => [-x, y, -z];

/** The box's faces after the turn: front and back swap, as do its two ends. */
const TURNED_FACE: Record<string, string> = { t: 't', b: 'b', f: 'k', k: 'f', l: 'e', e: 'l' };

/** Draws into `inner` everything given to it turned half round (turnPoint), with authored paint unchanged. */
export class TurnedBake implements Baker {
  constructor(private readonly inner: Baker, private readonly about: number) {}

  private at = (p: Vec3) => turnPoint(this.about, p);

  triangle(a: Vec3, b: Vec3, c: Vec3, n: Vec3, paint: Paint, ink: Ink) {
    this.inner.triangle(this.at(a), this.at(b), this.at(c), turnNormal(n), paint, ink);
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, paint: Paint, ink: Ink) {
    this.inner.quad(this.at(a), this.at(b), this.at(c), this.at(d), turnNormal(n), paint, ink);
  }

  quadCorners(a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3, paints: [Paint, Paint, Paint, Paint], ink: Ink) {
    this.inner.quadCorners(this.at(a), this.at(b), this.at(c), this.at(d), turnNormal(n), paints, ink);
  }

  tube(spine: Vec3[], radii: number[], paint: Paint, ink: Ink, sides?: number, caps?: boolean) {
    this.inner.tube(spine.map(this.at), radii, paint, ink, sides, caps);
  }

  /** Still a box lying square to the axes, with its faces and normals turned. */
  box(min: Vec3, max: Vec3, side: string, top: string, ink: Ink | null, faces = 'tbfkle', sunlit = true) {
    const a = this.at(min), b = this.at(max);
    const turned = [...faces].map((key) => TURNED_FACE[key] ?? key).join('');
    this.inner.box([Math.min(a[0], b[0]), min[1], Math.min(a[2], b[2])], [Math.max(a[0], b[0]), max[1], Math.max(a[2], b[2])], side, top, ink, turned, sunlit);
  }

  /** A square frustum turned half round is the same frustum. */
  frustum(x: number, z: number, y0: number, y1: number, half0: number, half1: number, paint: Paint, ink: Ink) {
    const [tx, , tz] = this.at([x, 0, z]);
    this.inner.frustum(tx, tz, y0, y1, half0, half1, paint, ink);
  }
}
