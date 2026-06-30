// In-app terminals: real PTYs (portable-pty) running the user's shell in the
// active repo's directory. Multiple concurrent sessions, keyed by a frontend-
// supplied id. Output streams to the renderer as `terminal:data` events carrying
// `{ id, data }`; the renderer sends keystrokes via `terminal_input`. xterm.js
// drives each session on the front.
use crate::AppState;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde_json::json;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct TerminalState {
    sessions: Mutex<HashMap<String, Session>>,
}

fn shell() -> CommandBuilder {
    #[cfg(windows)]
    {
        // PowerShell over cmd.exe so Unix-style aliases (ls, clear, cat, pwd…)
        // work out of the box. Falls back to COMSPEC if PowerShell is missing.
        let ps = which("pwsh.exe")
            .or_else(|| which("powershell.exe"))
            .unwrap_or_else(|| std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".into()));
        CommandBuilder::new(ps)
    }
    #[cfg(not(windows))]
    {
        CommandBuilder::new(std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into()))
    }
}

#[cfg(windows)]
fn which(exe: &str) -> Option<String> {
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(exe))
            .find(|p| p.is_file())
            .map(|p| p.to_string_lossy().into_owned())
    })
}

#[tauri::command]
pub async fn terminal_start(
    app: AppHandle,
    app_state: State<'_, AppState>,
    term: State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let cwd = crate::repo_ops::active_repo_path(app_state.inner()).await;
    let pair = native_pty_system()
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;
    let mut cmd = shell();
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    term.sessions.lock().unwrap().insert(
        id.clone(),
        Session { writer, master: pair.master, child },
    );

    // Blocking reads on a dedicated OS thread; stream bytes to the renderer
    // tagged with the session id.
    let app2 = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app2.emit("terminal:exit", json!({ "id": id }));
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app2.emit("terminal:data", json!({ "id": id, "data": data }));
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn terminal_input(term: State<TerminalState>, id: String, data: String) {
    if let Some(s) = term.sessions.lock().unwrap().get_mut(&id) {
        let _ = s.writer.write_all(data.as_bytes());
        let _ = s.writer.flush();
    }
}

#[tauri::command]
pub fn terminal_resize(term: State<TerminalState>, id: String, cols: u16, rows: u16) {
    if let Some(s) = term.sessions.lock().unwrap().get(&id) {
        let _ = s.master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
    }
}

#[tauri::command]
pub fn terminal_kill(term: State<TerminalState>, id: String) {
    if let Some(mut s) = term.sessions.lock().unwrap().remove(&id) {
        let _ = s.child.kill();
        // dropping master + writer closes the pty
    }
}
