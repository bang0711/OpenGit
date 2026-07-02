// File logger: appends timestamped lines to the same location the Electron-era
// app (≤2.x) used — %APPDATA%\OpenGit\main.log on Windows, ~/.config/OpenGit on
// Linux, ~/Library/Application Support/OpenGit on macOS — so bug reports have a
// known place to look. ponytail: hand-rolled append-only writer, no `log` crate
// facade; upgrade to tauri-plugin-log if levels/filtering ever matter.
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static LOG: Mutex<Option<File>> = Mutex::new(None);

fn log_path() -> Option<PathBuf> {
    Some(dirs::config_dir()?.join("OpenGit").join("main.log"))
}

/// Open the log file (rotating a >5MB one to main.old.log) and install a panic
/// hook so crashes land in the file too (runs before abort under panic=abort).
pub fn init() {
    let Some(path) = log_path() else { return };
    let _ = std::fs::create_dir_all(path.parent().unwrap());
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > 5 * 1024 * 1024 {
            let _ = std::fs::rename(&path, path.with_file_name("main.old.log"));
        }
    }
    if let Ok(f) = OpenOptions::new().create(true).append(true).open(&path) {
        *LOG.lock().unwrap() = Some(f);
    }

    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write_line("PANIC", &info.to_string());
        prev(info);
    }));

    write_line("info", &format!("OpenGit {} started", env!("CARGO_PKG_VERSION")));
}

fn write_line(level: &str, msg: &str) {
    // Seconds since epoch — good enough to correlate with a bug report, no
    // chrono dependency. Formatted as a plain integer timestamp + level.
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Some(f) = LOG.lock().unwrap().as_mut() {
        let _ = writeln!(f, "[{ts}][{level}] {msg}");
        let _ = f.flush();
    }
}

/// Log a backend error (dispatcher results carrying `{ "error": … }`).
pub fn error(source: &str, msg: &str) {
    write_line("error", &format!("{source}: {msg}"));
}

/// Log an error reported by the renderer (uncaught exception / rejection).
#[tauri::command]
pub fn renderer_log(level: String, message: String) {
    let level = match level.as_str() {
        "error" => "renderer:error",
        _ => "renderer:warn",
    };
    write_line(level, &message);
}
