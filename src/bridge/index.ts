// Tauri bridge — replaces what the Electron preload (electron/preload/index.ts)
// used to do. Builds window.api / window.github / window.updater on top of Tauri
// `invoke()` + event `listen()`, preserving the exact shapes in shared/types.ts
// so no renderer call site changes.
//
// The Rust side exposes three dispatcher commands — `api_call`, `gh_call`,
// `updater_call` — each taking `{ name, args }` (positional args forwarded as an
// array), mirroring the dynamic dispatch the old main process already used. Each
// returns the same `{ ...data }` / `{ error }` shapes, so existing
// `if ("error" in res)` checks keep working (no thrown promises on logical errors).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { API_CHANNELS } from "@shared/channels";
import type { Api, Github, Updater } from "@shared/types";
import { echoCommand } from "@/lib/terminal-bus";

type AnyFn = (...args: unknown[]) => Promise<unknown>;

// Map mutating api methods → the git command they run, so "Sync with UI" can
// echo it into the terminal. Read-only/non-git methods are absent (no echo).
const CMD: Record<string, (a: unknown[]) => string> = {
  gitFetch: () => "git fetch --all --prune",
  gitPull: () => "git pull",
  gitPush: () => "git push",
  gitPushForce: () => "git push --force-with-lease",
  gitPushSetUpstream: () => "git push -u origin HEAD",
  fetchTags: () => "git fetch origin --tags",
  stageFile: (a) => `git add -- ${a[0]}`,
  stageAll: () => "git add --all",
  unstageFile: (a) => `git restore --staged -- ${a[0]}`,
  unstageAll: () => "git reset",
  discardFile: (a) => `git restore -- ${a[0]}`,
  commit: (a) => `git commit -m "${a[0]}"`,
  amendCommit: () => "git commit --amend",
  checkoutBranch: (a) => `git checkout ${a[0]}`,
  checkoutCommit: (a) => `git checkout ${a[0]}`,
  mergeBranch: (a) => `git merge --no-edit ${a[0]}`,
  mergeInto: (a) => `git checkout ${a[0]} && git merge --no-edit ${a[1]}`,
  rebaseOnto: (a) => `git checkout ${a[0]} && git rebase ${a[1]}`,
  createBranch: (a) => `git switch -c ${a[0]}`,
  deleteBranch: (a) => `git branch -d ${a[0]}`,
  renameBranch: (a) => `git branch -m ${a[0]} ${a[1]}`,
  cherryPick: (a) => `git cherry-pick ${a[0]}`,
  revertCommit: (a) => `git revert --no-edit ${a[0]}`,
  resetToCommit: (a) => `git reset --${a[1]} ${a[0]}`,
  createTagAt: (a) => `git tag ${a[0]} ${a[1]}`,
  deleteTag: (a) => `git tag -d ${a[0]}`,
  stashPush: () => "git stash push --include-untracked",
  stashApply: (a) => `git stash apply ${a[0]}`,
  stashPop: (a) => `git stash pop ${a[0]}`,
  stashDrop: (a) => `git stash drop ${a[0]}`,
  undoLast: () => "git reset --keep HEAD@{1}",
  submoduleUpdate: () => "git submodule update --init --recursive",
  lfsPull: () => "git lfs pull",
};

/** A method that forwards positional args to a Rust namespace dispatcher. */
const call =
  (dispatcher: string, name: string): AnyFn =>
  (...args: unknown[]) => {
    if (dispatcher === "api_call" && CMD[name]) echoCommand(CMD[name](args));
    return invoke(dispatcher, { name, args });
  };

/** Subscribe to a backend event; returns an unlisten fn (sync, like the old bridge). */
function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  const p = listen<T>(event, (e) => cb(e.payload));
  return () => {
    p.then((un) => un());
  };
}

// window.api — 63 git/repo methods from the shared channel list + repo watcher.
const api: Record<string, unknown> = {};
for (const name of API_CHANNELS) api[name] = call("api_call", name);
api.onRepoChange = (cb: () => void) => subscribe("repo:changed", cb);

// window.github
const GH_METHODS = [
  "tokenStatus",
  "setToken",
  "clearToken",
  "deviceStart",
  "repoContext",
  "invalidate",
  "listPRs",
  "getPR",
  "mergePR",
  "closePR",
  "commentPR",
  "reviewPR",
  "createPR",
  "listCollaborators",
  "listIssues",
  "listRemoteBranches",
  "listMyRepos",
] as const;
const github: Record<string, unknown> = {};
for (const name of GH_METHODS) github[name] = call("gh_call", name);
github.onAuth = (cb: (status: unknown) => void) => subscribe("gh:auth", cb);

// window.updater
const UPDATER_METHODS = ["check", "download"] as const;
const updater: Record<string, unknown> = {};
for (const name of UPDATER_METHODS) updater[name] = call("updater_call", name);
updater.onEvent = (cb: (e: unknown) => void) => subscribe("updater:event", cb);

// Window is augmented in src/global.d.ts (api/github/updater).

/** Install the three globals. Runs on import (below) — before React renders. */
export function installBridge(): void {
  window.api = api as unknown as Api;
  window.github = github as unknown as Github;
  window.updater = updater as unknown as Updater;
}

// Install as a side effect of importing this module. main.tsx imports it FIRST,
// so window.api exists before any module (e.g. app/actions.ts) reads it at
// evaluation time — matching how the Electron preload set it before any script.
installBridge();
