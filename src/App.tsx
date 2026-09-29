import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { scenarios as builtInScenarios } from './data/scenarios'
import { createIncident, formatDuration, getPhaseIndex, makeEvent, scaleScenarioDuration } from './lib/incidentEngine'
import { MAX_PACK_BYTES, packFromScenarios, parseScenarioPack, validateScenario } from './lib/packValidator'
import { registerGlobalTrigger, setTheaterMode } from './lib/native'
import { clearActiveRunMarker, downloadJson, loadActiveRunMarker, loadReplays, loadScenarioDrafts, loadSettings, saveReplay, saveScenarioDraft, saveSettings, writeActiveRunMarker } from './lib/storage'
import { createTriggerGuard } from './lib/triggerGuard'
import type { ActiveIncident, ReplayRecord, Scenario, Settings, ValidationIssue } from './types'

type View = 'command' | 'timeline' | 'reports' | 'editor' | 'settings'

const defaultSettings: Settings = {
  triggerLabel: 'CTRL + SHIFT + P',
  durationSeconds: 90,
  soundEnabled: true,
  reducedMotion: false,
  alwaysOnTop: true,
  autoStart: false,
  cooldownSeconds: 5,
}

const readSettings = (): Settings => loadSettings(defaultSettings)

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

const replayRecord = (incident: ActiveIncident): ReplayRecord => ({ ...incident, id: `run-${incident.startedAt}`, savedAt: Date.now() })
const recoveredReplay = (incident: ActiveIncident): ReplayRecord => replayRecord({ ...incident, resolved: true, exitReason: 'ERROR', endedAt: Date.now() })

function App() {
  const [recoveryRun] = useState(() => loadActiveRunMarker())
  const [settings, setSettings] = useState<Settings>(readSettings)
  const [scenarios, setScenarios] = useState<Scenario[]>(() => {
    const drafts = new Map(loadScenarioDrafts().map((scenario) => [scenario.id, scenario]))
    const mergedBuiltIns = builtInScenarios.map((scenario) => drafts.get(scenario.id) ?? scenario)
    const custom = loadScenarioDrafts().filter((scenario) => !builtInScenarios.some((builtIn) => builtIn.id === scenario.id))
    return [...mergedBuiltIns, ...custom]
  })
  const [incident, setIncident] = useState<ActiveIncident | null>(null)
  const [view, setView] = useState<View>('command')
  const [selectedScenarioId, setSelectedScenarioId] = useState(builtInScenarios[0].id)
  const [notice, setNotice] = useState(recoveryRun ? 'RECOVERY MODE // PREVIOUS INCIDENT MARKED ABORTED' : 'SYSTEM NOMINAL // AWAITING MUNDANE CRISIS')
  const [lastReplay, setLastReplay] = useState<ActiveIncident | null>(() => recoveryRun ? recoveredReplay(recoveryRun) : loadReplays()[0] ?? null)
  const [packIssues, setPackIssues] = useState<ValidationIssue[]>([])
  const editorScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0]
  const triggerRef = useRef<() => void>(() => undefined)
  const incidentRef = useRef<ActiveIncident | null>(null)
  const exitRef = useRef<(reason: ActiveIncident['exitReason']) => void>(() => undefined)
  const triggerGuardRef = useRef(createTriggerGuard())

  const startSpecificIncident = (scenario: Scenario) => {
    const now = Date.now()
    if (!triggerGuardRef.current.tryAccept(now, Boolean(incidentRef.current && !incidentRef.current.resolved))) {
      setNotice('TRIGGER HELD // ACTIVE INCIDENT OR COOLDOWN IN EFFECT')
      return false
    }
    const next = createIncident(scaleScenarioDuration(scenario, settings.durationSeconds))
    setIncident(next)
    writeActiveRunMarker(next)
    setLastReplay(null)
    setView('command')
    setNotice('ALERT DISPATCHED // ALL AVAILABLE RESOURCES ALLOCATED')
    playAlert(settings.soundEnabled)
    void setTheaterMode(true, settings.alwaysOnTop)
    return true
  }

  const startIncident = () => {
    startSpecificIncident(pickScenario(scenarios))
  }

  const exitIncident = (reason: ActiveIncident['exitReason']) => {
    setIncident((current) => {
      if (!current) return current
      const completed = { ...current, resolved: true, exitReason: reason, endedAt: Date.now() }
      setLastReplay(completed)
      saveReplay(replayRecord(completed))
      clearActiveRunMarker()
      triggerGuardRef.current.startCooldown(Date.now(), settings.cooldownSeconds * 1000)
      void setTheaterMode(false, false)
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
    if (!recoveryRun) return
    saveReplay(recoveredReplay(recoveryRun))
    clearActiveRunMarker()
  }, [recoveryRun])

  useEffect(() => {
    const preserveRecoveryMarker = () => {
      const current = incidentRef.current
      if (current && !current.resolved) writeActiveRunMarker(current)
    }
    window.addEventListener('beforeunload', preserveRecoveryMarker)
    return () => window.removeEventListener('beforeunload', preserveRecoveryMarker)
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
          saveReplay(replayRecord(completed))
          clearActiveRunMarker()
          triggerGuardRef.current.startCooldown(Date.now(), settings.cooldownSeconds * 1000)
          void setTheaterMode(false, false)
          setNotice('AUTO-DISPATCH COMPLETE // PIZZA-CLASS THREAT RETURNED TO BASELINE')
          return completed
        }
        const updated = { ...current, elapsedSeconds, phaseIndex, events }
        writeActiveRunMarker(updated)
        return updated
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [incident?.resolved, incident?.startedAt, settings.cooldownSeconds, settings.soundEnabled])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  const updateSettings = (patch: Partial<Settings>) => setSettings((current) => ({ ...current, ...patch }))
  const activeScenario = incident?.scenario ?? editorScenario
  const phase = activeScenario.phases[incident?.phaseIndex ?? 0]
  const elapsed = incident?.elapsedSeconds ?? 0
  const remaining = Math.max(0, activeScenario.durationSeconds - elapsed)
  const progress = Math.min(100, (elapsed / activeScenario.durationSeconds) * 100)
  const incidentLabel = incident && !incident.resolved ? 'LIVE INCIDENT' : incident?.resolved ? 'INCIDENT SUMMARY' : 'STANDBY MODE'

  const updateEditorScenario = (patch: Partial<Scenario>) => {
    setScenarios((current) => current.map((scenario) => {
      if (scenario.id !== editorScenario.id) return scenario
      return patch.durationSeconds ? scaleScenarioDuration({ ...scenario, ...patch }, patch.durationSeconds) : { ...scenario, ...patch }
    }))
  }

  const saveEditorScenario = (scenario: Scenario) => {
    const issues = validateScenario(scenario)
    setPackIssues(issues)
    if (issues.some((item) => item.severity === 'error')) return false
    saveScenarioDraft(scenario)
    setNotice(`SCENARIO DRAFT SAVED // ${scenario.title}`)
    return true
  }

  const importPack = async (file: File) => {
    if (file.size > MAX_PACK_BYTES) {
      setPackIssues([{ path: 'pack', message: `Pack exceeds the ${MAX_PACK_BYTES.toLocaleString()} byte safety limit.`, severity: 'error' }])
      setNotice('PACK REJECTED // FILE TOO LARGE')
      return
    }
    const result = parseScenarioPack(await file.text())
    setPackIssues(result.issues)
    if (!result.pack) {
      setNotice('PACK REJECTED // VALIDATION FAILED')
      return
    }
    setScenarios((current) => {
      const incoming = new Map(result.pack!.scenarios.map((scenario) => [scenario.id, scenario]))
      return [...current.filter((scenario) => !incoming.has(scenario.id)), ...result.pack!.scenarios]
    })
    setSelectedScenarioId(result.pack.scenarios[0].id)
    setNotice(`PACK IMPORTED // ${result.pack.name.toUpperCase()}`)
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
          <div className="build-stamp">HC // PB-0.2.0<br />LOCAL / OFFLINE / SIMULATED</div>
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
        {view === 'timeline' && <TimelineView incident={incident ?? lastReplay} onStart={startIncident} onExport={(replay) => {
          const record = replayRecord(replay)
          downloadJson(`${replay.scenario.id}-${record.id}.json`, record)
        }} />}
        {view === 'reports' && <ReportsView incident={incident ?? lastReplay} scenario={activeScenario} />}
        {view === 'editor' && <EditorView scenario={editorScenario} scenarios={scenarios} selectedId={selectedScenarioId} issues={packIssues} onSelect={setSelectedScenarioId} onUpdate={updateEditorScenario} onSave={() => saveEditorScenario(editorScenario)} onImport={importPack} onExport={() => downloadJson(`${editorScenario.id}-pack.json`, packFromScenarios([editorScenario], 'Local Scenario Export'))} onPreview={() => startSpecificIncident(editorScenario)} />}
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

function TimelineView({ incident, onStart, onExport }: { incident: ActiveIncident | null; onStart: () => void; onExport: (incident: ActiveIncident) => void }) {
  return <div className="single-column"><section className="panel detail-panel"><PanelHeader title="INCIDENT TIMELINE" tag={incident ? 'RECORDED' : 'NO ACTIVE CASE'} /><div className="detail-intro"><span className="classification">CHRONOLOGICAL EVENT LOG</span><h2>{incident ? incident.scenario.title : 'No incident currently deployed'}</h2><p>{incident ? incident.scenario.premise : 'The command center is waiting for a minor inconvenience worthy of escalation.'}</p></div>{incident ? <><div className="detail-actions"><button className="secondary-button" onClick={() => onExport(incident)}>EXPORT REPLAY JSON</button></div><div className="timeline-list">{incident.events.map((event) => <div className="timeline-event" key={event.id}><span className={`timeline-dot ${event.tone}`} /><span className="timeline-time">{event.time}</span><div><strong>{event.label}</strong><p>{event.detail}</p></div></div>)}</div></> : <button className="primary-button" onClick={onStart}>TRIGGER RANDOM INCIDENT <span>→</span></button>}</section></div>
}

function ReportsView({ incident, scenario }: { incident: ActiveIncident | null; scenario: Scenario }) {
  return <div className="single-column"><section className="panel detail-panel"><PanelHeader title="SITUATION REPORTS" tag="EYES ONLY" /><div className="report-grid">{scenario.reports.map((report, index) => <article className={`report-card ${incident?.phaseIndex === index ? 'selected' : ''}`} key={report.id}><div className="report-card-top"><span>{report.classification}</span><b>REPORT {String(index + 1).padStart(2, '0')}</b></div><h3>{report.heading}</h3><p>{report.body}</p><div className="report-card-footer"><span>RECOMMENDATION</span><strong>{report.recommendation}</strong><em>{report.confidence}% CONFIDENCE</em></div></article>)}</div></section></div>
}

function EditorView({ scenario, scenarios, selectedId, issues, onSelect, onUpdate, onSave, onImport, onExport, onPreview }: { scenario: Scenario; scenarios: Scenario[]; selectedId: string; issues: ValidationIssue[]; onSelect: (id: string) => void; onUpdate: (patch: Partial<Scenario>) => void; onSave: () => boolean; onImport: (file: File) => void; onExport: () => void; onPreview: () => void }) {
  const [saved, setSaved] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const save = () => { if (onSave()) { setSaved(true); window.setTimeout(() => setSaved(false), 1600) } }
  return <div className="single-column"><section className="panel editor-panel"><PanelHeader title="SCENARIO LAB" tag="LOCAL AUTHORING" /><div className="editor-toolbar"><div><span className="tiny-label">SCENARIO PACK</span><select value={selectedId} onChange={(event) => onSelect(event.target.value)}>{scenarios.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></div><div className="editor-actions"><input ref={fileInput} type="file" accept="application/json,.json,.panicpack" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = '' }} /><button className="secondary-button" onClick={() => fileInput.current?.click()}>IMPORT PACK</button><button className="secondary-button" onClick={onExport}>EXPORT PACK</button><button className="secondary-button" onClick={() => setJsonOpen(!jsonOpen)}>{jsonOpen ? 'HIDE JSON' : 'VIEW JSON'}</button><button className="secondary-button" onClick={onPreview}>PREVIEW INCIDENT</button><button className="primary-button small" onClick={save}>{saved ? 'SAVED ✓' : 'SAVE DRAFT'}</button></div></div><div className="editor-grid"><label><span>TITLE</span><input value={scenario.title} onChange={(event) => onUpdate({ title: event.target.value.toUpperCase() })} /></label><label><span>SEVERITY</span><select value={scenario.severity} onChange={(event) => onUpdate({ severity: event.target.value as Scenario['severity'] })}><option>LOW</option><option>ELEVATED</option><option>CRITICAL</option><option>CATASTROPHIC</option></select></label><label className="wide"><span>PREMISE</span><textarea value={scenario.premise} onChange={(event) => onUpdate({ premise: event.target.value })} rows={3} /></label><label><span>DURATION (SECONDS)</span><input type="number" min="15" max="300" value={scenario.durationSeconds} onChange={(event) => onUpdate({ durationSeconds: Math.max(15, Math.min(300, Number(event.target.value))) })} /></label><label><span>RESOLUTION</span><input value={scenario.resolution} onChange={(event) => onUpdate({ resolution: event.target.value })} /></label></div>{issues.length > 0 && <div className="validation-box"><strong>PACK VALIDATION</strong>{issues.map((item) => <div className={item.severity} key={`${item.path}-${item.message}`}>{item.path}: {item.message}</div>)}</div>}{jsonOpen && <pre className="json-preview">{JSON.stringify(scenario, null, 2)}</pre>}<div className="editor-note"><span>ⓘ</span><p>Scenario packs are local JSON. Executable code, external URLs, arbitrary paths, and unsafe assets are rejected by the pack validator before activation.</p></div></section></div>
}

function SettingsView({ settings, onUpdate }: { settings: Settings; onUpdate: (patch: Partial<Settings>) => void }) {
  return <div className="single-column"><section className="panel detail-panel settings-panel"><PanelHeader title="SYSTEM SETTINGS" tag="LOCAL ONLY" /><div className="settings-form"><div className="setting-section"><span className="classification">TRIGGER</span><h2>How should we overreact?</h2><label><span>GLOBAL HOTKEY LABEL</span><input value={settings.triggerLabel} onChange={(event) => onUpdate({ triggerLabel: event.target.value.toUpperCase() })} /><small>Native Tauri builds register Ctrl + Shift + P by default. USB buttons that emit this key are supported.</small></label><label className="range-label"><span>POST-INCIDENT COOLDOWN <b>{settings.cooldownSeconds}s</b></span><input type="range" min="0" max="30" step="1" value={settings.cooldownSeconds} onChange={(event) => onUpdate({ cooldownSeconds: Number(event.target.value) })} /></label></div><div className="setting-section"><span className="classification">THEATRICS</span><h2>Control the spectacle</h2><label className="range-label"><span>DEFAULT INCIDENT LENGTH <b>{settings.durationSeconds}s</b></span><input type="range" min="15" max="300" step="5" value={settings.durationSeconds} onChange={(event) => onUpdate({ durationSeconds: Number(event.target.value) })} /></label><Toggle label="Alert sounds" checked={settings.soundEnabled} onChange={(checked) => onUpdate({ soundEnabled: checked })} /><Toggle label="Reduced motion" checked={settings.reducedMotion} onChange={(checked) => onUpdate({ reducedMotion: checked })} /><Toggle label="Always on top" checked={settings.alwaysOnTop} onChange={(checked) => onUpdate({ alwaysOnTop: checked })} /></div></div></section></div>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <button className={`toggle-row ${checked ? 'checked' : ''}`} onClick={() => onChange(!checked)}><span>{label}</span><span className="toggle"><i /></span></button> }

export default App
