/**
 * Authored sunlit paint; the realistic look supplies all illumination per pixel (light: 'shader'). Judged from
 * the tripod stills beside the 1997-98 frames, not from the hex values (SITE_PLAN.md, palette).
 */
export const LEAP_OF_FAITH_PAINT = {
  /** The paler band along every painted top edge (refs 20, 82). */
  cap: '#dfeaea',
  /** The left block's white vertical-ribbed siding (refs 20, 91). */
  siding: '#e6e8e2',
  /** Planter and bed soil, dry and mulched. */
  soil: '#6f604c',
  /** Dusty clipped shrubs on the planter (refs 20, 82), and their two companions. */
  hedge: '#56633f',
  hedgeDark: '#3f4b30',
  shrubOlive: '#6b6e45',
  hedgeDeep: '#4c5a3a',
  /** Bare weathered concrete: the piers, the gallery deck, the walkway's floor. */
  concrete: '#b9b5aa',
  /** The pale sky-blue paint on the walls, fascia and lower columns (refs 20, 82, 91). */
  white: '#bfd9df',
  tread: '#aeb0a6',
  metal: '#939e99',
  mesh: '#b3bcb3',
  /** Pale plank tops and seats (refs 20, 82, 143), and the painted steel A-frames under them. */
  tableTop: '#d9e2de',
  tableEdge: '#cbd6d3',
  tableFrame: '#a9bcc0',
  /** The lower court's red-brown tan paving (refs 20, 91, 129; 05 and 122 in the 1997 sun). */
  court: '#ad9a8d',
  /** Where feet and wheels have worn the court paler. */
  courtWorn: '#b8a79b',
  /** The undercroft's floor, dusty and out of the weather. */
  bayFloor: '#aea398',
  walkway: '#b9b5aa',
  walkwayWorn: '#c3bfb4',
  riser: '#989f94',
  /** The stair rails' base plates, rusted at the feet (refs 05, 141). */
  plate: '#7a6c5e',
  plateCap: '#8c7c6b',
  /** The undercroft's off-white back wall and the cream walls (refs 82, 20, 122). */
  bayBack: '#e3dfd0',
  cream: '#e1dccb',
  pier: '#b9b5aa',
  /** The gallery's underside and joists, in shade anyway (refs 05, 20). */
  beam: '#6e675e',
  door: '#6b4a3a',
  doorFrame: '#8a7a68',
  kick: '#4f3a2f',
  glass: '#384e49',
  sashFrame: '#9aa39c',
  /** Surface conduit and its junction box, painted with the wall (refs 05, 144, 18). */
  conduit: '#cdc9bb',
  junction: '#c3bfb0',
  weepHole: '#2f302c',
  rust: '#7f5638',
  drain: '#4f4b45',
  drainFrame: '#77746b',
  joint: '#87776d',
  scuff: '#8a7a6c',
  stain: '#8f7c70',
  sealant: '#968579',
  /** Dry leaves and grit drifted into corners and against wall feet. */
  litter: '#a39070',
  /** The perimeter wall's pale painted block and its cap. */
  block: '#d9d6c8',
  blockCap: '#c9c5b6',
  gate: '#6d726c',
  kerb: '#bdb9ad',
  sidewalk: '#c2beb2',
  asphalt: '#5f605c',
  /** The low houses across the street. */
  house: '#ddd6c4',
  houseAlt: '#cfd3c8',
  roofTile: '#8f6a55',
  roofGrey: '#77736b',
  churchRoof: '#847a68',
} as const;
