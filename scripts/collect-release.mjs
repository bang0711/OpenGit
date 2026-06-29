// Post-build: gather the installers + portable exe Tauri scatters under
// src-tauri/target/release/ into a flat ./release/ folder at the project root,
// with the old electron-style names. Runs after `tauri build`.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const { version } = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const base = join(root, "src-tauri", "target", "release");
const out = join(root, "release");
// Wipe release/ first so it only ever holds the current build's artifacts.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

/** Copy the first file in `dir` matching `test` to release/<destName>. */
function grab(dir, test, destName) {
  const full = join(base, dir);
  if (!existsSync(full)) return;
  const hit = readdirSync(full).find(test);
  if (!hit) return;
  copyFileSync(join(full, hit), join(out, destName));
  console.log(`  ${destName}`);
}

console.log(`Collecting installers → release/ (v${version})`);
// Windows: NSIS installer + portable raw exe.
grab("bundle/nsis", (f) => /-setup\.exe$/i.test(f), `OpenGit-Setup-${version}.exe`);
grab(".", (f) => f === "opengit.exe", `OpenGit-${version}-portable.exe`);
// macOS: dmg.
grab("bundle/dmg", (f) => /\.dmg$/i.test(f), `OpenGit-${version}.dmg`);
// Linux: AppImage.
grab("bundle/appimage", (f) => /\.AppImage$/i.test(f), `OpenGit-${version}.AppImage`);
console.log("Done.");
