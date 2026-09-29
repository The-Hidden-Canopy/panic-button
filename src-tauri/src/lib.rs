use serde::Serialize;
use tauri::{Emitter, Manager};
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
            let window = app.get_webview_window("main").expect("main window is configured");
            let _ = window.set_title("PANIC BUTTON // Incident Command");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![app_info, native_hotkey])
        .run(tauri::generate_context!())
        .expect("error while running PANIC BUTTON");
}
