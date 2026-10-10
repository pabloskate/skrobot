import { PALETTE } from '../../camera/camera';
import { mixHex } from '../../math';

/**
 * The waterfront set's layout and paint, near to far from the street: the
 * plaza's slabs and ledges, the promenade's pavers, palms and seats, and the
 * granite coping on the sea wall with the bay beyond (z is negative away
 * from the camera). The 3D set (waterfront3d.ts), its ground shader,
 * and the far panorama all lay themselves out from these.
 */

export const SLAB = 64;
export const LEDGE_FRONT_Z = -330;
export const LEDGE_DEPTH = 24;
export const LEDGE_H = 17;
/** Where the plaza's slabs give way to the promenade's pavers. */
export const PROM_Z = -386;
export const TREE_Z = -416;
export const SEAT_Z = -470;
/** The plaza's far edge: a granite coping on the sea wall, the bay beyond. */
export const WALL_Z = -600;
export const COPING_DEPTH = 14;
export const COPING_H = 6;
export const WATER_Z = WALL_Z - COPING_DEPTH;
export const RAIL_Z = WALL_Z - COPING_DEPTH / 2;
export const RAIL_H = 44;

export const INK = mixHex(PALETTE.ink, PALETTE.concrete, 0.42);

/** The set's own colors, tuned to sit in the sunset light under the scene palette. */
export const WF = {
  concrete: '#f0dcc7',
  concreteFar: '#f2ddd4',
  slabDark: '#e9d4bf',
  slabLight: '#f4e3d0',
  joint: '#cbb39f',
  crack: '#b9a08f',
  paver: '#e5bfac',
  paverDark: '#d9ad9a',
  paverJoint: '#c99a88',
  coping: '#eadbc9',
  ledge: '#e6d6c4',
  rail: '#4b3f7c',
  railLit: '#f3c3a4',
  trunk: '#b8957d',
  trunkLit: '#e6bf98',
  trunkRing: '#93725f',
  frondDark: '#4a6f6c',
  frondMid: '#6a9a72',
  frondLit: '#b5cd7e',
  coconut: '#7b5a4c',
  lampMetal: '#4b3f7c',
  lampGlass: '#ffe7b0',
  lampGlow: '#ffd38a',
  wood: '#cf9567',
  woodLit: '#eab481',
  planter: '#e4d3c0',
  shrubDark: '#4f8768',
  shrubLit: '#97c27a',
  flowerA: '#ff8fa8',
  flowerB: '#ffd36e',
  bin: '#5a4c8c',
  grate: '#9c8a96',
  sail: '#fff4e6',
  sailShade: '#e9c6cf',
  hull: '#584b8a',
  rippleLit: '#fbe1dc',
  glint: '#fff7ec',
  buoy: '#f26b4e',
  stain: '#a48d7c',
  band: '#dcc3b0',
  rippleDark: '#6560aa',
  skid: '#6f6380',
} as const;
