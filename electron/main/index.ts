import { createWriteStream, existsSync, statSync, type WriteStream } from "node:fs";
import { join } from "node:path";
import { app, BrowserWindow, shell } from "electron";
import { wireGithub } from "./github";
import { registerIpc } from "./ipc";
import { wireUpdater } from "./updater";
import { initWatch } from "./watch";

const isDev = !app.isPackaged;
const MAX_LOG_BYTES = 5 * 1024 * 1024;

// Window / taskbar / dock icon. Packaged apps use the icon embedded by
// electron-builder; in dev we point at the generated icons under build/.
// Windows wants .ico; macOS/Linux use .png.
const ICON = join(
  process.cwd(),
  "build",
  process.platform === "win32" ? "icon.ico" : "icon.png",
);

let logStream: WriteStream | null = null;
function log(...args: unknown[]): void {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  try {
    if (!logStream) {
      const p = join(app.getPath("userData"), "main.log");
      let flags = "a";
      try {
        if (existsSync(p) && statSync(p).size > MAX_LOG_BYTES) flags = "w";
      } catch {}
      logStream = createWriteStream(p, { flags });
    }
    logStream.write(line);
  } catch {}
  process.stdout.write(line);
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  // Open target=_blank / external links in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // electron-vite serves the renderer over HTTP in dev, bundles it in prod.
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
  return win;
}

app.whenReady().then(() => {
  // Windows taskbar groups by AppUserModelID; without it (in dev) the taskbar
  // shows electron.exe's icon instead of the window icon.
  if (process.platform === "win32") app.setAppUserModelId("com.opengit.desktop");
  // macOS dock icon (ignored from BrowserWindow.icon). Packaged builds use .icns.
  if (process.platform === "darwin" && app.dock && existsSync(ICON)) {
    app.dock.setIcon(ICON);
  }
  registerIpc();
  const win = createWindow();
  initWatch(win);
  wireUpdater(isDev, log);
  wireGithub(log);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
