import {
  DEFENSE_CONSISTENCY,
  ROBOT_CONSISTENCY,
  ROBOT_DEFENSE_SET_WEIGHTS,
  ROBOT_SET_WEIGHTS,
  type RobotBehaviorTable,
} from './behavior';

/** The editable behavior values a robot has. */
export type TuningKind = 'consistency' | 'setWeight' | 'defenseSetWeight';
type TuningTable = RobotBehaviorTable;

const STORAGE_KEYS: Record<TuningKind, string> = {
  consistency: 'skrobot.robot-consistency.explicit.v2',
  setWeight: 'skrobot.robot-setweights.explicit.v2',
  defenseSetWeight: 'skrobot.robot-defenseweights.explicit.v2',
};
const TUNING_EVENT = 'skrobot:tuning-change';

/**
 * Complete committed behavior tables. Every roster robot has explicit data;
 * the defense roster's tables are merged into the same lookup paths.
 */
export const TUNED_CONSISTENCY: TuningTable = { ...ROBOT_CONSISTENCY, ...DEFENSE_CONSISTENCY };
export const TUNED_SET_WEIGHTS = ROBOT_SET_WEIGHTS;
const TUNED_DEFENSE_SET_WEIGHTS = ROBOT_DEFENSE_SET_WEIGHTS;

const STATIC_TABLES: Record<TuningKind, TuningTable> = {
  consistency: TUNED_CONSISTENCY,
  setWeight: TUNED_SET_WEIGHTS,
  defenseSetWeight: TUNED_DEFENSE_SET_WEIGHTS,
};

function readLocalTuning(kind: TuningKind): TuningTable {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[kind]);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as TuningTable;
  } catch {
    return {};
  }
}

function writeLocalTuning(kind: TuningKind, table: TuningTable): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS[kind], JSON.stringify(table));
    window.dispatchEvent(new Event(TUNING_EVENT));
  } catch {
    // Storage can be blocked or full; committed behavior still works.
  }
}

/** Local editor values win over committed data; there is no modeled fallback. */
export function getTuned(kind: TuningKind, robotId: string, trickId: string): number | undefined {
  const local = readLocalTuning(kind)[robotId]?.[trickId];
  return local ?? STATIC_TABLES[kind][robotId]?.[trickId];
}

export function getTunedConsistency(robotId: string, trickId: string): number | undefined {
  return getTuned('consistency', robotId, trickId);
}

export function getTunedSetWeight(robotId: string, trickId: string): number | undefined {
  return getTuned('setWeight', robotId, trickId);
}

export function getTunedDefenseSetWeight(robotId: string, trickId: string): number | undefined {
  return getTuned('defenseSetWeight', robotId, trickId);
}

/** Set or clear a browser-local value. Clearing reverts to committed data. */
export function setLocalOverride(
  kind: TuningKind,
  robotId: string,
  trickId: string,
  value: number | null,
): void {
  if (typeof window === 'undefined') return;
  const table = readLocalTuning(kind);
  if (value === null) {
    delete table[robotId]?.[trickId];
    if (table[robotId] && Object.keys(table[robotId]).length === 0) delete table[robotId];
  } else {
    const validated = kind === 'consistency'
      ? Math.max(0, Math.min(1, value))
      : Math.max(0, value);
    table[robotId] = { ...table[robotId], [trickId]: validated };
  }
  writeLocalTuning(kind, table);
}

export function clearLocalTuning(): void {
  if (typeof window === 'undefined') return;
  for (const key of Object.values(STORAGE_KEYS)) window.localStorage.removeItem(key);
  window.dispatchEvent(new Event(TUNING_EVENT));
}

export function subscribeToTuning(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(TUNING_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(TUNING_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function countLocalOverrides(): number {
  return (['consistency', 'setWeight'] as const).reduce(
    (total, kind) => total + Object.values(readLocalTuning(kind))
      .reduce((count, tricks) => count + Object.keys(tricks).length, 0),
    0,
  );
}

function mergedRobot(kind: TuningKind, robotId: string): Record<string, number> {
  return {
    ...STATIC_TABLES[kind][robotId],
    ...readLocalTuning(kind)[robotId],
  };
}

function robotBlock(robotId: string, values: Record<string, number>): string {
  const rows = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([trickId, value]) => `    '${trickId}': ${value},`)
    .join('\n');
  return `  ${robotId}: {\n${rows}\n  },`;
}

/** Export one complete robot block so edits stay manageable now that all data is explicit. */
export function exportTuningTs(robotId: string): string {
  return [
    'export const ROBOT_CONSISTENCY: RobotBehaviorTable = {',
    robotBlock(robotId, mergedRobot('consistency', robotId)),
    '};',
    '',
    'export const ROBOT_SET_WEIGHTS: RobotBehaviorTable = {',
    robotBlock(robotId, mergedRobot('setWeight', robotId)),
    '};',
  ].join('\n');
}
