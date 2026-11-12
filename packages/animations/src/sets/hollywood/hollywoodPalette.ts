/**
 * Hollywood High's paint about 2012, as each surface looks in sun (the look lights it per pixel). Read by eye from
 * the reference photos (refs 01, 02, 15-17, 20, 04-07 for the era's raw concrete; 41, 42, 38 for brick; 62-66 for
 * the retaining wall and sidewalk; 11, 28, 33, 50, 54 for the auditorium; 44, 80 for the road), not sampled from
 * them. The 2025 grey stair paint is left out on purpose.
 */
export const HOLLYWOOD_PAINT = {
  // Concrete: a warm pale buff, treads paler where feet and wheels go, risers a shade darker, noses rubbed.
  tread: '#bdb5a1',
  treadNose: '#c8c0ac',
  treadBack: '#aaa290',
  riser: '#ada592',
  riserArris: '#bab29e',
  riserNosing: '#9a917f',
  riserFoot: '#a19887',
  riserDrip: '#9c9382',
  walkway: '#bab3a1',
  walkwaySlabs: ['#bcb5a3', '#c0b9a6', '#b8b1a0', '#bdb6a3', '#b6af9e', '#c1baa7'],
  walkwayJoint: '#9b9484',
  /** The landings and the walks past them, paler than the walkway. */
  landing: '#c6c0ae',
  /** The street sidewalk: a shade paler and cooler than the walkway. */
  sidewalk: '#c2bfb1',
  sidewalkJoint: '#a3a194',
  farGround: '#b5b2a6',
  cheekTop: '#bcb49f',
  cheekFace: '#b0a894',
  cheekInner: '#b4ac99',
  cheekStain: '#9f9684',
  coping: '#cfc8b4',
  kerb: '#c0bcae',

  // Brick: orange-brown face brick on grey-tan joints, low in contrast (refs 02, 41, 42).
  brick: '#96654e',
  mortar: '#a89c8a',
  plinth: '#6c675c',

  // The auditorium and entry.
  auditorium: '#e3d9bd',
  fin: '#ece3cb',
  /** The exposed-aggregate panels: coarse buff-grey stone, paler than they read in the bay's shade. */
  pebble: '#c0b6a0',
  door: '#6f2a2a',
  doorFrame: '#4a3a33',
  pullBar: '#b9b6aa',
  doorPanel: '#8a8b84',
  soffit: '#d8cdb2',
  lens: '#f2eedf',
  entryConcrete: '#b9b2a0',
  entryStrip: '#5f5a50',
  porch: '#c6bfac',
  whiteRail: '#d2d0c2',

  // The covered courts.
  courtConcrete: '#bdb6a3',
  /** The courts' floor where feet and bikes have worn it, a touch darker and greyer than the open landing. */
  courtFloor: '#aea999',
  wallBox: '#8f918a',
  galvanised: '#a4a69f',

  // Street.
  road: '#7f7b73',
  laneWhite: '#d5d3c4',
  laneYellow: '#c6ad66',
  wellSoil: '#6c5c47',
  postBlack: '#3a3d38',
} as const;
