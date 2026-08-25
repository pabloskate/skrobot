/**
 * Tricks feature — the trick catalog (data) plus UI for browsing/selecting tricks.
 * Other features import tricks only through this barrel.
 */
export type { Stance, Discipline, Trick, TrickPool } from './tricks';
export {
  TRICKS,
  TRICK_BY_ID,
  TRICK_BY_NAME,
  TRICK_BASE_ALIASES,
  tricksFor,
  defaultRoutedTrickPool,
  grade,
  trickDescription,
  trickDiscipline,
  trickMatchesSearch,
} from './tricks';
export { default as TrickPicker } from './TrickPicker';
