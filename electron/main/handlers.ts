import { existsSync } from "node:fs";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type {
  ActionState,
  BlameLine,
  CommitDetail,
  ConflictVersions,
  DirEntry,
  DirListing,
  HunkData,
  ImageDiff,
  PullMode,
  RebaseCommit,
  RebaseOp,
  ResetMode,
  WorkspaceData,
} from "@shared/types";
import { splitDiffIntoHunks } from "./diff-hunks";
import {
  GitError,
  getBlame,
  getBranches,
  getCommitDetail,
  getCommitFileDiff,
  getCommitFileImage,
  getCommits,
  getConflictVersions,
  getMergeState,
  getRebaseCommits,
  getRemotes,
  getRepoInfo,
  getStagedFileDiff,
  getStashes,
  getStatus,
  getTags,
  getUnstagedFileDiff,
  getWorkingFileDiff,
  getWorkingFileImage,
  isGitRepo,
  runGit,
} from "./git";
import {
  cloneAuthArgs,
  isWindowsDriveRoot,
  parseGithubRemote,
} from "./path-utils";
import { withRepoLock } from "./repo-lock";
import { registerRepo, resolveRepoPath } from "./repo-registry";
import { getGithubToken } from "./secrets";
import {
  clearActiveRepo,
  clearRecentRepos,
  getActiveRepoId,
  getRecentRepos,
  removeRecentRepo,
  setActiveRepo,
} from "./state";

// ── Active-repo resolution ──────────────────────────────────────────────────
async function requireActiveRepoCtx(): Promise<{
  repoId: string;
  path: string;
}> {
  const repoId = getActiveRepoId();
  if (!repoId) throw new Error("No active repository.");
  const path = await resolveRepoPath(repoId);
  return { repoId, path };
}
async function requireActiveRepo(): Promise<string> {
  return (await requireActiveRepoCtx()).path;
}

/** Run a git mutation under the repo lock; surface errors as ActionState. */
async function gitAction(args: string[]): Promise<ActionState> {
  let ctx: { repoId: string; path: string };
  try {
    ctx = await requireActiveRepoCtx();
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    await withRepoLock(ctx.repoId, () => runGit(ctx.path, args));
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "git command failed.",
    };
  }
  return {};
}

async function mutate(
  work: (repo: string) => Promise<void>,
): Promise<ActionState> {
  let ctx: { repoId: string; path: string };
  try {
    ctx = await requireActiveRepoCtx();
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    await withRepoLock(ctx.repoId, () => work(ctx.path));
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "git command failed.",
    };
  }
  return {};
}

// ── Repo open / close / browse ──────────────────────────────────────────────
const repoAt = (p: string) => existsSync(join(p, ".git"));

// Sentinel "directory" representing the list of Windows drives (This PC).
const DRIVES = "::drives";

function listDrives(): DirListing {
  const entries: DirEntry[] = [];
  for (let c = 65; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    if (existsSync(root))
      entries.push({ name: root, path: root, isRepo: repoAt(root) });
  }
  return { path: "This PC", parent: null, isRepo: false, entries };
}

export async function listDirectory(path?: string): Promise<DirListing> {
  if (path === DRIVES) return listDrives();
  const target = path && isAbsolute(path) ? path : homedir();
  const parent = dirname(target);
  const up = isWindowsDriveRoot(target)
    ? DRIVES
    : parent === target
      ? null
      : parent;
  try {
    const dirents = await readdir(target, { withFileTypes: true });
    const entries: DirEntry[] = dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => {
        const full = join(target, d.name);
        return { name: d.name, path: full, isRepo: repoAt(full) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      path: target,
      parent: up,
      isRepo: repoAt(target),
      entries,
    };
  } catch {
    return {
      path: target,
      parent: up,
      isRepo: false,
      entries: [],
      error: "Cannot read this directory.",
    };
  }
}

export function recentRepos(): string[] {
  return getRecentRepos();
}

export function removeRecent(path: string): ActionState {
  removeRecentRepo(path);
  return {};
}

export function clearRecent(): ActionState {
  clearRecentRepos();
  return {};
}

/** Open an existing repo by absolute path; sets it active. */
export async function openRepo(path: string): Promise<ActionState> {
  const p = path.trim();
  if (!p) return { error: "Enter a repository path." };
  if (!isAbsolute(p)) return { error: "Path must be absolute." };
  if (!existsSync(p)) return { error: "Path does not exist." };
  if (!(await isGitRepo(p))) return { error: "Not a git repository." };
  try {
    const repoId = await registerRepo(p);
    setActiveRepo(repoId, p);
    return {};
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/** Clone a remote repo into a directory, then open it. */
export async function cloneRepo(
  url: string,
  directory: string,
  token?: string,
): Promise<ActionState> {
  const u = url.trim();
  const parent = directory.trim();
  if (!u) return { error: "Enter a repository URL." };
  if (!parent) return { error: "Enter a destination directory." };
  if (!isAbsolute(parent)) return { error: "Destination must be absolute." };

  const name =
    u
      .replace(/\.git$/, "")
      .replace(/\/$/, "")
      .split(/[/:]/)
      .pop() || "repo";
  const target = join(parent, name);
  // For private HTTPS repos: authenticate via an ephemeral -c http.extraHeader
  // (not persisted to config, not embedded in the URL). Use the explicit token
  // if given, else fall back to the signed-in GitHub account for github.com URLs.
  const auth =
    token?.trim() || (parseGithubRemote(u) ? getGithubToken() : null);
  const cfg = cloneAuthArgs(auth ?? undefined);
  try {
    await mkdir(parent, { recursive: true });
    await runGit(parent, [...cfg, "clone", u, target], {
      env: { GIT_TERMINAL_PROMPT: "0" },
    });
    const repoId = await registerRepo(target);
    setActiveRepo(repoId, target);
    return {};
  } catch (err) {
    return { error: err instanceof GitError ? err.message : "Clone failed." };
  }
}

export function closeRepo(): ActionState {
  clearActiveRepo();
  return {};
}

// ── Workspace bundle (home screen) ──────────────────────────────────────────
export async function workspace(): Promise<WorkspaceData | { error: string }> {
  let path: string;
  try {
    path = await requireActiveRepo();
  } catch (err) {
    return { error: (err as Error).message };
  }
  const safe = <T>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);
  const [repo, branches, remotes, tags, stashes, commits, status, merge] =
    await Promise.all([
      getRepoInfo(path),
      safe(getBranches(path), []),
      safe(getRemotes(path), []),
      safe(getTags(path), []),
      safe(getStashes(path), []),
      safe(getCommits(path, 100), []),
      safe(getStatus(path), []),
      safe(getMergeState(path), {
        conflicted: [],
        inMerge: false,
        inRebase: false,
      }),
    ]);
  return { repo, branches, remotes, tags, stashes, commits, status, merge };
}

// ── Read-only queries ───────────────────────────────────────────────────────
export async function commitDetail(
  sha: string,
): Promise<CommitDetail | { error: string }> {
  try {
    return await getCommitDetail(await requireActiveRepo(), sha);
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : (err as Error).message,
    };
  }
}

export async function commitFileDiff(
  sha: string,
  file: string,
): Promise<{ diff: string } | { error: string }> {
  try {
    return {
      diff: await getCommitFileDiff(await requireActiveRepo(), sha, file),
    };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : (err as Error).message,
    };
  }
}

export async function commitFileImage(
  sha: string,
  file: string,
): Promise<ImageDiff | { error: string }> {
  try {
    return await getCommitFileImage(await requireActiveRepo(), sha, file);
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : (err as Error).message,
    };
  }
}

export async function workingFileDiff(
  file: string,
): Promise<{ diff: string } | { error: string }> {
  try {
    return { diff: await getWorkingFileDiff(await requireActiveRepo(), file) };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : (err as Error).message,
    };
  }
}

export async function workingFileImage(
  file: string,
): Promise<ImageDiff | { error: string }> {
  try {
    return await getWorkingFileImage(await requireActiveRepo(), file);
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : (err as Error).message,
    };
  }
}

export async function fileHunkDiffs(
  file: string,
): Promise<HunkData | { error: string }> {
  try {
    const repo = await requireActiveRepo();
    const [unstaged, staged] = await Promise.all([
      getUnstagedFileDiff(repo, file),
      getStagedFileDiff(repo, file),
    ]);
    return { unstaged, staged };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : (err as Error).message,
    };
  }
}

export async function conflictVersions(
  file: string,
): Promise<ConflictVersions | { error: string }> {
  try {
    return await getConflictVersions(await requireActiveRepo(), file);
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : (err as Error).message,
    };
  }
}

export async function blameFile(
  file: string,
): Promise<{ lines: BlameLine[] } | { error: string }> {
  try {
    return { lines: await getBlame(await requireActiveRepo(), file) };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : (err as Error).message,
    };
  }
}

export async function rebaseCommits(
  base: string,
): Promise<{ commits: RebaseCommit[] } | { error: string }> {
  try {
    return { commits: await getRebaseCommits(await requireActiveRepo(), base) };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : (err as Error).message,
    };
  }
}

// ── Sync / push / pull ──────────────────────────────────────────────────────
export const gitFetch = () => gitAction(["fetch", "--all", "--prune"]);
export const gitPush = () => gitAction(["push"]);
export const gitPushSetUpstream = () =>
  gitAction(["push", "-u", "origin", "HEAD"]);
export const gitPushForce = () => gitAction(["push", "--force-with-lease"]);
export function gitPull(mode: PullMode = "ff-or-merge"): Promise<ActionState> {
  const flag =
    mode === "ff"
      ? "--ff-only"
      : mode === "rebase"
        ? "--rebase"
        : "--no-rebase";
  return gitAction(["pull", flag]);
}

// ── Staging / discard / commit ──────────────────────────────────────────────
export const stageFile = (file: string) => gitAction(["add", "--", file]);
export const stageAll = () => gitAction(["add", "--all"]);
export const unstageFile = (file: string) =>
  gitAction(["restore", "--staged", "--", file]);
export const unstageAll = () => gitAction(["reset"]);
export const discardFile = (file: string, untracked?: boolean) =>
  gitAction(untracked ? ["clean", "-f", "--", file] : ["restore", "--", file]);
export const discardAll = () =>
  mutate(async (repo) => {
    await runGit(repo, ["restore", "--", "."]);
    await runGit(repo, ["clean", "-fd"]);
  });
export function commit(message: string): Promise<ActionState> {
  if (!message.trim())
    return Promise.resolve({ error: "Commit message is required." });
  return gitAction(["commit", "-m", message]);
}
export function amendCommit(message?: string): Promise<ActionState> {
  return gitAction(
    message?.trim()
      ? ["commit", "--amend", "-m", message.trim()]
      : ["commit", "--amend", "--no-edit"],
  );
}

// ── Branches ────────────────────────────────────────────────────────────────
export const checkoutBranch = (name: string) => gitAction(["checkout", name]);
export const checkoutCommit = (sha: string) => gitAction(["checkout", sha]);
export const mergeBranch = (name: string) =>
  gitAction(["merge", "--no-edit", name]);
export const deleteBranch = (name: string) => gitAction(["branch", "-d", name]);
export function renameBranch(
  oldName: string,
  newName: string,
): Promise<ActionState> {
  if (!newName.trim())
    return Promise.resolve({ error: "New name is required." });
  return gitAction(["branch", "-m", oldName, newName.trim()]);
}
export const deleteRemoteBranch = (remote: string, branch: string) =>
  gitAction(["push", remote, "--delete", branch]);
export function createBranch(name: string): Promise<ActionState> {
  if (!name.trim())
    return Promise.resolve({ error: "Branch name is required." });
  return gitAction(["switch", "-c", name]);
}
export function createBranchAt(
  name: string,
  sha: string,
): Promise<ActionState> {
  if (!name.trim())
    return Promise.resolve({ error: "Branch name is required." });
  return gitAction(["branch", name, sha]);
}
export function createRemoteBranch(
  remote: string,
  name: string,
): Promise<ActionState> {
  if (!name.trim())
    return Promise.resolve({ error: "Branch name is required." });
  if (!remote.trim()) return Promise.resolve({ error: "Remote is required." });
  return gitAction(["push", remote, `HEAD:refs/heads/${name}`]);
}
export function publishBranch(
  remote: string,
  name: string,
): Promise<ActionState> {
  if (!name.trim())
    return Promise.resolve({ error: "Branch name is required." });
  if (!remote.trim()) return Promise.resolve({ error: "Remote is required." });
  return mutate(async (repo) => {
    await runGit(repo, ["switch", "-c", name]);
    await runGit(repo, ["push", "-u", remote, name]);
  });
}

// ── Commit ops ──────────────────────────────────────────────────────────────
export const cherryPick = (sha: string) => gitAction(["cherry-pick", sha]);
export const revertCommit = (sha: string) =>
  gitAction(["revert", "--no-edit", sha]);
export const resetToCommit = (sha: string, mode: ResetMode) =>
  gitAction(["reset", `--${mode}`, sha]);

// ── Tags ────────────────────────────────────────────────────────────────────
export function createTagAt(name: string, sha: string): Promise<ActionState> {
  if (!name.trim()) return Promise.resolve({ error: "Tag name is required." });
  return gitAction(["tag", name, sha]);
}
export const deleteTag = (name: string) => gitAction(["tag", "-d", name]);
export const deleteRemoteTag = (name: string) =>
  gitAction(["push", "origin", `:refs/tags/${name}`]);
export const fetchTags = () => gitAction(["fetch", "origin", "--tags"]);

// ── Conflict resolution ─────────────────────────────────────────────────────
export const resolveOurs = (file: string) =>
  mutate(async (repo) => {
    await runGit(repo, ["checkout", "--ours", "--", file]);
    await runGit(repo, ["add", "--", file]);
  });
export const resolveTheirs = (file: string) =>
  mutate(async (repo) => {
    await runGit(repo, ["checkout", "--theirs", "--", file]);
    await runGit(repo, ["add", "--", file]);
  });
export const saveResolution = (file: string, content: string) =>
  mutate(async (repo) => {
    await writeFile(join(repo, file), content);
    await runGit(repo, ["add", "--", file]);
  });
export const markResolved = (file: string) =>
  mutate((repo) => runGit(repo, ["add", "--", file]).then(() => {}));
export const abortMerge = () =>
  mutate(async (repo) => {
    const state = await getMergeState(repo);
    await runGit(
      repo,
      state.inRebase ? ["rebase", "--abort"] : ["merge", "--abort"],
    );
  });
export const continueMerge = () =>
  mutate(async (repo) => {
    const state = await getMergeState(repo);
    if (state.conflicted.length > 0)
      throw new GitError("Resolve all conflicts first.", []);
    if (state.inRebase) {
      await runGit(repo, ["rebase", "--continue"], {
        env: { GIT_EDITOR: "true" },
      });
    } else {
      await runGit(repo, ["commit", "--no-edit"]);
    }
  });

// ── Stash ───────────────────────────────────────────────────────────────────
export function stashPush(message?: string): Promise<ActionState> {
  const args = ["stash", "push", "--include-untracked"];
  if (message?.trim()) args.push("-m", message.trim());
  return gitAction(args);
}
export const stashApply = (ref: string) => gitAction(["stash", "apply", ref]);
export const stashPop = (ref: string) => gitAction(["stash", "pop", ref]);
export const stashDrop = (ref: string) => gitAction(["stash", "drop", ref]);

// ── Hunk-level staging / revert ─────────────────────────────────────────────
// `args` are the full flags after `git apply` — e.g. ["--cached"] targets the
// index, ["--reverse"] alone targets the working tree (a discard).
async function applyPatch(
  repo: string,
  patch: string,
  args: string[],
): Promise<void> {
  const tmp = join(tmpdir(), `opengit-${Date.now()}-${process.pid}.patch`);
  await writeFile(tmp, patch);
  try {
    await runGit(repo, ["apply", ...args, tmp]);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}
export const stageHunk = (file: string, index: number) =>
  mutate(async (repo) => {
    const { header, hunks } = splitDiffIntoHunks(
      await getUnstagedFileDiff(repo, file),
    );
    if (!hunks[index]) throw new GitError("Hunk no longer matches.", []);
    await applyPatch(repo, `${header}\n${hunks[index]}\n`, ["--cached"]);
  });
export const unstageHunk = (file: string, index: number) =>
  mutate(async (repo) => {
    const { header, hunks } = splitDiffIntoHunks(
      await getStagedFileDiff(repo, file),
    );
    if (!hunks[index]) throw new GitError("Hunk no longer matches.", []);
    await applyPatch(repo, `${header}\n${hunks[index]}\n`, [
      "--cached",
      "--reverse",
    ]);
  });
/** Discard one hunk of a file's unstaged changes (revert it in the worktree). */
export const revertHunk = (file: string, index: number) =>
  mutate(async (repo) => {
    const { header, hunks } = splitDiffIntoHunks(
      await getUnstagedFileDiff(repo, file),
    );
    if (!hunks[index]) throw new GitError("Hunk no longer matches.", []);
    await applyPatch(repo, `${header}\n${hunks[index]}\n`, ["--reverse"]);
  });
/** Discard one hunk shown in the working-vs-HEAD (split) diff. */
export const revertWorkingHunk = (file: string, index: number) =>
  mutate(async (repo) => {
    const { header, hunks } = splitDiffIntoHunks(
      await getWorkingFileDiff(repo, file),
    );
    if (!hunks[index]) throw new GitError("Hunk no longer matches.", []);
    await applyPatch(repo, `${header}\n${hunks[index]}\n`, ["--reverse"]);
  });
/** Stage one hunk shown in the working-vs-HEAD (split) diff. */
export const stageWorkingHunk = (file: string, index: number) =>
  mutate(async (repo) => {
    const { header, hunks } = splitDiffIntoHunks(
      await getWorkingFileDiff(repo, file),
    );
    if (!hunks[index]) throw new GitError("Hunk no longer matches.", []);
    await applyPatch(repo, `${header}\n${hunks[index]}\n`, ["--cached"]);
  });

// ── Interactive rebase ──────────────────────────────────────────────────────
export const interactiveRebase = (
  base: string,
  ops: Record<string, RebaseOp>,
) =>
  mutate(async (repo) => {
    const commits = await getRebaseCommits(repo, base);
    if (commits.length === 0) throw new GitError("Nothing to rebase.", []);
    const todo: string[] = [];
    let firstKept = true;
    for (const c of commits) {
      let op = ops[c.sha] ?? "pick";
      if (op === "drop") {
        todo.push(`drop ${c.sha} ${c.subject}`);
        continue;
      }
      if (firstKept && (op === "squash" || op === "fixup")) op = "pick";
      firstKept = false;
      todo.push(`${op} ${c.sha} ${c.subject}`);
    }
    if (todo.every((l) => l.startsWith("drop")))
      throw new GitError("Cannot drop every commit.", []);
    const tmp = join(
      tmpdir(),
      `opengit-rebase-${Date.now()}-${process.pid}.txt`,
    );
    await writeFile(tmp, `${todo.join("\n")}\n`);
    try {
      await runGit(repo, ["rebase", "-i", base], {
        env: { GIT_SEQUENCE_EDITOR: `cp '${tmp}'`, GIT_EDITOR: "true" },
      });
    } finally {
      await unlink(tmp).catch(() => {});
    }
  });

/** The active repo's path, for the file watcher. Null if none open. */
export async function activeRepoPath(): Promise<string | null> {
  try {
    return await requireActiveRepo();
  } catch {
    return null;
  }
}
