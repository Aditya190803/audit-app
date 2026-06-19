# Production Code Review

Review date: 2026-06-19

Scope: whole repository at `/home/adi/Projects/audit-app`.

Method: used the `prod-code` review workflow. Attempted `seam status --json` first per the repo's available code-search skill, but Seam failed with `OperationalError: unable to open database file`, so this review used `rg`, targeted file reads, line counts, project scripts, and package/release configuration instead.

## Summary

Overall health: **yellow**.

The app has a sensible product architecture for a local financial-audit desktop tool: Electron owns the desktop lifecycle, FastAPI owns parsing/tagging/export, SQLite is local, and a separate Next.js site handles releases/downloads. There are also several strong production signals already in place: Electron sandboxing and context isolation, a local per-launch API token, CSP checks, release-readiness scripts, backend tests, Alembic migrations, and a production verification script.

Top issues:

1. **Potentially sensitive real-world sample PDFs/XLSX files are tracked under `example/` while the release gate does not block them.**
2. **The primary transaction route is a 725-line orchestration module with duplicated upload logic, hidden fallback behavior, and mixed progress/session/tagging concerns.**
3. **Parser and client-list failures are often swallowed or downgraded to empty results, which can produce incomplete audits that look successful.**

## Repo Map

- `backend/`: FastAPI backend with SQLAlchemy models, Alembic migrations, sync SQLite sessions, parser services, tagging/export services, and tests.
- `frontend/`: Electron + Vite + React desktop app. Electron main process launches the Python backend, exposes a narrow preload API, manages updates, and handles file dialogs.
- `site/`: Next.js update/download site with API routes that proxy GitHub releases and serve release assets.
- `scripts/`: release gates, production verification, frontend smoke checks, backend test launcher, and PyInstaller build script.
- `example/`: tracked sample bank PDFs and spreadsheets used for parser validation/manual testing.

## Findings

### Blocker

#### Tracked financial sample files need an explicit data-handling decision

Files: `example/*`, [.gitignore](/home/adi/Projects/audit-app/.gitignore:78), [scripts/check-release-readiness.js](/home/adi/Projects/audit-app/scripts/check-release-readiness.js:26)

The repo tracks 39 files under `example/`, including bank statement PDFs and client-list spreadsheets with real-looking names such as `AAAC Client list.xlsx`, `FINAL_MASTER_AUDIT_AAAC (1).xlsx`, and multiple statement PDFs. The production checklist says the app handles bank statements and client lists as security-sensitive data, but the release gate only blocks generated/local artifacts and does not block `example/` at all. `.gitignore` only ignores sensitive inputs for `example/canara-bank`, leaving the rest trackable.

Impact: accidental exposure in source control, release artifacts, forks, CI logs, or demos. Even if the files are synthetic, the repo currently does not prove that.

Recommendation: classify every `example/` file as synthetic, anonymized, or private. Remove private samples from git history if needed. Add a release gate for `example/**/*.pdf`, `example/**/*.xlsx`, `example/**/*.xls`, and `example/**/*.csv` unless files live in an explicitly synthetic allowlist.

### Should-Fix

#### `backend/api/routes/transactions.py` is doing too many jobs

File: [backend/api/routes/transactions.py](/home/adi/Projects/audit-app/backend/api/routes/transactions.py:194)

At 725 lines, this route module owns upload persistence, password parsing, progress tracking, SSE subscriptions, client filtering, PDF parsing, session creation, transaction insertion, retagging, audit logging, and append-session behavior. The nested `safe_save` helper is duplicated in both parse and append flows, and the parse endpoint alone spans roughly lines 194-414.

Impact: high regression risk. Small changes to uploads, progress, parser behavior, or tagging require editing the same large route file, and duplicated upload validation can drift.

Recommendation: split into:

- `services/upload_service.py`: extension checks, max-size enforcement, unique names, cleanup on error.
- `services/parse_orchestrator.py`: parse-session and append-session use cases.
- `services/progress_service.py`: in-memory progress state and SSE subscriber management.
- Keep `routes/transactions.py` as a thin HTTP adapter.

#### Successful-looking audits can be produced after parsing failures

Files: [backend/services/pdf_service.py](/home/adi/Projects/audit-app/backend/services/pdf_service.py:32), [backend/services/pdf_service.py](/home/adi/Projects/audit-app/backend/services/pdf_service.py:59), [backend/services/pdf_service.py](/home/adi/Projects/audit-app/backend/services/pdf_service.py:102), [backend/api/routes/transactions.py](/home/adi/Projects/audit-app/backend/api/routes/transactions.py:663)

`PDFService.extract_text` and `extract_tables` catch per-page worker failures, print them, and continue. Parser failures are also caught and downgraded through fallback parsers, ending in `[]` if all fail. The append route then returns a successful completion response when no transactions are found.

Impact: a damaged/encrypted/unsupported PDF can silently produce a partial or empty audit. For audit software, this is dangerous because users may treat "completed" as "complete and reliable."

Recommendation: return structured parse warnings and failure counts. Mark sessions as `completed_with_warnings` or `failed` when page extraction or parser detection fails. Surface warnings in the UI and export metadata.

#### Client-list parse failures are hidden in retag and append flows

Files: [backend/api/routes/transactions.py](/home/adi/Projects/audit-app/backend/api/routes/transactions.py:422), [backend/api/routes/transactions.py](/home/adi/Projects/audit-app/backend/api/routes/transactions.py:479), [backend/api/routes/transactions.py](/home/adi/Projects/audit-app/backend/api/routes/transactions.py:613), [backend/services/csv_service.py](/home/adi/Projects/audit-app/backend/services/csv_service.py:61)

When loading client names, retagging, or appending PDFs, client-list parse exceptions are swallowed and the operation continues with an empty client list. `CSVService.parse_client_list` also prints errors and can return an empty list.

Impact: client matches can disappear without user awareness; broker/suspicious tags may still run, making the result look partially valid.

Recommendation: distinguish "no clients in file" from "failed to read client list." Return warnings to the caller and require explicit user confirmation before retagging/appending without the client list.

#### Upload validation is extension-based only

Files: [backend/api/routes/transactions.py](/home/adi/Projects/audit-app/backend/api/routes/transactions.py:222), [backend/api/routes/transactions.py](/home/adi/Projects/audit-app/backend/api/routes/transactions.py:589)

The backend upload guard checks filename extensions and max byte count, but it does not validate file signatures before saving/processing. The frontend checks PDF magic bytes, but the backend is the trust boundary and accepts local HTTP requests when the token is present.

Impact: malformed files reach parser libraries. For a local desktop app this is lower risk than a public web service, but PDF/XLSX parser attack surface is still worth narrowing.

Recommendation: validate PDF `%PDF` header and spreadsheet/CSV signatures/parseability server-side before continuing. Keep frontend validation as UX, not security.

#### Production dependencies are range-based and not fully locked for Python

File: [backend/requirements.txt](/home/adi/Projects/audit-app/backend/requirements.txt:1)

Python dependencies use lower bounds only, for example `fastapi>=0.115.12`, `pymupdf>=1.25.5`, and `pyinstaller>=6.13.0`. The Node side has `bun.lock`, but the Python backend build can resolve newer parser, OCR, SQLAlchemy, or PyInstaller versions over time.

Impact: release builds can drift, especially around PDF parsing and packaging, which are core product paths.

Recommendation: generate a locked production requirements file with hashes or exact pins for PyInstaller builds. Keep a separate input file for upgrade intent if desired.

#### Windows releases disable executable signing edits

File: [package.json](/home/adi/Projects/audit-app/package.json:91)

The Windows config sets `signAndEditExecutable` to `false`, while the production release checklist requires a trusted publisher identity. The release gate requires signing env vars, but this setting can prevent the expected signing behavior depending on electron-builder setup.

Impact: public Windows builds may remain unsigned or fail to present the desired publisher identity despite the release gate passing.

Recommendation: verify the current signing flow on a clean Windows release build. If signing is intended, remove `signAndEditExecutable: false` or document the alternate signing step that happens outside electron-builder.

#### The frontend upload component is a hand-written monolith

File: [frontend/src/components/FileDropZone.tsx](/home/adi/Projects/audit-app/frontend/src/components/FileDropZone.tsx:187)

`FileDropZone.tsx` is 1,089 lines and owns file selection, CSV/Excel parsing, header detection, AP-code filtering, broker exclusion UI, bank parser selection, password state, PDF validation, progress display, and submission.

Impact: this is difficult to test and easy to break when changing import behavior. It also duplicates parsing concepts that the backend owns.

Recommendation: extract `useClientListPreview`, `useApCodeSelection`, `usePdfSelection`, `ParserSelect`, `BrokerExclusionSelect`, and `PasswordControls`. Keep the container focused on composing those pieces and submitting the final options.

#### The app shell is too broad for long-term UI maintenance

File: [frontend/src/components/AppShell.tsx](/home/adi/Projects/audit-app/frontend/src/components/AppShell.tsx:35)

`AppShell.tsx` is 765 lines and coordinates layout, session navigation, recovery toast, update toast, analytics worker inputs, filters, active transaction drawer, retagging, toolbar, sidebar, modals, and multiple view states.

Impact: global state changes and UI workflow changes are coupled. This makes it harder to reason about keyboard shortcuts, modal behavior, and session transitions.

Recommendation: split into `SessionSidebar`, `SessionToolbar`, `MainAuditView`, `AppLifecycleToasts`, and `useSessionRecovery`. Keep `AppShell` as a layout-level orchestrator.

### Nits / Maintenance

#### Top-level route imports are not grouped cleanly

File: [backend/api/routes/transactions.py](/home/adi/Projects/audit-app/backend/api/routes/transactions.py:86)

`StreamingResponse` and `asyncio` are imported mid-file after route definitions. This is minor, but it is another sign that the route grew organically.

Recommendation: after splitting, keep imports at top-level and group standard library, third-party, and local imports consistently.

#### Comments are sometimes section banners instead of useful invariants

Files: [frontend/src/components/AppShell.tsx](/home/adi/Projects/audit-app/frontend/src/components/AppShell.tsx:31), [backend/database.py](/home/adi/Projects/audit-app/backend/database.py:8)

Some comments are useful, especially security/process-lifecycle notes. Others are decorative banners or restate the next block. Keep comments for non-obvious behavior: SQLite PRAGMA choices, Electron process-tree shutdown, token/SSE limitations, export path approval, and parser quirks.

Recommendation: remove banner comments during the proposed splits; preserve comments that explain why a constraint exists.

#### Type escapes exist in UI hot paths

Files: [frontend/src/components/AppShell.tsx](/home/adi/Projects/audit-app/frontend/src/components/AppShell.tsx:134), [frontend/src/components/AuditReviewPage.tsx](/home/adi/Projects/audit-app/frontend/src/components/AuditReviewPage.tsx:14), [frontend/src/components/DataTable.tsx](/home/adi/Projects/audit-app/frontend/src/components/DataTable.tsx:82), [frontend/src/stores/sessionStore.ts](/home/adi/Projects/audit-app/frontend/src/stores/sessionStore.ts:105)

There are several `any` casts in UI workflow and table code. Some are normal around TanStack Table generics, but `onTabChange: (tab: any)` and result-filter casting can be tightened with local union types.

Recommendation: introduce shared UI unions for tab/filter values and reduce `any` to framework boundaries only.

## Recommended Changes

1. Decide whether `example/` contains safe synthetic data. Remove or anonymize private files, then enforce the policy in `.gitignore` and `scripts/check-release-readiness.js`.
2. Refactor `backend/api/routes/transactions.py` into thin routes plus upload/progress/orchestration services.
3. Change parser/client-list failures from silent fallbacks into structured warnings or failed states.
4. Add backend file-signature validation for PDF and spreadsheet uploads.
5. Pin Python production dependencies for reproducible PyInstaller builds.
6. Verify and document Windows signing behavior, especially `signAndEditExecutable: false`.
7. Split `FileDropZone.tsx` and `AppShell.tsx` along clear UI/workflow boundaries.
8. Tighten TypeScript unions for review tabs, result filters, and session-store Electron bridge access.

## Refactor Plan

Phase 1: no behavior change.

- Extract upload saving from `transactions.py` into `backend/services/upload_service.py`.
- Extract progress state/SSE helpers into `backend/services/progress_service.py`.
- Add unit tests for accepted/rejected extensions, max-size cleanup, and progress cleanup.

Phase 2: make failures visible.

- Introduce parse result objects: `{transactions, warnings, errors, parser_name}`.
- Mark sessions with `completed`, `completed_with_warnings`, or `failed`.
- Surface warnings in the frontend progress/result UI and Excel metadata.

Phase 3: frontend decomposition.

- Extract client-list preview and AP-code parsing hooks from `FileDropZone.tsx`.
- Extract update/recovery toast effects from `AppShell.tsx`.
- Add focused smoke tests for file-selection state and retag failure UI.

## Positive Signals

- Electron renderer is sandboxed with context isolation and `nodeIntegration: false`.
- The backend receives a per-launch `AUDIT_API_TOKEN`, and the API client sends it.
- Export outside the configured export directory requires a short-lived HMAC token.
- Production verification runs frontend smoke checks, TypeScript, backend tests, migrations, frontend build, PyInstaller build, and packaged backend health checks.
- Alembic migrations and backend parser/tagging tests exist.
- The release checklist correctly treats the domain as security-sensitive.

## Residual Risks

- I did not run the full test suite before writing this initial review file.
- Seam code search could not be used because its local SQLite index failed to open.
- I did not inspect every parser line-by-line; parser correctness should continue to be covered by sample-based tests.
- The working tree already had local modifications in `backend/services/parsers/hdfc_bank.py` and `backend/tests/test_parsers_bank.py`; this review did not alter or revert them.
