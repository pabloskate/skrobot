import { describe, expect, it } from 'vitest'
import { ROBOTS, ROBOT_BY_ID, isFlatgroundRobot } from '@/features/robots'
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
    expect(first.playerAttempts).toBeGreaterThan(0)
    expect(first.robotAttempts).toBeGreaterThan(0)
    expect(first.playerAttempts + first.robotAttempts).toBeLessThan(first.actions)
  })

  it('fits a standard Elo difference to a 75/25 matchup', () => {
    const ratings = fitElo(['a', 'b'], [
      { aId: 'a', bId: 'b', games: 100, aWins: 75, bWins: 25, draws: 0 },
    ])
    expect(ratings.get('a')).toBe(1595)
    expect(ratings.get('b')).toBe(1405)
  })

  it('applies both weight overrides when auditing an earlier setting policy', () => {
    const player = ROBOT_BY_ID.get('shifty')!
    const robot = ROBOT_BY_ID.get('flipster')!
    const { pool } = defaultRoutedTrickPool()
    const game = simulateRobotGame(player, robot, pool, seededRandom(42), {
      playerFirst: true, maxActions: 30,
      playerSetWeight: () => 0, robotSetWeight: () => 0,
    })
    expect(game.winnerId).toBeNull()
    expect(game.playerAttempts).toBe(0)
    expect(game.robotAttempts).toBe(0)
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

  it('finishes matched Hard and Pro games within a practical attempt budget', () => {
    const { pool } = defaultRoutedTrickPool()
    for (const robot of ROBOTS.filter(r => isFlatgroundRobot(r) && ['advanced', 'pro'].includes(r.tier))) {
      const random = seededRandom(20260906)
      const attempts: number[] = []
      for (let i = 0; i < 250; i++) {
        const game = simulateRobotGame(
          { ...robot, id: 'balance-opponent', behaviorId: robot.id }, robot, pool, random,
          { playerFirst: i % 2 === 0 },
        )
        expect(game.winnerId, robot.name).not.toBeNull()
        attempts.push(game.playerAttempts)
      }
      attempts.sort((a, b) => a - b)
      // Counts actual player attempts, including failed sets and final retries.
      // The 1850–2000 Pro reliability pass allows a longer matched session;
      // retain the Hard budget and the existing tail limit for both tiers.
      expect(attempts[124], `${robot.name} median`).toBeLessThan(robot.tier === 'pro' ? 55 : 45)
      expect(attempts[237], `${robot.name} p95`).toBeLessThan(85)
    }
  })
})
