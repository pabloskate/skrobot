/**
 * Wallenberg's paint as each surface looks in sun (the look lights it per pixel), read by eye from the
 * reference photographs (docs/WALLENBERG_REFERENCE.md): the 51-inch measurement shot from the street, the
 * FindSkateSpots photograph from the side stairs, the roll-in stills and Jenkem's 2024 group photograph.
 * Not sampled from them. The scene is the spot as those photographs show it, about 2020.
 */
export const WALLENBERG_PAINT = {
  // The blocks: dark sealed asphalt treads between off-white painted faces, their caps grey-white and grimy.
  tread: '#6c6d69',
  treadWorn: '#7b7c77',
  treadPatch: '#5c5e5b',
  platform: '#6f706b',
  face: '#d6d5ca',
  facePeeled: '#a7a69c',
  faceBuff: '#efeee7',
  faceBuffOld: '#c4c3b8',
  faceGrime: '#8d8c84',
  cap: '#c9c8be',
  capWax: '#77776f',
  weed: '#6f7a44',
  weedDry: '#9a9461',

  // Asphalt round them: the court-side slope, scuffed by tyres, and the yard the blocks land on.
  slope: '#777773',
  tyre: '#4f504d',
  yard: '#7e7d78',
  yardPatch: '#6d6e6a',
  gutter: '#b9b8ae',
  crack: '#4b4c48',
  oil: '#5a5a56',

  // Concrete: the side stairs, the ledge along the alley, the bank's edge.
  concrete: '#c4c2b6',
  concreteTread: '#bebcb0',
  ledge: '#c9c7bb',
  ledgeCap: '#cfcdc1',

  // The gym: cream painted block over a red brick base, powder-blue ribbed panels under dark windows.
  block: '#ebe4cc',
  blockShade: '#d6d0bb',
  brick: '#9a5340',
  mortar: '#b6a998',
  panel: '#87a5c6',
  rib: '#6e8eb1',
  glass: '#2c3843',
  mullion: '#c9cbc2',
  parapet: '#d9d4bf',
  coping: '#b8b7ad',
  downspout: '#bd7a55',
  conduit: '#d2cfbf',
  door: '#3d3833',
  awning: '#4f86ba',
  awningFascia: '#e6e6de',
  vent: '#b3b8b4',
  ventCap: '#6c7372',
  lamp: '#5e625d',
  sign: '#2f5fa6',

  // The annex: the same brick, a pink door, a buff parapet; the terrace planting above it.
  annexDoor: '#d6a196',
  annexParapet: '#c7bca8',
  planter: '#9f6b53',
  shrub: '#55693f',
  bloom: '#ecebe3',

  // Hardware.
  galvanised: '#a4a9a4',
  chainLink: '#a9b1ac',

  // The roll-in: plywood gone grey at the toe, its framing lumber.
  plywood: '#c9a56f',
  plywoodGrey: '#ab9878',
  plywoodSeam: '#9b7c51',
  lumber: '#ab8550',
  brace: '#9e7a4a',

  // Up the side stairs: the planted bank and its picket fence.
  bank: '#6b6f4a',
  bankSoil: '#7c6c55',
  picket: '#a3a8a2',

  // The neighbourhood: stucco apartments in the Richmond's pale colours, white sash, garage doors.
  houses: ['#ddd0b5', '#cfd2c8', '#e5dcc8', '#c6d3d9', '#d9c4aa', '#e3e1d6', '#bfb6a5', '#d7d9cf'],
  windowFrame: '#efeee6',
  windowGlass: '#3a4650',
  garage: '#c8c6bd',
  trim: '#f1efe7',
} as const;
