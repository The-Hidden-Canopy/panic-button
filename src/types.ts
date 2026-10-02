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
  minimum?: number
  maximum?: number
  presentation?: string
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
  schemaVersion?: 1 | 2
  seedPolicy?: 'deterministic'
  nodes?: ScenarioNode[]
  actions?: ScenarioAction[]
  resourceBounds?: Record<string, { min: number; max: number }>
  initialState?: {
    flags?: Record<string, boolean | string | number>
  }
  maxScheduledEvents?: number
  resolutionRules?: Array<{ id: string; when?: ScenarioCondition; text: string }>
  presentationProfile?: PresentationProfile
}

export type PresentationProfile = {
  maxFlashEventsPerMinute?: number
  maxAlertsPerMinute?: number
  reducedMotionSafe?: boolean
  captionsRequired?: boolean
}

export type ScenarioNodeType = 'PHASE' | 'WAIT' | 'ALERT' | 'REPORT' | 'RESOURCE_MUTATION' | 'MARKER_MUTATION' | 'CHOICE' | 'CONDITION' | 'RANDOM_CHOICE' | 'OBJECTIVE' | 'TERMINAL'

export type ScenarioCondition =
  | { kind: 'resource_gte' | 'resource_lte'; resourceId: string; value: number }
  | { kind: 'flag_equals'; flag: string; value: boolean | string | number }
  | { kind: 'action_seen'; actionId: string }
  | { kind: 'objective_complete'; objectiveId: string }
  | { kind: 'time_gte'; milliseconds: number }
  | { kind: 'random_bucket'; stream: string; bucket: number }

export type ScenarioNode = {
  id: string
  type: ScenarioNodeType
  label?: string
  objective?: string
  durationMs?: number
  next?: string[]
  reportId?: string
  alert?: string
  resourceId?: string
  delta?: number
  markerId?: string
  marker?: Partial<MapMarker>
  actionIds?: string[]
  condition?: ScenarioCondition
  branches?: Array<{ when?: ScenarioCondition; next: string }>
  maxVisits?: number
}

export type ScenarioAction = {
  id: string
  label: string
  kind: 'ACKNOWLEDGE_ALERT' | 'DEPLOY_RESOURCE' | 'MOVE_RESOURCE' | 'REQUEST_REPORT' | 'SELECT_RESPONSE' | 'PIN_MARKER' | 'ABORT_INCIDENT'
  resourceId?: string
  amount?: number
  markerId?: string
  targetNodeId?: string
  enabled?: boolean
  consequence?: {
    delayMs: number
    resourceId?: string
    delta?: number
    flag?: string
    value?: boolean | string | number
  }
}

export type AssetManifest = {
  id: string
  kind: 'image' | 'audio' | 'font'
  path: string
  bytes: number
  sha256?: string
}

export type PackSignature = {
  algorithm: 'sha256' | 'ed25519'
  value: string
  publicKey?: string
}

export type PackSigner = {
  fingerprint: string
  displayName: string
  publicKey: string
}

export type PackTrustState = 'TRUSTED' | 'LOCAL_UNSIGNED' | 'VALID_UNTRUSTED' | 'BLOCKED' | 'INVALID'

export type TrustedSigner = PackSigner & { trustState: 'trusted' | 'local' | 'blocked' | 'unknown' }

export type PackAdmission = {
  signatureValid: boolean
  signerKnown: boolean
  signerTrusted: boolean
  state: PackTrustState
  message?: string
}

export type PackInstallState = 'STAGED' | 'INSTALLED' | 'RETIRED'

export type PackRecord = {
  pack: ScenarioPack
  digest: string
  admission: PackAdmission
  state: PackInstallState
  stagedAt: number
  installedAt?: number
}

export type ScenarioPack = {
  id: string
  name: string
  version: string
  author: string
  schemaVersion?: number
  minAppVersion?: string
  scenarios: Scenario[]
  assets: AssetManifest[]
  signature?: PackSignature
  signer?: PackSigner
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
  seed?: string
  scenarioDigest?: string
  journal?: IncidentEvent[]
  runtimeState?: IncidentRuntimeState
  summary?: IncidentSummary
  replayInput?: IncidentReplayInput
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
  mirrorSecondary: boolean
}

export type IncidentLifecycle = 'IDLE' | 'ARMING' | 'ACTIVE' | 'RESOLVING' | 'SUMMARY' | 'ABORTED' | 'RECOVERING' | 'CORRUPT'

export type IncidentEventType =
  | 'IncidentOpened'
  | 'ScenarioBound'
  | 'PhaseEntered'
  | 'AlertRaised'
  | 'ReportPublished'
  | 'ResourceAdjusted'
  | 'MarkerCreated'
  | 'MarkerMoved'
  | 'MarkerRemoved'
  | 'OperatorActionProposed'
  | 'OperatorActionCommitted'
  | 'ConsequenceScheduled'
  | 'ConsequenceApplied'
  | 'ObjectiveSatisfied'
  | 'BranchSelected'
  | 'CountdownUpdated'
  | 'IncidentResolved'
  | 'IncidentAborted'
  | 'IncidentRecovered'
  | 'SummaryPublished'

export type IncidentEvent = {
  sequence: number
  incidentId: string
  simulationTimeMs: number
  wallTimeMs: number
  type: IncidentEventType
  payload: Record<string, unknown>
  previousDigest: string
  eventDigest: string
}

export type RuntimeResource = Resource & { min: number; max: number }

export type RuntimeMarker = MapMarker & { visible: boolean }

export type IncidentRuntimeState = {
  incidentId: string
  scenarioId: string
  scenarioVersion: string
  scenarioDigest: string
  seed: string
  lifecycle: IncidentLifecycle
  simulationTimeMs: number
  phaseIndex: number
  currentNodeId?: string
  phases: string[]
  resources: RuntimeResource[]
  markers: RuntimeMarker[]
  reports: SituationReport[]
  alerts: string[]
  objectives: Record<string, boolean>
  flags: Record<string, boolean | string | number>
  actionsSeen: string[]
  pendingConsequences: Array<{ id: string; dueAtMs: number; actionId: string; delta?: number; resourceId?: string }>
  visitCounts: Record<string, number>
  contradictionCount: number
}

export type IncidentRuntime = {
  state: IncidentRuntimeState
  journal: IncidentEvent[]
}

export type IncidentActionInput = {
  kind: ScenarioAction['kind']
  actionId: string
  amount?: number
  resourceId?: string
  markerId?: string
  targetNodeId?: string
}

export type IncidentReplayInput = {
  packDigest: string
  scenarioId: string
  scenarioVersion: string
  seed: string
  actions: Array<IncidentActionInput & { atMs: number }>
  settingsProjection: { durationSeconds: number; reducedMotion: boolean; soundEnabled: boolean }
}

export type IncidentSummary = {
  incidentId: string
  exitReason: 'RESOLVED' | 'AUTO_DISMISSED' | 'EMERGENCY_EXIT' | 'ERROR'
  durationMs: number
  alertsRaised: number
  reportsPublished: number
  resourcesDeployed: number
  branchesSelected: number
  actionsCommitted: number
  confidenceReversals: number
  unnecessaryEscalations: number
  journalDigest: string
  finalStateDigest: string
}
