import type { Trick } from '@/features/tricks';

export type Resolution =
  | { kind: 'match'; trick: Trick }
  | { kind: 'ambiguous'; candidates: Trick[] }
  | { kind: 'none' };

/** Spoken-form aliases for base trick names the ASR is unlikely to emit verbatim. */
const BASE_ALIASES: Record<string, string> = {
  'tre flip': '360 Flip',
  'tre': '360 Flip',
  'three flip': '360 Flip',
  'tray flip': '360 Flip',
  '3 flip': '360 Flip',
  'treflip': '360 Flip',
  'shove it': 'Pop Shuvit',
  'shuvit': 'Pop Shuvit',
  'shuv': 'Pop Shuvit',
  'pop shove it': 'Pop Shuvit',
  'front shuv': 'Frontside Shuvit',
  'frontside shove it': 'Frontside Shuvit',
  'front shove it': 'Frontside Shuvit',
  'three sixty shove it': '360 Shuvit',
  'three sixty shuvit': '360 Shuvit',
  '360 shove it': '360 Shuvit',
  'big spin': 'Bigspin',
  'frontside bigspin': 'FS Bigspin',
  'frontside big spin': 'FS Bigspin',
  'front bigspin': 'FS Bigspin',
  'varial flip': 'Varial Kickflip',
  'varial heel': 'Varial Heelflip',
  'inward heel': 'Inward Heelflip',
  'double flip': 'Double Kickflip',
  'laser': 'Laser Flip',
  'front 180': 'Frontside 180',
  'frontside one eighty': 'Frontside 180',
  'front one eighty': 'Frontside 180',
  'fs 180': 'Frontside 180',
  'back 180': 'Backside 180',
  'backside one eighty': 'Backside 180',
  'back one eighty': 'Backside 180',
  'bs 180': 'Backside 180',
  'fifty fifty': '50-50 Grind',
  'fifty': '50-50 Grind',
  '50 50': '50-50 Grind',
  'five o': '5-0 Grind',
  'five oh': '5-0 Grind',
  '5 0': '5-0 Grind',
  'crooks': 'Crooked Grind',
  'crooked': 'Crooked Grind',
  'k grind': 'Crooked Grind',
  'board slide': 'Boardslide',
  'nose slide': 'Noseslide',
  'tail slide': 'Tailslide',
  'lip slide': 'Lipslide',
  'smith': 'Smith Grind',
  'feeble': 'Feeble Grind',
  'nose grind': 'Nosegrind',
  'blunt slide': 'Bluntslide',
  'blunt': 'Bluntslide',
  'nose blunt': 'Noseblunt Slide',
  'noseblunt': 'Noseblunt Slide',
  'nose blunt slide': 'Noseblunt Slide',
  'power slide': 'Powerslide',
  'manny': 'Manual',
  'nose manny': 'Nose Manual',
  'no comply': 'No Comply 180',
  'rock and roll': 'Rock n Roll',
  'rock n roll': 'Rock n Roll',
  'rock to fakie': 'Rock to Fakie',
  'axle': 'Axle Stall',
  'fifty stall': 'Axle Stall',
  'drop in': 'Drop In',
  'flip': 'Kickflip',
  'heel': 'Heelflip',
};

const STANCE_WORDS = ['fakie', 'switch', 'nollie'] as const;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/three sixty/g, '360')
    .replace(/one eighty/g, '180')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[a.length][b.length];
}

/**
 * Resolve a spoken trick name against the available pool (already minus used tricks).
 * Exact / alias hits win; otherwise fuzzy-match and surface ties as ambiguous.
 */
export function resolveTrick(spoken: string, available: Trick[]): Resolution {
  const raw = normalize(spoken);
  if (!raw) return { kind: 'none' };

  // Peel a stance prefix off so aliases work for "nollie tre flip" etc.
  let stance: string | null = null;
  let rest = raw;
  for (const w of STANCE_WORDS) {
    if (raw.startsWith(w + ' ') || raw === w) {
      stance = w;
      rest = raw.slice(w.length).trim();
      break;
    }
  }

  const aliased = BASE_ALIASES[rest] ? normalize(BASE_ALIASES[rest]) : rest;
  const target = stance ? `${stance} ${aliased}`.trim() : aliased;

  // Exact name match first.
  const exact = available.filter((t) => normalize(t.name) === target);
  if (exact.length === 1) return { kind: 'match', trick: exact[0] };

  // Bare base name with no stance → the regular-stance variant.
  const baseMatches = available.filter((t) => normalize(t.base) === aliased);
  if (!stance && baseMatches.length > 0) {
    const regular = baseMatches.find((t) => t.stance === 'regular');
    if (regular) return { kind: 'match', trick: regular };
  }
  if (stance) {
    const stanced = baseMatches.find((t) => t.stance === stance);
    if (stanced) return { kind: 'match', trick: stanced };
  }

  // Fuzzy fallback over full names.
  const scored = available
    .map((t) => ({ t, d: editDistance(target, normalize(t.name)) }))
    .filter(({ t, d }) => d <= Math.max(2, Math.floor(normalize(t.name).length * 0.34)))
    .sort((a, b) => a.d - b.d);
  if (scored.length === 0) return { kind: 'none' };
  const best = scored[0].d;
  const top = scored.filter((s) => s.d === best).map((s) => s.t);
  if (top.length === 1 && (scored.length === 1 || scored[1].d > best + 1)) {
    return { kind: 'match', trick: top[0] };
  }
  return { kind: 'ambiguous', candidates: scored.slice(0, 3).map((s) => s.t) };
}
