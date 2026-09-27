import { build } from 'esbuild'

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    resolveDir: process.cwd(),
    sourcefile: 'player-rating-calibration.ts',
    loader: 'ts',
    contents: `
      import { ROBOTS, buildBag, isFlatgroundRobot } from '@/features/robots';
      import { playerConsistencyCurve } from '@/features/skater';
      import { defaultRoutedTrickPool } from '@/features/tricks';
      import { seededRandom, simulateRobotGameWithBags } from './scripts/robot-elo-core';
      const robots = ROBOTS.filter(isFlatgroundRobot).sort((a,b) => a.id.localeCompare(b.id));
      const { pool } = defaultRoutedTrickPool();
      const seed = 20260906;
      const random = seededRandom(seed);
      const gamesPerRobot = 400;
      const anchors = [];
      let unfinished = 0;
      for (let skill = 1; skill <= 10; skill += .25) {
        // This is the existing synthetic PLAYER model, not a robot-rate formula.
        // Copy probabilities retain the curve's full range; the player only
        // sets tricks it lands at least 20% of the time, favoring reliable sets.
        const bag = new Map(pool.map(t => [t.id, playerConsistencyCurve(skill-t.difficulty)]));
        const setWeight = trick => {
          const p = bag.get(trick.id);
          return p >= .2 ? p * p : 0;
        };
        const scores = [];
        for (const robot of robots) {
          let wins = 0, losses = 0;
          const robotBag = buildBag(robot, pool);
          for (let i = 0; i < gamesPerRobot; i++) {
            const game = simulateRobotGameWithBags(
              {...robot, id:'synthetic-player'}, robot, bag, robotBag, random,
              {playerFirst: i % 2 === 0, playerSetWeight: setWeight, maxActions: 2000},
            );
            if (game.winnerId === 'synthetic-player') wins++;
            else if (game.winnerId === robot.id) losses++;
            else unfinished++;
          }
          scores.push({elo: robot.elo, wins, losses});
        }
        // Maximum-likelihood Elo against the FIXED measured robot ladder.
        // Half a win/loss per matchup regularizes complete sweeps.
        let low=-700, high=4000;
        for (let iteration=0; iteration<80; iteration++) {
          const mid=(low+high)/2;
          const gradient=scores.reduce((sum,r) => sum + r.wins + .5
            - (r.wins+r.losses+1)/(1+10**((r.elo-mid)/400)),0);
          if (gradient>0) low=mid; else high=mid;
        }
        anchors.push([skill, Math.round((low+high)/2)]);
      }
      // Pool adjacent sampling reversals so a higher player skill cannot lower
      // its displayed rating. This smooths rating estimates, never robot rates.
      const blocks = [];
      for (const [skill, elo] of anchors) {
        blocks.push({skills:[skill], sum:elo});
        while (blocks.length>1) {
          const b=blocks[blocks.length-1], a=blocks[blocks.length-2];
          if (a.sum/a.skills.length <= b.sum/b.skills.length) break;
          blocks.splice(-2,2,{skills:[...a.skills,...b.skills],sum:a.sum+b.sum});
        }
      }
      const monotonicAnchors = blocks.flatMap(b => b.skills.map(skill =>
        [skill,Math.round(b.sum/b.skills.length)]));
      console.log(JSON.stringify({seed,gamesPerRobot,totalGames:37*robots.length*gamesPerRobot,
        unfinished, rawAnchors:anchors, anchors:monotonicAnchors},null,2));
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
