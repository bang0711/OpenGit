// Git execution engine, ported from electron/main/git.ts. All git runs through
// `run_git` (tokio process spawn of the system `git`); the getters parse its
// output into the shared types.
use crate::types::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::collections::HashMap;
use std::ffi::OsStr;
use std::path::Path;
use tokio::process::Command;

const FS: char = '\u{1f}';
const RS: char = '\u{1e}';

#[derive(Debug)]
pub struct GitError {
    pub message: String,
    pub stdout: String,
}

impl GitError {
    pub fn new(message: impl Into<String>) -> Self {
        GitError {
            message: message.into(),
            stdout: String::new(),
        }
    }
}

#[cfg(windows)]
fn no_window(cmd: &mut Command) {
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW (tokio Command, inherent)
}
#[cfg(not(windows))]
fn no_window(_cmd: &mut Command) {}

/// Run a git command in `cwd`. Ok = stdout. Err carries stderr + any stdout.
pub async fn run_git<S: AsRef<OsStr>>(
    cwd: &str,
    args: &[S],
    env: &[(&str, &str)],
) -> Result<String, GitError> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(cwd);
    for (k, v) in env {
        cmd.env(k, v);
    }
    no_window(&mut cmd);
    let out = cmd
        .output()
        .await
        .map_err(|e| GitError::new(e.to_string()))?;
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    if out.status.success() {
        Ok(stdout)
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr).into_owned();
        let msg = if stderr.trim().is_empty() {
            "git command failed".to_string()
        } else {
            stderr.trim().to_string()
        };
        Err(GitError {
            message: msg,
            stdout,
        })
    }
}

/// Raw bytes of stdout (for binary blobs like images).
async fn run_git_bytes(cwd: &str, args: &[&str]) -> Result<Vec<u8>, GitError> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(cwd);
    no_window(&mut cmd);
    let out = cmd
        .output()
        .await
        .map_err(|e| GitError::new(e.to_string()))?;
    if out.status.success() {
        Ok(out.stdout)
    } else {
        Err(GitError::new("git command failed"))
    }
}

fn image_mime(file: &str) -> Option<&'static str> {
    let ext = file.rsplit('.').next()?.to_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => return None,
    })
}

fn data_url(bytes: &[u8], mime: &str) -> String {
    format!("data:{mime};base64,{}", STANDARD.encode(bytes))
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

pub async fn is_git_repo(path: &str) -> bool {
    match run_git(path, &["rev-parse", "--is-inside-work-tree"], &[]).await {
        Ok(out) => out.trim() == "true",
        Err(_) => false,
    }
}

pub async fn get_repo_info(path: &str) -> RepoInfo {
    let branch = run_git(path, &["branch", "--show-current"], &[])
        .await
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let sha = run_git(path, &["rev-parse", "--short", "HEAD"], &[])
        .await
        .ok()
        .map(|s| s.trim().to_string());
    RepoInfo {
        path: path.to_string(),
        name: basename(path),
        head: if branch.is_empty() {
            None
        } else {
            Some(branch.clone())
        },
        detached: branch.is_empty(),
        commit: sha,
    }
}

pub async fn get_branches(path: &str) -> Result<Vec<Branch>, GitError> {
    let format = [
        "%(refname)",
        "%(refname:short)",
        "%(HEAD)",
        "%(upstream:short)",
        "%(upstream:track,nobracket)",
        "%(objectname:short)",
        "%(contents:subject)",
    ]
    .join(&FS.to_string());
    let out = run_git(
        path,
        &[
            "for-each-ref",
            &format!("--format={format}"),
            "refs/heads",
            "refs/remotes",
        ],
        &[],
    )
    .await?;

    let mut branches = Vec::new();
    for line in out.split('\n') {
        if line.trim().is_empty() {
            continue;
        }
        let p: Vec<&str> = line.split(FS).collect();
        if p.len() < 7 {
            continue;
        }
        let (refname, short, head, upstream, track, sha, subject) =
            (p[0], p[1], p[2], p[3], p[4], p[5], p[6]);
        if refname.ends_with("/HEAD") {
            continue;
        }
        branches.push(Branch {
            name: short.to_string(),
            full_name: refname.to_string(),
            is_remote: refname.starts_with("refs/remotes/"),
            is_current: head == "*",
            upstream: if upstream.is_empty() {
                None
            } else {
                Some(upstream.to_string())
            },
            ahead: extract_num(track, "ahead"),
            behind: extract_num(track, "behind"),
            sha: sha.to_string(),
            subject: subject.to_string(),
        });
    }
    Ok(branches)
}

fn extract_num(track: &str, key: &str) -> i64 {
    // track like "ahead 2, behind 1"; pull the number after `key`.
    if let Some(pos) = track.find(key) {
        track[pos + key.len()..]
            .trim_start()
            .split(|c: char| !c.is_ascii_digit())
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0)
    } else {
        0
    }
}

pub async fn get_remotes(path: &str) -> Result<Vec<Remote>, GitError> {
    let out = run_git(path, &["remote", "-v"], &[]).await?;
    let mut seen: Vec<(String, String)> = Vec::new();
    for line in out.split('\n') {
        if line.trim().is_empty() {
            continue;
        }
        let mut parts = line.split('\t');
        let name = parts.next().unwrap_or("").to_string();
        let url = parts
            .next()
            .and_then(|rest| rest.split(' ').next())
            .unwrap_or("")
            .to_string();
        if !seen.iter().any(|(n, _)| n == &name) {
            seen.push((name, url));
        }
    }
    Ok(seen
        .into_iter()
        .map(|(name, url)| Remote { name, url })
        .collect())
}

pub async fn get_tags(path: &str) -> Result<Vec<Tag>, GitError> {
    let out = run_git(
        path,
        &[
            "for-each-ref",
            &format!("--format=%(refname:short){FS}%(objectname:short)"),
            "--sort=-creatordate",
            "refs/tags",
        ],
        &[],
    )
    .await?;
    Ok(out
        .split('\n')
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| {
            let mut it = l.split(FS);
            Some(Tag {
                name: it.next()?.to_string(),
                sha: it.next()?.to_string(),
            })
        })
        .collect())
}

pub async fn get_stashes(path: &str) -> Result<Vec<Stash>, GitError> {
    let out = run_git(
        path,
        &["stash", "list", &format!("--format=%gd{FS}%gs")],
        &[],
    )
    .await?;
    Ok(out
        .split('\n')
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| {
            let mut it = l.split(FS);
            Some(Stash {
                reference: it.next()?.to_string(),
                message: it.next().unwrap_or("").to_string(),
            })
        })
        .collect())
}

fn parse_numstat(t: &str) -> Option<(i64, i64, &str)> {
    let mut it = t.splitn(3, '\t');
    let a = it.next()?;
    let d = it.next()?;
    let f = it.next()?;
    let av = if a == "-" { -1 } else { a.parse().ok()? };
    let dv = if d == "-" { -1 } else { d.parse().ok()? };
    Some((av, dv, f))
}

async fn numstat(path: &str, extra: &[&str]) -> Result<HashMap<String, (i64, i64)>, GitError> {
    let mut args = vec!["diff", "--numstat", "-z"];
    args.extend_from_slice(extra);
    let out = run_git(path, &args, &[]).await?;
    let tokens: Vec<&str> = out.split('\0').collect();
    let mut map = HashMap::new();
    let mut i = 0;
    while i < tokens.len() {
        let t = tokens[i];
        if t.is_empty() {
            i += 1;
            continue;
        }
        if let Some((add, del, file)) = parse_numstat(t) {
            let file = if file.is_empty() {
                // rename: token is "add\tdel\t", real name is two tokens ahead
                i += 2;
                tokens.get(i).copied().unwrap_or("").to_string()
            } else {
                file.to_string()
            };
            map.insert(file, (add, del));
        }
        i += 1;
    }
    Ok(map)
}

pub async fn get_status(path: &str) -> Result<Vec<FileStatus>, GitError> {
    // Bind arg arrays to locals so they outlive the join! (which drops
    // statement-temporaries before polling).
    let status_args = ["status", "--porcelain=v1", "-z", "--untracked-files=all"];
    let none: [&str; 0] = [];
    let cached = ["--cached"];
    let (status, unstaged_stat, staged_stat) = tokio::join!(
        run_git(path, &status_args, &[]),
        numstat(path, &none),
        numstat(path, &cached),
    );
    let status = status?;
    let unstaged_stat = unstaged_stat.unwrap_or_default();
    let staged_stat = staged_stat.unwrap_or_default();

    let entries: Vec<&str> = status.split('\0').filter(|s| !s.is_empty()).collect();
    let mut files = Vec::new();
    let mut i = 0;
    while i < entries.len() {
        let entry = entries[i];
        if entry.len() < 3 {
            i += 1;
            continue;
        }
        let x = &entry[0..1];
        let y = &entry[1..2];
        let file = &entry[3..];
        if x == "R" || x == "C" {
            i += 1; // skip the rename source token
        }
        let untracked = x == "?" && y == "?";
        let us = unstaged_stat.get(file);
        let st = staged_stat.get(file);
        files.push(FileStatus {
            path: file.to_string(),
            index: x.to_string(),
            worktree: y.to_string(),
            staged: !untracked && x != " " && x != "?",
            unstaged: y != " " && y != "?",
            untracked,
            staged_adds: st.map(|s| s.0).unwrap_or(0),
            staged_dels: st.map(|s| s.1).unwrap_or(0),
            unstaged_adds: us.map(|s| s.0).unwrap_or(if untracked { -1 } else { 0 }),
            unstaged_dels: us.map(|s| s.1).unwrap_or(0),
        });
        i += 1;
    }
    Ok(files)
}

pub async fn get_commits(path: &str, limit: u32) -> Result<Vec<Commit>, GitError> {
    let format = ["%H", "%h", "%P", "%an", "%ae", "%at", "%s", "%D"].join(&FS.to_string());
    let out = run_git(
        path,
        &[
            "log",
            "--all",
            &format!("--max-count={limit}"),
            "--date-order",
            &format!("--pretty=format:{format}{RS}"),
        ],
        &[],
    )
    .await?;
    let mut commits = Vec::new();
    for record in out.split(RS) {
        let line = record.strip_prefix('\n').unwrap_or(record);
        if line.trim().is_empty() {
            continue;
        }
        let p: Vec<&str> = line.split(FS).collect();
        if p.len() < 8 {
            continue;
        }
        commits.push(Commit {
            sha: p[0].to_string(),
            short_sha: p[1].to_string(),
            parents: split_ws(p[2]),
            author_name: p[3].to_string(),
            author_email: p[4].to_string(),
            date: p[5].parse().unwrap_or(0),
            subject: p[6].to_string(),
            refs: if p[7].is_empty() {
                vec![]
            } else {
                p[7].split(", ").map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()
            },
        });
    }
    Ok(commits)
}

fn split_ws(s: &str) -> Vec<String> {
    s.split(' ').filter(|t| !t.is_empty()).map(|t| t.to_string()).collect()
}

pub async fn get_commit_detail(path: &str, sha: &str) -> Result<CommitDetail, GitError> {
    let format = ["%H", "%h", "%P", "%an", "%ae", "%at", "%s", "%b"].join(&FS.to_string());
    let fmt = format!("--format={format}");
    let a1 = ["show", "-s", fmt.as_str(), sha];
    let a2 = ["show", "--no-renames", "--numstat", "--format=", sha];
    let a3 = ["show", "--name-status", "--format=", sha];
    let (meta, numstat_out, name_status) = tokio::join!(
        run_git(path, &a1, &[]),
        run_git(path, &a2, &[]),
        run_git(path, &a3, &[]),
    );
    let meta = meta?;
    let numstat_out = numstat_out?;
    let name_status = name_status?;

    let p: Vec<&str> = meta.split(FS).collect();
    let get = |i: usize| p.get(i).copied().unwrap_or("");

    let mut status_by_path: HashMap<String, String> = HashMap::new();
    for line in name_status.split('\n') {
        if line.trim().is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        if let (Some(code), Some(last)) = (cols.first(), cols.last()) {
            if let Some(c) = code.chars().next() {
                status_by_path.insert(last.to_string(), c.to_string());
            }
        }
    }

    let mut files = Vec::new();
    for line in numstat_out.split('\n') {
        if line.trim().is_empty() {
            continue;
        }
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() < 3 {
            continue;
        }
        let file = cols[2];
        files.push(CommitFile {
            path: file.to_string(),
            status: status_by_path.get(file).cloned().unwrap_or_else(|| "M".to_string()),
            additions: if cols[0] == "-" { -1 } else { cols[0].parse().unwrap_or(0) },
            deletions: if cols[1] == "-" { -1 } else { cols[1].parse().unwrap_or(0) },
        });
    }

    Ok(CommitDetail {
        sha: get(0).to_string(),
        short_sha: get(1).to_string(),
        parents: split_ws(get(2)),
        author_name: get(3).to_string(),
        author_email: get(4).to_string(),
        date: get(5).parse().unwrap_or(0),
        subject: get(6).to_string(),
        body: get(7).trim().to_string(),
        files,
    })
}

pub async fn get_commit_file_diff(path: &str, sha: &str, file: &str) -> Result<String, GitError> {
    run_git(path, &["show", "--format=", "-p", sha, "--", file], &[]).await
}

pub async fn get_commit_file_image(path: &str, sha: &str, file: &str) -> ImageDiff {
    let mime = image_mime(file).unwrap_or("application/octet-stream");
    let read = |rev: String| async move {
        run_git_bytes(path, &["show", &format!("{rev}:{file}")])
            .await
            .ok()
            .map(|b| data_url(&b, mime))
    };
    let (old, new) = tokio::join!(read(format!("{sha}^")), read(sha.to_string()));
    ImageDiff { old, new }
}

pub async fn get_working_file_image(path: &str, file: &str) -> ImageDiff {
    let mime = image_mime(file).unwrap_or("application/octet-stream");
    let head_arg = format!("HEAD:{file}");
    let show = ["show", head_arg.as_str()];
    let on_disk = Path::new(path).join(file);
    let (old_b, new_b) = tokio::join!(
        run_git_bytes(path, &show),
        tokio::fs::read(on_disk),
    );
    let old = old_b.ok().map(|b| data_url(&b, mime));
    let new = new_b.ok().map(|b| data_url(&b, mime));
    ImageDiff { old, new }
}

pub async fn get_merge_state(path: &str) -> Result<MergeState, GitError> {
    let out = run_git(
        path,
        &["diff", "--name-only", "--diff-filter=U", "-z"],
        &[],
    )
    .await?;
    let conflicted: Vec<String> = out.split('\0').filter(|s| !s.is_empty()).map(|s| s.to_string()).collect();

    let mut git_dir = path.to_string();
    if let Ok(raw) = run_git(path, &["rev-parse", "--git-dir"], &[]).await {
        let raw = raw.trim();
        let p = Path::new(raw);
        git_dir = if p.is_absolute() {
            raw.to_string()
        } else {
            Path::new(path).join(raw).to_string_lossy().into_owned()
        };
    }
    let gd = Path::new(&git_dir);
    Ok(MergeState {
        conflicted,
        in_merge: gd.join("MERGE_HEAD").exists(),
        in_rebase: gd.join("rebase-merge").exists() || gd.join("rebase-apply").exists(),
    })
}

pub async fn get_conflict_versions(path: &str, file: &str) -> ConflictVersions {
    let stage = |n: u8| async move {
        run_git(path, &["show", &format!(":{n}:{file}")], &[]).await.ok()
    };
    let (ours, theirs, working) = tokio::join!(
        stage(2),
        stage(3),
        tokio::fs::read_to_string(Path::new(path).join(file)),
    );
    ConflictVersions {
        ours,
        theirs,
        working: working.unwrap_or_default(),
    }
}

pub async fn get_working_file_diff(path: &str, file: &str) -> String {
    match run_git(path, &["diff", "HEAD", "--", file], &[]).await {
        Ok(out) if !out.trim().is_empty() => return out,
        Ok(_) => {}
        Err(e) if !e.stdout.trim().is_empty() => return e.stdout,
        Err(_) => {}
    }
    match run_git(path, &["diff", "--no-index", "--", "/dev/null", file], &[]).await {
        Ok(out) => out,
        Err(e) => e.stdout,
    }
}

pub async fn get_unstaged_file_diff(path: &str, file: &str) -> Result<String, GitError> {
    run_git(path, &["diff", "--", file], &[]).await
}

pub async fn get_staged_file_diff(path: &str, file: &str) -> Result<String, GitError> {
    run_git(path, &["diff", "--cached", "--", file], &[]).await
}

pub async fn get_blame(path: &str, file: &str) -> Result<Vec<BlameLine>, GitError> {
    let out = run_git(path, &["blame", "--porcelain", "--", file], &[]).await?;
    let mut meta: HashMap<String, (String, i64)> = HashMap::new();
    let mut result = Vec::new();
    let mut cur_sha = String::new();
    let mut cur_line: u32 = 0;
    for line in out.split('\n') {
        // header: "<40-hex sha> <orig-line> <final-line> [<count>]"
        if let Some((sha, final_line)) = parse_blame_header(line) {
            cur_sha = sha;
            cur_line = final_line;
            meta.entry(cur_sha.clone()).or_insert((String::new(), 0));
            continue;
        }
        if let Some(rest) = line.strip_prefix("author ") {
            if let Some(m) = meta.get_mut(&cur_sha) {
                m.0 = rest.to_string();
            }
        } else if let Some(rest) = line.strip_prefix("author-time ") {
            if let Some(m) = meta.get_mut(&cur_sha) {
                m.1 = rest.parse().unwrap_or(0);
            }
        } else if let Some(code) = line.strip_prefix('\t') {
            let m = meta.get(&cur_sha).cloned().unwrap_or((String::new(), 0));
            result.push(BlameLine {
                sha: cur_sha.clone(),
                short: cur_sha.chars().take(7).collect(),
                author: m.0,
                date: m.1,
                line: cur_line,
                code: code.to_string(),
            });
        }
    }
    Ok(result)
}

fn parse_blame_header(line: &str) -> Option<(String, u32)> {
    let mut it = line.split(' ');
    let sha = it.next()?;
    if sha.len() != 40 || !sha.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let _orig = it.next()?;
    let final_line: u32 = it.next()?.parse().ok()?;
    Some((sha.to_string(), final_line))
}

pub async fn get_rebase_commits(path: &str, base: &str) -> Result<Vec<RebaseCommit>, GitError> {
    let out = run_git(
        path,
        &[
            "log",
            "--reverse",
            "--format=%H\u{1f}%h\u{1f}%s",
            &format!("{base}..HEAD"),
        ],
        &[],
    )
    .await?;
    Ok(out
        .split('\n')
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| {
            let mut it = l.split('\u{1f}');
            Some(RebaseCommit {
                sha: it.next()?.to_string(),
                short: it.next()?.to_string(),
                subject: it.next().unwrap_or("").to_string(),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn sh(dir: &str, args: &[&str]) {
        run_git(dir, args, &[]).await.expect("git setup command");
    }

    /// Fresh temp repo on `main` with identity configured.
    async fn temp_repo() -> String {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("opengit-test-{}-{}", nanos, std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let d = dir.to_string_lossy().into_owned();
        sh(&d, &["init", "-b", "main"]).await;
        sh(&d, &["config", "user.email", "t@t.com"]).await;
        sh(&d, &["config", "user.name", "Test"]).await;
        d
    }

    #[tokio::test]
    async fn repo_lifecycle() {
        let d = temp_repo().await;
        assert!(is_git_repo(&d).await);

        // untracked file shows in status
        std::fs::write(format!("{d}/a.txt"), "hello\n").unwrap();
        let st = get_status(&d).await.unwrap();
        assert!(st.iter().any(|f| f.path == "a.txt" && f.untracked));

        sh(&d, &["add", "a.txt"]).await;
        sh(&d, &["commit", "-m", "first"]).await;

        let info = get_repo_info(&d).await;
        assert_eq!(info.head.as_deref(), Some("main"));
        assert!(!info.detached);
        assert!(info.commit.is_some());

        let commits = get_commits(&d, 10).await.unwrap();
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].subject, "first");
        assert_eq!(commits[0].author_name, "Test");

        let detail = get_commit_detail(&d, &commits[0].sha).await.unwrap();
        assert!(detail.files.iter().any(|f| f.path == "a.txt"));

        let branches = get_branches(&d).await.unwrap();
        assert!(branches.iter().any(|b| b.name == "main" && b.is_current));

        // modify → working diff + blame
        std::fs::write(format!("{d}/a.txt"), "hello world\n").unwrap();
        let diff = get_working_file_diff(&d, "a.txt").await;
        assert!(diff.contains("hello world"));
        let blame = get_blame(&d, "a.txt").await.unwrap();
        assert!(!blame.is_empty());

        let _ = std::fs::remove_dir_all(&d);
    }

    #[tokio::test]
    async fn staged_vs_unstaged_counts() {
        let d = temp_repo().await;
        std::fs::write(format!("{d}/f.txt"), "a\nb\nc\n").unwrap();
        sh(&d, &["add", "f.txt"]).await;
        sh(&d, &["commit", "-m", "base"]).await;
        // staged change
        std::fs::write(format!("{d}/f.txt"), "a\nB\nc\nd\n").unwrap();
        sh(&d, &["add", "f.txt"]).await;
        let st = get_status(&d).await.unwrap();
        let f = st.iter().find(|f| f.path == "f.txt").unwrap();
        assert!(f.staged);
        assert!(f.staged_adds > 0);
        let _ = std::fs::remove_dir_all(&d);
    }
}
