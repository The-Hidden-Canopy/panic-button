import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { scenarios as builtInScenarios } from './data/scenarios'
import { createIncident, formatDuration, getPhaseIndex, makeEvent } from './lib/incidentEngine'
import { registerGlobalTrigger } from './lib/native'
import type { ActiveIncident, Scenario, Settings } from './types'

type View = 'command' | 'timeline' | 'reports' | 'editor' | 'settings'

const defaultSettings: Settings = {
  triggerLabel: 'CTRL + SHIFT + P',
  durationSeconds: 90,
  soundEnabled: true,
  reducedMotion: false,
  alwaysOnTop: true,
  autoStart: false,
}

const readSettings = (): Settings => {
  try {
    const stored = localStorage.getItem('panic-button-settings')
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings
  } catch {
    return defaultSettings
  }
}

const playAlert = (enabled: boolean) => {
  if (!enabled || typeof window === 'undefined') return
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sawtooth'
    oscillator.frequency.setValueAtTime(440, context.currentTime)
    oscillator.frequency.linearRampToValueAtTime(880, context.currentTime + 0.18)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.45)
    window.setTimeout(() => void context.close(), 600)
  } catch {
    // Audio is decorative; a locked-down browser may reject it.
  }
}

const pickScenario = (items: Scenario[]) => items[Math.floor(Math.random() * items.length)] ?? items[0]

function App() {
  const [settings, setSettings] = useState<Settings>(readSettings)
  const [scenarios, setScenarios] = useState<Scenario[]>(builtInScenarios)
  const [incident, setIncident] = useState<ActiveIncident | null>(null)
  const [view, setView] = useState<View>('command')
  const [selectedScenarioId, setSelectedScenarioId] = useState(builtInScenarios[0].id)
  const [notice, setNotice] = useState('SYSTEM NOMINAL // AWAITING MUNDANE CRISIS')
  const [lastReplay, setLastReplay] = useState<ActiveIncident | null>(null)
  const editorScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0]
  const triggerRef = useRef<() => void>(() => undefined)
  const incidentRef = useRef<ActiveIncident | null>(null)
  const exitRef = useRef<(reason: ActiveIncident['exitReason']) => void>(() => undefined)

  const startIncident = () => {
    const next = createIncident(pickScenario(scenarios))
    setIncident(next)
    setLastReplay(null)
    setView('command')
    setNotice('ALERT DISPATCHED // ALL AVAILABLE RESOURCES ALLOCATED')
    playAlert(settings.soundEnabled)
  }

  const exitIncident = (reason: ActiveIncident['exitReason']) => {
    setIncident((current) => {
      if (!current) return current
      const completed = { ...current, resolved: true, exitReason: reason, endedAt: Date.now() }
      setLastReplay(completed)
      setNotice(reason === 'EMERGENCY_EXIT' ? 'EMERGENCY EXIT // THE SITUATION HAS BEEN CONTAINED' : 'INCIDENT CLOSED // NO FURTHER ACTION REQUIRED')
      return completed
    })
  }

  triggerRef.current = startIncident
  incidentRef.current = incident
  exitRef.current = exitIncident

  useEffect(() => {
    let cancelled = false
    let cleanupNative: (() => Promise<void>) | null = null
    const fallback = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        triggerRef.current()
      }
      if (event.key === 'Escape' && incidentRef.current && !incidentRef.current.resolved) exitRef.current('EMERGENCY_EXIT')
    }
    window.addEventListener('keydown', fallback)
    void registerGlobalTrigger(() => triggerRef.current()).then((cleanup) => {
      if (cancelled) {
        void cleanup?.()
      } else {
        cleanupNative = cleanup
      }
    })
    return () => {
      cancelled = true
      window.removeEventListener('keydown', fallback)
      void cleanupNative?.()
    }
  }, [])

  useEffect(() => {
    if (!incident || incident.resolved) return undefined
    const timer = window.setInterval(() => {
      setIncident((current) => {
        if (!current || current.resolved) return current
        const elapsedSeconds = current.elapsedSeconds + 1
        const phaseIndex = getPhaseIndex(current.scenario, elapsedSeconds)
        const phaseChanged = phaseIndex !== current.phaseIndex
        const phase = current.scenario.phases[phaseIndex]
        const events = phaseChanged
          ? [...current.events, makeEvent(elapsedSeconds, phase.label, phase.objective, 'info')]
          : current.events
        if (phaseChanged) playAlert(settings.soundEnabled)
        if (elapsedSeconds >= current.scenario.durationSeconds) {
          const completed = { ...current, elapsedSeconds, phaseIndex, events, resolved: true, exitReason: 'AUTO_DISMISSED' as const }
          setLastReplay(completed)
          setNotice('AUTO-DISPATCH COMPLETE // PIZZA-CLASS THREAT RETURNED TO BASELINE')
          return completed
        }
        return { ...current, elapsedSeconds, phaseIndex, events }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [incident?.resolved, incident?.startedAt, settings.soundEnabled])

  useEffect(() => {
    localStorage.setItem('panic-button-settings', JSON.stringify(settings))
  }, [settings])

  const updateSettings = (patch: Partial<Settings>) => setSettings((current) => ({ ...current, ...patch }))
  const activeScenario = incident?.scenario ?? editorScenario
  const phase = activeScenario.phases[incident?.phaseIndex ?? 0]
  const elapsed = incident?.elapsedSeconds ?? 0
  const remaining = Math.max(0, activeScenario.durationSeconds - elapsed)
  const progress = Math.min(100, (elapsed / activeScenario.durationSeconds) * 100)
  const incidentLabel = incident && !incident.resolved ? 'LIVE INCIDENT' : incident?.resolved ? 'INCIDENT SUMMARY' : 'STANDBY MODE'

  const updateEditorScenario = (patch: Partial<Scenario>) => {
    setScenarios((current) => current.map((scenario) => scenario.id === editorScenario.id ? { ...scenario, ...patch } : scenario))
  }

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: 'command', label: 'COMMAND', icon: '⌁' },
    { id: 'timeline', label: 'TIMELINE', icon: '◷' },
    { id: 'reports', label: 'SITREPS', icon: '▤' },
    { id: 'editor', label: 'SCENARIO LAB', icon: '✎' },
    { id: 'settings', label: 'SETTINGS', icon: '⚙' },
  ]

  return (
    <div className={`app-shell ${settings.reducedMotion ? 'reduced-motion' : ''}`} style={{ '--accent': activeScenario.accents[0], '--accent-secondary': activeScenario.accents[1] } as CSSProperties}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">PB</div>
          <div>
            <div className="brand-name">PANIC BUTTON</div>
            <div className="brand-subtitle">DOMESTIC INCIDENT COMMAND</div>
          </div>
        </div>
        <div className="system-badge"><span className="live-dot" /> SYSTEM ONLINE</div>
        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button className={`nav-item ${view === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setView(item.id)}>
              <span className="nav-icon">{item.icon}</span><span>{item.label}</span>{view === item.id && <span className="nav-caret">›</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="hotkey-card">
            <span className="tiny-label">PANIC TRIGGER</span>
            <strong>{settings.triggerLabel}</strong>
            <span className="tiny-help">or press the big red button</span>
          </div>
          <button className="panic-button" onClick={startIncident} aria-label="Trigger a random panic incident">
            <span className="panic-button-inner"><span className="panic-icon">!</span><span>TRIGGER<br />INCIDENT</span></span>
          </button>
          <div className="build-stamp">HC // PB-0.1.0<br />LOCAL / OFFLINE / SIMULATED</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><span className="eyebrow">HIDDEN CANOPY // OPERATIONS DESK</span><h1>{incidentLabel}</h1></div>
          <div className="topbar-actions">
            <span className="offline-pill"><span className="offline-dot" /> OFFLINE CORE</span>
            <button className="icon-button" onClick={() => updateSettings({ soundEnabled: !settings.soundEnabled })} aria-label={settings.soundEnabled ? 'Mute alerts' : 'Enable alerts'}>{settings.soundEnabled ? '◖)' : '×)'}</button>
            {incident && !incident.resolved && <button className="escape-button" onClick={() => exitIncident('EMERGENCY_EXIT')}>ESC // ABORT</button>}
          </div>
        </header>

        <div className="status-strip"><span className="status-pulse" /> {notice}<span className="strip-right">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} EST</span></div>

        {view === 'command' && <CommandView incident={incident} scenario={activeScenario} phase={phase} remaining={remaining} progress={progress} elapsed={elapsed} onStart={startIncident} onExit={() => exitIncident('RESOLVED')} />}
        {view === 'timeline' && <TimelineView incident={incident ?? lastReplay} onStart={startIncident} />}
        {view === 'reports' && <ReportsView incident={incident ?? lastReplay} scenario={activeScenario} />}
        {view === 'editor' && <EditorView scenario={editorScenario} scenarios={scenarios} selectedId={selectedScenarioId} onSelect={setSelectedScenarioId} onUpdate={updateEditorScenario} onPreview={() => { setIncident(createIncident(editorScenario)); setView('command') }} />}
        {view === 'settings' && <SettingsView settings={settings} onUpdate={updateSettings} />}
      </main>
    </div>
  )
}

function CommandView({ incident, scenario, phase, remaining, progress, elapsed, onStart, onExit }: { incident: ActiveIncident | null; scenario: Scenario; phase: Scenario['phases'][number]; remaining: number; progress: number; elapsed: number; onStart: () => void; onExit: () => void }) {
  const currentReport = scenario.reports.find((report) => report.id === phase.reportIds[0]) ?? scenario.reports[0]
  const isLive = Boolean(incident && !incident.resolved)
  return (
    <div className="content-grid">
      <section className="hero-panel panel scanline-overlay">
        <div className="hero-heading"><div><span className="classification">CLASSIFICATION // {scenario.severity}</span><h2>CRITICAL INCIDENT:<br /><em>{scenario.title}</em></h2></div><div className={`severity-seal ${isLive ? 'spinning' : ''}`}><span>SEV</span><strong>{scenario.severity === 'CATASTROPHIC' ? 'X' : scenario.severity === 'CRITICAL' ? '4' : '2'}</strong></div></div>
        <div className="incident-meta"><span>CASE ID <b>PB-{scenario.id.slice(0, 4).toUpperCase()}-{new Date().getFullYear()}</b></span><span>STATUS <b className={isLive ? 'text-alert' : 'text-safe'}>{isLive ? 'ACTIVE' : incident?.resolved ? 'CONTAINED' : 'STANDBY'}</b></span><span>SIMULATION <b className="text-warn">TRUE</b></span></div>
        <div className="countdown-row"><div><span className="tiny-label">TIME TO STABILIZATION</span><div className="countdown">{formatDuration(remaining)}</div></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="phase-readout"><span className="tiny-label">CURRENT PHASE</span><strong>{phase.label}</strong><small>{phase.objective}</small></div></div>
        {!incident && <div className="standby-callout"><span className="standby-icon">✦</span><div><strong>COMMAND CENTER STANDING BY</strong><p>Press the red button or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> to escalate an ordinary problem into an avoidable national emergency.</p></div><button className="primary-button" onClick={onStart}>INITIATE RANDOM INCIDENT <span>→</span></button></div>}
        {incident?.resolved && <div className="standby-callout resolved-callout"><span className="standby-icon">✓</span><div><strong>INCIDENT CONTAINED</strong><p>{scenario.resolution}</p></div><button className="primary-button" onClick={onStart}>NEW INCIDENT <span>→</span></button></div>}
        <div className="map-shell"><div className="map-toolbar"><span>TACTICAL MAP // SYNTHETIC FEED</span><span><i className="map-legend alert" /> COMMAND <i className="map-legend unit" /> UNITS <i className="map-legend neutral" /> UNKNOWN</span></div><div className="tactical-map"><div className="map-water" /><div className="map-road road-a" /><div className="map-road road-b" /><div className="map-road road-c" /><div className="map-blocks" />{scenario.markers.map((marker) => <div className={`map-marker ${marker.tone}`} key={marker.id} style={{ left: `${marker.x}%`, top: `${marker.y}%` }}><span className="marker-ping" /><span className="marker-label">{marker.label}</span></div>)}<div className="map-coordinates">40° 42' 46.1" N<br />74° 00' 21.5" W</div><div className="map-stamp">SIMULATED<br />SATELLITE<br />IMAGERY</div></div></div>
      </section>
      <aside className="right-column">
        <section className="panel resource-panel"><PanelHeader title="RESOURCE ALLOCATION" tag="LIVE" /><div className="resource-list">{scenario.resources.map((resource) => <div className="resource-row" key={resource.id}><span className="resource-icon" style={{ color: resource.color }}>{resource.icon}</span><span className="resource-name">{resource.label}<small>{resource.unit}</small></span><strong style={{ color: resource.color }}>{resource.value}</strong></div>)}</div><div className="resource-footer"><span>OVERREACTION INDEX</span><strong>{isLiveNumber(incident) ? 94 : 12}<small>/100</small></strong></div></section>
        <section className="panel report-panel"><PanelHeader title="LATEST SITREP" tag={currentReport.classification} /><div className="report-number">REPORT {String(scenario.reports.indexOf(currentReport) + 1).padStart(2, '0')} <span>({formatDuration(elapsed)})</span></div><h3>{currentReport.heading}</h3><p>{currentReport.body}</p><div className="recommendation"><span>RECOMMENDATION</span>{currentReport.recommendation}</div><div className="confidence"><span>CONFIDENCE</span><div className="confidence-track"><span style={{ width: `${currentReport.confidence}%` }} /></div><strong>{currentReport.confidence}%</strong></div></section>
        <section className="panel phase-panel"><PanelHeader title="OPERATIONAL PHASES" tag={`${scenario.phases.length} STAGES`} />{scenario.phases.map((item, index) => <div className={`phase-row ${index === (incident?.phaseIndex ?? 0) && isLive ? 'current' : ''} ${index < (incident?.phaseIndex ?? 0) ? 'complete' : ''}`} key={item.id}><span className="phase-index">{index < (incident?.phaseIndex ?? 0) ? '✓' : `0${index + 1}`}</span><span>{item.label}<small>{item.objective}</small></span></div>)}</section>
      </aside>
      <section className="panel ticker-panel"><span className="ticker-label">LIVE WIRE</span><div className="ticker-track"><span>{isLive ? `${phase.alerts[0]} // ${phase.alerts[1] ?? 'MONITORING CONTINUES'} // ${currentReport.recommendation}` : 'NO ACTIVE THREATS // THE HOUSEHOLD REMAINS SUSPICIOUSLY CALM // READY TO OVERREACT'}</span></div><button className="text-button" onClick={onExit}>MARK STABLE</button></section>
    </div>
  )
}

const isLiveNumber = (incident: ActiveIncident | null) => Boolean(incident && !incident.resolved)

function PanelHeader({ title, tag }: { title: string; tag: string }) { return <div className="panel-header"><span>{title}</span><b>{tag}</b></div> }

function TimelineView({ incident, onStart }: { incident: ActiveIncident | null; onStart: () => void }) {
  return <div className="single-column"><section className="panel detail-panel"><PanelHeader title="INCIDENT TIMELINE" tag={incident ? 'RECORDED' : 'NO ACTIVE CASE'} /><div className="detail-intro"><span className="classification">CHRONOLOGICAL EVENT LOG</span><h2>{incident ? incident.scenario.title : 'No incident currently deployed'}</h2><p>{incident ? incident.scenario.premise : 'The command center is waiting for a minor inconvenience worthy of escalation.'}</p></div>{incident ? <div className="timeline-list">{incident.events.map((event) => <div className="timeline-event" key={event.id}><span className={`timeline-dot ${event.tone}`} /><span className="timeline-time">{event.time}</span><div><strong>{event.label}</strong><p>{event.detail}</p></div></div>)}</div> : <button className="primary-button" onClick={onStart}>TRIGGER RANDOM INCIDENT <span>→</span></button>}</section></div>
}

function ReportsView({ incident, scenario }: { incident: ActiveIncident | null; scenario: Scenario }) {
  return <div className="single-column"><section className="panel detail-panel"><PanelHeader title="SITUATION REPORTS" tag="EYES ONLY" /><div className="report-grid">{scenario.reports.map((report, index) => <article className={`report-card ${incident?.phaseIndex === index ? 'selected' : ''}`} key={report.id}><div className="report-card-top"><span>{report.classification}</span><b>REPORT {String(index + 1).padStart(2, '0')}</b></div><h3>{report.heading}</h3><p>{report.body}</p><div className="report-card-footer"><span>RECOMMENDATION</span><strong>{report.recommendation}</strong><em>{report.confidence}% CONFIDENCE</em></div></article>)}</div></section></div>
}

function EditorView({ scenario, scenarios, selectedId, onSelect, onUpdate, onPreview }: { scenario: Scenario; scenarios: Scenario[]; selectedId: string; onSelect: (id: string) => void; onUpdate: (patch: Partial<Scenario>) => void; onPreview: () => void }) {
  const [saved, setSaved] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const save = () => { localStorage.setItem(`panic-scenario-${scenario.id}`, JSON.stringify(scenario)); setSaved(true); window.setTimeout(() => setSaved(false), 1600) }
  return <div className="single-column"><section className="panel editor-panel"><PanelHeader title="SCENARIO LAB" tag="LOCAL AUTHORING" /><div className="editor-toolbar"><div><span className="tiny-label">SCENARIO PACK</span><select value={selectedId} onChange={(event) => onSelect(event.target.value)}>{scenarios.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></div><div className="editor-actions"><button className="secondary-button" onClick={() => setJsonOpen(!jsonOpen)}>{jsonOpen ? 'HIDE JSON' : 'VIEW JSON'}</button><button className="secondary-button" onClick={onPreview}>PREVIEW INCIDENT</button><button className="primary-button small" onClick={save}>{saved ? 'SAVED ✓' : 'SAVE DRAFT'}</button></div></div><div className="editor-grid"><label><span>TITLE</span><input value={scenario.title} onChange={(event) => onUpdate({ title: event.target.value.toUpperCase() })} /></label><label><span>SEVERITY</span><select value={scenario.severity} onChange={(event) => onUpdate({ severity: event.target.value as Scenario['severity'] })}><option>LOW</option><option>ELEVATED</option><option>CRITICAL</option><option>CATASTROPHIC</option></select></label><label className="wide"><span>PREMISE</span><textarea value={scenario.premise} onChange={(event) => onUpdate({ premise: event.target.value })} rows={3} /></label><label><span>DURATION (SECONDS)</span><input type="number" min="15" max="300" value={scenario.durationSeconds} onChange={(event) => onUpdate({ durationSeconds: Math.max(15, Math.min(300, Number(event.target.value))) })} /></label><label><span>RESOLUTION</span><input value={scenario.resolution} onChange={(event) => onUpdate({ resolution: event.target.value })} /></label></div>{jsonOpen && <pre className="json-preview">{JSON.stringify(scenario, null, 2)}</pre>}<div className="editor-note"><span>ⓘ</span><p>Scenario packs are local JSON. Executable code, external URLs, arbitrary paths, and unsafe assets are rejected by the pack validator.</p></div></section></div>
}

function SettingsView({ settings, onUpdate }: { settings: Settings; onUpdate: (patch: Partial<Settings>) => void }) {
  return <div className="single-column"><section className="panel detail-panel settings-panel"><PanelHeader title="SYSTEM SETTINGS" tag="LOCAL ONLY" /><div className="settings-form"><div className="setting-section"><span className="classification">TRIGGER</span><h2>How should we overreact?</h2><label><span>GLOBAL HOTKEY LABEL</span><input value={settings.triggerLabel} onChange={(event) => onUpdate({ triggerLabel: event.target.value.toUpperCase() })} /><small>Native Tauri builds register Ctrl + Shift + P by default. USB buttons that emit this key are supported.</small></label></div><div className="setting-section"><span className="classification">THEATRICS</span><h2>Control the spectacle</h2><label className="range-label"><span>DEFAULT INCIDENT LENGTH <b>{settings.durationSeconds}s</b></span><input type="range" min="15" max="300" step="5" value={settings.durationSeconds} onChange={(event) => onUpdate({ durationSeconds: Number(event.target.value) })} /></label><Toggle label="Alert sounds" checked={settings.soundEnabled} onChange={(checked) => onUpdate({ soundEnabled: checked })} /><Toggle label="Reduced motion" checked={settings.reducedMotion} onChange={(checked) => onUpdate({ reducedMotion: checked })} /><Toggle label="Always on top" checked={settings.alwaysOnTop} onChange={(checked) => onUpdate({ alwaysOnTop: checked })} /></div></div></section></div>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <button className={`toggle-row ${checked ? 'checked' : ''}`} onClick={() => onChange(!checked)}><span>{label}</span><span className="toggle"><i /></span></button> }

export default App
