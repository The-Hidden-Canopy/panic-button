import type { ReplayRecord, Scenario, ScenarioPack, Settings } from '../types'

const SETTINGS_KEY = 'panic-button-settings'
const SCENARIO_KEY = 'panic-button-scenarios'
const REPLAY_KEY = 'panic-button-replays'

const read = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
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
  return write(REPLAY_KEY, [replay, ...replays].slice(0, 25))
}
export const loadReplays = () => read<ReplayRecord[]>(REPLAY_KEY, [])

export const downloadJson = (filename: string, value: ScenarioPack | ReplayRecord) => {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
