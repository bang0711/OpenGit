# OpenGit webhook relay

Bridges GitHub webhooks → OpenGit over WebSocket, so the PR page updates in real
time without polling. You host this somewhere with a public HTTPS URL.

## Run

```bash
npm init -y && npm install ws
WEBHOOK_SECRET=your-secret PORT=8787 node server.mjs
```

Put it behind a public HTTPS URL (a VPS + reverse proxy, Fly.io, Render, a Cloudflare
tunnel, etc.). WebSocket upgrades must be allowed on `/ws`.

## Configure the GitHub webhook

Repo → **Settings → Webhooks → Add webhook**

- **Payload URL:** `https://<your-host>/github`
- **Content type:** `application/json`
- **Secret:** the same `WEBHOOK_SECRET`
- **Events:** Pull requests, Issues (or "Send me everything")

## Point OpenGit at it

OpenGit → **GitHub → Settings → Relay URL:** `https://<your-host>` → Save.
Status flips to **Live**; opening/closing PRs updates the app within ~1s.

## How it works

- `POST /github` — verifies `X-Hub-Signature-256`, reads `repository.full_name`,
  forwards `{ repo, event, action }` to subscribed clients.
- `GET /ws?repo=owner/repo` — a client subscribes to one repository; only that repo's
  events are sent to it.
