# OpenGit

A desktop Git client in the spirit of GitKraken — a visual commit graph,
branch/remote/tag/stash management, staging and committing, interactive rebase,
side-by-side diffs, conflict resolution, and **GitHub integration** (sign in,
clone your repos, manage pull requests). A React single-page app in an Electron
window; all Git operations run in the Electron **main process** via your local
`git` and are reached from the UI over IPC.

## Features

- **Commit graph** — multi-color, lane-aware history with refs, checkout, and search.
- **Working tree** — stage / unstage / discard (file + hunk level), commit, amend, stash.
- **Branches & remotes** — checkout, merge, create / delete / rename local & remote branches, fetch / pull / push (force-with-lease).
- **Tags** — create, delete (local + remote), fetch remote tags.
- **Interactive rebase** — pick / squash / fixup / drop per commit.
- **Diffs** — Azure-style side-by-side (with **Prism syntax highlighting**) and unified views, Material file icons, instant client-side file switching.
- **Conflict resolver** — ours/theirs/manual, for merges and rebases. **Blame** view.
- **Live refresh** — the main process watches the repo (chokidar) and pushes changes over IPC, so edits show up without a manual reload.
- **GitHub** — sign in (OAuth Device Flow or token), **clone any repo from your account**, and a full **pull-request** workspace: list/filter, per-file diffs, checks, reviews & comments, merge / close, create PRs with reviewers, plus collaborators / issues / branches. Optional **real-time** PR updates via a self-hosted webhook relay.
- **Updates + version picker** — the **Versions** button checks GitHub Releases and lets you download **and auto-install any version** (up or downgrade), cross-platform.

## GitHub integration

Sign in once (the encrypted token is shared across clone + the PR workspace) and
OpenGit can clone your repositories and manage pull requests.

### Sign-in & the OAuth App (one-time, for the maintainer)

Login uses GitHub's **OAuth Device Flow** — no client secret, no redirect
server. Like GitKraken, OpenGit ships its own OAuth App so end users just click
**Sign in with GitHub**. To enable that, register the app once:

1. GitHub → Settings → Developer settings → **OAuth Apps → New OAuth App**.
2. **Homepage URL** and **Authorization callback URL**: any valid URL (device
   flow never redirects, but both fields are required) — e.g. your repo URL.
3. Tick **Enable Device Flow**. Do **not** create a client secret.
4. Copy the **Client ID** and build with it set:

   ```bash
   OPENGIT_GH_CLIENT_ID=Ov23li… bun run electron:build
   ```

The client id is **public** (device flow has no secret) and is injected at build
time (`electron.vite.config.ts` → `__GH_CLIENT_ID__`), so it stays out of the
source. Without it, the **Use a personal access token** fallback still works.

### Real-time pull requests (optional)

By default the PR page refreshes on demand. For live push updates, run the tiny
self-hosted webhook relay in [`examples/webhook-relay/`](./examples/webhook-relay/)
and paste its URL into **GitHub → Settings** in the app — GitHub webhooks then
stream to OpenGit over WebSocket (it filters by repo). See that folder's README.

## Architecture

Electron's two processes, bridged by IPC:

- **Main** (`electron/main/`) — Node.js. `git.ts` shells out to `git`; `handlers.ts` exposes ~55 operations; `ipc.ts` registers them; `state.ts` persists the active repo + recent list (a JSON file in `userData`); `watch.ts` (chokidar), `updater.ts`, `github.ts` (GitHub REST + OAuth device flow), and `secrets.ts` (token encrypted via Electron `safeStorage`) round it out.
- **Preload** (`electron/preload/`) — `contextBridge` exposes `window.api` (git ops), `window.updater`, and `window.github` (PRs, auth, clone list).
- **Renderer** (`src/`) — React 19 + React Router. Route **loaders** fetch via `window.api`; a mutation just calls `window.api.X()` then revalidates the loader.
- **Shared** (`shared/`) — the domain types + the typed `Api` / `Updater` / `Github` contracts used by all three.

## Stack

- [Electron](https://electronjs.org) + [electron-vite](https://electron-vite.org) (bundles main / preload / renderer)
- React 19 + [React Router](https://reactrouter.com) + [Vite](https://vitejs.dev)
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (Radix primitives)
- Prism (highlighting) + material-file-icons
- [Vitest](https://vitest.dev) for tests

All dependencies are permissive / MIT-compatible.

> **Font:** the UI uses **Dank Mono** (commercial). Drop your licensed
> `DankMono-{Regular,Bold,Italic}.otf` into `src/public/fonts/`; without them it
> falls back to the system monospace stack.

## Develop

Requires a `git` on your `PATH`. Uses [Bun](https://bun.sh).

```bash
bun install        # also downloads the Electron binary (trusted postinstall)
bun run dev        # electron-vite: Electron window + Vite HMR + DevTools
```

In dev the updater is stubbed (you can't update an unpackaged app), but the
**version picker** still works (it downloads + launches the chosen installer).

## Build

```bash
bun run electron:build   # generate-icons → licenses → electron-vite build → electron-builder
```

`electron-vite build` outputs `out/{main,preload,renderer}`; `electron-builder`
packages it (`asar` enabled). No Next server, no standalone bundle — startup is
instant. `electron-builder` only builds for the **host OS**; macOS `.dmg`
**must** be built on a Mac. To produce all three at once, use the release
workflow below.

### Build outputs (`release/`)

| File | OS | Notes |
|------|----|-------|
| `OpenGit-Setup-<version>.exe` | Windows | NSIS installer (auto-updating) |
| `OpenGit-<version>-portable.exe` | Windows | runs without installing |
| `OpenGit-<version>.dmg` *(mac host)* | macOS | disk image |
| `OpenGit-<version>.AppImage` *(linux host)* | Linux | single-file app |
| `release/win-unpacked/OpenGit.exe` | Windows | unpacked app for fast local testing |

## Test

```bash
bun run test         # vitest run
bun run test:watch
bun run typecheck    # tsc on both tsconfig.node + tsconfig.web
```

Tests live in `tests/` — `tests/renderer/` (pure renderer libs: diff parser,
file-tree builder, commit-graph lanes, language detection, the routing href
bridge, repo-path split) and `tests/main/` (the **git layer** as real temp-repo
integration over `git.ts`, plus the hunk splitter, clone-auth / drive-root /
GitHub-remote parsers). UI components and thin IPC passthroughs are not unit
tested by design.

## Publishing a release

`release/` is git-ignored — installers ship via **GitHub Releases**. One command:

```bash
# bump "version" in package.json, commit, then:
bun run release
```

`scripts/release.mjs` tags `v<version>` and pushes it (guards: clean tree, new
tag; `--force` re-releases the same version). The tag triggers
`.github/workflows/release.yml`: it **runs tests first**, then builds Windows /
macOS / Linux on their runners, uploads to a draft Release, and once all three
succeed flips it to **published**. If a build fails it stays a draft (no partial
release). `.github/workflows/ci.yml` runs typecheck + tests on every push/PR.

CI builds are **unsigned** — users see SmartScreen / Gatekeeper warnings until
the app is code-signed.

## Scripts

| Script | Does |
|--------|------|
| `dev` | Electron app with Vite HMR (electron-vite dev) |
| `build` | `electron-vite build` (out/) |
| `electron:build` | Full packaged desktop build (host OS) |
| `electron:publish` | Build + publish to GitHub Releases (used by CI) |
| `release` | Tag `v<version>` + push → triggers the all-OS release workflow |
| `test` / `test:watch` | Vitest |
| `typecheck` | `tsc` on the node + web projects |
| `lint` / `format` | Biome check / format |
| `icons` | Regenerate `build/icon.{ico,png}` from `src/app/icon.svg` |
| `licenses` | Regenerate `THIRD-PARTY-NOTICES.txt` |

## License

[MIT](./LICENSE) © Chau Chan Bang
