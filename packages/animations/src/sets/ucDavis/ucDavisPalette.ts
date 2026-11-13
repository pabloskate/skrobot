/**
 * The UC Davis gap's paint as each surface looks in sun (the look lights it per pixel), read by eye from the
 * reference photographs and footage (docs/UC_DAVIS_REFERENCE.md): Kyle Camarillo's Joslin photograph, the two
 * photographs in Henry Luc's 2008 study and the Dern Brothers' 2023 episode. Not sampled from them. The scene
 * is the spot in its classic filmed state, the bank mostly under ivy with drifts of dead leaves and the trodden
 * path down it, the panels patched over old graffiti.
 */
export const UC_DAVIS_PAINT = {
  // The red wing: rust-red boarded panels between pale cast-concrete pilasters, on a pale plinth.
  panel: '#a6563f',
  panelWarm: '#ad5c44',
  panelCool: '#9b503d',
  /** Fresher paint rolled over tags in squares and blots, a touch brighter and pinker. */
  panelBuff: '#b5654c',
  /** Old tags ghosting through, darker and browner. */
  panelGhost: '#8c4636',
  panelGrime: '#7b4535',
  pilaster: '#d2cfc3',
  plinth: '#c9c6b8',
  plinthGrime: '#9a978b',
  /** The pale fin wall left of the hallway, painted concrete. */
  fin: '#dedbd0',
  finGrime: '#b3b0a5',
  louvre: '#8e958f',
  louvreSlot: '#4d5550',
  /** The roof's deep fascia: exposed-aggregate panels in a smooth frame. */
  fascia: '#c8c3b6',
  fasciaFrame: '#d8d5ca',
  soffit: '#a4a49c',
  beam: '#b3b2a8',
  /** Inside the hallway: white rendered walls, a dark door at the far end. */
  hallWall: '#e3e1d9',
  hallCeiling: '#b9b8b0',
  door: '#3c3d39',
  glass: '#33403f',
  mullion: '#9b9f99',

  // The terrace the rider rolls across, and its coping at the lip.
  terrace: '#c5c1b3',
  terraceWorn: '#cfcbbe',
  coping: '#cdc9bb',
  copingFace: '#bebaac',
  joint: '#8e8d83',

  // The board-formed planter: pale, its boards' seams, grime and algae at its foot, river stones in it.
  planter: '#cbc7b8',
  planterTop: '#d5d1c3',
  planterGrime: '#959285',
  planterAlgae: '#848b74',
  planterInside: '#a3a194',
  fill: '#8f8a76',
  stones: ['#bdb9a6', '#d4cfb9', '#a7a898', '#b8b0a0', '#9e9a8b', '#c9c4b2'],

  // The bank: ivy over soil, dead leaves drifted in it, the trodden path bare and sandy.
  ivy: ['#45633a', '#527040', '#5e7748', '#3e5a35', '#6b8250', '#4b6a3e'],
  ivyDry: '#7d7a4c',
  litter: '#86705a',
  litterPale: '#9b876c',
  litterDark: '#6c5a48',
  soil: '#7c6a50',
  bare: '#b3a07c',
  path: '#bba889',

  // The low curb round the bank, the sidewalk along it and the asphalt drive beyond.
  curb: '#cac7b9',
  curbFace: '#c0bdaf',
  curbGrime: '#94918a',
  sidewalk: '#c3c0b3',
  sidewalkWorn: '#ccc9bc',
  asphalt: '#7d7b74',
  asphaltPatch: '#6c6b66',
  asphaltWorn: '#8a8880',
  crack: '#55544f',
  oil: '#5f5e59',
  tyre: '#5a5954',
  leaf: ['#a48a55', '#8b6c42', '#b39a62', '#7e6440'],

  // The nine-flat-nine and its handrails.
  stair: '#c2bfb1',
  stairTread: '#c8c5b7',
  cheek: '#b9b6a8',
  handrail: '#33352f',

  // The quad below: lawn, the concrete paths across it, globe lamps.
  lawn: '#6f8a43',
  lawnWorn: '#8c8c55',
  lampPole: '#45413b',
  globe: '#ece4c8',

  // Campus life: bike racks, bikes, benches, bins.
  rack: '#7c817d',
  bikes: ['#2c4f7a', '#8e2a2a', '#2f2f2f', '#c9c8c0', '#3d6b4a', '#c46a2a', '#5d4b7a', '#1f1f22', '#9aa3a8', '#b03a48'],
  tire: '#26262a',
  seat: '#222224',
  bench: '#7e6a52',
  benchFrame: '#4a4b47',
  bin: '#4f5a52',

  // The buildings across the quad and behind: pale cast concrete, recessed dark glazing, beige spandrels.
  frame: '#d5d2c6',
  frameShade: '#c3c0b4',
  spandrel: '#c9c1ab',
  window: '#3e4a4b',
  balcony: '#cfccc0',
  brickStep: '#9c5b48',
} as const;
