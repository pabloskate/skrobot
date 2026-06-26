import type { GameLogEntry, Record_ } from '@/features/records';
import { isFlatgroundRobot, ROBOT_BY_ID, ROBOTS } from '@/features/robots';
import type { Robot } from '@/features/robots';

export type HeroState =
  | { kind: 'welcome'; robot: Robot }
  | { kind: 'rematch'; robot: Robot; record: Record_ | undefined }
  | { kind: 'next'; robot: Robot; beatenRobot: Robot }
  | { kind: 'complete'; robot: Robot };

const SHIFTY = ROBOT_BY_ID.get('shifty')!;
const FLATGROUND_ROBOTS = ROBOTS.filter(isFlatgroundRobot);

function recordGames(record: Record_ | undefined): number {
  return (record?.w ?? 0) + (record?.l ?? 0);
}

function hasBeat(records: Record<string, Record_>, robot: Robot): boolean {
  return (records[robot.id]?.w ?? 0) > 0;
}

function nextUnbeatenRobot(records: Record<string, Record_>, afterRobot: Robot): Robot | null {
  const afterIndex = FLATGROUND_ROBOTS.findIndex((robot) => robot.id === afterRobot.id);
  const ordered =
    afterIndex >= 0
      ? [...FLATGROUND_ROBOTS.slice(afterIndex + 1), ...FLATGROUND_ROBOTS.slice(0, afterIndex + 1)]
      : FLATGROUND_ROBOTS;
  return ordered.find((robot) => !hasBeat(records, robot)) ?? null;
}

function heroAfterWin(robot: Robot, records: Record<string, Record_>): HeroState {
  const next = nextUnbeatenRobot(records, robot);
  if (next) return { kind: 'next', robot: next, beatenRobot: robot };
  return { kind: 'complete', robot };
}

function heroFromRecords(records: Record<string, Record_>): HeroState | null {
  const beatenRobot = ROBOTS.find((robot) => (records[robot.id]?.w ?? 0) > 0);
  if (beatenRobot) return heroAfterWin(beatenRobot, records);

  const playedRobot = ROBOTS.find((robot) => recordGames(records[robot.id]) > 0);
  if (playedRobot) return { kind: 'rematch', robot: playedRobot, record: records[playedRobot.id] };

  return null;
}

export function computeHero(log: GameLogEntry[], records: Record<string, Record_>): HeroState {
  if (log.length === 0) return heroFromRecords(records) ?? { kind: 'welcome', robot: SHIFTY };

  const last = log[log.length - 1];
  const robot = ROBOT_BY_ID.get(last.robotId) ?? SHIFTY;
  if (!last.won) return { kind: 'rematch', robot, record: records[last.robotId] };
  return heroAfterWin(robot, records);
}
