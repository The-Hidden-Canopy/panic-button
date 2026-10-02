import type {
  ActiveIncident,
  IncidentActionInput,
  IncidentEvent,
  IncidentEventType,
  IncidentPackage,
  IncidentReplayInput,
  IncidentRuntime,
  IncidentRuntimeState,
  IncidentSummary,
  ReplayVerification,
  MapMarker,
  RuntimeMarker,
  Scenario,
  ScenarioAction,
  ScenarioCondition,
  ScenarioNode,
  SituationReport,
  TimelineEvent,
  ValidationIssue,
} from '../types'

const MAX_EVENTS = 4_000

export const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonicalize(nested)]))
}

export const canonicalJson = (value: unknown) => JSON.stringify(canonicalize(value))

export const deterministicDigest = (value: unknown): string => {
  const text = typeof value === 'string' ? value : canonicalJson(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const safeDurationMs = (scenario: Scenario) => Math.max(15_000, Math.min(300_000, scenario.durationSeconds * 1_000))

export const scenarioDigest = (scenario: Scenario) => deterministicDigest({
  id: scenario.id,
  version: scenario.schemaVersion ?? 1,
  title: scenario.title,
  phases: scenario.phases,
  resources: scenario.resources,
  reports: scenario.reports,
  markers: scenario.markers,
  nodes: scenario.nodes,
  actions: scenario.actions,
  initialState: scenario.initialState,
  resourceBounds: scenario.resourceBounds,
  resolutionRules: scenario.resolutionRules,
  presentationProfile: scenario.presentationProfile,
})

export const createSeed = (scenarioId: string, startedAt: number) => deterministicDigest(`${scenarioId}:${startedAt}`)

export type SeededRandom = {
  next: () => number
  int: (maximumExclusive: number) => number
  bucket: (maximumExclusive: number) => number
}

const seedNumber = (seed: string, stream: string) => Number.parseInt(deterministicDigest(`${seed}:${stream}`), 16) >>> 0

export const createSeededRandom = (seed: string, stream = 'default'): SeededRandom => {
  let state = seedNumber(seed, stream) || 0x6d2b79f5
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (maximumExclusive) => maximumExclusive <= 0 ? 0 : Math.floor(next() * maximumExclusive),
    bucket: (maximumExclusive) => maximumExclusive <= 0 ? 0 : Math.min(maximumExclusive - 1, Math.floor(next() * maximumExclusive)),
  }
}

export const migrateScenarioToV2 = (scenario: Scenario): Scenario => {
  if (scenario.nodes?.length) return { ...scenario, schemaVersion: 2, seedPolicy: 'deterministic' }
  const nodes: ScenarioNode[] = []
  scenario.phases.forEach((phase, index) => {
    nodes.push({
      id: phase.id,
      type: 'PHASE',
      label: phase.label,
      objective: phase.objective,
      durationMs: phase.durationSeconds * 1_000,
      next: [scenario.phases[index + 1]?.id ?? 'terminal'],
    })
  })
  nodes.push({ id: 'terminal', type: 'TERMINAL', label: 'STABILIZED' })
  return { ...scenario, schemaVersion: 2, seedPolicy: 'deterministic', nodes }
}

const conditionMatches = (condition: ScenarioCondition | undefined, state: IncidentRuntimeState, random: SeededRandom) => {
  if (!condition) return true
  switch (condition.kind) {
    case 'resource_gte': return (state.resources.find((item) => item.id === condition.resourceId)?.value ?? 0) >= condition.value
    case 'resource_lte': return (state.resources.find((item) => item.id === condition.resourceId)?.value ?? 0) <= condition.value
    case 'flag_equals': return state.flags[condition.flag] === condition.value
    case 'action_seen': return state.actionsSeen.includes(condition.actionId)
    case 'objective_complete': return Boolean(state.objectives[condition.objectiveId])
    case 'time_gte': return state.simulationTimeMs >= condition.milliseconds
    case 'random_bucket': return random.bucket(100) === Math.max(0, Math.min(99, condition.bucket))
  }
}

export const validateScenarioGraph = (scenario: Scenario, path = 'scenario'): ValidationIssue[] => {
  const issues: ValidationIssue[] = []
  const migrated = migrateScenarioToV2(scenario)
  const nodes = migrated.nodes ?? []
  const validNodeTypes = new Set(['PHASE', 'WAIT', 'ALERT', 'REPORT', 'RESOURCE_MUTATION', 'MARKER_MUTATION', 'CHOICE', 'CONDITION', 'RANDOM_CHOICE', 'OBJECTIVE', 'TERMINAL'])
  const validConditionKinds = new Set(['resource_gte', 'resource_lte', 'flag_equals', 'action_seen', 'objective_complete', 'time_gte', 'random_bucket'])
  const validActionKinds = new Set(['ACKNOWLEDGE_ALERT', 'DEPLOY_RESOURCE', 'MOVE_RESOURCE', 'REQUEST_REPORT', 'SELECT_RESPONSE', 'PIN_MARKER', 'ABORT_INCIDENT'])
  const ids = new Set<string>()
  let edges = 0
  for (const [index, node] of nodes.entries()) {
    const nodePath = `${path}.nodes[${index}]`
    if (ids.has(node.id)) issues.push({ path: `${nodePath}.id`, message: `Duplicate node id: ${node.id}.`, severity: 'error' })
    ids.add(node.id)
    if (!node.id.trim()) issues.push({ path: `${nodePath}.id`, message: 'Node id is required.', severity: 'error' })
    if (!validNodeTypes.has(node.type)) issues.push({ path: `${nodePath}.type`, message: `Unsupported node type: ${String(node.type)}.`, severity: 'error' })
    if (node.durationMs !== undefined && (!Number.isInteger(node.durationMs) || node.durationMs < 0 || node.durationMs > 300_000)) issues.push({ path: `${nodePath}.durationMs`, message: 'Node duration must be an integer from 0 to 300000 milliseconds.', severity: 'error' })
    if (node.maxVisits !== undefined && (!Number.isInteger(node.maxVisits) || node.maxVisits < 1 || node.maxVisits > 16)) issues.push({ path: `${nodePath}.maxVisits`, message: 'Bounded loop counts must be integers from 1 to 16.', severity: 'error' })
    for (const target of node.next ?? []) edges += 1, void target
    for (const branch of node.branches ?? []) edges += 1, void branch
    const conditions = [node.condition, ...(node.branches ?? []).map((branch) => branch.when)].filter(Boolean)
    for (const condition of conditions) {
      if (!validConditionKinds.has(String(condition?.kind))) issues.push({ path: `${nodePath}.condition`, message: `Unsupported condition kind: ${String(condition?.kind)}.`, severity: 'error' })
      if (condition?.kind === 'random_bucket' && (!Number.isInteger(condition.bucket) || condition.bucket < 0 || condition.bucket > 99)) issues.push({ path: `${nodePath}.condition.bucket`, message: 'Random buckets must be integers from 0 to 99.', severity: 'error' })
      if ((condition?.kind === 'resource_gte' || condition?.kind === 'resource_lte') && !migrated.resources.some((resource) => resource.id === condition.resourceId)) issues.push({ path: `${nodePath}.condition.resourceId`, message: `Unknown resource id: ${condition.resourceId}.`, severity: 'error' })
      if (condition?.kind === 'action_seen' && !(migrated.actions ?? []).some((action) => action.id === condition.actionId)) issues.push({ path: `${nodePath}.condition.actionId`, message: `Unknown action id: ${condition.actionId}.`, severity: 'error' })
    }
  }
  if (nodes.length > 128) issues.push({ path: `${path}.nodes`, message: 'Scenario graphs may contain no more than 128 nodes.', severity: 'error' })
  if (edges > 256) issues.push({ path: `${path}.nodes`, message: 'Scenario graphs may contain no more than 256 edges.', severity: 'error' })
  const byId = new Map(nodes.map((node) => [node.id, node]))
  for (const node of nodes) {
    for (const target of [...(node.next ?? []), ...(node.branches ?? []).map((branch) => branch.next)]) {
      if (!byId.has(target)) issues.push({ path: `${path}.nodes.${node.id}`, message: `Dangling graph edge to ${target}.`, severity: 'error' })
    }
  }
  const start = nodes[0]?.id
  const reachable = new Set<string>()
  const queue = start ? [start] : []
  while (queue.length) {
    const current = queue.shift() as string
    if (reachable.has(current)) continue
    reachable.add(current)
    const node = byId.get(current)
    if (node) queue.push(...(node.next ?? []), ...(node.branches ?? []).map((branch) => branch.next))
  }
  for (const node of nodes) if (!reachable.has(node.id)) issues.push({ path: `${path}.nodes.${node.id}`, message: 'Node is unreachable from the graph start.', severity: 'error' })
  if (!nodes.some((node) => node.type === 'TERMINAL')) issues.push({ path: `${path}.nodes`, message: 'Scenario graph requires a terminal node.', severity: 'error' })
  const outgoing = new Map(nodes.map((node) => [node.id, [...(node.next ?? []), ...(node.branches ?? []).map((branch) => branch.next)]]))
  const terminalIds = new Set(nodes.filter((node) => node.type === 'TERMINAL').map((node) => node.id))
  const canReachTerminal = (startId: string, seen = new Set<string>()): boolean => {
    if (terminalIds.has(startId)) return true
    if (seen.has(startId)) return false
    const nextSeen = new Set(seen).add(startId)
    return (outgoing.get(startId) ?? []).some((target) => canReachTerminal(target, nextSeen))
  }
  for (const node of nodes) if (!canReachTerminal(node.id)) issues.push({ path: `${path}.nodes.${node.id}`, message: 'Node cannot reach a terminal without an unbounded cycle.', severity: 'error' })
  const visitPath = (nodeId: string, stack: string[]) => {
    if (stack.includes(nodeId)) {
      const node = byId.get(nodeId)
      if (!node?.maxVisits) issues.push({ path: `${path}.nodes.${nodeId}`, message: 'Cycles require an explicit bounded maxVisits value.', severity: 'error' })
      return
    }
    for (const target of outgoing.get(nodeId) ?? []) visitPath(target, [...stack, nodeId])
  }
  if (nodes[0]) visitPath(nodes[0].id, [])
  for (const action of migrated.actions ?? []) {
    if (!action.id || !action.label || !action.kind) issues.push({ path: `${path}.actions`, message: 'Actions require id, label, and a closed action kind.', severity: 'error' })
    if (!validActionKinds.has(action.kind)) issues.push({ path: `${path}.actions.${action.id}.kind`, message: `Unsupported action kind: ${String(action.kind)}.`, severity: 'error' })
    if (action.amount !== undefined && (!Number.isFinite(action.amount) || Math.abs(action.amount) > 100_000)) issues.push({ path: `${path}.actions.${action.id}`, message: 'Action amounts must be finite and bounded.', severity: 'error' })
    if (action.targetNodeId && !byId.has(action.targetNodeId)) issues.push({ path: `${path}.actions.${action.id}.targetNodeId`, message: `Unknown target node id: ${action.targetNodeId}.`, severity: 'error' })
    if (action.consequence && (!Number.isInteger(action.consequence.delayMs) || action.consequence.delayMs < 0 || action.consequence.delayMs > 300_000)) issues.push({ path: `${path}.actions.${action.id}.consequence.delayMs`, message: 'Consequence delay must be an integer from 0 to 300000 milliseconds.', severity: 'error' })
  }
  const maxScheduledEvents = migrated.maxScheduledEvents ?? 512
  if (!Number.isInteger(maxScheduledEvents) || maxScheduledEvents < 1 || maxScheduledEvents > 4_000) issues.push({ path: `${path}.maxScheduledEvents`, message: 'Maximum scheduled events must be an integer from 1 to 4000.', severity: 'error' })
  for (const resource of migrated.resources) {
    const bounds = migrated.resourceBounds?.[resource.id]
    const minimum = bounds?.min ?? resource.minimum ?? 0
    const maximum = bounds?.max ?? resource.maximum ?? Math.max(resource.value + 10, resource.value * 4)
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum || resource.value < minimum || resource.value > maximum) issues.push({ path: `${path}.resources.${resource.id}`, message: 'Resource initial value and bounds must be finite and ordered.', severity: 'error' })
  }
  const flashLimit = migrated.presentationProfile?.maxFlashEventsPerMinute
  if (flashLimit !== undefined && (!Number.isInteger(flashLimit) || flashLimit < 0 || flashLimit > 60)) issues.push({ path: `${path}.presentationProfile.maxFlashEventsPerMinute`, message: 'Flash event limits must be integers from 0 to 60 per minute.', severity: 'error' })
  return issues
}

const initialState = (scenario: Scenario, seed: string, incidentId: string): IncidentRuntimeState => ({
  incidentId,
  scenarioId: scenario.id,
  scenarioVersion: String(scenario.schemaVersion ?? 1),
  scenarioDigest: scenarioDigest(scenario),
  seed,
  lifecycle: 'IDLE',
  simulationTimeMs: 0,
  phaseIndex: 0,
  currentNodeId: undefined,
  phases: scenario.phases.map((phase) => phase.id),
  resources: scenario.resources.map((resource) => ({ ...resource, min: scenario.resourceBounds?.[resource.id]?.min ?? resource.minimum ?? 0, max: scenario.resourceBounds?.[resource.id]?.max ?? resource.maximum ?? Math.max(resource.value + 10, resource.value * 4) })),
  markers: [],
  reports: [],
  alerts: [],
  objectives: {},
  flags: { ...(scenario.initialState?.flags ?? {}) },
  actionsSeen: [],
  pendingConsequences: [],
  visitCounts: {},
  contradictionCount: 0,
})

const cloneState = (state: IncidentRuntimeState): IncidentRuntimeState => ({
  ...state,
  resources: state.resources.map((item) => ({ ...item })),
  markers: state.markers.map((item) => ({ ...item })),
  reports: state.reports.map((item) => ({ ...item })),
  alerts: [...state.alerts],
  phases: [...state.phases],
  objectives: { ...state.objectives },
  flags: { ...state.flags },
  actionsSeen: [...state.actionsSeen],
  pendingConsequences: state.pendingConsequences.map((item) => ({ ...item })),
  visitCounts: { ...state.visitCounts },
})

export const reduceIncidentState = (previous: IncidentRuntimeState, event: IncidentEvent): IncidentRuntimeState => {
  const state = cloneState(previous)
  state.simulationTimeMs = Math.max(state.simulationTimeMs, event.simulationTimeMs)
  const payload = event.payload
  switch (event.type) {
    case 'IncidentOpened': state.lifecycle = 'ARMING'; break
    case 'ScenarioBound': state.scenarioId = String(payload.scenarioId ?? state.scenarioId); state.scenarioVersion = String(payload.scenarioVersion ?? state.scenarioVersion); state.scenarioDigest = String(payload.scenarioDigest ?? state.scenarioDigest); state.seed = String(payload.seed ?? state.seed); break
    case 'PhaseEntered': state.lifecycle = 'ACTIVE'; state.phaseIndex = Number(payload.phaseIndex ?? state.phaseIndex); state.currentNodeId = typeof payload.nodeId === 'string' ? payload.nodeId : state.phases[state.phaseIndex]; state.visitCounts[state.currentNodeId ?? ''] = (state.visitCounts[state.currentNodeId ?? ''] ?? 0) + 1; break
    case 'AlertRaised': state.alerts.push(String(payload.text ?? '')); break
    case 'ReportPublished': {
      const report = payload.report as SituationReport | undefined
      if (report) { if (state.reports.some((item) => item.id === report.id)) state.contradictionCount += 1; state.reports.push({ ...report }) }
      break
    }
    case 'ResourceAdjusted': {
      const resource = state.resources.find((item) => item.id === payload.resourceId)
      if (resource) resource.value = Math.max(resource.min, Math.min(resource.max, resource.value + Number(payload.delta ?? 0)))
      break
    }
    case 'MarkerCreated': {
      const marker = payload.marker as RuntimeMarker | undefined
      if (marker && !state.markers.some((item) => item.id === marker.id)) state.markers.push({ ...marker, visible: true })
      break
    }
    case 'MarkerMoved': {
      const marker = state.markers.find((item) => item.id === payload.markerId)
      if (marker) { marker.x = Number(payload.x ?? marker.x); marker.y = Number(payload.y ?? marker.y) }
      break
    }
    case 'MarkerRemoved': { const marker = state.markers.find((item) => item.id === payload.markerId); if (marker) marker.visible = false; break }
    case 'OperatorActionCommitted': { const id = String(payload.actionId ?? ''); if (id && !state.actionsSeen.includes(id)) state.actionsSeen.push(id); break }
    case 'ConsequenceScheduled': state.pendingConsequences.push({ id: String(payload.id), dueAtMs: Number(payload.dueAtMs), actionId: String(payload.actionId), resourceId: typeof payload.resourceId === 'string' ? payload.resourceId : undefined, delta: payload.delta === undefined ? undefined : Number(payload.delta) }); break
    case 'ConsequenceApplied': state.pendingConsequences = state.pendingConsequences.filter((item) => item.id !== payload.id); break
    case 'ObjectiveSatisfied': state.objectives[String(payload.objectiveId)] = true; break
    case 'BranchSelected': state.flags[`branch:${String(payload.nodeId)}`] = String(payload.nextNodeId); break
    case 'IncidentResolved': state.lifecycle = 'RESOLVING'; break
    case 'IncidentAborted': state.lifecycle = 'ABORTED'; break
    case 'IncidentRecovered': state.lifecycle = 'RECOVERING'; break
    case 'SummaryPublished': state.lifecycle = 'SUMMARY'; break
    case 'CountdownUpdated': break
  }
  return state
}

const append = (runtime: IncidentRuntime, type: IncidentEventType, payload: Record<string, unknown>, simulationTimeMs: number, wallTimeMs: number): IncidentRuntime => {
  if (runtime.journal.length >= MAX_EVENTS) throw new Error('Incident event limit exceeded.')
  const previousDigest = runtime.journal.at(-1)?.eventDigest ?? 'GENESIS'
  const eventBase = { sequence: runtime.journal.length + 1, incidentId: runtime.state.incidentId, simulationTimeMs, wallTimeMs, type, payload, previousDigest }
  const event: IncidentEvent = { ...eventBase, eventDigest: deterministicDigest(eventBase) }
  return { state: reduceIncidentState(runtime.state, event), journal: [...runtime.journal, event] }
}

export const openIncidentRuntime = (scenarioInput: Scenario, seed = createSeed(scenarioInput.id, Date.now()), wallTimeMs = Date.now()): IncidentRuntime => {
  const scenario = migrateScenarioToV2(scenarioInput)
  const incidentId = `incident-${deterministicDigest(`${scenario.id}:${seed}`)}`
  let runtime: IncidentRuntime = { state: initialState(scenario, seed, incidentId), journal: [] }
  runtime = append(runtime, 'IncidentOpened', { scenarioId: scenario.id }, 0, wallTimeMs)
  runtime = append(runtime, 'ScenarioBound', { scenarioId: scenario.id, scenarioVersion: String(scenario.schemaVersion ?? 2), scenarioDigest: scenarioDigest(scenario), seed }, 0, wallTimeMs)
  runtime = append(runtime, 'PhaseEntered', { phaseIndex: 0, nodeId: scenario.phases[0]?.id }, 0, wallTimeMs)
  for (const resource of runtime.state.resources) runtime = append(runtime, 'ResourceAdjusted', { resourceId: resource.id, delta: 0, reason: 'initial-allocation' }, 0, wallTimeMs)
  for (const marker of scenario.markers) runtime = append(runtime, 'MarkerCreated', { marker: { ...marker, visible: true } }, 0, wallTimeMs)
  for (const reportId of scenario.phases[0]?.reportIds ?? []) { const report = scenario.reports.find((item) => item.id === reportId); if (report) runtime = append(runtime, 'ReportPublished', { report }, 0, wallTimeMs) }
  for (const alert of scenario.phases[0]?.alerts ?? []) runtime = append(runtime, 'AlertRaised', { text: alert }, 0, wallTimeMs)
  return runtime
}

const phaseAt = (scenario: Scenario, simulationTimeMs: number) => {
  let elapsed = 0
  for (let index = 0; index < scenario.phases.length; index += 1) { elapsed += scenario.phases[index].durationSeconds * 1_000; if (simulationTimeMs < elapsed) return index }
  return scenario.phases.length - 1
}

const chooseBranch = (runtime: IncidentRuntime, scenario: Scenario, node: ScenarioNode, simulationTimeMs: number) => {
  const random = createSeededRandom(runtime.state.seed, `branch:${node.id}`)
  const conditional = (node.branches ?? []).filter((branch) => branch.when && conditionMatches(branch.when, runtime.state, random))
  if (conditional.length) return conditional[0].next
  const defaults = (node.branches ?? []).filter((branch) => !branch.when)
  if (defaults.length) return defaults[random.int(defaults.length)].next
  return node.next?.[0]
}

export const advanceIncidentRuntime = (runtimeInput: IncidentRuntime, scenarioInput: Scenario, simulationTimeMs: number, wallTimeMs = Date.now()): IncidentRuntime => {
  let runtime = runtimeInput
  const scenario = migrateScenarioToV2(scenarioInput)
  const target = Math.max(runtime.state.simulationTimeMs, Math.min(safeDurationMs(scenario), Math.floor(simulationTimeMs)))
  const fromPhase = runtime.state.phaseIndex
  const targetPhase = phaseAt(scenario, target)
  for (let phaseIndex = fromPhase + 1; phaseIndex <= targetPhase; phaseIndex += 1) {
    const phase = scenario.phases[phaseIndex]
    if (!phase) continue
    const node = scenario.nodes?.find((item) => item.id === phase.id)
    runtime = append(runtime, 'PhaseEntered', { phaseIndex, nodeId: phase.id }, target, wallTimeMs)
    for (const alert of phase.alerts) runtime = append(runtime, 'AlertRaised', { text: alert }, target, wallTimeMs)
    for (const reportId of phase.reportIds) { const report = scenario.reports.find((item) => item.id === reportId); if (report) runtime = append(runtime, 'ReportPublished', { report }, target, wallTimeMs) }
    if (node?.type === 'CHOICE') { const nextNodeId = chooseBranch(runtime, scenario, node, target); if (nextNodeId) runtime = append(runtime, 'BranchSelected', { nodeId: node.id, nextNodeId }, target, wallTimeMs) }
  }
  for (const consequence of [...runtime.state.pendingConsequences].filter((item) => item.dueAtMs <= target)) {
    runtime = append(runtime, 'ConsequenceApplied', { id: consequence.id, actionId: consequence.actionId }, target, wallTimeMs)
    if (consequence.resourceId && consequence.delta !== undefined) runtime = append(runtime, 'ResourceAdjusted', { resourceId: consequence.resourceId, delta: consequence.delta, reason: `consequence:${consequence.actionId}` }, target, wallTimeMs)
  }
  runtime = append(runtime, 'CountdownUpdated', { remainingMs: Math.max(0, safeDurationMs(scenario) - target) }, target, wallTimeMs)
  if (target >= safeDurationMs(scenario) && runtime.state.lifecycle !== 'SUMMARY' && runtime.state.lifecycle !== 'ABORTED') {
    runtime = append(runtime, 'IncidentResolved', { reason: 'AUTO_DISMISSED' }, target, wallTimeMs)
    runtime = append(runtime, 'SummaryPublished', { reason: 'AUTO_DISMISSED' }, target, wallTimeMs)
  }
  return runtime
}

export const dispatchIncidentAction = (runtimeInput: IncidentRuntime, scenarioInput: Scenario, input: IncidentActionInput, simulationTimeMs: number, wallTimeMs = Date.now()): IncidentRuntime => {
  const scenario = migrateScenarioToV2(scenarioInput)
  const action = (scenario.actions ?? []).find((item) => item.id === input.actionId && (item.enabled ?? true))
  if (!action || runtimeInput.state.lifecycle === 'ABORTED' || runtimeInput.state.lifecycle === 'SUMMARY') return runtimeInput
  let runtime = append(runtimeInput, 'OperatorActionProposed', { actionId: action.id, kind: action.kind }, simulationTimeMs, wallTimeMs)
  if (action.kind === 'ABORT_INCIDENT') return append(runtime, 'IncidentAborted', { reason: 'EMERGENCY_EXIT', actionId: action.id }, simulationTimeMs, wallTimeMs)
  runtime = append(runtime, 'OperatorActionCommitted', { actionId: action.id, kind: action.kind }, simulationTimeMs, wallTimeMs)
  if (action.kind === 'DEPLOY_RESOURCE' || input.resourceId) {
    const resourceId = input.resourceId ?? action.resourceId
    const delta = input.amount ?? action.amount ?? 1
    if (resourceId) runtime = append(runtime, 'ResourceAdjusted', { resourceId, delta, reason: `operator:${action.id}` }, simulationTimeMs, wallTimeMs)
  }
  if (action.kind === 'PIN_MARKER' && (input.markerId ?? action.markerId)) runtime = append(runtime, 'MarkerMoved', { markerId: input.markerId ?? action.markerId, x: 50, y: 50 }, simulationTimeMs, wallTimeMs)
  if (action.targetNodeId) runtime = append(runtime, 'BranchSelected', { nodeId: runtime.state.currentNodeId ?? 'operator', nextNodeId: action.targetNodeId }, simulationTimeMs, wallTimeMs)
  if (action.amount && action.resourceId && action.kind !== 'DEPLOY_RESOURCE') runtime = append(runtime, 'ConsequenceScheduled', { id: `consequence-${action.id}-${runtime.journal.length}`, actionId: action.id, dueAtMs: simulationTimeMs + 2_000, resourceId: action.resourceId, delta: action.amount }, simulationTimeMs, wallTimeMs)
  return runtime
}

export const abortIncidentRuntime = (runtime: IncidentRuntime, reason: string, wallTimeMs = Date.now()): IncidentRuntime => runtime.state.lifecycle === 'ABORTED' || runtime.state.lifecycle === 'SUMMARY' ? runtime : append(runtime, 'IncidentAborted', { reason }, runtime.state.simulationTimeMs, wallTimeMs)

export const recoverIncidentRuntime = (runtime: IncidentRuntime, wallTimeMs = Date.now()): IncidentRuntime => {
  if (runtime.state.lifecycle === 'ACTIVE' || runtime.state.lifecycle === 'ARMING' || runtime.state.lifecycle === 'RECOVERING') {
    const recovered = append(runtime, 'IncidentRecovered', { reason: 'process_interruption' }, runtime.state.simulationTimeMs, wallTimeMs)
    return append(recovered, 'IncidentAborted', { reason: 'process_interruption' }, runtime.state.simulationTimeMs, wallTimeMs)
  }
  return runtime
}

const eventToTimeline = (event: IncidentEvent): TimelineEvent => {
  const seconds = Math.floor(event.simulationTimeMs / 1_000)
  const time = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
  const labels: Record<IncidentEventType, string> = { IncidentOpened: 'INCIDENT OPENED', ScenarioBound: 'SCENARIO BOUND', PhaseEntered: 'PHASE ENTERED', AlertRaised: 'ALERT RAISED', ReportPublished: 'SITUATION REPORT', ResourceAdjusted: 'RESOURCE UPDATE', MarkerCreated: 'MARKER CREATED', MarkerMoved: 'MARKER MOVED', MarkerRemoved: 'MARKER REMOVED', OperatorActionProposed: 'ACTION PROPOSED', OperatorActionCommitted: 'ACTION COMMITTED', ConsequenceScheduled: 'CONSEQUENCE SCHEDULED', ConsequenceApplied: 'CONSEQUENCE APPLIED', ObjectiveSatisfied: 'OBJECTIVE SATISFIED', BranchSelected: 'BRANCH SELECTED', CountdownUpdated: 'COUNTDOWN', IncidentResolved: 'INCIDENT RESOLVED', IncidentAborted: 'INCIDENT ABORTED', IncidentRecovered: 'RECOVERY MARKER', SummaryPublished: 'SUMMARY PUBLISHED' }
  const tone: TimelineEvent['tone'] = event.type.includes('Aborted') || event.type.includes('Alert') ? 'alert' : event.type.includes('Resolved') || event.type.includes('Summary') ? 'success' : 'info'
  return { id: `${event.sequence}-${event.eventDigest}`, time, label: labels[event.type], detail: String(event.payload.text ?? event.payload.reason ?? event.payload.actionId ?? event.payload.nodeId ?? event.type), tone }
}

export const projectActiveIncident = (runtime: IncidentRuntime, scenario: Scenario, startedAt: number, exitReason?: ActiveIncident['exitReason']): ActiveIncident => ({
  scenario,
  startedAt,
  elapsedSeconds: Math.floor(runtime.state.simulationTimeMs / 1_000),
  phaseIndex: runtime.state.phaseIndex,
  events: runtime.journal.map(eventToTimeline),
  resolved: runtime.state.lifecycle === 'SUMMARY' || runtime.state.lifecycle === 'ABORTED',
  exitReason: exitReason ?? (runtime.state.lifecycle === 'ABORTED' ? 'EMERGENCY_EXIT' : runtime.state.lifecycle === 'SUMMARY' ? 'AUTO_DISMISSED' : undefined),
  endedAt: runtime.state.lifecycle === 'SUMMARY' || runtime.state.lifecycle === 'ABORTED' ? Date.now() : undefined,
  seed: runtime.state.seed,
  scenarioDigest: runtime.state.scenarioDigest,
  journal: runtime.journal,
  runtimeState: runtime.state,
  summary: deriveIncidentSummary(runtime, exitReason ?? (runtime.state.lifecycle === 'ABORTED' ? 'EMERGENCY_EXIT' : runtime.state.lifecycle === 'SUMMARY' ? 'AUTO_DISMISSED' : 'RESOLVED')),
  replayInput: replayInputFor(scenario, runtime.state.seed, { durationSeconds: scenario.durationSeconds, reducedMotion: false, soundEnabled: false }, runtime.journal.filter((event) => event.type === 'OperatorActionCommitted').map((event) => ({ actionId: String(event.payload.actionId), kind: String(event.payload.kind) as IncidentActionInput['kind'], atMs: event.simulationTimeMs }))),
})

export const runtimeStateDigest = (state: IncidentRuntimeState) => deterministicDigest(state)

export const reconstructRuntime = (scenarioInput: Scenario, seed: string, journal: IncidentEvent[]): IncidentRuntime => {
  const scenario = migrateScenarioToV2(scenarioInput)
  const incidentId = journal[0]?.incidentId ?? `incident-${deterministicDigest(`${scenario.id}:${seed}`)}`
  let state = initialState(scenario, seed, incidentId)
  for (const event of journal) state = reduceIncidentState(state, event)
  return { state, journal: [...journal] }
}

export const deriveIncidentSummary = (runtime: IncidentRuntime, exitReason: IncidentSummary['exitReason']): IncidentSummary => ({
  incidentId: runtime.state.incidentId,
  exitReason,
  durationMs: runtime.state.simulationTimeMs,
  alertsRaised: runtime.journal.filter((event) => event.type === 'AlertRaised').length,
  reportsPublished: runtime.journal.filter((event) => event.type === 'ReportPublished').length,
  resourcesDeployed: runtime.journal.filter((event) => event.type === 'ResourceAdjusted' && event.payload.reason !== 'initial-allocation').length,
  branchesSelected: runtime.journal.filter((event) => event.type === 'BranchSelected').length,
  actionsCommitted: runtime.journal.filter((event) => event.type === 'OperatorActionCommitted').length,
  confidenceReversals: runtime.state.contradictionCount,
  unnecessaryEscalations: Math.max(0, runtime.journal.filter((event) => event.type === 'AlertRaised').length - runtime.state.phases.length),
  journalDigest: runtime.journal.at(-1)?.eventDigest ?? 'GENESIS',
  finalStateDigest: runtimeStateDigest(runtime.state),
})

export const replayRuntime = (scenarioInput: Scenario, input: IncidentReplayInput): IncidentRuntime => {
  const scenario = migrateScenarioToV2(scenarioInput)
  let runtime = openIncidentRuntime(scenario, input.seed, 0)
  for (const action of [...input.actions].sort((a, b) => a.atMs - b.atMs || a.actionId.localeCompare(b.actionId))) {
    runtime = advanceIncidentRuntime(runtime, scenario, action.atMs, 0)
    runtime = dispatchIncidentAction(runtime, scenario, action, action.atMs, 0)
  }
  return advanceIncidentRuntime(runtime, scenario, input.settingsProjection.durationSeconds * 1_000, 0)
}

export const verifyReplay = (scenario: Scenario, input: IncidentReplayInput) => {
  const first = replayRuntime(scenario, input)
  const second = replayRuntime(scenario, input)
  const firstDigest = first.journal.at(-1)?.eventDigest ?? 'GENESIS'
  const secondDigest = second.journal.at(-1)?.eventDigest ?? 'GENESIS'
  return { identical: firstDigest === secondDigest && runtimeStateDigest(first.state) === runtimeStateDigest(second.state), first, second, journalDigest: firstDigest, finalStateDigest: runtimeStateDigest(first.state) }
}

export const replayInputFor = (scenario: Scenario, seed: string, settingsProjection: IncidentReplayInput['settingsProjection'], actions: IncidentReplayInput['actions'] = []): IncidentReplayInput => ({ packDigest: scenarioDigest(scenario), scenarioId: scenario.id, scenarioVersion: String(scenario.schemaVersion ?? 2), seed, actions, settingsProjection })

export const isRuntimeCorrupt = (runtime: IncidentRuntime) => runtime.journal.some((event, index) => event.sequence !== index + 1 || event.previousDigest !== (index ? runtime.journal[index - 1].eventDigest : 'GENESIS') || event.eventDigest !== deterministicDigest({ sequence: event.sequence, incidentId: event.incidentId, simulationTimeMs: event.simulationTimeMs, wallTimeMs: event.wallTimeMs, type: event.type, payload: event.payload, previousDigest: event.previousDigest }))

export const createIncidentPackage = (incident: ActiveIncident, signerState: IncidentPackage['manifest']['signerState'] = 'LOCAL_UNSIGNED', appBuildId = '0.3.0'): IncidentPackage => {
  const scenario = migrateScenarioToV2(incident.scenario)
  const journal = incident.journal ?? []
  const runtime = incident.runtimeState ? { state: incident.runtimeState, journal } : reconstructRuntime(scenario, incident.seed ?? createSeed(scenario.id, incident.startedAt), journal)
  const summary = incident.summary ?? deriveIncidentSummary(runtime, incident.exitReason === 'ERROR' ? 'ERROR' : incident.exitReason ?? 'RESOLVED')
  const replayInput = incident.replayInput ?? replayInputFor(scenario, runtime.state.seed, { durationSeconds: scenario.durationSeconds, reducedMotion: false, soundEnabled: false })
  const manifest: IncidentPackage['manifest'] = { formatVersion: 1, appBuildId, incidentId: runtime.state.incidentId, scenarioId: scenario.id, scenarioDigest: scenarioDigest(scenario), completionStatus: summary.exitReason, signerState, externalAssetsPresent: false, journalDigest: summary.journalDigest, finalStateDigest: summary.finalStateDigest }
  const hashes = { manifest: deterministicDigest(manifest), scenarioSnapshot: deterministicDigest(scenario), journal: deterministicDigest(journal), summary: deterministicDigest(summary), replayInput: deterministicDigest(replayInput) }
  return { manifest, scenarioSnapshot: scenario, journal, summary, replayInput, hashes }
}

export const verifyIncidentPackage = (pack: IncidentPackage): ReplayVerification => {
  try {
    if (pack.manifest.formatVersion !== 1) return { valid: false, corrupt: true, replayable: false, message: 'Unsupported incident package format.' }
    const expectedHashes = { manifest: deterministicDigest(pack.manifest), scenarioSnapshot: deterministicDigest(pack.scenarioSnapshot), journal: deterministicDigest(pack.journal), summary: deterministicDigest(pack.summary), replayInput: deterministicDigest(pack.replayInput) }
    if (Object.entries(expectedHashes).some(([key, value]) => pack.hashes[key] !== value)) return { valid: false, corrupt: true, replayable: false, message: 'Incident package hash mismatch.' }
    const runtime = reconstructRuntime(pack.scenarioSnapshot, pack.replayInput.seed, pack.journal)
    if (isRuntimeCorrupt(runtime)) return { valid: false, corrupt: true, replayable: false, message: 'Incident journal digest chain is corrupt.' }
    if (scenarioDigest(pack.scenarioSnapshot) !== pack.manifest.scenarioDigest || pack.replayInput.packDigest !== pack.manifest.scenarioDigest || pack.replayInput.scenarioId !== pack.manifest.scenarioId) return { valid: false, corrupt: true, replayable: false, message: 'Incident package scenario binding does not match the snapshot.' }
    const replay = verifyReplay(pack.scenarioSnapshot, pack.replayInput)
    if (!replay.identical) return { valid: false, corrupt: false, replayable: false, message: 'Replay did not produce identical journal/state output.' }
    if (replay.finalStateDigest !== pack.manifest.finalStateDigest) return { valid: false, corrupt: false, replayable: false, message: 'Replay final state does not match the recorded summary.', journalDigest: replay.journalDigest, finalStateDigest: replay.finalStateDigest }
    return { valid: true, corrupt: false, replayable: true, journalDigest: replay.journalDigest, finalStateDigest: replay.finalStateDigest }
  } catch (error) {
    return { valid: false, corrupt: true, replayable: false, message: error instanceof Error ? error.message : 'Incident package verification failed.' }
  }
}

export const markerProjection = (markers: MapMarker[]) => markers.map((marker) => ({ ...marker, visible: true }))
