import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getBlame,
  getBranches,
  getCommitDetail,
  getCommitFileDiff,
  getCommits,
  getMergeState,
  getRebaseCommits,
  getRepoInfo,
  getStashes,
  getStatus,
  getTags,
  isGitRepo,
} from "./git";

// Integration: spin a throwaway repo and run real git through these functions.
let repo: string;
let firstSha = "";
let secondSha = "";
const git = (args: string[]) =>
  execFileSync("git", args, { cwd: repo, stdio: "pipe" });

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "opengit-git-"));
  git(["init", "-b", "main"]);
  git(["config", "user.email", "t@t.com"]);
  git(["config", "user.name", "Tester"]);

  writeFileSync(join(repo, "a.txt"), "hello\nworld\n");
  git(["add", "."]);
  git(["commit", "-m", "first"]);
  firstSha = git(["rev-parse", "HEAD"]).toString().trim();

  writeFileSync(join(repo, "b.txt"), "second\n");
  git(["add", "."]);
  git(["commit", "-m", "second"]);
  secondSha = git(["rev-parse", "HEAD"]).toString().trim();

  git(["tag", "v1"]);
  git(["branch", "feature"]);

  // Leave an unstaged modification for status tests.
  writeFileSync(join(repo, "a.txt"), "hello\nchanged\n");
});

afterAll(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("isGitRepo", () => {
  it("detects a repo and a non-repo", async () => {
    expect(await isGitRepo(repo)).toBe(true);
    expect(await isGitRepo(tmpdir())).toBe(false);
  });
});

describe("getRepoInfo", () => {
  it("reports the current branch and short HEAD", async () => {
    const info = await getRepoInfo(repo);
    expect(info.head).toBe("main");
    expect(info.detached).toBe(false);
    expect(info.commit).toBeTruthy();
  });
});

describe("getBranches", () => {
  it("lists local branches and marks the current one", async () => {
    const branches = await getBranches(repo);
    const main = branches.find((b) => b.name === "main");
    expect(main?.isCurrent).toBe(true);
    expect(branches.some((b) => b.name === "feature")).toBe(true);
  });
});

describe("getCommits", () => {
  it("returns commits newest-first with parents", async () => {
    const commits = await getCommits(repo, 50);
    expect(commits[0].subject).toBe("second");
    expect(commits[1].subject).toBe("first");
    expect(commits[0].parents).toContain(firstSha);
    expect(commits[1].parents).toEqual([]); // root commit
  });
});

describe("getStatus", () => {
  it("reports the unstaged modification", async () => {
    const files = await getStatus(repo);
    const a = files.find((f) => f.path === "a.txt");
    expect(a?.unstaged).toBe(true);
  });
});

describe("getCommitDetail / getCommitFileDiff", () => {
  it("returns the changed files of a commit", async () => {
    const detail = await getCommitDetail(repo, secondSha);
    expect(detail.subject).toBe("second");
    const b = detail.files.find((f) => f.path === "b.txt");
    expect(b?.status).toBe("A");
    expect(b?.additions).toBe(1);
  });

  it("returns a unified diff for a file in a commit", async () => {
    const diff = await getCommitFileDiff(repo, secondSha, "b.txt");
    expect(diff).toContain("+second");
  });
});

describe("getTags / getStashes / getBlame / getMergeState / getRebaseCommits", () => {
  it("lists tags", async () => {
    const tags = await getTags(repo);
    expect(tags.map((t) => t.name)).toContain("v1");
  });

  it("has no stashes initially", async () => {
    expect(await getStashes(repo)).toEqual([]);
  });

  it("blames lines to the author", async () => {
    const lines = await getBlame(repo, "b.txt");
    expect(lines[0].author).toBe("Tester");
    expect(lines[0].code).toBe("second");
  });

  it("reports a clean (non-conflicted) merge state", async () => {
    const state = await getMergeState(repo);
    expect(state.conflicted).toEqual([]);
    expect(state.inMerge).toBe(false);
    expect(state.inRebase).toBe(false);
  });

  it("lists commits a rebase onto the root would rewrite", async () => {
    const commits = await getRebaseCommits(repo, firstSha);
    expect(commits.map((c) => c.subject)).toEqual(["second"]);
  });
});
