// Pure mappers from GitHub REST shapes to our shared types. No electron / no
// network imports, so they're unit-testable on their own.
import type { GhUser, PullRequest } from "@shared/types";

export type RawUser = { login: string; avatar_url: string } | null;

export const mapUser = (u: RawUser): GhUser | null =>
  u ? { login: u.login, avatarUrl: u.avatar_url } : null;

export type RawPr = {
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

export const mapPr = (p: RawPr): PullRequest => ({
  number: p.number,
  title: p.title,
  state: p.state === "closed" ? "closed" : "open",
  draft: !!p.draft,
  merged: !!p.merged || !!p.merged_at,
  author: mapUser(p.user),
  base: p.base.ref,
  head: p.head.ref,
  comments: p.comments ?? 0,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
  url: p.html_url,
});

export type RawCollab = {
  role_name?: string;
  permissions?: Record<string, boolean>;
};

/** Best label for a collaborator's role from the API's role_name/permissions. */
export const collabRole = (c: RawCollab): string =>
  c.role_name ||
  (c.permissions?.admin ? "admin" : c.permissions?.push ? "write" : "read");

/** GitHub returns PRs inside the issues list; keep only true issues. */
export const isRealIssue = (i: { pull_request?: unknown }): boolean =>
  !i.pull_request;
