// Per-repo async mutex: serialize git mutations so two writes don't race on
// `.git/index.lock`. Ported from electron/main/repo-lock.ts. In-process — one
// backend process — which is all we need.
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Default)]
pub struct RepoLocks {
    map: Mutex<HashMap<String, Arc<AsyncMutex<()>>>>,
}

impl RepoLocks {
    /// The mutex for a repo id. Hold its guard (`.lock().await`) across a mutation
    /// to serialize against other writers of the same repo.
    pub fn for_repo(&self, repo_id: &str) -> Arc<AsyncMutex<()>> {
        let mut m = self.map.lock().unwrap();
        m.entry(repo_id.to_string())
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    }
}
