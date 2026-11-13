/**
 * Triangle Bank's paint as each surface looks in sun (the look lights it per pixel), read by eye from the
 * reference clips listed in docs/MIAMI_TRIANGLE_REFERENCE.md (Muska's, Carpenter's, Nix's, Appleyard's and
 * Edge's frames, Ehrlund's side-on clip) for the generic materials only: faded clay pavers, white-painted
 * board-formed concrete gone grey where it peels, sea-grape hedges and palms, humid bay-front light. Not
 * sampled from them, and nothing here is the memorial's artwork.
 */
export const MIAMI_PAINT = {
  // The plaza: square clay pavers, sun-faded from terracotta toward salmon, pale sanded joints, stains.
  paver: '#b98a72',
  paverWarm: '#c28f73',
  paverPale: '#c9a18a',
  paverDark: '#a47862',
  joint: '#cdbba7',
  rust: '#9a6545',
  waterStain: '#94725f',
  oil: '#6f5a4e',
  scuff: '#7c665a',
  gum: '#5d5550',

  // The deck: bare grey concrete trowelled smooth, a white-painted curb rim, waxed dark where it's skated.
  deck: '#bdbab0',
  deckWorn: '#c9c6bc',
  deckStain: '#a19e94',
  rim: '#e6e4da',
  rimPeeled: '#b8b5aa',
  wax: '#7d7a72',

  // Board-formed walls painted white: the deck's faces and the planter walls, with grey showing where it peels.
  wall: '#e2dfd2',
  wallFresh: '#ecebe2',
  wallPeeled: '#bdbaae',
  wallGrime: '#8e8b80',
  wallRust: '#a8805e',
  wallJoint: '#c4c1b4',
  coping: '#c7c6bd',
  copingWorn: '#adaca3',

  // The bank: plain cast concrete, lighter than the deck, its edges waxed and chipped.
  bank: '#b4b4ad',
  bankSide: '#a9a9a2',
  bankUnder: '#8a8a84',
  bankWax: '#6f6f69',
  bankChip: '#cfcfc8',
  pedestal: '#9d9c95',

  // Planting: Bermuda-type turf, sea-grape and ficus hedges, flowering shrubs, mulch.
  grass: '#72894b',
  grassWorn: '#8c9056',
  grassDry: '#a59f66',
  hedge: ['#4b6b3b', '#58793f', '#3f5f37', '#62824a'],
  mulch: '#6e5341',
  bloomRed: '#c33440',
  bloomPink: '#d0577a',
  bloomPurple: '#7b4fa1',
  bloomYellow: '#d0b23c',
  potConcrete: '#cfc6b2',
  potSoil: '#5a4b3a',

  // Park furniture: aluminium poles, dark bronze lamp heads, slatted benches on cast feet.
  pole: '#8d9493',
  lampHead: '#4f5553',
  lampLens: '#e9e6d6',
  benchSlat: '#8b6a4d',
  benchFrame: '#4a4e4c',
  bin: '#3f4844',

  // Palms.
  royalTrunk: '#bdbcb2',
  dateTrunk: '#7a6a52',
  coconutTrunk: '#9a8d74',
  crownshaft: '#6f8a4a',
  frond: ['#5f7d43', '#6d8a4b', '#58763f'],
  dateFrond: ['#55703f', '#4a6538', '#5e7a45'],
  rachis: '#6b7a46',

  // The boulevard and car park.
  asphalt: '#5f615d',
  asphaltWorn: '#6c6d68',
  laneWhite: '#e6e3d8',
  laneYellow: '#d6b84a',
  sidewalk: '#cbc6b8',
  kerb: '#d2cec2',
  median: '#738f4a',
  guideway: '#dddcd4',
  guidewayShade: '#b9b8b0',

  // The bay: water under a hazy sky, a seawall and its rail.
  bay: '#6f97a0',
  bayFar: '#8fb0b5',
  seawall: '#c9c5b8',
  railing: '#9aa09e',

  // Downtown towers: pale stucco and concrete, blue-green and grey glass.
  towers: ['#e3ddcb', '#e7e6df', '#d9d2bf', '#e9e7e0', '#e5dfcf', '#d5d9d6', '#e8e5db', '#cfd3cf'],
  towerGlass: ['#6f8a95', '#5d7480', '#7f969b', '#566a73'],
  balconyRed: '#a8584b',
  roof: '#a9aba5',
} as const;
