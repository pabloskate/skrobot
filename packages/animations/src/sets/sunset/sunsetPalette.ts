/**
 * Roof to Bank's paint as each surface looks in sun (the look lights it per pixel), read by eye from the
 * reference photographs (docs/SUNSET_REFERENCE.md): the Skate Sonr wide shot of the bank and planters in hard
 * sun, the 2019 cover photograph from the bank's foot, the CCS visitors' photograph and the user's frames from
 * the roof and the street. Not sampled from them. Signs, logos and the business's blue and orange are left out:
 * the canopy keeps its unbranded sage and cream (docs/LOCATION_PRESENTATION.md).
 */
export const SUNSET_PAINT = {
  // The bank: grey paint rolled over board-formed concrete, streaked down the fall line, patched where tags
  // were painted out, dirty at the toe.
  bank: '#a9adae',
  bankRidge: '#bcbfbf',
  bankFurrow: '#8f9496',
  bankPatch: '#9ca2a6',
  bankPatchOld: '#b4b5b0',
  bankGrime: '#7f817c',
  bankScuff: '#5f6264',
  bankChip: '#cfd0ca',
  bankEnd: '#a2a6a6',
  cap: '#b9bab4',
  capWall: '#a9aaa3',

  // Sidewalks: pale LA concrete in panels, a few replaced, cracked and stained; the gutter and curb.
  sidewalk: '#c8c3b6',
  sidewalkOld: '#bab5a8',
  sidewalkFresh: '#d3cfc3',
  joint: '#928e83',
  crack: '#76736b',
  stain: '#aaa597',
  gutter: '#bfbaad',
  curbTop: '#d4d0c4',
  curbGrime: '#9c988c',
  curbRed: '#a7584b',
  farSidewalk: '#c2bdaf',

  // The boulevard: sun-faded asphalt, oil down each lane, darker trench patches, tar-sealed cracks.
  road: '#76756f',
  roadOil: '#64645f',
  roadPatch: '#5d5d59',
  roadPatchOld: '#6c6c67',
  tar: '#3f403d',
  laneWhite: '#d8d7ce',
  laneYellow: '#cfae4f',
  manhole: '#57564f',
  manholeRim: '#6e6c64',

  // The side lot and the driveway apron.
  lot: '#7c7b74',
  stall: '#dddad0',
  wet: '#8a8b86',
  apron: '#bcb8ac',
  apronJoint: '#97938a',

  // The roof deck: a pale granulated cap sheet, its laps, ponding stains and scuffs along the approach.
  roof: '#afaca2',
  roofLap: '#9d9a90',
  roofPond: '#a29e93',
  roofScuff: '#8c8981',
  roofPatch: '#9b9a94',

  // The canopy: sage fascia panels, chalked by the sun and streaked under the coping, a cream drip band, a
  // galvanized coping and flashing, a pale soffit with strip lights, sage steel posts.
  sage: '#66796d',
  sageChalk: '#7c8c81',
  sageDark: '#4d5e54',
  streak: '#556058',
  rust: '#866a50',
  cream: '#cfc2a2',
  creamDirty: '#b3a88d',
  coping: '#b7bab3',
  flashing: '#c6c8c1',
  soffit: '#d3cfc3',
  stripLight: '#f4eed9',
  joist: '#6f7a72',
  post: '#58695f',
  pipe: '#a7aba5',
  hose: '#2f6a58',

  // The wash building behind the bays: painted block, steel doors and dark glazing.
  block: '#cfcabc',
  blockShade: '#bdb8aa',
  door: '#5c655f',
  glass: '#34403f',
  mullion: '#a9ada4',
  bayFloor: '#8e918c',
  bayWall: '#c3c0b4',

  // Planters: board-formed grey concrete boxes, each board a shade apart, oleanders clipped into mounds.
  planter: '#b1b2ab',
  planterBoard: '#a6a7a0',
  planterCap: '#bbbcb5',
  soil: '#5b4d3e',
  oleander: '#4e6b40',
  oleanderLight: '#62804a',
  oleanderDark: '#3c5434',
  bloomWhite: '#efebe1',
  bloomPink: '#e2a7b2',
  weed: '#71803f',
  weedDry: '#a39966',
  litter: '#cfc8b5',

  // The shoulder planted behind the crest.
  bed: '#6b5c48',

  // Neighbours: white stucco with terracotta tile behind the canopy's corner, the mini-mall past the lot.
  stucco: '#e7e1d1',
  stuccoShade: '#d9d2c1',
  tile: '#ad6649',
  tileDark: '#91533c',
  trim: '#d8d1bf',
  windowGlass: '#3b4549',
  grille: '#3e3c38',
  mall: '#dbcfb5',
  mallCoping: '#ae5c41',

  // Rooftop equipment.
  unit: '#b8bbb3',
  unitBase: '#8f928a',
  vent: '#8f948c',

  // The billboard: a steel post and frame, a plain face between campaigns.
  billboardSteel: '#77796f',
  billboardFace: ['#e6e1d3', '#b9cdd3', '#34505c'],

  // Street furniture.
  wood: '#6d5b48',
  woodGrey: '#837363',
  poleMetal: '#8e928b',
  wire: '#2b2c2a',
  hydrant: '#c2a24a',
  bench: '#56695b',
  can: '#3f5446',
  signBlue: '#33698a',
  vacuum: '#d0a33b',
  vacuumHead: '#33698a',
  booth: '#d8d2bf',
  boothRoof: '#5c6f63',
  open: '#e2523f',
  towels: ['#e7e3d6', '#d9e2e5', '#ece6d3', '#cfdade'],

  // Across Sunset: stucco and brick shopfronts, dark glass, awnings, blank sign bands.
  facades: ['#d6cdb6', '#c4b6a0', '#d9d2c2', '#b9bcb0', '#cdb79d', '#e0d6c0', '#bfae98'],
  awnings: ['#7a3b35', '#2f6a5c', '#33475e', '#9b8a62', '#b0573c'],
  signBands: ['#e9e1c9', '#2f3b45', '#8f2f2b', '#d7c48a', '#3f6150'],
  brick: '#9c5a45',
  mortar: '#b9ab98',
  coping2: '#a4a493',
  storefrontFrame: '#5c605b',
} as const;
