import { describe, expect, it } from 'vitest';
import { ROBOTS } from '@/features/robots';
import { VoiceGameController } from './controller';
import { buildSystemInstruction } from './prompts';

const initialSnapshot = {
  gameFormat: 'skate' as const,
  gameLetters: 'S-K-A-T-E',
  phase: 'playerSet',
  playerLetters: 'no letters',
  robotLetters: 'no letters',
  trickToCopy: null,
  copyAttemptsLeft: 0,
  usedTricks: [],
  winner: null,
  nextExpected: 'player_sets_next_trick' as const,
};

describe('voice set-report guidance', () => {
  it('tells Gemini that a direct landed-trick report is complete', () => {
    const prompt = buildSystemInstruction(ROBOTS[0], ['Kickflip'], initialSnapshot);

    expect(prompt).toContain('The player does NOT have to announce a trick before trying it.');
    expect(prompt).toContain('"I landed a kickflip" is a complete result');
    expect(prompt).toContain('Never force the two-step flow.');
  });

  it('does not make an announcement a prerequisite in the next-step summary', () => {
    const controller = new VoiceGameController(ROBOTS[0], []);
    controller.state = { ...controller.state, phase: 'playerSet' };

    expect(controller.nextStep()).toContain('Do not require an announcement');
    expect(controller.nextStep()).toContain("'I landed a kickflip'");
  });
});
