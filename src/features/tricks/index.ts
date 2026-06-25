/**
 * Tricks feature — the trick catalog (data) plus UI for browsing/selecting tricks.
 * Other features import tricks only through this barrel.
 */
export type { Stance, Category, Discipline, Family, Trick, TrickPool } from './tricks';
export {
  TRICKS,
  TRICK_BY_ID,
  tricksFor,
  defaultRoutedTrickPool,
  grade,
  trickDescription,
  trickFamily,
  trickDiscipline,
  stanceLoad,
} from './tricks';
export { default as TrickPicker } from './TrickPicker';
export { default as CustomSetup } from './CustomSetup';
