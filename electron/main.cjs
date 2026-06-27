// Electron shell for opengit.
//
// The app is a full Next.js server (server actions + server components that
// shell out to `git`), so we do NOT static-export. Instead Electron runs the
// Next server and points a BrowserWindow at it:
//   - dev:  `next dev` on :3000 (started by the `electron:dev` script); we just
//           load it, retrying until it's up.
//   - prod: spawn the bundled `.next/standalone/server.js` as a Node child
//           (Electron's own binary in Node mode) on a free port, then load it.

const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const { createWriteStream, existsSync } = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const isDev = !app.isPackaged;
const DEV_URL = "http://localhost:3000";
// Window/taskbar icon (generated from src/app/icon.svg). In a packaged build the
// exe icon is embedded by electron-builder; this mainly covers the dev window.
const ICON = path.join(__dirname, "..", "build", "icon.ico");

let serverProc = null;
let logStream = null;

// GUI apps have no console, so write diagnostics to a file under userData
// (%APPDATA%/opengit/main.log on Windows). Check this if the app misbehaves.
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  try {
    if (!logStream) logStream = createWriteStream(path.join(app.getPath("userData"), "main.log"), { flags: "a" });
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

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0a0a",
    autoHideMenuBar: true,
    ...(existsSync(ICON) ? { icon: ICON } : {}),
    webPreferences: { contextIsolation: true },
  });

  // Open target=_blank / external links in the OS browser, not a new window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    loadWithRetry(win, DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    try {
      const port = await freePort();
      startProdServer(port);
      await waitForPort(port);
      await win.loadURL(`http://127.0.0.1:${port}`);
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
