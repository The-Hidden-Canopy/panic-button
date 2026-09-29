export type Severity = 'LOW' | 'ELEVATED' | 'CRITICAL' | 'CATASTROPHIC'

export type IncidentPhase = {
  id: string
  label: string
  durationSeconds: number
  objective: string
  alerts: string[]
  reportIds: string[]
}

export type Resource = {
  id: string
  label: string
  value: number
  unit: string
  icon: string
  color: string
}

export type SituationReport = {
  id: string
  classification: string
  heading: string
  body: string
  recommendation: string
  confidence: number
}

export type MapMarker = {
  id: string
  label: string
  x: number
  y: number
  tone: 'alert' | 'unit' | 'neutral'
}

export type Scenario = {
  id: string
  title: string
  premise: string
  severity: Severity
  durationSeconds: number
  phases: IncidentPhase[]
  resources: Resource[]
  reports: SituationReport[]
  markers: MapMarker[]
  resolution: string
  accents: [string, string]
}

export type AssetManifest = {
  id: string
  kind: 'image' | 'audio' | 'font'
  path: string
  bytes: number
  sha256?: string
}

export type PackSignature = {
  algorithm: 'sha256'
  value: string
}

export type ScenarioPack = {
  id: string
  name: string
  version: string
  author: string
  scenarios: Scenario[]
  assets: AssetManifest[]
  signature?: PackSignature
}

export type ValidationIssue = {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export type TimelineEvent = {
  id: string
  time: string
  label: string
  detail: string
  tone: 'alert' | 'info' | 'success'
}

export type ActiveIncident = {
  scenario: Scenario
  startedAt: number
  elapsedSeconds: number
  phaseIndex: number
  events: TimelineEvent[]
  resolved: boolean
  exitReason?: 'AUTO_DISMISSED' | 'EMERGENCY_EXIT' | 'RESOLVED' | 'ERROR'
  endedAt?: number
}

export type ReplayRecord = ActiveIncident & {
  id: string
  savedAt: number
}

export type Settings = {
  triggerLabel: string
  durationSeconds: number
  soundEnabled: boolean
  reducedMotion: boolean
  alwaysOnTop: boolean
  autoStart: boolean
  cooldownSeconds: number
}
