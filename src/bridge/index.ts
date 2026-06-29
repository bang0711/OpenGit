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

type AnyFn = (...args: unknown[]) => Promise<unknown>;

/** A method that forwards positional args to a Rust namespace dispatcher. */
const call =
  (dispatcher: string, name: string): AnyFn =>
  (...args: unknown[]) =>
    invoke(dispatcher, { name, args });

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
const UPDATER_METHODS = [
  "check",
  "download",
  "install",
  "listReleases",
  "openDownload",
  "downloadVersion",
] as const;
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
