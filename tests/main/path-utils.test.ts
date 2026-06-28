import { describe, expect, it } from "vitest";
import {
  cloneAuthArgs,
  isWindowsDriveRoot,
  parseGithubRemote,
} from "@main/path-utils";

describe("cloneAuthArgs", () => {
  it("returns no args when token is missing or blank", () => {
    expect(cloneAuthArgs()).toEqual([]);
    expect(cloneAuthArgs("")).toEqual([]);
    expect(cloneAuthArgs("   ")).toEqual([]);
  });

  it("builds a Basic auth http.extraHeader with the token as password", () => {
    const args = cloneAuthArgs("ghp_secret");
    const basic = Buffer.from("x-access-token:ghp_secret").toString("base64");
    expect(args).toEqual([
      "-c",
      `http.extraHeader=Authorization: Basic ${basic}`,
    ]);
    // decodes back to the expected credential pair
    expect(Buffer.from(basic, "base64").toString()).toBe(
      "x-access-token:ghp_secret",
    );
  });

  it("trims surrounding whitespace from the token", () => {
    expect(cloneAuthArgs("  abc  ")).toEqual(cloneAuthArgs("abc"));
  });
});

describe("isWindowsDriveRoot", () => {
  it("matches drive roots only on win32", () => {
    expect(isWindowsDriveRoot("C:\\", "win32")).toBe(true);
    expect(isWindowsDriveRoot("D:\\", "win32")).toBe(true);
    expect(isWindowsDriveRoot("c:\\", "win32")).toBe(true);
  });

  it("rejects non-roots and sub-paths", () => {
    expect(isWindowsDriveRoot("C:\\Users", "win32")).toBe(false);
    expect(isWindowsDriveRoot("C:", "win32")).toBe(false);
    expect(isWindowsDriveRoot("/home/user", "win32")).toBe(false);
  });

  it("is always false off win32", () => {
    expect(isWindowsDriveRoot("C:\\", "linux")).toBe(false);
    expect(isWindowsDriveRoot("C:\\", "darwin")).toBe(false);
  });
});

describe("parseGithubRemote", () => {
  it("parses https URLs with and without .git", () => {
    expect(parseGithubRemote("https://github.com/bang0711/OpenGit.git")).toEqual(
      { owner: "bang0711", repo: "OpenGit" },
    );
    expect(parseGithubRemote("https://github.com/bang0711/OpenGit")).toEqual({
      owner: "bang0711",
      repo: "OpenGit",
    });
  });

  it("parses ssh (scp-style) URLs", () => {
    expect(parseGithubRemote("git@github.com:bang0711/OpenGit.git")).toEqual({
      owner: "bang0711",
      repo: "OpenGit",
    });
  });

  it("ignores a trailing slash", () => {
    expect(parseGithubRemote("https://github.com/a/b/")).toEqual({
      owner: "a",
      repo: "b",
    });
  });

  it("returns null for non-GitHub remotes", () => {
    expect(parseGithubRemote("https://gitlab.com/a/b.git")).toBeNull();
    expect(parseGithubRemote("")).toBeNull();
  });
});
