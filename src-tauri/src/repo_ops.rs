// All `api:*` operations, ported from electron/main/handlers.ts, dispatched by
// name from api_call. Reads return data or `{ error }`; actions return `{}` or
// `{ error }` — the same shapes shared/types.ts already expects.
use crate::diff_hunks::split_diff_into_hunks;
use crate::git::{self, GitError};
use crate::path_utils::{clone_auth_args, is_windows_drive_root, parse_github_remote};
use crate::types::*;
use crate::{repo_registry, secrets, AppState};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::Path;

// ── small helpers ────────────────────────────────────────────────────────────
fn ok() -> Value {
    json!({})
}
fn err(msg: impl Into<String>) -> Value {
    json!({ "error": msg.into() })
}
fn to_val<T: Serialize>(x: T) -> Value {
    serde_json::to_value(x).unwrap_or_else(|e| err(e.to_string()))
}
fn arg_str(args: &[Value], i: usize) -> String {
    args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string()
}
fn arg_opt_str(args: &[Value], i: usize) -> Option<String> {
    args.get(i).and_then(|v| v.as_str()).map(str::to_string)
}
fn arg_bool(args: &[Value], i: usize) -> bool {
    args.get(i).and_then(|v| v.as_bool()).unwrap_or(false)
}

async fn require_active(st: &AppState) -> Result<(String, String), String> {
    let id = st.store.active_repo_id().ok_or("No active repository.")?;
    let path = repo_registry::resolve_repo_path(&id).await?;
    Ok((id, path))
}

/// The active repo's path (for the file watcher). None if none open.
pub async fn active_repo_path(st: &AppState) -> Option<String> {
    require_active(st).await.ok().map(|(_, p)| p)
}

fn emap(e: GitError) -> Value {
    err(e.message)
}

/// Run a single git mutation under the repo lock; ActionState result.
async fn git_action(st: &AppState, args: &[&str]) -> Value {
    let (id, path) = match require_active(st).await {
        Ok(v) => v,
        Err(e) => return err(e),
    };
    let lock = st.locks.for_repo(&id);
    let _g = lock.lock().await;
    match git::run_git(&path, args, &[]).await {
        Ok(_) => ok(),
        Err(e) => emap(e),
    }
}

fn repo_at(p: &Path) -> bool {
    p.join(".git").exists()
}

async fn cfg_get(path: &str, key: &str) -> Option<String> {
    git::run_git(path, &["config", "--get", key], &[])
        .await
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// The effective git identity + commit-signing config for the active repo.
async fn read_identity(path: &str) -> Value {
    json!({
        "userName": cfg_get(path, "user.name").await,
        "userEmail": cfg_get(path, "user.email").await,
        "signingKey": cfg_get(path, "user.signingkey").await,
        "gpgFormat": cfg_get(path, "gpg.format").await,
        "sign": cfg_get(path, "commit.gpgsign").await.map(|v| v == "true").unwrap_or(false),
    })
}

/// Write the identity/signing fields to the repo's *local* config (empty text
/// fields are unset, falling back to global). `sign` is always written.
async fn set_identity(st: &AppState, v: Option<&Value>) -> Value {
    let Some(Value::Object(obj)) = v else {
        return err("Invalid config payload.");
    };
    let obj = obj.clone();
    run_locked(st, |p| async move {
        let str_field = |k: &str| obj.get(k).and_then(Value::as_str).map(str::to_string);
        let sign = obj.get("sign").and_then(Value::as_bool).unwrap_or(false);
        let fields: Vec<(&str, Option<String>)> = vec![
            ("user.name", str_field("userName")),
            ("user.email", str_field("userEmail")),
            ("user.signingkey", str_field("signingKey")),
            ("gpg.format", str_field("gpgFormat")),
            ("commit.gpgsign", Some(if sign { "true" } else { "false" }.to_string())),
        ];
        for (key, val) in fields {
            match val {
                Some(v) if !v.trim().is_empty() => {
                    git::run_git(&p, &["config", key, v.trim()], &[]).await?;
                }
                _ => {
                    let _ = git::run_git(&p, &["config", "--unset", key], &[]).await;
                }
            }
        }
        Ok(())
    })
    .await
}

/// git-lfs availability + the repo's tracked patterns (from `git lfs track`).
async fn read_lfs(path: &str) -> Value {
    let installed = git::run_git(path, &["lfs", "version"], &[]).await.is_ok();
    let patterns: Vec<String> = if installed {
        git::run_git(path, &["lfs", "track"], &[])
            .await
            .map(|out| {
                out.lines()
                    // tracked entries are indented; the "Listing…" header is not.
                    .filter(|l| l.starts_with(char::is_whitespace))
                    .filter_map(|l| {
                        let pat = l.trim().split(" (").next()?.trim();
                        (!pat.is_empty()).then(|| pat.to_string())
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        vec![]
    };
    json!({ "installed": installed, "patterns": patterns })
}

/// First matching GitHub pull-request template in the repo, or "" if none.
async fn read_pr_template(repo: &str) -> String {
    const CANDIDATES: &[&str] = &[
        ".github/PULL_REQUEST_TEMPLATE.md",
        ".github/pull_request_template.md",
        "PULL_REQUEST_TEMPLATE.md",
        "pull_request_template.md",
        "docs/PULL_REQUEST_TEMPLATE.md",
        "docs/pull_request_template.md",
    ];
    for c in CANDIDATES {
        if let Ok(s) = tokio::fs::read_to_string(Path::new(repo).join(c)).await {
            return s;
        }
    }
    String::new()
}

const DRIVES: &str = "::drives";

fn list_drives() -> DirListing {
    let mut entries = Vec::new();
    for c in b'A'..=b'Z' {
        let root = format!("{}:\\", c as char);
        if Path::new(&root).exists() {
            entries.push(DirEntry {
                name: root.clone(),
                is_repo: repo_at(Path::new(&root)),
                path: root,
            });
        }
    }
    DirListing {
        path: "This PC".into(),
        parent: None,
        is_repo: false,
        entries,
        error: None,
    }
}

fn list_directory(path: Option<String>) -> DirListing {
    if path.as_deref() == Some(DRIVES) {
        return list_drives();
    }
    let target = match path {
        Some(p) if Path::new(&p).is_absolute() => p,
        _ => dirs::home_dir().map(|h| h.to_string_lossy().into_owned()).unwrap_or_default(),
    };
    let tp = Path::new(&target);
    let up = if is_windows_drive_root(&target) {
        Some(DRIVES.to_string())
    } else {
        tp.parent().map(|p| p.to_string_lossy().into_owned())
    };

    match std::fs::read_dir(&target) {
        Ok(rd) => {
            let mut entries: Vec<DirEntry> = rd
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
                .map(|e| {
                    let full = e.path();
                    DirEntry {
                        name: e.file_name().to_string_lossy().into_owned(),
                        is_repo: repo_at(&full),
                        path: full.to_string_lossy().into_owned(),
                    }
                })
                .collect();
            entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            DirListing {
                is_repo: repo_at(tp),
                path: target,
                parent: up,
                entries,
                error: None,
            }
        }
        Err(_) => DirListing {
            path: target,
            parent: up,
            is_repo: false,
            entries: vec![],
            error: Some("Cannot read this directory.".into()),
        },
    }
}

async fn open_repo(st: &AppState, path: &str) -> Value {
    let p = path.trim();
    if p.is_empty() {
        return err("Enter a repository path.");
    }
    if !Path::new(p).is_absolute() {
        return err("Path must be absolute.");
    }
    if !Path::new(p).exists() {
        return err("Path does not exist.");
    }
    if !git::is_git_repo(p).await {
        return err("Not a git repository.");
    }
    match repo_registry::register_repo(p) {
        Ok(id) => {
            st.store.set_active(&id, p);
            ok()
        }
        Err(e) => err(e),
    }
}

async fn clone_repo(st: &AppState, url: &str, directory: &str, token: Option<String>) -> Value {
    let u = url.trim();
    let parent = directory.trim();
    if u.is_empty() {
        return err("Enter a repository URL.");
    }
    if parent.is_empty() {
        return err("Enter a destination directory.");
    }
    if !Path::new(parent).is_absolute() {
        return err("Destination must be absolute.");
    }
    let name = u
        .trim_end_matches(".git")
        .trim_end_matches('/')
        .rsplit(|c| c == '/' || c == ':')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("repo");
    let target = Path::new(parent).join(name);
    let target_s = target.to_string_lossy().into_owned();

    let auth = token
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .or_else(|| {
            if parse_github_remote(u).is_some() {
                secrets::get_token()
            } else {
                None
            }
        });
    let mut args: Vec<String> = clone_auth_args(auth.as_deref());
    args.push("clone".into());
    args.push(u.to_string());
    args.push(target_s.clone());

    if std::fs::create_dir_all(parent).is_err() {
        return err("Clone failed.");
    }
    match git::run_git(parent, &args, &[("GIT_TERMINAL_PROMPT", "0")]).await {
        Ok(_) => match repo_registry::register_repo(&target_s) {
            Ok(id) => {
                st.store.set_active(&id, &target_s);
                ok()
            }
            Err(e) => err(e),
        },
        Err(e) => emap(e),
    }
}

async fn workspace(st: &AppState) -> Value {
    let (_, path) = match require_active(st).await {
        Ok(v) => v,
        Err(e) => return err(e),
    };
    // Run all 8 reads concurrently (separate git processes) — like the old
    // Electron Promise.all. Wall-clock = slowest single read, not the sum.
    let (repo, branches, remotes, tags, stashes, commits, status, merge) = tokio::join!(
        git::get_repo_info(&path),
        git::get_branches(&path),
        git::get_remotes(&path),
        git::get_tags(&path),
        git::get_stashes(&path),
        git::get_commits(&path, 100),
        git::get_status(&path),
        git::get_merge_state(&path),
    );
    let branches = branches.unwrap_or_default();
    let remotes = remotes.unwrap_or_default();
    let tags = tags.unwrap_or_default();
    let stashes = stashes.unwrap_or_default();
    let commits = commits.unwrap_or_default();
    let status = status.unwrap_or_default();
    let merge = merge.unwrap_or(MergeState {
        conflicted: vec![],
        in_merge: false,
        in_rebase: false,
    });
    to_val(WorkspaceData {
        repo,
        branches,
        remotes,
        tags,
        stashes,
        commits,
        status,
        merge,
    })
}

/// Write a patch to a temp file and `git apply` it with the given flags.
async fn apply_patch(path: &str, patch: &str, extra: &[&str]) -> Result<(), GitError> {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("opengit-{}-{}.patch", nanos, std::process::id()));
    tokio::fs::write(&tmp, patch)
        .await
        .map_err(|e| GitError::new(e.to_string()))?;
    let tmp_s = tmp.to_string_lossy().into_owned();
    let mut args: Vec<String> = vec!["apply".into()];
    args.extend(extra.iter().map(|s| s.to_string()));
    args.push(tmp_s);
    let r = git::run_git(path, &args, &[]).await;
    let _ = tokio::fs::remove_file(&tmp).await;
    r.map(|_| ())
}

/// Stage/unstage/revert one hunk. `source` picks which diff to split; `extra`
/// are the `git apply` flags.
async fn hunk_op(
    st: &AppState,
    file: &str,
    index: usize,
    source: HunkSource,
    extra: &[&str],
) -> Value {
    let (id, path) = match require_active(st).await {
        Ok(v) => v,
        Err(e) => return err(e),
    };
    let lock = st.locks.for_repo(&id);
    let _g = lock.lock().await;
    let diff = match source {
        HunkSource::Unstaged => git::get_unstaged_file_diff(&path, file).await,
        HunkSource::Staged => git::get_staged_file_diff(&path, file).await,
        HunkSource::Working => Ok(git::get_working_file_diff(&path, file).await),
    };
    let diff = match diff {
        Ok(d) => d,
        Err(e) => return emap(e),
    };
    let h = split_diff_into_hunks(&diff);
    let Some(hunk) = h.hunks.get(index) else {
        return err("Hunk no longer matches.");
    };
    match apply_patch(&path, &format!("{}\n{}\n", h.header, hunk), extra).await {
        Ok(_) => ok(),
        Err(e) => emap(e),
    }
}

enum HunkSource {
    Unstaged,
    Staged,
    Working,
}

fn parse_line_keys(v: Option<&Value>) -> std::collections::HashSet<(bool, i64)> {
    let mut set = std::collections::HashSet::new();
    if let Some(Value::Array(arr)) = v {
        for it in arr {
            let add = it.get("add").and_then(Value::as_bool).unwrap_or(false);
            if let Some(line) = it.get("line").and_then(Value::as_i64) {
                set.insert((add, line));
            }
        }
    }
    set
}

/// Stage/unstage/discard a selected subset of a file's changed lines. `mode`
/// picks the diff source + apply direction (mirrors hunk_op).
async fn line_op(
    st: &AppState,
    file: &str,
    selected: std::collections::HashSet<(bool, i64)>,
    mode: &str,
) -> Value {
    if selected.is_empty() {
        return err("No lines selected.");
    }
    // Modes mirror the working split view, which diffs HEAD vs working tree, so
    // staging reads from the Working source to keep line numbers aligned.
    let (source, reverse, extra): (HunkSource, bool, &[&str]) = match mode {
        "stage" => (HunkSource::Working, false, &["--cached"]),
        "unstage" => (HunkSource::Staged, true, &["--cached", "--reverse"]),
        "discard" => (HunkSource::Working, true, &["--reverse"]),
        _ => return err("Unknown line mode."),
    };
    let (id, path) = match require_active(st).await {
        Ok(v) => v,
        Err(e) => return err(e),
    };
    let lock = st.locks.for_repo(&id);
    let _g = lock.lock().await;
    let diff = match source {
        HunkSource::Unstaged => git::get_unstaged_file_diff(&path, file).await,
        HunkSource::Staged => git::get_staged_file_diff(&path, file).await,
        HunkSource::Working => Ok(git::get_working_file_diff(&path, file).await),
    };
    let diff = match diff {
        Ok(d) => d,
        Err(e) => return emap(e),
    };
    match crate::diff_hunks::build_selected_patch(&diff, &selected, reverse) {
        Some(patch) => match apply_patch(&path, &patch, extra).await {
            Ok(_) => ok(),
            Err(e) => emap(e),
        },
        None => err("Selected lines no longer match."),
    }
}

pub async fn dispatch(st: &AppState, name: &str, args: Vec<Value>) -> Value {
    match name {
        // ── browse / recent ──
        "listDirectory" => to_val(list_directory(arg_opt_str(&args, 0))),
        "recentRepos" => to_val(st.store.recent()),
        "removeRecent" => {
            st.store.remove_recent(&arg_str(&args, 0));
            ok()
        }
        "clearRecent" => {
            st.store.clear_recent();
            ok()
        }
        "openRepo" => open_repo(st, &arg_str(&args, 0)).await,
        "cloneRepo" => {
            clone_repo(st, &arg_str(&args, 0), &arg_str(&args, 1), arg_opt_str(&args, 2)).await
        }
        "closeRepo" => {
            st.store.clear_active();
            ok()
        }
        "workspace" => workspace(st).await,
        // Cheap HEAD probe — the renderer compares it across repo:changed events
        // to notify when a git op (incl. one run in the in-app terminal) moved HEAD.
        "repoHead" => match require_active(st).await {
            Ok((_, p)) => {
                let info = git::get_repo_info(&p).await;
                json!({ "head": info.head, "commit": info.commit })
            }
            Err(_) => json!({ "head": Value::Null, "commit": Value::Null }),
        },

        // ── read-only queries ──
        "commitDetail" => read_repo(st, |p| {
            let sha = arg_str(&args, 0);
            async move { git::get_commit_detail(&p, &sha).await.map(to_val) }
        })
        .await,
        "commitFileDiff" => read_repo(st, |p| {
            let (sha, file) = (arg_str(&args, 0), arg_str(&args, 1));
            async move {
                git::get_commit_file_diff(&p, &sha, &file)
                    .await
                    .map(|diff| json!({ "diff": diff }))
            }
        })
        .await,
        "commitFileImage" => match require_active(st).await {
            Ok((_, p)) => to_val(git::get_commit_file_image(&p, &arg_str(&args, 0), &arg_str(&args, 1)).await),
            Err(e) => err(e),
        },
        "workingFileDiff" => match require_active(st).await {
            Ok((_, p)) => json!({ "diff": git::get_working_file_diff(&p, &arg_str(&args, 0)).await }),
            Err(e) => err(e),
        },
        "workingFileImage" => match require_active(st).await {
            Ok((_, p)) => to_val(git::get_working_file_image(&p, &arg_str(&args, 0)).await),
            Err(e) => err(e),
        },
        "fileHunkDiffs" => match require_active(st).await {
            Ok((_, p)) => {
                let file = arg_str(&args, 0);
                let (unstaged, staged) = tokio::join!(
                    git::get_unstaged_file_diff(&p, &file),
                    git::get_staged_file_diff(&p, &file),
                );
                match (unstaged, staged) {
                    (Ok(u), Ok(s)) => to_val(HunkData { unstaged: u, staged: s }),
                    (Err(e), _) | (_, Err(e)) => emap(e),
                }
            }
            Err(e) => err(e),
        },
        "conflictVersions" => match require_active(st).await {
            Ok((_, p)) => to_val(git::get_conflict_versions(&p, &arg_str(&args, 0)).await),
            Err(e) => err(e),
        },
        "blameFile" => read_repo(st, |p| {
            let file = arg_str(&args, 0);
            async move {
                git::get_blame(&p, &file)
                    .await
                    .map(|lines| json!({ "lines": to_val(lines) }))
            }
        })
        .await,
        "rebaseCommits" => read_repo(st, |p| {
            let base = arg_str(&args, 0);
            async move {
                git::get_rebase_commits(&p, &base)
                    .await
                    .map(|commits| json!({ "commits": to_val(commits) }))
            }
        })
        .await,

        // ── sync ──
        "gitFetch" => git_action(st, &["fetch", "--all", "--prune"]).await,
        "gitPush" => git_action(st, &["push"]).await,
        "gitPushSetUpstream" => git_action(st, &["push", "-u", "origin", "HEAD"]).await,
        "gitPushForce" => git_action(st, &["push", "--force-with-lease"]).await,
        "gitPull" => {
            let flag = match arg_opt_str(&args, 0).as_deref().unwrap_or("ff-or-merge") {
                "ff" => "--ff-only",
                "rebase" => "--rebase",
                _ => "--no-rebase",
            };
            git_action(st, &["pull", flag]).await
        }

        // ── staging / commit ──
        "stageFile" => git_action(st, &["add", "--", &arg_str(&args, 0)]).await,
        "stageAll" => git_action(st, &["add", "--all"]).await,
        "unstageFile" => git_action(st, &["restore", "--staged", "--", &arg_str(&args, 0)]).await,
        "unstageAll" => git_action(st, &["reset"]).await,
        "discardFile" => {
            let file = arg_str(&args, 0);
            if arg_bool(&args, 1) {
                git_action(st, &["clean", "-f", "--", &file]).await
            } else {
                git_action(st, &["restore", "--", &file]).await
            }
        }
        "discardAll" => {
            run_locked(st, |p| async move {
                git::run_git(&p, &["restore", "--", "."], &[]).await?;
                git::run_git(&p, &["clean", "-fd"], &[]).await?;
                Ok(())
            })
            .await
        }
        "commit" => {
            let msg = arg_str(&args, 0);
            if msg.trim().is_empty() {
                err("Commit message is required.")
            } else {
                git_action(st, &["commit", "-m", &msg]).await
            }
        }
        "amendCommit" => {
            let msg = arg_opt_str(&args, 0).unwrap_or_default();
            if msg.trim().is_empty() {
                git_action(st, &["commit", "--amend", "--no-edit"]).await
            } else {
                git_action(st, &["commit", "--amend", "-m", msg.trim()]).await
            }
        }

        // ── branches ──
        "checkoutBranch" => git_action(st, &["checkout", &arg_str(&args, 0)]).await,
        "checkoutCommit" => git_action(st, &["checkout", &arg_str(&args, 0)]).await,
        "mergeBranch" => git_action(st, &["merge", "--no-edit", &arg_str(&args, 0)]).await,
        // Drag-drop combine: check out `target`, then merge/rebase `source` into it.
        "mergeInto" => {
            let (target, source) = (arg_str(&args, 0), arg_str(&args, 1));
            run_locked(st, |p| async move {
                git::run_git(&p, &["checkout", &target], &[]).await?;
                git::run_git(&p, &["merge", "--no-edit", &source], &[]).await?;
                Ok(())
            })
            .await
        }
        "rebaseOnto" => {
            let (target, onto) = (arg_str(&args, 0), arg_str(&args, 1));
            run_locked(st, |p| async move {
                git::run_git(&p, &["checkout", &target], &[]).await?;
                git::run_git(&p, &["rebase", &onto], &[]).await?;
                Ok(())
            })
            .await
        }
        "deleteBranch" => git_action(st, &["branch", "-d", &arg_str(&args, 0)]).await,
        "renameBranch" => {
            let (old, new) = (arg_str(&args, 0), arg_str(&args, 1));
            if new.trim().is_empty() {
                err("New name is required.")
            } else {
                git_action(st, &["branch", "-m", &old, new.trim()]).await
            }
        }
        "deleteRemoteBranch" => {
            git_action(st, &["push", &arg_str(&args, 0), "--delete", &arg_str(&args, 1)]).await
        }
        "createBranch" => {
            let name = arg_str(&args, 0);
            if name.trim().is_empty() {
                err("Branch name is required.")
            } else {
                git_action(st, &["switch", "-c", &name]).await
            }
        }
        "createBranchAt" => {
            let (name, sha) = (arg_str(&args, 0), arg_str(&args, 1));
            if name.trim().is_empty() {
                err("Branch name is required.")
            } else {
                git_action(st, &["branch", &name, &sha]).await
            }
        }
        "createRemoteBranch" => {
            let (remote, name) = (arg_str(&args, 0), arg_str(&args, 1));
            if name.trim().is_empty() {
                err("Branch name is required.")
            } else if remote.trim().is_empty() {
                err("Remote is required.")
            } else {
                git_action(st, &["push", &remote, &format!("HEAD:refs/heads/{name}")]).await
            }
        }
        "publishBranch" => {
            let (remote, name) = (arg_str(&args, 0), arg_str(&args, 1));
            if name.trim().is_empty() {
                err("Branch name is required.")
            } else if remote.trim().is_empty() {
                err("Remote is required.")
            } else {
                run_locked(st, |p| async move {
                    git::run_git(&p, &["switch", "-c", &name], &[]).await?;
                    git::run_git(&p, &["push", "-u", &remote, &name], &[]).await?;
                    Ok(())
                })
                .await
            }
        }

        // ── commit ops ──
        "cherryPick" => git_action(st, &["cherry-pick", &arg_str(&args, 0)]).await,
        "revertCommit" => git_action(st, &["revert", "--no-edit", &arg_str(&args, 0)]).await,
        "resetToCommit" => {
            let sha = arg_str(&args, 0);
            let mode = arg_str(&args, 1);
            let mode = match mode.as_str() {
                "soft" | "mixed" | "hard" => mode,
                _ => "mixed".into(),
            };
            git_action(st, &["reset", &format!("--{mode}"), &sha]).await
        }

        // ── tags ──
        "createTagAt" => {
            let (name, sha) = (arg_str(&args, 0), arg_str(&args, 1));
            if name.trim().is_empty() {
                err("Tag name is required.")
            } else {
                git_action(st, &["tag", &name, &sha]).await
            }
        }
        "deleteTag" => git_action(st, &["tag", "-d", &arg_str(&args, 0)]).await,
        "deleteRemoteTag" => {
            git_action(st, &["push", "origin", &format!(":refs/tags/{}", arg_str(&args, 0))]).await
        }
        "fetchTags" => git_action(st, &["fetch", "origin", "--tags"]).await,

        // ── conflicts ──
        "resolveOurs" => {
            let file = arg_str(&args, 0);
            run_locked(st, |p| async move {
                git::run_git(&p, &["checkout", "--ours", "--", &file], &[]).await?;
                git::run_git(&p, &["add", "--", &file], &[]).await?;
                Ok(())
            })
            .await
        }
        "resolveTheirs" => {
            let file = arg_str(&args, 0);
            run_locked(st, |p| async move {
                git::run_git(&p, &["checkout", "--theirs", "--", &file], &[]).await?;
                git::run_git(&p, &["add", "--", &file], &[]).await?;
                Ok(())
            })
            .await
        }
        "saveResolution" => {
            let (file, content) = (arg_str(&args, 0), arg_str(&args, 1));
            run_locked(st, |p| async move {
                tokio::fs::write(Path::new(&p).join(&file), content)
                    .await
                    .map_err(|e| GitError::new(e.to_string()))?;
                git::run_git(&p, &["add", "--", &file], &[]).await?;
                Ok(())
            })
            .await
        }
        "markResolved" => {
            let file = arg_str(&args, 0);
            run_locked(st, |p| async move {
                git::run_git(&p, &["add", "--", &file], &[]).await?;
                Ok(())
            })
            .await
        }
        "abortMerge" => {
            run_locked(st, |p| async move {
                let state = git::get_merge_state(&p).await?;
                let args: &[&str] = if state.in_rebase {
                    &["rebase", "--abort"]
                } else {
                    &["merge", "--abort"]
                };
                git::run_git(&p, args, &[]).await?;
                Ok(())
            })
            .await
        }
        "continueMerge" => {
            run_locked(st, |p| async move {
                let state = git::get_merge_state(&p).await?;
                if !state.conflicted.is_empty() {
                    return Err(GitError::new("Resolve all conflicts first."));
                }
                if state.in_rebase {
                    git::run_git(&p, &["rebase", "--continue"], &[("GIT_EDITOR", "true")]).await?;
                } else {
                    git::run_git(&p, &["commit", "--no-edit"], &[]).await?;
                }
                Ok(())
            })
            .await
        }

        // ── stash ──
        "stashPush" => {
            let mut args2 = vec!["stash".to_string(), "push".into(), "--include-untracked".into()];
            if let Some(m) = arg_opt_str(&args, 0) {
                if !m.trim().is_empty() {
                    args2.push("-m".into());
                    args2.push(m.trim().to_string());
                }
            }
            let refs: Vec<&str> = args2.iter().map(String::as_str).collect();
            git_action(st, &refs).await
        }
        "stashApply" => git_action(st, &["stash", "apply", &arg_str(&args, 0)]).await,
        "stashPop" => git_action(st, &["stash", "pop", &arg_str(&args, 0)]).await,
        "stashDrop" => git_action(st, &["stash", "drop", &arg_str(&args, 0)]).await,

        // ── hunk-level ──
        "stageHunk" => {
            hunk_op(st, &arg_str(&args, 0), idx(&args, 1), HunkSource::Unstaged, &["--cached"]).await
        }
        "unstageHunk" => {
            hunk_op(st, &arg_str(&args, 0), idx(&args, 1), HunkSource::Staged, &["--cached", "--reverse"]).await
        }
        "revertHunk" => {
            hunk_op(st, &arg_str(&args, 0), idx(&args, 1), HunkSource::Unstaged, &["--reverse"]).await
        }
        "revertWorkingHunk" => {
            hunk_op(st, &arg_str(&args, 0), idx(&args, 1), HunkSource::Working, &["--reverse"]).await
        }
        "stageWorkingHunk" => {
            hunk_op(st, &arg_str(&args, 0), idx(&args, 1), HunkSource::Working, &["--cached"]).await
        }

        // ── line-level ──
        "applyLines" => {
            line_op(st, &arg_str(&args, 0), parse_line_keys(args.get(1)), &arg_str(&args, 2)).await
        }

        // ── interactive rebase ──
        "interactiveRebase" => interactive_rebase(st, &arg_str(&args, 0), args.get(1)).await,

        // ── pull-request template (local repo file) ──
        "prTemplate" => read_repo(st, |p| async move {
            Ok(json!({ "body": read_pr_template(&p).await }))
        })
        .await,

        // ── identity / signing config ──
        "getConfig" => read_repo(st, |p| async move { Ok(read_identity(&p).await) }).await,
        "setConfig" => set_identity(st, args.first()).await,

        // ── undo (move HEAD back one reflog step; --keep aborts if it would
        // clobber uncommitted work, so it's safe). Redo via the reflog view. ──
        "undoLast" => git_action(st, &["reset", "--keep", "HEAD@{1}"]).await,

        // ── git LFS ──
        "lfsInfo" => read_repo(st, |p| async move { Ok(read_lfs(&p).await) }).await,
        "lfsTrack" => git_action(st, &["lfs", "track", &arg_str(&args, 0)]).await,
        "lfsUntrack" => git_action(st, &["lfs", "untrack", &arg_str(&args, 0)]).await,
        "lfsPull" => git_action(st, &["lfs", "pull"]).await,

        // ── file history ──
        "fileHistory" => read_repo(st, |p| {
            let file = arg_str(&args, 0);
            async move {
                git::get_file_history(&p, &file, 200)
                    .await
                    .map(|commits| json!({ "commits": to_val(commits) }))
            }
        })
        .await,

        // ── reflog ──
        "reflog" => read_repo(st, |p| async move {
            git::get_reflog(&p, 200).await.map(|entries| json!({ "entries": to_val(entries) }))
        })
        .await,

        // ── submodules ──
        "submodules" => read_repo(st, |p| async move {
            git::get_submodules(&p).await.map(|items| json!({ "items": to_val(items) }))
        })
        .await,
        "submoduleUpdate" => {
            let sub = arg_opt_str(&args, 0).filter(|s| !s.trim().is_empty());
            run_locked(st, |p| async move {
                let mut a = vec!["submodule", "update", "--init", "--recursive"];
                if let Some(ref s) = sub {
                    a.push("--");
                    a.push(s);
                }
                git::run_git(&p, &a, &[]).await?;
                Ok(())
            })
            .await
        }
        "submoduleSync" => git_action(st, &["submodule", "sync", "--recursive"]).await,

        // ── worktrees ──
        "worktrees" => read_repo(st, |p| async move {
            git::get_worktrees(&p, &p).await.map(|items| json!({ "items": to_val(items) }))
        })
        .await,
        "worktreeAdd" => {
            let (wpath, branch, new_branch) =
                (arg_str(&args, 0), arg_opt_str(&args, 1), arg_bool(&args, 2));
            if wpath.trim().is_empty() {
                return err("Worktree path is required.");
            }
            run_locked(st, |p| async move {
                let mut a = vec!["worktree".to_string(), "add".to_string()];
                match branch.filter(|b| !b.trim().is_empty()) {
                    Some(b) if new_branch => {
                        a.push("-b".into());
                        a.push(b);
                        a.push(wpath);
                    }
                    Some(b) => {
                        a.push(wpath);
                        a.push(b);
                    }
                    None => a.push(wpath),
                }
                git::run_git(&p, &a, &[]).await?;
                Ok(())
            })
            .await
        }
        "worktreeRemove" => {
            let (wpath, force) = (arg_str(&args, 0), arg_bool(&args, 1));
            if force {
                git_action(st, &["worktree", "remove", "--force", &wpath]).await
            } else {
                git_action(st, &["worktree", "remove", &wpath]).await
            }
        }
        "worktreePrune" => git_action(st, &["worktree", "prune"]).await,

        _ => err(format!("api:{name} not implemented")),
    }
}

fn idx(args: &[Value], i: usize) -> usize {
    args.get(i).and_then(|v| v.as_u64()).unwrap_or(0) as usize
}

/// Read helper: resolve the active repo, run `f`, map errors to `{ error }`.
async fn read_repo<F, Fut>(st: &AppState, f: F) -> Value
where
    F: FnOnce(String) -> Fut,
    Fut: std::future::Future<Output = Result<Value, GitError>>,
{
    match require_active(st).await {
        Ok((_, p)) => match f(p).await {
            Ok(v) => v,
            Err(e) => emap(e),
        },
        Err(e) => err(e),
    }
}

/// Mutation helper: take the repo lock, run a multi-step `f`, ActionState result.
async fn run_locked<F, Fut>(st: &AppState, f: F) -> Value
where
    F: FnOnce(String) -> Fut,
    Fut: std::future::Future<Output = Result<(), GitError>>,
{
    let (id, path) = match require_active(st).await {
        Ok(v) => v,
        Err(e) => return err(e),
    };
    let lock = st.locks.for_repo(&id);
    let _g = lock.lock().await;
    match f(path).await {
        Ok(_) => ok(),
        Err(e) => emap(e),
    }
}

async fn interactive_rebase(st: &AppState, base: &str, ops_val: Option<&Value>) -> Value {
    let base = base.to_string();
    let ops: std::collections::HashMap<String, String> = ops_val
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    run_locked(st, |p| async move {
        let commits = git::get_rebase_commits(&p, &base).await?;
        if commits.is_empty() {
            return Err(GitError::new("Nothing to rebase."));
        }
        let mut todo: Vec<String> = Vec::new();
        let mut first_kept = true;
        for c in &commits {
            let mut op = ops.get(&c.sha).cloned().unwrap_or_else(|| "pick".into());
            if op == "drop" {
                todo.push(format!("drop {} {}", c.sha, c.subject));
                continue;
            }
            if first_kept && (op == "squash" || op == "fixup") {
                op = "pick".into();
            }
            first_kept = false;
            todo.push(format!("{op} {} {}", c.sha, c.subject));
        }
        if todo.iter().all(|l| l.starts_with("drop")) {
            return Err(GitError::new("Cannot drop every commit."));
        }
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let tmp = std::env::temp_dir().join(format!("opengit-rebase-{}-{}.txt", nanos, std::process::id()));
        tokio::fs::write(&tmp, format!("{}\n", todo.join("\n")))
            .await
            .map_err(|e| GitError::new(e.to_string()))?;
        let seq = format!("cp '{}'", tmp.to_string_lossy());
        let r = git::run_git(
            &p,
            &["rebase", "-i", &base],
            &[("GIT_SEQUENCE_EDITOR", seq.as_str()), ("GIT_EDITOR", "true")],
        )
        .await;
        let _ = tokio::fs::remove_file(&tmp).await;
        r.map(|_| ())
    })
    .await
}
