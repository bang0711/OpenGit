import "server-only";

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Field + record separators safe for git --pretty payloads.
const FS = "\x1f";
const RS = "\x1e";

const MAX_BUFFER = 64 * 1024 * 1024;

export type GitResult = { stdout: string; stderr: string };

// Desktop app: git runs as the user, with their full environment, global/system
// config, credential manager (GCM), SSH agent and hooks — exactly like their
// terminal. No env scoping, no prompt-disabling, no timeout: those belong to a
// multi-tenant server, which this is not. Interactive auth (GCM popup) must be
// allowed to take as long as the user needs.
/** Run a git command in `cwd`. Throws GitError on non-zero exit. */
export async function runGit(
  cwd: string,
  args: string[],
  opts?: { env?: Record<string, string> },
): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
    });
    return { stdout, stderr };
  } catch (err) {
    const e = err as { stderr?: string; message?: string; stdout?: string };
    throw new GitError(
      (e.stderr || e.message || "git command failed").trim(),
      args,
      e.stdout ?? "",
    );
  }
}

export class GitError extends Error {
  args: string[];
  stdout: string;
  constructor(message: string, args: string[], stdout = "") {
    super(message);
    this.name = "GitError";
    this.args = args;
    this.stdout = stdout;
  }
}

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    const { stdout } = await runGit(path, [
      "rev-parse",
      "--is-inside-work-tree",
    ]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

// ── Repo summary ────────────────────────────────────────────────────────────

export type RepoInfo = {
  path: string;
  name: string;
  head: string | null; // current branch name, or null if detached
  detached: boolean;
  commit: string | null; // short HEAD sha
};

export async function getRepoInfo(path: string): Promise<RepoInfo> {
  const [branch, sha] = await Promise.all([
    runGit(path, ["branch", "--show-current"]).then((r) => r.stdout.trim()),
    runGit(path, ["rev-parse", "--short", "HEAD"])
      .then((r) => r.stdout.trim())
      .catch(() => null),
  ]);
  return {
    path,
    name: basename(path),
    head: branch || null,
    detached: branch === "",
    commit: sha,
  };
}

// ── Branches ──────────────────────────────────────────────────────────────

export type Branch = {
  name: string; // short name, e.g. "main" or "origin/main"
  fullName: string; // refs/heads/main
  isRemote: boolean;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  sha: string;
  subject: string;
};

export async function getBranches(path: string): Promise<Branch[]> {
  const format = [
    "%(refname)",
    "%(refname:short)",
    "%(HEAD)",
    "%(upstream:short)",
    "%(upstream:track,nobracket)",
    "%(objectname:short)",
    "%(contents:subject)",
  ].join(FS);

  const { stdout } = await runGit(path, [
    "for-each-ref",
    `--format=${format}`,
    "refs/heads",
    "refs/remotes",
  ]);

  const branches: Branch[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const [refname, short, head, upstream, track, sha, subject] =
      line.split(FS);
    // Skip the symbolic "origin/HEAD" ref — git shortens it to just "origin",
    // so match on the full refname, not the short name.
    if (refname.endsWith("/HEAD")) continue;

    const ahead = /ahead (\d+)/.exec(track)?.[1];
    const behind = /behind (\d+)/.exec(track)?.[1];

    branches.push({
      name: short,
      fullName: refname,
      isRemote: refname.startsWith("refs/remotes/"),
      isCurrent: head === "*",
      upstream: upstream || null,
      ahead: ahead ? Number(ahead) : 0,
      behind: behind ? Number(behind) : 0,
      sha,
      subject,
    });
  }
  return branches;
}

// ── Remotes / tags / stashes ─────────────────────────────────────────────

export type Remote = { name: string; url: string };

export async function getRemotes(path: string): Promise<Remote[]> {
  const { stdout } = await runGit(path, ["remote", "-v"]);
  const seen = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const [name, rest] = line.split("\t");
    const url = rest?.split(" ")[0] ?? "";
    if (!seen.has(name)) seen.set(name, url);
  }
  return [...seen].map(([name, url]) => ({ name, url }));
}

export type Tag = { name: string; sha: string };

export async function getTags(path: string): Promise<Tag[]> {
  const { stdout } = await runGit(path, [
    "for-each-ref",
    `--format=%(refname:short)${FS}%(objectname:short)`,
    "--sort=-creatordate",
    "refs/tags",
  ]);
  return stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const [name, sha] = l.split(FS);
      return { name, sha };
    });
}

export type Stash = { ref: string; message: string };

export async function getStashes(path: string): Promise<Stash[]> {
  const { stdout } = await runGit(path, [
    "stash",
    "list",
    `--format=%gd${FS}%gs`,
  ]);
  return stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const [ref, message] = l.split(FS);
      return { ref, message };
    });
}

// ── Working tree status ──────────────────────────────────────────────────

export type FileStatus = {
  path: string;
  index: string; // staged status code (X)
  worktree: string; // unstaged status code (Y)
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  // Line counts; -1 = unknown (binary, or untracked). Staged side = index vs
  // HEAD, unstaged side = worktree vs index.
  stagedAdds: number;
  stagedDels: number;
  unstagedAdds: number;
  unstagedDels: number;
};

type Stat = { adds: number; dels: number };

// Parse `git diff --numstat -z` into a path → {adds, dels} map. Binary files
// report "-" counts (→ -1). Renames emit an empty path then old + new tokens.
async function numstat(
  path: string,
  extra: string[],
): Promise<Map<string, Stat>> {
  const { stdout } = await runGit(path, ["diff", "--numstat", "-z", ...extra]);
  const tokens = stdout.split("\0");
  const map = new Map<string, Stat>();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    const m = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(t);
    if (!m) continue;
    let file = m[3];
    if (file === "") {
      i++; // old path
      file = tokens[++i] ?? ""; // new path
    }
    map.set(file, {
      adds: m[1] === "-" ? -1 : Number(m[1]),
      dels: m[2] === "-" ? -1 : Number(m[2]),
    });
  }
  return map;
}

export async function getStatus(path: string): Promise<FileStatus[]> {
  const [status, unstagedStat, stagedStat] = await Promise.all([
    runGit(path, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    numstat(path, []),
    numstat(path, ["--cached"]),
  ]);
  const entries = status.stdout.split("\0").filter(Boolean);
  const files: FileStatus[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const x = entry[0];
    const y = entry[1];
    const file = entry.slice(3);
    // Renames/copies emit the source path as the next NUL-separated token.
    if (x === "R" || x === "C") {
      i++; // consume source path
    }
    const untracked = x === "?" && y === "?";
    const us = unstagedStat.get(file);
    const st = stagedStat.get(file);
    files.push({
      path: file,
      index: x,
      worktree: y,
      staged: !untracked && x !== " " && x !== "?",
      unstaged: y !== " " && y !== "?",
      untracked,
      stagedAdds: st?.adds ?? 0,
      stagedDels: st?.dels ?? 0,
      // Untracked isn't in numstat; mark unknown (-1) rather than 0.
      unstagedAdds: us?.adds ?? (untracked ? -1 : 0),
      unstagedDels: us?.dels ?? 0,
    });
  }
  return files;
}

// ── Commit log (for graph) ─────────────────────────────────────────────────

export type Commit = {
  sha: string;
  shortSha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: number; // unix seconds
  subject: string;
  refs: string[]; // decoration names, e.g. ["HEAD -> main", "origin/main"]
};

export async function getCommits(path: string, limit = 200): Promise<Commit[]> {
  const format = ["%H", "%h", "%P", "%an", "%ae", "%at", "%s", "%D"].join(FS);

  const { stdout } = await runGit(path, [
    "log",
    "--all",
    `--max-count=${limit}`,
    "--date-order",
    `--pretty=format:${format}${RS}`,
  ]);

  const commits: Commit[] = [];
  for (const record of stdout.split(RS)) {
    const line = record.replace(/^\n/, "");
    if (!line.trim()) continue;
    const [sha, shortSha, parents, an, ae, at, subject, refs] = line.split(FS);
    commits.push({
      sha,
      shortSha,
      parents: parents ? parents.split(" ").filter(Boolean) : [],
      authorName: an,
      authorEmail: ae,
      date: Number(at),
      subject,
      refs: refs
        ? refs
            .split(", ")
            .map((r) => r.trim())
            .filter(Boolean)
        : [],
    });
  }
  return commits;
}

// ── Commit detail (selected commit) ─────────────────────────────────────────

export type CommitFile = {
  path: string;
  status: string; // A, M, D, R, C…
  additions: number; // -1 for binary
  deletions: number;
};

export type CommitDetail = {
  sha: string;
  shortSha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: number;
  subject: string;
  body: string;
  files: CommitFile[];
};

export async function getCommitDetail(
  path: string,
  sha: string,
): Promise<CommitDetail> {
  const format = ["%H", "%h", "%P", "%an", "%ae", "%at", "%s", "%b"].join(FS);

  const [metaRes, numstatRes, nameStatusRes] = await Promise.all([
    runGit(path, ["show", "-s", `--format=${format}`, sha]),
    runGit(path, ["show", "--no-renames", "--numstat", "--format=", sha]),
    runGit(path, ["show", "--name-status", "--format=", sha]),
  ]);

  const [s, shortSha, parents, an, ae, at, subject, body] =
    metaRes.stdout.split(FS);

  // status letter per path, e.g. "M\tsrc/x.ts"
  const statusByPath = new Map<string, string>();
  for (const line of nameStatusRes.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [code, ...rest] = line.split("\t");
    statusByPath.set(rest[rest.length - 1], code[0]);
  }

  const files: CommitFile[] = [];
  for (const line of numstatRes.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [add, del, file] = line.split("\t");
    files.push({
      path: file,
      status: statusByPath.get(file) ?? "M",
      additions: add === "-" ? -1 : Number(add),
      deletions: del === "-" ? -1 : Number(del),
    });
  }

  return {
    sha: s,
    shortSha,
    parents: parents ? parents.split(" ").filter(Boolean) : [],
    authorName: an,
    authorEmail: ae,
    date: Number(at),
    subject,
    body: (body ?? "").trim(),
    files,
  };
}

/** Subject line of a single commit (cheap lookup, e.g. for a parent). */
export async function getCommitSubject(
  path: string,
  sha: string,
): Promise<string> {
  const { stdout } = await runGit(path, ["show", "-s", "--format=%s", sha]);
  return stdout.trim();
}

/** Raw unified diff (patch) for one file in a commit. */
export async function getCommitFileDiff(
  path: string,
  sha: string,
  file: string,
): Promise<string> {
  const { stdout } = await runGit(path, [
    "show",
    "--format=",
    "-p",
    sha,
    "--",
    file,
  ]);
  return stdout;
}

// ── Merge / conflict state ──────────────────────────────────────────────────

export type MergeState = {
  conflicted: string[]; // unmerged file paths
  inMerge: boolean;
  inRebase: boolean;
};

export async function getMergeState(path: string): Promise<MergeState> {
  const { stdout } = await runGit(path, [
    "diff",
    "--name-only",
    "--diff-filter=U",
    "-z",
  ]);
  const conflicted = stdout.split("\0").filter(Boolean);

  let gitDir = path;
  try {
    const raw = (await runGit(path, ["rev-parse", "--git-dir"])).stdout.trim();
    gitDir = isAbsolute(raw) ? raw : join(path, raw);
  } catch {
    // fall back to working dir
  }

  return {
    conflicted,
    inMerge: existsSync(join(gitDir, "MERGE_HEAD")),
    inRebase:
      existsSync(join(gitDir, "rebase-merge")) ||
      existsSync(join(gitDir, "rebase-apply")),
  };
}

export type ConflictVersions = {
  ours: string | null; // stage 2 (HEAD / current branch)
  theirs: string | null; // stage 3 (incoming)
  working: string; // current on-disk content (with conflict markers)
};

/** The competing versions of a conflicted file, from the index stages. */
export async function getConflictVersions(
  path: string,
  file: string,
): Promise<ConflictVersions> {
  const stage = async (n: number): Promise<string | null> => {
    try {
      return (await runGit(path, ["show", `:${n}:${file}`])).stdout;
    } catch {
      return null; // stage absent (added/deleted on one side)
    }
  };
  const [ours, theirs] = await Promise.all([stage(2), stage(3)]);
  let working = "";
  try {
    working = await readFile(join(path, file), "utf8");
  } catch {
    // file may have been deleted by one side
  }
  return { ours, theirs, working };
}

// ── Working-tree diffs ──────────────────────────────────────────────────────

/** Diff of a file's working-tree state vs HEAD (covers untracked too). */
export async function getWorkingFileDiff(
  path: string,
  file: string,
): Promise<string> {
  try {
    const out = (await runGit(path, ["diff", "HEAD", "--", file])).stdout;
    if (out.trim()) return out;
  } catch (err) {
    if (err instanceof GitError && err.stdout.trim()) return err.stdout;
  }
  // Untracked or no HEAD yet — diff against the empty tree.
  try {
    return (await runGit(path, ["diff", "--no-index", "--", "/dev/null", file]))
      .stdout;
  } catch (err) {
    return err instanceof GitError ? err.stdout : "";
  }
}

/** Unstaged changes for a file (working tree vs index) — used for staging. */
export async function getUnstagedFileDiff(
  path: string,
  file: string,
): Promise<string> {
  return (await runGit(path, ["diff", "--", file])).stdout;
}

/** Staged changes for a file (index vs HEAD) — used for unstaging. */
export async function getStagedFileDiff(
  path: string,
  file: string,
): Promise<string> {
  return (await runGit(path, ["diff", "--cached", "--", file])).stdout;
}

// ── Blame ───────────────────────────────────────────────────────────────────

export type BlameLine = {
  sha: string;
  short: string;
  author: string;
  date: number; // unix seconds
  line: number;
  code: string;
};

export async function getBlame(
  path: string,
  file: string,
): Promise<BlameLine[]> {
  const { stdout } = await runGit(path, ["blame", "--porcelain", "--", file]);
  const meta = new Map<string, { author: string; date: number }>();
  const out: BlameLine[] = [];

  let curSha = "";
  let curLine = 0;
  const lines = stdout.split("\n");
  for (const line of lines) {
    const header = /^([0-9a-f]{40}) \d+ (\d+)/.exec(line);
    if (header) {
      curSha = header[1];
      curLine = Number(header[2]);
      if (!meta.has(curSha)) meta.set(curSha, { author: "", date: 0 });
      continue;
    }
    if (line.startsWith("author ")) {
      const m = meta.get(curSha);
      if (m) m.author = line.slice(7);
    } else if (line.startsWith("author-time ")) {
      const m = meta.get(curSha);
      if (m) m.date = Number(line.slice(12));
    } else if (line.startsWith("\t")) {
      const m = meta.get(curSha) ?? { author: "", date: 0 };
      out.push({
        sha: curSha,
        short: curSha.slice(0, 7),
        author: m.author,
        date: m.date,
        line: curLine,
        code: line.slice(1),
      });
    }
  }
  return out;
}

// ── Interactive rebase helpers ──────────────────────────────────────────────

export type RebaseCommit = { sha: string; short: string; subject: string };

/** Commits in `base..HEAD`, oldest first (the children that a rebase rewrites). */
export async function getRebaseCommits(
  path: string,
  base: string,
): Promise<RebaseCommit[]> {
  const { stdout } = await runGit(path, [
    "log",
    "--reverse",
    "--format=%H%x1f%h%x1f%s",
    `${base}..HEAD`,
  ]);
  return stdout
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const [sha, short, subject] = l.split("\x1f");
      return { sha, short, subject };
    });
}
