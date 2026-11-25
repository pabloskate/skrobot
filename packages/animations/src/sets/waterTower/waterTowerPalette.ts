/**
 * The water tower gap's paint as each surface looks in sun (the look lights it per pixel), read by eye from the
 * 1997 frames (refs 03, 05-18, 65, 66) beside the samples in the reference pack's palette, not copied from them.
 * The scene is the spot that morning: the walls grey cast concrete before the later tan coating, fresh dark
 * asphalt, the slopes dry at the end of summer.
 */
export const WATER_TOWER_PAINT = {
  // The roofs: pale warm-grey concrete, the lip a shade paler, the band and soffit under it plain.
  roof: '#bebcab',
  /** A rectangle of later pour or patching, a touch fresher and greyer than the deck round it. */
  patchPale: '#c6c4b5',
  patchDark: '#b2b0a1',
  /** A cold joint or saw-cut between pours: a faint darker line. */
  joint: '#a6a596',
  /** Water stood and dried round fixtures: a soft grey-brown ring. */
  stain: '#a9a594',
  /** Iron run off the vent's foot. */
  rust: '#9c8466',
  lip: '#d0cebf',
  lipUnder: '#8e8c80',
  beam: '#bab8a9',
  soffit: '#979587',
  reveal: '#79796f',
  // The walls: grey cast concrete, the paler strips only a shade off it (66, 67).
  wall: '#a09f95',
  strip: '#aaa99e',
  /** What the wall's wear weathers toward where it is bared: the same concrete, unpainted. */
  wallBare: '#a3a298',
  footing: '#c3c1b3',
  footingKerb: '#aaa99d',
  // The pavement: fresh dark asphalt in 1997, a chalk line or two on it (65, 66).
  asphalt: '#4f4f4d',
  chalk: '#9c8577',
  road: '#77756f',
  sidewalk: '#bebbb0',
  median: '#afa47e',
  /** The verge's watered groundcover and the far shoulder's. */
  verge: '#6f7a4c',
  hedge: '#4c5736',
  // The houses on the crest: white stucco, low terracotta tile roofs, dark window rows.
  house: '#e6e2d6',
  houseShade: '#d8d2c2',
  tile: '#a4644b',
  tileDark: '#8f5642',
  window: '#4a4e50',
  office: '#c8b797',
  officeWing: '#cfbda1',
  // Fixtures.
  hatchKerb: '#a9a89b',
  hatchLid: '#8f9189',
  vent: '#c4c3b6',
  ventLouvre: '#a9aa9d',
  ventCap: '#d3d0c0',
  galvanised: '#9da29b',
  lampPole: '#a2a8a3',
  lampHead: '#b7bcb6',
  fence: '#41463f',
  pipe: '#cfcdc2',
  pipeEnd: '#3e3f3b',
  sleeper: '#8a7c62',
  container: '#8b8d7e',
  pylon: '#8a8e87',
  wire: '#3b3e3a',
  /** The ditches down the east slope: pale concrete V's. */
  ditch: '#c3bea8',
} as const;

/**
 * The slopes' dry scrub (SURFACE.scrub): pale khaki grass and dirt under small grey-green bushes, thicker in
 * stands (11, 13, 16, 65, 66). Each face's paint says how much brush and bare dirt it carries.
 */
export const WATER_TOWER_SCRUB = { grass: '#bea164', brush: '#4b5636', dirt: '#bbb39d', size: 2.6 };
