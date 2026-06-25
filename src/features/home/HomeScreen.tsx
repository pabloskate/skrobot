'use client';

import { TbMicrophone } from 'react-icons/tb';
import { getGameLog, getRecords } from '@/features/records';
import type { GameLogEntry, Record_ } from '@/features/records';
import { ROBOT_BY_ID, RobotAvatar, RobotSelect } from '@/features/robots';
import type { Robot } from '@/features/robots';

interface Props {
  onPickRobot: (robot: Robot) => void;
  onPlayVoice: (robot: Robot) => void;
}

type HeroState =
  | { kind: 'welcome'; robot: Robot }
  | { kind: 'rematch'; robot: Robot; record: Record_ | undefined }
  | { kind: 'victory'; robot: Robot };

const SHIFTY = ROBOT_BY_ID.get('shifty')!;

function computeHero(log: GameLogEntry[], records: Record<string, Record_>): HeroState {
  if (log.length === 0) return { kind: 'welcome', robot: SHIFTY };

  const last = log[log.length - 1];
  const robot = ROBOT_BY_ID.get(last.robotId) ?? SHIFTY;
  if (!last.won) return { kind: 'rematch', robot, record: records[last.robotId] };
  return { kind: 'victory', robot };
}

export default function HomeScreen({ onPickRobot, onPlayVoice }: Props) {
  const hero = computeHero(getGameLog(), getRecords());

  return (
    <div className="container">
      <HeroCard hero={hero} onPickRobot={onPickRobot} onPlayVoice={onPlayVoice} />
      <div className="hero-divider">
        <span>or pick your opponent</span>
      </div>
      <RobotSelect onPick={onPickRobot} />
    </div>
  );
}

function HeroCard({
  hero,
  onPickRobot,
  onPlayVoice,
}: {
  hero: HeroState;
  onPickRobot: (robot: Robot) => void;
  onPlayVoice: (robot: Robot) => void;
}) {
  const { robot } = hero;

  let headline: string;
  let subtext: string;

  if (hero.kind === 'welcome') {
    headline = 'New here?';
    subtext = "Shifty's the friendly one — start there. Pick a robot, skate for real, report your tricks.";
  } else if (hero.kind === 'rematch') {
    headline = `Run it back vs ${robot.name}?`;
    subtext =
      hero.record && hero.record.l > hero.record.w
        ? `You're ${hero.record.w}W–${hero.record.l}L against them. Time to change that.`
        : `${robot.name} got you last time.`;
  } else {
    headline = `You beat ${robot.name}! 🏆`;
    subtext = 'Run it back, or find a new opponent below.';
  }

  return (
    <div className={`hero-card hero-card--${hero.kind}`}>
      <div className="hero-avatar anim-idle">
        <RobotAvatar robot={robot} size={100} pose={hero.kind === 'victory' ? 'stoked' : 'idle'} />
      </div>
      <div className="hero-copy">
        <p className="hero-eyebrow">{robot.name}</p>
        <h2 className="hero-headline">{headline}</h2>
        <p className="hero-subtext">{subtext}</p>
      </div>
      <div className="hero-actions">
        <button className="btn-hero" onClick={() => onPickRobot(robot)}>
          Play {robot.name}
        </button>
        <button className="btn-voice" onClick={() => onPlayVoice(robot)}>
          <TbMicrophone aria-hidden /> Play by voice
        </button>
      </div>
    </div>
  );
}
