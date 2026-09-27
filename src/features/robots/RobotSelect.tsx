'use client';

import { useEffect, useRef, useState } from 'react';
import { useRecordsSnapshot } from '@/features/records';
import type { Robot, Tier } from './robots';
import { rosterForVariant, TIERS } from './robots';
import RobotAvatar from './RobotAvatar';
import RobotRating from './RobotRating';

const TIER_TAB_KEY = 'skrobot.robotTier';

interface Props {
  onPick: (robot: Robot) => void;
  /** Game variant: both rosters are available to everyone. */
  variant?: 'classic' | 'defense';
}

export default function RobotSelect({ onPick, variant = 'classic' }: Props) {
  const defense = variant === 'defense';
  const { records } = useRecordsSnapshot();
  const [tier, setTier] = useState<Tier>(TIERS[0].tier);
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = window.localStorage.getItem(TIER_TAB_KEY);
      if (TIERS.some((t) => t.tier === saved)) setTier(saved as Tier);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const activeIndex = TIERS.findIndex((t) => t.tier === tier);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const active = track.querySelector<HTMLButtonElement>('.tier-tab-active');
      if (active) setThumb({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [activeIndex]);

  const selectTier = (next: Tier) => {
    setTier(next);
    try {
      window.localStorage.setItem(TIER_TAB_KEY, next);
    } catch {
      /* storage unavailable (private mode) — selection just won't persist */
    }
  };

  const tierRobots = rosterForVariant(variant).filter((robot) => robot.tier === tier);

  return (
    <>
      <div className="tier-tabs-track" ref={trackRef} role="tablist" aria-label="Robot difficulty">
        <span
          className="tier-tabs-thumb"
          aria-hidden="true"
          style={
            thumb
              ? { transform: `translateX(${thumb.x}px)`, width: thumb.w, opacity: 1 }
              : undefined
          }
        />
        {TIERS.map(({ tier: id, label }) => (
          <button
            key={id}
            role="tab"
            aria-selected={id === tier}
            className={`tier-tab${id === tier ? ' tier-tab-active' : ''}`}
            onClick={() => selectTier(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {defense && (
        <p className="muted small" role="note">
          Defense mode: each robot only sets tricks. Land a set to give that robot a letter.
        </p>
      )}
      <section role="tabpanel">
        <div className="robot-grid">
          {tierRobots.map((robot) => {
            const rec = records[robot.id];
            const defeated = (rec?.w ?? 0) > 0;

            return (
              <button
                key={robot.id}
                className={`robot-card${defeated ? ' robot-card--defeated' : ''}`}
                onClick={() => onPick(robot)}
              >
                {defeated && (
                  <span className="robot-defeated" aria-label="Defeated">
                    <span aria-hidden="true">✓</span>
                  </span>
                )}
                <span
                  className="robot-disc"
                  style={{ background: `${robot.avatar.body}24` }}
                  aria-hidden="true"
                >
                  <RobotAvatar robot={robot} size={60} />
                </span>
                <span className="robot-name">{robot.name}</span>
                <RobotRating robot={robot} />
                <span className="robot-tagline">{robot.tagline}</span>
                {rec && (
                  <span className="robot-record">
                    <strong>{rec.w}W</strong> – <strong>{rec.l}L</strong>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
