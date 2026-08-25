import {
  chooseRobotTrick,
  createInitialGameState,
  gameReducer,
  rollAttempt,
  type GameFormat,
  type GameState,
} from '@/features/game'
import { buildBag, type Robot } from '@/features/robots'
import { TRICK_BY_ID, type Trick } from '@/features/tricks'

export interface SimulatedGame {
  winnerId: string | null
  loserId: string | null
  playerLetters: number
  robotLetters: number
  actions: number
}

export interface PairResult {
  aId: string
  bId: string
  games: number
  aWins: number
  bWins: number
  draws: number
}

interface RobotRating {
  robot: Robot
  elo: number
  wins: number
  losses: number
  draws: number
  games: number
  winRate: number
  bagSize: number
}

export interface TournamentResult {
  ratings: RobotRating[]
  pairs: PairResult[]
  totalGames: number
  totalDraws: number
}

export interface SimulateGameOptions {
  format?: GameFormat
  playerFirst?: boolean
  maxActions?: number
}

export interface TournamentOptions {
  gamesPerMatchup: number
  format?: GameFormat
  maxActionsPerGame?: number
}

/** Small deterministic PRNG. A seed makes calibration runs exactly reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function continueResolvedAnimation(state: GameState): GameState {
  return gameReducer(state, { type: 'CONTINUE' })
}

/**
 * Play one classic robot-vs-robot game through the production reducer.
 * `player` and `robot` only name the reducer sides; tournament games rotate both
 * bots through both sides so that side-specific flow cannot affect the ratings.
 */
export function simulateRobotGame(
  player: Robot,
  robot: Robot,
  pool: Trick[],
  random: () => number,
  options: SimulateGameOptions = {},
): SimulatedGame {
  return simulateRobotGameWithBags(
    player,
    robot,
    buildBag(player, pool),
    buildBag(robot, pool),
    random,
    options,
  )
}

function simulateRobotGameWithBags(
  player: Robot,
  robot: Robot,
  playerBag: Map<string, number>,
  robotBag: Map<string, number>,
  random: () => number,
  options: SimulateGameOptions,
): SimulatedGame {
  const format = options.format ?? 'skate'
  const maxActions = options.maxActions ?? 10_000
  let state = gameReducer(createInitialGameState(format, 'classic'), {
    type: 'START',
    playerFirst: options.playerFirst ?? random() < 0.5,
  })
  let actions = 1

  while (state.phase !== 'over' && actions < maxActions) {
    switch (state.phase) {
      case 'playerSet': {
        const trick = chooseRobotTrick(playerBag, state.used, TRICK_BY_ID, player, random)
        if (!trick) {
          state = gameReducer(state, { type: 'PLAYER_SET_MISSED' })
          break
        }
        const attempt = rollAttempt(playerBag, trick.id, random)
        state = gameReducer(
          state,
          attempt.landed ? { type: 'PLAYER_SET_LANDED', trick } : { type: 'PLAYER_SET_MISSED' },
        )
        break
      }

      case 'robotCopy':
        if (state.stage === 'attempting' || state.stage === 'retry') {
          const attempt = rollAttempt(robotBag, state.current!.id, random)
          state = gameReducer(state, { type: 'ROBOT_COPY_RESULT', ...attempt })
        } else {
          state = continueResolvedAnimation(state)
        }
        break

      case 'robotSet':
        if (state.stage === 'thinking') {
          state = gameReducer(state, {
            type: 'ROBOT_SET_CHOICE',
            trick: chooseRobotTrick(robotBag, state.used, TRICK_BY_ID, robot, random),
          })
        } else if (state.stage === 'attempting') {
          const attempt = rollAttempt(robotBag, state.current!.id, random)
          state = gameReducer(state, { type: 'ROBOT_SET_RESULT', landed: attempt.landed })
        } else {
          state = continueResolvedAnimation(state)
        }
        break

      case 'playerCopy': {
        const attempt = rollAttempt(playerBag, state.current!.id, random)
        state = gameReducer(state, {
          type: attempt.landed ? 'PLAYER_COPY_LANDED' : 'PLAYER_COPY_MISSED',
        })
        break
      }

      case 'rps':
        throw new Error('Simulation failed to resolve the opening toss')
    }
    actions += 1
  }

  const winnerId = state.winner === 'player' ? player.id : state.winner === 'robot' ? robot.id : null
  const loserId = state.winner === 'player' ? robot.id : state.winner === 'robot' ? player.id : null
  return {
    winnerId,
    loserId,
    playerLetters: state.letters.player,
    robotLetters: state.letters.robot,
    actions,
  }
}

/**
 * Fit Bradley-Terry strengths to all results, then express them on the standard
 * Elo logistic scale. The geometric mean is anchored at 1500.
 */
export function fitElo(robotIds: string[], pairs: PairResult[]): Map<string, number> {
  const index = new Map(robotIds.map((id, i) => [id, i]))
  let strength = robotIds.map(() => 1)
  const scores = robotIds.map(() => 0)

  for (const pair of pairs) {
    const a = index.get(pair.aId)
    const b = index.get(pair.bId)
    if (a === undefined || b === undefined) continue
    scores[a] += pair.aWins + pair.draws / 2
    scores[b] += pair.bWins + pair.draws / 2
  }

  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const denominators = robotIds.map(() => 0)
    for (const pair of pairs) {
      const a = index.get(pair.aId)
      const b = index.get(pair.bId)
      if (a === undefined || b === undefined) continue
      const games = pair.aWins + pair.bWins + pair.draws
      const shared = games / (strength[a] + strength[b])
      denominators[a] += shared
      denominators[b] += shared
    }

    const next = strength.map((old, i) => {
      if (denominators[i] === 0) return old
      return Math.max(scores[i] / denominators[i], 1e-12)
    })
    const logMean = next.reduce((sum, value) => sum + Math.log(value), 0) / next.length
    const scale = Math.exp(logMean)
    for (let i = 0; i < next.length; i += 1) next[i] /= scale
    const change = Math.max(...next.map((value, i) => Math.abs(Math.log(value / strength[i]))))
    strength = next
    if (change < 1e-10) break
  }

  return new Map(robotIds.map((id, i) => [id, Math.round(1500 + 400 * Math.log10(strength[i]))]))
}

/** Run a balanced all-play-all tournament and calculate fitted Elo ratings. */
export function simulateTournament(
  robots: Robot[],
  pool: Trick[],
  random: () => number,
  options: TournamentOptions,
): TournamentResult {
  // Calibration must not change merely because its output reordered the UI roster.
  const field = [...robots].sort((a, b) => a.id.localeCompare(b.id))
  const pairs: PairResult[] = []
  const totals = new Map(field.map((robot) => [robot.id, { wins: 0, losses: 0, draws: 0 }]))
  const bags = new Map(field.map((robot) => [robot.id, buildBag(robot, pool)]))

  for (let aIndex = 0; aIndex < field.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < field.length; bIndex += 1) {
      const a = field[aIndex]
      const b = field[bIndex]
      const pair: PairResult = { aId: a.id, bId: b.id, games: 0, aWins: 0, bWins: 0, draws: 0 }

      for (let gameIndex = 0; gameIndex < options.gamesPerMatchup; gameIndex += 1) {
        // Four-game blocks balance reducer side and first-set advantage exactly.
        const swapped = gameIndex % 4 >= 2
        const player = swapped ? b : a
        const robot = swapped ? a : b
        const game = simulateRobotGameWithBags(
          player,
          robot,
          bags.get(player.id)!,
          bags.get(robot.id)!,
          random,
          {
            format: options.format,
            playerFirst: gameIndex % 2 === 0,
            maxActions: options.maxActionsPerGame,
          },
        )
        pair.games += 1
        if (game.winnerId === a.id) {
          pair.aWins += 1
          totals.get(a.id)!.wins += 1
          totals.get(b.id)!.losses += 1
        } else if (game.winnerId === b.id) {
          pair.bWins += 1
          totals.get(b.id)!.wins += 1
          totals.get(a.id)!.losses += 1
        } else {
          pair.draws += 1
          totals.get(a.id)!.draws += 1
          totals.get(b.id)!.draws += 1
        }
      }
      pairs.push(pair)
    }
  }

  const elo = fitElo(field.map((robot) => robot.id), pairs)
  const ratings = field
    .map((robot): RobotRating => {
      const total = totals.get(robot.id)!
      const games = total.wins + total.losses + total.draws
      return {
        robot,
        elo: elo.get(robot.id)!,
        ...total,
        games,
        winRate: games === 0 ? 0 : (total.wins + total.draws / 2) / games,
        bagSize: bags.get(robot.id)!.size,
      }
    })
    .sort((a, b) => b.elo - a.elo || a.robot.name.localeCompare(b.robot.name))

  return {
    ratings,
    pairs,
    totalGames: pairs.reduce((sum, pair) => sum + pair.games, 0),
    totalDraws: pairs.reduce((sum, pair) => sum + pair.draws, 0),
  }
}
