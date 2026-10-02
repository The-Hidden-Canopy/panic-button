import { describe, expect, it } from 'vitest'
import { scenarios } from '../data/scenarios'
import { advanceIncidentRuntime, openIncidentRuntime, replayInputFor, replayRuntime, validateScenarioGraph } from './deterministicRuntime'

describe('deterministic runtime fuzz and failure gates', () => {
  it('does not throw while validating bounded malformed graph fixtures', () => {
    for (let index = 0; index < 250; index += 1) {
      const base = scenarios[index % scenarios.length]
      const target = index % 3 === 0 ? `missing-${index}` : index % 3 === 1 ? 'fixture' : `node-${index}`
      const fixture = { ...base, id: `fuzz-${index}`, nodes: [{ id: 'fixture', type: index % 2 ? 'WAIT' : 'CHOICE', durationMs: index * 1_000, next: [target], branches: [{ next: target }] }] } as never
      expect(() => validateScenarioGraph(fixture)).not.toThrow()
    }
  })

  it('never moves virtual simulation time backward', () => {
    const scenario = scenarios[0]
    const runtime = openIncidentRuntime(scenario, 'seed-clock')
    const later = advanceIncidentRuntime(runtime, scenario, 30_000, 0)
    const earlier = advanceIncidentRuntime(later, scenario, 2_000, 0)
    expect(earlier.state.simulationTimeMs).toBeGreaterThanOrEqual(later.state.simulationTimeMs)
  })

  it('normalizes same-time action ordering for replay', () => {
    const scenario = scenarios[0]
    const input = replayInputFor(scenario, 'seed-actions', { durationSeconds: scenario.durationSeconds, reducedMotion: false, soundEnabled: false }, [
      { actionId: 'hold-line', kind: 'SELECT_RESPONSE', atMs: 10_000 },
      { actionId: 'authorize-tea', kind: 'SELECT_RESPONSE', atMs: 10_000 },
    ])
    const reversed = { ...input, actions: [...input.actions].reverse() }
    expect(replayRuntime(scenario, input).journal).toEqual(replayRuntime(scenario, reversed).journal)
  })
})
