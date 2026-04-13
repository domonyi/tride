use parking_lot::Mutex;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, serde::Serialize)]
pub struct ClaudeEvent {
    pub data: String,
}

struct SidecarProcess {
    stdin: Arc<Mutex<Box<dyn Write + Send>>>,
    _child: Child,
    alive: Arc<AtomicBool>,
}

pub struct ClaudeManager {
    sidecar: Arc<Mutex<Option<SidecarProcess>>>,
    /// Track which sessions are active so we can clean up on kill
    sessions: Arc<Mutex<HashMap<String, bool>>>,
}

impl ClaudeManager {
    pub fn new() -> Self {
        Self {
            sidecar: Arc::new(Mutex::new(None)),
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Ensure the sidecar process is running. Spawns it lazily on first use.
    pub fn ensure_sidecar(&self, app_handle: &AppHandle) -> Result<(), String> {
        let mut guard = self.sidecar.lock();
        if guard.as_ref().map_or(false, |s| s.alive.load(Ordering::Relaxed)) {
            return Ok(()); // Already running
        }

        // Find the sidecar script relative to the app
        let sidecar_script = Self::find_sidecar_script()?;
        let bun_path = Self::find_bun()?;

        let mut cmd = Command::new(&bun_path);
        cmd.arg(&sidecar_script)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Set CWD to the sidecar directory so node_modules resolve
        if let Some(parent) = std::path::Path::new(&sidecar_script).parent() {
            cmd.current_dir(parent);
        }

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn claude sidecar (bun={}, script={}): {}", bun_path, sidecar_script, e))?;

        let stdin = child
            .stdin
            .take()
            .ok_or("Failed to capture sidecar stdin")?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture sidecar stdout")?;
        let stderr = child.stderr.take();

        let alive = Arc::new(AtomicBool::new(true));
        let stdin = Arc::new(Mutex::new(Box::new(stdin) as Box<dyn Write + Send>));

        // Forward stderr as error events
        if let Some(stderr) = stderr {
            let stderr_app = app_handle.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    match line {
                        Ok(l) => {
                            eprintln!("[claude-sidecar stderr] {}", l);
                            let msg = serde_json::json!({
                                "type": "error",
                                "sessionId": "*",
                                "message": format!("[sidecar] {}", l)
                            });
                            let _ = stderr_app.emit("claude-event", ClaudeEvent { data: msg.to_string() });
                        }
                        Err(_) => break,
                    }
                }
            });
        }

        let process = SidecarProcess {
            stdin,
            _child: child,
            alive: alive.clone(),
        };

        *guard = Some(process);

        // Spawn reader thread
        let app = app_handle.clone();
        let alive_clone = alive.clone();
        std::thread::spawn(move || {
            Self::reader_loop(stdout, &app, &alive_clone);
        });

        Ok(())
    }

    fn find_sidecar_script() -> Result<String, String> {
        // Search upward from the exe directory
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()));

        if let Some(mut dir) = exe_dir {
            for _ in 0..10 {
                let candidate = dir.join("claude-sidecar").join("index.ts");
                if candidate.exists() {
                    return Ok(candidate.to_string_lossy().to_string());
                }
                if !dir.pop() {
                    break;
                }
            }
        }

        // Fallback: try CWD-based paths (for development)
        let cwd_candidate = std::path::Path::new("claude-sidecar/index.ts");
        if cwd_candidate.exists() {
            return Ok(cwd_candidate.to_string_lossy().to_string());
        }

        Err("claude-sidecar/index.ts not found".to_string())
    }

    fn find_bun() -> Result<String, String> {
        // Platform-specific which/where command
        #[cfg(target_os = "windows")]
        let which_cmd = "where";
        #[cfg(not(target_os = "windows"))]
        let which_cmd = "which";

        // Try PATH first
        let mut which_bun = Command::new(which_cmd);
        which_bun.arg("bun");
        #[cfg(target_os = "windows")]
        which_bun.creation_flags(CREATE_NO_WINDOW);
        if let Ok(output) = which_bun.output() {
            if output.status.success() {
                let paths = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = paths.lines().next() {
                    let p = first.trim();
                    if !p.is_empty() {
                        return Ok(p.to_string());
                    }
                }
            }
        }

        // Common install locations
        #[cfg(target_os = "windows")]
        {
            if let Ok(home) = std::env::var("USERPROFILE") {
                let candidate = std::path::Path::new(&home)
                    .join(".bun")
                    .join("bin")
                    .join("bun.exe");
                if candidate.exists() {
                    return Ok(candidate.to_string_lossy().to_string());
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(home) = std::env::var("HOME") {
                let candidate = std::path::Path::new(&home)
                    .join(".bun")
                    .join("bin")
                    .join("bun");
                if candidate.exists() {
                    return Ok(candidate.to_string_lossy().to_string());
                }
            }
        }

        // Fallback: try node
        let mut which_node = Command::new(which_cmd);
        which_node.arg("node");
        #[cfg(target_os = "windows")]
        which_node.creation_flags(CREATE_NO_WINDOW);
        if let Ok(output) = which_node.output() {
            if output.status.success() {
                let paths = String::from_utf8_lossy(&output.stdout);
                if let Some(first) = paths.lines().next() {
                    let p = first.trim();
                    if !p.is_empty() {
                        return Ok(p.to_string());
                    }
                }
            }
        }

        Err("Neither bun nor node found. Install bun (bun.sh) or Node.js.".to_string())
    }

    fn reader_loop(
        stdout: std::process::ChildStdout,
        app: &AppHandle,
        alive: &AtomicBool,
    ) {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if !alive.load(Ordering::Relaxed) {
                break;
            }
            match line {
                Ok(data) => {
                    if data.trim().is_empty() {
                        continue;
                    }
                    let _ = app.emit("claude-event", ClaudeEvent { data });
                }
                Err(_) => break,
            }
        }

        // Sidecar exited — emit error for all sessions
        alive.store(false, Ordering::Relaxed);
        let _ = app.emit(
            "claude-event",
            ClaudeEvent {
                data: r#"{"type":"error","sessionId":"*","message":"Sidecar process exited"}"#
                    .to_string(),
            },
        );
    }

    fn send_command(&self, command: &str) -> Result<(), String> {
        let guard = self.sidecar.lock();
        let sidecar = guard
            .as_ref()
            .ok_or("Claude sidecar not running")?;

        if !sidecar.alive.load(Ordering::Relaxed) {
            return Err("Claude sidecar process has exited".to_string());
        }

        let stdin = sidecar.stdin.clone();
        drop(guard);

        let mut writer = stdin.lock();
        let line = format!("{}\n", command);
        writer
            .write_all(line.as_bytes())
            .map_err(|e| format!("Write error: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Flush error: {}", e))?;
        Ok(())
    }

    pub fn start(
        &self,
        app_handle: &AppHandle,
        session_id: &str,
        cwd: &str,
        prompt: &str,
        model: Option<&str>,
        resume_session_id: Option<&str>,
    ) -> Result<(), String> {
        self.ensure_sidecar(app_handle)?;

        self.sessions.lock().insert(session_id.to_string(), true);

        let mut cmd = serde_json::json!({
            "type": "start",
            "sessionId": session_id,
            "cwd": cwd,
            "prompt": prompt,
        });

        if let Some(m) = model {
            cmd["model"] = serde_json::json!(m);
        }
        if let Some(r) = resume_session_id {
            cmd["resumeSessionId"] = serde_json::json!(r);
        }

        self.send_command(&cmd.to_string())
    }

    pub fn send(&self, session_id: &str, message: &str) -> Result<(), String> {
        let cmd = serde_json::json!({
            "type": "send",
            "sessionId": session_id,
            "message": message,
        });
        self.send_command(&cmd.to_string())
    }

    pub fn approve(&self, session_id: &str, tool_use_id: &str) -> Result<(), String> {
        let cmd = serde_json::json!({
            "type": "approve",
            "sessionId": session_id,
            "toolUseId": tool_use_id,
        });
        self.send_command(&cmd.to_string())
    }

    pub fn deny(
        &self,
        session_id: &str,
        tool_use_id: &str,
        reason: Option<&str>,
    ) -> Result<(), String> {
        let mut cmd = serde_json::json!({
            "type": "deny",
            "sessionId": session_id,
            "toolUseId": tool_use_id,
        });
        if let Some(r) = reason {
            cmd["reason"] = serde_json::json!(r);
        }
        self.send_command(&cmd.to_string())
    }

    pub fn abort(&self, session_id: &str) -> Result<(), String> {
        let cmd = serde_json::json!({
            "type": "abort",
            "sessionId": session_id,
        });
        self.send_command(&cmd.to_string())
    }

    pub fn kill_session(&self, session_id: &str) -> Result<(), String> {
        self.sessions.lock().remove(session_id);
        let cmd = serde_json::json!({
            "type": "kill",
            "sessionId": session_id,
        });
        self.send_command(&cmd.to_string())
    }
}
