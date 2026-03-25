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

// ── Utility Commands ────────────────────────────────────────────────────────

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

// ── Theia Server Command ────────────────────────────────────────────────────

#[tauri::command]
fn start_theia(port: u16, root_dir: String) -> Result<(), String> {
    let node_path = if cfg!(target_os = "windows") {
        // Use Node 20 for Theia
        let home = std::env::var("USERPROFILE").unwrap_or_default();
        let fnm_node = format!(
            "{}\\AppData\\Roaming\\fnm\\node-versions\\v20.20.2\\installation\\node.exe",
            home
        );
        if std::path::Path::new(&fnm_node).exists() {
            fnm_node
        } else {
            "node".to_string()
        }
    } else {
        "node".to_string()
    };

    let theia_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("no parent dir")?
        .to_path_buf();

    // Look for theia-ide relative to the exe, or use the dev path
    let theia_main = {
        let dev_path = std::path::PathBuf::from("C:\\DEV\\AiTerminal\\theia-ide\\src-gen\\backend\\main.js");
        if dev_path.exists() {
            dev_path
        } else {
            return Err("Theia main.js not found".to_string());
        }
    };

    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let plugins_dir = format!("local-dir:{}/.theia/plugins", home.replace('\\', "/"));
    let deployed_dir = format!("local-dir:{}/.theia/deployedPlugins", home.replace('\\', "/"));

    std::thread::spawn(move || {
        let mut cmd = std::process::Command::new(&node_path);
        cmd.arg(theia_main.to_string_lossy().to_string())
            .arg(format!("--port={}", port))
            .arg("--hostname=localhost")
            .arg(format!("--plugins={}", plugins_dir))
            .arg(&root_dir)
            .env("THEIA_DEFAULT_PLUGINS", &plugins_dir)
            .env("THEIA_PLUGINS", &deployed_dir)
            .current_dir("C:\\DEV\\AiTerminal\\theia-ide");

        // Hide the console window on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        // Log output to file instead of console
        let log_path = format!("{}\\theia-server.log", std::env::var("USERPROFILE").unwrap_or_default());
        if let Ok(log_file) = std::fs::File::create(&log_path) {
            let err_file = log_file.try_clone().unwrap_or_else(|_| std::fs::File::create(&log_path).unwrap());
            cmd.stdout(log_file).stderr(err_file);
        }

        match cmd.spawn() {
            Ok(_child) => {
                // Keep process running
            }
            Err(e) => {
                eprintln!("Failed to start Theia: {}", e);
            }
        }
    });

    Ok(())
}

// ── OpenVSCode Server Command ───────────────────────────────────────────────

#[tauri::command]
fn start_openvscode(port: u16, root_dir: String) -> Result<(), String> {
    // Convert Windows path to Docker mount format
    let docker_path = root_dir
        .replace('\\', "/")
        .replacen("C:", "/c", 1)
        .replacen("c:", "/c", 1);

    // User data dir for settings isolation
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    let user_data = format!("{}\\.aiterminal\\openvscode-data", home).replace('\\', "/")
        .replacen("C:", "/c", 1)
        .replacen("c:", "/c", 1);

    // Ensure user data dir exists
    let _ = std::fs::create_dir_all(format!("{}\\.aiterminal\\openvscode-data", home));

    std::thread::spawn(move || {
        // Stop any existing container first
        let _ = std::process::Command::new("docker")
            .args(["rm", "-f", "aiterminal-openvscode"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        let product_json = format!("{}:/home/.openvscode-server/product.json",
            format!("{}\\.aiterminal\\openvscode-data\\product.json", std::env::var("USERPROFILE").unwrap_or_default())
                .replace('\\', "/").replacen("C:", "/c", 1).replacen("c:", "/c", 1));

        let mut cmd = std::process::Command::new("docker");
        cmd.args([
            "run", "--rm",
            "--name", "aiterminal-openvscode",
            "-p", &format!("{}:3000", port),
            "-v", &format!("{}:/home/workspace:cached", docker_path),
            "-v", &format!("{}:/home/userdata:cached", user_data),
            "-v", &format!("{}:ro", product_json),
            "gitpod/openvscode-server",
            "--user-data-dir", "/home/userdata",
            "--default-folder", "/home/workspace",
        ]);

        // Hide console on Windows
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }

        let log_path = format!(
            "{}\\openvscode-server.log",
            std::env::var("USERPROFILE").unwrap_or_default()
        );
        if let Ok(log_file) = std::fs::File::create(&log_path) {
            let err_file = log_file.try_clone().unwrap_or_else(|_| std::fs::File::create(&log_path).unwrap());
            cmd.stdout(log_file).stderr(err_file);
        }

        match cmd.spawn() {
            Ok(_) => {}
            Err(e) => eprintln!("Failed to start OpenVSCode Server: {}", e),
        }
    });

    Ok(())
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
            start_theia,
            start_openvscode,
            list_dir,
            read_file,
            write_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
