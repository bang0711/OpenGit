# OpenGit

A desktop Git client in the spirit of GitKraken — a visual commit graph, branch/remote/stash management, staging and committing, interactive rebase, and side-by-side diffs. Built as a Next.js app wrapped in Electron; the UI is React, and all Git operations shell out to your local `git`.

## Features

- **Commit graph** — multi-color, lane-aware history with refs and checkout.
- **Working tree** — stage / unstage / discard, commit, amend, stash.
- **Branches & remotes** — checkout, merge, create local/remote branches, fetch / pull / push (with force-with-lease).
- **Interactive rebase** — pick / squash / fixup / drop per commit.
- **Diffs** — Azure-style side-by-side (with **syntax highlighting** via Prism) and unified views; Material file icons throughout.
- **Conflict resolver** for merges and rebases.
- **Themes** — switchable palettes (GitKraken, Dracula, Catppuccin Mocha, Nord, Tokyo Night, GitHub Dark, Zinc) via the topbar.
- **Live refresh** — the view re-reads repo state on window focus and while foregrounded, so edits show up without a manual reload.
- **Auto-update** — in-app "check for updates" (topbar ⟳) backed by GitHub Releases: download, then restart-to-install.

## Stack

- [Next.js](https://nextjs.org) (App Router, server actions/components that invoke `git`)
- React + Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (Radix primitives)
- [Electron](https://electronjs.org) desktop shell
- Material file icons + Prism syntax highlighting

All dependencies are permissive / MIT-compatible.

## Develop

Requires Node and a `git` on your `PATH`. This repo uses [Bun](https://bun.sh) for scripts (npm/pnpm also work).

```bash
bun install

# Browser only (Next dev server on :3000)
bun run dev

# Full desktop app (Next dev + Electron window)
bun run electron:dev
```

> **Note:** this project tracks a build of Next.js with breaking changes — see `AGENTS.md`. Read the guides under `node_modules/next/dist/docs/` before changing framework code.

## Build

```bash
# Packaged desktop installer (Windows NSIS / mac dmg / Linux AppImage)
bun run electron:build
```

This runs `next build` (standalone output), merges static assets via `scripts/prepare-standalone.mjs`, then packages with `electron-builder`. The packaged app runs the Next standalone server as a child process and points an Electron window at it.

Two packaging details worth knowing:

- **The server bundle ships via an `afterPack` hook** (`scripts/after-pack.cjs`), not the normal `files`/`extraResources` copy — electron-builder strips `node_modules` from those, which breaks `require('next')`. The hook copies `.next/standalone` verbatim (with its own `node_modules`) into `resources/server`, then prunes it to the runtime files.
- **Only `electron-updater` is a runtime `dependency`.** The main process needs it; everything else (next/react/…) is a `devDependency`, because the server bundle ships its own copies. This keeps the packaged app small (the whole root `node_modules` would otherwise be bundled).

`electron-builder` only builds for the **host OS** — running it on Windows produces Windows installers only. macOS `.dmg` can be built **only on a Mac** (Apple requirement, no cross-build); Linux `AppImage` builds on Linux. To produce all three at once, use the release workflow (below).

### Build outputs (`release/`)

| File | What it is | Use |
|------|-----------|-----|
| `release/win-unpacked/OpenGit.exe` | Unpacked app, runs in place — **no install** | Fast local testing of a build |
| `release/OpenGit-Setup-<version>.exe` | NSIS installer (to `AppData\Local\Programs`, shortcuts) | Distribute to users |
| `release/OpenGit-<version>-portable.exe` | Single self-contained exe — **runs without installing** | Users who don't want to install |
| `release/OpenGit-<version>.dmg` *(macOS host)* | macOS disk image | macOS users |
| `release/OpenGit-<version>.AppImage` *(Linux host)* | Linux AppImage | Linux users |

Test a build with `win-unpacked\OpenGit.exe` first (no install/uninstall churn); it contains the same `resources\server`, so if it boots clean, the installers will too.

Sanity-check the server runtime made it into a build before shipping:

```powershell
Test-Path 'release\win-unpacked\resources\server\node_modules\next\package.json'  # must be True
```

### Publishing a release

`release/` is git-ignored — installers ship via **GitHub Releases**. One command does everything:

```bash
# bump "version" in package.json, commit, then:
bun run release
```

`scripts/release.mjs` tags the current commit `v<version>` and pushes it (after checking the tree is clean and the tag is new). That tag push triggers `.github/workflows/release.yml`, which builds Windows / macOS / Linux installers on their respective runners, uploads them all to a draft GitHub Release, then — once **all three** succeed — flips it to **published** automatically. (Equivalent to `git tag v<version> && git push origin v<version>` — you can do that by hand too.) If any OS build fails, the release stays a draft so users never see a partial release.

`electron-updater` reads the per-OS `latest*.yml` (also uploaded) to power in-app updates. CI builds are **unsigned** (no certs), so users get SmartScreen / Gatekeeper warnings, and macOS auto-update won't apply (the dmg still runs) until the app is signed.

Local builds (`bun run electron:build`) are for **testing on your own OS** — they don't publish.

## Scripts

| Script | Does |
|--------|------|
| `dev` | Next dev server (browser) |
| `electron:dev` | Next dev + Electron window |
| `build` | `next build` |
| `electron:build` | Full packaged desktop build (host OS) |
| `electron:publish` | Build + publish to GitHub Releases (used by CI) |
| `release` | Tag `v<version>` + push → triggers the all-OS release workflow |
| `lint` / `format` | Biome check / format |
| `licenses` | Regenerate `THIRD-PARTY-NOTICES.txt` |
