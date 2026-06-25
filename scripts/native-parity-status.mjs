import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const logPath = resolve('docs/native/DEVICE_VALIDATION_LOG.md');
const expectedTargets = ['iOS Simulator', 'Android Emulator', 'Physical iPhone', 'Physical Android'];
const expectedHeaders = [
  'Target',
  'App URL',
  'Build/run source',
  'Sign-in',
  '`/api/me` after sign-in',
  'Voice token',
  'Mic permission',
  'Screen game',
  'Voice session',
  'Deviations',
];
const log = readFileSync(logPath, 'utf8');
const header = log
  .split('\n')
  .find((line) => line.startsWith('| Target |'))
  ?.split('|')
  .slice(1, -1)
  .map((cell) => cell.trim());
const rows = log
  .split('\n')
  .filter((line) => line.startsWith('| ') && !line.includes('---') && !line.includes('Target |'))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));

if (!header || header.length !== expectedHeaders.length || expectedHeaders.some((cell, index) => header[index] !== cell)) {
  console.error('Native parity validation log has the wrong table header.');
  console.error(`Expected: ${expectedHeaders.join(' | ')}`);
  console.error(`Found: ${header?.join(' | ') ?? 'none'}`);
  process.exit(1);
}

if (rows.length === 0) {
  console.error(`No device validation rows found in ${logPath}.`);
  process.exit(1);
}

const rowTargets = new Set(rows.map(([target]) => target));
const missingTargets = expectedTargets.filter((target) => !rowTargets.has(target));
const malformedRows = rows.filter((cells) => cells.length !== expectedHeaders.length);
const incompleteRows = rows.filter((cells) => cells.some((cell) => cell.length === 0 || /^pending$/i.test(cell)));

if (missingTargets.length > 0) {
  console.error('Native parity validation log is missing required targets:');
  for (const target of missingTargets) {
    console.error(`- ${target}`);
  }
  console.error(`Restore the full matrix in ${logPath}.`);
  process.exit(1);
}

if (malformedRows.length > 0) {
  console.error('Native parity validation log has malformed rows:');
  for (const [target] of malformedRows) {
    console.error(`- ${target}`);
  }
  console.error(`Each row must have ${expectedHeaders.length} cells.`);
  process.exit(1);
}

if (incompleteRows.length > 0) {
  console.error('Native parity is still pending device validation:');
  for (const [target] of incompleteRows) {
    console.error(`- ${target}`);
  }
  console.error(`Fill real results in ${logPath} before calling native parity complete.`);
  process.exit(1);
}

console.log('Native parity device validation log has no pending targets.');
