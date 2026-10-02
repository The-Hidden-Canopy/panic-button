# PANIC BUTTON — Acceptance Matrix

This matrix separates what is shipped and reproducibly checked in the repository from what requires a Windows host, a physical device, or a release operator. It is intentionally conservative: a passing TypeScript test is not presented as proof of a visible desktop window, a second monitor, or a signed installer.

## Automated repository gates

| ID | Gate | Evidence | Status |
| --- | --- | --- | --- |
| PB-A01 | Deterministic incident reducer, lifecycle, virtual clock, seeded streams, journal hash chain, replay digest | `src/lib/deterministicRuntime.test.ts`; `npm test -- --run` | Shipped; automated |
| PB-A02 | Graph migration, bounded branching, conditions, consequences, closed operator actions | `src/lib/deterministicRuntime.test.ts`, `src/lib/packValidator.test.ts` | Shipped; automated |
| PB-A03 | Malformed graph fixtures, monotonic simulation time, same-time action ordering | `src/lib/deterministicRuntime.fuzz.test.ts` | Shipped; automated |
| PB-A04 | Data-only pack boundary: no code, commands, URLs, traversal, oversized input, invalid assets, or unsafe graph | `src/lib/packValidator.test.ts`; `validatePack`/`validateScenarioGraph` | Shipped; automated |
| PB-A05 | Ed25519 signature verification is distinct from explicit signer trust | `src/lib/packValidator.test.ts`; `admitPack` | Shipped; automated |
| PB-A06 | Versioned checksummed browser persistence and tamper rejection | `src/lib/storage.test.ts` | Shipped; automated |
| PB-A07 | Trigger debounce, active-run lockout, and post-incident cooldown | `src/lib/triggerGuard.test.ts` | Shipped; automated |
| PB-A08 | Ten built-in scenarios validate as one offline pack | `src/lib/packValidator.test.ts`; `src/data/scenarios.ts` | Shipped; automated |
| PB-A09 | Local audio cue limits and caption requirements | `src/lib/packValidator.test.ts`; `src/lib/audio.ts` | Shipped; automated |
| PB-A10 | Frontend typecheck and production web bundle | `npx tsc -b`; `npm run build` | Shipped; automated |
| PB-A11 | Dependency vulnerability gate | `npm audit --audit-level=high` | Release command; result depends on current registry advisories |
| PB-A12 | Native Rust formatting and compilation | `cargo fmt --check --manifest-path src-tauri/Cargo.toml`; `cargo check --manifest-path src-tauri/Cargo.toml` | Release command; host/toolchain dependent |
| PB-A13 | Windows Tauri packaging and NSIS artifact | `npm run tauri:build` | Release command; Windows/toolchain dependent |

Current local verification for the implementation milestone: 6 Vitest files and 31 tests passed, TypeScript typecheck passed, and previous Windows Tauri packaging produced the NSIS installer. The next packaging run must be repeated after any source change that affects the installer.

## Windows host acceptance

These checks are deliberately not implied by browser tests or a Linux CI job.

| ID | Host check | Required evidence | Status |
| --- | --- | --- | --- |
| PB-W01 | Launch from another foreground Windows application with the configured global chord | Screen recording or test log showing trigger, visible alert, and no change to the foreground app's data | Host-dependent; run on clean Windows 10 and 11 |
| PB-W02 | `Esc` exits from idle, arming, active, resolving, summary, and recovery | Manual matrix with each state and post-exit window/audio check | Host-dependent |
| PB-W03 | Full-screen behavior and restoration at 100%, 125%, 150%, and 200% scaling | Per-scale screenshots and restoration notes | Host-dependent |
| PB-W04 | Single monitor and secondary surveillance mirror | Two-display capture with `SIMULATED DATA` label and synchronized phase/marker values | Host-dependent |
| PB-W05 | Generic USB/HID keyboard-emulation button | Device setup log showing the configured chord and one debounced incident | Physical-device dependent |
| PB-W06 | Audio device disconnect/reconnect and master mute | Manual run log showing no crash and captions remaining available | Host/device dependent |
| PB-W07 | Sleep/wake, termination during incident, and restart recovery | Recovery package with aborted/error record and no stuck theater window | Host-dependent |
| PB-W08 | Per-user install, uninstall, reinstall, and user-pack preservation | Installer transcript and before/after application-data inventory | Clean-machine dependent |
| PB-W09 | Offline first launch and offline incident run | Network-disabled run log; no external requests required | Clean-machine dependent |

## Release and security gates

| ID | Gate | Required evidence | Status |
| --- | --- | --- | --- |
| PB-R01 | Installer code signing | Authenticode signature and timestamp verified on the exact published installer | Not performed in repository build |
| PB-R02 | Signed pack installation | A signed pack fixture is admitted, an unknown signer is staged as untrusted, and explicit trust changes admission to trusted | Logic shipped and tested; release fixture/operator check remains |
| PB-R03 | Optional update manifest, approval, hash verification, and rollback | Signed manifest fixture plus rollback test | Future slice |
| PB-R04 | Privacy review | Confirm no telemetry, account, runtime network, arbitrary command, or external asset path | Source boundary shipped; final release review required |
| PB-R05 | Accessibility review | Keyboard-only pass, captions, mute, reduced motion, high contrast, and readable scaling | Controls shipped; human visual/assistive-technology review required |

## How to run the repository gates

From the repository root:

```powershell
npm install
npm run verify
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

`npm run verify` runs the test suite, production web build, and high-severity audit gate. It does not claim the host-dependent rows above. The app remains a safe theatrical window: it never disables Task Manager, intercepts system security shortcuts, executes pack-defined code, or changes the Windows shell.
