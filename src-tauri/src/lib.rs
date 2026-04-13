mod claude;
mod fs;
mod git;
mod lsp;
mod pty;

use claude::ClaudeManager;
use lsp::LspManager;
use pty::PtyManager;
use std::sync::Arc;
use tauri::{AppHandle, State};

struct AppState {
    pty_manager: Arc<PtyManager>,
    lsp_manager: Arc<LspManager>,
    claude_manager: Arc<ClaudeManager>,
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
fn read_file_base64(path: String) -> Result<String, String> {
    fs::read_file_base64(&path)
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write_file(&path, &content)
}

#[tauri::command]
fn append_file(path: String, content: String) -> Result<(), String> {
    fs::append_file(&path, &content)
}

#[tauri::command]
async fn read_dts_files(base_dir: String, package_name: String) -> Result<Vec<fs::DtsFile>, String> {
    tokio::task::spawn_blocking(move || fs::read_dts_files(&base_dir, &package_name))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn read_all_node_types(base_dir: String) -> Result<Vec<fs::DtsFile>, String> {
    tokio::task::spawn_blocking(move || fs::read_all_node_types(&base_dir))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn read_project_sources(base_dir: String) -> Result<Vec<fs::DtsFile>, String> {
    tokio::task::spawn_blocking(move || fs::read_project_sources(&base_dir))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
fn delete_entry(path: String) -> Result<(), String> {
    fs::delete_entry(&path)
}

#[tauri::command]
fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename_entry(&old_path, &new_path)
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    fs::create_file(&path)
}

#[tauri::command]
fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir(&path)
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let p = std::path::Path::new(&path);
        let arg = if p.is_dir() {
            path.clone()
        } else {
            format!("/select,{}", path)
        };
        std::process::Command::new("explorer")
            .arg(&arg)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("Failed to open explorer: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        let p = std::path::Path::new(&path);
        if p.is_dir() {
            std::process::Command::new("open").arg(&path).spawn()
                .map_err(|e| format!("Failed to open Finder: {}", e))?;
        } else {
            std::process::Command::new("open").arg("-R").arg(&path).spawn()
                .map_err(|e| format!("Failed to open Finder: {}", e))?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        let p = std::path::Path::new(&path);
        let dir = if p.is_dir() { &path } else { p.parent().map(|pp| pp.to_str().unwrap_or(&path)).unwrap_or(&path) };
        std::process::Command::new("xdg-open").arg(dir).spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }
    Ok(())
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

#[tauri::command]
async fn git_commit_files(cwd: String, hash: String) -> Result<Vec<git::GitFileStatus>, String> {
    tokio::task::spawn_blocking(move || git::commit_files(&cwd, &hash))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_show_file_at(cwd: String, hash: String, file_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::show_file_at(&cwd, &hash, &file_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_show_file_at_parent(cwd: String, hash: String, file_path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::show_file_at_parent(&cwd, &hash, &file_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_checkout_branch(cwd: String, branch: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::checkout_branch(&cwd, &branch))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_create_branch(cwd: String, branch: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::create_branch(&cwd, &branch))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_delete_branch(cwd: String, branch: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || git::delete_branch(&cwd, &branch))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_diff_lines(cwd: String, file_path: String) -> Result<Vec<git::DiffLineRange>, String> {
    tokio::task::spawn_blocking(move || git::diff_line_ranges(&cwd, &file_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_discard(cwd: String, path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git::discard(&cwd, &path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_worktree_add(cwd: String, branch: String, worktree_path: String) -> Result<git::WorktreeInfo, String> {
    tokio::task::spawn_blocking(move || git::worktree_add(&cwd, &branch, &worktree_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_worktree_remove(cwd: String, worktree_path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || git::worktree_remove(&cwd, &worktree_path))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
async fn git_worktree_list(cwd: String) -> Result<Vec<git::WorktreeInfo>, String> {
    tokio::task::spawn_blocking(move || git::worktree_list(&cwd))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

// ── LSP Commands ────────────────────────────────────────────────────────────

#[tauri::command]
fn lsp_start(
    app: AppHandle,
    state: State<AppState>,
    id: String,
    project_root: String,
) -> Result<(), String> {
    state.lsp_manager.spawn(&app, &id, &project_root)
}

#[tauri::command]
fn lsp_send(state: State<AppState>, id: String, message: String) -> Result<(), String> {
    state.lsp_manager.send(&id, &message)
}

#[tauri::command]
fn lsp_stop(state: State<AppState>, id: String) -> Result<(), String> {
    state.lsp_manager.kill(&id);
    Ok(())
}

// ── Search Commands ────────────────────────────────────────────────────

#[tauri::command]
async fn walk_files(root: String, limit: Option<usize>) -> Result<Vec<String>, String> {
    let lim = limit.unwrap_or(10000);
    tokio::task::spawn_blocking(move || fs::walk_files(&root, lim))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

// ── Clipboard Commands ──────────────────────────────────────────────────────

#[tauri::command]
async fn save_clipboard_image(data: Vec<u8>, extension: String) -> Result<String, String> {
    let temp_dir = std::env::temp_dir().join("tride-images");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let filename = format!("paste-{}.{}", uuid::Uuid::new_v4(), extension);
    let path = temp_dir.join(&filename);

    std::fs::write(&path, &data)
        .map_err(|e| format!("Failed to write image: {}", e))?;

    Ok(path.to_string_lossy().to_string())
}

// ── Utility Commands ────────────────────────────────────────────────────────

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

#[tauri::command]
fn get_app_dir() -> Result<String, String> {
    // Get the directory where the executable lives
    std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))
        .map(|p| p.parent().unwrap_or(&p).to_string_lossy().to_string())
}

// ── Claude Commands ─────────────────────────────────────────────────────────

#[tauri::command]
async fn claude_warmup(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let manager = state.claude_manager.clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        manager.ensure_sidecar(&app_clone)
    })
    .await
    .map_err(|e| format!("Warmup task failed: {}", e))?
}

#[tauri::command]
async fn claude_start(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    cwd: String,
    prompt: String,
    model: Option<String>,
    resume_session_id: Option<String>,
) -> Result<(), String> {
    let manager = state.claude_manager.clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || {
        manager.start(
            &app_clone,
            &session_id,
            &cwd,
            &prompt,
            model.as_deref(),
            resume_session_id.as_deref(),
        )
    })
    .await
    .map_err(|e| format!("Start task failed: {}", e))?
}

#[tauri::command]
fn claude_send(
    state: State<AppState>,
    session_id: String,
    message: String,
) -> Result<(), String> {
    state.claude_manager.send(&session_id, &message)
}

#[tauri::command]
fn claude_approve(
    state: State<AppState>,
    session_id: String,
    tool_use_id: String,
) -> Result<(), String> {
    state.claude_manager.approve(&session_id, &tool_use_id)
}

#[tauri::command]
fn claude_deny(
    state: State<AppState>,
    session_id: String,
    tool_use_id: String,
    reason: Option<String>,
) -> Result<(), String> {
    state.claude_manager.deny(&session_id, &tool_use_id, reason.as_deref())
}

#[tauri::command]
fn claude_abort(
    state: State<AppState>,
    session_id: String,
) -> Result<(), String> {
    state.claude_manager.abort(&session_id)
}

#[tauri::command]
fn claude_kill(
    state: State<AppState>,
    session_id: String,
) -> Result<(), String> {
    state.claude_manager.kill_session(&session_id)
}

// ── App Entry ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            pty_manager: Arc::new(PtyManager::new()),
            lsp_manager: Arc::new(LspManager::new()),
            claude_manager: Arc::new(ClaudeManager::new()),
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
            read_file_base64,
            write_file,
            append_file,
            read_dts_files,
            read_project_sources,
            read_all_node_types,
            delete_entry,
            rename_entry,
            create_file,
            create_dir,
            reveal_in_explorer,
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
            git_commit_files,
            git_show_file_at,
            git_show_file_at_parent,
            git_checkout_branch,
            git_create_branch,
            git_delete_branch,
            git_discard,
            git_diff_lines,
            git_worktree_add,
            git_worktree_remove,
            git_worktree_list,
            walk_files,
            lsp_start,
            lsp_send,
            lsp_stop,
            get_app_dir,
            save_clipboard_image,
            claude_warmup,
            claude_start,
            claude_send,
            claude_approve,
            claude_deny,
            claude_abort,
            claude_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
