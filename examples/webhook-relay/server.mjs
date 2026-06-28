// OpenGit webhook relay — bridges GitHub webhooks to the desktop app.
//
// GitHub can only POST webhooks to a public URL; a desktop app has none. This
// tiny relay accepts those POSTs and forwards them over WebSocket to connected
// OpenGit clients, filtered by repository.
//
//   npm init -y && npm install ws
//   WEBHOOK_SECRET=your-secret PORT=8787 node server.mjs
//
// Then point a GitHub webhook (repo → Settings → Webhooks) at:
//   https://<your-host>/github   (content-type: application/json, same secret)
// and paste  https://<your-host>  into OpenGit → GitHub → Settings.

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT) || 8787;
const SECRET = process.env.WEBHOOK_SECRET || "";

// repo (owner/repo) -> Set<WebSocket>
const subs = new Map();

function verify(body, signature) {
  if (!SECRET) return true; // no secret configured → skip verification
  if (!signature) return false;
  const digest = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/github") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (!verify(body, req.headers["x-hub-signature-256"])) {
        res.writeHead(401).end("bad signature");
        return;
      }
      let payload;
      try {
        payload = JSON.parse(body.toString("utf8"));
      } catch {
        res.writeHead(400).end("bad json");
        return;
      }
      const repo = payload?.repository?.full_name;
      const event = req.headers["x-github-event"];
      const msg = JSON.stringify({ repo, event, action: payload?.action });
      for (const ws of subs.get(repo) ?? []) {
        if (ws.readyState === ws.OPEN) ws.send(msg);
      }
      res.writeHead(204).end();
    });
    return;
  }
  res.writeHead(200).end("OpenGit relay up");
});

// WebSocket: clients connect to /ws?repo=owner/repo
const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (ws, req) => {
  const repo = new URL(req.url, "http://x").searchParams.get("repo");
  if (!repo) return ws.close();
  if (!subs.has(repo)) subs.set(repo, new Set());
  subs.get(repo).add(ws);
  ws.on("close", () => subs.get(repo)?.delete(ws));
});

server.listen(PORT, () => console.log(`OpenGit relay listening on :${PORT}`));
