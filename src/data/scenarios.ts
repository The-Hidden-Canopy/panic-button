import type { Scenario } from '../types'

export const scenarios: Scenario[] = [
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
]
