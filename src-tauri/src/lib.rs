use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::json;
use std::fs;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::ShortcutState;

#[derive(Clone, Serialize)]
struct TriggerEvent {
    shortcut: String,
}

#[tauri::command]
fn app_info() -> &'static str {
    "PANIC BUTTON // LOCAL INCIDENT COMMAND"
}

#[tauri::command]
fn native_hotkey() -> &'static str {
    "CommandOrControl+Shift+P"
}

fn storage_connection(app: &AppHandle) -> Result<Connection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    let database_path = app_data_dir.join("panic-button.sqlite3");
    let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS kv_store (
                 key TEXT PRIMARY KEY NOT NULL,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS incidents (
                 incident_id TEXT PRIMARY KEY NOT NULL,
                 lifecycle TEXT NOT NULL,
                 started_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS incident_events (
                 incident_id TEXT NOT NULL,
                 sequence INTEGER NOT NULL,
                 event_json TEXT NOT NULL,
                 event_digest TEXT NOT NULL,
                 created_at INTEGER NOT NULL,
                 PRIMARY KEY (incident_id, sequence)
             );
             CREATE TABLE IF NOT EXISTS trusted_signers (
                 fingerprint TEXT PRIMARY KEY NOT NULL,
                 display_name TEXT NOT NULL,
                 public_key TEXT NOT NULL,
                 trust_state TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS settings (
                 key TEXT PRIMARY KEY NOT NULL,
                 value TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS scenario_packs (
                 pack_id TEXT NOT NULL,
                 version TEXT NOT NULL,
                 digest TEXT NOT NULL,
                 pack_json TEXT NOT NULL,
                 admission_json TEXT NOT NULL,
                 install_state TEXT NOT NULL,
                 staged_at INTEGER NOT NULL,
                 installed_at INTEGER,
                 PRIMARY KEY (pack_id, version)
             );
             CREATE TABLE IF NOT EXISTS scenario_drafts (
                 scenario_id TEXT PRIMARY KEY NOT NULL,
                 scenario_json TEXT NOT NULL,
                 updated_at INTEGER NOT NULL
             );",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

#[tauri::command]
fn incident_store_event(
    app: AppHandle,
    incident_id: String,
    sequence: i64,
    event_json: String,
    event_digest: String,
    lifecycle: String,
    started_at: i64,
) -> Result<(), String> {
    let mut connection = storage_connection(&app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO incidents (incident_id, lifecycle, started_at, updated_at) VALUES (?1, ?2, ?3, unixepoch())
             ON CONFLICT(incident_id) DO UPDATE SET lifecycle = excluded.lifecycle, updated_at = excluded.updated_at",
            params![incident_id, lifecycle, started_at],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT OR IGNORE INTO incident_events (incident_id, sequence, event_json, event_digest, created_at) VALUES (?1, ?2, ?3, ?4, unixepoch())",
            params![incident_id, sequence, event_json, event_digest],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[tauri::command]
fn incident_load_events(app: AppHandle, incident_id: String) -> Result<Vec<String>, String> {
    let connection = storage_connection(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT event_json FROM incident_events WHERE incident_id = ?1 ORDER BY sequence ASC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![incident_id], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn trust_signer(
    app: AppHandle,
    fingerprint: String,
    display_name: String,
    public_key: String,
    trust_state: String,
) -> Result<(), String> {
    if !matches!(
        trust_state.as_str(),
        "trusted" | "local" | "blocked" | "unknown"
    ) {
        return Err("unsupported trust state".to_string());
    }
    let connection = storage_connection(&app)?;
    connection
        .execute(
            "INSERT INTO trusted_signers (fingerprint, display_name, public_key, trust_state, updated_at) VALUES (?1, ?2, ?3, ?4, unixepoch())
             ON CONFLICT(fingerprint) DO UPDATE SET display_name = excluded.display_name, public_key = excluded.public_key, trust_state = excluded.trust_state, updated_at = excluded.updated_at",
            params![fingerprint, display_name, public_key, trust_state],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn trusted_signers(app: AppHandle) -> Result<Vec<String>, String> {
    let connection = storage_connection(&app)?;
    let mut statement = connection
        .prepare("SELECT json_object('fingerprint', fingerprint, 'displayName', display_name, 'publicKey', public_key, 'trustState', trust_state) FROM trusted_signers ORDER BY display_name ASC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn pack_stage(
    app: AppHandle,
    pack_id: String,
    version: String,
    digest: String,
    pack_json: String,
    admission_json: String,
    install_state: String,
    staged_at: i64,
) -> Result<(), String> {
    if !matches!(install_state.as_str(), "STAGED" | "INSTALLED" | "RETIRED") {
        return Err("unsupported pack install state".to_string());
    }
    let connection = storage_connection(&app)?;
    connection
        .execute(
            "INSERT INTO scenario_packs (pack_id, version, digest, pack_json, admission_json, install_state, staged_at, installed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CASE WHEN ?6 = 'INSTALLED' THEN unixepoch() ELSE NULL END)
             ON CONFLICT(pack_id, version) DO UPDATE SET digest = excluded.digest, pack_json = excluded.pack_json, admission_json = excluded.admission_json, install_state = excluded.install_state, staged_at = excluded.staged_at, installed_at = excluded.installed_at",
            params![pack_id, version, digest, pack_json, admission_json, install_state, staged_at],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn pack_install(
    app: AppHandle,
    pack_id: String,
    version: String,
    installed_at: i64,
) -> Result<(), String> {
    let connection = storage_connection(&app)?;
    connection
        .execute(
            "UPDATE scenario_packs SET install_state = 'INSTALLED', installed_at = ?3 WHERE pack_id = ?1 AND version = ?2",
            params![pack_id, version, installed_at],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn pack_list(app: AppHandle) -> Result<Vec<String>, String> {
    let connection = storage_connection(&app)?;
    let mut statement = connection
        .prepare("SELECT pack_id, version, digest, pack_json, admission_json, install_state, staged_at, installed_at FROM scenario_packs ORDER BY staged_at DESC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(json!({
                "packId": row.get::<_, String>(0)?,
                "version": row.get::<_, String>(1)?,
                "digest": row.get::<_, String>(2)?,
                "packJson": row.get::<_, String>(3)?,
                "admissionJson": row.get::<_, String>(4)?,
                "state": row.get::<_, String>(5)?,
                "stagedAt": row.get::<_, i64>(6)?,
                "installedAt": row.get::<_, Option<i64>>(7)?
            })
            .to_string())
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn pack_remove(app: AppHandle, pack_id: String, version: String) -> Result<(), String> {
    let connection = storage_connection(&app)?;
    connection
        .execute(
            "DELETE FROM scenario_packs WHERE pack_id = ?1 AND version = ?2",
            params![pack_id, version],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn draft_save(
    app: AppHandle,
    scenario_id: String,
    scenario_json: String,
    updated_at: i64,
) -> Result<(), String> {
    let connection = storage_connection(&app)?;
    connection
        .execute(
            "INSERT INTO scenario_drafts (scenario_id, scenario_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(scenario_id) DO UPDATE SET scenario_json = excluded.scenario_json, updated_at = excluded.updated_at",
            params![scenario_id, scenario_json, updated_at],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn draft_list(app: AppHandle) -> Result<Vec<String>, String> {
    let connection = storage_connection(&app)?;
    let mut statement = connection
        .prepare("SELECT scenario_json FROM scenario_drafts ORDER BY updated_at DESC")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn storage_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    let connection = storage_connection(&app)?;
    connection
        .query_row(
            "SELECT value FROM kv_store WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn storage_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let connection = storage_connection(&app)?;
    connection
        .execute(
            "INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, unixepoch())
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn storage_delete(app: AppHandle, key: String) -> Result<(), String> {
    let connection = storage_connection(&app)?;
    connection
        .execute("DELETE FROM kv_store WHERE key = ?1", params![key])
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_surveillance_windows(app: AppHandle, enabled: bool) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is not available".to_string())?;
    if !enabled {
        for (label, window) in app.webview_windows() {
            if label.starts_with("surveillance-") {
                let _ = window.close();
            }
        }
        return Ok(());
    }

    let monitors = main
        .available_monitors()
        .map_err(|error| error.to_string())?;
    for (index, monitor) in monitors.iter().enumerate().skip(1) {
        let label = format!("surveillance-{index}");
        if app.get_webview_window(&label).is_some() {
            continue;
        }
        WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html?mirror=1".into()))
            .title("PANIC BUTTON // Secondary Surveillance")
            .decorations(false)
            .resizable(false)
            .position(monitor.position().x as f64, monitor.position().y as f64)
            .fullscreen(true)
            .always_on_top(true)
            .build()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit(
                            "trigger-fired",
                            TriggerEvent {
                                shortcut: shortcut.to_string(),
                            },
                        );
                    }
                })
                .build(),
        )
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main window is configured");
            let _ = window.set_title("PANIC BUTTON // Incident Command");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            native_hotkey,
            storage_get,
            storage_set,
            storage_delete,
            incident_store_event,
            incident_load_events,
            trust_signer,
            trusted_signers,
            pack_stage,
            pack_install,
            pack_list,
            pack_remove,
            draft_save,
            draft_list,
            set_surveillance_windows
        ])
        .run(tauri::generate_context!())
        .expect("error while running PANIC BUTTON");
}
