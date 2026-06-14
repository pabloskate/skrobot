import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Trick } from '@/features/tricks'
import {
  LETTERS,
  type GameState,
  chooseRobotTrick,
  gameReducer,
  initialGameState,
  rollAttempt,
} from './engine'

// Minimal fake trick — the engine only reads `id` and `name`.
const trick = (id: string): Trick => ({
  id,
  name: id,
  base: id,
  stance: 'regular',
  category: 'flatground',
  difficulty: 1,
})

// Drive the reducer through a list of actions from a starting state.
const run = (start: GameState, ...actions: Parameters<typeof gameReducer>[1][]): GameState =>
  actions.reduce(gameReducer, start)

describe('gameReducer — the toss', () => {
  it('sends the player to set first when they win the toss', () => {
    const s = gameReducer(initialGameState, { type: 'START', playerFirst: true })
    expect(s.phase).toBe('playerSet')
  })

  it('hands the first set to the robot when they win the toss', () => {
    const s = gameReducer(initialGameState, { type: 'START', playerFirst: false })
    expect(s.phase).toBe('robotSet')
    expect(s.stage).toBe('thinking')
  })
})

describe('gameReducer — player sets, robot copies', () => {
  const afterSet = run(
    { ...initialGameState, phase: 'playerSet' },
    { type: 'PLAYER_SET_LANDED', trick: trick('kickflip') },
  )

  it('marks the trick used and moves to the robot copy', () => {
    expect(afterSet.phase).toBe('robotCopy')
    expect(afterSet.used).toEqual(['kickflip'])
    expect(afterSet.current?.id).toBe('kickflip')
  })

  it('gives the robot one copy attempt when it is not on its last letter', () => {
    expect(afterSet.attemptsLeft).toBe(1)
  })

  it('gives the robot two copy attempts when defending its last letter', () => {
    const s = run(
      { ...initialGameState, phase: 'playerSet', letters: { player: 0, robot: LETTERS.length - 1 } },
      { type: 'PLAYER_SET_LANDED', trick: trick('kickflip') },
    )
    expect(s.attemptsLeft).toBe(2)
  })

  it('robot takes a letter when it misses its only copy attempt', () => {
    const s = gameReducer(afterSet, { type: 'ROBOT_COPY_RESULT', landed: false, knewIt: true })
    expect(s.stage).toBe('missed')
    expect(s.letters.robot).toBe(1)
  })

  it('robot landing the copy takes no letter; the player keeps setting', () => {
    const landed = gameReducer(afterSet, { type: 'ROBOT_COPY_RESULT', landed: true, knewIt: true })
    expect(landed.stage).toBe('landed')
    const next = gameReducer(landed, { type: 'CONTINUE' })
    expect(next.phase).toBe('playerSet')
    expect(next.letters.robot).toBe(0)
  })
})

describe('gameReducer — robot last-letter defense on a copy', () => {
  it('grants a retry, then assigns the 5th letter (player wins) on a second miss', () => {
    const start = run(
      { ...initialGameState, phase: 'playerSet', letters: { player: 0, robot: LETTERS.length - 1 } },
      { type: 'PLAYER_SET_LANDED', trick: trick('kickflip') },
    )
    expect(start.attemptsLeft).toBe(2)

    const firstMiss = gameReducer(start, { type: 'ROBOT_COPY_RESULT', landed: false, knewIt: true })
    expect(firstMiss.stage).toBe('retry')
    expect(firstMiss.attemptsLeft).toBe(1)
    expect(firstMiss.letters.robot).toBe(LETTERS.length - 1) // no letter yet

    const secondMiss = gameReducer(firstMiss, { type: 'ROBOT_COPY_RESULT', landed: false, knewIt: true })
    expect(secondMiss.stage).toBe('missed')
    expect(secondMiss.letters.robot).toBe(LETTERS.length)
    expect(secondMiss.winner).toBe('player')
  })
})

describe('gameReducer — player copies the robot', () => {
  // playerCopy with the player on their last letter → two attempts to defend.
  const lastLetterCopy: GameState = {
    ...initialGameState,
    phase: 'playerCopy',
    current: trick('kickflip'),
    attemptsLeft: 2,
    letters: { player: LETTERS.length - 1, robot: 0 },
  }

  it('landing the copy steals no letter and the robot sets again', () => {
    const s = gameReducer(
      { ...lastLetterCopy, attemptsLeft: 1, letters: { player: 0, robot: 0 } },
      { type: 'PLAYER_COPY_LANDED' },
    )
    expect(s.phase).toBe('robotSet')
    expect(s.letters.player).toBe(0)
  })

  it('last-letter defense: first miss is a reprieve, second miss ends the game', () => {
    const reprieve = gameReducer(lastLetterCopy, { type: 'PLAYER_COPY_MISSED' })
    expect(reprieve.phase).toBe('playerCopy') // still copying — one more try
    expect(reprieve.attemptsLeft).toBe(1)
    expect(reprieve.letters.player).toBe(LETTERS.length - 1) // no letter yet

    const out = gameReducer(reprieve, { type: 'PLAYER_COPY_MISSED' })
    expect(out.phase).toBe('over')
    expect(out.letters.player).toBe(LETTERS.length)
    expect(out.winner).toBe('robot')
  })

  it('a normal miss (not last letter) just adds a letter and passes the set back', () => {
    const s = gameReducer(
      { ...lastLetterCopy, attemptsLeft: 1, letters: { player: 1, robot: 0 } },
      { type: 'PLAYER_COPY_MISSED' },
    )
    expect(s.phase).toBe('robotSet')
    expect(s.letters.player).toBe(2)
    expect(s.winner).toBeNull()
  })
})

describe('gameReducer — robot setting', () => {
  it('records a landed set as used', () => {
    const s = run(
      { ...initialGameState, phase: 'robotSet', current: trick('treflip') },
      { type: 'ROBOT_SET_RESULT', landed: true },
    )
    expect(s.stage).toBe('landed')
    expect(s.used).toContain('treflip')
  })

  it('out of tricks hands the set back to the player', () => {
    const cant = gameReducer({ ...initialGameState, phase: 'robotSet' }, { type: 'ROBOT_SET_CHOICE', trick: null })
    expect(cant.stage).toBe('cant')
    // CONTINUE out of a 'cant' robotSet returns the set to the player and clears the stage.
    const s = gameReducer(cant, { type: 'CONTINUE' })
    expect(s.phase).toBe('playerSet')
    expect(s.stage).toBeNull()
  })
})

describe('gameReducer — misc', () => {
  it('REMATCH resets to the initial state', () => {
    const dirty: GameState = { ...initialGameState, phase: 'over', letters: { player: 5, robot: 2 }, winner: 'robot' }
    expect(gameReducer(dirty, { type: 'REMATCH' })).toEqual(initialGameState)
  })

  it('CONTINUE short-circuits to game over once a winner exists', () => {
    const s = gameReducer({ ...initialGameState, phase: 'robotCopy', winner: 'player' }, { type: 'CONTINUE' })
    expect(s.phase).toBe('over')
  })
})

describe('chooseRobotTrick', () => {
  const bag = new Map([
    ['a', 0.9],
    ['b', 0.1],
  ])
  const byId = new Map([trick('a'), trick('b')].map((t) => [t.id, t]))

  afterEach(() => vi.restoreAllMocks())

  it('weights by consistency — a low roll picks the heavy option', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(chooseRobotTrick(bag, [], byId)?.id).toBe('a')
  })

  it('a high roll lands in the light option', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    expect(chooseRobotTrick(bag, [], byId)?.id).toBe('b')
  })

  it('never picks a used trick', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(chooseRobotTrick(bag, ['a'], byId)?.id).toBe('b')
  })

  it('returns null when nothing is left', () => {
    expect(chooseRobotTrick(bag, ['a', 'b'], byId)).toBeNull()
  })
})

describe('rollAttempt', () => {
  const bag = new Map([['a', 0.5]])

  afterEach(() => vi.restoreAllMocks())

  it('lands when the roll is under the consistency', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4)
    expect(rollAttempt(bag, 'a')).toEqual({ landed: true, knewIt: true })
  })

  it('falls when the roll is over the consistency', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6)
    expect(rollAttempt(bag, 'a')).toEqual({ landed: false, knewIt: true })
  })

  it('auto-misses a trick the robot does not know (outside the bag)', () => {
    expect(rollAttempt(bag, 'unknown')).toEqual({ landed: false, knewIt: false })
  })
})
