'use client';

import { getRecords } from '@/features/records';
import type { Robot } from './robots';
import { ROBOTS, TIERS } from './robots';
import RobotAvatar from './RobotAvatar';

interface Props {
  onPick: (robot: Robot) => void;
}

export default function RobotSelect({ onPick }: Props) {
  const records = getRecords();
  return (
    <div className="container">
      {TIERS.map(({ tier, label }) => (
        <section key={tier}>
          <h2 className="section-title">{label}</h2>
          <div className="robot-grid">
            {ROBOTS.filter((r) => r.tier === tier).map((robot) => {
              const rec = records[robot.id];
              return (
                <button key={robot.id} className="robot-card" onClick={() => onPick(robot)}>
                  <RobotAvatar robot={robot} size={72} />
                  <span className="robot-name">{robot.name}</span>
                  <span className="robot-tagline">{robot.tagline}</span>
                  {rec && (
                    <span className="robot-record">
                      {rec.w}W – {rec.l}L
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
