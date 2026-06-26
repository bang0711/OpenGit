"use server";

import { existsSync } from "node:fs";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearActiveRepo,
  getActiveRepoId,
  setActiveRepo,
} from "@/lib/active-repo";
import { splitDiffIntoHunks } from "@/lib/diff";
import {
  type BlameLine,
  type CommitDetail,
  type ConflictVersions,
  GitError,
  getBlame,
  getCommitDetail,
  getCommitFileDiff,
  getConflictVersions,
  getMergeState,
  getRebaseCommits,
  getStagedFileDiff,
  getUnstagedFileDiff,
  getWorkingFileDiff,
  isGitRepo,
  type RebaseCommit,
  runGit,
} from "@/lib/git";
import { withRepoLock } from "@/lib/repo-lock";
import { registerRepo, resolveRepoPath } from "@/lib/repo-registry";

export type ActionState = { error?: string };

// ── Server-side folder browser ──────────────────────────────────────────────
// The browser can't hand the server a real filesystem path, so the picker
// navigates the server's filesystem through this action instead.

export type DirEntry = { name: string; path: string; isRepo: boolean };
export type DirListing = {
  path: string;
  parent: string | null;
  isRepo: boolean;
  entries: DirEntry[];
  error?: string;
};

const repoAt = (p: string) => existsSync(join(p, ".git"));

export async function listDirectory(path?: string): Promise<DirListing> {
  const target = path && isAbsolute(path) ? path : homedir();
  const parent = dirname(target);
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
      parent: parent === target ? null : parent,
      isRepo: repoAt(target),
      entries,
    };
  } catch {
    return {
      path: target,
      parent: parent === target ? null : parent,
      isRepo: false,
      entries: [],
      error: "Cannot read this directory.",
    };
  }
}

/** Open an existing repo by absolute path. */
export async function openRepo(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const path = String(formData.get("path") ?? "").trim();
  if (!path) return { error: "Enter a repository path." };
  if (!isAbsolute(path)) return { error: "Path must be absolute." };
  if (!existsSync(path)) return { error: "Path does not exist." };
  if (!(await isGitRepo(path))) return { error: "Not a git repository." };

  let repoId: string;
  try {
    repoId = await registerRepo(path);
  } catch (err) {
    return { error: (err as Error).message };
  }
  await setActiveRepo(repoId, path);
  redirect("/");
}

/** Clone a remote repo into a target directory, then open it. */
export async function cloneRepo(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const url = String(formData.get("url") ?? "").trim();
  const parent = String(formData.get("directory") ?? "").trim();
  if (!url) return { error: "Enter a repository URL." };
  if (!parent) return { error: "Enter a destination directory." };
  if (!isAbsolute(parent)) return { error: "Destination must be absolute." };

  const name =
    url
      .replace(/\.git$/, "")
      .replace(/\/$/, "")
      .split(/[/:]/)
      .pop() || "repo";
  const target = join(parent, name);

  let repoId: string;
  try {
    await mkdir(parent, { recursive: true });
    await runGit(parent, ["clone", url, target]);
    repoId = await registerRepo(target);
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "Clone failed.",
    };
  }

  await setActiveRepo(repoId, target);
  redirect("/");
}

export async function closeRepo(): Promise<void> {
  await clearActiveRepo();
  redirect("/");
}

/** Resolve the active repo to {repoId, path}, enforcing ownership + validity. */
async function requireActiveRepoCtx(): Promise<{
  repoId: string;
  path: string;
}> {
  const repoId = await getActiveRepoId();
  if (!repoId) throw new Error("No active repository.");
  const path = await resolveRepoPath(repoId);
  return { repoId, path };
}

/** Active repo path only (for read-only actions). */
async function requireActiveRepo(): Promise<string> {
  return (await requireActiveRepoCtx()).path;
}

/** Wrap a git mutation: run it under the repo lock, refresh, surface errors. */
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
    // A failed merge/pull may still leave the tree in a conflicted state —
    // revalidate so the conflict banner shows up.
    revalidatePath("/", "layout");
    return {
      error: err instanceof GitError ? err.message : "git command failed.",
    };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function gitFetch(): Promise<ActionState> {
  return gitAction(["fetch", "--all", "--prune"]);
}

export type PullMode = "ff" | "ff-or-merge" | "rebase";

/** Pull upstream changes. `ff-or-merge` fast-forwards when possible, else merges. */
export async function gitPull(
  mode: PullMode = "ff-or-merge",
): Promise<ActionState> {
  const flag =
    mode === "ff"
      ? "--ff-only"
      : mode === "rebase"
        ? "--rebase"
        : "--no-rebase";
  return gitAction(["pull", flag]);
}

export async function gitPush(): Promise<ActionState> {
  return gitAction(["push"]);
}

export async function stageFile(file: string): Promise<ActionState> {
  return gitAction(["add", "--", file]);
}
export async function stageAll(): Promise<ActionState> {
  return gitAction(["add", "--all"]);
}
export async function unstageFile(file: string): Promise<ActionState> {
  return gitAction(["restore", "--staged", "--", file]);
}
export async function unstageAll(): Promise<ActionState> {
  return gitAction(["reset"]);
}
export async function discardFile(
  file: string,
  untracked?: boolean,
): Promise<ActionState> {
  // Untracked files aren't tracked by git, so "discard" means delete them.
  return gitAction(
    untracked ? ["clean", "-f", "--", file] : ["restore", "--", file],
  );
}

/** Discard all working-tree changes: revert tracked files and remove untracked. */
export async function discardAll(): Promise<ActionState> {
  return mutate(async (repo) => {
    await runGit(repo, ["restore", "--", "."]);
    await runGit(repo, ["clean", "-fd"]);
  });
}

export async function commit(message: string): Promise<ActionState> {
  if (!message.trim()) return { error: "Commit message is required." };
  return gitAction(["commit", "-m", message]);
}

export async function checkoutBranch(name: string): Promise<ActionState> {
  return gitAction(["checkout", name]);
}

/** Check out a specific commit — leaves the repo in detached HEAD. */
export async function checkoutCommit(sha: string): Promise<ActionState> {
  return gitAction(["checkout", sha]);
}

/** Read-only: load full detail + changed files for one commit. */
export async function commitDetail(
  sha: string,
): Promise<CommitDetail | { error: string }> {
  let repo: string;
  try {
    repo = await requireActiveRepo();
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    return await getCommitDetail(repo, sha);
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "Failed to load commit.",
    };
  }
}

/** Read-only: unified diff for one file within a commit. */
export async function commitFileDiff(
  sha: string,
  file: string,
): Promise<{ diff: string } | { error: string }> {
  let repo: string;
  try {
    repo = await requireActiveRepo();
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    return { diff: await getCommitFileDiff(repo, sha, file) };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "Failed to load diff.",
    };
  }
}

/** Merge `name` into the currently checked-out branch. */
export async function mergeBranch(name: string): Promise<ActionState> {
  return gitAction(["merge", "--no-edit", name]);
}

export async function deleteBranch(name: string): Promise<ActionState> {
  return gitAction(["branch", "-d", name]);
}

// ── Commit operations ───────────────────────────────────────────────────────

export async function cherryPick(sha: string): Promise<ActionState> {
  return gitAction(["cherry-pick", sha]);
}

export async function revertCommit(sha: string): Promise<ActionState> {
  return gitAction(["revert", "--no-edit", sha]);
}

export type ResetMode = "soft" | "mixed" | "hard";

export async function resetToCommit(
  sha: string,
  mode: ResetMode,
): Promise<ActionState> {
  return gitAction(["reset", `--${mode}`, sha]);
}

export async function createBranchAt(
  name: string,
  sha: string,
): Promise<ActionState> {
  if (!name.trim()) return { error: "Branch name is required." };
  return gitAction(["branch", name, sha]);
}

/** Create a new branch from HEAD and switch to it (git switch -c). */
export async function createBranch(name: string): Promise<ActionState> {
  if (!name.trim()) return { error: "Branch name is required." };
  return gitAction(["switch", "-c", name]);
}

/** Create a branch on the remote from HEAD only — no local branch, no switch. */
export async function createRemoteBranch(
  remote: string,
  name: string,
): Promise<ActionState> {
  if (!name.trim()) return { error: "Branch name is required." };
  if (!remote.trim()) return { error: "Remote is required." };
  return gitAction(["push", remote, `HEAD:refs/heads/${name}`]);
}

/** Create a local branch from HEAD, switch to it, and push it (with tracking). */
export async function publishBranch(
  remote: string,
  name: string,
): Promise<ActionState> {
  if (!name.trim()) return { error: "Branch name is required." };
  if (!remote.trim()) return { error: "Remote is required." };
  return mutate(async (repo) => {
    await runGit(repo, ["switch", "-c", name]);
    await runGit(repo, ["push", "-u", remote, name]);
  });
}

export async function createTagAt(
  name: string,
  sha: string,
): Promise<ActionState> {
  if (!name.trim()) return { error: "Tag name is required." };
  return gitAction(["tag", name, sha]);
}

// ── Conflict resolution ─────────────────────────────────────────────────────

/** Run arbitrary repo work under the repo lock, then revalidate every route. */
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
  revalidatePath("/", "layout");
  return {};
}

/** Read-only: the competing versions of a conflicted file. */
export async function conflictVersions(
  file: string,
): Promise<ConflictVersions | { error: string }> {
  let repo: string;
  try {
    repo = await requireActiveRepo();
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    return await getConflictVersions(repo, file);
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "Failed to load file.",
    };
  }
}

/** Resolve a conflict by taking the current branch's version. */
export async function resolveOurs(file: string): Promise<ActionState> {
  return mutate(async (repo) => {
    await runGit(repo, ["checkout", "--ours", "--", file]);
    await runGit(repo, ["add", "--", file]);
  });
}

/** Resolve a conflict by taking the incoming version. */
export async function resolveTheirs(file: string): Promise<ActionState> {
  return mutate(async (repo) => {
    await runGit(repo, ["checkout", "--theirs", "--", file]);
    await runGit(repo, ["add", "--", file]);
  });
}

/** Save a hand-edited resolution and mark the file resolved. */
export async function saveResolution(
  file: string,
  content: string,
): Promise<ActionState> {
  return mutate(async (repo) => {
    await writeFile(join(repo, file), content);
    await runGit(repo, ["add", "--", file]);
  });
}

/** Mark an already-edited file as resolved (stage it). */
export async function markResolved(file: string): Promise<ActionState> {
  return mutate((repo) => runGit(repo, ["add", "--", file]).then(() => {}));
}

/** Abort the in-progress merge or rebase. */
export async function abortMerge(): Promise<ActionState> {
  return mutate(async (repo) => {
    const state = await getMergeState(repo);
    await runGit(
      repo,
      state.inRebase ? ["rebase", "--abort"] : ["merge", "--abort"],
    );
  });
}

/** Finish the merge/rebase once all conflicts are resolved. */
export async function continueMerge(): Promise<ActionState> {
  return mutate(async (repo) => {
    const state = await getMergeState(repo);
    if (state.conflicted.length > 0) {
      throw new GitError("Resolve all conflicts first.", []);
    }
    if (state.inRebase) {
      // --continue would open an editor; suppress it.
      await runGit(repo, ["rebase", "--continue"], {
        env: { GIT_EDITOR: "true" },
      });
    } else {
      await runGit(repo, ["commit", "--no-edit"]);
    }
  });
}

// ── Stash ───────────────────────────────────────────────────────────────────

export async function stashPush(message?: string): Promise<ActionState> {
  const args = ["stash", "push", "--include-untracked"];
  if (message?.trim()) args.push("-m", message.trim());
  return gitAction(args);
}

export async function stashApply(ref: string): Promise<ActionState> {
  return gitAction(["stash", "apply", ref]);
}

export async function stashPop(ref: string): Promise<ActionState> {
  return gitAction(["stash", "pop", ref]);
}

export async function stashDrop(ref: string): Promise<ActionState> {
  return gitAction(["stash", "drop", ref]);
}

// ── Amend / branch rename / push variants ──────────────────────────────────

export async function amendCommit(message?: string): Promise<ActionState> {
  return gitAction(
    message?.trim()
      ? ["commit", "--amend", "-m", message.trim()]
      : ["commit", "--amend", "--no-edit"],
  );
}

export async function renameBranch(
  oldName: string,
  newName: string,
): Promise<ActionState> {
  if (!newName.trim()) return { error: "New name is required." };
  return gitAction(["branch", "-m", oldName, newName.trim()]);
}

/** Push and set the upstream to origin (for a branch with no tracking ref). */
export async function gitPushSetUpstream(): Promise<ActionState> {
  return gitAction(["push", "-u", "origin", "HEAD"]);
}

export async function gitPushForce(): Promise<ActionState> {
  return gitAction(["push", "--force-with-lease"]);
}

// ── Working-tree diff (read) ────────────────────────────────────────────────

export async function workingFileDiff(
  file: string,
): Promise<{ diff: string } | { error: string }> {
  let repo: string;
  try {
    repo = await requireActiveRepo();
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    return { diff: await getWorkingFileDiff(repo, file) };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "Failed to load diff.",
    };
  }
}

/** Read-only: unstaged + staged diffs for a file (for hunk staging). */
export async function fileHunkDiffs(
  file: string,
): Promise<{ unstaged: string; staged: string } | { error: string }> {
  let repo: string;
  try {
    repo = await requireActiveRepo();
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    const [unstaged, staged] = await Promise.all([
      getUnstagedFileDiff(repo, file),
      getStagedFileDiff(repo, file),
    ]);
    return { unstaged, staged };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "Failed to load diffs.",
    };
  }
}

// ── Hunk-level staging ──────────────────────────────────────────────────────

async function applyPatch(
  repo: string,
  patch: string,
  extra: string[],
): Promise<void> {
  const tmp = join(tmpdir(), `opengit-${Date.now()}-${process.pid}.patch`);
  await writeFile(tmp, patch);
  try {
    await runGit(repo, ["apply", "--cached", ...extra, tmp]);
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

/** Stage a single hunk of a file's unstaged changes. */
export async function stageHunk(
  file: string,
  index: number,
): Promise<ActionState> {
  return mutate(async (repo) => {
    const { header, hunks } = splitDiffIntoHunks(
      await getUnstagedFileDiff(repo, file),
    );
    if (!hunks[index]) throw new GitError("Hunk no longer matches.", []);
    await applyPatch(repo, `${header}\n${hunks[index]}\n`, []);
  });
}

/** Unstage a single hunk of a file's staged changes. */
export async function unstageHunk(
  file: string,
  index: number,
): Promise<ActionState> {
  return mutate(async (repo) => {
    const { header, hunks } = splitDiffIntoHunks(
      await getStagedFileDiff(repo, file),
    );
    if (!hunks[index]) throw new GitError("Hunk no longer matches.", []);
    await applyPatch(repo, `${header}\n${hunks[index]}\n`, ["--reverse"]);
  });
}

// ── Delete remote branch ────────────────────────────────────────────────────

export async function deleteRemoteBranch(
  remote: string,
  branch: string,
): Promise<ActionState> {
  return gitAction(["push", remote, "--delete", branch]);
}

// ── Blame ───────────────────────────────────────────────────────────────────

export async function blameFile(
  file: string,
): Promise<{ lines: BlameLine[] } | { error: string }> {
  let repo: string;
  try {
    repo = await requireActiveRepo();
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    return { lines: await getBlame(repo, file) };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "Failed to blame file.",
    };
  }
}

// ── Interactive rebase ──────────────────────────────────────────────────────

export type RebaseOp = "pick" | "squash" | "fixup" | "drop";

/** Read-only: the commits a rebase onto `base` would rewrite (oldest first). */
export async function rebaseCommits(
  base: string,
): Promise<{ commits: RebaseCommit[] } | { error: string }> {
  let repo: string;
  try {
    repo = await requireActiveRepo();
  } catch (err) {
    return { error: (err as Error).message };
  }
  try {
    return { commits: await getRebaseCommits(repo, base) };
  } catch (err) {
    return {
      error: err instanceof GitError ? err.message : "Failed to list commits.",
    };
  }
}

/** Run an interactive rebase onto `base` applying per-commit ops. */
export async function interactiveRebase(
  base: string,
  ops: Record<string, RebaseOp>,
): Promise<ActionState> {
  return mutate(async (repo) => {
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
      // The first surviving commit must be a pick — can't squash into nothing.
      if (firstKept && (op === "squash" || op === "fixup")) op = "pick";
      firstKept = false;
      todo.push(`${op} ${c.sha} ${c.subject}`);
    }
    if (todo.every((l) => l.startsWith("drop"))) {
      throw new GitError("Cannot drop every commit.", []);
    }

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
}
