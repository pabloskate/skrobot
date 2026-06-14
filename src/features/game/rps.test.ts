import { describe, expect, it } from 'vitest'
import { BEATS, RPS_CHOICES, type Rps, robotThrow, rpsOutcome } from './rps'

const ALL: Rps[] = ['rock', 'paper', 'scissors']

describe('rpsOutcome', () => {
  it('is a tie when both throw the same', () => {
    for (const c of ALL) expect(rpsOutcome(c, c)).toBe('tie')
  })

  it('wins exactly when mine beats theirs', () => {
    for (const mine of ALL)
      for (const theirs of ALL) {
        if (mine === theirs) continue
        const expected = BEATS[mine] === theirs ? 'win' : 'lose'
        expect(rpsOutcome(mine, theirs)).toBe(expected)
      }
  })

  it('covers the three winning matchups', () => {
    expect(rpsOutcome('rock', 'scissors')).toBe('win')
    expect(rpsOutcome('paper', 'rock')).toBe('win')
    expect(rpsOutcome('scissors', 'paper')).toBe('win')
  })
})

describe('robotThrow', () => {
  it('always returns a valid choice', () => {
    for (let i = 0; i < 50; i++) expect(ALL).toContain(robotThrow())
  })
})

describe('BEATS / RPS_CHOICES', () => {
  it('every choice beats exactly one other and is itself a valid choice', () => {
    expect(RPS_CHOICES.map((c) => c.id).sort()).toEqual([...ALL].sort())
    for (const c of ALL) {
      expect(ALL).toContain(BEATS[c])
      expect(BEATS[c]).not.toBe(c)
    }
  })
})
