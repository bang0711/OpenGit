// Repo registry: maps a stable id (sha256 of owner + resolved path) to a path,
// stored in ~/.opengit/repos.json. Ported from electron/main/repo-registry.ts,
// including the optional OPENGIT_REPO_ROOT confinement + OPENGIT_USER isolation.
use crate::git::is_git_repo;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
struct RepoRecord {
    id: String,
    #[serde(rename = "ownerId")]
    owner_id: String,
    path: String,
}

fn env_trim(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn owner_id() -> String {
    env_trim("OPENGIT_USER").unwrap_or_else(|| "local".to_string())
}

fn data_dir() -> PathBuf {
    env_trim("OPENGIT_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_default().join(".opengit"))
}

fn store_path() -> PathBuf {
    data_dir().join("repos.json")
}

fn repo_root() -> Option<String> {
    env_trim("OPENGIT_REPO_ROOT")
}

/// Resolve to an absolute, clean path string (drops the Windows \\?\ prefix).
fn norm(path: &str) -> String {
    match std::fs::canonicalize(path) {
        Ok(p) => {
            let s = p.to_string_lossy().into_owned();
            s.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(s)
        }
        Err(_) => path.to_string(),
    }
}

pub fn repo_id_for(path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("{}\0{}", owner_id(), norm(path)));
    let hex = format!("{:x}", hasher.finalize());
    hex[..16].to_string()
}

fn is_contained(child: &str, parent: &str) -> bool {
    let c = norm(child);
    let p = norm(parent);
    if c == p {
        return true;
    }
    let p_sep = if p.ends_with(std::path::MAIN_SEPARATOR) {
        p.clone()
    } else {
        format!("{p}{}", std::path::MAIN_SEPARATOR)
    };
    c.starts_with(&p_sep)
}

fn read_store() -> Vec<RepoRecord> {
    std::fs::read_to_string(store_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_store(records: &[RepoRecord]) -> Result<(), String> {
    let path = store_path();
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(records).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn register_repo(path: &str) -> Result<String, String> {
    if let Some(root) = repo_root() {
        if !is_contained(path, &root) {
            return Err("Repository is outside the allowed root.".into());
        }
    }
    let id = repo_id_for(path);
    let mut records = read_store();
    if !records.iter().any(|r| r.id == id) {
        records.push(RepoRecord {
            id: id.clone(),
            owner_id: owner_id(),
            path: norm(path),
        });
        write_store(&records)?;
    }
    Ok(id)
}

pub async fn resolve_repo_path(repo_id: &str) -> Result<String, String> {
    let rec = read_store()
        .into_iter()
        .find(|r| r.id == repo_id)
        .ok_or("Unknown repository.")?;
    if rec.owner_id != owner_id() {
        return Err("Not authorized for this repository.".into());
    }
    if let Some(root) = repo_root() {
        if !is_contained(&rec.path, &root) {
            return Err("Repository is outside the allowed root.".into());
        }
    }
    if !is_git_repo(&rec.path).await {
        return Err("No longer a git repository.".into());
    }
    Ok(rec.path)
}

// Reserved for a future "forget repo" action.
#[allow(dead_code)]
pub fn remove_repo(repo_id: &str) -> Result<(), String> {
    let records: Vec<RepoRecord> = read_store().into_iter().filter(|r| r.id != repo_id).collect();
    write_store(&records)
}
