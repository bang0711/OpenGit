// Serde structs mirroring the git-domain shapes in shared/types.ts. camelCase on
// the wire so the renderer's TS types match with zero churn. GitHub response
// shapes are built as serde_json values in github.rs instead of mirrored here.
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub head: Option<String>,
    pub detached: bool,
    pub commit: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub full_name: String,
    pub is_remote: bool,
    pub is_current: bool,
    pub upstream: Option<String>,
    pub ahead: i64,
    pub behind: i64,
    pub sha: String,
    pub subject: String,
}

#[derive(Serialize)]
pub struct Remote {
    pub name: String,
    pub url: String,
}

#[derive(Serialize)]
pub struct Tag {
    pub name: String,
    pub sha: String,
}

#[derive(Serialize)]
pub struct Stash {
    #[serde(rename = "ref")]
    pub reference: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    pub index: String,
    pub worktree: String,
    pub staged: bool,
    pub unstaged: bool,
    pub untracked: bool,
    pub staged_adds: i64,
    pub staged_dels: i64,
    pub unstaged_adds: i64,
    pub unstaged_dels: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub short_sha: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub date: i64,
    pub subject: String,
    pub refs: Vec<String>,
}

#[derive(Serialize)]
pub struct CommitFile {
    pub path: String,
    pub status: String,
    pub additions: i64,
    pub deletions: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub sha: String,
    pub short_sha: String,
    pub parents: Vec<String>,
    pub author_name: String,
    pub author_email: String,
    pub date: i64,
    pub subject: String,
    pub body: String,
    pub files: Vec<CommitFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeState {
    pub conflicted: Vec<String>,
    pub in_merge: bool,
    pub in_rebase: bool,
}

#[derive(Serialize)]
pub struct ConflictVersions {
    pub ours: Option<String>,
    pub theirs: Option<String>,
    pub working: String,
}

#[derive(Serialize)]
pub struct BlameLine {
    pub sha: String,
    pub short: String,
    pub author: String,
    pub date: i64,
    pub line: u32,
    pub code: String,
}

#[derive(Serialize)]
pub struct RebaseCommit {
    pub sha: String,
    pub short: String,
    pub subject: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    pub sha: String,
    pub short: String,
    pub selector: String, // e.g. HEAD@{2}
    pub message: String,  // reflog subject, e.g. "commit: fix bug"
    pub date: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Submodule {
    pub name: String,
    pub path: String,
    pub sha: String,
    pub state: String, // "ok" | "uninitialized" | "modified" | "conflict"
    #[serde(rename = "ref")]
    pub describe: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub is_main: bool,
    pub is_current: bool,
    pub locked: bool,
    pub prunable: bool,
    pub detached: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_repo: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub path: String,
    pub parent: Option<String>,
    pub is_repo: bool,
    pub entries: Vec<DirEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct ImageDiff {
    pub old: Option<String>,
    pub new: Option<String>,
}

#[derive(Serialize)]
pub struct HunkData {
    pub unstaged: String,
    pub staged: String,
}

#[derive(Serialize)]
pub struct WorkspaceData {
    pub repo: RepoInfo,
    pub branches: Vec<Branch>,
    pub remotes: Vec<Remote>,
    pub tags: Vec<Tag>,
    pub stashes: Vec<Stash>,
    pub commits: Vec<Commit>,
    pub status: Vec<FileStatus>,
    pub merge: MergeState,
}

// Documents the Release shape; updater.rs emits it as serde_json directly.
#[allow(dead_code)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub tag: String,
    pub asset_url: Option<String>,
    pub page_url: String,
    pub prerelease: bool,
    pub current: bool,
}
