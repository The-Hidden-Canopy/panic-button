import type { Scenario, ScenarioPack, ValidationIssue } from '../types'

const MIN_DURATION = 15
const MAX_DURATION = 300
const MAX_SCENARIOS = 100
const MAX_ASSETS = 200
export const MAX_PACK_BYTES = 2_000_000
const forbiddenKeys = new Set(['script', 'command', 'exec', 'shell', 'url', 'filesystem', 'runtime'])
const externalUrlPattern = /(?:https?|ftp|file|javascript):\/\//i

const issue = (path: string, message: string, severity: ValidationIssue['severity'] = 'error'): ValidationIssue => ({ path, message, severity })

const scanForbiddenKeys = (value: unknown, path: string, issues: ValidationIssue[]) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, `${path}[${index}]`, issues))
    return
  }
  if (!value || typeof value !== 'object') return
  Object.entries(value).forEach(([key, nested]) => {
    if (forbiddenKeys.has(key.toLowerCase())) issues.push(issue(`${path}.${key}`, 'Executable or external resource fields are not allowed.'))
    if (typeof nested === 'string' && externalUrlPattern.test(nested)) issues.push(issue(`${path}.${key}`, 'External URLs are not allowed in offline scenario content.'))
    scanForbiddenKeys(nested, `${path}.${key}`, issues)
  })
}

export const validateScenario = (scenario: Scenario, path = 'scenario'): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  if (!scenario || typeof scenario !== 'object') return [issue(path, 'Scenario must be an object.')]
  if (typeof scenario.id !== 'string' || !scenario.id.trim()) issues.push(issue(`${path}.id`, 'Scenario id is required.'))
  if (typeof scenario.title !== 'string' || !scenario.title.trim()) issues.push(issue(`${path}.title`, 'Scenario title is required.'))
  if (typeof scenario.premise !== 'string' || !scenario.premise.trim()) issues.push(issue(`${path}.premise`, 'Scenario premise is required.'))
  if (typeof scenario.resolution !== 'string' || !scenario.resolution.trim()) issues.push(issue(`${path}.resolution`, 'Scenario resolution is required.'))
  if (!Number.isInteger(scenario.durationSeconds) || scenario.durationSeconds < MIN_DURATION || scenario.durationSeconds > MAX_DURATION) {
    issues.push(issue(`${path}.durationSeconds`, `Duration must be an integer from ${MIN_DURATION} to ${MAX_DURATION} seconds.`))
  }
  if (!Array.isArray(scenario.phases) || scenario.phases.length < 1 || scenario.phases.length > 12) issues.push(issue(`${path}.phases`, 'Provide between 1 and 12 phases.'))
  if (!Array.isArray(scenario.reports) || scenario.reports.length < 1 || scenario.reports.length > 50) issues.push(issue(`${path}.reports`, 'Provide between 1 and 50 situation reports.'))
  if (!Array.isArray(scenario.markers) || scenario.markers.length > 50) issues.push(issue(`${path}.markers`, 'Provide no more than 50 map markers.'))
  const reports = Array.isArray(scenario.reports) ? scenario.reports : []
  const phases = Array.isArray(scenario.phases) ? scenario.phases : []
  const markers = Array.isArray(scenario.markers) ? scenario.markers : []
  const reportIds = new Set(reports.filter((report) => report && typeof report === 'object').map((report) => report.id))
  let phaseTotal = 0
  for (const [index, phase] of phases.entries()) {
    const phasePath = `${path}.phases[${index}]`
    if (!phase || typeof phase !== 'object') {
      issues.push(issue(phasePath, 'Phase must be an object.'))
      continue
    }
    phaseTotal += phase.durationSeconds
    if (typeof phase.label !== 'string' || !phase.label.trim()) issues.push(issue(`${phasePath}.label`, 'Phase label is required.'))
    if (!Number.isInteger(phase.durationSeconds) || phase.durationSeconds < 1) issues.push(issue(`${phasePath}.durationSeconds`, 'Phase duration must be a positive integer.'))
    for (const reportId of (Array.isArray(phase.reportIds) ? phase.reportIds : [])) if (!reportIds.has(reportId)) issues.push(issue(`${phasePath}.reportIds`, `Unknown report id: ${reportId}.`))
  }
  if (phaseTotal !== scenario.durationSeconds) issues.push(issue(`${path}.phases`, `Phase durations must total ${scenario.durationSeconds} seconds; received ${phaseTotal}.`))
  for (const [index, marker] of markers.entries()) {
    if (!marker || typeof marker !== 'object') {
      issues.push(issue(`${path}.markers[${index}]`, 'Map marker must be an object.'))
      continue
    }
    if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y) || marker.x < 0 || marker.x > 100 || marker.y < 0 || marker.y > 100) issues.push(issue(`${path}.markers[${index}]`, 'Map marker coordinates must be between 0 and 100.'))
  }
  return issues
}

export const validatePack = (pack: ScenarioPack): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  if (!pack || typeof pack !== 'object') return [issue('pack', 'Pack must be an object.')]
  if (typeof pack.id !== 'string' || !pack.id.trim()) issues.push(issue('pack.id', 'Pack id is required.'))
  if (typeof pack.name !== 'string' || !pack.name.trim()) issues.push(issue('pack.name', 'Pack name is required.'))
  if (typeof pack.version !== 'string' || !pack.version.trim()) issues.push(issue('pack.version', 'Pack version is required.'))
  if (typeof pack.author !== 'string' || !pack.author.trim()) issues.push(issue('pack.author', 'Pack author is required.'))
  if (!Array.isArray(pack.scenarios) || pack.scenarios.length < 1 || pack.scenarios.length > MAX_SCENARIOS) issues.push(issue('pack.scenarios', `Provide between 1 and ${MAX_SCENARIOS} scenarios.`))
  if (!Array.isArray(pack.assets) || pack.assets.length > MAX_ASSETS) issues.push(issue('pack.assets', `Provide no more than ${MAX_ASSETS} assets.`))
  const scenarios = Array.isArray(pack.scenarios) ? pack.scenarios : []
  const assets = Array.isArray(pack.assets) ? pack.assets : []
  const ids = new Set<string>()
  for (const [index, scenario] of scenarios.entries()) {
    if (!scenario || typeof scenario !== 'object') {
      issues.push(issue(`pack.scenarios[${index}]`, 'Scenario must be an object.'))
      continue
    }
    if (ids.has(scenario.id)) issues.push(issue(`pack.scenarios[${index}].id`, `Duplicate scenario id: ${scenario.id}.`))
    ids.add(scenario.id)
    issues.push(...validateScenario(scenario, `pack.scenarios[${index}]`))
  }
  const assetIds = new Set<string>()
  for (const [index, asset] of assets.entries()) {
    if (!asset || typeof asset !== 'object') {
      issues.push(issue(`pack.assets[${index}]`, 'Asset must be an object.'))
      continue
    }
    const assetId = typeof asset.id === 'string' ? asset.id : ''
    const assetPath = typeof asset.path === 'string' ? asset.path : ''
    if (!assetId.trim() || !asset.kind || !assetPath.trim()) issues.push(issue(`pack.assets[${index}]`, 'Asset id, kind, and path are required.'))
    if (assetIds.has(assetId)) issues.push(issue(`pack.assets[${index}].id`, `Duplicate asset id: ${assetId}.`))
    assetIds.add(assetId)
    if (assetPath.includes('..') || assetPath.startsWith('/') || /^[A-Za-z]:/.test(assetPath)) issues.push(issue(`pack.assets[${index}].path`, 'Asset paths must be relative and cannot traverse directories.'))
    if (!Number.isInteger(asset.bytes) || asset.bytes < 0 || asset.bytes > 20_000_000) issues.push(issue(`pack.assets[${index}].bytes`, 'Asset must be no larger than 20 MB.'))
    if (asset.sha256 && !/^[a-f0-9]{64}$/i.test(asset.sha256)) issues.push(issue(`pack.assets[${index}].sha256`, 'Asset SHA-256 must be a 64-character hexadecimal digest.'))
  }
  scanForbiddenKeys(pack, 'pack', issues)
  return issues
}

export const parseScenarioPack = (text: string): { pack?: ScenarioPack; issues: ValidationIssue[] } => {
  try {
    const bytes = typeof TextEncoder === 'undefined' ? text.length : new TextEncoder().encode(text).byteLength
    if (bytes > MAX_PACK_BYTES) return { issues: [issue('pack', `Pack exceeds the ${MAX_PACK_BYTES.toLocaleString()} byte safety limit.`)] }
    const parsed = JSON.parse(text) as ScenarioPack
    const issues = validatePack(parsed)
    return issues.some((item) => item.severity === 'error') ? { issues } : { pack: parsed, issues }
  } catch (error) {
    return { issues: [issue('json', `Invalid JSON: ${error instanceof Error ? error.message : 'parse failed'}.`)] }
  }
}

export const packFromScenarios = (scenarios: Scenario[], name = 'Local Incident Pack'): ScenarioPack => ({
  id: `local-${Date.now()}`,
  name,
  version: '1.0.0',
  author: 'Local Operator',
  scenarios,
  assets: [],
})
