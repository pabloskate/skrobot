'use client';

import { useSyncExternalStore } from 'react';
import { getRecordsSnapshot, getServerRecordsSnapshot, subscribeRecords } from './records';

/** Reactive records view with stable snapshots for SSR and same-tab writes. */
export function useRecordsSnapshot() {
  return useSyncExternalStore(subscribeRecords, getRecordsSnapshot, getServerRecordsSnapshot);
}
