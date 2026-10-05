'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import RobotAvatar from './RobotAvatar';
import type { Robot } from '../types';
import { createPushOffTimeline, pushOffFrame } from './pushOff';

interface Props {
  robot: Robot;
  playerFirst: boolean;
  letters: readonly string[];
  who: string;
  nextTurn: string;
  onComplete: () => void;
}

const GROUND = 566;
const SEAM = 540;
const SCALE = 1.3;
const TINTS = ['#ffd166', '#a5e8c6', '#ffb3c7'];
const ease = (v: number) => { const u = Math.max(0, Math.min(1, v)); return u * u * (3 - 2 * u); };

function mixHex(a: string, b: string, share: number): string {
  const channels = (hex: string) => hex.replace('#', '').match(/[0-9a-f]{2}/gi)!.map((part) => parseInt(part, 16));
  const aa = channels(a);
  const bb = channels(b);
  return `#${aa.map((v, i) => Math.round(v * share + bb[i] * (1 - share)).toString(16).padStart(2, '0')).join('')}`;
}

/** Reusable robot ride-in; the game supplies its own turn announcement. */
export default function PushOffAnimation({ robot, playerFirst, letters, who, nextTurn, onComplete }: Props) {
  const timeline = useMemo(() => createPushOffTimeline(letters.length), [letters.length]);
  const [time, setTime] = useState(0);
  const complete = useRef(onComplete);
  const finished = useRef(false);

  useEffect(() => { complete.current = onComplete; }, [onComplete]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      const frame = requestAnimationFrame(() => setTime(timeline.exit));
      const timer = window.setTimeout(() => { if (!finished.current) { finished.current = true; complete.current(); } }, 1200);
      return () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
    }
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const next = (now - start) / 1000;
      setTime(Math.min(next, timeline.end));
      if (next < timeline.end) raf = requestAnimationFrame(tick);
      else if (!finished.current) { finished.current = true; complete.current(); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [timeline]);

  const frame = pushOffFrame(timeline, time);
  const screenX = (worldX: number, y = GROUND) => 195 + (worldX - frame.camera - 195) * SCALE * ((y - (GROUND - 1500)) / 1500);
  const jointStart = Math.floor((frame.camera + 195 - 220 - 52) / 96);
  const sidewalkJoints = Array.from({ length: 8 }, (_, i) => 52 + (jointStart + i) * 96);
  const rows = [540, 646, 764, 900];
  const colorBack = mixHex(robot.avatar.body, '#eeedf3', 0.07);
  const colorFront = mixHex(robot.avatar.body, '#d2cfdc', 0.12);
  const riderX = screenX(frame.x);

  let squat = 0;
  let lean = 0;
  let nose = 0;
  let hop = 0;
  let bump = 0;
  for (const push of [{ at: 0.16, duration: 0.15 }, { at: 0.44, duration: 0.15 }]) {
    const prep = (time - (push.at - 0.1)) / 0.1;
    if (prep > 0 && prep <= 1) squat = Math.max(squat, 0.1 * ease(prep));
    const u = (time - push.at) / push.duration;
    if (u > 0 && u < 1) { squat = Math.min(squat, -0.04 * Math.sin(Math.PI * u)); lean = 4 * Math.sin(Math.PI * u); }
  }
  for (const clack of [...timeline.frontClacks, ...timeline.backClacks]) {
    const u = (time - clack) / 0.05;
    if (u > 0 && u < 1) bump = Math.max(bump, 1.3 * Math.sin(Math.PI * u));
  }
  const popTime = time - timeline.pop;
  if (popTime > -0.09 && popTime <= 0) squat = 0.14 * ease(1 + popTime / 0.09);
  if (popTime > 0 && popTime < 0.42) {
    nose = popTime < 0.06 ? -18 * ease(popTime / 0.06)
      : popTime < 0.24 ? -18 * (1 - ease((popTime - 0.06) / 0.18))
        : 3 * Math.sin(Math.PI * (popTime - 0.24) / 0.18);
    squat = popTime < 0.08 ? -0.05 : 0.07 * Math.sin(Math.PI * Math.max(0, Math.min(1, (popTime - 0.08) / 0.28)));
  }
  const landedFor = time - timeline.land;
  if (landedFor >= 0 && landedFor < 0.24) squat = Math.max(squat, 0.16 * (1 - landedFor / 0.24) * Math.cos(landedFor * 9));
  const slideFor = time - timeline.slide;
  const stoppedFor = time - timeline.stop;
  if (slideFor >= 0) {
    const down = ease(slideFor / 0.09);
    const up = stoppedFor > 0 ? Math.min(1, stoppedFor / 0.16) : 0;
    nose = -30 * down * (1 - up * up) + (up > 0 && up < 1 ? 2.5 * Math.sin(Math.PI * up) : 0);
    if (time < timeline.stop) bump = -0.6 * Math.abs(Math.sin(time * 170));
    if (stoppedFor > 0.12 && stoppedFor < 0.3) squat = Math.max(squat, 0.08 * Math.sin(Math.PI * (stoppedFor - 0.12) / 0.18));
  }
  const hopAt = timeline.stop + 0.3;
  if (!playerFirst && time >= hopAt) {
    const u = (time - hopAt) / 0.42;
    if (u < 1) hop = -24 * Math.sin(Math.PI * u);
  } else if (playerFirst && time > hopAt + 0.1) hop = -2.5 * Math.sin((time - hopAt - 0.1) * 4.2);

  const tailScuffStart = timeline.x[Math.floor((timeline.slide + 0.06) * 480)] - 36;
  const skip = () => { if (!finished.current) { finished.current = true; complete.current(); } };

  return (
    <div className={`push-off-overlay${time >= timeline.exit ? ' is-exiting' : ''}`} role="dialog" aria-label={`Let's skate. ${who} ${playerFirst ? 'set' : 'sets'} first.`} onClick={skip}>
      <div className="push-off-stage" style={{ '--slab-back': colorBack, '--slab-front': colorFront } as CSSProperties}>
        <svg className="push-off-world" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs><linearGradient id="push-off-concrete" x1="0" y1="0" x2="0" y2="1"><stop stopColor={colorBack} /><stop offset="1" stopColor={colorFront} /></linearGradient></defs>
          <rect x="-10" y={SEAM} width="410" height="320" fill="url(#push-off-concrete)" />
          <g fill="rgba(34,26,78,.045)">{rows.slice(0, -1).flatMap((y, row) => sidewalkJoints.map((joint, i) => (jointStart + i + row) % 2 ? null
            : <path key={`${row}-${i}`} d={`M${screenX(joint, y)} ${y} L${screenX(joint + 96, y)} ${y} L${screenX(joint + 96, rows[row + 1])} ${rows[row + 1]} L${screenX(joint, rows[row + 1])} ${rows[row + 1]} Z`} />))}</g>
          {rows.slice(1, -1).map((y) => <g key={y}><path d={`M-10 ${y} H400`} stroke="rgba(34,26,78,.28)" strokeWidth="2.4" /><path d={`M-10 ${y + 2} H400`} stroke="rgba(255,255,255,.6)" strokeWidth="1.2" /></g>)}
          {sidewalkJoints.map((joint, i) => <g key={i}>
            <path d={`M${screenX(joint, SEAM)} ${SEAM} L${screenX(joint, 854)} 854`} stroke="rgba(34,26,78,.28)" strokeWidth="2.4" />
            <path d={`M${screenX(joint, SEAM) + 1.8} ${SEAM + 2} L${screenX(joint, 854) + 2.2} 854`} stroke="rgba(255,255,255,.6)" strokeWidth="1.2" />
          </g>)}
          <path d="M-10 540 H400" stroke="#23232e" strokeWidth="3" />
          {slideFor > 0.06 && <path d={`M${screenX(tailScuffStart)} 565.5 L${screenX(Math.min(frame.x, timeline.stopX) - 36)} 565.5`} stroke="#23232e" strokeWidth="3" strokeLinecap="round" opacity=".16" />}
          {Array.from({ length: 7 }, (_, i) => {
            const born = timeline.slide + 0.06 + i * (timeline.stop - timeline.slide - 0.06) / 7;
            const u = (time - born) / 0.55;
            if (u < 0 || u > 1) return null;
            const origin = pushOffFrame(timeline, born).x - 36;
            const progress = 1 - (1 - u) ** 2;
            return <circle key={i} cx={screenX(origin - (30 + (i % 3) * 22) * progress * 0.4)} cy={GROUND - 2 - (12 + i * 7 % 14) * progress * SCALE} r={(2.4 + (i % 3) * 1.2 + u * 6) * SCALE} fill="#fff" opacity={(1 - u) * 0.75} />;
          })}
          {frame.speed > 300 && time < timeline.land && [26, 52, 80].map((height, i) => {
            const points = Array.from({ length: 9 }, (_, j) => {
              const previous = pushOffFrame(timeline, Math.max(0, time - (j + 2) * 0.008 * [0.9, 1, 0.7][i]));
              return `${screenX(previous.x) - 34 * SCALE},${GROUND - (previous.height + height) * SCALE}`;
            });
            return <polyline key={height} points={points.join(' ')} fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" opacity={Math.min(0.55, (frame.speed - 300) / 550)} />;
          })}
          <ellipse cx={riderX} cy={GROUND + 1} rx={44 * (1 - frame.height / 160)} ry="5.5" fill="rgba(20,6,70,.26)" opacity={Math.max(0, 1 - frame.height / 130)} />
          <g transform={`translate(${riderX} ${GROUND - frame.height * SCALE + bump}) scale(${SCALE}) rotate(${nose} -17.9 0) rotate(${lean})`} style={{ color: '#23232e' }}>
            <g transform={`translate(0 ${hop}) scale(${1 + squat * 0.45} ${1 - squat})`}>
              <svg x="-56" y="-117.4" width="112" height="118.72" viewBox="0 0 112 112"><RobotAvatar robot={robot} size={112} pose={!playerFirst && time >= hopAt + 0.1 ? 'stoked' : 'idle'} /></svg>
            </g>
          </g>
        </svg>
        <div className="push-off-title" aria-hidden="true">
          {time >= timeline.pop + 0.11 && <span className="push-off-lets">Let&apos;s</span>}
          <div className={`push-off-tiles${time >= timeline.land && time < timeline.land + 0.28 ? ' is-jolting' : ''}`}>
            {letters.map((letter, i) => <span className="push-off-slot" key={i}>
              {time >= timeline.letterTimes[i] && <span className="push-off-tile" style={{ '--tile-color': TINTS[i % 3], '--tile-rot': `${[-5, 3, -2, 4, -3][i % 5]}deg` } as CSSProperties}>{letter}</span>}
            </span>)}
          </div>
        </div>
        {time >= timeline.head && <div className="push-off-head">
          <strong>{who}</strong><strong>{playerFirst ? 'set first' : 'sets first'}</strong>
          {time >= timeline.head + 0.3 && <p>{nextTurn}</p>}
        </div>}
        <button className="push-off-skip" type="button" aria-label="Skip game start animation">Tap to skip</button>
      </div>
    </div>
  );
}
