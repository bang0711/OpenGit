// Copy the Next standalone server into the packaged app's resources verbatim.
//
// electron-builder strips node_modules from its own file copies (both `files`
// and `extraResources`), which breaks `require('next')` at runtime. Doing the
// copy here in afterPack — after the app dir is packed, before NSIS runs —
// bypasses all of that filtering, so server/node_modules ships intact.

const { cp, rm, readdir } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

// This (modified) Next mirrors the whole project root into .next/standalone,
// so the bundle carries .git/src/electron/etc. The server runtime only needs
// these — everything else is pruned so we don't ship source or git history.
const KEEP = new Set([
  "server.js",
  "package.json",
  ".next",
  "node_modules",
  "public",
]);

exports.default = async function afterPack(context) {
  const standalone = join(process.cwd(), ".next", "standalone");
  if (!existsSync(standalone)) {
    throw new Error("Missing .next/standalone — run the Next build first.");
  }
  // Resolves correctly per-platform (win/linux: <appOutDir>/resources,
  // mac: <appOutDir>/<App>.app/Contents/Resources).
  const resourcesDir = context.packager.getResourcesDir(context.appOutDir);
  const dest = join(resourcesDir, "server");

  await rm(dest, { recursive: true, force: true });
  await cp(standalone, dest, { recursive: true });

  for (const entry of await readdir(dest)) {
    if (!KEEP.has(entry)) {
      await rm(join(dest, entry), { recursive: true, force: true });
    }
  }
  console.log(`[after-pack] copied + pruned standalone -> ${dest}`);
};
