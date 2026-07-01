# OpenGit

A desktop Git client in the spirit of GitKraken — a visual commit graph,
branch/remote/tag/stash management, staging and committing, interactive rebase,
side-by-side diffs, conflict resolution, and **multi-host integration** —
GitHub, GitLab, Azure DevOps (sign in, clone your repos, manage
pull/merge requests). A React single-page app in a **Tauri**
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
- **Git hosts** — sign in to **GitHub or GitLab** (browser OAuth or token; the host is auto-detected from the repo's origin — **Azure DevOps coming soon**), **clone any repo from your account**, and a full **pull/merge-request** workspace: list/filter, per-file diffs, checks, reviews & comments, merge / close, create with reviewers, plus collaborators / issues / branches.
- **Updates + version picker** — the **Versions** button checks GitHub Releases and lets you download **and install any version** (up or downgrade), cross-platform.

## Upgrading from the Electron version

OpenGit moved from Electron to **Tauri** (much smaller, native webview). If you ran
an older Electron build, you must **reinstall once** — the Electron auto-updater
can't cross over to a Tauri release (different update mechanism; it looks for a
`latest.yml` the Tauri builds don't produce, so it 404s on update-check).

One-time steps:

1. **Uninstall** the old OpenGit (Settings → Apps → OpenGit; it lived in
   `…\AppData\Local\Programs\OpenGit`).
2. **Install** the new `OpenGit-Setup-<version>.exe`.

After that, in-app updates work again. Notes:

- **Sign in again** — the GitHub token moved from an encrypted file to the OS
  keychain (Windows Credential Manager / macOS Keychain / libsecret).
- **Recent-repos list resets once** — app data moved to a new per-app folder.
- The two installs don't collide (different install dirs), but the old one keeps
  failing its update-check until you remove it.

## Git host integration

OpenGit talks to **GitHub, GitLab, and Azure DevOps** — the active
host is detected from the open repo's `origin`, so the same pull/merge-request
workspace works everywhere. Sign in from the sidebar **Accounts** panel; each
token is stored in your OS keychain (never in app files) and shared across clone
+ the PR workspace.

Every host offers a **paste-a-token** option that always works. Registering an
OAuth app additionally enables one-click **browser sign-in** ("Sign in with …").

### OAuth apps (one-time, for the maintainer)

Client ids/tenant are **public** and baked into the binary at build time
(`src-tauri/build.rs` → `option_env!(KEY)`, read in each provider module); in
`tauri dev` the same env vars are read at runtime. Put them in the repo-root
`.env` (see `.env.sample`) or export them before a build. Any provider left
blank falls back to paste-a-token.

| Host | Flow | Env |
|------|------|-----|
| GitHub | OAuth device flow | `OPENGIT_GH_CLIENT_ID` |
| GitLab | OAuth device flow | `OPENGIT_GITLAB_CLIENT_ID` |
| Azure DevOps _(coming soon)_ | Entra device code | `OPENGIT_AZURE_CLIENT_ID` (+ `OPENGIT_AZURE_TENANT`) |

**GitHub** — Settings → Developer settings → **OAuth Apps → New OAuth App**.
Homepage + callback URL: any valid URL (device flow never redirects, both fields
required). Tick **Enable Device Flow**. No secret. Copy the **Client ID**.

**GitLab** — [Settings → Applications](https://gitlab.com/-/user_settings/applications)
→ **Add new application**. Redirect URI: `http://localhost` (required, unused).
Check **Device authorization grant**, uncheck **Confidential**, scope **`api`**.
Copy the **Application ID**.

**Azure DevOps** _(coming soon — sign-in is disabled in the app; the backend is
wired and ready to flip on)_ — register an app in **Microsoft Entra ID** (portal.azure.com →
App registrations → New registration; multitenant, no redirect URI). Copy the
**Application (client) ID**. In **Authentication**, set **Allow public client
flows = Yes**. In **API permissions**, add **Azure DevOps → user_impersonation**.
Leave `OPENGIT_AZURE_TENANT` blank (defaults `organizations`) or set a tenant
GUID to lock to one org. Your Azure DevOps org must allow OAuth (Org settings →
Policies → *Third-party application access via OAuth*). Note: Entra access tokens
expire ~1h — you re-sign-in until refresh-token support lands.

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
to **published** (no partial releases). For one-click login in released
installers, set the OAuth config as repo/org **Actions variables** —
`OPENGIT_GH_CLIENT_ID`, `OPENGIT_GITLAB_CLIENT_ID`, `OPENGIT_AZURE_CLIENT_ID`,
`OPENGIT_AZURE_TENANT`. Unset ones bake empty (paste-a-token fallback). See
**Git host integration** above for how to obtain each.

### Code signing (Windows)

CI builds are **unsigned by default** — users see SmartScreen warnings (and
managed/corporate machines may block them outright). To sign, add two repo
**Actions secrets** and the release/build workflows sign the exe + NSIS
installer automatically (skipped when the secret is absent):

| Secret | Value |
|--------|-------|
| `WINDOWS_CERTIFICATE` | your code-signing cert as a **base64-encoded `.pfx`** |
| `WINDOWS_CERTIFICATE_PASSWORD` | the `.pfx` password |

Encode the cert: `base64 -w0 cert.pfx` (or PowerShell
`[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx"))`), paste the
output as the `WINDOWS_CERTIFICATE` secret. The workflow imports it, reads the
thumbprint, and injects it into `tauri.conf.json` at build time (timestamp via
DigiCert, SHA-256). Use an **EV / OV** cert (or Azure Trusted Signing) for
SmartScreen reputation; self-signed satisfies the bundler but browsers still
warn. macOS/Linux are unaffected.

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
