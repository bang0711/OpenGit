import { describe, expect, it } from "vitest";
import {
  collabRole,
  isRealIssue,
  mapPr,
  mapUser,
  type RawPr,
} from "@main/github-map";

const basePr: RawPr = {
  number: 7,
  title: "Add feature",
  state: "open",
  user: { login: "octocat", avatar_url: "https://x/a.png" },
  base: { ref: "main" },
  head: { ref: "feature", sha: "abc123" },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
  html_url: "https://github.com/o/r/pull/7",
};

describe("mapUser", () => {
  it("maps a user, null stays null", () => {
    expect(mapUser({ login: "a", avatar_url: "u" })).toEqual({
      login: "a",
      avatarUrl: "u",
    });
    expect(mapUser(null)).toBeNull();
  });
});

describe("mapPr", () => {
  it("maps core fields and author", () => {
    const pr = mapPr(basePr);
    expect(pr.number).toBe(7);
    expect(pr.base).toBe("main");
    expect(pr.head).toBe("feature");
    expect(pr.author).toEqual({ login: "octocat", avatarUrl: "https://x/a.png" });
    expect(pr.comments).toBe(0); // defaults when absent
  });

  it("derives merged from merged flag or merged_at", () => {
    expect(mapPr({ ...basePr, state: "closed", merged_at: "2024-01-03T00:00:00Z" }).merged).toBe(true);
    expect(mapPr({ ...basePr, merged: true }).merged).toBe(true);
    expect(mapPr(basePr).merged).toBe(false);
  });

  it("normalizes state to open|closed", () => {
    expect(mapPr({ ...basePr, state: "closed" }).state).toBe("closed");
    expect(mapPr({ ...basePr, state: "whatever" }).state).toBe("open");
  });
});

describe("collabRole", () => {
  it("prefers role_name", () => {
    expect(collabRole({ role_name: "maintain" })).toBe("maintain");
  });
  it("falls back to permissions", () => {
    expect(collabRole({ permissions: { admin: true } })).toBe("admin");
    expect(collabRole({ permissions: { push: true } })).toBe("write");
    expect(collabRole({ permissions: { pull: true } })).toBe("read");
    expect(collabRole({})).toBe("read");
  });
});

describe("isRealIssue", () => {
  it("drops entries that are actually PRs", () => {
    expect(isRealIssue({})).toBe(true);
    expect(isRealIssue({ pull_request: { url: "x" } })).toBe(false);
  });
});
