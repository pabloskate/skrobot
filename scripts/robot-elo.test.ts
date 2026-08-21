import { describe, expect, it } from 'vitest'
import { ROBOT_BY_ID } from '@/features/robots'
import { defaultRoutedTrickPool } from '@/features/tricks'
import { fitElo, seededRandom, simulateRobotGame, simulateTournament } from './robot-elo-core'

describe('robot Elo calibration', () => {
  it('produces reproducible games from a seed', () => {
    const a = ROBOT_BY_ID.get('shifty')!
    const b = ROBOT_BY_ID.get('flipster')!
    const { pool } = defaultRoutedTrickPool()
    const first = simulateRobotGame(a, b, pool, seededRandom(42), { playerFirst: true })
    const second = simulateRobotGame(a, b, pool, seededRandom(42), { playerFirst: true })
    expect(first).toEqual(second)
    expect(first.winnerId).not.toBeNull()
  })

  it('fits a standard Elo difference to a 75/25 matchup', () => {
    const ratings = fitElo(['a', 'b'], [
      { aId: 'a', bId: 'b', games: 100, aWins: 75, bWins: 25, draws: 0 },
    ])
    expect(ratings.get('a')).toBe(1595)
    expect(ratings.get('b')).toBe(1405)
  })

  it('does not let display order change seeded tournament results', () => {
    const a = ROBOT_BY_ID.get('shifty')!
    const b = ROBOT_BY_ID.get('flipster')!
    const { pool } = defaultRoutedTrickPool()
    const forward = simulateTournament([a, b], pool, seededRandom(7), { gamesPerMatchup: 8 })
    const reversed = simulateTournament([b, a], pool, seededRandom(7), { gamesPerMatchup: 8 })
    expect(forward.pairs).toEqual(reversed.pairs)
    expect(forward.ratings.map(({ robot, elo }) => [robot.id, elo]))
      .toEqual(reversed.ratings.map(({ robot, elo }) => [robot.id, elo]))
  })
})
