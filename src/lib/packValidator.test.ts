import { describe, expect, it } from 'vitest'
import { scenarios } from '../data/scenarios'
import { packFromScenarios, parseScenarioPack, validatePack } from './packValidator'

describe('scenario-pack validator', () => {
  it('accepts every built-in scenario', () => {
    const issues = validatePack(packFromScenarios(scenarios, 'Built-in Incidents'))
    expect(issues.filter((item) => item.severity === 'error')).toEqual([])
    expect(scenarios).toHaveLength(10)
  })

  it('rejects executable content', () => {
    const result = parseScenarioPack(JSON.stringify({ ...packFromScenarios([scenarios[0]]), script: 'alert(1)' }))
    expect(result.pack).toBeUndefined()
    expect(result.issues.some((item) => item.path === 'pack.script')).toBe(true)
  })

  it('rejects unsafe asset traversal', () => {
    const pack = { ...packFromScenarios([scenarios[0]]), assets: [{ id: 'map', kind: 'image' as const, path: '../map.png', bytes: 10 }] }
    const issues = validatePack(pack)
    expect(issues.some((item) => item.path.endsWith('.path'))).toBe(true)
  })
})
