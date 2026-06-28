import { BrowserWindow, ipcMain, shell } from "electron";
import type {
  ActionState,
  Collaborator,
  GhRepo,
  GhStatus,
  GithubBranch,
  GithubIssue,
  MergeMethod,
  PullRequest,
  PullRequestDetail,
  ReviewEvent,
} from "@shared/types";
import { getRemotes } from "./git";
import {
  collabRole,
  isRealIssue,
  mapPr,
  mapUser,
  type RawPr,
  type RawUser,
} from "./github-map";
import { parseGithubRemote } from "./path-utils";
import { resolveRepoPath } from "./repo-registry";
import { clearGithubToken, getGithubToken, setGithubToken } from "./secrets";
import { getActiveRepoId } from "./state";

const API = "https://api.github.com";

// GitHub OAuth App client ID for the Device Flow. Like GitKraken, OpenGit ships
// its OWN OAuth App so end users get one-click login with zero setup. The id is
// PUBLIC (device flow has no secret) — it's baked into the binary at build time
// from OPENGIT_GH_CLIENT_ID (see electron.vite.config.ts) so it stays out of the
// source. process.env is a runtime fallback for `electron-vite dev`.
declare const __GH_CLIENT_ID__: string;
const CLIENT_ID =
  (typeof __GH_CLIENT_ID__ !== "undefined" ? __GH_CLIENT_ID__ : "") ||
  process.env.OPENGIT_GH_CLIENT_ID?.trim() ||
  "";
const OAUTH_SCOPE = "repo read:org";

function emitAuth(payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("gh:auth", payload);
  }
}

// Poll GitHub for the device-flow token until the user authorizes (or it
// expires), then store it and notify the renderer.
async function pollDeviceToken(deviceCode: string, interval: number): Promise<void> {
  let wait = Math.max(interval, 5) * 1000;
  for (;;) {
    await new Promise((r) => setTimeout(r, wait));
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      access_token?: string;
      error?: string;
      interval?: number;
    } | null;
    if (data?.access_token) {
      setGithubToken(data.access_token);
      emitAuth(await status());
      return;
    }
    if (data?.error === "authorization_pending") continue;
    if (data?.error === "slow_down") {
      wait += 5000;
      continue;
    }
    // expired_token, access_denied, etc.
    emitAuth({ connected: false, reason: data?.error ?? "Login failed." });
    return;
  }
}

// Start the OAuth Device Flow: get a user code, open the verification page, and
// begin polling in the background. Resolves with the code to show the user.
async function deviceStart(): Promise<
  { userCode: string; verificationUri: string; expiresIn: number } | ActionState
> {
  if (!CLIENT_ID)
    return {
      error:
        "GitHub login isn't configured. Set OPENGIT_GH_CLIENT_ID to your OAuth App's client id, or sign in with a token.",
    };
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: OAUTH_SCOPE }),
  });
  const data = (await res.json().catch(() => null)) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    expires_in?: number;
    interval?: number;
    error?: string;
  } | null;
  if (!data?.device_code || !data.user_code || !data.verification_uri)
    return { error: data?.error || "Could not start GitHub login." };
  void shell.openExternal(data.verification_uri);
  void pollDeviceToken(data.device_code, data.interval ?? 5);
  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in ?? 900,
  };
}

async function ghContext(): Promise<{ owner: string; repo: string }> {
  const id = getActiveRepoId();
  if (!id) throw new Error("No active repository.");
  const path = await resolveRepoPath(id);
  const remotes = await getRemotes(path);
  const origin = remotes.find((r) => r.name === "origin") ?? remotes[0];
  const parsed = origin ? parseGithubRemote(origin.url) : null;
  if (!parsed) throw new Error("Not a GitHub repository.");
  return parsed;
}

// ETag cache for GET requests. Conditional requests that return 304 (Not
// Modified) do NOT count against the GitHub rate limit, so we can poll fast.
const etagCache = new Map<string, { etag: string; data: unknown }>();

async function ghFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getGithubToken();
  if (!token) throw new Error("Not connected to GitHub.");
  const method = init?.method ?? "GET";
  const cached = method === "GET" ? etagCache.get(path) : undefined;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "OpenGit",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(cached ? { "If-None-Match": cached.etag } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 304 && cached) return cached.data as T;
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data as { message?: string } | null)?.message ||
      `GitHub request failed (${res.status})`;
    throw new Error(msg);
  }
  const etag = res.headers.get("etag");
  if (method === "GET" && etag) etagCache.set(path, { etag, data });
  return data as T;
}

// Pure response mappers live in ./github-map (unit-tested).
const user = mapUser;

// ── operations ───────────────────────────────────────────────────────────────
async function status(): Promise<GhStatus> {
  if (!getGithubToken()) return { connected: false };
  try {
    const u = await ghFetch<{ login: string; avatar_url: string }>("/user");
    return { connected: true, login: u.login, avatarUrl: u.avatar_url };
  } catch (e) {
    return { connected: false, reason: (e as Error).message };
  }
}

// owner/repo of the active repo, or null when it isn't a GitHub remote. Used by
// the renderer to subscribe the webhook relay to the right repo. No token needed.
async function repoContext(): Promise<{ owner: string; repo: string } | null> {
  try {
    return await ghContext();
  } catch {
    return null;
  }
}

async function setToken(token: string): Promise<GhStatus> {
  setGithubToken(token);
  const s = await status();
  if (!s.connected) clearGithubToken(); // reject a bad token rather than keep it
  return s;
}

async function listPRs(): Promise<PullRequest[]> {
  const { owner, repo } = await ghContext();
  const raw = await ghFetch<RawPr[]>(
    `/repos/${owner}/${repo}/pulls?state=all&per_page=50&sort=updated&direction=desc`,
  );
  return raw.map(mapPr);
}

async function getPR(n: number): Promise<PullRequestDetail> {
  const { owner, repo } = await ghContext();
  const base = `/repos/${owner}/${repo}`;
  const pr = await ghFetch<RawPr>(`${base}/pulls/${n}`);
  const [files, comments, reviews] = await Promise.all([
    ghFetch<
      Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        patch?: string;
      }>
    >(`${base}/pulls/${n}/files?per_page=100`),
    ghFetch<Array<{ id: number; user: RawUser; body: string; created_at: string }>>(
      `${base}/issues/${n}/comments?per_page=100`,
    ),
    ghFetch<
      Array<{ id: number; user: RawUser; state: string; body: string; submitted_at: string | null }>
    >(`${base}/pulls/${n}/reviews?per_page=100`),
  ]);
  let checks: PullRequestDetail["checks"] = [];
  try {
    const cr = await ghFetch<{
      check_runs: Array<{ name: string; status: string; conclusion: string | null }>;
    }>(`${base}/commits/${pr.head.sha}/check-runs`);
    checks = cr.check_runs.map((c) => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
    }));
  } catch {
    // checks may be unavailable (no CI); leave empty
  }
  return {
    ...mapPr(pr),
    body: pr.body ?? "",
    mergeable: pr.mergeable ?? null,
    files: files.map((f) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    comments_list: comments.map((c) => ({
      id: c.id,
      author: user(c.user),
      body: c.body,
      createdAt: c.created_at,
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      author: user(r.user),
      state: r.state,
      body: r.body,
      submittedAt: r.submitted_at,
    })),
    checks,
  };
}

async function mergePR(n: number, method: MergeMethod): Promise<void> {
  const { owner, repo } = await ghContext();
  await ghFetch(`/repos/${owner}/${repo}/pulls/${n}/merge`, {
    method: "PUT",
    body: JSON.stringify({ merge_method: method }),
  });
}

async function closePR(n: number): Promise<void> {
  const { owner, repo } = await ghContext();
  await ghFetch(`/repos/${owner}/${repo}/pulls/${n}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

async function commentPR(n: number, body: string): Promise<void> {
  const { owner, repo } = await ghContext();
  await ghFetch(`/repos/${owner}/${repo}/issues/${n}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function reviewPR(n: number, event: ReviewEvent, body?: string): Promise<void> {
  const { owner, repo } = await ghContext();
  await ghFetch(`/repos/${owner}/${repo}/pulls/${n}/reviews`, {
    method: "POST",
    body: JSON.stringify({ event, body: body ?? "" }),
  });
}

async function createPR(
  title: string,
  body: string,
  head: string,
  base: string,
  reviewers: string[] = [],
): Promise<void> {
  const { owner, repo } = await ghContext();
  const pr = await ghFetch<{ number: number }>(
    `/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      body: JSON.stringify({ title, body, head, base }),
    },
  );
  if (reviewers.length > 0) {
    await ghFetch(
      `/repos/${owner}/${repo}/pulls/${pr.number}/requested_reviewers`,
      { method: "POST", body: JSON.stringify({ reviewers }) },
    );
  }
}

async function listCollaborators(): Promise<Collaborator[]> {
  const { owner, repo } = await ghContext();
  const raw = await ghFetch<
    Array<{ login: string; avatar_url: string; html_url: string; role_name?: string; permissions?: Record<string, boolean> }>
  >(`/repos/${owner}/${repo}/collaborators?per_page=100`);
  return raw.map((c) => ({
    login: c.login,
    avatarUrl: c.avatar_url,
    role: collabRole(c),
    url: c.html_url,
  }));
}

async function listIssues(): Promise<GithubIssue[]> {
  const { owner, repo } = await ghContext();
  const raw = await ghFetch<
    Array<{
      number: number;
      title: string;
      state: string;
      user: RawUser;
      comments: number;
      created_at: string;
      html_url: string;
      pull_request?: unknown;
    }>
  >(`/repos/${owner}/${repo}/issues?state=all&per_page=50&sort=updated`);
  return raw
    .filter(isRealIssue) // GitHub returns PRs in the issues list too
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state === "closed" ? "closed" : "open",
      author: user(i.user),
      comments: i.comments,
      createdAt: i.created_at,
      url: i.html_url,
    }));
}

// The signed-in user's repositories (no repo context needed — just the token).
async function listMyRepos(): Promise<GhRepo[]> {
  const raw = await ghFetch<
    Array<{
      full_name: string;
      name: string;
      owner: { login: string };
      private: boolean;
      clone_url: string;
      description: string | null;
      updated_at: string;
    }>
  >(
    "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
  );
  return raw.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    owner: r.owner.login,
    private: r.private,
    cloneUrl: r.clone_url,
    description: r.description ?? "",
    updatedAt: r.updated_at,
  }));
}

async function listRemoteBranches(): Promise<GithubBranch[]> {
  const { owner, repo } = await ghContext();
  const raw = await ghFetch<
    Array<{ name: string; commit: { sha: string }; protected: boolean }>
  >(`/repos/${owner}/${repo}/branches?per_page=100`);
  return raw.map((b) => ({
    name: b.name,
    sha: b.commit.sha,
    protected: b.protected,
  }));
}

// ── IPC wiring (mirrors wireUpdater) ─────────────────────────────────────────
const ok = (): ActionState => ({});
const fail = (e: unknown): ActionState => ({ error: (e as Error).message });

let wired = false;
export function wireGithub(log: (...a: unknown[]) => void): void {
  if (wired) return;
  wired = true;

  ipcMain.handle("gh:tokenStatus", () => status());
  ipcMain.handle("gh:setToken", (_e, token: string) => setToken(token));
  ipcMain.handle("gh:clearToken", () => clearGithubToken());
  ipcMain.handle("gh:deviceStart", () => deviceStart());
  ipcMain.handle("gh:repoContext", () => repoContext());
  // Drop ETag cache so the next reads force fresh 200s (manual Refresh).
  ipcMain.handle("gh:invalidate", () => {
    etagCache.clear();
  });

  // Reads return data or { error }; actions return {} or { error }.
  const read = <T>(fn: () => Promise<T>) =>
    fn().catch((e) => {
      log("github read failed:", (e as Error).message);
      return { error: (e as Error).message };
    });
  const act = (fn: () => Promise<unknown>) =>
    fn()
      .then(ok)
      .catch(fail);

  ipcMain.handle("gh:listPRs", () => read(listPRs));
  ipcMain.handle("gh:getPR", (_e, n: number) => read(() => getPR(n)));
  ipcMain.handle("gh:mergePR", (_e, n: number, m: MergeMethod) =>
    act(() => mergePR(n, m)),
  );
  ipcMain.handle("gh:closePR", (_e, n: number) => act(() => closePR(n)));
  ipcMain.handle("gh:commentPR", (_e, n: number, body: string) =>
    act(() => commentPR(n, body)),
  );
  ipcMain.handle("gh:reviewPR", (_e, n: number, ev: ReviewEvent, body?: string) =>
    act(() => reviewPR(n, ev, body)),
  );
  ipcMain.handle(
    "gh:createPR",
    (
      _e,
      title: string,
      body: string,
      head: string,
      base: string,
      reviewers: string[],
    ) => act(() => createPR(title, body, head, base, reviewers)),
  );
  ipcMain.handle("gh:listCollaborators", () => read(listCollaborators));
  ipcMain.handle("gh:listIssues", () => read(listIssues));
  ipcMain.handle("gh:listRemoteBranches", () => read(listRemoteBranches));
  ipcMain.handle("gh:listMyRepos", () => read(listMyRepos));
}
