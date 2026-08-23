'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { Trick } from '@/features/tricks';
import { TRICKS } from '@/features/tricks';
import { ROBOTS, buildBag, trickSetWeight } from './robots';
import {
  clearLocalTuning,
  countLocalOverrides,
  exportTuningTs,
  getTuned,
  setLocalOverride,
  subscribeToTuning,
} from './tuning';
import type { TuningKind } from './tuning';

function rateColor(c: number): string {
  if (c >= 0.8) return 'tune-cell--owned';
  if (c >= 0.4) return 'tune-cell--shaky';
  return 'tune-cell--learning';
}

const MODES: { kind: TuningKind; label: string }[] = [
  { kind: 'consistency', label: 'Land %' },
  { kind: 'setWeight', label: 'Set weight' },
];

const FILTERS: { value: 'all' | Trick['category']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'flatground', label: 'Flatground' },
  { value: 'grinds', label: 'Grinds' },
  { value: 'other', label: 'Other' },
];

export default function TuneScreen() {
  const [robotId, setRobotId] = useState(ROBOTS[0].id);
  const [mode, setMode] = useState<TuningKind>('consistency');
  const [category, setCategory] = useState<'all' | Trick['category']>('all');
  const [, setTick] = useState(0);
  const [exported, setExported] = useState<string | null>(null);
  const localCount = useSyncExternalStore(subscribeToTuning, countLocalOverrides, () => 0);

  const robot = useMemo(() => ROBOTS.find((r) => r.id === robotId) ?? ROBOTS[0], [robotId]);
  // Recomputed every render so local-edit writes reflect instantly.
  const bag = buildBag(robot, TRICKS);

  // Set weights are relative — show each trick's share of the total pick weight.
  const setWeights = (() => {
    const weights = new Map<string, number>();
    let total = 0;
    for (const [trickId] of bag) {
      const trick = TRICKS.find((t) => t.id === trickId)!;
      const w = trickSetWeight(trick, robot);
      weights.set(trickId, w);
      total += w;
    }
    return { weights, total };
  })();

  const grouped = useMemo(() => {
    const groups = new Map<string, Trick[]>();
    for (const trick of TRICKS) {
      if (category !== 'all' && trick.category !== category) continue;
      const list = groups.get(trick.base) ?? [];
      list.push(trick);
      groups.set(trick.base, list);
    }
    return [...groups.entries()].sort((a, b) => {
      const diff = a[1][0].baseDifficulty - b[1][0].baseDifficulty;
      return diff !== 0 ? diff : a[0].localeCompare(b[0]);
    });
  }, [category]);

  const onEdit = useCallback(
    (trickId: string, raw: string) => {
      const value = raw.trim() === '' ? null : Number(raw);
      setLocalOverride(mode, robot.id, trickId, value === null || Number.isNaN(value) ? null : value);
      setTick((t) => t + 1);
    },
    [mode, robot.id],
  );

  const onExport = useCallback(() => {
    const ts = exportTuningTs(robot.id);
    setExported(ts);
    void navigator.clipboard?.writeText(ts).catch(() => {});
  }, [robot.id]);

  const onClear = useCallback(() => {
    clearLocalTuning();
    setExported(null);
    setTick((t) => t + 1);
  }, []);

  return (
    <div className="tune-screen">
      <header className="tune-header">
        <h1>Edit robot behavior</h1>
        <p>
          Every cell is that robot&apos;s exact trick/stance value. Edits apply instantly in this
          browser (play a game to feel them), then Export and update <code>behavior.ts</code> to
          keep them.
        </p>
        <div className="tune-controls">
          <label>
            Robot{' '}
            <select value={robot.id} onChange={(e) => setRobotId(e.target.value)}>
              {ROBOTS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.tier})
                </option>
              ))}
            </select>
          </label>
          <div className="tune-modes">
            {MODES.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                className={mode === kind ? 'active' : ''}
                onClick={() => setMode(kind)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="tune-modes" role="group" aria-label="Trick category filter">
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={category === value ? 'active' : ''}
                onClick={() => setCategory(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onExport}>
            Export TS {localCount > 0 ? `(${localCount})` : ''}
          </button>
          <button type="button" onClick={onClear} disabled={localCount === 0}>
            Clear local edits
          </button>
        </div>
        <p className="tune-hint">
          {mode === 'consistency'
            ? 'Exact land rate 0–1. Every visible number is explicit robot data.'
            : 'Exact relative pick weight (0 = never sets). % shows share of all picks.'}
        </p>
      </header>

      {exported && (
        <textarea className="tune-export" readOnly rows={10} value={exported} onFocus={(e) => e.target.select()} />
      )}

      <div className="tune-grid">
        {grouped.map(([base, variants]) => {
          const anyInBag = variants.some((v) => bag.has(v.id));
          return (
            <section key={base} className={`tune-row${anyInBag ? '' : ' tune-row--out'}`}>
              <h2>{base}</h2>
              <div className="tune-variants">
                {variants.map((trick) => {
                  const inBag = bag.has(trick.id);
                  const tuned = getTuned(mode, robot.id, trick.id);
                  const placeholder =
                    mode === 'consistency'
                      ? inBag
                        ? String(bag.get(trick.id))
                        : '—'
                      : inBag
                        ? String(Math.round(setWeights.weights.get(trick.id)! * 100) / 100)
                        : '—';
                  const colorClass =
                    mode === 'consistency'
                      ? inBag
                        ? rateColor(bag.get(trick.id)!)
                        : ''
                      : inBag && setWeights.total > 0
                        ? rateColor(Math.min(1, (setWeights.weights.get(trick.id)! / setWeights.total) * 12))
                        : '';
                  return (
                    <label key={trick.id} className="tune-cell" title={trick.name}>
                      <span className="tune-stance">{trick.stance}</span>
                      <input
                        type="number"
                        min={0}
                        max={mode === 'consistency' ? 1 : undefined}
                        step={0.05}
                        inputMode="decimal"
                        placeholder={placeholder}
                        value={tuned ?? ''}
                        onChange={(e) => onEdit(trick.id, e.target.value)}
                        className={['tune-input', tuned !== undefined ? 'tune-input--tuned' : '', colorClass].join(' ')}
                      />
                      {mode === 'setWeight' && inBag && setWeights.total > 0 && (
                        <span className="tune-share">
                          {Math.round((setWeights.weights.get(trick.id)! / setWeights.total) * 100)}%
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <p className="tune-count">
        {category === 'all' ? TRICKS.length : grouped.reduce((n, [, vs]) => n + vs.length, 0)} tricks
      </p>
    </div>
  );
}
