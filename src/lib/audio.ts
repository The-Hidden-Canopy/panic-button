export type LocalCueKind = 'siren' | 'radio' | 'alert' | 'stinger'

const activeContexts = new Set<AudioContext>()

const frequencyFor = (kind: LocalCueKind) => kind === 'siren' ? 440 : kind === 'radio' ? 180 : kind === 'stinger' ? 740 : 520

export const playLocalCue = (kind: LocalCueKind, enabled: boolean, volume: number): boolean => {
  if (!enabled || typeof window === 'undefined' || typeof AudioContext === 'undefined') return false
  try {
    const context = new AudioContext()
    activeContexts.add(context)
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = kind === 'radio' ? 'square' : 'sawtooth'
    oscillator.frequency.setValueAtTime(frequencyFor(kind), context.currentTime)
    if (kind === 'siren') oscillator.frequency.linearRampToValueAtTime(880, context.currentTime + 0.18)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, Math.min(0.2, volume)), context.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.45)
    window.setTimeout(() => {
      activeContexts.delete(context)
      void context.close()
    }, 600)
    return true
  } catch {
    return false
  }
}

export const stopLocalCues = () => {
  for (const context of activeContexts) void context.close()
  activeContexts.clear()
}
