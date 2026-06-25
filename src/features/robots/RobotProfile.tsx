'use client';

import { useMemo, useState } from 'react';
import type { Stance, Trick } from '@/features/tricks';
import { trickDescription } from '@/features/tricks';
import type { Robot } from './robots';
import { buildBag } from './robots';
import RobotAvatar from './RobotAvatar';

interface Props {
  robot: Robot;
  /** The trick pool for the chosen mode — scopes which tricks the robot can do here. */
  pool: Trick[];
  /** Kick off the game (drops into the rock-paper-scissors toss). */
  onStart: () => void;
}

/** Stances shown in learning/comfort order, with short labels for the pills. */
const STANCE_ORDER: Stance[] = ['regular', 'fakie', 'nollie', 'switch'];
const STANCE_LABEL: Record<Stance, string> = {
  regular: 'Reg',
  fakie: 'Fakie',
  nollie: 'Nollie',
  switch: 'Switch',
};

function level(value: number): 'high' | 'mid' | 'low' {
  return value >= 0.7 ? 'high' : value >= 0.45 ? 'mid' : 'low';
}

/** One pill per stance the robot can do a base in — how the stance model is made visible. */
function StancePill({ stance, value }: { stance: Stance; value: number }) {
  const pct = Math.round(value * 100);
  const label = `${stance === 'regular' ? 'Regular' : STANCE_LABEL[stance]}: lands it about ${pct}% of the time`;
  return (
    <span className={`stance-pill stance-pill-${level(value)}`} title={label} aria-label={label}>
      <span className="stance-pill-label">{STANCE_LABEL[stance]}</span>
      <span className="stance-pill-pct">{pct}%</span>
    </span>
  );
}

/**
 * Pre-game "meet the opponent" screen: the robot's avatar, a written summary,
 * its signature tricks, and an optional expandable list of every trick it can
 * actually pull in the chosen pool (each with a plain-language description).
 */
export default function RobotProfile({ robot, pool, onStart }: Props) {
  const [showTricks, setShowTricks] = useState(false);
  const bag = useMemo(() => buildBag(robot, pool), [robot, pool]);

  // One row per base trick, but each row lists every stance the robot can do it
  // in (with that stance's consistency) — so the stance model is visible instead
  // of collapsed to the regular variant. Signature tricks float to the top, then
  // most-consistent first (by the robot's best stance for that base).
  const repertoire = useMemo(() => {
    const byBase = new Map<
      string,
      { base: string; rep: Trick; variants: { stance: Stance; consistency: number }[] }
    >();
    for (const trick of pool) {
      const c = bag.get(trick.id);
      if (c == null) continue;
      let entry = byBase.get(trick.base);
      if (!entry) {
        entry = { base: trick.base, rep: trick, variants: [] };
        byBase.set(trick.base, entry);
      }
      entry.variants.push({ stance: trick.stance, consistency: c });
      // Keep the easiest variant as the representative for its description.
      if (trick.difficulty < entry.rep.difficulty) entry.rep = trick;
    }
    const rows = [...byBase.values()];
    for (const row of rows) {
      row.variants.sort((a, b) => STANCE_ORDER.indexOf(a.stance) - STANCE_ORDER.indexOf(b.stance));
    }
    const best = (r: (typeof rows)[number]) => Math.max(...r.variants.map((v) => v.consistency));
    return rows.sort((a, b) => {
      const af = robot.favorites.includes(a.base) ? 1 : 0;
      const bf = robot.favorites.includes(b.base) ? 1 : 0;
      if (af !== bf) return bf - af;
      return best(b) - best(a) || a.base.localeCompare(b.base);
    });
  }, [bag, pool, robot.favorites]);

  return (
    <div className="container">
      <div className="panel center robot-profile">
        <RobotAvatar robot={robot} size={150} />
        <h2 className="panel-title">{robot.name}</h2>
        <p className="profile-tagline">{robot.tagline}</p>
        <p className="muted profile-summary">{robot.summary}</p>

        <button className="btn-primary" onClick={onStart}>
          Play {robot.name}
        </button>
        <button
          className="btn-ghost"
          onClick={() => setShowTricks((s) => !s)}
          aria-expanded={showTricks}
        >
          {showTricks ? 'Hide tricks' : `See their tricks (${repertoire.length})`}
        </button>
      </div>

      {showTricks && (
        <div className="panel robot-tricks">
          <h3 className="section-title profile-tricks-title">Tricks {robot.name} can do</h3>
          <p className="muted small profile-tricks-sub">
            Each tag is a stance they can do it in — and how often they land it that way.
          </p>
          <ul className="repertoire-list">
            {repertoire.map(({ base, rep, variants }) => {
              const fav = robot.favorites.includes(base);
              return (
                <li key={base} className="repertoire-row">
                  <div className="repertoire-info">
                    <span className="repertoire-name">
                      {base}
                      {fav && (
                        <span className="repertoire-star" title="Signature trick" aria-label="Signature trick">
                          ★
                        </span>
                      )}
                    </span>
                    <span className="repertoire-desc">{trickDescription(rep)}</span>
                    <div className="repertoire-stances">
                      {variants.map((v) => (
                        <StancePill key={v.stance} stance={v.stance} value={v.consistency} />
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
            {repertoire.length === 0 && (
              <li className="trick-empty">No tricks from this set are in {robot.name}&apos;s bag.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
