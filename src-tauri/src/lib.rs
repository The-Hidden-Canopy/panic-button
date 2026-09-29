use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
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
             );",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
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
            set_surveillance_windows
        ])
        .run(tauri::generate_context!())
        .expect("error while running PANIC BUTTON");
}
