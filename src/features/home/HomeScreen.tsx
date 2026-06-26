'use client';

import { TbMicrophone } from 'react-icons/tb';
import { getGameLog, getRecords } from '@/features/records';
import { RobotAvatar, RobotSelect } from '@/features/robots';
import type { Robot } from '@/features/robots';
import { computeHero, type HeroState } from './homeHero';

interface Props {
  onPickRobot: (robot: Robot) => void;
  onPlayVoice: (robot: Robot) => void;
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
  } else if (hero.kind === 'next') {
    headline = `Next up: ${robot.name}`;
    subtext = `You beat ${hero.beatenRobot.name}. Keep climbing the flatground ladder.`;
  } else {
    headline = 'Flatground cleared!';
    subtext = 'You have a win over every flatground robot. Run it back, or pick a new opponent below.';
  }

  return (
    <div className={`hero-card hero-card--${hero.kind === 'complete' ? 'victory' : hero.kind}`}>
      <div className="hero-avatar anim-idle">
        <RobotAvatar robot={robot} size={88} pose={hero.kind === 'complete' ? 'stoked' : 'idle'} />
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
