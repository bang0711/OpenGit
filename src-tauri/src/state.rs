// Active repo + recent list, persisted to opengit-state.json in the app data dir.
// Ported from electron/main/state.ts. (The GitHub token now lives in the OS
// keychain via secrets.rs, not here.)
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Default, Serialize, Deserialize)]
struct State {
    #[serde(rename = "activeRepoId", default)]
    active_repo_id: Option<String>,
    #[serde(default)]
    recent: Vec<String>,
}

pub struct Store {
    path: PathBuf,
}

impl Store {
    pub fn new(dir: &Path) -> Self {
        Store {
            path: dir.join("opengit-state.json"),
        }
    }

    fn read(&self) -> State {
        std::fs::read_to_string(&self.path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn write(&self, s: &State) {
        if let Some(p) = self.path.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        if let Ok(json) = serde_json::to_string_pretty(s) {
            let _ = std::fs::write(&self.path, json);
        }
    }

    pub fn active_repo_id(&self) -> Option<String> {
        self.read().active_repo_id
    }

    pub fn set_active(&self, id: &str, path: &str) {
        let mut s = self.read();
        s.active_repo_id = Some(id.to_string());
        let mut recent = vec![path.to_string()];
        recent.extend(s.recent.into_iter().filter(|p| p != path));
        recent.truncate(8);
        s.recent = recent;
        self.write(&s);
    }

    pub fn clear_active(&self) {
        let mut s = self.read();
        s.active_repo_id = None;
        self.write(&s);
    }

    pub fn recent(&self) -> Vec<String> {
        self.read().recent
    }

    pub fn remove_recent(&self, path: &str) {
        let mut s = self.read();
        s.recent.retain(|p| p != path);
        self.write(&s);
    }

    pub fn clear_recent(&self) {
        let mut s = self.read();
        s.recent.clear();
        self.write(&s);
    }
}
