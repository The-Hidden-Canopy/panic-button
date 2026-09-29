import type { ReplayRecord, Scenario, ScenarioPack, Settings } from '../types'

const SETTINGS_KEY = 'panic-button-settings'
const SCENARIO_KEY = 'panic-button-scenarios'
const REPLAY_KEY = 'panic-button-replays'
const ACTIVE_RUN_KEY = 'panic-button-active-run'
const STORAGE_VERSION = 1
const MAX_REPLAYS = 25

type StoredEnvelope<T> = {
  version: number
  checksum: string
  value: T
}

export const checksum = (value: string): string => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const encodeStored = <T>(value: T): string => {
  const serialized = JSON.stringify(value)
  const envelope: StoredEnvelope<T> = { version: STORAGE_VERSION, checksum: checksum(serialized), value }
  return JSON.stringify(envelope)
}

export const decodeStored = <T>(raw: string | null): T | undefined => {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as StoredEnvelope<T>
    if (parsed?.version !== STORAGE_VERSION || typeof parsed.checksum !== 'string') return undefined
    const serialized = JSON.stringify(parsed.value)
    return checksum(serialized) === parsed.checksum ? parsed.value : undefined
  } catch {
    return undefined
  }
}

const read = <T>(key: string, fallback: T): T => {
  if (typeof localStorage === 'undefined') return fallback
  try {
    const primary = decodeStored<T>(localStorage.getItem(key))
    if (primary !== undefined) return primary
    const backup = decodeStored<T>(localStorage.getItem(`${key}.backup`))
    if (backup !== undefined) return backup

    const legacy = localStorage.getItem(key)
    if (legacy) {
      const parsed = JSON.parse(legacy) as T & { version?: unknown; checksum?: unknown }
      if (parsed && typeof parsed === 'object' && ('version' in parsed || 'checksum' in parsed)) return fallback
      write(key, parsed)
      return parsed as T
    }
    return fallback
  } catch {
    return fallback
  }
}

const write = (key: string, value: unknown) => {
  if (typeof localStorage === 'undefined') return false
  try {
    const current = localStorage.getItem(key)
    if (current) localStorage.setItem(`${key}.backup`, current)
    localStorage.setItem(key, encodeStored(value))
    return true
  } catch {
    return false
  }
}

export const loadSettings = <T extends Settings>(fallback: T): T => ({ ...fallback, ...read<Partial<T>>(SETTINGS_KEY, {}) })
export const saveSettings = (settings: Settings) => write(SETTINGS_KEY, settings)
export const loadScenarioDrafts = (): Scenario[] => read<Scenario[]>(SCENARIO_KEY, [])
export const saveScenarioDraft = (scenario: Scenario) => {
  const drafts = loadScenarioDrafts().filter((item) => item.id !== scenario.id)
  return write(SCENARIO_KEY, [...drafts, scenario])
}
export const saveReplay = (replay: ReplayRecord) => {
  const replays = read<ReplayRecord[]>(REPLAY_KEY, [])
  return write(REPLAY_KEY, [replay, ...replays.filter((item) => item.id !== replay.id)].slice(0, MAX_REPLAYS))
}
export const loadReplays = () => read<ReplayRecord[]>(REPLAY_KEY, [])
export const writeActiveRunMarker = (incident: Omit<ReplayRecord, 'id' | 'savedAt'>) => write(ACTIVE_RUN_KEY, incident)
export const loadActiveRunMarker = () => read<Omit<ReplayRecord, 'id' | 'savedAt'> | null>(ACTIVE_RUN_KEY, null)
export const clearActiveRunMarker = () => {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(ACTIVE_RUN_KEY)
  localStorage.removeItem(`${ACTIVE_RUN_KEY}.backup`)
}

export const downloadJson = (filename: string, value: ScenarioPack | ReplayRecord) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
