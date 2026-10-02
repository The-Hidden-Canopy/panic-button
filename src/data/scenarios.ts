import type { Scenario, ScenarioNode } from '../types'

const makeScenario = (config: Pick<Scenario, 'id' | 'title' | 'premise' | 'severity' | 'accents'>, subject: string, resolution: string): Scenario => ({
  ...config,
  durationSeconds: 60,
  resolution,
  phases: [
    { id: 'p1', label: 'INITIAL ASSESSMENT', durationSeconds: 20, objective: `Confirm the ${subject} has genuinely become a situation.`, alerts: ['MINOR ISSUE CONFIRMED', 'OBSERVATION PROTOCOL ACTIVE'], reportIds: ['r1'] },
    { id: 'p2', label: 'RESOURCE SURGE', durationSeconds: 20, objective: `Deploy unnecessary resources toward the ${subject}.`, alerts: ['ESCALATION AUTHORIZED', 'MORALE REMAINS FRAGILE'], reportIds: ['r2'] },
    { id: 'p3', label: 'STABILIZATION', durationSeconds: 20, objective: `Restore normal operations around the ${subject}.`, alerts: ['RESOLUTION SIGNAL ACQUIRED', 'CIVILIAN CONFIDENCE RETURNING'], reportIds: ['r3'] },
  ],
  resources: [
    { id: 'r1', label: 'Incident Analysts', value: 2, unit: 'PERSONNEL', icon: '◉', color: config.accents[0] },
    { id: 'r2', label: 'Contingency Snacks', value: 7, unit: 'UNITS', icon: '✦', color: config.accents[1] },
    { id: 'r3', label: 'Public Confidence', value: 68, unit: '%', icon: '↗', color: '#73f7b1' },
  ],
  reports: [
    { id: 'r1', classification: 'ROUTINE / URGENT', heading: 'SITUATION CONFIRMED', body: `The ${subject} is behaving in a manner inconsistent with a calm household.`, recommendation: 'Maintain an authoritative posture while gathering more information.', confidence: 78 },
    { id: 'r2', classification: 'EYES ONLY', heading: 'RESOURCES DEPLOYED', body: `Additional personnel have been briefed on the ${subject} and are pretending to have expertise.`, recommendation: 'Do not make any irreversible decisions.', confidence: 61 },
    { id: 'r3', classification: 'FLASH', heading: 'BASELINE RESTORED', body: `The ${subject} is no longer escalating. Analysts recommend acting as though this was all intentional.`, recommendation: 'Issue a measured statement and stand down theatrics.', confidence: 93 },
  ],
  markers: [
    { id: 'command', label: 'COMMAND POST', x: 52, y: 53, tone: 'alert' },
    { id: 'unit', label: 'RESPONSE UNIT', x: 27, y: 30, tone: 'unit' },
    { id: 'unknown', label: 'UNKNOWN FACTOR', x: 77, y: 69, tone: 'neutral' },
  ],
})

const additionalScenarios: Scenario[] = [
  makeScenario({ id: 'left-sock-missing', title: 'LEFT SOCK MISSING', premise: 'One member of a previously stable textile pair has disappeared.', severity: 'ELEVATED', accents: ['#59d8ff', '#a687ff'] }, 'textile anomaly', 'The sock was found inside a pillowcase. The household has learned nothing.'),
  makeScenario({ id: 'streaming-buffering', title: 'STREAMING SERVICE BUFFERING', premise: 'The entertainment stream has paused at a narratively significant moment.', severity: 'CRITICAL', accents: ['#ff3d5a', '#59d8ff'] }, 'buffering event', 'Playback resumed. The plot can never be trusted again.'),
  makeScenario({ id: 'dog-wall-suspicion', title: 'DOG LOOKING AT WALL', premise: 'A trusted canine asset is monitoring an apparently empty section of wall.', severity: 'CATASTROPHIC', accents: ['#c084fc', '#73f7b1'] }, 'wall observation', 'The dog has moved on. The wall remains a person of interest.'),
  makeScenario({ id: 'printer-warning', title: 'PRINTER WARNING', premise: 'The printer has displayed a warning containing no actionable information.', severity: 'CRITICAL', accents: ['#ffb347', '#ff3d5a'] }, 'printer warning', 'The printer printed a page that says nothing. This is considered progress.'),
  makeScenario({ id: 'grocery-shortfall', title: 'GROCERY BAG SHORTFALL', premise: 'The household inventory contains one fewer item than the receipt suggests.', severity: 'ELEVATED', accents: ['#73f7b1', '#ffb347'] }, 'inventory discrepancy', 'The missing item was in the car. Auditors remain unconvinced.'),
  makeScenario({ id: 'phone-battery-19', title: 'PHONE BATTERY AT 19%', premise: 'The primary communications device has entered a mathematically alarming state.', severity: 'CRITICAL', accents: ['#ff3d5a', '#73f7b1'] }, 'battery event', 'A charger was located. The device has been instructed to recover.'),
  makeScenario({ id: 'package-wrong-door', title: 'PACKAGE WRONG DOOR', premise: 'A parcel has arrived at the wrong door, possibly on purpose.', severity: 'ELEVATED', accents: ['#59d8ff', '#ffb347'] }, 'package migration', 'The parcel reached its intended destination after a short diplomatic exchange.'),
  makeScenario({ id: 'meeting-could-email', title: 'MEETING COULD BE AN EMAIL', premise: 'A calendar invitation has achieved a level of unnecessary complexity.', severity: 'CATASTROPHIC', accents: ['#a687ff', '#ff3d5a'] }, 'calendar incident', 'The meeting ended. An email was sent anyway.'),
]

const baseScenarios: Scenario[] = [
  {
    id: 'pizza-14-minutes-late',
    title: 'PIZZA 14 MINUTES LATE',
    premise: 'The anticipated pizza has breached the agreed delivery window.',
    severity: 'CRITICAL',
    durationSeconds: 90,
    accents: ['#ff3d5a', '#ffb347'],
    resolution: 'Pizza arrived. Civilisation will continue, pending garlic-knot inventory.',
    phases: [
      { id: 'p1', label: 'INITIAL DELAY', durationSeconds: 22, objective: 'Establish whether the pizza is, in fact, still real.', alerts: ['DELIVERY WINDOW COMPROMISED', 'GARLIC KNOTS UNACCOUNTED FOR'], reportIds: ['r1'] },
      { id: 'p2', label: 'ESCALATION', durationSeconds: 30, objective: 'Deploy all available porch-observation assets.', alerts: ['UNKNOWN VEHICLE DETECTED', 'SAUCE TEMPERATURE DECLINING'], reportIds: ['r2'] },
      { id: 'p3', label: 'FINAL APPROACH', durationSeconds: 38, objective: 'Prepare the household for visual contact.', alerts: ['PIZZA SIGNAL ACQUIRED', 'NAPKIN RESERVES MOBILISED'], reportIds: ['r3'] },
    ],
    resources: [
      { id: 'r1', label: 'Porch Observers', value: 2, unit: 'PERSONNEL', icon: '◉', color: '#ff3d5a' },
      { id: 'r2', label: 'Garlic Knot Reserve', value: 8, unit: 'UNITS', icon: '✦', color: '#ffb347' },
      { id: 'r3', label: 'Emergency Napkins', value: 14, unit: 'UNITS', icon: '▤', color: '#59d8ff' },
      { id: 'r4', label: 'Hope Index', value: 63, unit: '%', icon: '↗', color: '#73f7b1' },
    ],
    reports: [
      { id: 'r1', classification: 'ROUTINE / URGENT', heading: 'THE WAIT HAS BEGUN', body: 'No visual confirmation has been established. The household has entered a period of heightened snack awareness.', recommendation: 'Maintain composure. Do not order a second pizza yet.', confidence: 81 },
      { id: 'r2', classification: 'EYES ONLY', heading: 'UNIDENTIFIED SEDAN', body: 'A sedan passed the residence at a speed consistent with either delivery or unrelated errands.', recommendation: 'Observe vehicle without appearing to observe vehicle.', confidence: 54 },
      { id: 'r3', classification: 'FLASH', heading: 'SIGNAL ACQUIRED', body: 'Thermal analysis indicates a warm cardboard rectangle approaching from the east.', recommendation: 'Initiate porch welcome protocol.', confidence: 97 },
    ],
    markers: [
      { id: 'home', label: 'COMMAND POST', x: 52, y: 53, tone: 'alert' },
      { id: 'route', label: 'EXPECTED ROUTE', x: 25, y: 68, tone: 'unit' },
      { id: 'unknown', label: 'UNKNOWN VEHICLE', x: 76, y: 27, tone: 'neutral' },
    ],
  },
  {
    id: 'coffee-machine-refusal',
    title: 'COFFEE MACHINE REFUSAL',
    premise: 'The primary caffeine apparatus has declined to participate in the morning.',
    severity: 'CATASTROPHIC',
    durationSeconds: 80,
    accents: ['#c084fc', '#59d8ff'],
    resolution: 'Coffee produced. The machine has been placed under observation.',
    phases: [
      { id: 'p1', label: 'POWER CHECK', durationSeconds: 25, objective: 'Confirm that the machine remains connected to reality.', alerts: ['BREW CYCLE SILENT', 'BUTTON PRESS UNACKNOWLEDGED'], reportIds: ['r1'] },
      { id: 'p2', label: 'MANUAL OVERRIDE', durationSeconds: 25, objective: 'Apply measured encouragement to the apparatus.', alerts: ['WATER LEVEL NOMINAL', 'BEANS REFUSE TO COOPERATE'], reportIds: ['r2'] },
      { id: 'p3', label: 'CAFFEINATION', durationSeconds: 30, objective: 'Secure the first operational cup.', alerts: ['PRESSURE RESTORED', 'AROMA DETECTED'], reportIds: ['r3'] },
    ],
    resources: [
      { id: 'r1', label: 'Caffeine Analysts', value: 1, unit: 'PERSONNEL', icon: '◉', color: '#c084fc' },
      { id: 'r2', label: 'Backup Tea Bags', value: 6, unit: 'UNITS', icon: '✦', color: '#ffb347' },
      { id: 'r3', label: 'Machine Patience', value: 19, unit: '%', icon: '↘', color: '#ff3d5a' },
      { id: 'r4', label: 'Morning Readiness', value: 72, unit: '%', icon: '↗', color: '#73f7b1' },
    ],
    reports: [
      { id: 'r1', classification: 'BLACK COFFEE', heading: 'APPARATUS SILENT', body: 'The machine has displayed no obvious signs of cooperation. Ambient morale is degrading.', recommendation: 'Avoid eye contact with the machine.', confidence: 89 },
      { id: 'r2', classification: 'FIELD REPORT', heading: 'BEANS LOCATED', body: 'Beans are present, but their intentions remain unclear.', recommendation: 'Attempt a reset using calm, authoritative language.', confidence: 62 },
      { id: 'r3', classification: 'ALL CLEAR-ish', heading: 'BREW INITIATED', body: 'Dark liquid is now moving in a downward direction.', recommendation: 'Prepare mug and refrain from celebrating prematurely.', confidence: 94 },
    ],
    markers: [
      { id: 'machine', label: 'COFFEE APPARATUS', x: 53, y: 49, tone: 'alert' },
      { id: 'tea', label: 'BACKUP TEA', x: 76, y: 70, tone: 'neutral' },
      { id: 'mug', label: 'MUG STAGING', x: 25, y: 28, tone: 'unit' },
    ],
  },
  ...additionalScenarios,
]

const withBranching = (scenario: Scenario, actionId: string, actionLabel: string, resourceId: string, resourceDelta: number): Scenario => {
  const nodes: ScenarioNode[] = scenario.phases.map((phase, index) => ({ id: phase.id, type: index === scenario.phases.length - 1 ? 'CHOICE' : 'PHASE', label: phase.label, objective: phase.objective, durationMs: phase.durationSeconds * 1000, next: [index === scenario.phases.length - 1 ? 'stabilized' : scenario.phases[index + 1].id], ...(index === scenario.phases.length - 1 ? { branches: [{ when: { kind: 'action_seen', actionId }, next: 'stabilized' }, { next: 'fallback' }] } : {}) }))
  return {
    ...scenario,
    schemaVersion: 2,
    seedPolicy: 'deterministic',
    nodes: [...nodes, { id: 'stabilized', type: 'TERMINAL' as const, label: 'STABILIZED' }, { id: 'fallback', type: 'TERMINAL' as const, label: 'STABILIZED WITH QUESTIONS' }],
    actions: [{ id: actionId, label: actionLabel, kind: 'SELECT_RESPONSE' as const, resourceId, amount: resourceDelta, targetNodeId: 'stabilized' }],
  }
}

export const scenarios: Scenario[] = baseScenarios.map((scenario) => {
  if (scenario.id === 'pizza-14-minutes-late') return withBranching(scenario, 'hold-line', 'Hold the porch line', 'r4', 5)
  if (scenario.id === 'coffee-machine-refusal') return withBranching(scenario, 'authorize-tea', 'Authorize backup tea', 'r2', -1)
  if (scenario.id === 'dog-wall-suspicion') return withBranching(scenario, 'pin-wall', 'Pin suspicious wall', 'r1', 1)
  return { ...scenario, schemaVersion: 2, seedPolicy: 'deterministic' }
})
