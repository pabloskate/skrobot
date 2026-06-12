import type { FunctionDeclaration } from '@google/genai';
import { Type } from '@google/genai';
import { getRecords } from '@/features/records';
import type { VoiceGameController } from './controller';

export const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'throw_rps',
    description:
      'Play the opening rock-paper-scissors toss. Call when the player says their throw. On a tie, ask them to throw again.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        choice: { type: Type.STRING, enum: ['rock', 'paper', 'scissors'] },
      },
      required: ['choice'],
    },
  },
  {
    name: 'report_set_attempt',
    description:
      "Report the OUTCOME of the player's set attempt. Call ONLY after they say what happened ('I landed it', 'I missed') — NEVER when they merely announce what they are about to try. landed=true with the trick name they landed, or landed=false if they gave up / passed. Narrate the response's `summary` field.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        landed: { type: Type.BOOLEAN },
        trick: { type: Type.STRING, description: 'Trick name as spoken, e.g. "nollie tre flip". Required when landed=true.' },
      },
      required: ['landed'],
    },
  },
  {
    name: 'report_copy_attempt',
    description:
      "Report the OUTCOME of the player's attempt to copy the robot's trick. Call ONLY after they say what happened — never for an announcement of intent. Narrate the response's `summary` field.",
    parameters: {
      type: Type.OBJECT,
      properties: { landed: { type: Type.BOOLEAN } },
      required: ['landed'],
    },
  },
  {
    name: 'get_game_state',
    description: 'Get the authoritative current game state (letters, phase, trick to copy, used tricks).',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'list_remaining_tricks',
    description: 'List tricks from the pool that have not been set yet this game.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'undo_last_report',
    description:
      "Undo the player's last report if it was misheard or mistaken (e.g. they said landed but you recorded missed). Restores the previous state.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'get_records',
    description: "Get the player's lifetime win/loss records against the robots.",
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'rematch',
    description: 'Start a fresh game against the same robot after the current one ends.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

/** Execute a tool call against the controller; always returns a JSON-able object. */
export function executeTool(
  controller: VoiceGameController,
  name: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  switch (name) {
    case 'throw_rps':
      return controller.throwRps(args.choice as 'rock' | 'paper' | 'scissors');
    case 'report_set_attempt':
      return controller.reportSetAttempt(Boolean(args.landed), args.trick as string | undefined);
    case 'report_copy_attempt':
      return controller.reportCopyAttempt(Boolean(args.landed));
    case 'get_game_state':
      return { summary: controller.nextStep(), ...controller.snapshot() };
    case 'list_remaining_tricks':
      return { remaining: controller.remainingTricks() };
    case 'undo_last_report':
      return { ...controller.undo(), ...controller.snapshot() };
    case 'get_records':
      return { records: getRecords() };
    case 'rematch':
      return { ...controller.rematch() };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
