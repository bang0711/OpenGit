// Electron shell for opengit.
//
// The app is a full Next.js server (server actions + server components that
// shell out to `git`), so we do NOT static-export. Instead Electron runs the
// Next server and points a BrowserWindow at it:
//   - dev:  `next dev` on :3000 (started by the `electron:dev` script); we just
//           load it, retrying until it's up.
//   - prod: spawn the bundled `.next/standalone/server.js` as a Node child
//           (Electron's own binary in Node mode) on a free port, then load it.

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const { createWriteStream, existsSync, statSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const isDev = !app.isPackaged;
const DEV_URL = "http://localhost:3000";
// Window/taskbar icon (generated from src/app/icon.svg). In a packaged build the
// exe icon is embedded by electron-builder; this mainly covers the dev window.
const ICON = path.join(__dirname, "..", "build", "icon.ico");

let serverProc = null;
let logStream = null;

// Keep the diagnostic log small so it never bloats the user's disk. 5 MB is far
// more than enough for the few lines we write per launch; older entries are
// dropped (truncate, start fresh) once the file grows past this.
const MAX_LOG_BYTES = 5 * 1024 * 1024;

// GUI apps have no console, so write diagnostics to a file under userData
// (%APPDATA%/opengit/main.log on Windows). Check this if the app misbehaves.
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  try {
    if (!logStream) {
      const logPath = path.join(app.getPath("userData"), "main.log");
      // Append unless the existing file is over the cap — then truncate it.
      let flags = "a";
      try {
        if (existsSync(logPath) && statSync(logPath).size > MAX_LOG_BYTES) {
          flags = "w";
        }
      } catch {}
      logStream = createWriteStream(logPath, { flags });
    }
    logStream.write(line);
  } catch {}
  process.stdout.write(line);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForPort(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error("server timeout"));
        else setTimeout(tick, 200);
      });
    };
    tick();
  });
}

function startProdServer(port) {
  // The Next standalone bundle ships verbatim as an extraResource (to:
  // "server"), so server.js + its self-contained node_modules land at
  // <resources>/server. extraResources copies node_modules as-is — unlike the
  // app `files` mapping, which strips node_modules. server.js reads PORT/HOSTNAME.
  const appDir = path.join(process.resourcesPath, "server");
  const serverJs = path.join(appDir, "server.js");
  log("starting server:", serverJs, "exists:", existsSync(serverJs), "port:", port);

  serverProc = spawn(process.execPath, [serverJs], {
    cwd: appDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProc.stdout.on("data", (d) => log("[server]", d.toString().trim()));
  serverProc.stderr.on("data", (d) => log("[server:err]", d.toString().trim()));
  serverProc.on("error", (e) => log("server spawn error:", e.message));
  serverProc.on("exit", (code) => log("server exited with code", code));
}

// Shown instantly while the Next server boots, so the window is never a blank
// rectangle during the (multi-second) cold start. The bar advances at the real
// startup milestones (Next gives no finer progress signal); main drives it via
// window.__p(percent). Returns a promise that resolves when the splash is shown.
function showSplash(win) {
  // Plain HTML/CSS styled to match shadcn's Progress (rounded-full track +
  // primary indicator) — it can't be the React component, since this renders
  // before the app/React exists. Colors match the default (GitKraken) theme.
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;height:100vh;display:flex;flex-direction:column;gap:20px;align-items:center;justify-content:center;background:#1b2b34;color:#e6edf3;font-family:system-ui,sans-serif">
    <div style="font-size:14px;font-weight:600;letter-spacing:.01em">OpenGit</div>
    <div style="position:relative;width:220px;height:8px;background:rgba(26,188,156,0.2);border-radius:9999px;overflow:hidden">
      <div id="bar" style="position:absolute;inset:0;width:8%;background:#1abc9c;border-radius:9999px;transition:width .5s ease"></div>
    </div>
    <div style="font-size:12px;color:#8aa1ad">Starting…</div>
    <script>window.__p=function(p){var b=document.getElementById('bar');if(b)b.style.width=p+'%'}</script>
  </body>`;
  return win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

// Move the splash progress bar (best-effort; ignored once the app has loaded).
function setSplashProgress(win, pct) {
  if (win.isDestroyed()) return;
  win.webContents
    .executeJavaScript(`window.__p && window.__p(${pct})`)
    .catch(() => {});
}

function showError(win, message) {
  const html = `<body style="background:#0a0a0a;color:#e5e5e5;font-family:system-ui;padding:2rem">
    <h2>opengit failed to start</h2>
    <pre style="white-space:pre-wrap;color:#f87171">${message}</pre>
    <p style="color:#a3a3a3">See the log at: ${path.join(app.getPath("userData"), "main.log")}</p>
  </body>`;
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function loadWithRetry(win, url) {
  win.loadURL(url).catch(() => {});
  // next dev may not be ready when Electron starts — retry on failure.
  win.webContents.on("did-fail-load", () => {
    if (!win.isDestroyed()) setTimeout(() => win.loadURL(url).catch(() => {}), 500);
  });
}

// Auto-update, driven from the React UI over IPC (preload exposes `window.updater`).
// The renderer triggers check/download/install; we stream progress + results back
// on the "updater:event" channel. Reads the feed from app-update.yml, generated by
// electron-builder from `build.publish`. Registered once for the app's lifetime.
let updaterWired = false;
function wireUpdater() {
  if (updaterWired) return;
  updaterWired = true;

  const emit = (payload) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send("updater:event", payload);
    }
  };

  // Handlers are always registered so the renderer never hits "no handler".
  // In dev there's no packaged app to update, so they no-op / report latest.
  ipcMain.handle("updater:check", async () => {
    if (isDev) return emit({ type: "not-available" });
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      emit({ type: "error", message: e.message });
    }
  });
  ipcMain.handle("updater:download", () => {
    if (isDev) return;
    autoUpdater
      .downloadUpdate()
      .catch((e) => emit({ type: "error", message: e.message }));
  });
  ipcMain.handle("updater:install", () => {
    if (!isDev) autoUpdater.quitAndInstall();
  });

  if (isDev) return; // real auto-update only runs in the packaged app

  autoUpdater.autoDownload = false; // user decides when to download
  autoUpdater.logger = { info: log, warn: log, error: log, debug: () => {} };
  autoUpdater.on("update-available", (i) =>
    emit({ type: "available", version: i.version }),
  );
  autoUpdater.on("update-not-available", () => emit({ type: "not-available" }));
  autoUpdater.on("download-progress", (p) =>
    emit({ type: "progress", percent: Math.round(p.percent) }),
  );
  autoUpdater.on("update-downloaded", (i) =>
    emit({ type: "downloaded", version: i.version }),
  );
  autoUpdater.on("error", (e) =>
    emit({ type: "error", message: e?.message || String(e) }),
  );

  // Quiet check on launch so the UI can show an "update available" indicator.
  // Swallow errors silently — a missing latest.yml (e.g. the latest published
  // release predates auto-update) is benign and shouldn't spam the log.
  autoUpdater.checkForUpdates().catch(() => {});
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Open target=_blank / external links in the OS browser, not a new window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Register the updater IPC handlers (dev + prod) so the renderer can always
  // invoke them; the real auto-update logic only runs in the packaged app.
  wireUpdater();

  if (isDev) {
    loadWithRetry(win, DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    // Instant feedback while the server cold-starts; bar advances at each
    // real milestone (Next exposes no finer progress).
    await showSplash(win);
    try {
      setSplashProgress(win, 20);
      const port = await freePort();
      startProdServer(port); // server process spawned
      setSplashProgress(win, 45);
      await waitForPort(port); // server is listening / ready
      setSplashProgress(win, 80);
      await win.loadURL(`http://127.0.0.1:${port}`); // app loaded → replaces splash
      log("loaded app on port", port);
    } catch (e) {
      log("failed to start:", e.message);
      showError(win, e.message);
    }
  }
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("quit", () => {
  if (serverProc) serverProc.kill();
});
