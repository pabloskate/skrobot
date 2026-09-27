import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'

// Optional previous behavior.ts: parse literal weights without executing source.
const baselineSource = process.argv[2] ? await readFile(process.argv[2], 'utf8') : null
const baseline = {}
if (baselineSource) {
  for (const name of ['ROBOT_SET_WEIGHTS', 'ROBOT_DEFENSE_SET_WEIGHTS']) {
    const match = baselineSource.match(new RegExp(`export const ${name}: RobotBehaviorTable = (\\{[\\s\\S]*?\\n\\});`))
    if (!match) throw new Error(`Baseline is missing ${name}`)
    baseline[name] = JSON.parse(match[1].replace(/,\s*}/g, '}'))
  }
}

const bundle = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    resolveDir: process.cwd(), sourcefile: 'robot-setting-audit.ts', loader: 'ts',
    contents: `
      import { ROBOTS, DEFENSE_ROBOTS, buildBag, isFlatgroundRobot, trickSetWeight, trickDefenseSetWeight } from '@/features/robots';
      import { TRICKS, TRICK_BY_ID, defaultRoutedTrickPool } from '@/features/tricks';
      import { chooseRobotTrick } from '@/features/game';
      import { seededRandom, simulateRobotGameWithBags } from './scripts/robot-elo-core';
      const baseline = ${JSON.stringify(baseline)};
      const seed = 20260907;
      const sequences = 1000;
      const gamesPerScenario = 500;
      const basics = new Set(['regular-ollie', 'regular-pop-shuvit', 'regular-frontside-shuvit', 'regular-frontside-180', 'regular-backside-180']);
      const { pool: flatground } = defaultRoutedTrickPool();
      const results = [];
      const pacing = [];
      for (const [variant, robots, lookup, tableName] of [
        ['classic', ROBOTS, trickSetWeight, 'ROBOT_SET_WEIGHTS'],
        ['defense', DEFENSE_ROBOTS, trickDefenseSetWeight, 'ROBOT_DEFENSE_SET_WEIGHTS'],
      ]) {
        for (const robot of robots) {
          const pool = isFlatgroundRobot(robot) ? flatground : TRICKS;
          const bag = buildBag(robot, pool);
          const versions = baseline[tableName]
            ? [['before', t => baseline[tableName][robot.id]?.[t.id] ?? 0], ['after', t => lookup(t, robot)]]
            : [['after', t => lookup(t, robot)]];
          for (const [version, weight] of versions) {
            const entries = pool.filter(t => bag.has(t.id) && weight(t)>0)
              .map(t => ({id:t.id, name:t.name, rate:bag.get(t.id), weight:weight(t)}));
            const total = entries.reduce((sum,t) => sum+t.weight,0);
            const share = predicate => entries.filter(predicate).reduce((sum,t) => sum+t.weight,0)/total;
            const random = seededRandom(seed);
            const rounds = Array.from({length:10},()=>({choices:0,weak:0,basics:0,expectedLands:0}));
            // Repeated bot opportunities: only successful sets leave the bag,
            // just as in Classic. Defense always lands. Opponent sets are omitted
            // here to isolate depletion; full reducer games are measured below.
            for (let sample=0;sample<sequences;sample++) {
              const used = [];
              for (const round of rounds) {
                const trick = chooseRobotTrick(bag,used,TRICK_BY_ID,robot,random,weight);
                if (!trick) break;
                const p = bag.get(trick.id);
                round.choices++; round.weak+=Number(p<.3); round.basics+=Number(basics.has(trick.id)); round.expectedLands+=p;
                if (variant==='defense' || random()<p) used.push(trick.id);
              }
            }
            results.push({id:robot.id,name:robot.name,tier:robot.tier,variant,version,
              selectable:entries.length, totalWeight:total,
              weakShare:share(t=>t.rate<.3), basicShare:share(t=>basics.has(t.id)),
              expectedSetLandRate:entries.reduce((sum,t)=>sum+t.rate*t.weight,0)/total,
              top:entries.sort((a,b)=>b.weight-a.weight).slice(0,8).map(t=>({...t,share:t.weight/total})),
              rounds:rounds.map((r,i)=>({opportunity:i+1,choices:r.choices,weakShare:r.weak/r.choices,basicShare:r.basics/r.choices,expectedSetLandRate:r.expectedLands/r.choices})),
            });
            if (variant!=='classic' || !isFlatgroundRobot(robot)) continue;
            for (const scenario of ['equal-opponent','perfect-opponent']) {
              const opponentBag = scenario==='equal-opponent' ? bag : new Map([...bag].map(([id])=>[id,1]));
              const gameRandom = seededRandom(seed);
              const attempts = [];
              let unfinished=0;
              for (let i=0;i<gamesPerScenario;i++) {
                const game = simulateRobotGameWithBags({...robot,id:'audit-player',behaviorId:robot.id},robot,opponentBag,bag,gameRandom,
                  {playerFirst:i%2===0, playerSetWeight:weight, robotSetWeight:weight, maxActions:2000});
                if (game.winnerId===null) unfinished++;
                else attempts.push(game.playerAttempts);
              }
              attempts.sort((a,b)=>a-b);
              const percentile = p=>attempts[Math.ceil(attempts.length*p)-1]??null;
              pacing.push({id:robot.id,name:robot.name,tier:robot.tier,version,scenario,unfinished,
                medianPlayerAttempts:percentile(.5),p95PlayerAttempts:percentile(.95)});
            }
          }
        }
      }
      console.log(JSON.stringify({seed,sequences,gamesPerScenario,results,pacing},null,2));
    `,
  },
  bundle: true, format: 'esm', platform: 'node', target: 'node22', write: false,
  logLevel: 'silent', tsconfig: 'tsconfig.json',
})
await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)
