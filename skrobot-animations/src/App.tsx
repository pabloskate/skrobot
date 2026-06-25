import { useMemo, useState } from 'react';
import TrickAnimation, {
  BACKGROUND_SCENE_OPTIONS,
  FALL_VARIANT_OPTIONS,
  SLOW_MOTION_PLAYBACK_RATE,
  type BackgroundSceneId,
  type FallVariant,
} from './TrickAnimation';
import RobotAvatar from './RobotAvatar';
import { ROBOTS, robotById, tricksForStance } from './data';
import type { Stance } from './types';
import styles from './Playground.module.css';

const STANCES: Stance[] = ['regular', 'fakie', 'switch', 'nollie'];
const PLAYBACK_OPTIONS = [
  { id: 'normal', label: 'Normal', rate: 1 },
  { id: 'slow', label: 'Slow motion', rate: SLOW_MOTION_PLAYBACK_RATE },
] as const;

type PlaybackMode = (typeof PLAYBACK_OPTIONS)[number]['id'];

async function writeClipboardText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back for local previews where clipboard permissions are blocked.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '0';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

export default function App() {
  const [selectedRobotId, setSelectedRobotId] = useState(ROBOTS[0].id);
  const [selectedBase, setSelectedBase] = useState('Kickflip');
  const [selectedStance, setSelectedStance] = useState<Stance>('regular');
  const [landed, setLanded] = useState<boolean | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>('normal');
  const [backgroundSceneId, setBackgroundSceneId] = useState<BackgroundSceneId>(BACKGROUND_SCENE_OPTIONS[0].id);
  const [fallVariant, setFallVariant] = useState<FallVariant>(FALL_VARIANT_OPTIONS[0].id);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const robot = useMemo(() => robotById(selectedRobotId) ?? ROBOTS[0], [selectedRobotId]);
  const playbackRate = PLAYBACK_OPTIONS.find((option) => option.id === playbackMode)?.rate ?? 1;

  const availableTricks = useMemo(() => tricksForStance(selectedStance), [selectedStance]);

  const currentTrick = useMemo(() => {
    return availableTricks.find((t) => t.base === selectedBase) ?? availableTricks[0];
  }, [availableTricks, selectedBase]);

  const animationKey = [
    playKey,
    selectedRobotId,
    currentTrick?.id ?? selectedBase,
    landed === null ? 'idle' : landed ? 'landed' : 'bailed',
    playbackMode,
    backgroundSceneId,
    fallVariant,
  ].join(':');

  const animationParams = useMemo(
    () => ({
      robotId: robot.id,
      robotName: robot.name,
      trickId: currentTrick?.id ?? null,
      trickBase: currentTrick?.base ?? selectedBase,
      stance: currentTrick?.stance ?? selectedStance,
      landed,
      outcome: landed === null ? 'not-started' : landed ? 'landed' : 'bailed',
      playbackMode,
      playbackRate,
      backgroundSceneId,
      fallVariant,
    }),
    [
      backgroundSceneId,
      currentTrick,
      fallVariant,
      landed,
      playbackMode,
      playbackRate,
      robot.id,
      robot.name,
      selectedBase,
      selectedStance,
    ]
  );
  const paramsText = useMemo(() => JSON.stringify(animationParams, null, 2), [animationParams]);

  const handleStanceChange = (stance: Stance) => {
    setSelectedStance(stance);
    // Try to keep the same base if it exists in the new stance.
    const matching = tricksForStance(stance).find((t) => t.base === selectedBase);
    if (!matching) {
      // Fall back to the first available trick in the new stance.
      const fallback = tricksForStance(stance)[0];
      if (fallback) setSelectedBase(fallback.base);
    }
  };

  const play = (outcome: boolean) => {
    setLanded(outcome);
    setPaused(false);
    setPlayKey((k) => k + 1);
  };

  const replay = () => {
    if (landed === null) return;
    setPaused(false);
    setPlayKey((k) => k + 1);
  };

  const copyParams = async () => {
    const copied = await writeClipboardText(paramsText);
    setCopyStatus(copied ? 'copied' : 'failed');
    window.setTimeout(() => setCopyStatus('idle'), 1400);
  };

  const copyLabel =
    copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy parameters';

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>Skrobot Animation Playground</h1>
        <p>Pick a robot, trick, and stance — then watch it land or bail.</p>
      </header>

      <section className={styles.card}>
        <div>
          <h2 className={styles.sectionTitle}>Robot</h2>
          <div className={styles.robotRow}>
            {ROBOTS.map((r) => (
              <button
                key={r.id}
                className={`${styles.robotOption} ${selectedRobotId === r.id ? styles.robotOptionActive : ''}`}
                onClick={() => setSelectedRobotId(r.id)}
                aria-pressed={selectedRobotId === r.id}
              >
                <RobotAvatar robot={r} size={56} />
                <span className={styles.robotName}>{r.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Stance</h2>
          <div className={styles.stanceRow}>
            {STANCES.map((stance) => (
              <button
                key={stance}
                className={`${styles.stanceBtn} ${selectedStance === stance ? styles.stanceBtnActive : ''}`}
                onClick={() => handleStanceChange(stance)}
                aria-pressed={selectedStance === stance}
              >
                {stance}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Trick</h2>
          <select
            className={styles.trickSelect}
            value={currentTrick?.base ?? ''}
            onChange={(e) => setSelectedBase(e.target.value)}
          >
            {availableTricks.map((t) => (
              <option key={t.id} value={t.base}>
                {t.base}
              </option>
            ))}
          </select>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Playback</h2>
          <div className={styles.speedRow}>
            {PLAYBACK_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`${styles.speedBtn} ${playbackMode === option.id ? styles.speedBtnActive : ''}`}
                onClick={() => setPlaybackMode(option.id)}
                aria-pressed={playbackMode === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Background</h2>
          <div className={styles.optionGrid}>
            {BACKGROUND_SCENE_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`${styles.optionBtn} ${backgroundSceneId === option.id ? styles.optionBtnActive : ''}`}
                onClick={() => setBackgroundSceneId(option.id)}
                aria-pressed={backgroundSceneId === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className={styles.sectionTitle}>Fall</h2>
          <div className={styles.optionGrid}>
            {FALL_VARIANT_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`${styles.optionBtn} ${fallVariant === option.id ? styles.optionBtnActive : ''}`}
                onClick={() => setFallVariant(option.id)}
                aria-pressed={fallVariant === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.stage}>
        {landed === null ? (
          <p className={styles.placeholder}>Choose a trick and press Land or Fall to start.</p>
        ) : (
          <>
            <p className={styles.status}>
              <strong>{robot.name}</strong> attempts{' '}
              <strong>{currentTrick?.name ?? selectedBase}</strong> —{' '}
              {landed ? 'Landed' : 'Bailed'}
            </p>
            <TrickAnimation
              key={animationKey}
              robot={robot}
              trick={currentTrick ?? { id: 'kickflip-regular', name: 'Kickflip', base: 'Kickflip', stance: 'regular' }}
              landed={landed}
              playbackRate={playbackRate}
              backgroundSceneId={backgroundSceneId}
              fallVariant={fallVariant}
              paused={paused}
              onDone={() => {}}
            />
          </>
        )}

        <div className={styles.actionRow}>
          <button className={`${styles.actionBtn} ${styles.land}`} onClick={() => play(true)}>
            Land
          </button>
          <button className={`${styles.actionBtn} ${styles.fall}`} onClick={() => play(false)}>
            Fall
          </button>
          <button
            className={`${styles.actionBtn} ${styles.replay}`}
            onClick={replay}
            disabled={landed === null}
          >
            Replay
          </button>
          <button
            className={`${styles.actionBtn} ${styles.pause}`}
            onClick={() => setPaused((p) => !p)}
            disabled={landed === null}
            aria-pressed={paused}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </section>

      <section className={styles.paramsPanel}>
        <div className={styles.paramsHeader}>
          <h2 className={styles.paramsTitle}>Animation parameters</h2>
          <button className={styles.copyBtn} onClick={copyParams}>
            {copyLabel}
          </button>
        </div>
        <pre className={styles.paramsCode}>{paramsText}</pre>
      </section>
    </div>
  );
}
