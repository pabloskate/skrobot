/** Smooth fit used only to estimate a player's score from their attempt history. */
export function playerConsistencyCurve(headroom: number): number {
  return 0.5 + 0.45 * Math.tanh(headroom * 0.45);
}
