import { X0 } from '../motion/trick';

/** The street's laid-out span: props repeat across it as it scrolls. */
export const SPAN_LO = X0 - 2200;
export const SPAN_HI = X0 + 2400;

/** A stable 0–1 value for an integer cell. */
export function hash2(i: number, j: number, salt = 0): number {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(j | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
