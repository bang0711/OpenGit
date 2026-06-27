// Publish the locally-built installer to a GitHub Release.
//
// We build + sign locally, so CI rebuilding would be wasteful and unsigned.
// This just attaches the existing release/OpenGit-Setup-<version>.exe to a
// GitHub Release tagged v<version> via the gh CLI.
//
// Prereqs: `gh` CLI installed and authed (`gh auth login`), and the current
// commit pushed to origin (the tag is created from it).
//
// Usage: bun run release   [-- --notes "Custom notes"]

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const { version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const tag = `v${version}`;
const exe = join(root, "release", `OpenGit-Setup-${version}.exe`);

if (!existsSync(exe)) {
  console.error(
    `Installer not found: ${exe}\nRun \`bun run electron:build\` first.`,
  );
  process.exit(1);
}

const notesArg = process.argv.indexOf("--notes");
const notes =
  notesArg !== -1 ? process.argv[notesArg + 1] : `OpenGit ${tag}`;

const gh = (args) =>
  execFileSync("gh", args, { stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();

// Reuse the release if the tag already exists; otherwise create it.
let exists = true;
try {
  gh(["release", "view", tag]);
} catch {
  exists = false;
}

if (exists) {
  console.log(`Release ${tag} exists — uploading installer (clobbering).`);
  gh(["release", "upload", tag, exe, "--clobber"]);
} else {
  console.log(`Creating release ${tag}.`);
  gh(["release", "create", tag, exe, "--title", `OpenGit ${tag}`, "--notes", notes]);
}

console.log(`Done. https://github.com/bang0711/OpenGit/releases/tag/${tag}`);
