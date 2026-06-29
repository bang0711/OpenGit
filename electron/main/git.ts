import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { imageMime } from "@shared/image";
import type {
  BlameLine,
  Branch,
  Commit,
  CommitDetail,
  CommitFile,
  ConflictVersions,
  FileStatus,
  GitResult,
  ImageDiff,
  MergeState,
  RebaseCommit,
  Remote,
  RepoInfo,
  Stash,
  Tag,
} from "@shared/types";

const execFileAsync = promisify(execFile);

const FS = "\x1f";
const RS = "\x1e";
const MAX_BUFFER = 64 * 1024 * 1024;

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

type Stat = { adds: number; dels: number };

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
      i++;
      file = tokens[++i] ?? "";
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
    if (x === "R" || x === "C") i++;
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
      unstagedAdds: us?.adds ?? (untracked ? -1 : 0),
      unstagedDels: us?.dels ?? 0,
    });
  }
  return files;
}

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

export async function getCommitSubject(
  path: string,
  sha: string,
): Promise<string> {
  const { stdout } = await runGit(path, ["show", "-s", "--format=%s", sha]);
  return stdout.trim();
}

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

/** Run git and return raw bytes (for binary blobs like images). */
async function runGitBuffer(cwd: string, args: string[]): Promise<Buffer> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: MAX_BUFFER,
    windowsHide: true,
    encoding: "buffer",
  });
  return stdout as Buffer;
}

function toDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Old (parent) + new (this commit) versions of an image file as data URLs.
 * A side is null when the blob doesn't exist there (file added/deleted).
 */
export async function getCommitFileImage(
  path: string,
  sha: string,
  file: string,
): Promise<ImageDiff> {
  const mime = imageMime(file) ?? "application/octet-stream";
  const read = async (rev: string): Promise<string | null> => {
    try {
      return toDataUrl(
        await runGitBuffer(path, ["show", `${rev}:${file}`]),
        mime,
      );
    } catch {
      return null;
    }
  };
  const [oldUrl, newUrl] = await Promise.all([read(`${sha}^`), read(sha)]);
  return { old: oldUrl, new: newUrl };
}

/** HEAD version (old) + on-disk working version (new) of an image file. */
export async function getWorkingFileImage(
  path: string,
  file: string,
): Promise<ImageDiff> {
  const mime = imageMime(file) ?? "application/octet-stream";
  let oldUrl: string | null = null;
  try {
    oldUrl = toDataUrl(
      await runGitBuffer(path, ["show", `HEAD:${file}`]),
      mime,
    );
  } catch {}
  let newUrl: string | null = null;
  try {
    newUrl = toDataUrl(await readFile(join(path, file)), mime);
  } catch {}
  return { old: oldUrl, new: newUrl };
}

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
  } catch {}

  return {
    conflicted,
    inMerge: existsSync(join(gitDir, "MERGE_HEAD")),
    inRebase:
      existsSync(join(gitDir, "rebase-merge")) ||
      existsSync(join(gitDir, "rebase-apply")),
  };
}

export async function getConflictVersions(
  path: string,
  file: string,
): Promise<ConflictVersions> {
  const stage = async (n: number): Promise<string | null> => {
    try {
      return (await runGit(path, ["show", `:${n}:${file}`])).stdout;
    } catch {
      return null;
    }
  };
  const [ours, theirs] = await Promise.all([stage(2), stage(3)]);
  let working = "";
  try {
    working = await readFile(join(path, file), "utf8");
  } catch {}
  return { ours, theirs, working };
}

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
  try {
    return (await runGit(path, ["diff", "--no-index", "--", "/dev/null", file]))
      .stdout;
  } catch (err) {
    return err instanceof GitError ? err.stdout : "";
  }
}

export async function getUnstagedFileDiff(
  path: string,
  file: string,
): Promise<string> {
  return (await runGit(path, ["diff", "--", file])).stdout;
}

export async function getStagedFileDiff(
  path: string,
  file: string,
): Promise<string> {
  return (await runGit(path, ["diff", "--cached", "--", file])).stdout;
}

export async function getBlame(
  path: string,
  file: string,
): Promise<BlameLine[]> {
  const { stdout } = await runGit(path, ["blame", "--porcelain", "--", file]);
  const meta = new Map<string, { author: string; date: number }>();
  const out: BlameLine[] = [];

  let curSha = "";
  let curLine = 0;
  for (const line of stdout.split("\n")) {
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
