// Cut a release: tag the current commit `v<version>` and push it. That tag push
// triggers .github/workflows/release.yml, which builds Windows/macOS/Linux
// installers and publishes them to a GitHub Release. No local build needed.
//
// Usage: bump "version" in package.json, commit, then `bun run release`.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { version } = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
);
const tag = `v${version}`;

const git = (args) =>
  execFileSync("git", args, { stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();

// Tag must point at a commit that already has this version — so the tree must
// be clean (version bump committed). Otherwise CI would build the wrong version.
if (git(["status", "--porcelain"])) {
  console.error(
    "Working tree has uncommitted changes. Commit them (including the\n" +
      'package.json version bump) before releasing — the tag is cut from HEAD.',
  );
  process.exit(1);
}

let tagExists = false;
try {
  git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`]);
  tagExists = true;
} catch {}
if (tagExists) {
  console.error(
    `Tag ${tag} already exists. Bump "version" in package.json and commit first.`,
  );
  process.exit(1);
}

console.log(`Tagging ${tag} and pushing — CI builds all OSes and publishes.`);
git(["tag", tag]);
git(["push", "origin", tag]);

console.log(`Pushed ${tag}.`);
console.log("  Progress: https://github.com/bang0711/OpenGit/actions");
console.log(
  "  The release is created as a DRAFT — review and Publish it under Releases.",
);
