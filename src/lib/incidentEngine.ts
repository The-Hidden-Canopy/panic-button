import type { ActiveIncident, Scenario, TimelineEvent } from '../types'

const pad = (value: number) => value.toString().padStart(2, '0')

export const formatDuration = (seconds: number) => `${pad(Math.floor(seconds / 60))}:${pad(Math.max(0, seconds % 60))}`

export const makeEvent = (elapsedSeconds: number, label: string, detail: string, tone: TimelineEvent['tone']): TimelineEvent => ({
  id: `${elapsedSeconds}-${label}`,
  time: formatDuration(elapsedSeconds),
  label,
  detail,
  tone,
})

export const createIncident = (scenario: Scenario, now = Date.now()): ActiveIncident => ({
  scenario,
  startedAt: now,
  elapsedSeconds: 0,
  phaseIndex: 0,
  resolved: false,
  events: [makeEvent(0, 'INCIDENT OPENED', scenario.premise, 'alert')],
})

export const getPhaseIndex = (scenario: Scenario, elapsedSeconds: number) => {
  let total = 0
  for (let index = 0; index < scenario.phases.length; index += 1) {
    total += scenario.phases[index].durationSeconds
    if (elapsedSeconds < total) return index
  }
  return scenario.phases.length - 1
}

export const phaseStart = (scenario: Scenario, phaseIndex: number) => scenario.phases.slice(0, phaseIndex).reduce((sum, phase) => sum + phase.durationSeconds, 0)
