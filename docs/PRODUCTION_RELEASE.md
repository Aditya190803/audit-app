# Production Release Checklist

This app handles bank statements and client lists. Treat every release as security-sensitive.

## Required release environment

Set these before running `bun run dist`, `bun run dist:win`, or `bun run dist:mac`:

```bash
export UPDATE_FEED_URL="https://your-public-update-host.example/releases"
export LICENSE_CHECK_URL="https://your-public-update-host.example/api/license"
```

### Windows signing

Provide either the generic Electron Builder certificate variables:

```bash
export CSC_LINK="/secure/path/windows-or-cross-platform-cert.p12"
export CSC_KEY_PASSWORD="..."
```

or Windows-specific variables:

```bash
export WIN_CSC_LINK="/secure/path/windows-cert.p12"
export WIN_CSC_KEY_PASSWORD="..."
```

### macOS signing and notarization

```bash
export CSC_LINK="/secure/path/developer-id-application.p12"
export CSC_KEY_PASSWORD="..."
export APPLE_ID="developer@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="..."
export APPLE_TEAM_ID="TEAMID1234"
```

### Emergency unsigned build bypass

Only for internal QA or emergency client support:

```bash
export ALLOW_UNSIGNED_RELEASE=1
```

Public releases should never use this bypass.

## Commands

```bash
bun run release:check
bun run verify:prod
bun run dist:win
bun run dist:mac
bun run dist:linux
```

`dist*` commands run the release gate first, then full production verification, then Electron Builder.

## Data handling expectations

- Local database lives in Electron `userData` as `audit.db` in packaged builds.
- Uploaded statement/client files are copied into the app data `uploads` directory.
- Exports are written to the configured app export directory unless the user approves an external path through the save dialog.
- Do not publish sample PDFs, client lists, generated SQLite DBs, build outputs, `resources/python-dist`, or `uploads`.
- Document to customers how to delete app data if they uninstall or rotate devices.

## Update hosting

- `UPDATE_FEED_URL` must be public HTTPS and must not point to localhost.
- Release assets and update metadata should be uploaded only from CI or a controlled release machine.
- Keep GitHub/Vercel tokens server-side only.
- Do not commit `.env`, certificates, app-specific passwords, or update credentials.

## Pre-release manual checks

1. Confirm app version in `package.json` matches release tag.
2. Run `bun audit --audit-level high`.
3. Run `bun run dist:<platform>` with signing credentials enabled.
4. Install on a clean machine/VM.
5. Verify first launch, parse flow, export flow, update check, and license endpoint behavior.
6. Verify the installer/app displays a trusted publisher identity.
7. Archive checksums and release notes.
