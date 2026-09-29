import { describe, expect, it } from 'vitest'
import { createIncident, getPhaseIndex, scaleScenarioDuration } from './incidentEngine'
import { scenarios } from '../data/scenarios'

describe('incident engine', () => {
  it('creates a safe incident with an opening event', () => {
    const incident = createIncident(scenarios[0], 123)
    expect(incident.startedAt).toBe(123)
    expect(incident.resolved).toBe(false)
    expect(incident.events[0].label).toBe('INCIDENT OPENED')
  })

  it('selects the correct phase at boundaries', () => {
    const scenario = scenarios[0]
    expect(getPhaseIndex(scenario, 0)).toBe(0)
    expect(getPhaseIndex(scenario, scenario.phases[0].durationSeconds)).toBe(1)
    expect(getPhaseIndex(scenario, scenario.durationSeconds)).toBe(scenario.phases.length - 1)
  })

  it('scales phases while preserving the requested total duration', () => {
    const scaled = scaleScenarioDuration(scenarios[0], 45)
    expect(scaled.durationSeconds).toBe(45)
    expect(scaled.phases.reduce((sum, phase) => sum + phase.durationSeconds, 0)).toBe(45)
    expect(scaled.phases.every((phase) => phase.durationSeconds > 0)).toBe(true)
  })
})
