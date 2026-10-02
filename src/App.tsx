import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { scenarios as builtInScenarios } from './data/scenarios'
import { formatDuration, scaleScenarioDuration } from './lib/incidentEngine'
import { abortIncidentRuntime, advanceIncidentRuntime, createIncidentPackage, createSeed, dispatchIncidentAction, isRuntimeCorrupt, openIncidentRuntime, projectActiveIncident, recoverIncidentRuntime, reconstructRuntime, validateScenarioGraph } from './lib/deterministicRuntime'
import { MAX_PACK_BYTES, admitPack, packFromScenarios, parseScenarioPack, validateScenario } from './lib/packValidator'
import { isTauriRuntime, nativeIncidentStoreEvent, nativeProjectionGet, nativeProjectionSet, nativeTrustedSigners, registerGlobalTrigger, setTheaterMode } from './lib/native'
import { clearActiveRunMarker, downloadJson, hydrateNativeValue, installPackRecord, loadActiveRunMarker, loadReplays, loadScenarioDrafts, loadSettings, loadStagedPacks, packRecordFor, savePackRecord, saveReplay, saveScenarioDraft, saveSettings, writeActiveRunMarker } from './lib/storage'
import { createTriggerGuard } from './lib/triggerGuard'
import type { ActiveIncident, PackRecord, ReplayRecord, Scenario, Settings, TrustedSigner, ValidationIssue } from './types'

type View = 'command' | 'timeline' | 'reports' | 'editor' | 'settings'

const defaultSettings: Settings = {
  triggerLabel: 'CTRL + SHIFT + P',
  durationSeconds: 90,
  soundEnabled: true,
  reducedMotion: false,
  alwaysOnTop: true,
  autoStart: false,
  cooldownSeconds: 5,
  mirrorSecondary: false,
  triggerBinding: { id: 'primary-trigger', type: 'keyboard_shortcut', chord: 'CommandOrControl+Shift+P', enabled: true, debounceMs: 800 },
  alertVolume: 0.35,
  musicVolume: 0.2,
  effectsVolume: 0.35,
  captionsEnabled: true,
  highContrast: false,
}

const readSettings = (): Settings => loadSettings(defaultSettings)

const playAlert = (enabled: boolean, volume = 0.08) => {
  if (!enabled || typeof window === 'undefined') return
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sawtooth'
    oscillator.frequency.setValueAtTime(440, context.currentTime)
    oscillator.frequency.linearRampToValueAtTime(880, context.currentTime + 0.18)
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, Math.min(0.2, volume)), context.currentTime + 0.03)
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

const matchesConfiguredShortcut = (event: KeyboardEvent, chord: string) => {
  const parts = chord.split('+').map((part) => part.trim().toLowerCase()).filter(Boolean)
  const key = parts.at(-1)
  if (!key) return false
  const wantsControl = parts.includes('ctrl') || parts.includes('control') || parts.includes('commandorcontrol')
  const wantsAlt = parts.includes('alt') || parts.includes('option')
  const wantsShift = parts.includes('shift')
  const wantsMeta = parts.includes('meta') || parts.includes('command')
  return event.key.toLowerCase() === key && event.ctrlKey === wantsControl && event.altKey === wantsAlt && event.shiftKey === wantsShift && event.metaKey === wantsMeta
}

const replayRecord = (incident: ActiveIncident): ReplayRecord => ({ ...incident, id: `run-${incident.startedAt}`, savedAt: Date.now() })
const recoveredReplay = (incident: ActiveIncident): ReplayRecord => {
  if (incident.runtimeState && incident.journal) {
    const persistedRuntime = { state: incident.runtimeState, journal: incident.journal }
    if (isRuntimeCorrupt(persistedRuntime)) return replayRecord({ ...incident, resolved: true, exitReason: 'ERROR', endedAt: Date.now(), runtimeState: { ...incident.runtimeState, lifecycle: 'CORRUPT' } })
    const recovered = recoverIncidentRuntime(persistedRuntime, Date.now())
    return replayRecord({ ...projectActiveIncident(recovered, incident.scenario, incident.startedAt, 'ERROR'), resolved: true, exitReason: 'ERROR', endedAt: Date.now() })
  }
  return replayRecord({ ...incident, resolved: true, exitReason: 'ERROR', endedAt: Date.now() })
}

const persistRuntimeJournal = (runtime: ReturnType<typeof openIncidentRuntime>, startedAt: number) => {
  if (!isTauriRuntime()) return
  void Promise.all(runtime.journal.map((event) => nativeIncidentStoreEvent(runtime.state.incidentId, event.sequence, event, event.eventDigest, runtime.state.lifecycle, startedAt)))
  void nativeProjectionSet({ incidentId: runtime.state.incidentId, scenarioId: runtime.state.scenarioId, lifecycle: runtime.state.lifecycle, simulationTimeMs: runtime.state.simulationTimeMs, phaseIndex: runtime.state.phaseIndex, alerts: runtime.state.alerts.slice(-3), markerCount: runtime.state.markers.filter((marker) => marker.visible).length })
}

const isMirrorWindow = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mirror') === '1'

function App() {
  return isMirrorWindow() ? <SurveillanceMirror /> : <CommandCenter />
}

function SurveillanceMirror() {
  const [projection, setProjection] = useState<{ scenarioId?: string; lifecycle?: string; simulationTimeMs?: number; phaseIndex?: number; markerCount?: number }>({})
  useEffect(() => {
    const emergencyExit = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void setTheaterMode(false, false, false)
    }
    window.addEventListener('keydown', emergencyExit)
    return () => window.removeEventListener('keydown', emergencyExit)
  }, [])
  useEffect(() => {
    let cancelled = false
    const poll = async () => { const value = await nativeProjectionGet(); if (!cancelled && value && typeof value === 'object') setProjection(value as typeof projection) }
    void poll()
    const timer = window.setInterval(() => void poll(), 350)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])
  return <div className="mirror-shell"><div className="mirror-topline"><span className="live-dot" /> SECONDARY SURVEILLANCE FEED <strong>SIMULATED DATA</strong></div><div className="mirror-grid"><div className="mirror-radar"><span className="mirror-crosshair" /><span className="mirror-sweep" /></div><div className="mirror-copy"><span className="classification">REMOTE DISPLAY // AUXILIARY COMMAND</span><h1>{projection.scenarioId ? `LIVE // ${projection.scenarioId.replaceAll('-', ' ').toUpperCase()}` : 'OPERATIONAL THEATER ACTIVE'}</h1><p>This display is a theatrical projection of the primary incident state. All imagery, coordinates, and telemetry are simulated.</p><div className="mirror-status"><span>UPLINK</span><b>{projection.lifecycle ?? 'STANDBY'}</b><span>PHASE</span><b>{projection.phaseIndex === undefined ? '—' : String(projection.phaseIndex + 1).padStart(2, '0')}</b><span>MARKERS</span><b>{projection.markerCount ?? 0}</b></div></div></div><div className="mirror-footer">HIDDEN CANOPY // PANIC BUTTON // OFFLINE CORE // ESC REMAINS THE EMERGENCY EXIT</div></div>
}

function CommandCenter() {
  const [recoveryRun] = useState(() => loadActiveRunMarker())
  const [nativeHydrated, setNativeHydrated] = useState(false)
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
  const [audioCaption, setAudioCaption] = useState('')
  const [lastReplay, setLastReplay] = useState<ActiveIncident | null>(() => recoveryRun ? recoveredReplay(recoveryRun) : loadReplays()[0] ?? null)
  const [packIssues, setPackIssues] = useState<ValidationIssue[]>([])
  const [stagedPack, setStagedPack] = useState<PackRecord | null>(() => loadStagedPacks()[0] ?? null)
  const [trustedSigners, setTrustedSigners] = useState<TrustedSigner[]>([])
  const editorScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0]
  const triggerRef = useRef<() => void>(() => undefined)
  const incidentRef = useRef<ActiveIncident | null>(null)
  const runtimeRef = useRef<ReturnType<typeof openIncidentRuntime> | null>(null)
  const monotonicStartRef = useRef<number | null>(null)
  const exitRef = useRef<(reason: ActiveIncident['exitReason']) => void>(() => undefined)
  const triggerGuardRef = useRef(createTriggerGuard(defaultSettings.triggerBinding.debounceMs))

  const startSpecificIncident = (scenario: Scenario) => {
    const now = Date.now()
    if (!triggerGuardRef.current.tryAccept(now, Boolean(incidentRef.current && !incidentRef.current.resolved))) {
      setNotice('TRIGGER HELD // ACTIVE INCIDENT OR COOLDOWN IN EFFECT')
      return false
    }
    const scaledScenario = scaleScenarioDuration(scenario, settings.durationSeconds)
    const runtime = openIncidentRuntime(scaledScenario, createSeed(scaledScenario.id, now), now)
    const next = projectActiveIncident(runtime, scaledScenario, now)
    runtimeRef.current = runtime
    monotonicStartRef.current = typeof performance !== 'undefined' ? performance.now() : now
    persistRuntimeJournal(runtime, now)
    setIncident(next)
    writeActiveRunMarker(next)
    setLastReplay(null)
    setView('command')
    setNotice('ALERT DISPATCHED // ALL AVAILABLE RESOURCES ALLOCATED')
    if (settings.captionsEnabled) setAudioCaption('ALERT TONE // INCIDENT OPENED')
    playAlert(settings.soundEnabled, settings.effectsVolume)
    void setTheaterMode(true, settings.alwaysOnTop, settings.mirrorSecondary)
    return true
  }

  const startIncident = () => {
    startSpecificIncident(pickScenario(scenarios))
  }

  const exitIncident = (reason: ActiveIncident['exitReason']) => {
    setIncident((current) => {
      if (!current) return current
      const runtime = runtimeRef.current
      const finalRuntime = runtime
        ? reason === 'EMERGENCY_EXIT'
          ? abortIncidentRuntime(runtime, reason, Date.now())
          : advanceIncidentRuntime(runtime, current.scenario, current.scenario.durationSeconds * 1000, Date.now())
        : null
      const completed = finalRuntime
        ? { ...projectActiveIncident(finalRuntime, current.scenario, current.startedAt, reason), resolved: true, exitReason: reason, endedAt: Date.now() }
        : { ...current, resolved: true, exitReason: reason, endedAt: Date.now() }
      runtimeRef.current = finalRuntime
      if (finalRuntime) persistRuntimeJournal(finalRuntime, current.startedAt)
      setLastReplay(completed)
      saveReplay(replayRecord(completed))
      clearActiveRunMarker()
      triggerGuardRef.current.startCooldown(Date.now(), settings.cooldownSeconds * 1000)
      void setTheaterMode(false, false, false)
      setNotice(reason === 'EMERGENCY_EXIT' ? 'EMERGENCY EXIT // THE SITUATION HAS BEEN CONTAINED' : 'INCIDENT CLOSED // NO FURTHER ACTION REQUIRED')
      return completed
    })
  }

  const dispatchAction = (actionId: string) => {
    setIncident((current) => {
      const runtime = runtimeRef.current
      if (!current || !runtime) return current
      const action = current.scenario.actions?.find((item) => item.id === actionId)
      if (!action) return current
      const updatedRuntime = dispatchIncidentAction(runtime, current.scenario, { actionId, kind: action.kind, resourceId: action.resourceId, amount: action.amount, markerId: action.markerId, targetNodeId: action.targetNodeId }, runtime.state.simulationTimeMs, Date.now())
      runtimeRef.current = updatedRuntime
      const projected = projectActiveIncident(updatedRuntime, current.scenario, current.startedAt)
      persistRuntimeJournal(updatedRuntime, current.startedAt)
      writeActiveRunMarker(projected)
      return projected
    })
  }

  triggerRef.current = startIncident
  incidentRef.current = incident
  exitRef.current = exitIncident

  useEffect(() => {
    let cancelled = false
    let cleanupNative: (() => Promise<void>) | null = null
    const fallback = (event: KeyboardEvent) => {
      if (settings.triggerBinding.enabled && matchesConfiguredShortcut(event, settings.triggerBinding.chord)) {
        event.preventDefault()
        triggerRef.current()
      }
      if (event.key === 'Escape' && incidentRef.current && !incidentRef.current.resolved) exitRef.current('EMERGENCY_EXIT')
    }
    window.addEventListener('keydown', fallback)
    void registerGlobalTrigger(() => triggerRef.current(), settings.triggerBinding.chord, settings.triggerBinding.enabled).then((cleanup) => {
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
  }, [settings.triggerBinding.chord, settings.triggerBinding.enabled])

  useEffect(() => {
    if (!recoveryRun) return
    saveReplay(recoveredReplay(recoveryRun))
    clearActiveRunMarker()
  }, [recoveryRun])

  useEffect(() => {
    void nativeTrustedSigners().then((items) => setTrustedSigners(items.filter((item): item is TrustedSigner => Boolean(item && typeof item === 'object' && typeof (item as TrustedSigner).fingerprint === 'string' && typeof (item as TrustedSigner).publicKey === 'string' && typeof (item as TrustedSigner).trustState === 'string'))))
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) {
      setNativeHydrated(true)
      return undefined
    }
    let cancelled = false
    void Promise.all([
      hydrateNativeValue('panic-button-settings'),
      hydrateNativeValue('panic-button-scenarios'),
      hydrateNativeValue('panic-button-replays'),
      hydrateNativeValue('panic-button-active-run'),
    ]).then(([nativeSettings, nativeScenarios, nativeReplays, nativeActiveRun]) => {
      if (cancelled) return
      if (nativeSettings && typeof nativeSettings === 'object') setSettings((current) => ({ ...current, ...(nativeSettings as Partial<Settings>) }))
      if (Array.isArray(nativeScenarios)) {
        const drafts = new Map(nativeScenarios.map((scenario) => [scenario.id, scenario]))
        const mergedBuiltIns = builtInScenarios.map((scenario) => drafts.get(scenario.id) ?? scenario)
        const custom = nativeScenarios.filter((scenario) => !builtInScenarios.some((builtIn) => builtIn.id === scenario.id))
        setScenarios([...mergedBuiltIns, ...custom])
      }
      if (Array.isArray(nativeReplays) && nativeReplays[0]) setLastReplay(nativeReplays[0] as ActiveIncident)
      if (!recoveryRun && nativeActiveRun && typeof nativeActiveRun === 'object') {
        const recovered = recoveredReplay(nativeActiveRun as ActiveIncident)
        setLastReplay(recovered)
        saveReplay(recovered)
        clearActiveRunMarker()
        setNotice('RECOVERY MODE // PREVIOUS INCIDENT MARKED ABORTED')
      }
      setNativeHydrated(true)
    })
    return () => { cancelled = true }
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
        const runtime = runtimeRef.current
        if (!runtime) return current
        const monotonicNow = typeof performance !== 'undefined' ? performance.now() : Date.now()
        const start = monotonicStartRef.current ?? monotonicNow
        const updatedRuntime = advanceIncidentRuntime(runtime, current.scenario, Math.max(0, monotonicNow - start), Date.now())
        runtimeRef.current = updatedRuntime
        persistRuntimeJournal(updatedRuntime, current.startedAt)
        const phaseChanged = updatedRuntime.state.phaseIndex !== current.phaseIndex
        if (phaseChanged) {
          playAlert(settings.soundEnabled, settings.effectsVolume)
          if (settings.captionsEnabled) setAudioCaption(`ALERT TONE // ${updatedRuntime.state.alerts.at(-1) ?? 'ESCALATION EVENT'}`)
        }
        const updated = projectActiveIncident(updatedRuntime, current.scenario, current.startedAt)
        if (updatedRuntime.state.lifecycle === 'SUMMARY') {
          const completed = { ...updated, resolved: true, exitReason: 'AUTO_DISMISSED' as const, endedAt: Date.now() }
          setLastReplay(completed)
          saveReplay(replayRecord(completed))
          clearActiveRunMarker()
          triggerGuardRef.current.startCooldown(Date.now(), settings.cooldownSeconds * 1000)
          void setTheaterMode(false, false, false)
          setNotice('AUTO-DISPATCH COMPLETE // PIZZA-CLASS THREAT RETURNED TO BASELINE')
          return completed
        }
        writeActiveRunMarker(updated)
        return updated
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [incident?.resolved, incident?.startedAt, settings.cooldownSeconds, settings.soundEnabled])

  useEffect(() => {
    if (isTauriRuntime() && !nativeHydrated) return
    saveSettings(settings)
  }, [nativeHydrated, settings])

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
    const issues = [...validateScenario(scenario), ...validateScenarioGraph(scenario)]
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
    const admission = await admitPack(result.pack, trustedSigners)
    if (admission.state === 'INVALID' || admission.state === 'BLOCKED') {
      setPackIssues([{ path: 'pack.admission', message: admission.message ?? 'Pack admission failed.', severity: 'error' }])
      setNotice(`PACK REJECTED // ${admission.state}`)
      return
    }
    const record = packRecordFor(result.pack, admission, 'STAGED')
    savePackRecord(record)
    setStagedPack(record)
    setPackIssues([{ path: 'pack.admission', message: `${admission.state}: pack staged for explicit installation.`, severity: 'warning' }, ...result.issues])
    setNotice(`PACK STAGED // ${result.pack.name.toUpperCase()} // EXPLICIT INSTALL REQUIRED`)
  }

  const installStagedPack = () => {
    if (!stagedPack) return
    const installed = { ...stagedPack, state: 'INSTALLED' as const, installedAt: Date.now() }
    installPackRecord(stagedPack)
    setStagedPack(installed)
    setScenarios((current) => {
      const incoming = new Map(installed.pack.scenarios.map((scenario) => [scenario.id, scenario]))
      return [...current.filter((scenario) => !incoming.has(scenario.id)), ...installed.pack.scenarios]
    })
    setSelectedScenarioId(installed.pack.scenarios[0]?.id ?? selectedScenarioId)
    setNotice(`PACK INSTALLED // ${installed.pack.name}`)
  }

  const navItems: { id: View; label: string; icon: string }[] = [
    { id: 'command', label: 'COMMAND', icon: '⌁' },
    { id: 'timeline', label: 'TIMELINE', icon: '◷' },
    { id: 'reports', label: 'SITREPS', icon: '▤' },
    { id: 'editor', label: 'SCENARIO LAB', icon: '✎' },
    { id: 'settings', label: 'SETTINGS', icon: '⚙' },
  ]

  return (
    <div className={`app-shell ${settings.reducedMotion ? 'reduced-motion' : ''} ${settings.highContrast ? 'high-contrast' : ''}`} style={{ '--accent': activeScenario.accents[0], '--accent-secondary': activeScenario.accents[1] } as CSSProperties}>
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

        <div className="status-strip"><span className="status-pulse" /> {notice}{settings.captionsEnabled && audioCaption && <span className="audio-caption" aria-live="polite">[CAPTION: {audioCaption}]</span>}<span className="strip-right">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} EST</span></div>

        {view === 'command' && <CommandView incident={incident} scenario={activeScenario} phase={phase} remaining={remaining} progress={progress} elapsed={elapsed} onStart={startIncident} onExit={() => exitIncident('RESOLVED')} onAction={dispatchAction} />}
        {view === 'timeline' && <TimelineView incident={incident ?? lastReplay} onStart={startIncident} onExport={(replay) => {
          const record = replayRecord(replay)
          downloadJson(`${replay.scenario.id}-${record.id}.incident.json`, createIncidentPackage(replay))
        }} />}
        {view === 'reports' && <ReportsView incident={incident ?? lastReplay} scenario={activeScenario} />}
        {view === 'editor' && <EditorView scenario={editorScenario} scenarios={scenarios} selectedId={selectedScenarioId} issues={packIssues} stagedPack={stagedPack} onSelect={setSelectedScenarioId} onUpdate={updateEditorScenario} onSave={() => saveEditorScenario(editorScenario)} onImport={importPack} onInstall={installStagedPack} onExport={() => downloadJson(`${editorScenario.id}-pack.json`, packFromScenarios([editorScenario], 'Local Scenario Export'))} onPreview={() => startSpecificIncident(editorScenario)} />}
        {view === 'settings' && <SettingsView settings={settings} onUpdate={updateSettings} />}
      </main>
    </div>
  )
}

function CommandView({ incident, scenario, phase, remaining, progress, elapsed, onStart, onExit, onAction }: { incident: ActiveIncident | null; scenario: Scenario; phase: Scenario['phases'][number]; remaining: number; progress: number; elapsed: number; onStart: () => void; onExit: () => void; onAction: (actionId: string) => void }) {
  const currentReport = incident?.runtimeState?.reports.at(-1) ?? scenario.reports.find((report) => report.id === phase.reportIds[0]) ?? scenario.reports[0]
  const isLive = Boolean(incident && !incident.resolved)
  const resources = incident?.runtimeState?.resources ?? scenario.resources
  const markers = (incident?.runtimeState?.markers.filter((marker) => marker.visible) ?? scenario.markers)
  return (
    <div className="content-grid">
      <section className="hero-panel panel scanline-overlay">
        <div className="hero-heading"><div><span className="classification">CLASSIFICATION // {scenario.severity}</span><h2>CRITICAL INCIDENT:<br /><em>{scenario.title}</em></h2></div><div className={`severity-seal ${isLive ? 'spinning' : ''}`}><span>SEV</span><strong>{scenario.severity === 'CATASTROPHIC' ? 'X' : scenario.severity === 'CRITICAL' ? '4' : '2'}</strong></div></div>
        <div className="incident-meta"><span>CASE ID <b>PB-{scenario.id.slice(0, 4).toUpperCase()}-{new Date().getFullYear()}</b></span><span>STATUS <b className={isLive ? 'text-alert' : 'text-safe'}>{isLive ? 'ACTIVE' : incident?.resolved ? 'CONTAINED' : 'STANDBY'}</b></span><span>SIMULATION <b className="text-warn">TRUE</b></span></div>
        <div className="countdown-row"><div><span className="tiny-label">TIME TO STABILIZATION</span><div className="countdown">{formatDuration(remaining)}</div></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="phase-readout"><span className="tiny-label">CURRENT PHASE</span><strong>{phase.label}</strong><small>{phase.objective}</small></div></div>
        {!incident && <div className="standby-callout"><span className="standby-icon">✦</span><div><strong>COMMAND CENTER STANDING BY</strong><p>Press the red button or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> to escalate an ordinary problem into an avoidable national emergency.</p></div><button className="primary-button" onClick={onStart}>INITIATE RANDOM INCIDENT <span>→</span></button></div>}
        {incident?.resolved && <div className="standby-callout resolved-callout"><span className="standby-icon">✓</span><div><strong>INCIDENT CONTAINED</strong><p>{scenario.resolution}</p></div><button className="primary-button" onClick={onStart}>NEW INCIDENT <span>→</span></button></div>}
        <div className="map-shell"><div className="map-toolbar"><span>TACTICAL MAP // SYNTHETIC FEED</span><span><i className="map-legend alert" /> COMMAND <i className="map-legend unit" /> UNITS <i className="map-legend neutral" /> UNKNOWN</span></div><div className="tactical-map"><div className="map-water" /><div className="map-road road-a" /><div className="map-road road-b" /><div className="map-road road-c" /><div className="map-blocks" />{markers.map((marker) => <div className={`map-marker ${marker.tone}`} key={marker.id} style={{ left: `${marker.x}%`, top: `${marker.y}%` }}><span className="marker-ping" /><span className="marker-label">{marker.label}</span></div>)}<div className="map-coordinates">40° 42' 46.1" N<br />74° 00' 21.5" W</div><div className="map-stamp">SIMULATED<br />SATELLITE<br />IMAGERY</div></div></div>
      </section>
      <aside className="right-column">
        <section className="panel resource-panel"><PanelHeader title="RESOURCE ALLOCATION" tag="LIVE" /><div className="resource-list">{resources.map((resource) => <div className="resource-row" key={resource.id}><span className="resource-icon" style={{ color: resource.color }}>{resource.icon}</span><span className="resource-name">{resource.label}<small>{resource.unit}</small></span><strong style={{ color: resource.color }}>{resource.value}</strong></div>)}</div><div className="resource-footer"><span>OVERREACTION INDEX</span><strong>{isLiveNumber(incident) ? 94 : 12}<small>/100</small></strong></div></section>
        <section className="panel report-panel"><PanelHeader title="LATEST SITREP" tag={currentReport.classification} /><div className="report-number">REPORT {String(Math.max(0, scenario.reports.findIndex((report) => report.id === currentReport.id) + 1)).padStart(2, '0')} <span>({formatDuration(elapsed)})</span></div><h3>{currentReport.heading}</h3><p>{currentReport.body}</p><div className="recommendation"><span>RECOMMENDATION</span>{currentReport.recommendation}</div><div className="confidence"><span>CONFIDENCE</span><div className="confidence-track"><span style={{ width: `${currentReport.confidence}%` }} /></div><strong>{currentReport.confidence}%</strong></div></section>
        <section className="panel phase-panel"><PanelHeader title="OPERATIONAL PHASES" tag={`${scenario.phases.length} STAGES`} />{scenario.phases.map((item, index) => <div className={`phase-row ${index === (incident?.phaseIndex ?? 0) && isLive ? 'current' : ''} ${index < (incident?.phaseIndex ?? 0) ? 'complete' : ''}`} key={item.id}><span className="phase-index">{index < (incident?.phaseIndex ?? 0) ? '✓' : `0${index + 1}`}</span><span>{item.label}<small>{item.objective}</small></span></div>)}{isLive && scenario.actions?.map((action) => <button className="secondary-button action-button" key={action.id} onClick={() => onAction(action.id)}>{action.label} <span>→</span></button>)}</section>
      </aside>
      <section className="panel ticker-panel"><span className="ticker-label">LIVE WIRE</span><div className="ticker-track"><span>{isLive ? `${phase.alerts[0]} // ${phase.alerts[1] ?? 'MONITORING CONTINUES'} // ${currentReport.recommendation}` : 'NO ACTIVE THREATS // THE HOUSEHOLD REMAINS SUSPICIOUSLY CALM // READY TO OVERREACT'}</span></div><button className="text-button" onClick={onExit}>MARK STABLE</button></section>
    </div>
  )
}

const isLiveNumber = (incident: ActiveIncident | null) => Boolean(incident && !incident.resolved)

function PanelHeader({ title, tag }: { title: string; tag: string }) { return <div className="panel-header"><span>{title}</span><b>{tag}</b></div> }

function TimelineView({ incident, onStart, onExport }: { incident: ActiveIncident | null; onStart: () => void; onExport: (incident: ActiveIncident) => void }) {
  const journal = incident?.journal ?? []
  const [selectedSequence, setSelectedSequence] = useState(journal.length)
  useEffect(() => setSelectedSequence(journal.length), [incident?.startedAt, journal.length])
  const selectedJournal = journal.slice(0, Math.max(0, Math.min(selectedSequence, journal.length)))
  const selectedState = incident && selectedJournal.length > 0 ? reconstructRuntime(incident.scenario, incident.seed ?? createSeed(incident.scenario.id, incident.startedAt), selectedJournal).state : incident?.runtimeState
  const corrupt = incident?.journal && incident.runtimeState ? isRuntimeCorrupt({ state: incident.runtimeState, journal: incident.journal }) : false
  const selectedEvent = journal.find((event) => event.sequence === selectedSequence)
  const categoryCount = (type: string) => journal.filter((event) => event.type === type).length
  return <div className="single-column"><section className="panel detail-panel"><PanelHeader title="INCIDENT TIMELINE // REPLAY FORENSICS" tag={incident ? corrupt ? 'CORRUPT' : 'VERIFIED' : 'NO ACTIVE CASE'} /><div className="detail-intro"><span className="classification">JOURNAL RECONSTRUCTION // SIMULATED DATA</span><h2>{incident ? incident.scenario.title : 'No incident currently deployed'}</h2><p>{incident ? incident.scenario.premise : 'The command center is waiting for a minor inconvenience worthy of escalation.'}</p></div>{incident ? <><div className="detail-actions"><button className="secondary-button" onClick={() => onExport(incident)}>EXPORT INCIDENT PACKAGE</button>{corrupt && <span className="validation-box error">CORRUPT JOURNAL // NO AUTOMATIC REPLAY</span>}</div>{journal.length > 0 && <div className="replay-scrubber"><label htmlFor="replay-sequence">INSPECT EVENT SEQUENCE <b>{selectedSequence}/{journal.length}</b></label><input id="replay-sequence" type="range" min="1" max={journal.length} value={Math.max(1, selectedSequence)} onChange={(event) => setSelectedSequence(Number(event.target.value))} /><div className="replay-selected"><span>{selectedEvent?.type ?? 'FINAL STATE'}</span><strong>{selectedEvent?.eventDigest ?? incident.summary?.finalStateDigest ?? 'UNAVAILABLE'}</strong></div></div>}<div className="replay-metrics"><span>ALERTS <b>{categoryCount('AlertRaised')}</b></span><span>REPORTS <b>{categoryCount('ReportPublished')}</b></span><span>BRANCHES <b>{categoryCount('BranchSelected')}</b></span><span>ACTIONS <b>{categoryCount('OperatorActionCommitted')}</b></span><span>CONTRADICTIONS <b>{selectedState?.contradictionCount ?? 0}</b></span></div>{selectedState && <div className="replay-state-grid"><div><span className="tiny-label">STATE AT SEQUENCE {selectedSequence}</span><p>PHASE {selectedState.phaseIndex + 1} // {selectedState.lifecycle} // T+{Math.floor(selectedState.simulationTimeMs / 1000)}s</p></div><div><span className="tiny-label">RESOURCE DELTAS</span><p>{selectedState.resources.map((resource) => `${resource.label}: ${resource.value}`).join(' // ')}</p></div><div><span className="tiny-label">MARKER HISTORY</span><p>{selectedState.markers.filter((marker) => marker.visible).map((marker) => marker.label).join(' // ') || 'NONE'}</p></div></div>}<div className="timeline-list">{(incident.events.length ? incident.events : []).map((event) => <div className={`timeline-event ${selectedSequence === journal.find((item) => item.eventDigest === event.id.split('-').at(-1))?.sequence ? 'selected' : ''}`} key={event.id}><span className={`timeline-dot ${event.tone}`} /><span className="timeline-time">{event.time}</span><div><strong>{event.label}</strong><p>{event.detail}</p></div></div>)}</div></> : <button className="primary-button" onClick={onStart}>TRIGGER RANDOM INCIDENT <span>→</span></button>}</section></div>
}

function ReportsView({ incident, scenario }: { incident: ActiveIncident | null; scenario: Scenario }) {
  return <div className="single-column"><section className="panel detail-panel"><PanelHeader title="SITUATION REPORTS" tag="EYES ONLY" /><div className="report-grid">{scenario.reports.map((report, index) => <article className={`report-card ${incident?.phaseIndex === index ? 'selected' : ''}`} key={report.id}><div className="report-card-top"><span>{report.classification}</span><b>REPORT {String(index + 1).padStart(2, '0')}</b></div><h3>{report.heading}</h3><p>{report.body}</p><div className="report-card-footer"><span>RECOMMENDATION</span><strong>{report.recommendation}</strong><em>{report.confidence}% CONFIDENCE</em></div></article>)}</div></section></div>
}

function EditorView({ scenario, scenarios, selectedId, issues, stagedPack, onSelect, onUpdate, onSave, onImport, onInstall, onExport, onPreview }: { scenario: Scenario; scenarios: Scenario[]; selectedId: string; issues: ValidationIssue[]; stagedPack: PackRecord | null; onSelect: (id: string) => void; onUpdate: (patch: Partial<Scenario>) => void; onSave: () => boolean; onImport: (file: File) => void; onInstall: () => void; onExport: () => void; onPreview: () => void }) {
  const [saved, setSaved] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const save = () => { if (onSave()) { setSaved(true); window.setTimeout(() => setSaved(false), 1600) } }
  return <div className="single-column"><section className="panel editor-panel"><PanelHeader title="SCENARIO LAB" tag="LOCAL AUTHORING" /><div className="editor-toolbar"><div><span className="tiny-label">SCENARIO PACK</span><select value={selectedId} onChange={(event) => onSelect(event.target.value)}>{scenarios.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></div><div className="editor-actions"><input ref={fileInput} type="file" accept="application/json,.json,.panicpack" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = '' }} /><button className="secondary-button" onClick={() => fileInput.current?.click()}>IMPORT PACK</button>{stagedPack && <button className="primary-button small" onClick={onInstall}>INSTALL STAGED PACK</button>}<button className="secondary-button" onClick={onExport}>EXPORT PACK</button><button className="secondary-button" onClick={() => setJsonOpen(!jsonOpen)}>{jsonOpen ? 'HIDE JSON' : 'VIEW JSON'}</button><button className="secondary-button" onClick={onPreview}>PREVIEW INCIDENT</button><button className="primary-button small" onClick={save}>{saved ? 'SAVED ✓' : 'SAVE DRAFT'}</button></div></div><div className="editor-grid"><label><span>TITLE</span><input value={scenario.title} onChange={(event) => onUpdate({ title: event.target.value.toUpperCase() })} /></label><label><span>SEVERITY</span><select value={scenario.severity} onChange={(event) => onUpdate({ severity: event.target.value as Scenario['severity'] })}><option>LOW</option><option>ELEVATED</option><option>CRITICAL</option><option>CATASTROPHIC</option></select></label><label className="wide"><span>PREMISE</span><textarea value={scenario.premise} onChange={(event) => onUpdate({ premise: event.target.value })} rows={3} /></label><label><span>DURATION (SECONDS)</span><input type="number" min="15" max="300" value={scenario.durationSeconds} onChange={(event) => onUpdate({ durationSeconds: Math.max(15, Math.min(300, Number(event.target.value))) })} /></label><label><span>RESOLUTION</span><input value={scenario.resolution} onChange={(event) => onUpdate({ resolution: event.target.value })} /></label></div>{issues.length > 0 && <div className="validation-box"><strong>PACK VALIDATION</strong>{issues.map((item) => <div className={item.severity} key={`${item.path}-${item.message}`}>{item.path}: {item.message}</div>)}</div>}{jsonOpen && <pre className="json-preview">{JSON.stringify(scenario, null, 2)}</pre>}<div className="editor-note"><span>ⓘ</span><p>Scenario packs are staged, admitted, and explicitly installed. Executable code, external URLs, arbitrary paths, and unsafe assets are rejected by the pack validator before activation.</p></div></section></div>
}

function SettingsView({ settings, onUpdate }: { settings: Settings; onUpdate: (patch: Partial<Settings>) => void }) {
  return <div className="single-column"><section className="panel detail-panel settings-panel"><PanelHeader title="SYSTEM SETTINGS" tag="LOCAL ONLY" /><div className="settings-form"><div className="setting-section"><span className="classification">TRIGGER</span><h2>How should we overreact?</h2><label><span>TRIGGER CHORD</span><input value={settings.triggerBinding.chord} onChange={(event) => onUpdate({ triggerLabel: event.target.value.toUpperCase(), triggerBinding: { ...settings.triggerBinding, chord: event.target.value } })} /><small>Register one explicit chord only. Keyboard-emulation USB buttons that emit this chord are supported; arbitrary keyboard capture is not.</small></label><Toggle label="Global trigger enabled" checked={settings.triggerBinding.enabled} onChange={(checked) => onUpdate({ triggerBinding: { ...settings.triggerBinding, enabled: checked } })} /><label className="range-label"><span>POST-INCIDENT COOLDOWN <b>{settings.cooldownSeconds}s</b></span><input type="range" min="0" max="30" step="1" value={settings.cooldownSeconds} onChange={(event) => onUpdate({ cooldownSeconds: Number(event.target.value) })} /></label></div><div className="setting-section"><span className="classification">THEATRICS</span><h2>Control the spectacle</h2><label className="range-label"><span>DEFAULT INCIDENT LENGTH <b>{settings.durationSeconds}s</b></span><input type="range" min="15" max="300" step="5" value={settings.durationSeconds} onChange={(event) => onUpdate({ durationSeconds: Number(event.target.value) })} /></label><Toggle label="Alert sounds" checked={settings.soundEnabled} onChange={(checked) => onUpdate({ soundEnabled: checked })} /><label className="range-label"><span>EFFECTS VOLUME <b>{Math.round(settings.effectsVolume * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value={settings.effectsVolume} onChange={(event) => onUpdate({ effectsVolume: Number(event.target.value) })} /></label><Toggle label="Captions / audio transcripts" checked={settings.captionsEnabled} onChange={(checked) => onUpdate({ captionsEnabled: checked })} /><Toggle label="Reduced motion" checked={settings.reducedMotion} onChange={(checked) => onUpdate({ reducedMotion: checked })} /><Toggle label="High contrast" checked={settings.highContrast} onChange={(checked) => onUpdate({ highContrast: checked })} /><Toggle label="Always on top" checked={settings.alwaysOnTop} onChange={(checked) => onUpdate({ alwaysOnTop: checked })} /><Toggle label="Mirror to secondary displays" checked={settings.mirrorSecondary} onChange={(checked) => onUpdate({ mirrorSecondary: checked })} /></div></div></section></div>
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <button className={`toggle-row ${checked ? 'checked' : ''}`} onClick={() => onChange(!checked)}><span>{label}</span><span className="toggle"><i /></span></button> }

export default App
