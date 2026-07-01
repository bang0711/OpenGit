// OpenGit Tauri backend. Three dispatcher commands (api / gh / updater) mirror
// the old Electron IPC namespaces by name + positional args, returning the JSON
// shapes from shared/types.ts. Logical errors come back as `{ "error": msg }`
// objects (not Err) so the renderer's `if ("error" in res)` checks keep working.
mod azure;
mod diff_hunks;
mod git;
mod github;
mod gitlab;
mod oauth;
mod path_utils;
mod provider;
mod repo_lock;
mod repo_ops;
mod repo_registry;
mod secrets;
mod state;
mod terminal;
mod types;
mod updater;
mod watch;

use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

/// Shared backend state, managed by Tauri.
pub struct AppState {
    pub store: state::Store,
    pub locks: repo_lock::RepoLocks,
    /// GET ETag cache: path → (etag, cached body). 304s return the cached body free.
    pub etag: Mutex<HashMap<String, (String, Value)>>,
    pub http: reqwest::Client,
    pub watch: watch::Watcher,
}

const REWATCH: [&str; 3] = ["openRepo", "cloneRepo", "closeRepo"];

#[tauri::command]
async fn api_call(
    name: String,
    args: Vec<Value>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    let st = state.inner();
    let result = repo_ops::dispatch(st, &name, args).await;
    if REWATCH.contains(&name.as_str()) {
        let repo = repo_ops::active_repo_path(st).await;
        st.watch.rewatch(&app, repo);
    }
    Ok(result)
}

#[tauri::command]
async fn gh_call(
    name: String,
    args: Vec<Value>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    Ok(provider::dispatch(state.inner(), &app, &name, args).await)
}

#[tauri::command]
async fn updater_call(
    name: String,
    args: Vec<Value>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    Ok(updater::dispatch(state.inner(), &app, &name, args).await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            let _ = std::fs::create_dir_all(&data_dir);

            app.manage(AppState {
                store: state::Store::new(&data_dir),
                locks: repo_lock::RepoLocks::default(),
                etag: Mutex::new(HashMap::new()),
                http: reqwest::Client::new(),
                watch: watch::Watcher::default(),
            });
            app.manage(terminal::TerminalState::default());

            // Start watching the active repo (if any) once state is managed.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let st = handle.state::<AppState>();
                let repo = repo_ops::active_repo_path(st.inner()).await;
                st.watch.rewatch(&handle, repo);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api_call,
            gh_call,
            updater_call,
            terminal::terminal_start,
            terminal::terminal_input,
            terminal::terminal_resize,
            terminal::terminal_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
