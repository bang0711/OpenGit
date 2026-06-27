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

This runs `next build` (standalone output), merges static assets via `scripts/prepare-standalone.mjs`, then packages with `electron-builder`. The packaged app runs the Next standalone server as a child process and points an Electron window at it. The standalone bundle (with its own `node_modules`) ships as an Electron **`extraResource`** at `resources/server` — `extraResources` copies `node_modules` verbatim, whereas the app `files` mapping strips it, which is why a plain `files` copy fails with `Cannot find module 'next'`.

### Build outputs (`release/`)

| File | What it is | Use |
|------|-----------|-----|
| `release/win-unpacked/OpenGit.exe` | Unpacked app, runs in place — **no install** | Fast local testing of a build |
| `release/OpenGit-Setup-<version>.exe` | NSIS installer (installs to `AppData\Local\Programs`, shortcuts) | Distribute to users |

Test a build with `win-unpacked\OpenGit.exe` first (no install/uninstall churn); both contain the same `resources\server`, so if the unpacked app boots clean, the installer will too.

Sanity-check the server runtime made it into a build before shipping:

```powershell
Test-Path 'release\win-unpacked\resources\server\node_modules\next\package.json'  # must be True
```

### Publishing a release

`release/` is git-ignored — the installer ships via **GitHub Releases**, not the repo (keeps history small). Build + sign locally, then attach the installer to a tagged release:

```bash
bun run electron:build      # produces release/OpenGit-Setup-<version>.exe (signed)
bun run release             # uploads it to GitHub Release v<version>
```

`bun run release` (`scripts/release.mjs`) reads the version from `package.json`, creates/updates the `v<version>` tag's release via the `gh` CLI, and uploads the installer. Prereqs: [`gh`](https://cli.github.com) installed + `gh auth login`, and the current commit pushed to origin. Bump the `version` in `package.json` before cutting a new release.

## Scripts

| Script | Does |
|--------|------|
| `dev` | Next dev server (browser) |
| `electron:dev` | Next dev + Electron window |
| `build` | `next build` |
| `electron:build` | Full packaged desktop build |
| `release` | Upload the built installer to a GitHub Release (`gh` required) |
| `lint` / `format` | Biome check / format |
| `licenses` | Regenerate `THIRD-PARTY-NOTICES.txt` |
