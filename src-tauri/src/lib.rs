mod fs;
mod pty;

use pty::PtyManager;
use std::sync::Arc;
use tauri::{AppHandle, State};

struct AppState {
    pty_manager: Arc<PtyManager>,
}

// ── Terminal Commands ───────────────────────────────────────────────────────

#[tauri::command]
fn spawn_terminal(
    app: AppHandle,
    state: State<AppState>,
    cwd: String,
    title: String,
    shell: Option<String>,
) -> Result<String, String> {
    state
        .pty_manager
        .spawn(&app, &cwd, &title, shell.as_deref())
}

#[tauri::command]
fn write_terminal(state: State<AppState>, id: String, data: Vec<u8>) -> Result<(), String> {
    state.pty_manager.write(&id, &data)
}

#[tauri::command]
fn resize_terminal(
    state: State<AppState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state.pty_manager.resize(&id, rows, cols)
}

#[tauri::command]
fn kill_terminal(state: State<AppState>, id: String) -> Result<(), String> {
    state.pty_manager.kill(&id)
}

#[tauri::command]
fn list_terminals(state: State<AppState>) -> Vec<pty::TerminalInfo> {
    state.pty_manager.list()
}

// ── File System Commands ────────────────────────────────────────────────────

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<fs::FileEntry>, String> {
    fs::list_dir(&path)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_file(&path)
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write_file(&path, &content)
}

// ── App Entry ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            pty_manager: Arc::new(PtyManager::new()),
        })
        .invoke_handler(tauri::generate_handler![
            spawn_terminal,
            write_terminal,
            resize_terminal,
            kill_terminal,
            list_terminals,
            list_dir,
            read_file,
            write_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
