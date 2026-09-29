import type { Scenario, ScenarioPack, ValidationIssue } from '../types'

const MIN_DURATION = 15
const MAX_DURATION = 300
const MAX_SCENARIOS = 100
const MAX_ASSETS = 200
const forbiddenKeys = new Set(['script', 'command', 'exec', 'shell', 'url', 'filesystem', 'runtime'])

const issue = (path: string, message: string, severity: ValidationIssue['severity'] = 'error'): ValidationIssue => ({ path, message, severity })

const scanForbiddenKeys = (value: unknown, path: string, issues: ValidationIssue[]) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenKeys(item, `${path}[${index}]`, issues))
    return
  }
  if (!value || typeof value !== 'object') return
  Object.entries(value).forEach(([key, nested]) => {
    if (forbiddenKeys.has(key.toLowerCase())) issues.push(issue(`${path}.${key}`, 'Executable or external resource fields are not allowed.'))
    scanForbiddenKeys(nested, `${path}.${key}`, issues)
  })
}

export const validateScenario = (scenario: Scenario, path = 'scenario'): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  if (!scenario || typeof scenario !== 'object') return [issue(path, 'Scenario must be an object.')]
  if (!scenario.id?.trim()) issues.push(issue(`${path}.id`, 'Scenario id is required.'))
  if (!scenario.title?.trim()) issues.push(issue(`${path}.title`, 'Scenario title is required.'))
  if (!scenario.premise?.trim()) issues.push(issue(`${path}.premise`, 'Scenario premise is required.'))
  if (!scenario.resolution?.trim()) issues.push(issue(`${path}.resolution`, 'Scenario resolution is required.'))
  if (!Number.isInteger(scenario.durationSeconds) || scenario.durationSeconds < MIN_DURATION || scenario.durationSeconds > MAX_DURATION) {
    issues.push(issue(`${path}.durationSeconds`, `Duration must be an integer from ${MIN_DURATION} to ${MAX_DURATION} seconds.`))
  }
  if (!Array.isArray(scenario.phases) || scenario.phases.length < 1 || scenario.phases.length > 12) issues.push(issue(`${path}.phases`, 'Provide between 1 and 12 phases.'))
  if (!Array.isArray(scenario.reports) || scenario.reports.length < 1 || scenario.reports.length > 50) issues.push(issue(`${path}.reports`, 'Provide between 1 and 50 situation reports.'))
  if (!Array.isArray(scenario.markers) || scenario.markers.length > 50) issues.push(issue(`${path}.markers`, 'Provide no more than 50 map markers.'))
  const reportIds = new Set((scenario.reports ?? []).map((report) => report.id))
  let phaseTotal = 0
  for (const [index, phase] of (scenario.phases ?? []).entries()) {
    const phasePath = `${path}.phases[${index}]`
    phaseTotal += phase.durationSeconds
    if (!phase.label?.trim()) issues.push(issue(`${phasePath}.label`, 'Phase label is required.'))
    if (!Number.isInteger(phase.durationSeconds) || phase.durationSeconds < 1) issues.push(issue(`${phasePath}.durationSeconds`, 'Phase duration must be a positive integer.'))
    for (const reportId of phase.reportIds ?? []) if (!reportIds.has(reportId)) issues.push(issue(`${phasePath}.reportIds`, `Unknown report id: ${reportId}.`))
  }
  if (phaseTotal !== scenario.durationSeconds) issues.push(issue(`${path}.phases`, `Phase durations must total ${scenario.durationSeconds} seconds; received ${phaseTotal}.`))
  for (const [index, marker] of (scenario.markers ?? []).entries()) {
    if (marker.x < 0 || marker.x > 100 || marker.y < 0 || marker.y > 100) issues.push(issue(`${path}.markers[${index}]`, 'Map marker coordinates must be between 0 and 100.'))
  }
  return issues
}

export const validatePack = (pack: ScenarioPack): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  if (!pack || typeof pack !== 'object') return [issue('pack', 'Pack must be an object.')]
  if (!pack.id?.trim()) issues.push(issue('pack.id', 'Pack id is required.'))
  if (!pack.name?.trim()) issues.push(issue('pack.name', 'Pack name is required.'))
  if (!pack.version?.trim()) issues.push(issue('pack.version', 'Pack version is required.'))
  if (!pack.author?.trim()) issues.push(issue('pack.author', 'Pack author is required.'))
  if (!Array.isArray(pack.scenarios) || pack.scenarios.length < 1 || pack.scenarios.length > MAX_SCENARIOS) issues.push(issue('pack.scenarios', `Provide between 1 and ${MAX_SCENARIOS} scenarios.`))
  if (!Array.isArray(pack.assets) || pack.assets.length > MAX_ASSETS) issues.push(issue('pack.assets', `Provide no more than ${MAX_ASSETS} assets.`))
  const ids = new Set<string>()
  for (const [index, scenario] of (pack.scenarios ?? []).entries()) {
    if (ids.has(scenario.id)) issues.push(issue(`pack.scenarios[${index}].id`, `Duplicate scenario id: ${scenario.id}.`))
    ids.add(scenario.id)
    issues.push(...validateScenario(scenario, `pack.scenarios[${index}]`))
  }
  for (const [index, asset] of (pack.assets ?? []).entries()) {
    if (!asset.id?.trim() || !asset.kind || !asset.path?.trim()) issues.push(issue(`pack.assets[${index}]`, 'Asset id, kind, and path are required.'))
    if (asset.path.includes('..') || asset.path.startsWith('/') || /^[A-Za-z]:/.test(asset.path)) issues.push(issue(`pack.assets[${index}].path`, 'Asset paths must be relative and cannot traverse directories.'))
    if (!Number.isInteger(asset.bytes) || asset.bytes < 0 || asset.bytes > 20_000_000) issues.push(issue(`pack.assets[${index}].bytes`, 'Asset must be no larger than 20 MB.'))
  }
  scanForbiddenKeys(pack, 'pack', issues)
  return issues
}

export const parseScenarioPack = (text: string): { pack?: ScenarioPack; issues: ValidationIssue[] } => {
  try {
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
