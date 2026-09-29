export const DEFAULT_TRIGGER_DEBOUNCE_MS = 800

export const createTriggerGuard = (debounceMs = DEFAULT_TRIGGER_DEBOUNCE_MS) => {
  let lastAcceptedAt = Number.NEGATIVE_INFINITY
  let cooldownUntil = Number.NEGATIVE_INFINITY

  return {
    tryAccept(now: number, incidentActive: boolean) {
      if (incidentActive || now - lastAcceptedAt < debounceMs || now < cooldownUntil) return false
      lastAcceptedAt = now
      return true
    },
    startCooldown(now: number, durationMs: number) {
      cooldownUntil = Math.max(cooldownUntil, now + Math.max(0, durationMs))
    },
    cooldownRemaining(now: number) {
      return Math.max(0, cooldownUntil - now)
    },
  }
}
