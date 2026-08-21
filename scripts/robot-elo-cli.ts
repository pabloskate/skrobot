import { ROBOTS, isFlatgroundRobot } from '@/features/robots'
import { defaultRoutedTrickPool } from '@/features/tricks'
import { seededRandom, simulateTournament } from './robot-elo-core'

interface CliOptions {
  games: number
  seed: number
  format: 'skate' | 'sk8'
  allRobots: boolean
  json: boolean
}

function usage(): string {
  return `Robot Elo calibration

Usage: npm run simulate:robot-elo -- [options]

  --games <n>       Games per robot matchup (default: 2000)
  --seed <n>        Reproducible 32-bit seed (default: 20260820)
  --format <name>   skate or sk8 (default: skate)
  --all             Include robots outside the routed flatground roster
  --json            Print machine-readable JSON
  --help            Show this help`
}

function valueAfter(args: string[], index: number, option: string): string {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${option} needs a value`)
  return value
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    games: 2000,
    seed: 20260820,
    format: 'skate',
    allRobots: false,
    json: false,
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--help') {
      console.log(usage())
      process.exit(0)
    } else if (arg === '--games') {
      options.games = Number(valueAfter(args, i, arg))
      i += 1
    } else if (arg.startsWith('--games=')) {
      options.games = Number(arg.slice('--games='.length))
    } else if (arg === '--seed') {
      options.seed = Number(valueAfter(args, i, arg))
      i += 1
    } else if (arg.startsWith('--seed=')) {
      options.seed = Number(arg.slice('--seed='.length))
    } else if (arg === '--format') {
      options.format = valueAfter(args, i, arg) as CliOptions['format']
      i += 1
    } else if (arg.startsWith('--format=')) {
      options.format = arg.slice('--format='.length) as CliOptions['format']
    } else if (arg === '--all') {
      options.allRobots = true
    } else if (arg === '--json') {
      options.json = true
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (!Number.isSafeInteger(options.games) || options.games < 1) throw new Error('--games must be a positive integer')
  if (!Number.isSafeInteger(options.seed)) throw new Error('--seed must be an integer')
  if (options.format !== 'skate' && options.format !== 'sk8') throw new Error('--format must be skate or sk8')
  return options
}

function main(): void {
  let options: CliOptions
  try {
    options = parseOptions(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error('\n' + usage())
    process.exitCode = 1
    return
  }

  const robots = options.allRobots ? ROBOTS : ROBOTS.filter(isFlatgroundRobot)
  const { pool, poolLabel } = defaultRoutedTrickPool()
  const result = simulateTournament(robots, pool, seededRandom(options.seed), {
    gamesPerMatchup: options.games,
    format: options.format,
  })

  if (options.json) {
    console.log(JSON.stringify({
      seed: options.seed,
      format: options.format,
      pool: poolLabel,
      gamesPerMatchup: options.games,
      totalGames: result.totalGames,
      totalDraws: result.totalDraws,
      ratings: result.ratings.map((rating) => ({
        id: rating.robot.id,
        name: rating.robot.name,
        tier: rating.robot.tier,
        modelSkill: rating.robot.skill,
        elo: rating.elo,
        wins: rating.wins,
        losses: rating.losses,
        draws: rating.draws,
        winRate: rating.winRate,
        bagSize: rating.bagSize,
      })),
      pairs: result.pairs,
    }, null, 2))
    return
  }

  console.log('Robot Elo calibration')
  console.log(`Roster: ${options.allRobots ? 'all robots' : 'routed flatground robots'} (${robots.length})`)
  console.log(`Game: ${options.format.toUpperCase()} · ${poolLabel} pool (${pool.length} tricks)`)
  console.log(`Seed: ${options.seed} · ${options.games.toLocaleString()} games/matchup · ${result.totalGames.toLocaleString()} total`)
  console.log(`Draws from the safety action cap: ${result.totalDraws.toLocaleString()}`)
  console.table(result.ratings.map((rating, index) => ({
    rank: index + 1,
    robot: rating.robot.name,
    id: rating.robot.id,
    tier: rating.robot.tier,
    modelSkill: rating.robot.skill.toFixed(1),
    elo: rating.elo,
    winPct: `${(rating.winRate * 100).toFixed(1)}%`,
    bag: rating.bagSize,
  })))
}

main()
