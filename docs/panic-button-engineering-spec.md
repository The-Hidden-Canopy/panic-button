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
- Ten built-in scenarios plus a form-driven local scenario editor.
- Validated JSON scenario-pack import/export with data-only safety boundaries.
- Journal-first deterministic incident runtime with replay input and digest verification.
- Versioned, checksummed local persistence with backup fallback and interrupted-run recovery markers.
- Hotkey debounce and configurable post-incident cooldown.
- Pack-size, duplicate-id, SHA-256 manifest, and unsafe-path checks.
- Optional Ed25519 pack signature verification and minimum-app-version compatibility checks.
- Native SQLite persistence with incident/event/trusted-signer tables and browser-compatible fallback.
- Optional secondary-display surveillance mirrors labeled as simulated.
- Synthetic maps, fake satellite layers, situation reports, resources, timelines, and alert audio.
- No accounts, telemetry, cloud dependency, arbitrary commands, or runtime network assets.

## Runtime state machine

```text
IDLE -> ARMING -> ACTIVE -> RESOLVING -> SUMMARY -> IDLE
Any state -> EMERGENCY_EXIT -> ABORTED -> IDLE
Any interrupted active state -> RECOVERING -> ABORTED -> IDLE
```

`IDLE` registers the trigger. `ARMING` selects and validates a scenario. `ACTIVE` advances a virtual monotonic simulation clock and reduces a journal of validated events. `RESOLVING` records the final transition, and `SUMMARY` presents derived metrics and replay actions. `EMERGENCY_EXIT` appends an abort event, stops sound, closes mirrors, and returns the user to a safe normal state. `Esc` is unconditional.

The initial duration is 90 seconds and is configurable between 15 and 300 seconds.

## Architecture

### Native layer

- `src-tauri/src/lib.rs`: application bootstrap, global shortcut plugin, native commands.
- `src-tauri/tauri.conf.json`: secure window configuration and content security policy.
- `src-tauri/capabilities/default.json`: minimal permissions for the main window and shortcut registration.

### Frontend layer

- `src/App.tsx`: command center, timeline, situation reports, scenario lab, and settings.
- `src/data/scenarios.ts`: built-in incident content.
- `src/lib/incidentEngine.ts`: compatibility helpers for the dashboard projection.
- `src/lib/deterministicRuntime.ts`: pure reducer, journal, virtual clock, named seeded PRNG streams, bounded actions, graph migration, recovery, and replay verification.
- `src/lib/native.ts`: Tauri shortcut registration with browser fallback.
- `src/styles.css`: retro disaster-broadcast visual system.

## Scenario contract

Scenarios are data-only. The pack validator rejects executable code, shell commands, external URLs, unsafe filesystem paths, oversized assets, invalid durations, missing resolution content, broken report references, and out-of-range map markers before activation.

Scenario packs are schema version 2 at the runtime boundary. Legacy phase lists migrate into bounded `PHASE` nodes ending at a `TERMINAL`; built-in packs include data-only `CHOICE` nodes and closed action kinds. The graph validator rejects dangling edges, unreachable nodes, missing terminals, oversized graphs, unbounded action amounts, and unsupported fields. Pack signature validity is separate from signer trust: an otherwise valid signature is not automatically trusted.

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

The browser preview keeps versioned/checksummed local settings and drafts for iteration. In packaged Tauri builds, the authoritative incident journal is appended to SQLite in WAL mode (`incidents` and `incident_events`), with `trusted_signers` storing explicit `trusted`, `local`, `blocked`, or `unknown` states. Signed packs are verified when signatures are present, but signature validity and trust are separate decisions. Runtime remains offline.

## Safety requirements

- Never disable Task Manager or Windows security shortcuts.
- Never lock the computer or alter the Windows shell.
- Never capture arbitrary keyboard input; register only the chosen hotkey.
- Never execute scenario-defined code.
- Never fetch external map, audio, font, or image assets at runtime.
- Always keep `Esc` available as a fast emergency exit.
- If a run is interrupted, record it as aborted and start cleanly next time.
- Replays are reconstructed from pack/scenario digest, seed, settings projection, and ordered actions; the final React snapshot is not the source of truth.
- Corrupt journal chains are not auto-replayed; they remain exportable for recovery inspection.

## Acceptance criteria

- A user can trigger the app from another foreground application.
- The dashboard appears without changing the rest of Windows.
- Built-in scenarios run offline and progress through multiple phases.
- Ten built-in scenarios are upgraded to deterministic schema-v2 runtime records; three include meaningful data-only branches and closed operator actions.
- Auto-dismiss and emergency exit work from every state.
- The editor can modify, validate, preview, save, import, and export a scenario draft.
- Ten built-in scenarios run offline and each has multiple timed phases, map markers, resources, reports, and a resolution.
- Replay records can be persisted locally and exported as JSON.
- Interrupted active runs are recovered as `ERROR` replays on the next launch.
- Repeated trigger presses are debounced and incidents observe a configurable cooldown.
- Windows packaging produces an NSIS current-user installer artifact.
- Signed packs are verified with Ed25519 metadata and incompatible minimum-app versions are rejected.
- Secondary displays show a full-screen simulated surveillance projection of the same native-persisted runtime state.
- The browser preview and Tauri shell share the same incident behavior.
- `npm test`, `npm run build`, `npm audit --audit-level=high`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `npm run tauri:build` pass.
- Malformed or unsafe scenario packs are rejected before activation.

## Future slices

1. Add signed update manifests, explicit approval, and rollback for remote pack distribution.
2. Add code signing and clean-machine Windows acceptance automation.
3. Add richer SQLite replay queries and retention controls.
4. Add bundled local audio assets and captioned radio chatter.
