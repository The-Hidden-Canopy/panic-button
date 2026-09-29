# PANIC BUTTON

> A wildly overproduced emergency command center for ordinary problems.

`CRITICAL INCIDENT: PIZZA 14 MINUTES LATE.`

Panic Button is a local-first Windows desktop party app for turning mundane inconveniences into absurd incident-response operations. It provides a theatrical dashboard with a synthetic tactical map, fake situation reports, resource allocation, live timelines, escalating alerts, and a red button that should probably not be pressed.

## Current build

The repository contains the first working vertical slice:

- React + TypeScript command-center UI.
- Tauri 2 native desktop shell.
- Native `Ctrl + Shift + P` global shortcut in Tauri builds.
- Browser preview fallback with the same shortcut.
- Safe `Esc` emergency exit.
- Automatic incident progression and stabilization.
- Synthetic map and simulated satellite imagery labels.
- Situation reports, resource allocation, timeline, and replay state.
- Local scenario editor foundation with JSON preview and draft persistence.
- Local settings for sound, reduced motion, display behavior, and duration.
- Two built-in scenarios, with the architecture ready for scenario packs.

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
```

## Project map

```text
src/
  App.tsx                 command center, timeline, reports, editor, settings
  data/scenarios.ts       built-in scenario pack
  lib/incidentEngine.ts   incident state and timeline helpers
  lib/native.ts           Tauri/browser trigger boundary
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
