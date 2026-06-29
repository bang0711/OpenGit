// Watches the active repo's working tree and pushes a debounced "repo:changed"
// to the renderer (which refetches). Ported from electron/main/watch.ts — the
// notify crate replaces chokidar; a tokio task does the 500ms debounce.
use notify::{recommended_watcher, Event, RecursiveMode, Watcher as _};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Default)]
pub struct Watcher {
    // Keep the active watcher alive; dropping it stops watching + ends the task.
    inner: Mutex<Option<notify::RecommendedWatcher>>,
}

fn is_ignored(path: &str) -> bool {
    path.contains("node_modules")
        || path.contains(".git/objects")
        || path.contains(".git\\objects")
        || path.contains(".git/lfs")
        || path.contains(".git\\lfs")
}

fn relevant(ev: &Event) -> bool {
    ev.paths
        .iter()
        .any(|p| !is_ignored(&p.to_string_lossy()))
}

impl Watcher {
    /// Re-target the watcher at `repo` (or stop, when None).
    pub fn rewatch(&self, app: &AppHandle, repo: Option<String>) {
        let mut guard = self.inner.lock().unwrap();
        *guard = None; // drop old watcher first → its task ends

        let Some(repo) = repo else { return };

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<()>();
        let mut watcher = match recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(ev) = res {
                if relevant(&ev) {
                    let _ = tx.send(());
                }
            }
        }) {
            Ok(w) => w,
            Err(_) => return,
        };
        if watcher.watch(Path::new(&repo), RecursiveMode::Recursive).is_err() {
            return;
        }
        *guard = Some(watcher);

        // Debounce: coalesce a burst of events into one emit per 500ms quiet window.
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                if rx.recv().await.is_none() {
                    break; // watcher dropped
                }
                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_millis(500)) => break,
                        v = rx.recv() => { if v.is_none() { return; } }
                    }
                }
                let _ = app.emit("repo:changed", ());
            }
        });
    }
}
