import { ipcMain } from "electron";
import type {
  ActionState,
  Collaborator,
  GhStatus,
  GithubBranch,
  GithubIssue,
  GhUser,
  MergeMethod,
  PullRequest,
  PullRequestDetail,
  ReviewEvent,
} from "@shared/types";
import { getRemotes } from "./git";
import { parseGithubRemote } from "./path-utils";
import { resolveRepoPath } from "./repo-registry";
import { clearGithubToken, getGithubToken, setGithubToken } from "./secrets";
import { getActiveRepoId } from "./state";

const API = "https://api.github.com";

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

async function ghFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getGithubToken();
  if (!token) throw new Error("Not connected to GitHub.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "OpenGit",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (data as { message?: string } | null)?.message ||
      `GitHub request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

// ── mappers ──────────────────────────────────────────────────────────────────
type RawUser = { login: string; avatar_url: string } | null;
const user = (u: RawUser): GhUser | null =>
  u ? { login: u.login, avatarUrl: u.avatar_url } : null;

type RawPr = {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  user: RawUser;
  base: { ref: string };
  head: { ref: string; sha: string };
  comments?: number;
  created_at: string;
  updated_at: string;
  html_url: string;
  body?: string | null;
  mergeable?: boolean | null;
};

const mapPr = (p: RawPr): PullRequest => ({
  number: p.number,
  title: p.title,
  state: p.state === "closed" ? "closed" : "open",
  draft: !!p.draft,
  merged: !!p.merged || !!p.merged_at,
  author: user(p.user),
  base: p.base.ref,
  head: p.head.ref,
  comments: p.comments ?? 0,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
  url: p.html_url,
});

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
      Array<{ filename: string; status: string; additions: number; deletions: number }>
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
  const role = (c: { role_name?: string; permissions?: Record<string, boolean> }) =>
    c.role_name ||
    (c.permissions?.admin
      ? "admin"
      : c.permissions?.push
        ? "write"
        : "read");
  return raw.map((c) => ({
    login: c.login,
    avatarUrl: c.avatar_url,
    role: role(c),
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
    .filter((i) => !i.pull_request) // GitHub returns PRs in the issues list too
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
}
