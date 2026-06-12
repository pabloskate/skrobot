export type Rps = 'rock' | 'paper' | 'scissors';

export const RPS_CHOICES: { id: Rps; icon: string; label: string }[] = [
  { id: 'rock', icon: '🪨', label: 'Rock' },
  { id: 'paper', icon: '📄', label: 'Paper' },
  { id: 'scissors', icon: '✂️', label: 'Scissors' },
];

export const BEATS: Record<Rps, Rps> = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export type RpsOutcome = 'win' | 'lose' | 'tie';

export function robotThrow(): Rps {
  return RPS_CHOICES[Math.floor(Math.random() * 3)].id;
}

export function rpsOutcome(mine: Rps, theirs: Rps): RpsOutcome {
  if (mine === theirs) return 'tie';
  return BEATS[mine] === theirs ? 'win' : 'lose';
}
