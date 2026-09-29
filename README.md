# PANIC BUTTON

> A wildly overproduced emergency command center for ordinary problems.

`CRITICAL INCIDENT: PIZZA 14 MINUTES LATE.`

Panic Button is a local-first Windows desktop party app for turning mundane inconveniences into absurd incident-response operations. It provides a theatrical dashboard with a synthetic tactical map, fake situation reports, resource allocation, live timelines, escalating alerts, and a red button that should probably not be pressed.

## Current build

The repository contains a working engineering build:

- React + TypeScript command-center UI.
- Tauri 2 native desktop shell.
- Native `Ctrl + Shift + P` global shortcut in Tauri builds.
- Browser preview fallback with the same shortcut.
- Safe `Esc` emergency exit.
- Automatic incident progression and stabilization.
- Synthetic map and simulated satellite imagery labels.
- Situation reports, resource allocation, timeline, and replay state.
- Scenario editor with validation, JSON preview, draft persistence, import, export, and preview activation.
- Strict data-only scenario-pack validation with unsafe-field, path, asset, duration, and reference checks.
- Versioned, checksummed local storage with backup fallback and interrupted-run recovery.
- Hotkey debounce plus configurable post-incident cooldown.
- Scenario-pack byte limits, duplicate-id checks, safe path checks, and SHA-256 manifest validation.
- Local replay persistence and replay JSON export.
- Local settings for sound, reduced motion, display behavior, and duration.
- Ten built-in scenarios covering mundane household, office, delivery, and device incidents.
- Automated Vitest coverage for the incident engine and pack validator.

The current persistence boundary is versioned browser/Tauri local storage with checksums, backup fallback, and crash recovery markers so the same build works in offline browser preview and the desktop shell. SQLite history, signed update manifests, multi-monitor mirroring, and code signing remain later release-hardening work.

This is deliberately theatrical: it does not lock the computer, disable Windows controls, execute scenario code, or make network requests at runtime.

## Run the browser preview

```powershell
npm install
npm run dev
```

Open `http://127.0.0.1:4173`, then press the red button or `Ctrl + Shift + P`.

## Run the Tauri desktop shell

```powershell
npm install
npm run tauri:dev
```

The native shell registers `CommandOrControl+Shift+P` through Tauri's global shortcut plugin. Generic USB buttons that emit that keyboard shortcut work without vendor-specific drivers.

## Build checks

```powershell
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
npm test
npm audit --audit-level=high
npm run tauri:build
```

`npm run tauri:build` produces a Windows executable and an NSIS current-user installer under `src-tauri/target/release/bundle/`.

## Project map

```text
src/
  App.tsx                 command center, timeline, reports, editor, settings
  data/scenarios.ts       built-in scenario pack
  lib/incidentEngine.ts   incident state and timeline helpers
  lib/native.ts           Tauri/browser trigger boundary
  lib/storage.ts          versioned settings, drafts, replays, recovery markers
  lib/triggerGuard.ts     debounce and post-incident cooldown gate
  styles.css              retro disaster-broadcast visual system
src-tauri/
  src/lib.rs              native shell and global shortcut registration
  tauri.conf.json         desktop window and security policy
scripts/
  generate-icon.mjs       reproducible local Windows icon generation
docs/
  panic-button-engineering-spec.md
```

## Safety and privacy

- Local/offline by default.
- No accounts, analytics, telemetry, or external map tiles.
- Scenario packs are data-only JSON; executable content is not supported.
- `Esc` is always the emergency exit.
- Full-screen theatrics remain inside the app window and do not alter the Windows shell.
- All map and satellite imagery is synthetic and labeled as simulated.

## License

MIT. Copyright Hidden Canopy.
