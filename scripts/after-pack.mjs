// electron-builder afterPack hook: delete runtime files the app never uses,
// trimming the installed footprint. Runs once per target platform with the
// packed (but not yet installer-wrapped) app directory.
//
// dxcompiler.dll / dxil.dll are the DirectX shader compiler used by WebGPU and
// advanced WebGL. A git client UI renders none of that, so dropping them saves
// ~26 MB with no visible effect. SwiftShader + ANGLE (libGLESv2/libEGL) are
// KEPT — they're the software-rendering fallback weak / no-GPU machines rely on.

import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

// Files safe to remove, per platform prefix. Sizes are approximate.
const WIN_REMOVE = ["dxcompiler.dll", "dxil.dll"];

export default async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;
  if (electronPlatformName !== "win32") return;

  let freed = 0;
  for (const name of WIN_REMOVE) {
    const p = join(appOutDir, name);
    try {
      freed += (await stat(p)).size;
      await rm(p);
      console.log(`afterPack: removed ${name}`);
    } catch {
      // Not present in this Electron build — ignore.
    }
  }
  if (freed) console.log(`afterPack: freed ${(freed / 1e6).toFixed(1)} MB`);
}
