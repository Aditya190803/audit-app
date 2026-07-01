# Agent & maintainer guide — releases

This repo is **Bank Audit App** (`aditya190803/audit-app`): Electron + Python (FastAPI), Windows installer via GitHub Actions on version tags.

**Package manager:** [Bun](https://bun.sh) only (`bun install`, `bun run …`, lockfile `bun.lock`). Do not add `pnpm-workspace.yaml` or pnpm lockfiles; CI and local release scripts use Bun.

## Release philosophy (faster, fewer surprises)

**Do expensive work once on your machine, then tag.** Pushing `v*.*.*` triggers CI that repeats tests + PyInstaller + NSIS (~10–12 minutes). That is wasteful if you have not already validated locally.

| Phase | Where | What |
|--------|--------|------|
| **Develop** | Local | `bun run dev`, `bun run release:local:test` or `test-backend` only for matching/parser changes |
| **Pre-release gate** | Local | Full checks + production build artifacts (see checklist below) |
| **Ship** | GitHub | Push tag → Actions builds installer + publishes Release (or upload artifacts yourself) |

**Good idea:** Run the full pre-release checklist locally, fix failures, **then** bump version, commit, tag, and push. CI becomes a **packaging/publish safety net**, not your first time running pytest or PyInstaller.

**Caveat:** Today `.github/workflows/release.yml` still runs `verify:prod` on the runner. That duplicates local work but catches “works on my PC” drift. A future improvement is a **package-only** workflow when local `verify:prod` already passed (e.g. manual workflow with prebuilt artifacts). Until then, local gate + tag is still the right habit.

---

## Pre-release checklist (required before `git tag` / push tag)

Complete **in order**. Do not tag until every step passes.

1. **Version**
   - [ ] `package.json` `version` matches intended tag (e.g. `1.1.6` → tag `v1.1.6`).

2. **Environment**
   - [ ] Copy `.env.local.example` → `.env.local` (gitignored) if missing.
   - [ ] `GITHUB_REPOSITORY=aditya190803/audit-app` (or your fork).
   - [ ] Optional: set `UPDATE_FEED_URL` to `https://github.com/aditya190803/audit-app/releases/download/v{VERSION}`.

3. **Dependencies (cached after first run)**
   - [ ] `bun run release:local:deps`  
     or `node scripts/local-release.js deps`

4. **Tests & production verification (same as CI gate)**
   - [ ] `bun run release:local:test` — typecheck + frontend smoke + **pytest**  
     **or** full gate:  
   - [ ] `node scripts/local-release.js test` then ensure you are ready for installer:
   - [ ] `bun run verify:prod` — includes pytest, `electron-vite build`, PyInstaller, packaged backend smoke  
     (Uses `.venv` at repo root; set `PYTHON` if needed.)

5. **Optional but recommended: local Windows installer**
   - [ ] `bun run release:win:local` — deps + `release:check` + `verify:prod` + NSIS `.exe`  
     If NSIS fails with `Plugin not found, cannot call UAC::_` or cache `Access is denied`, clear cache and retry:
     ```powershell
     Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\nsis" -ErrorAction SilentlyContinue
     node scripts/run-electron-builder-win.js
     ```
   - [ ] Confirm `out/dist/Bank Audit App Setup {version}.exe` (and `latest.yml` if generated).

6. **Git**
   - [ ] All release-related changes committed on `master` (or your release branch).
   - [ ] Tag matches semver: `vMAJOR.MINOR.PATCH` only (no `-rc` in current workflow).

7. **Publish**
   - [ ] `git push origin master`
   - [ ] `git push origin vX.Y.Z` → triggers **Release (Windows 64-bit only)** workflow.
   - [ ] Watch Actions; confirm GitHub Release has installer + `latest.yml` / blockmap.

---

## Commands quick reference

```powershell
# Fast loop (matching, brokers, parsers)
bun run release:local:test
# or backend only:
node scripts/local-release.js test-backend

# Full local release (tests + verify + .exe)
bun run release:win:local

# Makefile (Git Bash / WSL if `make` installed)
make test
make release-win
```

---

## What agents should change vs avoid

**Safe to change without a release:** backend tests, `fuzzy_service`, parsers, frontend UI — validate with `release:local:test`.

**Requires version bump + checklist:** anything shipped in the Electron app or bundled Python backend (user-facing behavior, dependencies in `requirements.txt` / `package.json`).

**Do not commit:** `.env.local`, `out/`, `resources/python-dist/`, `node_modules/`, `.venv/`, databases, uploads.

**Broker matching:** list name vs bank narration spacing (e.g. `SHARE KHAN LTD` vs `SHAREKHAN LIMITED`) is handled in `backend/services/fuzzy_service.py` with compact normalization; add/keep tests in `backend/tests/test_accuracy.py`.

---

## Repo map (release-relevant)

| Path | Role |
|------|------|
| `scripts/local-release.js` | Cached deps + test/release orchestration |
| `scripts/verify-production.js` | CI-parity production verification |
| `scripts/run-electron-builder-win.js` | NSIS build with `.env.local` URLs |
| `.github/workflows/release.yml` | Tag → Windows build + GitHub Release |
| `package.json` | Version + `release:win:local` scripts |

---

## Answering “is local-first release a good idea?”

**Yes**, for this project:

- PyInstaller and NSIS dominate CI time; local caches (`node_modules`, `.venv`, electron-builder cache) make iteration much faster.
- Running `verify:prod` before tagging avoids failed Actions runs and broken releases.
- Tag push should mean “already green locally,” not “let CI find out.”

**Trade-off:** CI still re-runs verification until the workflow is split into “package-only.” That redundancy is acceptable for safety; the win is **fewer failed tags** and **less debugging in Actions**.