import { describe, expect, it } from 'vitest'
import { scenarios } from '../data/scenarios'
import { MAX_PACK_BYTES, packFromScenarios, parseScenarioPack, validatePack } from './packValidator'

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

  it('rejects oversized pack text before parsing', () => {
    const result = parseScenarioPack('x'.repeat(MAX_PACK_BYTES + 1))
    expect(result.pack).toBeUndefined()
    expect(result.issues[0].message).toContain('safety limit')
  })

  it('rejects duplicate scenario and asset identifiers', () => {
    const base = scenarios[0]
    const pack = {
      ...packFromScenarios([base, { ...base }]),
      assets: [
        { id: 'map', kind: 'image' as const, path: 'map.png', bytes: 10 },
        { id: 'map', kind: 'image' as const, path: 'map-2.png', bytes: 10 },
      ],
    }
    const issues = validatePack(pack)
    expect(issues.some((item) => item.message.includes('Duplicate scenario id'))).toBe(true)
    expect(issues.some((item) => item.message.includes('Duplicate asset id'))).toBe(true)
  })

  it('rejects external URLs embedded in scenario content', () => {
    const pack = { ...packFromScenarios([{ ...scenarios[0], premise: 'Read https://example.invalid now.' }]) }
    const issues = validatePack(pack)
    expect(issues.some((item) => item.message.includes('External URLs'))).toBe(true)
  })
})
