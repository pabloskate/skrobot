export type Stance = 'regular' | 'fakie' | 'switch' | 'nollie';

export interface Robot {
  id: string;
  name: string;
  avatar: { body: string; accent: string; variant: 0 | 1 | 2 | 3 };
}

export interface Trick {
  id: string;
  name: string;
  base: string;
  stance: Stance;
}
