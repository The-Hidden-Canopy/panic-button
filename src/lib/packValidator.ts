import { etc, verifyAsync } from '@noble/ed25519'
import type { PackAdmission, PackSigner, Scenario, ScenarioPack, TrustedSigner, ValidationIssue } from '../types'
import { validateScenarioGraph } from './deterministicRuntime'

const MIN_DURATION = 15
const MAX_DURATION = 300
const MAX_SCENARIOS = 100
const MAX_ASSETS = 200
export const MAX_PACK_BYTES = 2_000_000
const forbiddenKeys = new Set(['script', 'command', 'exec', 'shell', 'url', 'filesystem', 'runtime'])
const externalUrlPattern = /(?:https?|ftp|file|javascript):\/\//i
export const SCENARIO_PACK_SCHEMA_VERSION = 2
const CURRENT_APP_VERSION = '0.2.0'

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

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, canonicalize(nested)]))
}

export const canonicalPackPayload = (pack: ScenarioPack): string => {
  const unsigned = { ...pack, signature: undefined }
  return JSON.stringify(canonicalize(unsigned))
}

const hexDigest = (value: string, length: number) => new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(value)

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
  if (pack.schemaVersion !== undefined && pack.schemaVersion !== 1 && pack.schemaVersion !== SCENARIO_PACK_SCHEMA_VERSION) issues.push(issue('pack.schemaVersion', `Unsupported pack schema version: ${pack.schemaVersion}.`))
  if (pack.minAppVersion && typeof pack.minAppVersion === 'string') {
    const requiredMajor = Number.parseInt(pack.minAppVersion.split('.')[0], 10)
    const currentMajor = Number.parseInt(CURRENT_APP_VERSION.split('.')[0], 10)
    if (Number.isFinite(requiredMajor) && requiredMajor > currentMajor) issues.push(issue('pack.minAppVersion', `Pack requires a newer application version than ${CURRENT_APP_VERSION}.`))
  }
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
    issues.push(...validateScenarioGraph(scenario, `pack.scenarios[${index}]`))
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
  if (pack.signature) {
    if (pack.signature.algorithm === 'ed25519') {
      if (typeof pack.signature.publicKey !== 'string' || !hexDigest(pack.signature.publicKey, 64)) issues.push(issue('pack.signature.publicKey', 'Ed25519 public keys must be 32-byte hexadecimal values.'))
      if (typeof pack.signature.value !== 'string' || !hexDigest(pack.signature.value, 128)) issues.push(issue('pack.signature.value', 'Ed25519 signatures must be 64-byte hexadecimal values.'))
    } else if (pack.signature.algorithm === 'sha256') {
      if (typeof pack.signature.value !== 'string' || !hexDigest(pack.signature.value, 64)) issues.push(issue('pack.signature.value', 'SHA-256 signatures must be 32-byte hexadecimal values.'))
    } else {
      issues.push(issue('pack.signature.algorithm', 'Unsupported pack signature algorithm.'))
    }
  }
  if (pack.signer) {
    if (typeof pack.signer.fingerprint !== 'string' || !/^[a-f0-9]{16,128}$/i.test(pack.signer.fingerprint)) issues.push(issue('pack.signer.fingerprint', 'Signer fingerprints must be hexadecimal values.'))
    if (typeof pack.signer.displayName !== 'string' || !pack.signer.displayName.trim()) issues.push(issue('pack.signer.displayName', 'Signer display name is required.'))
    if (typeof pack.signer.publicKey !== 'string' || !hexDigest(pack.signer.publicKey, 64)) issues.push(issue('pack.signer.publicKey', 'Signer public keys must be 32-byte hexadecimal values.'))
    if (pack.signature?.algorithm === 'ed25519' && pack.signature.publicKey && pack.signer.publicKey.toLowerCase() !== pack.signature.publicKey.toLowerCase()) issues.push(issue('pack.signer.publicKey', 'Signer public key must match the Ed25519 signature key.'))
  }
  scanForbiddenKeys(pack, 'pack', issues)
  return issues
}

export const verifyPackSignature = async (pack: ScenarioPack): Promise<{ valid: boolean; unsigned: boolean; message?: string }> => {
  if (!pack.signature) return { valid: true, unsigned: true }
  try {
    const message = new TextEncoder().encode(canonicalPackPayload(pack))
    if (pack.signature.algorithm === 'sha256') {
      if (!globalThis.crypto?.subtle) return { valid: false, unsigned: false, message: 'This runtime does not provide SHA-256 verification.' }
      const digest = await globalThis.crypto.subtle.digest('SHA-256', message)
      const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
      return actual.toLowerCase() === pack.signature.value.toLowerCase() ? { valid: true, unsigned: false } : { valid: false, unsigned: false, message: 'Pack SHA-256 signature does not match its contents.' }
    }
    if (pack.signature.algorithm === 'ed25519' && pack.signature.publicKey) {
      const valid = await verifyAsync(etc.hexToBytes(pack.signature.value), message, etc.hexToBytes(pack.signature.publicKey))
      return valid ? { valid: true, unsigned: false } : { valid: false, unsigned: false, message: 'Pack Ed25519 signature could not be verified.' }
    }
    return { valid: false, unsigned: false, message: 'Pack signature is incomplete.' }
  } catch {
    return { valid: false, unsigned: false, message: 'Pack signature verification failed.' }
  }
}

export const packSignerFingerprint = async (publicKey: string) => {
  if (!globalThis.crypto?.subtle) return publicKey.toLowerCase()
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicKey.toLowerCase()))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const admitPack = async (pack: ScenarioPack, trustedSigners: TrustedSigner[] = []): Promise<PackAdmission> => {
  const signature = await verifyPackSignature(pack)
  if (!signature.valid) return { signatureValid: false, signerKnown: false, signerTrusted: false, state: 'INVALID', message: signature.message }
  if (signature.unsigned) return { signatureValid: true, signerKnown: false, signerTrusted: false, state: 'LOCAL_UNSIGNED', message: 'Unsigned local authoring pack.' }
  if (!pack.signer) return { signatureValid: true, signerKnown: false, signerTrusted: false, state: 'VALID_UNTRUSTED', message: 'Signature is valid, but no trusted signer identity is attached.' }
  const fingerprint = await packSignerFingerprint(pack.signer.publicKey)
  const signer = trustedSigners.find((item) => item.fingerprint.toLowerCase() === pack.signer?.fingerprint.toLowerCase() || item.publicKey.toLowerCase() === pack.signer?.publicKey.toLowerCase())
  const signerKnown = Boolean(signer)
  const signerTrusted = signer?.trustState === 'trusted'
  if (signer?.trustState === 'blocked') return { signatureValid: true, signerKnown, signerTrusted: false, state: 'BLOCKED', message: 'The pack signer is explicitly blocked.' }
  if (pack.signer.fingerprint.toLowerCase() !== fingerprint.slice(0, pack.signer.fingerprint.length).toLowerCase()) return { signatureValid: true, signerKnown, signerTrusted, state: 'VALID_UNTRUSTED', message: 'Signer fingerprint does not match the pack public key.' }
  return { signatureValid: true, signerKnown, signerTrusted, state: signerTrusted ? 'TRUSTED' : 'VALID_UNTRUSTED', message: signerTrusted ? undefined : 'Signature is valid but signer trust has not been granted.' }
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
  schemaVersion: SCENARIO_PACK_SCHEMA_VERSION,
  minAppVersion: CURRENT_APP_VERSION,
  scenarios,
  assets: [],
})
