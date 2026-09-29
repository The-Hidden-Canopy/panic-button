import { describe, expect, it } from 'vitest'
import { createTriggerGuard } from './triggerGuard'

describe('trigger guard', () => {
  it('debounces duplicate presses and blocks active incidents', () => {
    const guard = createTriggerGuard(800)
    expect(guard.tryAccept(1_000, false)).toBe(true)
    expect(guard.tryAccept(1_500, false)).toBe(false)
    expect(guard.tryAccept(1_801, true)).toBe(false)
    expect(guard.tryAccept(1_801, false)).toBe(true)
  })

  it('enforces the configured post-incident cooldown', () => {
    const guard = createTriggerGuard()
    expect(guard.tryAccept(1_000, false)).toBe(true)
    guard.startCooldown(1_000, 5_000)
    expect(guard.cooldownRemaining(5_999)).toBe(1)
    expect(guard.tryAccept(5_999, false)).toBe(false)
    expect(guard.tryAccept(6_000, false)).toBe(true)
  })
})
