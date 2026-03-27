use parking_lot::Mutex;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, serde::Serialize)]
pub struct LspMessageEvent {
    pub id: String,
    pub data: String,
}

struct LspInstance {
    stdin: Arc<Mutex<Box<dyn Write + Send>>>,
    _child: Child,
    alive: Arc<std::sync::atomic::AtomicBool>,
}

pub struct LspManager {
    instances: Arc<Mutex<HashMap<String, LspInstance>>>,
}

impl LspManager {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Spawn a typescript-language-server for a given project root.
    /// Returns an ID for this LSP session.
    pub fn spawn(
        &self,
        app_handle: &AppHandle,
        id: &str,
        project_root: &str,
    ) -> Result<(), String> {
        // Kill existing instance for this ID if any
        self.kill(id);

        // Find the typescript-language-server CLI entry point (.mjs file)
        // We run it via `node` since .cmd files can't be spawned directly on Windows.
        let cli_name = "typescript-language-server/lib/cli.mjs";

        let project_cli = std::path::Path::new(project_root)
            .join("node_modules")
            .join(cli_name);

        // Search upward from the exe directory to find our bundled copy
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()));

        let mut app_cli = None;
        if let Some(mut dir) = exe_dir {
            for _ in 0..10 {
                let candidate = dir.join("node_modules").join(cli_name);
                if candidate.exists() {
                    app_cli = Some(candidate);
                    break;
                }
                if !dir.pop() {
                    break;
                }
            }
        }

        let cli_path = if project_cli.exists() {
            project_cli
        } else if let Some(app) = app_cli {
            app
        } else {
            return Err("typescript-language-server not found".to_string());
        };

        // Find the project's tsserver for type resolution
        let _tsserver_js = std::path::Path::new(project_root)
            .join("node_modules/typescript/lib");

        let mut cmd = Command::new("node");
        cmd.arg(&cli_path)
            .arg("--stdio")
            .current_dir(project_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn LSP: {}", e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or("Failed to capture stdin")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take();

        let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));
        let stdin = Arc::new(Mutex::new(Box::new(stdin) as Box<dyn Write + Send>));

        // Log stderr to a file for debugging
        if let Some(stderr) = stderr {
            let stderr_id = id.to_string();
            std::thread::spawn(move || {
                let mut reader = BufReader::new(stderr);
                let mut buf = String::new();
                let path = format!("C:/DEV/.lsp-stderr-{}.txt", stderr_id.replace(|c: char| !c.is_alphanumeric(), "-"));
                loop {
                    buf.clear();
                    match reader.read_line(&mut buf) {
                        Ok(0) => break,
                        Ok(_) => {
                            let _ = std::fs::OpenOptions::new()
                                .create(true).append(true).open(&path)
                                .and_then(|mut f| f.write_all(buf.as_bytes()));
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        let instance = LspInstance {
            stdin: stdin.clone(),
            _child: child,
            alive: alive.clone(),
        };

        self.instances.lock().insert(id.to_string(), instance);

        // Spawn reader thread that reads LSP messages from stdout and emits them
        let app = app_handle.clone();
        let reader_id = id.to_string();
        std::thread::spawn(move || {
            Self::reader_loop(stdout, &reader_id, &app, &alive);
        });

        Ok(())
    }

    fn reader_loop(
        stdout: std::process::ChildStdout,
        id: &str,
        app: &AppHandle,
        alive: &std::sync::atomic::AtomicBool,
    ) {
        // Debug log file
        let debug_path = format!("C:/DEV/.lsp-rust-reader-{}.txt", id.replace(|c: char| !c.is_alphanumeric(), "-"));
        let mut debug_lines = Vec::new();
        let write_debug = |lines: &[String]| {
            let _ = std::fs::write(&debug_path, lines.join("\n"));
        };

        debug_lines.push(format!("Reader started for {}", id));
        write_debug(&debug_lines);

        let mut reader = BufReader::new(stdout);
        let mut header_buf = Vec::with_capacity(256);

        loop {
            if !alive.load(std::sync::atomic::Ordering::Relaxed) {
                debug_lines.push("Alive=false, exiting".to_string());
                write_debug(&debug_lines);
                break;
            }

            // Read LSP headers
            let mut content_length: usize = 0;
            loop {
                header_buf.clear();
                match reader.read_until(b'\n', &mut header_buf) {
                    Ok(0) => {
                        debug_lines.push("EOF on read_until".to_string());
                        write_debug(&debug_lines);
                        return;
                    }
                    Ok(n) => {
                        let line = String::from_utf8_lossy(&header_buf);
                        let trimmed = line.trim();
                        debug_lines.push(format!("Header line ({} bytes): {:?}", n, trimmed));
                        write_debug(&debug_lines);
                        if trimmed.is_empty() {
                            break; // End of headers
                        }
                        if let Some(len) = trimmed.strip_prefix("Content-Length:") {
                            if let Ok(n) = len.trim().parse::<usize>() {
                                content_length = n;
                            }
                        }
                    }
                    Err(e) => {
                        debug_lines.push(format!("Read error: {}", e));
                        write_debug(&debug_lines);
                        return;
                    }
                }
            }

            if content_length == 0 {
                continue;
            }

            // Read the body
            let mut body = vec![0u8; content_length];
            match std::io::Read::read_exact(&mut reader, &mut body) {
                Ok(_) => {
                    if let Ok(msg) = String::from_utf8(body) {
                        let _ = app.emit(
                            "lsp-message",
                            LspMessageEvent {
                                id: id.to_string(),
                                data: msg,
                            },
                        );
                    }
                }
                Err(_) => return,
            }
        }
    }

    /// Send an LSP message (JSON-RPC) to the language server
    pub fn send(&self, id: &str, message: &str) -> Result<(), String> {
        let instances = self.instances.lock();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("LSP {} not found", id))?;

        let stdin = instance.stdin.clone();
        drop(instances);

        let header = format!("Content-Length: {}\r\n\r\n", message.len());
        let mut writer = stdin.lock();
        writer
            .write_all(header.as_bytes())
            .map_err(|e| format!("Write header error: {}", e))?;
        writer
            .write_all(message.as_bytes())
            .map_err(|e| format!("Write body error: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Flush error: {}", e))?;
        Ok(())
    }

    pub fn kill(&self, id: &str) {
        let mut instances = self.instances.lock();
        if let Some(instance) = instances.remove(id) {
            instance
                .alive
                .store(false, std::sync::atomic::Ordering::Relaxed);
        }
    }

    pub fn kill_all(&self) {
        let mut instances = self.instances.lock();
        for (_, instance) in instances.drain() {
            instance
                .alive
                .store(false, std::sync::atomic::Ordering::Relaxed);
        }
    }
}
