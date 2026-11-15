/**
 * Emage's authored sunlit paints, as the place stood about 2021-22 (SITE_PLAN.md's palette, checked against the
 * photographs). The look supplies daylight; these carry no baked directional light. The concrete surface reads
 * red minus blue over 0.2 as safety-yellow paint and chips it, so warm concrete stays under that and the
 * sandstone, which is redder, is drawn as the look's stucco instead.
 */

/* ----- The plaza ----- */

/** Dusty red-tan plaza concrete, cast in panels (the look's pavers at panel size), and its tooled joints. */
export const PLAZA = '#ad8d7c';
export const PLAZA_JOINT = '#8c7566';
/** Grey paving out past the plaza to the buildings; the corridor's paving, a little greyer than the plaza. */
export const OUTER_PAVING = '#99958b';
export const CORRIDOR = '#a08a7e';
/** The curved band of dark pavers across the plaza, and its pale concrete edging. */
export const PAVER_BAND = '#6b6663';
export const PAVER_EDGING = '#c9c2b4';
/** Round tree grates and covers, flush in the plaza. */
export const GRATE = '#6a6660', GRATE_RIM = '#857f77';
/** Planting beds round the plaza, and the path down beside the south building. */
export const HILLSIDE = '#8a8b62';
export const TRAIL = '#b59e8e';

/* ----- The stairs and terraces ----- */

/** The tiers' cool grey cast concrete: risers, curbs and their tops, and the dark paved slabs by the stones. */
export const CONCRETE = '#a8a69c', TREAD = '#a7a69d', PAVED = '#7f8079';
export const SLAB_JOINT = '#71736d';
/** The tiers' blunt ends on the slope, and the stair's outer wall down to the bank. */
export const TERRACE_END = '#a8a499';
export const OUTER_WALL = '#a6a49a';
/** Where a riser was patched: a paler, fresher rectangle. */
export const RISER_PATCH = '#bab8ae';
/**
 * The red sandstone half-steps, block by block: tops dusty and paler than their faces, grime ground into some
 * and a pale bloom on others, the two blocks' joint, and the blocks replaced in pale concrete (refs 47, 01, 05, 68).
 */
export const SANDSTONE = ['#957b71', '#8b7369', '#9d8378', '#866d63'];
export const SANDSTONE_FACE = ['#826452', '#785d4e', '#886a59', '#735a4d'];
export const STONE_GRIME = '#6e574e', STONE_DUST = '#ad968a';
export const STONE_JOINT = '#6f4339';
export const STONE_PATCH = '#b5b0a3';
/** Grey 3/4-inch gravel in the beds (the look's asphalt aggregate at gravel size). */
export const BED_GRAVEL = '#8a8984';
/** Dry bunch grass and weed stems: straw, tan, a little green left low down; the slope past the tiers' end. */
export const BUNCH = ['#a99b76', '#9c906d', '#b4a885', '#8d8565', '#a39469'];
export const BUNCH_GREEN = '#7c8160';
export const END_SLOPE = '#a39a68';
/** The step lights: a flush grey plate, a faint warm lens. */
export const LIGHT_PLATE = '#959893';
export const LIGHT_WARM = '#8a8475';
/** Dry grass and dirt under the thicket beside the rail. */
export const RAIL_BANK = '#9a9166';

/* ----- The rail, guard and bench (as built: not dressed) ----- */

export const RUST = '#4c3b32', GALVANIZED = '#8f9792';
export const RAIL_POST = '#55443a';
export const RAIL_SLEEVE = '#a7aba4';
export const GUARD_POST = '#87908a';
export const BENCH_SIDE = '#7f7661';
export const BENCH_TOP = '#9b9078';
export const BENCH_FOOT = '#666f68';
export const BENCH_FOOT_TOP = '#7d8275';

/* ----- The trail ----- */

/** The trail's buff concrete apron, its tooled joints and cracks, the dry-grass verge and the dirt shoulder. */
export const APRON = '#b9a98f';
export const TRAIL_JOINT = '#978a74';
export const CRACK = '#8a7d6c';
export const VERGE = '#b3a06a';
export const DIRT = '#8b7a60';
/** The brushy shelf and bank down to the water. */
export const SHELF = '#76774f';
export const LOWER_BANK = '#6f7150';
export const WET_BANK = '#7c7864';

/* ----- The river ----- */

/** The river's own dark body under its reflection: olive-brown running water, the pool behind the weir darker. */
export const WATER = '#4d5a4a';
export const POOL = '#3e4a3f';
/** White water at the weir's crest, greener as it breaks up downstream. */
export const FOAM = '#e2e6e0';
export const FOAM_FADING = '#9eaa9a';
/** Grey-brown boulders and riprap. */
export const WEIR_ROCK = '#8a857a';
export const WEIR_ROCK_PALE = '#9a968a';
export const WEIR_ROCK_DARK = '#77736a';
export const RIPRAP = '#8f8a7e';
/** Commons Park across the river: its bank, mown lawns and pale paths. */
export const FAR_SLOPE = '#7a805a';
export const FAR_LAWN = '#8a9168';
export const FAR_PATH = '#b3a58f';

/* ----- The bridge ----- */

/** The deck's grey weathered timber, strip by strip (refs 40, 43), and the dark steel cross beams under it. */
export const DECK_TIMBER = ['#7d7468', '#857b6e', '#766e63', '#8a8174', '#7a7266'];
export const DECK_SIDE = '#5d6461';
/** White painted steel: edge girders, masts; galvanised guards, pickets and stays. */
export const BRIDGE_SPINE = '#dfe2da';
export const MAST = '#dcdfd4';
export const BRIDGE_GUARD = '#74827e';
export const BRIDGE_PICKET = '#87928b';
export const STAY = '#9aaba5';
/** Pale cast concrete piers and abutment. */
export const PIER_SIDE = '#b3b0a4';
/** The retaining wall's red sandstone blocks, duller than the stairs'. */
export const WALL_STONE = ['#94766a', '#8a6e63', '#9c7e71', '#836a60', '#907368'];

/* ----- The apartments ----- */

/** The repainted scheme: pale grey-white walls, mid-grey and charcoal bays, the odd cream one, dark frames. */
export const WALL_PALE = '#d6d4cc';
export const WALL_GREY = '#b4b4ae';
export const DARK_BAY = '#4c5150';
export const WALL_CREAM = '#cfc4a8';
export const FRAME_DARK = '#2f3233';
export const WINDOW = '#5f716e';
/** White fascia, eaves and pediments; a stone-clad base on some bays. */
export const TRIM = '#e4e2da';
export const STONE_BASE = '#8d8377';
/** Balcony slabs and their dark guards (flat panels: pickets this fine would flicker). */
export const BALCONY_SIDE = '#5b625e';
export const BALCONY_RAIL = '#363b3b';
/** Dark grey roofs, pale chimneys; the plain block closing the corridor. */
export const ROOF = '#5d6463';
export const CHIMNEY = '#b5b2a6';
export const APARTMENT = '#a9a8a0';

/* ----- Downtown ----- */

/** Quiet masses beyond the park: brick and buff mid-rises on darker podiums, the teal pair, taller grey towers. */
export const TOWER_WARM = '#9a8b7e';
export const TOWER_RED = '#9a6a5c';
export const TOWER_CREAM = '#c7c1ad';
export const TOWER_PODIUM = '#6f6a63';
export const TOWER_TEAL = '#789b9b';
export const TOWER_GREY = '#a4aaa2';
export const TOWER_SLATE = '#7d8a8e';

/* ----- Planting, in leaf ----- */

/** The thicket on the bank beside the rail: olive and grey-green willow, a little straw, one shrub yellowing (refs 01-03, 06). */
export const THICKET = ['#78805a', '#727b56', '#7f845e', '#757e59', '#7b825b'];
export const THICKET_STRAW = '#928c62';
export const BRUSH_YELLOW = '#a69443';
/** River brush: head-high willows, greyer than the bank's thicket. */
export const WILLOW = ['#76805e', '#68745a', '#83896a', '#8d8f6c', '#6f7a58'];
/** Tall shrubs on the bank between the bridge and the south building. */
export const SHRUB = '#657454';
export const SHRUB_PALE = '#738062';

/* ----- Furniture ----- */

/** Dish-topped lamps and the bin, dark grey; the blank map board, dark green. */
export const LAMP = '#454a48';
export const LAMP_DISH = '#676d68';
export const MAP_POST = '#3b5147';
export const MAP_BOARD = '#798277';

/** Thin, cool haze over the river valley, leaving downtown its tone. */
export const RIVER_HAZE = '#d3d8d5';
