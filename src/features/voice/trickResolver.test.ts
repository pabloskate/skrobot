import { describe, expect, it } from 'vitest'
import type { Stance, Trick } from '@/features/tricks'
import { resolveTrick } from './trickResolver'

const t = (name: string, base: string, stance: Stance = 'regular'): Trick => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  base,
  stance,
  category: 'flatground',
  difficulty: 5,
})

const pool: Trick[] = [
  t('Kickflip', 'Kickflip'),
  t('Nollie Kickflip', 'Kickflip', 'nollie'),
  t('Heelflip', 'Heelflip'),
  t('Hardflip', 'Hardflip'),
  t('360 Flip', '360 Flip'),
  t('Frontside 180', 'Frontside 180'),
]

const matched = (spoken: string) => {
  const r = resolveTrick(spoken, pool)
  return r.kind === 'match' ? r.trick.name : r.kind
}

describe('resolveTrick', () => {
  it('matches an exact spoken name', () => {
    expect(matched('Kickflip')).toBe('Kickflip')
  })

  it('keeps a stance prefix distinct from the regular variant', () => {
    expect(matched('nollie kickflip')).toBe('Nollie Kickflip')
    expect(matched('kickflip')).toBe('Kickflip')
  })

  it('resolves spoken aliases to their canonical trick', () => {
    expect(matched('tre flip')).toBe('360 Flip') // BASE_ALIASES
    expect(matched('flip')).toBe('Kickflip')
  })

  it('normalizes spoken number-words', () => {
    expect(matched('frontside one eighty')).toBe('Frontside 180')
  })

  it('tolerates a small mishearing via fuzzy match', () => {
    expect(matched('kikflip')).toBe('Kickflip')
  })

  it('returns none for an unrecognizable input', () => {
    expect(matched('asdfghjkl')).toBe('none')
  })

  it('flags a too-close-to-call mishearing as ambiguous', () => {
    const r = resolveTrick('haelflip', pool)
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') {
      const names = r.candidates.map((c) => c.name)
      expect(names).toContain('Heelflip')
      expect(names).toContain('Hardflip')
    }
  })

  it('only considers tricks still available in the pool', () => {
    const withoutKickflip = pool.filter((x) => x.name !== 'Kickflip')
    // "kickflip" now has no exact match; nearest is the nollie variant, but the
    // bare (no-stance) request should not silently grab a stance variant.
    expect(resolveTrick('Kickflip', withoutKickflip).kind).not.toBe('match')
  })
})
