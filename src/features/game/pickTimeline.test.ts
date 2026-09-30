import { describe, expect, it } from 'vitest'
import { ROLL_IN } from '@skrobot/animations'
import { ROBOTS, buildBag, trickSetWeight } from '@/features/robots'
import { TRICK_BY_ID, defaultRoutedTrickPool } from '@/features/tricks'
import { chooseRobotTrick, robotSetOptions } from './engine'
import { NAME_GONE, PICK_GO, PICK_LOCK, REEL_START, pickHead, planPickReel, reelPosition } from './pickTimeline'

const POOL = defaultRoutedTrickPool().pool

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Every robot's turn, fresh and with its three favorite sets already burned. */
function* turns() {
  for (const robot of ROBOTS) {
    const bag = buildBag(robot, POOL)
    const favorites = robotSetOptions(bag, [], TRICK_BY_ID, robot)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3)
      .map((o) => o.trick.id)
    for (const used of [[], favorites]) {
      for (let seed = 1; seed <= 6; seed++) {
        const random = seeded(seed)
        const pick = chooseRobotTrick(bag, used, TRICK_BY_ID, robot, random, trickSetWeight)
        if (!pick) continue
        const options = robotSetOptions(bag, used, TRICK_BY_ID, robot)
        yield { robot, used, options, pick, plan: planPickReel(options, pick, random) }
      }
    }
  }
}

describe('pick reel', () => {
  it('lands on the engine’s pick and settles there', () => {
    for (const { pick, plan } of turns()) {
      expect(plan.rows[plan.pickRow]).toBe(pick)
      for (let t = PICK_LOCK; t < NAME_GONE; t += 0.01) {
        expect(Math.round(reelPosition(t))).toBe(plan.pickRow)
      }
      expect(reelPosition(PICK_LOCK + 1)).toBeCloseTo(plan.pickRow, 3)
      // A name after the pick, so the overshoot never shows an empty row.
      expect(plan.rows[plan.pickRow + 1]).toBeDefined()
    }
  })

  it('only shows tricks the robot could set right now', () => {
    for (const { used, options, plan } of turns()) {
      const settable = new Set(options.map((o) => o.trick.id))
      for (const row of plan.rows) {
        expect(settable.has(row.id)).toBe(true)
        expect(used).not.toContain(row.id)
      }
    }
  })

  it('never repeats a name back to back', () => {
    for (const { options, plan } of turns()) {
      if (options.length < 2) continue
      for (let i = 1; i < plan.rows.length; i++) expect(plan.rows[i].id).not.toBe(plan.rows[i - 1].id)
    }
  })

  it('alternates the final two settable tricks through the pick, for either draw order', () => {
    const options = POOL.slice(0, 2).map((trick) => ({ trick, weight: 1 }))
    for (const { trick: pick } of options) {
      for (const random of [() => 0, () => 0.9]) {
        const plan = planPickReel(options, pick, random)
        expect(plan.rows[plan.pickRow]).toBe(pick)
        for (let i = 1; i < plan.rows.length; i++) {
          expect(plan.rows[i].id).not.toBe(plan.rows[i - 1].id)
        }
      }
    }
  })

  it('keeps a one-trick or empty reel populated with its known pick', () => {
    const pick = POOL[0]
    for (const options of [[], [{ trick: pick, weight: 1 }]]) {
      const plan = planPickReel(options, pick)
      expect(plan.rows.every((trick) => trick === pick)).toBe(true)
      expect(plan.rows[plan.pickRow + 1]).toBe(pick)
    }
  })

  it('only runs forward, reaching the pick with speed right at the lock', () => {
    let last = reelPosition(REEL_START)
    for (let t = REEL_START + 0.005; t < PICK_LOCK; t += 0.005) {
      const p = reelPosition(t)
      expect(p).toBeGreaterThan(last)
      last = p
    }
    const { pickRow } = planPickReel([], { id: 'x', name: 'X', base: 'Ollie', stance: 'regular', category: 'flatground', baseDifficulty: 1, difficulty: 1 })
    // The pick only reaches the center in the last beat before the lock.
    expect(Math.round(reelPosition(PICK_LOCK - 0.2))).toBeLessThan(pickRow)
    expect(reelPosition(PICK_LOCK + 0.03)).toBeGreaterThan(pickRow)
  })

  it('ticks once per name, faster than readable at first and slow at the end', () => {
    const [{ plan }] = turns()
    expect(plan.ticks).toHaveLength(plan.pickRow)
    expect(plan.ticks.at(-1)).toBeLessThan(PICK_LOCK)
    const gaps = plan.ticks.slice(1).map((t, i) => t - plan.ticks[i])
    expect(gaps[0]).toBeLessThan(0.05)
    expect(gaps.filter((g) => g > 0.1).length).toBeGreaterThanOrEqual(4)
  })

  it('calls it before the trick starts, and the head is back before the pop', () => {
    expect(PICK_GO - PICK_LOCK).toBeCloseTo(0.3, 6)
    expect(NAME_GONE).toBeLessThan(PICK_GO + ROLL_IN)
    const [{ plan }] = turns()
    expect(pickHead(PICK_LOCK - 0.5, plan)!.pitch).toBeGreaterThan(10)
    expect(pickHead(PICK_LOCK + 0.1, plan)!.expression).toBe('happy')
    expect(pickHead(PICK_GO + ROLL_IN, plan)).toBeNull()
    // Settles continuously: nothing left to snap when the pose hands back.
    const settle = pickHead(PICK_LOCK + 0.499, plan)!
    expect(Math.abs(settle.pitch) + Math.abs(settle.roll)).toBeLessThan(0.05)
  })
})
