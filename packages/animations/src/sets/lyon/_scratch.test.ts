import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildLyonGeometry } from './lyonGeometry';
it('count', () => {
  const b = buildLyonGeometry();
  writeFileSync('/tmp/lyon_count.txt', [b.ground.getAttribute('position').count, b.props.getAttribute('position').count, b.railSegments.length, b.shadowBoxes.length].join(' '));
});
