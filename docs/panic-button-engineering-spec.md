# PANIC BUTTON — Engineering Specification

## Product decision

Panic Button is a standalone Windows desktop party app, not a host plugin. Its extension boundary is a validated JSON scenario-pack format. The first release is local-first, offline by default, and theatrically disruptive only inside its own full-screen window.

## V1 scope

- Windows 10/11 x64.
- Tauri 2 shell with React and TypeScript UI.
- Rust native layer for global shortcut registration and window lifecycle.
- Browser preview fallback for rapid iteration.
- Safe `Esc` emergency exit from every runtime state.
- Default `Ctrl + Shift + P` global trigger.
- Generic HID support through keyboard-emulation buttons.
- Built-in scenario pack plus local scenario editor foundation.
- Synthetic maps, fake satellite layers, situation reports, resources, timelines, and alert audio.
- No accounts, telemetry, cloud dependency, arbitrary commands, or runtime network assets.

## Runtime state machine

```text
IDLE -> ARMING -> ACTIVE -> AUTO_DISMISS -> SUMMARY -> IDLE
Any state -> EMERGENCY_EXIT -> RECOVERING -> IDLE
```

`IDLE` registers the trigger. `ARMING` selects and validates a scenario. `ACTIVE` runs timed phases and updates the dashboard. `AUTO_DISMISS` resolves the incident after its configured duration. `SUMMARY` presents absurd metrics and replay actions. `EMERGENCY_EXIT` stops sound and returns the user to a safe normal state.

The initial duration is 90 seconds and is configurable between 15 and 300 seconds.

## Architecture

### Native layer

- `src-tauri/src/lib.rs`: application bootstrap, global shortcut plugin, native commands.
- `src-tauri/tauri.conf.json`: secure window configuration and content security policy.
- `src-tauri/capabilities/default.json`: minimal permissions for the main window and shortcut registration.

### Frontend layer

- `src/App.tsx`: command center, timeline, situation reports, scenario lab, and settings.
- `src/data/scenarios.ts`: built-in incident content.
- `src/lib/incidentEngine.ts`: incident creation, phase selection, timing, and event formatting.
- `src/lib/native.ts`: Tauri shortcut registration with browser fallback.
- `src/styles.css`: retro disaster-broadcast visual system.

## Scenario contract

Scenarios are data-only. A future pack validator must reject executable code, shell commands, external URLs, arbitrary filesystem paths, oversized assets, invalid durations, and missing resolution content.

```ts
type ScenarioPack = {
  id: string;
  name: string;
  version: string;
  author: string;
  scenarios: Scenario[];
  assets: AssetManifest[];
  signature?: PackSignature;
};

type Scenario = {
  id: string;
  title: string;
  premise: string;
  severity: "LOW" | "ELEVATED" | "CRITICAL" | "CATASTROPHIC";
  durationSeconds: number;
  phases: IncidentPhase[];
  resources: ResourceTemplate[];
  reports: ReportTemplate[];
  map: MapDefinition;
  audio: AudioCue[];
  resolution: ResolutionDefinition;
};
```

## UI requirements

The command center contains a classified incident header, countdown, severity seal, synthetic tactical map, resource rail, current situation report, operational phases, and live-wire ticker. All imagery is visibly marked `SIMULATED SATELLITE IMAGERY`.

The Scenario Lab supports title, premise, severity, duration, resolution, scenario selection, draft saving, JSON preview, and preview activation. It is intentionally form-driven rather than scriptable.

Accessibility requirements include keyboard navigation, high contrast, mute controls, captions/transcripts for spoken audio, and reduced motion that removes flashing, shake, scanline animation, and rapid transitions.

## Native commands and events

Reserved Tauri command names:

```text
settings.get
settings.update
trigger.getStatus
trigger.configure
trigger.test
incident.start
incident.dismiss
incident.getActive
incident.exportReplay
scenario.list
scenario.get
scenario.validate
scenario.save
scenario.preview
pack.import
pack.export
pack.remove
pack.checkForUpdates
accessibility.get
accessibility.update
```

Frontend event names:

```text
trigger-fired
incident-phase-changed
incident-alert
incident-report
incident-resource-updated
incident-timeline-event
incident-countdown
incident-completed
incident-aborted
runtime-error
```

## Storage and update boundary

The target persistence model is versioned settings JSON, local scenario packs, and SQLite incident/replay history. Writes must be atomic. Runtime remains offline. Optional future pack updates require signed manifests, SHA-256 asset hashes, compatibility checks, explicit user approval, and rollback.

## Safety requirements

- Never disable Task Manager or Windows security shortcuts.
- Never lock the computer or alter the Windows shell.
- Never capture arbitrary keyboard input; register only the chosen hotkey.
- Never execute scenario-defined code.
- Never fetch external map, audio, font, or image assets at runtime.
- Always keep `Esc` available as a fast emergency exit.
- If a run is interrupted, record it as aborted and start cleanly next time.

## Acceptance criteria

- A user can trigger the app from another foreground application.
- The dashboard appears without changing the rest of Windows.
- Built-in scenarios run offline and progress through multiple phases.
- Auto-dismiss and emergency exit work from every state.
- The editor can modify, preview, and save a scenario draft.
- The browser preview and Tauri shell share the same incident behavior.
- `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass.
- Future malformed or unsafe scenario packs are rejected before activation.

## Future slices

1. Add SQLite-backed run history and replay export.
2. Add multi-monitor surveillance windows.
3. Add signed scenario-pack import/update flow.
4. Add more built-in scenarios and local audio assets.
5. Add Windows installer packaging after a verified icon/resource pipeline.
