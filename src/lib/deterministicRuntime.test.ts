import { describe, expect, it } from 'vitest'
import { scenarios } from '../data/scenarios'
import {
  abortIncidentRuntime,
  advanceIncidentRuntime,
  createIncidentPackage,
  createSeed,
  dispatchIncidentAction,
  isRuntimeCorrupt,
  migrateScenarioToV2,
  openIncidentRuntime,
  replayInputFor,
  replayRuntime,
  projectActiveIncident,
  verifyIncidentPackage,
  validateScenarioGraph,
  verifyReplay,
} from './deterministicRuntime'

describe('deterministic incident runtime', () => {
  it('migrates v1 phases into a bounded terminal graph', () => {
    const scenario = migrateScenarioToV2(scenarios[0])
    expect(scenario.schemaVersion).toBe(2)
    expect(scenario.nodes?.at(-1)?.type).toBe('TERMINAL')
    expect(validateScenarioGraph(scenario).filter((issue) => issue.severity === 'error')).toEqual([])
  })

  it('writes a journal-first lifecycle and deterministic digest chain', () => {
    const runtime = openIncidentRuntime(scenarios[0], 'seed-alpha', 100)
    expect(runtime.state.lifecycle).toBe('ACTIVE')
    expect(runtime.journal[0].type).toBe('IncidentOpened')
    expect(runtime.journal[0].previousDigest).toBe('GENESIS')
    expect(runtime.journal.every((event, index) => event.sequence === index + 1)).toBe(true)
    expect(advanceIncidentRuntime(runtime, scenarios[0], 23_000).state.phaseIndex).toBe(1)
  })

  it('clamps operator resource changes and records proposed/committed actions', () => {
    const scenario = { ...migrateScenarioToV2(scenarios[0]), actions: [{ id: 'deploy-napkins', label: 'Deploy napkins', kind: 'DEPLOY_RESOURCE' as const, resourceId: 'r3', amount: 999 }] }
    const runtime = dispatchIncidentAction(openIncidentRuntime(scenario, 'seed-actions'), scenario, { actionId: 'deploy-napkins', kind: 'DEPLOY_RESOURCE' }, 1_000, 1_000)
    expect(runtime.journal.some((event) => event.type === 'OperatorActionProposed')).toBe(true)
    expect(runtime.journal.some((event) => event.type === 'OperatorActionCommitted')).toBe(true)
    expect(runtime.state.resources.find((resource) => resource.id === 'r3')?.value).toBeLessThanOrEqual(runtime.state.resources.find((resource) => resource.id === 'r3')?.max ?? 0)
  })

  it('recovers through an explicit abort event', () => {
    const runtime = openIncidentRuntime(scenarios[0], 'seed-recovery')
    const aborted = abortIncidentRuntime(runtime, 'process_interruption', 55)
    expect(aborted.state.lifecycle).toBe('ABORTED')
    expect(aborted.journal.at(-1)?.payload.reason).toBe('process_interruption')
  })

  it('replays identical input into identical journal and state digests', () => {
    const scenario = migrateScenarioToV2(scenarios[0])
    const input = replayInputFor(scenario, createSeed(scenario.id, 1234), { durationSeconds: 90, reducedMotion: false, soundEnabled: false }, [])
    const verification = verifyReplay(scenario, input)
    expect(verification.identical).toBe(true)
    expect(replayRuntime(scenario, input).journal).toEqual(verification.first.journal)
  })

  it('detects a tampered journal instead of replaying it', () => {
    const runtime = openIncidentRuntime(scenarios[0], 'seed-tamper')
    const tampered = { ...runtime, journal: runtime.journal.map((event, index) => index === 1 ? { ...event, payload: { ...event.payload, seed: 'tampered' } } : event) }
    expect(isRuntimeCorrupt(tampered)).toBe(true)
  })

  it('takes the operator branch when a closed response action is committed', () => {
    const scenario = migrateScenarioToV2(scenarios[0])
    const runtime = openIncidentRuntime(scenario, 'seed-branch')
    const withAction = dispatchIncidentAction(runtime, scenario, { actionId: 'hold-line', kind: 'SELECT_RESPONSE' }, 1_000)
    const resolved = advanceIncidentRuntime(withAction, scenario, scenario.durationSeconds * 1_000)
    expect(resolved.journal.some((event) => event.type === 'BranchSelected' && event.payload.nextNodeId === 'stabilized')).toBe(true)
  })

  it('exports a self-contained incident package that can be verified and reconstructed', () => {
    const scenario = migrateScenarioToV2(scenarios[0])
    const runtime = advanceIncidentRuntime(openIncidentRuntime(scenario, 'seed-package'), scenario, scenario.durationSeconds * 1000, 0)
    const incident = projectActiveIncident(runtime, scenario, 0)
    const pack = createIncidentPackage(incident)
    expect(verifyIncidentPackage(pack)).toMatchObject({ valid: true, corrupt: false, replayable: true })
    expect(verifyIncidentPackage({ ...pack, hashes: { ...pack.hashes, journal: 'tampered' } })).toMatchObject({ valid: false, corrupt: true })
  })
})
