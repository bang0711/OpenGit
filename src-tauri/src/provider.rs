// Git hosting provider detection + routing. The active provider is inferred from
// the open repo's origin host, so the existing `gh_call` surface (and the whole
// PR workspace UI) works for GitHub / GitLab / Azure unchanged — each
// backend module normalizes its REST responses into the same shared shapes.
use crate::{repo_registry, AppState};
use serde_json::{json, Value};
use tauri::AppHandle;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Provider {
    GitHub,
    GitLab,
    Azure,
}

/// Provider from its stable key ("github"/"gitlab"/"azure"), used by
/// the accounts UI to target a specific host regardless of the open repo.
pub fn from_key(k: &str) -> Option<Provider> {
    match k {
        "github" => Some(Provider::GitHub),
        "gitlab" => Some(Provider::GitLab),
        "azure" => Some(Provider::Azure),
        _ => None,
    }
}

pub fn detect(url: &str) -> Option<Provider> {
    let u = url.to_lowercase();
    if u.contains("github.com") {
        Some(Provider::GitHub)
    } else if u.contains("gitlab.com") {
        Some(Provider::GitLab)
    } else if u.contains("dev.azure.com") || u.contains("visualstudio.com") {
        Some(Provider::Azure)
    } else {
        None
    }
}

/// (host, path) from any git remote URL, `.git` stripped. `path` is the full
/// namespace, e.g. "owner/repo" or GitLab's "group/sub/project".
pub fn parse_remote(url: &str) -> Option<(String, String)> {
    let u = url.trim().trim_end_matches('/');
    let u = u.strip_suffix(".git").unwrap_or(u);
    let body = if let Some(i) = u.find("://") {
        // strip scheme + optional user@
        let after = &u[i + 3..];
        after.splitn(2, '@').last().unwrap_or(after)
    } else if let Some(rest) = u.strip_prefix("git@") {
        rest
    } else {
        u
    };
    let sep = body.find(['/', ':'])?;
    let host = body[..sep].to_string();
    let path = body[sep + 1..].trim_start_matches('/').to_string();
    if host.is_empty() || path.is_empty() {
        return None;
    }
    Some((host, path))
}

/// Resolve the active repo's (provider, host, path) from its origin remote.
pub async fn active_remote(st: &AppState) -> Result<(Provider, String, String), String> {
    let id = st.store.active_repo_id().ok_or("No active repository.")?;
    let dir = repo_registry::resolve_repo_path(&id).await?;
    let remotes = crate::git::get_remotes(&dir).await.map_err(|e| e.message)?;
    let origin = remotes
        .iter()
        .find(|r| r.name == "origin")
        .or_else(|| remotes.first())
        .ok_or("No remote configured.")?;
    let provider = detect(&origin.url).ok_or("Unsupported hosting provider.")?;
    let (host, path) = parse_remote(&origin.url).ok_or("Could not parse remote URL.")?;
    Ok((provider, host, path))
}

/// The active provider, defaulting to GitHub (e.g. before a repo is opened, so
/// the sign-in UI still works).
pub async fn active(st: &AppState) -> Provider {
    active_remote(st).await.map(|(p, _, _)| p).unwrap_or(Provider::GitHub)
}

/// Route a `gh_call` to the active provider's backend module.
pub async fn dispatch(st: &AppState, app: &AppHandle, name: &str, args: Vec<Value>) -> Value {
    // Explicit-provider auth ops (accounts UI): args[0] = provider key, the rest
    // are the underlying op's args. Lets the user sign in to any host without
    // first opening a repo of that host. Everything else routes to the active repo.
    let explicit: Option<&str> = match name {
        "providerStatus" => Some("tokenStatus"),
        "providerSetToken" => Some("setToken"),
        "providerClearToken" => Some("clearToken"),
        "providerDeviceStart" => Some("deviceStart"),
        _ => None,
    };
    if let Some(inner) = explicit {
        let key = args.first().and_then(Value::as_str).unwrap_or_default();
        let Some(p) = from_key(key) else {
            return json!({ "error": format!("Unknown provider: {key}") });
        };
        let rest: Vec<Value> = args.into_iter().skip(1).collect();
        return dispatch_to(p, st, app, inner, rest).await;
    }
    dispatch_to(active(st).await, st, app, name, args).await
}

async fn dispatch_to(p: Provider, st: &AppState, app: &AppHandle, name: &str, args: Vec<Value>) -> Value {
    match p {
        Provider::GitLab => crate::gitlab::dispatch(st, app, name, args).await,
        Provider::Azure => crate::azure::dispatch(st, app, name, args).await,
        Provider::GitHub => crate::github::dispatch(st, app, name, args).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_hosts() {
        assert_eq!(detect("https://github.com/a/b.git"), Some(Provider::GitHub));
        assert_eq!(detect("git@gitlab.com:a/b.git"), Some(Provider::GitLab));
        assert_eq!(detect("https://dev.azure.com/o/p/_git/r"), Some(Provider::Azure));
        assert_eq!(detect("https://example.com/a/b"), None);
    }

    #[test]
    fn parses_remotes() {
        assert_eq!(
            parse_remote("https://gitlab.com/group/sub/proj.git"),
            Some(("gitlab.com".into(), "group/sub/proj".into()))
        );
        assert_eq!(
            parse_remote("git@github.com:foo/bar.git"),
            Some(("github.com".into(), "foo/bar".into()))
        );
    }
}
