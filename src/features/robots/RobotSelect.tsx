'use client';

import { useEffect, useState } from 'react';
import { getRecords } from '@/features/records';
import type { Robot } from './robots';
import { isFlatgroundRobot, ROBOTS, TIERS } from './robots';
import RobotAvatar from './RobotAvatar';
import type { Record_ } from '@/features/records';

interface Props {
  onPick: (robot: Robot) => void;
}

export default function RobotSelect({ onPick }: Props) {
  const [records, setRecords] = useState<Record<string, Record_>>({});

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setRecords(getRecords());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      {TIERS.map(({ tier, label }) => (
        <section key={tier}>
          <h2 className="section-title">{label}</h2>
          <div className="robot-grid">
            {ROBOTS.filter((r) => r.tier === tier && isFlatgroundRobot(r)).map((robot) => {
              const rec = records[robot.id];
              return (
                <button key={robot.id} className="robot-card" onClick={() => onPick(robot)}>
                  <RobotAvatar robot={robot} size={72} />
                  <span className="robot-name">{robot.name}</span>
                  <span className="robot-tagline">{robot.tagline}</span>
                  {robot.favorites.length > 0 && (
                    <div className="robot-sigs">
                      {robot.favorites.slice(0, 2).map((fav) => (
                        <span key={fav} className="sig-chip">
                          ★ {fav}
                        </span>
                      ))}
                      {robot.favorites.length > 2 && (
                        <span className="sig-chip sig-chip-more">
                          +{robot.favorites.length - 2}
                        </span>
                      )}
                    </div>
                  )}
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
    </>
  );
}
