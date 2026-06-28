// Copy of examples/webhook-relay/server.mjs, shown in the Settings page for
// one-click copy. Keep in sync with that file.
export const RELAY_CODE = `import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT) || 8787;
const SECRET = process.env.WEBHOOK_SECRET || "";
const subs = new Map(); // "owner/repo" -> Set<WebSocket>

function verify(body, signature) {
  if (!SECRET) return true;
  if (!signature) return false;
  const digest = \`sha256=\${createHmac("sha256", SECRET).update(body).digest("hex")}\`;
  const a = Buffer.from(digest), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/github") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (!verify(body, req.headers["x-hub-signature-256"]))
        return res.writeHead(401).end("bad signature");
      let p; try { p = JSON.parse(body.toString()); } catch { return res.writeHead(400).end(); }
      const repo = p?.repository?.full_name;
      const msg = JSON.stringify({ repo, event: req.headers["x-github-event"], action: p?.action });
      for (const ws of subs.get(repo) ?? []) if (ws.readyState === ws.OPEN) ws.send(msg);
      res.writeHead(204).end();
    });
    return;
  }
  res.writeHead(200).end("OpenGit relay up");
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws, req) => {
  const repo = new URL(req.url, "http://x").searchParams.get("repo");
  if (!repo) return ws.close();
  if (!subs.has(repo)) subs.set(repo, new Set());
  subs.get(repo).add(ws);
  ws.on("close", () => subs.get(repo)?.delete(ws));
});

server.listen(PORT, () => console.log("OpenGit relay on :" + PORT));`;

// Install command per package manager (for the install tabs).
export const INSTALL: { pm: string; cmd: string }[] = [
  { pm: "npm", cmd: "npm install ws" },
  { pm: "pnpm", cmd: "pnpm add ws" },
  { pm: "yarn", cmd: "yarn add ws" },
  { pm: "bun", cmd: "bun add ws" },
];
