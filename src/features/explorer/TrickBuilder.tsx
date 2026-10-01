'use client';

import { useState } from 'react';
import { TbChevronRight, TbDice5, TbSearch, TbX } from 'react-icons/tb';
import type { PopEnd } from '@skrobot/animations';
import { trickMatchesSearch } from '@/features/tricks';
import {
  FLATGROUND_TIERS,
  GRIND_CHOICES,
  GRIND_SIDES,
  INTO_CHOICES,
  OUT_CHOICES,
  RIDERS,
  STANCES,
  flatgroundTrick,
  outEndsFor,
  outName,
  shuffle,
  withGrind,
  type ExplorerMode,
  type ExplorerState,
} from './explorer';

type Slot = 'into' | 'grind' | 'out';

const MODES: ReadonlyArray<{ id: ExplorerMode; label: string }> = [
  { id: 'flatground', label: 'Flatground' },
  { id: 'grinds', label: 'Grinds' },
];

const END_LABELS: Record<PopEnd, string> = { tail: 'Off the tail', nose: 'Off the nose' };

const capitalize = (s: string) => `${s[0].toUpperCase()}${s.slice(1)}`;

/** Why a grind allows the trick-out ends it does. */
function endsNote(ends: readonly PopEnd[]): string {
  if (ends.length > 1) return 'Both trucks or the middle are on the bar, so you can pop out off either end.';
  return ends[0] === 'nose'
    ? 'Only the nose end is on the bar, so tricks out pop off the nose as nollie tricks.'
    : 'Only the tail end is on the bar, so tricks out pop off the tail.';
}

interface Props {
  state: ExplorerState;
  onChange: (next: ExplorerState) => void;
}

/** Pick what the robot skates: a flatground trick, or a grind combo built from three slots. */
export default function TrickBuilder({ state, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [slot, setSlot] = useState<Slot>('grind');
  const [preferredEnd, setPreferredEnd] = useState<PopEnd>('tail');
  const ends = outEndsFor(state.grind);
  const outEnd = state.out?.end ?? (ends.includes(preferredEnd) ? preferredEnd : ends[0]);

  const set = (patch: Partial<ExplorerState>) => onChange({ ...state, ...patch });
  const matches = (base: string) => trickMatchesSearch(flatgroundTrick(base, state.stance), query);
  const tiers = FLATGROUND_TIERS.map((tier) => ({ ...tier, bases: tier.bases.filter(matches) })).filter((tier) => tier.bases.length > 0);

  const chooseEnd = (end: PopEnd) => {
    setPreferredEnd(end);
    if (state.out) set({ out: { ...state.out, end } });
  };

  return (
    <section className="explorer-card explorer-builder" aria-labelledby="explorer-builder-title">
      <div className="explorer-card-head">
        <h2 id="explorer-builder-title">Trick</h2>
        <button type="button" className="explorer-shuffle" onClick={() => onChange(shuffle(state))}>
          <TbDice5 aria-hidden />
          {state.mode === 'grinds' ? 'Random combo' : 'Random trick'}
        </button>
      </div>

      <div className="explorer-segmented explorer-modes" role="tablist" aria-label="Kind of trick">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="tab"
            aria-selected={state.mode === mode.id}
            className={state.mode === mode.id ? 'active' : ''}
            onClick={() => set({ mode: mode.id })}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="explorer-field">
        <span className="explorer-field-label" id="explorer-stance-label">Stance</span>
        <div className="explorer-segmented" role="radiogroup" aria-labelledby="explorer-stance-label">
          {STANCES.map((stance) => (
            <button
              key={stance}
              type="button"
              role="radio"
              aria-checked={state.stance === stance}
              className={state.stance === stance ? 'active' : ''}
              onClick={() => set({ stance })}
            >
              {capitalize(stance)}
            </button>
          ))}
        </div>
      </div>

      <div className="explorer-field explorer-field-inline">
        <span className="explorer-field-label" id="explorer-rider-label">
          Rider <small>which foot leads</small>
        </span>
        <div className="explorer-segmented explorer-segmented-compact" role="radiogroup" aria-labelledby="explorer-rider-label">
          {RIDERS.map((rider) => (
            <button
              key={rider}
              type="button"
              role="radio"
              aria-checked={state.rider === rider}
              className={state.rider === rider ? 'active' : ''}
              onClick={() => set({ rider })}
            >
              {capitalize(rider)}
            </button>
          ))}
        </div>
      </div>

      {state.mode === 'flatground' ? (
        <div className="explorer-picker">
          <label className="explorer-search">
            <TbSearch aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tricks, like “tre flip”"
              aria-label="Search tricks"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <TbX aria-hidden />
              </button>
            )}
          </label>
          {tiers.length === 0 && <p className="explorer-empty">No trick matches “{query}”.</p>}
          {tiers.map((tier) => (
            <div key={tier.label} className="explorer-tier">
              <h3>{tier.label}</h3>
              <div className="explorer-chips">
                {tier.bases.map((base) => (
                  <button
                    key={base}
                    type="button"
                    className={`explorer-chip ${state.trick === base ? 'active' : ''}`}
                    aria-pressed={state.trick === base}
                    onClick={() => set({ trick: base })}
                  >
                    {base}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="explorer-picker">
          <div className="explorer-combo" role="tablist" aria-label="Build the combo">
            {([
              ['into', 'Trick in', state.into ?? (state.stance === 'nollie' ? 'Nollie on' : 'Ollie on')],
              ['grind', 'Grind', `${state.side === 'Frontside' ? 'FS' : 'BS'} ${state.grind}`],
              ['out', 'Trick out', state.out ? outName(state.out) : 'Pop off'],
            ] as const).map(([id, label, value], i) => (
              <div key={id} className="explorer-combo-step">
                {i > 0 && <TbChevronRight className="explorer-combo-arrow" aria-hidden />}
                <button
                  type="button"
                  role="tab"
                  aria-selected={slot === id}
                  className={`explorer-slot ${slot === id ? 'active' : ''} ${(id === 'into' && !state.into) || (id === 'out' && !state.out) ? 'empty' : ''}`}
                  onClick={() => setSlot(id)}
                >
                  <span className="explorer-slot-label">{label}</span>
                  <span className="explorer-slot-value">{value}</span>
                </button>
              </div>
            ))}
          </div>

          <div className="explorer-slot-panel" role="tabpanel">
            {slot === 'into' && (
              <>
                <p className="explorer-note">Flip, shuv, or spin your way onto the bar.</p>
                <div className="explorer-chips">
                  <button
                    type="button"
                    className={`explorer-chip explorer-chip-plain ${state.into == null ? 'active' : ''}`}
                    aria-pressed={state.into == null}
                    onClick={() => set({ into: null })}
                  >
                    {state.stance === 'nollie' ? 'Nollie on' : 'Ollie on'}
                  </button>
                  {INTO_CHOICES.map((base) => (
                    <button
                      key={base}
                      type="button"
                      className={`explorer-chip ${state.into === base ? 'active' : ''}`}
                      aria-pressed={state.into === base}
                      onClick={() => set({ into: base })}
                    >
                      {base}
                    </button>
                  ))}
                </div>
              </>
            )}
            {slot === 'grind' && (
              <>
                <div className="explorer-segmented explorer-segmented-compact" role="radiogroup" aria-label="Grind side">
                  {GRIND_SIDES.map((side) => (
                    <button
                      key={side}
                      type="button"
                      role="radio"
                      aria-checked={state.side === side}
                      className={state.side === side ? 'active' : ''}
                      onClick={() => set({ side })}
                    >
                      {side}
                    </button>
                  ))}
                </div>
                <div className="explorer-chips">
                  {GRIND_CHOICES.map((grind) => (
                    <button
                      key={grind}
                      type="button"
                      className={`explorer-chip ${state.grind === grind ? 'active' : ''}`}
                      aria-pressed={state.grind === grind}
                      onClick={() => onChange(withGrind(state, grind))}
                    >
                      {grind}
                    </button>
                  ))}
                </div>
              </>
            )}
            {slot === 'out' && (
              <>
                <div className="explorer-segmented explorer-segmented-compact" role="radiogroup" aria-label="End to pop off">
                  {(['tail', 'nose'] as const).map((end) => (
                    <button
                      key={end}
                      type="button"
                      role="radio"
                      aria-checked={outEnd === end}
                      className={outEnd === end ? 'active' : ''}
                      disabled={!ends.includes(end)}
                      onClick={() => chooseEnd(end)}
                    >
                      {END_LABELS[end]}
                    </button>
                  ))}
                </div>
                <p className="explorer-note">{endsNote(ends)}</p>
                <div className="explorer-chips">
                  <button
                    type="button"
                    className={`explorer-chip explorer-chip-plain ${state.out == null ? 'active' : ''}`}
                    aria-pressed={state.out == null}
                    onClick={() => set({ out: null })}
                  >
                    Pop off
                  </button>
                  {OUT_CHOICES.map((base) => {
                    const active = state.out?.base === base;
                    return (
                      <button
                        key={base}
                        type="button"
                        className={`explorer-chip ${active ? 'active' : ''}`}
                        aria-pressed={active}
                        onClick={() => set({ out: { base, end: outEnd } })}
                      >
                        {outEnd === 'nose' ? `Nollie ${base}` : base}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
