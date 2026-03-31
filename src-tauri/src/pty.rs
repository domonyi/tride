use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalInfo {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub is_alive: bool,
}

#[derive(Clone, Serialize)]
pub struct PtyDataEvent {
    pub id: String,
    pub data: Vec<u8>,
}

#[derive(Clone, Serialize)]
pub struct PtyExitEvent {
    pub id: String,
    pub code: Option<i32>,
}

struct PtyInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    info: TerminalInfo,
    // Signal to stop the reader thread
    alive: Arc<std::sync::atomic::AtomicBool>,
    // Child process killer — used to terminate the shell on kill()
    child_killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
}

pub struct PtyManager {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn(
        &self,
        app_handle: &AppHandle,
        cwd: &str,
        title: &str,
        shell: Option<&str>,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let default_shell = if cfg!(target_os = "windows") {
            "powershell.exe"
        } else {
            std::env::var("SHELL")
                .unwrap_or_else(|_| "/bin/bash".to_string())
                .leak() as &str
        };
        let shell_cmd = shell.unwrap_or(default_shell);

        let mut cmd = CommandBuilder::new(shell_cmd);
        cmd.cwd(cwd);

        if cfg!(target_os = "windows") && shell_cmd.contains("powershell") {
            cmd.arg("-NoLogo");
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;
        let child_killer = child
            .clone_killer();

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let id = Uuid::new_v4().to_string();
        let alive = Arc::new(std::sync::atomic::AtomicBool::new(true));

        let info = TerminalInfo {
            id: id.clone(),
            title: title.to_string(),
            cwd: cwd.to_string(),
            is_alive: true,
        };

        let instance = PtyInstance {
            master: pair.master,
            writer: Arc::new(Mutex::new(writer)),
            info,
            alive: alive.clone(),
            child_killer,
        };

        self.instances.lock().insert(id.clone(), instance);

        // Spawn background reader thread
        let app = app_handle.clone();
        let reader_id = id.clone();
        std::thread::spawn(move || {
            Self::reader_loop(reader, &reader_id, &app, &alive);
        });

        // Spawn background waiter thread — emits pty-exit with exit code
        let waiter_app = app_handle.clone();
        let waiter_id = id.clone();
        std::thread::spawn(move || {
            let status = child.wait();
            let code = status.ok().map(|s| s.exit_code() as i32);
            let _ = waiter_app.emit(
                "pty-exit",
                PtyExitEvent {
                    id: waiter_id,
                    code,
                },
            );
        });

        Ok(id)
    }

    fn reader_loop(
        mut reader: Box<dyn Read + Send>,
        id: &str,
        app: &AppHandle,
        alive: &std::sync::atomic::AtomicBool,
    ) {
        let mut buf = vec![0u8; 4096];
        loop {
            if !alive.load(std::sync::atomic::Ordering::Relaxed) {
                break;
            }
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let _ = app.emit(
                        "pty-data",
                        PtyDataEvent {
                            id: id.to_string(),
                            data: buf[..n].to_vec(),
                        },
                    );
                }
                Err(_) => break,
            }
        }
    }

    pub fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        let instances = self.instances.lock();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;

        let writer = instance.writer.clone();
        drop(instances);

        let mut writer = writer.lock();
        writer
            .write_all(data)
            .map_err(|e| format!("Write error: {}", e))?;
        writer.flush().map_err(|e| format!("Flush error: {}", e))?;
        Ok(())
    }

    pub fn resize(&self, id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let instances = self.instances.lock();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;

        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize error: {}", e))
    }

    pub fn kill(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock();
        let mut instance = instances
            .remove(id)
            .ok_or_else(|| format!("Terminal {} not found", id))?;
        // Signal the reader thread to stop
        instance
            .alive
            .store(false, std::sync::atomic::Ordering::Relaxed);
        // Kill the child process so the waiter thread unblocks
        let _ = instance.child_killer.kill();
        Ok(())
    }

    pub fn list(&self) -> Vec<TerminalInfo> {
        let instances = self.instances.lock();
        instances.values().map(|i| i.info.clone()).collect()
    }
}
