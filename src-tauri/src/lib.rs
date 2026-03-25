mod fs;
mod git;
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

// ── Git Commands ────────────────────────────────────────────────────────────
// All git commands are async to avoid blocking the main thread.

#[tauri::command]
async fn git_status(cwd: String) -> Result<Vec<git::GitFileStatus>, String> {
    tokio::task::spawn_blocking(move || git::status(&cwd))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_diff(cwd: String, file_path: String, staged: bool) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::diff(&cwd, &file_path, staged))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_show_head(cwd: String, file_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::show_head(&cwd, &file_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_log(cwd: String, count: u32) -> Result<Vec<git::GitCommitInfo>, String> {
    tokio::task::spawn_blocking(move || git::log(&cwd, count))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_branches(cwd: String) -> Result<Vec<git::GitBranchInfo>, String> {
    tokio::task::spawn_blocking(move || git::branches(&cwd))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_current_branch(cwd: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::current_branch(&cwd))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_stage(cwd: String, path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git::stage(&cwd, &path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_unstage(cwd: String, path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git::unstage(&cwd, &path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_commit(cwd: String, message: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::commit(&cwd, &message))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_push(cwd: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::push(&cwd))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

// ── Utility Commands ────────────────────────────────────────────────────────

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
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
            get_home_dir,
            list_dir,
            read_file,
            write_file,
            git_status,
            git_diff,
            git_show_head,
            git_log,
            git_branches,
            git_current_branch,
            git_stage,
            git_unstage,
            git_commit,
            git_push,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
