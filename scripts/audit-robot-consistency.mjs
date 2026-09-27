import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

// Optional pre-edit behavior.ts path. Only parse literal table data; never execute it.
const baselinePath = process.argv[2]
let baseline = null
if (baselinePath) {
  const source = await readFile(baselinePath, 'utf8')
  const match = source.match(/export const ROBOT_CONSISTENCY: RobotBehaviorTable = (\{[\s\S]*?\n\});/)
  if (!match) throw new Error('Baseline is missing the explicit classic consistency table')
  baseline = JSON.parse(match[1].replace(/,\s*}/g, '}'))
}

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: 'robot-consistency-audit.ts',
    loader: 'ts',
    contents: `
      import { ROBOTS, buildBag, isFlatgroundRobot } from '@/features/robots';
      import { defaultRoutedTrickPool } from '@/features/tricks';
      import { seededRandom, simulateRobotGameWithBags } from './scripts/robot-elo-core';
      const baseline = ${JSON.stringify(baseline)};
      const { pool } = defaultRoutedTrickPool();
      const games = 2000;
      const seed = 20260906;
      const results = [];
      for (const robot of ROBOTS.filter(isFlatgroundRobot)) {
        const current = buildBag(robot, pool);
        // Identical sets/bag support on both sides; the perfect probe isolates
        // how many real attempts a player needs to break this bot's defense.
        // This is a pacing stress test, not a predicted human win rate.
        const perfect = new Map([...current].map(([id]) => [id, 1]));
        const versions = baseline
          ? [['before', new Map(pool.filter(t => baseline[robot.id]?.[t.id] !== undefined)
              .map(t => [t.id, baseline[robot.id][t.id]]))], ['after', current]]
          : [['after', current]];
        for (const [version, bag] of versions) {
          for (const scenario of ['perfect-copy-and-set', 'equal-opponent']) {
            const random = seededRandom(seed);
            const attempts = [];
            let unfinished = 0;
            for (let i = 0; i < games; i++) {
              const game = simulateRobotGameWithBags(
                { ...robot, id: 'audit-player', behaviorId: robot.id }, robot,
                scenario === 'equal-opponent' ? bag : perfect, bag, random,
                { playerFirst: i % 2 === 0 },
              );
              if (game.winnerId === null) unfinished++;
              else attempts.push(game.playerAttempts);
            }
            attempts.sort((a,b) => a-b);
            const percentile = p => attempts.length
              ? attempts[Math.ceil(p * attempts.length) - 1] : null;
            results.push({ id: robot.id, name: robot.name, tier: robot.tier,
              version, scenario, games, unfinished,
              medianPlayerAttempts: percentile(.5), p95PlayerAttempts: percentile(.95) });
          }
        }
      }
      console.log(JSON.stringify({seed, gamesPerScenario: games, results}, null, 2));
    `,
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
  tsconfig: 'tsconfig.json',
})
await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
