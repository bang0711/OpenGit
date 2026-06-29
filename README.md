# OpenGit

A desktop Git client in the spirit of GitKraken — a visual commit graph,
branch/remote/tag/stash management, staging and committing, interactive rebase,
side-by-side diffs, conflict resolution, and **GitHub integration** (sign in,
clone your repos, manage pull requests). A React single-page app in a **Tauri**
window (native OS webview); all Git operations run in a **Rust backend** via your
local `git` and are reached from the UI through Tauri commands.

## Features

- **Commit graph** — multi-color, lane-aware history with refs, checkout, and search.
- **Working tree** — stage / unstage / discard (file + hunk level), commit, amend, stash.
- **Branches & remotes** — checkout, merge, create / delete / rename local & remote branches, fetch / pull / push (force-with-lease).
- **Tags** — create, delete (local + remote), fetch remote tags.
- **Interactive rebase** — pick / squash / fixup / drop per commit.
- **Diffs** — Azure-style side-by-side (with **Prism syntax highlighting**) and unified views, Material file icons, instant client-side file switching.
- **Conflict resolver** — ours/theirs/manual, for merges and rebases. **Blame** view.
- **Live refresh** — the backend watches the repo (the `notify` crate) and pushes a `repo:changed` event, so edits show up without a manual reload.
- **GitHub** — sign in (OAuth Device Flow or token), **clone any repo from your account**, and a full **pull-request** workspace: list/filter, per-file diffs, checks, reviews & comments, merge / close, create PRs with reviewers, plus collaborators / issues / branches. Optional **real-time** PR updates via a self-hosted webhook relay.
- **Updates + version picker** — the **Versions** button checks GitHub Releases and lets you download **and install any version** (up or downgrade), cross-platform.

## GitHub integration

Sign in once (the token is stored in your OS keychain and shared across clone +
the PR workspace) and OpenGit can clone your repositories and manage pull requests.

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
   OPENGIT_GH_CLIENT_ID=Ov23li… bun run build
   ```

The client id is **public** (device flow has no secret) and is baked into the
binary at build time (`src-tauri/build.rs` → `option_env!("OPENGIT_GH_CLIENT_ID")`,
read in `src-tauri/src/github.rs`), so it stays out of the source. In `tauri dev`
the same env var is read at runtime as a fallback. Without it, the **Use a
personal access token** fallback still works.

### Real-time pull requests (optional)

By default the PR page refreshes on demand. For live push updates, run the tiny
self-hosted webhook relay in [`examples/webhook-relay/`](./examples/webhook-relay/)
and paste its URL into **GitHub → Settings** in the app — GitHub webhooks then
stream to OpenGit over WebSocket (it filters by repo). See that folder's README.

## Architecture

A Tauri app: a Rust backend + a web renderer, bridged by Tauri commands/events.

- **Backend** (`src-tauri/src/`) — Rust. `git.rs` shells out to `git`; `repo_ops.rs`
  exposes the ~63 repo operations (dispatched by name from the `api_call` command);
  `state.rs` persists the active repo + recent list (JSON in the app data dir);
  `repo_registry.rs`, `repo_lock.rs`, `diff_hunks.rs`, `path_utils.rs`, `watch.rs`
  (the `notify` file watcher), `updater.rs`, `github.rs` (GitHub REST + OAuth device
  flow + ETag cache), and `secrets.rs` (token in the OS keychain via `keyring`)
  round it out. Three dispatcher commands — `api_call`, `gh_call`, `updater_call` —
  take `{ name, args }` and return the JSON shapes in `shared/types.ts`.
- **Bridge** (`src/bridge/`) — a thin JS shim that builds `window.api`,
  `window.github`, and `window.updater` on top of Tauri `invoke()` + `listen()`,
  preserving the same surface so no renderer call site changed.
- **Renderer** (`src/`) — React 19 + React Router. Route **loaders** fetch via
  `window.api`; a mutation calls `window.api.X()` then revalidates the loader.
- **Shared** (`shared/`) — the domain types + the typed `Api` / `Updater` /
  `Github` contracts used by the renderer and the bridge.

## Stack

- [Tauri 2](https://tauri.app) (Rust backend + native OS webview) + [Vite](https://vitejs.dev)
- React 19 + [React Router](https://reactrouter.com)
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (Radix primitives)
- Prism (highlighting) + material-file-icons
- [Vitest](https://vitest.dev) (renderer) + `cargo test` (backend)

All dependencies are permissive / MIT-compatible.

> **Font:** the UI uses **Dank Mono** (commercial). Drop your licensed
> `DankMono-{Regular,Bold,Italic}.otf` into `src/public/fonts/`; without them it
> falls back to the system monospace stack.

## Develop

Prerequisites:

- A `git` on your `PATH`.
- [Bun](https://bun.sh) for the renderer + Tauri CLI.
- The [Rust toolchain](https://rustup.rs) (`rustup`, MSVC target on Windows) and
  Tauri's system deps. See [Tauri prerequisites](https://tauri.app/start/prerequisites/):
  - **Windows:** Visual Studio C++ Build Tools + the WebView2 runtime (preinstalled on Win11).
  - **macOS:** Xcode Command Line Tools.
  - **Linux:** `webkit2gtk-4.1`, `libgtk-3`, `libayatana-appindicator3`, `librsvg2` (see the release workflow for exact apt packages).

```bash
bun install
bun run dev        # tauri dev: native window + Vite HMR + the Rust backend
```

In dev, in-app auto-update finds newer releases but the **version picker**
(Versions button) is the full path — it downloads + launches the chosen installer.

## Build

```bash
bun run build      # tauri build: builds the Vite renderer, then the Rust app + installers
```

Tauri builds for the **host OS** only; the macOS `.dmg` **must** be built on a
Mac. To produce all three at once, use the release workflow below.

### Build outputs

| File | OS | Notes |
|------|----|-------|
| `bundle/nsis/OpenGit_<version>_x64-setup.exe` | Windows | NSIS installer |
| `opengit.exe` *(in `target/release/`)* | Windows | **portable** — runs without installing (needs the WebView2 runtime) |
| `bundle/dmg/OpenGit_<version>_*.dmg` *(mac host)* | macOS | disk image |
| `bundle/appimage/OpenGit_<version>_amd64.AppImage` *(linux host)* | Linux | single-file app |

(All under `src-tauri/target/release/`.) The release workflow renames the portable
exe to `OpenGit-<version>-portable.exe` when it uploads it.

## Test

```bash
bun run test         # vitest run (renderer)
bun run test:watch
bun run typecheck    # tsc on the renderer (tsconfig.web.json)
cargo test --manifest-path src-tauri/Cargo.toml   # backend
```

Renderer tests live in `tests/renderer/` (pure libs: diff parser, file-tree
builder, commit-graph lanes, language detection, the routing href bridge,
repo-path split). The backend's pure logic is unit-tested inline in Rust
(`path_utils`, `diff_hunks`). UI components and thin command passthroughs are not
unit tested by design.

## Publishing a release

Installers ship via **GitHub Releases**. Keep the version in sync across
`package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, then:

```bash
# bump "version" in those three files, commit, then:
bun run release
```

`scripts/release.mjs` tags `v<version>` (from `package.json`) and pushes it
(guards: clean tree, new tag; `--force` re-releases the same version). The tag
triggers `.github/workflows/release.yml`: it **runs tests first**, then builds
Windows / macOS / Linux with [`tauri-action`](https://github.com/tauri-apps/tauri-action)
on their runners, uploads to a draft Release, and once all three succeed flips it
to **published** (no partial releases). Set the repo/org Actions variable
`OPENGIT_GH_CLIENT_ID` so released installers ship with one-click login.

CI builds are **unsigned** — users see SmartScreen / Gatekeeper warnings until
the app is code-signed.

## Scripts

| Script | Does |
|--------|------|
| `dev` | Tauri app with Vite HMR (`tauri dev`) |
| `dev:vite` | Just the Vite renderer dev server |
| `build` | Full packaged desktop build for the host OS (`tauri build`) |
| `build:vite` | Just the renderer production build (`dist/`) |
| `tauri` | The Tauri CLI passthrough |
| `release` | Tag `v<version>` + push → triggers the all-OS release workflow |
| `test` / `test:watch` | Vitest (renderer) |
| `typecheck` | `tsc` on the renderer project |
| `lint` / `format` | Biome check / format |
| `licenses` | Regenerate `THIRD-PARTY-NOTICES.txt` |

## License

[MIT](./LICENSE) © Chau Chan Bang
