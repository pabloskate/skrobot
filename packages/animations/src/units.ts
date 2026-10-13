/**
 * The stage's yardstick. The board is the measure of everything the motion
 * does — the deck is 96 units nose to tail (board/deck.ts) — and it is a
 * 31-inch street deck, so a unit is about a third of an inch (0.82 cm).
 * Board, riders, cameras and the physics of a drop are all in these units.
 * The spots are drawn at their own scale and taken onto the stage at this
 * one (sets/setScale.ts).
 */

/** The deck's length, nose to tail, in inches. */
export const DECK_INCHES = 31;
/** Stage units per inch and per foot. */
export const INCH = 96 / DECK_INCHES;
export const FOOT = 12 * INCH;
