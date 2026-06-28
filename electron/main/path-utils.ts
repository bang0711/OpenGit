/**
 * Build the ephemeral `-c http.extraHeader` git args that authenticate an HTTPS
 * clone of a private repo with a personal access token. Returns [] when no
 * token is given. The header is Basic auth with the token as the password; it is
 * passed per-command (not written to .git/config, not embedded in the URL).
 */
export function cloneAuthArgs(token?: string): string[] {
  const t = token?.trim();
  if (!t) return [];
  const basic = Buffer.from(`x-access-token:${t}`).toString("base64");
  return ["-c", `http.extraHeader=Authorization: Basic ${basic}`];
}

/** Parse owner/repo from a GitHub remote URL. Returns null for non-GitHub. */
export function parseGithubRemote(
  url: string,
): { owner: string; repo: string } | null {
  const m = /github\.com[/:]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url.trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * True when `path` is a Windows drive root like `C:\`. Used to decide that
 * "up one level" should show the list of drives (This PC) rather than nothing.
 */
export function isWindowsDriveRoot(
  path: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  return platform === "win32" && /^[a-zA-Z]:\\$/.test(path);
}
