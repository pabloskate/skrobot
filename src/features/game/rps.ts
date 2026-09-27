export type Rps = 'rock' | 'paper' | 'scissors';

export const RPS_CHOICES: { id: Rps; label: string }[] = [
  { id: 'rock', label: 'Rock' },
  { id: 'paper', label: 'Paper' },
  { id: 'scissors', label: 'Scissors' },
];

export const BEATS: Record<Rps, Rps> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

/** How each throw wins, keyed by the winning throw. */
export const RPS_RULE: Record<Rps, string> = {
  rock: 'Rock crushes scissors',
  paper: 'Paper covers rock',
  scissors: 'Scissors cut paper',
};

export type RpsOutcome = 'win' | 'lose' | 'tie';

export function robotThrow(): Rps {
  return RPS_CHOICES[Math.floor(Math.random() * 3)].id;
}

export function rpsOutcome(mine: Rps, theirs: Rps): RpsOutcome {
  if (mine === theirs) return 'tie';
  return BEATS[mine] === theirs ? 'win' : 'lose';
}
