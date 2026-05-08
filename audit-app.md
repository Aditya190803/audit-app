# Bank Statement Auditing App — Complete Work Plan

## TL;DR

> **Quick Summary**: Build a Windows Electron desktop app (`.exe`) that ingests bank statement PDFs and client CSVs, automatically tags transactions as Client/Broker/Suspicious via fuzzy matching and rule engines, provides a rich manual review UI, and exports results in multiple formats including annotated PDFs.
>
> **Deliverables**:
> - Electron + Vite + React frontend with drag-drop, table view, PDF preview, settings panel
> - FastAPI Python backend bundled via PyInstaller (onedir) handling PDF/CSV parsing, fuzzy matching, OCR, SQLite persistence
> - SQLite local database with full audit trail, session recovery, and config storage
> - Multi-format export (CSV, Excel, annotated PDF) with filtering
> - Complete manual review workflow with bulk actions, undo/redo, keyboard shortcuts
>
> **Estimated Effort**: XL (Full build, ~40+ features)
> **Parallel Execution**: YES — 5 implementation waves + 1 final verification wave
> **Critical Path**: Wave 1 scaffolding → Wave 2 core engine → Wave 3 frontend integration → Wave 4 export & advanced features → Wave 5 polish → Final verification

---

## Context

### Original Request
User wants a bank statement auditing Electron app for Windows (.exe) with Python backend and React frontend. The app takes a PDF (bank statement) and CSV (client list) as input, then automatically tags transactions based on fuzzy name matching (clients & brokers), suspicious rules (threshold, recurring empty remarks), and supports full manual review, multi-format export, and advanced features like OCR, rule engine, audit trail, session recovery, and bank format profiles.

### Interview Summary
**Key Discussions**:
- **Scope**: FULL build — all ~40+ features in one plan. User explicitly rejected phased approach.
- **Frontend Framework**: Started with Next.js, but switched to **Vite + React** (`electron-vite`) after research showed Next.js is poorly suited for Electron (SSR/SEO irrelevant, heavy bundle, static export loses features).
- **Backend Bridge**: **FastAPI** local HTTP server running as subprocess. Dynamic port allocation via `get-port`. Python binds to `127.0.0.1` to avoid Windows Firewall popups.
- **Python Bundling**: **PyInstaller** in `--onedir` mode (NOT `--onefile`, which adds 3-10s startup latency).
- **PDF Library**: **PyMuPDF** (`fitz`) chosen by user despite AGPL/commercial licensing risk. User accepted this risk for best-in-class text extraction and highlighting.
- **OCR**: `pytesseract` Python wrapper + bundled portable **Tesseract OCR** binaries and `tessdata` as `extraResource`.
- **Database**: **SQLite** local file.
- **Fuzzy Matching**: Applies to **both client names AND broker names**.
- **Broker List**: Seeded with a default hardcoded list, but **user-editable via Settings panel** and persisted in SQLite.
- **Tag Priority**: Default `Client > Broker > Suspicious`, but **configurable in settings**.
- **Test Strategy**: Agent-executed QA scenarios as primary verification. No dedicated unit test infrastructure required.

### Research Findings
- `get-port` library in Electron main process prevents port conflicts.
- PyInstaller `--onedir` outputs a folder (`.exe` + `.dll`s) that should be placed in `extraResources` or `asarUnpack` via `electron-builder`.
- Tesseract must be explicitly pointed to via `pytesseract.pytesseract.tesseract_cmd` using a path resolved relative to the PyInstaller `MEIPASS` or `resourcesPath`.
- `electron-vite` provides out-of-the-box boilerplate for Main/Preload/Renderer separation with TypeScript and React.

### Metis Review (Self-Assessment)
**Identified Gaps & Resolutions**:
- **Gap**: PyMuPDF AGPL license risk. → **Resolved**: User explicitly accepted.
- **Gap**: Broker list described as "hard-coded" but user wants "save configs (broker list)". → **Resolved**: Seeded defaults + SQLite persistence + UI editor.
- **Gap**: No explicit mention of update/auto-updater mechanism. → **Resolved**: Out of scope for V1 full build. Can be added later.
- **Gap**: Bank statement formats vary wildly. → **Resolved**: Generic parser as default + "Bank format profiles" feature allows saving custom parsing rules per bank.
- **Gap**: Undo/redo scope unclear (just tags, or also imports?). → **Resolved**: Undo/redo covers tag changes, alias assignments, exclusions, and broker list edits. Import actions are not undoable.
- **Gap**: "Recurring transaction with no useful remark" needs definition of "useful remark". → **Resolved**: "Useful remark" means non-empty description/notes field. Recurring = same amount + same party within 30 days.
- **Gap**: Multi-file batch processing UI/UX undefined. → **Resolved**: Queue-based sidebar with per-file progress, results aggregated into single audit view.

---

## Work Objectives

### Core Objective
Build a complete, standalone Windows desktop application that automates bank statement auditing by matching transactions against client/broker lists, flagging suspicious activity, and enabling efficient manual review with full audit trail and flexible export.

### Concrete Deliverables
1. `audit-app.exe` — Single Windows installer distributing Electron frontend + Python backend + Tesseract OCR.
2. SQLite database schema and migration system.
3. FastAPI backend with endpoints for: parse, match, tag, export, settings, session, audit trail.
4. React frontend with: drag-drop, data table, PDF preview, settings panel, review workflow, export dialogs.
5. PyMuPDF-based PDF highlighting and annotation export.
6. Fuzzy matching engine with confidence scores and alias support.
7. Rule engine for custom suspicious conditions.
8. Bank format profile system.
9. Session save/load with crash recovery.

### Definition of Done
- [ ] App installs and runs on Windows without Python pre-installed.
- [ ] Can ingest a password-protected PDF + CSV, parse transactions, and display in table.
- [ ] Fuzzy matching correctly tags clients and brokers with confidence scores.
- [ ] Suspicious rules correctly flag transactions above threshold and recurring empty-remark transactions.
- [ ] Manual review allows untagging, re-tagging, bulk actions, and undo/redo.
- [ ] All 6 export formats work correctly (CSV, Excel, highlighted PDF).
- [ ] Settings panel persists broker list, thresholds, rules, and bank profiles.
- [ ] Session autosave and crash recovery restore last audit state.
- [ ] Agent-executed QA scenarios pass for all critical paths.

### Must Have
- PDF + CSV ingestion with drag & drop
- Password-protected PDF support
- Fuzzy name matching for clients and brokers
- Hardcoded broker list (seed) with UI editor
- Broker exclusion list (permanent or per-audit)
- Suspicious detection: amount threshold + recurring empty remark
- Manual review: untick, remove, re-tag, bulk actions
- Export: All / Client / Broker / Suspicious / All Tagged (CSV + Excel)
- Highlighted PDF export with tags annotated
- SQLite local database
- Settings panel for broker list, threshold, rules
- Local FastAPI backend bundled with PyInstaller
- Electron + Vite + React frontend

### Must NOT Have (Guardrails)
- NO cloud connectivity or external APIs (fully offline app).
- NO user authentication or multi-user support.
- NO network-dependent features.
- NO auto-updater (out of scope).
- NO web deployment (desktop only).
- NO hardcoded business logic that cannot be configured via settings.
- NO AGPL contamination beyond PyMuPDF (all other libraries must be permissive).
- NO paid/proprietary dependencies except PyMuPDF.

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (new project)
- **Automated tests**: None (Agent-executed QA scenarios are the primary verification)
- **Framework**: N/A
- **QA Policy**: Every task MUST include agent-executed QA scenarios.

### QA Policy
Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **TUI/CLI**: Use interactive_bash (tmux) — Run command, send keystrokes, validate output
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Library/Module**: Use Bash (bun/node REPL) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — scaffolding, config, DB, core backend structure):
├── Task 1: Project scaffolding (electron-vite, Python venv, folder structure)
├── Task 2: SQLite database schema + migrations
├── Task 3: FastAPI skeleton + startup/shutdown lifecycle
├── Task 4: Electron main process + Python subprocess spawn + port allocation
├── Task 5: Settings/config system (SQLite + JSON defaults)
├── Task 6: Shared types/contracts (frontend ↔ backend API types)
└── Task 7: Build scripts (dev + production PyInstaller + electron-builder)

Wave 2 (Core Engine — parsing, matching, tagging, rules, OCR):
├── Task 8: PDF text/table extraction engine (PyMuPDF + pdfplumber fallback)
├── Task 9: CSV ingestion + client list parser
├── Task 10: Bank format profiles + transaction normalization
├── Task 11: Fuzzy matching engine (clients + brokers + aliases + confidence)
├── Task 12: Broker list manager (seed defaults + CRUD + exclusions)
├── Task 13: Suspicious rule engine (threshold + recurring + custom rules)
├── Task 14: Tagging engine (multi-tag + priority + "Why flagged" explanations)
├── Task 15: OCR pipeline (pytesseract + bundled Tesseract for scanned PDFs)
├── Task 16: Session save/load + autosave + crash recovery
└── Task 17: Audit trail logger (auto vs manual changes)

Wave 3 (Frontend Core — UI shell, data display, review workflow):
├── Task 18: App shell + layout (sidebar, toolbar, status bar, dark/light theme)
├── Task 19: Drag & drop file input + file validation + password dialog
├── Task 20: Data table component (virtualized, sortable, filterable, column resize)
├── Task 21: Tag display + manual tag editing + multi-select bulk actions
├── Task 22: Search + advanced filters (amount range, date range, tag, confidence)
├── Task 23: PDF preview panel (side-by-side with table, auto-sync scroll)
├── Task 24: Settings panel (broker list editor, threshold slider, rules, bank profiles)
├── Task 25: Progress bar + background processing UI (batch queue)
└── Task 26: Undo/redo system (tag changes, aliases, exclusions)

Wave 4 (Export & Advanced Features):
├── Task 27: CSV export engine (all / filtered views)
├── Task 28: Excel export engine (openpyxl, styled headers, multiple sheets)
├── Task 29: Highlighted PDF export (PyMuPDF annotations for all tags)
├── Task 30: Clean PDF summary report (shareable summary page)
├── Task 31: Batch processing (multi-file queue, aggregate results)
├── Task 32: Duplicate & pattern detection engine
├── Task 33: Visual confidence indicators (color coding, tooltips)
├── Task 34: Keyboard shortcuts (navigation, tagging, export)
└── Task 35: Name normalization + alias assignment UI

Wave 5 (Polish & Integration):
├── Task 36: Error handling + parsing validation + user-friendly error messages
├── Task 37: File validation before processing (PDF/CSV format checks)
├── Task 38: Auto-sync between table and PDF view (bidirectional selection)
├── Task 39: Filtered export (export only current view)
├── Task 40: Onboarding / empty state UI
├── Task 41: Performance optimization (large PDF handling, virtualized lists)
└── Task 42: Final integration testing + Windows installer packaging

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → Task 8 → Task 11 → Task 14 → Task 18 → Task 20 → Task 27 → Task 29 → Task 42 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 7-9 tasks (Waves 1 & 2)
```

### Dependency Matrix (Full)

- **1**: - - 2, 3, 4, 5, 6, 7
- **2**: 1 - 3, 5, 8, 9, 16, 17
- **3**: 1, 2 - 8, 9, 11, 12, 13, 14, 15, 16, 17
- **4**: 1, 3 - 7, 18
- **5**: 1, 2 - 12, 13, 24
- **6**: 1 - 3, 8, 9, 11, 12, 13, 14, 18, 20, 21, 22, 23, 24, 26, 27, 28, 29
- **7**: 1, 4 - 42
- **8**: 1, 2, 3 - 10, 11, 14, 15, 23, 27, 28, 29, 32
- **9**: 1, 2, 3 - 11, 14, 20
- **10**: 1, 2, 3, 8 - 20, 32
- **11**: 1, 2, 3, 8, 9 - 14, 20, 21, 26, 33, 35
- **12**: 1, 2, 3, 5 - 11, 14, 24, 26, 35
- **13**: 1, 2, 3, 5 - 14, 24, 33
- **14**: 1, 2, 3, 8, 9, 11, 12, 13 - 20, 21, 26, 27, 28, 29, 33
- **15**: 1, 2, 3, 8 - 20, 32
- **16**: 1, 2, 3 - 18, 20, 42
- **17**: 1, 2, 3 - 21, 26, 42
- **18**: 1, 4, 6 - 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 34, 40
- **19**: 1, 6, 18 - 20, 31, 37
- **20**: 1, 6, 9, 10, 11, 14, 16, 18 - 21, 22, 23, 26, 27, 28, 29, 30, 31, 38, 39, 41
- **21**: 1, 6, 11, 12, 14, 17, 18, 20 - 22, 26, 27, 28, 29, 33, 34, 38, 39
- **22**: 1, 6, 11, 14, 18, 20 - 27, 28, 29, 39
- **23**: 1, 6, 8, 18 - 29, 30, 38
- **24**: 1, 5, 6, 12, 13, 18 - 26, 27, 28, 29, 33
- **25**: 1, 6, 18 - 31
- **26**: 1, 6, 11, 12, 14, 17, 18, 20, 21 - 27, 28, 29, 34
- **27**: 1, 6, 8, 14, 18, 20, 21, 22, 24, 26 - 39
- **28**: 1, 6, 8, 14, 18, 20, 21, 22, 24, 26 - 39
- **29**: 1, 6, 8, 14, 18, 20, 21, 23, 24, 26 - 30, 39
- **30**: 1, 6, 8, 18, 23, 29 - 39
- **31**: 1, 6, 18, 19, 20, 25 - 42
- **32**: 1, 6, 8, 10, 15, 20 - 33
- **33**: 1, 6, 11, 13, 14, 18, 20, 21, 24, 32 - 34, 39
- **34**: 1, 6, 18, 20, 21, 26, 33 - 42
- **35**: 1, 6, 11, 12, 18, 20 - 42
- **36**: 1, 6, 8, 18, 20 - 42
- **37**: 1, 6, 19, 20 - 42
- **38**: 1, 6, 18, 20, 21, 23 - 42
- **39**: 1, 6, 18, 20, 21, 22, 27, 28, 29, 30 - 42
- **40**: 1, 6, 18 - 42
- **41**: 1, 6, 18, 20 - 42
- **42**: 1, 6, 7, 16, 17, 18, 20, 25, 31, 34, 35, 36, 37, 38, 39, 40, 41 - F1-F4

### Agent Dispatch Summary

- **Wave 1**: **7 tasks** — T1-T7 → `quick` (scaffolding, configs, setup)
- **Wave 2**: **10 tasks** — T8-T17 → mix of `deep` (engine logic) and `unspecified-high` (OCR, rules)
- **Wave 3**: **9 tasks** — T18-T26 → `visual-engineering` (UI) and `quick` (components)
- **Wave 4**: **9 tasks** — T27-T35 → `unspecified-high` (export, batch, patterns)
- **Wave 5**: **6 tasks** — T36-T42 → `quick` (polish) + `unspecified-high` (integration)
- **FINAL**: **4 tasks** — F1-F4 → `oracle`, `unspecified-high`, `unspecified-high`, `deep`

---

## TODOs

- [ ] 1. **Project Scaffolding** — `quick`

  **What to do**:
  - Initialize `electron-vite` project with React + TypeScript template.
  - Set up Python virtual environment in `backend/` directory.
  - Create root folder structure: `src/` (frontend), `backend/` (Python), `resources/` (Tesseract binaries, default configs), `.sisyphus/evidence/`.
  - Add `.gitignore` for Node, Python, Electron, and OS artifacts.
  - Install frontend dependencies: `react`, `react-dom`, `tailwindcss`, `@tanstack/react-table`, `zustand`, `react-hotkeys-hook`, `lucide-react`, `date-fns`.
  - Install backend dependencies: `fastapi`, `uvicorn`, `pymupdf`, `pdfplumber`, `pandas`, `openpyxl`, `rapidfuzz`, `pytesseract`, `pillow`, `sqlalchemy`, `alembic`, `pydantic`.
  - Install dev dependencies: `electron-builder`, `get-port`, `cross-env`, `typescript`, `@types/node`.

  **Must NOT do**:
  - Do NOT write any business logic yet — this is pure scaffolding.
  - Do NOT configure PyInstaller or electron-builder yet (that is Task 7).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `electron-best-practices` (for electron-vite setup patterns)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-7)
  - **Blocks**: All subsequent tasks
  - **Blocked By**: None

  **References**:
  - `electron-vite` docs: `https://electron-vite.org/` — Project initialization and folder conventions.
  - FastAPI docs: `https://fastapi.tiangolo.com/` — Basic app structure.

  **Acceptance Criteria**:
  - [ ] `npm run dev` starts Electron window with React rendering.
  - [ ] `python backend/main.py` starts FastAPI on port 8000 with `/health` endpoint returning OK.
  - [ ] Folder structure matches plan specification.

  **QA Scenarios**:
  ```
  Scenario: Dev environment starts
    Tool: Bash
    Preconditions: Fresh clone, dependencies installed
    Steps:
      1. Run `npm run dev` in terminal
      2. Wait 10s, check if Electron window opens
      3. In Electron DevTools console, run `window.location.href`
    Expected Result: URL contains `localhost` or `file://` with renderer loaded
    Evidence: .sisyphus/evidence/task-1-dev-start.png

  Scenario: Backend health endpoint
    Tool: Bash
    Preconditions: Python venv activated
    Steps:
      1. Run `python backend/main.py`
      2. Run `curl http://localhost:8000/health`
    Expected Result: JSON response `{"status":"ok"}` with HTTP 200
    Evidence: .sisyphus/evidence/task-1-backend-health.json
  ```

  **Commit**: YES
  - Message: `chore(scaffold): initialize electron-vite + fastapi project`
  - Files: All new scaffold files

- [ ] 2. **SQLite Database Schema + Migrations** — `quick`

  **What to do**:
  - Set up SQLAlchemy models in `backend/models.py` for:
    - `AuditSession` (id, name, created_at, updated_at, status, pdf_path, csv_path, settings_snapshot)
    - `Transaction` (id, session_id, date, amount, description, party_name, raw_text, page_number, bounding_box_json)
    - `Tag` (id, transaction_id, tag_type, confidence, reason, source, created_at, is_manual)
    - `Broker` (id, name, aliases, is_active, created_at)
    - `Alias` (id, canonical_name, alias_name, created_at)
    - `AuditLog` (id, session_id, action, entity_type, entity_id, old_value, new_value, timestamp, is_auto)
    - `Config` (id, key, value, category)
    - `BankProfile` (id, name, parser_rules_json, created_at)
  - Set up Alembic for migrations.
  - Create initial migration script.
  - Add `backend/database.py` with engine, session factory, and base.
  - Add `backend/seed.py` to populate default brokers and config values on first run.

  **Must NOT do**:
  - Do NOT add business logic queries yet (just schema).
  - Do NOT optimize indexes yet (add as needed in later waves).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `context7` (if SQLAlchemy/Alembic API questions arise)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-7)
  - **Blocks**: Task 3 (FastAPI needs DB), Task 5 (config needs DB), Task 8+ (all data tasks)
  - **Blocked By**: Task 1 (folder structure)

  **References**:
  - SQLAlchemy 2.0 docs — Declarative base and relationship patterns.
  - Alembic docs — `alembic init` and `alembic revision --autogenerate`.

  **Acceptance Criteria**:
  - [ ] `alembic upgrade head` creates SQLite file with all tables.
  - [ ] `python backend/seed.py` inserts default brokers into `Broker` table.
  - [ ] SQLAlchemy models can be imported without errors.

  **QA Scenarios**:
  ```
  Scenario: Database initializes correctly
    Tool: Bash
    Preconditions: Python venv active
    Steps:
      1. Run `alembic upgrade head`
      2. Run `sqlite3 audit.db ".tables"`
    Expected Result: Output contains all 8 table names (audit_sessions, transactions, tags, brokers, aliases, audit_logs, configs, bank_profiles)
    Evidence: .sisyphus/evidence/task-2-db-tables.txt

  Scenario: Seed data populates defaults
    Tool: Bash
    Preconditions: Fresh DB after migration
    Steps:
      1. Run `python backend/seed.py`
      2. Run `sqlite3 audit.db "SELECT COUNT(*) FROM brokers;"`
    Expected Result: COUNT > 0 (default brokers seeded)
    Evidence: .sisyphus/evidence/task-2-seed-count.txt
  ```

  **Commit**: YES
  - Message: `feat(db): add sqlite schema + alembic migrations + seed data`
  - Files: `backend/models.py`, `backend/database.py`, `backend/seed.py`, `alembic/`

- [ ] 3. **FastAPI Skeleton + Lifecycle** — `quick`

  **What to do**:
  - Create `backend/main.py` with FastAPI app factory pattern.
  - Add startup event: initialize DB connection, run migrations if needed, seed defaults.
  - Add shutdown event: close DB connections, flush logs.
  - Add `/health` endpoint returning version and status.
  - Add CORS middleware configured strictly for `127.0.0.1` (no external access).
  - Add global exception handler returning JSON error responses.
  - Add request logging middleware.
  - Structure routers: `api/sessions.py`, `api/transactions.py`, `api/tags.py`, `api/brokers.py`, `api/export.py`, `api/settings.py`, `api/audit.py`.
  - Create `backend/schemas.py` with Pydantic v2 models for all API request/response shapes.

  **Must NOT do**:
  - Do NOT implement actual router logic yet — just skeletons and schemas.
  - Do NOT add authentication/authorization (offline app, no users).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `context7` (FastAPI patterns if needed)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-2, 4-7)
  - **Blocks**: All Wave 2 engine tasks (they depend on API structure)
  - **Blocked By**: Task 1 (folder structure), Task 2 (DB models needed for schemas)

  **References**:
  - FastAPI docs — Router inclusion and dependency injection.
  - Pydantic v2 docs — Model validation and serialization.

  **Acceptance Criteria**:
  - [ ] `python backend/main.py` starts without errors.
  - [ ] All router endpoints return 200 with empty/skeleton responses.
  - [ ] Pydantic schemas validate correctly with sample data.

  **QA Scenarios**:
  ```
  Scenario: API routers registered
    Tool: Bash (curl)
    Preconditions: Backend running
    Steps:
      1. Run `curl http://localhost:8000/docs`
    Expected Result: HTTP 200, Swagger UI loads with all router tags visible
    Evidence: .sisyphus/evidence/task-3-swagger.png

  Scenario: Global error handler works
    Tool: Bash (curl)
    Preconditions: Backend running
    Steps:
      1. Run `curl http://localhost:8000/api/nonexistent`
    Expected Result: HTTP 404 with JSON body `{"detail":"Not Found"}`
    Evidence: .sisyphus/evidence/task-3-404.json
  ```

  **Commit**: YES
  - Message: `feat(api): fastapi skeleton + routers + pydantic schemas`
  - Files: `backend/main.py`, `backend/schemas.py`, `backend/api/*.py`

- [ ] 4. **Electron Main Process + Python Subprocess Spawn** — `quick`

  **What to do**:
  - Implement `electron/main.ts` with:
    - Window creation (main window + optional devtools in dev).
    - `get-port` integration to find free TCP port on startup.
    - `child_process.spawn` to launch PyInstaller-built Python backend `.exe` (dev: `python backend/main.py`, prod: `resources/backend/backend.exe`).
    - Pass assigned port to Python via CLI argument `--port {PORT}`.
    - Wait for Python `/health` to respond before showing main window (splash screen or loading state).
    - On Electron app quit: gracefully kill Python subprocess.
    - On crash/unexpected Python exit: attempt restart with backoff, show error dialog if persistent.
  - Implement secure `preload.ts` exposing only necessary APIs via `contextBridge`:
    - `window.electronAPI.getBackendPort()` — returns dynamic port.
    - `window.electronAPI.selectFile()` — opens file dialog for PDF/CSV.
    - `window.electronAPI.showSaveDialog()` — for export paths.
    - `window.electronAPI.onBackendCrash(callback)` — for error handling.
  - Add IPC handlers for file selection and dialog operations.

  **Must NOT do**:
  - Do NOT expose Node.js internals or `require` to renderer.
  - Do NOT hardcode port numbers.
  - Do NOT bundle Python backend in this task (Task 7 handles PyInstaller config).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `electron-best-practices` (security patterns, contextBridge)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5-7)
  - **Blocks**: Task 7 (build scripts need main process), Task 18+ (all frontend tasks need backend port)
  - **Blocked By**: Task 1 (scaffolding)

  **References**:
  - `electron-vite` boilerplate — Main/Preload/Renderer separation.
  - `get-port` npm package docs.
  - Electron security best practices — `contextIsolation: true`, `nodeIntegration: false`.

  **Acceptance Criteria**:
  - [ ] `npm run dev` finds free port, starts Python backend, then opens Electron window.
  - [ ] Renderer process can call `window.electronAPI.getBackendPort()` and receive a number.
  - [ ] Quitting Electron terminates Python subprocess (verified via process monitor).

  **QA Scenarios**:
  ```
  Scenario: Dynamic port allocation works
    Tool: Playwright (via Electron)
    Preconditions: App running in dev mode
    Steps:
      1. Open DevTools in Electron
      2. Evaluate `window.electronAPI.getBackendPort()`
    Expected Result: Returns a number between 1024-65535
    Evidence: .sisyphus/evidence/task-4-port.png

  Scenario: Backend lifecycle tied to Electron
    Tool: Bash
    Preconditions: App running
    Steps:
      1. Note PID of Python process (`ps aux | grep main.py`)
      2. Quit Electron app
      3. Check if Python PID still exists after 2s
    Expected Result: Python PID no longer exists (process killed)
    Evidence: .sisyphus/evidence/task-4-lifecycle.txt
  ```

  **Commit**: YES
  - Message: `feat(electron): main process + python spawn + secure preload`
  - Files: `electron/main.ts`, `electron/preload.ts`, `src/types/electron.d.ts`

- [ ] 5. **Settings / Config System** — `quick`

  **What to do**:
  - Create `backend/services/config.py` for CRUD operations on `Config` table.
  - Define default config values in `backend/defaults.py`:
    - `suspicious_threshold`: 10000.0
    - `fuzzy_match_threshold`: 0.75
    - `tag_priority`: `["client", "broker", "suspicious"]`
    - `broker_list`: JSON array of default broker names
    - `name_normalization_rules`: strip extra spaces, lowercase, remove special chars
    - `auto_save_interval_seconds`: 30
  - Create `backend/api/settings.py` endpoints:
    - `GET /api/settings` — return all settings by category.
    - `PATCH /api/settings` — update specific settings.
    - `POST /api/settings/reset` — reset to defaults.
  - Create frontend settings store (Zustand) in `src/stores/settings.ts`.
  - Add TypeScript interfaces for all settings categories.

  **Must NOT do**:
  - Do NOT build the UI settings panel yet (Task 24).
  - Do NOT implement rule engine config yet (Task 13).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `context7` (Zustand patterns if needed)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4, 6-7)
  - **Blocks**: Task 12 (broker manager needs config), Task 13 (rule engine needs thresholds), Task 24 (settings UI)
  - **Blocked By**: Task 2 (Config table), Task 3 (API structure)

  **References**:
  - Zustand docs — Basic store creation and TypeScript typing.

  **Acceptance Criteria**:
  - [ ] `GET /api/settings` returns JSON with all default values.
  - [ ] `PATCH /api/settings` updates SQLite and returns updated values.
  - [ ] Frontend Zustand store can fetch and cache settings.

  **QA Scenarios**:
  ```
  Scenario: Settings CRUD
    Tool: Bash (curl)
    Preconditions: Backend running with fresh DB
    Steps:
      1. GET /api/settings → note suspicious_threshold
      2. PATCH /api/settings with {"suspicious_threshold": 5000}
      3. GET /api/settings again
    Expected Result: suspicious_threshold changed from 10000 to 5000
    Evidence: .sisyphus/evidence/task-5-settings.json

  Scenario: Reset to defaults
    Tool: Bash (curl)
    Preconditions: Settings modified
    Steps:
      1. POST /api/settings/reset
      2. GET /api/settings
    Expected Result: All values match defaults from backend/defaults.py
    Evidence: .sisyphus/evidence/task-5-reset.json
  ```

  **Commit**: YES
  - Message: `feat(config): settings system with sqlite persistence + zustand frontend store`
  - Files: `backend/services/config.py`, `backend/defaults.py`, `backend/api/settings.py`, `src/stores/settings.ts`

- [ ] 6. **Shared Types / API Contracts** — `quick`

  **What to do**:
  - Create `src/types/api.ts` with TypeScript interfaces mirroring Pydantic schemas:
    - `Transaction`, `Tag`, `Broker`, `AuditSession`, `AuditLog`, `Config`, `BankProfile`, `ExportRequest`, `MatchResult`.
  - Ensure enums match exactly: `TagType` (`client`, `broker`, `suspicious`), `AuditAction`, etc.
  - Add generic API response wrapper types: `ApiResponse<T>`, `PaginatedResponse<T>`.
  - Create `src/lib/api.ts` with axios instance preconfigured to use `window.electronAPI.getBackendPort()`.
  - Add request/response interceptors for error handling and logging.

  **Must NOT do**:
  - Do NOT add UI-specific types here (keep in component files).
  - Do NOT implement actual API call hooks yet (Task 18+).

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5, 7)
  - **Blocks**: All frontend tasks that call API (T18+)
  - **Blocked By**: Task 3 (Pydantic schemas must exist first)

  **References**:
  - Axios docs — Instance creation and interceptors.

  **Acceptance Criteria**:
  - [ ] All TypeScript types compile without errors.
  - [ ] Axios instance successfully calls `/health` using dynamic port.

  **QA Scenarios**:
  ```
  Scenario: API client connects to backend
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Open DevTools
      2. Run `await window.electronAPI.getBackendPort()`
      3. Run `await fetch(\`http://localhost:${port}/health\`)`
    Expected Result: Returns 200 with ok status
    Evidence: .sisyphus/evidence/task-6-api-client.png
  ```

  **Commit**: YES
  - Message: `feat(types): shared typescript interfaces + axios api client`
  - Files: `src/types/api.ts`, `src/lib/api.ts`

- [ ] 7. **Build Scripts (Dev + Production Packaging)** — `quick`

  **What to do**:
  - Configure `electron-builder` in `package.json` or `electron-builder.yml`:
    - Target: `nsis` (Windows installer).
    - `asarUnpack` or `extraResources` pointing to PyInstaller output directory.
    - `extraResources` for Tesseract binaries and default configs.
    - App icon and metadata.
  - Create `scripts/build-python.js` or Python script to run PyInstaller:
    - `pyinstaller --onedir backend/main.py --name backend --distpath resources/backend`
    - Include `--hidden-import` for sqlalchemy, alembic, pytesseract, pandas, etc.
    - Ensure `tessdata` and Tesseract `.exe` are copied into `resources/tesseract/`.
  - Create npm scripts:
    - `npm run dev` — concurrent Electron + Python dev.
    - `npm run build:python` — PyInstaller build.
    - `npm run build` — Vite build for renderer + main.
    - `npm run dist` — Full build + electron-builder packaging.
  - Add `scripts/dev-python.js` to auto-restart Python backend on file changes (optional but helpful).
  - Verify Python backend can resolve paths relative to `sys._MEIPASS` when bundled.

  **Must NOT do**:
  - Do NOT optimize bundle size yet (can be done in Wave 5).
  - Do NOT sign the executable (out of scope).

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `electron-best-practices` (packaging and distribution)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-6)
  - **Blocks**: Task 42 (final packaging), Final Verification
  - **Blocked By**: Task 1 (scaffolding), Task 4 (main process needs to know paths)

  **References**:
  - `electron-builder` docs — `extraResources`, `asarUnpack`, NSIS target.
  - PyInstaller docs — `--onedir`, `--hidden-import`, `sys._MEIPASS`.

  **Acceptance Criteria**:
  - [ ] `npm run build:python` creates `resources/backend/backend.exe` + dependencies.
  - [ ] `npm run dist` creates `out/` folder with `.exe` installer.
  - [ ] Installer runs on Windows and app launches without Python installed.

  **QA Scenarios**:
  ```
  Scenario: Python bundles correctly
    Tool: Bash
    Preconditions: All Python dependencies installed
    Steps:
      1. Run `npm run build:python`
      2. List `resources/backend/` directory
    Expected Result: Contains backend.exe and supporting .dll/.pyd files
    Evidence: .sisyphus/evidence/task-7-python-bundle.txt

  Scenario: Windows installer builds
    Tool: Bash
    Preconditions: Frontend built, Python bundled
    Steps:
      1. Run `npm run dist`
      2. List `out/` directory
    Expected Result: Contains .exe installer file
    Evidence: .sisyphus/evidence/task-7-installer.txt
  ```

  **Commit**: YES
  - Message: `chore(build): electron-builder + pyinstaller scripts for windows packaging`
  - Files: `package.json`, `electron-builder.yml`, `scripts/build-python.js`, `scripts/dev-python.js`

- [ ] 8. **PDF Text/Table Extraction Engine** — `deep`

  **What to do**:
  - Create `backend/services/pdf_parser.py` using PyMuPDF (`fitz`) for text extraction from PDF bank statements.
  - Implement table detection: try PyMuPDF built-in table extraction first, fallback to pdfplumber for irregular layouts.
  - Extract transaction rows with fields: date, description, amount, balance (if present), page_number, bounding_box.
  - Support password-protected PDFs: decrypt with pypdf first, then pass decrypted path to parser.
  - Implement bank format profiles: default generic parser + per-bank column mapping rules saved in `BankProfile` table.
  - Add manual column mapping fallback UI endpoint for when auto-parsing fails.
  - Return raw text + structured transactions + parsing confidence score.

  **Must NOT do**:
  - Do NOT implement OCR in this task (Task 15 handles scanned PDFs).
  - Do NOT hardcode bank-specific logic — use configurable profiles.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `context7` (PyMuPDF API reference)

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 9-17)
  - **Blocks**: Task 10 (bank profiles need parser), Task 11 (matching needs transactions), Task 14 (tagging needs transactions), Task 15 (OCR needs parser), Task 23 (PDF preview needs parser), Task 27-29 (exports need transactions), Task 32 (duplicate detection needs transactions)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI skeleton)

  **References**:
  - PyMuPDF docs: `https://pymupdf.readthedocs.io/` — Page text extraction, table finder
  - pdfplumber docs: `https://github.com/jsvine/pdfplumber` — Table extraction strategies
  - pypdf docs: `https://github.com/py-pdf/pypdf` — Password decryption

  **Acceptance Criteria**:
  - [ ] POST `/api/sessions/{id}/parse-pdf` accepts PDF file + optional password, returns parsed transactions.
  - [ ] Parser correctly extracts date, description, amount from sample bank statement PDF.
  - [ ] Password-protected PDF is decrypted and parsed successfully.
  - [ ] Parser returns confidence score (0.0-1.0) based on structure match.

  **QA Scenarios**:
  ```
  Scenario: Parse clean bank statement PDF
    Tool: Bash (curl)
    Preconditions: Backend running, sample PDF available
    Steps:
      1. POST /api/sessions/test/parse-pdf with sample_bank_statement.pdf
      2. Check response JSON
    Expected Result: Response contains transactions array with date, description, amount fields. HTTP 200.
    Evidence: .sisyphus/evidence/task-8-parse-pdf.json

  Scenario: Parse password-protected PDF
    Tool: Bash (curl)
    Preconditions: Backend running, encrypted PDF available
    Steps:
      1. POST /api/sessions/test/parse-pdf with encrypted.pdf + password="secret123"
      2. Check response
    Expected Result: Transactions extracted successfully, HTTP 200. No error about encryption.
    Evidence: .sisyphus/evidence/task-8-password-pdf.json
  ```

  **Commit**: YES
  - Message: `feat(parser): pdf text/table extraction with password support`
  - Files: `backend/services/pdf_parser.py`, `backend/api/sessions.py`

- [ ] 9. **CSV Ingestion + Client List Parser** — `quick`

  **What to do**:
  - Create `backend/services/csv_parser.py` to parse client list CSV.
  - Support multiple CSV formats: detect delimiter (comma, semicolon, tab), handle quoted fields.
  - Extract client names from configurable column (default: first column or "name" header).
  - Normalize names: strip extra spaces, lowercase, remove special characters.
  - Store parsed clients in `Alias` table with canonical_name and source.
  - Return parsed client list with normalization preview.
  - Add file validation: check CSV has at least 1 row, detect encoding issues.

  **Must NOT do**:
  - Do NOT implement fuzzy matching here (Task 11 handles matching).
  - Do NOT persist raw CSV contents — only normalized names.

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 10-17)
  - **Blocks**: Task 11 (matching needs client list), Task 14 (tagging needs clients)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI skeleton)

  **Acceptance Criteria**:
  - [ ] POST `/api/sessions/{id}/parse-csv` accepts CSV file, returns parsed client names.
  - [ ] Parser auto-detects delimiter and handles quoted fields.
  - [ ] Names are normalized (trimmed, lowercased, special chars removed).
  - [ ] Invalid CSV (empty, wrong format) returns clear error message.

  **QA Scenarios**:
  ```
  Scenario: Parse client CSV
    Tool: Bash (curl)
    Preconditions: Backend running, sample clients.csv available
    Steps:
      1. POST /api/sessions/test/parse-csv with clients.csv
      2. Check response
    Expected Result: Array of normalized client names. HTTP 200.
    Evidence: .sisyphus/evidence/task-9-parse-csv.json

  Scenario: Invalid CSV handling
    Tool: Bash (curl)
    Preconditions: Backend running
    Steps:
      1. POST /api/sessions/test/parse-csv with empty.csv
    Expected Result: HTTP 400 with error message "CSV file is empty or invalid"
    Evidence: .sisyphus/evidence/task-9-invalid-csv.json
  ```

  **Commit**: YES
  - Message: `feat(parser): csv ingestion with auto-delimiter and name normalization`
  - Files: `backend/services/csv_parser.py`, `backend/api/sessions.py`

- [ ] 10. **Bank Format Profiles + Transaction Normalization** — `unspecified-high`

  **What to do**:
  - Create `backend/services/bank_profiles.py` for saving/loading parsing rules per bank.
  - Profile schema: bank_name, date_format, date_column, description_column, amount_column, balance_column, debit_credit_columns, skip_rows, footer_rows.
  - Default "generic" profile with heuristics: detect date format, find amount by currency symbol, description by longest text field.
  - Allow users to create custom profiles via Settings panel (Task 24).
  - Transaction normalization: convert all amounts to positive/negative based on debit/credit, standardize date to ISO format, clean description text.
  - Store raw + normalized data in `Transaction` table.

  **Must NOT do**:
  - Do NOT build UI for profile creation here (Task 24 handles settings UI).
  - Do NOT support more than 5 built-in profiles in this task.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-9, 11-17)
  - **Blocks**: Task 20 (data table needs normalized transactions), Task 32 (duplicate detection)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 8 (PDF parser)

  **Acceptance Criteria**:
  - [ ] Bank profiles can be saved and loaded from SQLite.
  - [ ] Generic profile correctly normalizes transactions from unknown bank format.
  - [ ] Custom profile overrides generic heuristics when specified.
  - [ ] All dates normalized to ISO format (YYYY-MM-DD).
  - [ ] Amounts stored as decimal (cents) to avoid float errors.

  **QA Scenarios**:
  ```
  Scenario: Generic profile normalization
    Tool: Bash (curl)
    Preconditions: Backend running, sample PDF parsed
    Steps:
      1. Parse PDF with generic profile
      2. Check transaction dates and amounts
    Expected Result: Dates in ISO format, amounts as decimals, descriptions cleaned.
    Evidence: .sisyphus/evidence/task-10-normalization.json

  Scenario: Custom profile override
    Tool: Bash (curl)
    Preconditions: Backend running, custom profile saved
    Steps:
      1. Parse PDF specifying custom profile ID
      2. Verify column mapping matches custom profile
    Expected Result: Transactions mapped according to custom rules.
    Evidence: .sisyphus/evidence/task-10-custom-profile.json
  ```

  **Commit**: YES
  - Message: `feat(profiles): bank format profiles + transaction normalization`
  - Files: `backend/services/bank_profiles.py`, `backend/models.py` (if schema changes)

- [ ] 11. **Fuzzy Matching Engine** — `deep`

  **What to do**:
  - Create `backend/services/matcher.py` using RapidFuzz for fuzzy name matching.
  - Match transaction party names against: client list (from CSV) AND broker list (from settings).
  - Support aliases: check `Alias` table for canonical_name mappings.
  - Implement confidence scoring: return match score (0.0-1.0) for every match.
  - Configurable threshold: default 0.75, user-adjustable in settings.
  - Name normalization before matching: lowercase, strip spaces, remove punctuation.
  - Return structured match result: transaction_id, matched_name, match_type (client/broker), confidence, matched_against.
  - Support multiple matches per transaction (if name matches both client and broker).

  **Must NOT do**:
  - Do NOT apply tag priority here (Task 14 handles tag assignment).
  - Do NOT implement suspicious detection here (Task 13 handles rules).

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-10, 12-17)
  - **Blocks**: Task 14 (tagging needs match results), Task 20 (table shows confidence), Task 21 (manual tag editing), Task 26 (undo/redo on tags), Task 33 (visual confidence indicators), Task 35 (alias assignment)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI), Task 8 (transactions), Task 9 (client list)

  **Acceptance Criteria**:
  - [ ] Fuzzy matcher correctly identifies "John Smith" in transaction "JOHN SMITH TRANSFER" with high confidence (>0.8).
  - [ ] Threshold filters out low-confidence matches (<0.75).
  - [ ] Alias resolution works: "Jon Smith" → alias → "John Smith" → match.
  - [ ] Both client and broker names are matched against transactions.
  - [ ] Match performance: <100ms per 1000 transactions.

  **QA Scenarios**:
  ```
  Scenario: Fuzzy client matching
    Tool: Bash (curl)
    Preconditions: Backend running, transactions and clients loaded
    Steps:
      1. POST /api/sessions/test/match with threshold=0.75
      2. Check match results
    Expected Result: Client matches found with confidence scores. No matches below threshold.
    Evidence: .sisyphus/evidence/task-11-fuzzy-match.json

  Scenario: Fuzzy broker matching
    Tool: Bash (curl)
    Preconditions: Backend running, broker list configured
    Steps:
      1. Run matching against transactions with broker names
    Expected Result: Broker matches found with confidence scores.
    Evidence: .sisyphus/evidence/task-11-broker-match.json
  ```

  **Commit**: YES
  - Message: `feat(matcher): rapidfuzz engine for client + broker fuzzy matching`
  - Files: `backend/services/matcher.py`

- [ ] 12. **Broker List Manager** — `quick`

  **What to do**:
  - Create `backend/services/broker_manager.py` for CRUD operations on broker list.
  - Seed default broker list on first run (e.g., "Broker A", "Broker B", etc. — user-configurable).
  - Support exclusions: users can mark specific names as "excluded" (won't be matched even if in broker list).
  - API endpoints: GET /api/brokers, POST /api/brokers, PATCH /api/brokers/{id}, DELETE /api/brokers/{id}.
  - Import/export broker list as CSV.
  - Store in SQLite `Broker` table with is_active flag.

  **Must NOT do**:
  - Do NOT build settings UI here (Task 24 handles UI).
  - Do NOT implement fuzzy matching here (Task 11 handles matching).

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-11, 13-17)
  - **Blocks**: Task 11 (matcher needs broker list), Task 14 (tagging needs brokers), Task 24 (settings UI)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI), Task 5 (config system)

  **Acceptance Criteria**:
  - [ ] Broker list seeded with defaults on first run.
  - [ ] CRUD operations work via API.
  - [ ] Excluded brokers are not matched by fuzzy engine.
  - [ ] Import/export CSV works.

  **QA Scenarios**:
  ```
  Scenario: Broker CRUD
    Tool: Bash (curl)
    Preconditions: Backend running
    Steps:
      1. GET /api/brokers → see defaults
      2. POST /api/brokers with {"name":"New Broker"}
      3. DELETE /api/brokers/{id}
    Expected Result: List updates correctly.
    Evidence: .sisyphus/evidence/task-12-broker-crud.json
  ```

  **Commit**: YES
  - Message: `feat(brokers): broker list manager with exclusions`
  - Files: `backend/services/broker_manager.py`, `backend/api/brokers.py`

- [ ] 13. **Suspicious Rule Engine** — `deep`

  **What to do**:
  - Create `backend/services/rule_engine.py` for detecting suspicious transactions.
  - Built-in rules:
    1. Amount threshold: flag transactions above configurable threshold (default 10,000).
    2. Recurring empty remark: same amount + same party within 30 days with empty/short description.
    3. Round amounts: flag transactions with round numbers (e.g., 5000.00, 10000.00).
  - Custom rule support: user-defined rules via settings (e.g., "flag if description contains 'CASH' AND amount > 5000").
  - Rule schema: name, condition_json (field, operator, value), action (flag_as_suspicious), is_active.
  - Evaluate rules after parsing but before tagging.
  - Return "Why flagged" explanation per rule hit.

  **Must NOT do**:
  - Do NOT implement UI for rule editing here (Task 24 handles settings UI).
  - Do NOT overlap with fuzzy matching (rules are separate from name matching).

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-12, 14-17)
  - **Blocks**: Task 14 (tagging needs rule results), Task 24 (settings UI for rules), Task 33 (visual indicators)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI), Task 5 (config system)

  **Acceptance Criteria**:
  - [ ] Transactions above threshold flagged as suspicious.
  - [ ] Recurring empty-remark transactions detected.
  - [ ] Custom rules can be added and evaluated.
  - [ ] Each flagged transaction has "Why flagged" explanation.

  **QA Scenarios**:
  ```
  Scenario: Amount threshold rule
    Tool: Bash (curl)
    Preconditions: Backend running, transactions loaded
    Steps:
      1. Set threshold=5000
      2. Run rule engine
      3. Check flagged transactions
    Expected Result: Transactions > 5000 flagged with reason "Amount exceeds threshold".
    Evidence: .sisyphus/evidence/task-13-threshold.json

  Scenario: Custom rule
    Tool: Bash (curl)
    Preconditions: Backend running
    Steps:
      1. Add custom rule: description contains "CASH" AND amount > 5000
      2. Run rule engine
    Expected Result: Matching transactions flagged with custom rule name in reason.
    Evidence: .sisyphus/evidence/task-13-custom-rule.json
  ```

  **Commit**: YES
  - Message: `feat(rules): suspicious rule engine with custom rules`
  - Files: `backend/services/rule_engine.py`

- [ ] 14. **Tagging Engine** — `deep`

  **What to do**:
  - Create `backend/services/tagger.py` to assign tags based on matcher + rule engine results.
  - Tag types: `client`, `broker`, `suspicious`.
  - Multi-tag support: a transaction can have multiple tags (e.g., client + suspicious).
  - Tag priority: default `client > broker > suspicious`. If conflict, higher priority wins for primary display, but all tags stored.
  - Confidence score: every auto-generated tag has confidence (0.0-1.0).
  - "Why flagged" explanation: stored per tag (e.g., "Fuzzy match: 'John Smith' vs 'JOHN SMITH TRANSFER' (score: 0.92)").
  - Manual tag support: allow user to add/remove tags (tracked as is_manual=true).
  - Auto-tagging runs after parsing + matching + rules evaluation.

  **Must NOT do**:
  - Do NOT build manual review UI here (Task 21 handles UI).
  - Do NOT implement undo/redo here (Task 26 handles undo).

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-13, 15-17)
  - **Blocks**: Task 20 (table shows tags), Task 21 (manual editing), Task 26 (undo/redo), Task 27-29 (exports filtered by tag)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI), Task 8 (transactions), Task 11 (matches), Task 13 (rules)

  **Acceptance Criteria**:
  - [ ] Auto-tags applied after parsing with correct types.
  - [ ] Multi-tag support works (transaction can have client + suspicious).
  - [ ] Tag priority respected for primary display.
  - [ ] Every auto-tag has confidence score and explanation.
  - [ ] Manual tags tracked separately (is_manual=true).

  **QA Scenarios**:
  ```
  Scenario: Auto-tagging
    Tool: Bash (curl)
    Preconditions: Backend running, transactions + matches + rules ready
    Steps:
      1. POST /api/sessions/test/auto-tag
      2. GET /api/sessions/test/transactions
    Expected Result: Transactions have tags array with type, confidence, reason.
    Evidence: .sisyphus/evidence/task-14-auto-tag.json

  Scenario: Multi-tag
    Tool: Bash (curl)
    Preconditions: Transaction matches both client and suspicious
    Steps:
      1. Check transaction tags
    Expected Result: Both "client" and "suspicious" tags present.
    Evidence: .sisyphus/evidence/task-14-multi-tag.json
  ```

  **Commit**: YES
  - Message: `feat(tagger): multi-tag engine with priority + confidence`
  - Files: `backend/services/tagger.py`

- [ ] 15. **OCR Pipeline** — `unspecified-high`

  **What to do**:
  - Create `backend/services/ocr.py` for scanned PDF support.
  - Use pytesseract with bundled Tesseract binary.
  - Convert PDF pages to images (pdf2image or PyMuPDF render), then run OCR.
  - Preprocess images: deskew, contrast enhancement, noise reduction (Pillow/OpenCV).
  - Extract text from images, then pass through same parser pipeline as text-based PDFs.
  - Performance: cache OCR results per page to avoid re-processing.
  - Handle multi-page PDFs: process pages in batches, report progress via WebSocket.

  **Must NOT do**:
  - Do NOT bundle Tesseract in this task (Task 7 handles bundling).
  - Do NOT support languages other than English in V1.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-14, 16-17)
  - **Blocks**: Task 8 (parser can now handle OCR output), Task 32 (duplicate detection on OCR text)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI)

  **Acceptance Criteria**:
  - [ ] Scanned PDF is converted to images and text extracted.
  - [ ] OCR text is parsed into transactions correctly.
  - [ ] Progress reported during multi-page OCR.
  - [ ] OCR results cached (second parse is faster).

  **QA Scenarios**:
  ```
  Scenario: OCR scanned PDF
    Tool: Bash (curl)
    Preconditions: Backend running, scanned PDF available, Tesseract installed
    Steps:
      1. POST /api/sessions/test/parse-pdf with scanned.pdf + ocr=true
      2. Check transactions
    Expected Result: Transactions extracted from scanned PDF. HTTP 200.
    Evidence: .sisyphus/evidence/task-15-ocr.json
  ```

  **Commit**: YES
  - Message: `feat(ocr): tesseract ocr pipeline for scanned pdfs`
  - Files: `backend/services/ocr.py`

- [ ] 16. **Session Save/Load + Autosave + Crash Recovery** — `unspecified-high`

  **What to do**:
  - Implement session persistence: save full audit state to SQLite.
  - Session state includes: transactions, tags, settings snapshot, file paths, parsing results.
  - Autosave: save every 30 seconds (configurable) during active audit.
  - Session list: GET /api/sessions returns all saved sessions with metadata.
  - Load session: restore full state from SQLite.
  - Crash recovery: on app startup, check for unsaved session (last modified > last saved), prompt user to restore.
  - Session export/import: save session as JSON file for backup/transfer.

  **Must NOT do**:
  - Do NOT implement UI for session management here (frontend handles this).
  - Do NOT auto-restore without user confirmation (privacy/security).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-15, 17)
  - **Blocks**: Task 18 (frontend needs session API), Task 42 (crash recovery test)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI)

  **Acceptance Criteria**:
  - [ ] Session saved to SQLite with all state.
  - [ ] Autosave triggers every 30s during active work.
  - [ ] Session restored correctly with all tags and transactions.
  - [ ] Crash recovery detects unsaved changes on startup.

  **QA Scenarios**:
  ```
  Scenario: Save and load session
    Tool: Bash (curl)
    Preconditions: Backend running, active session with transactions
    Steps:
      1. POST /api/sessions/test/save
      2. GET /api/sessions → see session in list
      3. POST /api/sessions/{id}/load
    Expected Result: Full state restored.
    Evidence: .sisyphus/evidence/task-16-session.json
  ```

  **Commit**: YES
  - Message: `feat(sessions): save/load + autosave + crash recovery`
  - Files: `backend/services/session_manager.py`

- [ ] 17. **Audit Trail Logger** — `quick`

  **What to do**:
  - Create `backend/services/audit_logger.py` to track all changes.
  - Log entries: timestamp, action (add_tag, remove_tag, edit_tag, change_setting), entity_type, entity_id, old_value, new_value, is_auto (true for auto-tagging, false for manual).
  - Log all auto-tagging actions (source: system).
  - Log all manual changes (source: user).
  - API: GET /api/sessions/{id}/audit-log returns paginated log.
  - Store in SQLite `AuditLog` table.

  **Must NOT do**:
  - Do NOT build audit log UI here (frontend can display this later).
  - Do NOT log read-only operations.

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8-16)
  - **Blocks**: Task 21 (manual changes need logging), Task 26 (undo/redo needs log)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI)

  **Acceptance Criteria**:
  - [ ] Auto-tagging logged with is_auto=true.
  - [ ] Manual tag changes logged with is_auto=false.
  - [ ] Audit log returns entries in chronological order.

  **QA Scenarios**:
  ```
  Scenario: Audit log captures auto and manual changes
    Tool: Bash (curl)
    Preconditions: Backend running, tagged session
    Steps:
      1. GET /api/sessions/test/audit-log
    Expected Result: Entries for auto-tagging and any manual changes.
    Evidence: .sisyphus/evidence/task-17-audit-log.json
  ```

  **Commit**: YES
  - Message: `feat(audit): audit trail logger for auto vs manual changes`
  - Files: `backend/services/audit_logger.py`

- [ ] 18. **App Shell + Layout** — `visual-engineering`

  **What to do**:
  - Create main application layout: sidebar (file list, session list), main content area (table + PDF preview), toolbar (actions, filters, search), status bar (progress, stats).
  - Implement dark/light theme toggle using Tailwind CSS dark mode.
  - Responsive layout: collapsible sidebar, resizable panels between table and PDF preview.
  - Empty state: welcome screen with drag-drop area when no files loaded.
  - App header: logo, session name, save indicator (unsaved changes).
  - Use Zustand for global UI state (sidebar open/closed, theme, active panel).

  **Must NOT do**:
  - Do NOT implement actual table or PDF components here (Tasks 20, 23).
  - Do NOT add business logic — pure layout and shell.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `uncodixfy`, `tailwind-design-system`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 19-26)
  - **Blocks**: Task 19 (drag-drop in shell), Task 20 (table in content area), Task 21 (tags in table), Task 22 (filters in toolbar), Task 23 (PDF in panel), Task 24 (settings modal), Task 25 (progress in status bar), Task 26 (undo in toolbar), Tasks 27-30 (exports from toolbar)
  - **Blocked By**: Task 1 (scaffolding), Task 4 (Electron main process), Task 6 (shared types)

  **Acceptance Criteria**:
  - [ ] App renders with sidebar, toolbar, content area, status bar.
  - [ ] Dark/light theme toggle works.
  - [ ] Sidebar collapsible.
  - [ ] Empty state shown when no session active.

  **QA Scenarios**:
  ```
  Scenario: App layout renders
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Screenshot app window
    Expected Result: Layout visible with all regions.
    Evidence: .sisyphus/evidence/task-18-layout.png

  Scenario: Theme toggle
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Click theme toggle
      2. Check body class
    Expected Result: Body has "dark" or "light" class.
    Evidence: .sisyphus/evidence/task-18-theme.png
  ```

  **Commit**: YES
  - Message: `feat(ui): app shell + layout + theme`
  - Files: `src/components/Layout.tsx`, `src/stores/ui.ts`

- [ ] 19. **Drag & Drop File Input + Password Dialog** — `visual-engineering`

  **What to do**:
  - Implement drag & drop zone for PDF and CSV files.
  - File validation: check extension (.pdf, .csv), file size (<50MB), MIME type.
  - Multi-file support: queue multiple files for batch processing.
  - Password dialog: modal for password-protected PDFs.
  - File preview: show file name, size, type before processing.
  - Progress indication during upload/parse.
  - Send files to backend via API (Task 8, 9).

  **Must NOT do**:
  - Do NOT implement batch processing queue UI here (Task 25 handles progress UI).
  - Do NOT parse files in frontend — send to backend.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18, 20-26)
  - **Blocks**: Task 20 (table needs parsed data), Task 31 (batch processing)
  - **Blocked By**: Task 1 (scaffolding), Task 6 (API types), Task 18 (app shell)

  **Acceptance Criteria**:
  - [ ] Drag & drop accepts PDF and CSV.
  - [ ] Invalid files rejected with error message.
  - [ ] Password dialog appears for encrypted PDFs.
  - [ ] Files sent to backend successfully.

  **QA Scenarios**:
  ```
  Scenario: Drag and drop PDF
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Drag sample.pdf to drop zone
      2. Wait for processing
    Expected Result: File accepted, processing starts.
    Evidence: .sisyphus/evidence/task-19-dragdrop.png

  Scenario: Password protected PDF
    Tool: Playwright
    Preconditions: App running, encrypted.pdf available
    Steps:
      1. Drag encrypted.pdf
      2. Enter password in dialog
      3. Submit
    Expected Result: PDF decrypted and parsed.
    Evidence: .sisyphus/evidence/task-19-password.png
  ```

  **Commit**: YES
  - Message: `feat(ui): drag-drop file input + password dialog`
  - Files: `src/components/FileDropZone.tsx`, `src/components/PasswordDialog.tsx`

- [ ] 20. **Data Table Component** — `visual-engineering`

  **What to do**:
  - Build transaction table using TanStack Table v8.
  - Columns: date, description, amount, party_name, tags (badge display), confidence (visual indicator), actions.
  - Virtualized scrolling for large datasets (react-window or @tanstack/react-virtual).
  - Sortable columns: click header to sort asc/desc.
  - Column resize: draggable column borders.
  - Row selection: checkbox for bulk actions.
  - Inline tag display: colored badges for client (blue), broker (green), suspicious (red).
  - Amount formatting: currency symbol, decimal places, negative in red.
  - Date formatting: locale-aware.

  **Must NOT do**:
  - Do NOT implement filters here (Task 22 handles search/filters).
  - Do NOT implement bulk actions here (Task 21 handles actions).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `uncodixfy`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18-19, 21-26)
  - **Blocks**: Task 21 (tags in table), Task 22 (filters on table), Task 23 (sync with PDF), Task 26 (undo/redo on table), Task 27-30 (exports from table data), Task 38 (auto-sync), Task 41 (performance)
  - **Blocked By**: Task 1 (scaffolding), Task 6 (API types), Task 9 (transactions), Task 10 (normalization), Task 14 (tagging), Task 16 (sessions), Task 18 (layout)

  **Acceptance Criteria**:
  - [ ] Table renders transactions with all columns.
  - [ ] Sorting works on date, amount columns.
  - [ ] Column resize works.
  - [ ] Virtual scrolling handles 10,000+ rows smoothly.
  - [ ] Tags displayed as colored badges.

  **QA Scenarios**:
  ```
  Scenario: Table renders transactions
    Tool: Playwright
    Preconditions: App with parsed session
    Steps:
      1. Screenshot table
    Expected Result: Rows visible with tags, amounts, dates.
    Evidence: .sisyphus/evidence/task-20-table.png

  Scenario: Virtual scrolling performance
    Tool: Playwright
    Preconditions: Session with 5000+ transactions
    Steps:
      1. Scroll to bottom of table
      2. Measure time
    Expected Result: Scroll completes in <1s.
    Evidence: .sisyphus/evidence/task-20-scroll.perf
  ```

  **Commit**: YES
  - Message: `feat(ui): tanstack table with virtualization + sorting`
  - Files: `src/components/TransactionTable.tsx`

- [ ] 21. **Tag Display + Manual Tag Editing + Bulk Actions** — `visual-engineering`

  **What to do**:
  - Display tags inline in table rows with color coding and confidence indicator.
  - Click tag to see "Why flagged" tooltip/explanation.
  - Manual tag editing: click to add/remove tags via dropdown.
  - Bulk actions: select multiple rows, apply tag/remove tag/exclude from matching.
  - Tag colors: client=blue, broker=green, suspicious=red, low-confidence=muted.
  - Visual confidence indicators: progress bar or dot (green=high, yellow=medium, red=low).

  **Must NOT do**:
  - Do NOT implement undo/redo here (Task 26).
  - Do NOT implement keyboard shortcuts here (Task 34).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18-20, 22-26)
  - **Blocks**: Task 26 (undo/redo on tags), Task 33 (visual indicators), Task 34 (shortcuts), Task 35 (alias assignment), Task 38 (auto-sync)
  - **Blocked By**: Task 1 (scaffolding), Task 6 (API types), Task 11 (matcher), Task 14 (tagger), Task 17 (audit logger), Task 20 (table)

  **Acceptance Criteria**:
  - [ ] Tags displayed with correct colors.
  - [ ] Click tag shows "Why flagged" explanation.
  - [ ] Manual add/remove tag updates table and backend.
  - [ ] Bulk actions work on selected rows.

  **QA Scenarios**:
  ```
  Scenario: Manual tag editing
    Tool: Playwright
    Preconditions: App with tagged transactions
    Steps:
      1. Click tag on row
      2. Remove "client" tag
      3. Save
    Expected Result: Tag removed, backend updated.
    Evidence: .sisyphus/evidence/task-21-manual-tag.png

  Scenario: Bulk remove tags
    Tool: Playwright
    Preconditions: Multiple rows selected
    Steps:
      1. Select 5 rows
      2. Click "Remove all tags"
    Expected Result: Tags removed from all selected rows.
    Evidence: .sisyphus/evidence/task-21-bulk-remove.png
  ```

  **Commit**: YES
  - Message: `feat(ui): tag display + manual editing + bulk actions`
  - Files: `src/components/TagBadge.tsx`, `src/components/BulkActions.tsx`

- [ ] 22. **Search + Advanced Filters** — `visual-engineering`

  **What to do**:
  - Implement search bar: full-text search across description, party_name, tags.
  - Advanced filters panel: amount range (min/max), date range (from/to), tag type (multi-select), confidence range, broker exclusion.
  - Real-time filtering: table updates as filters change.
  - Save filter presets: users can save and load common filter combinations.
  - Filter indicators: show active filters as removable chips.
  - Clear all filters button.

  **Must NOT do**:
  - Do NOT implement export filtered view here (Task 39 handles filtered export).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18-21, 23-26)
  - **Blocks**: Task 27-30 (exports use filtered data), Task 39 (filtered export)
  - **Blocked By**: Task 1 (scaffolding), Task 6 (API types), Task 14 (tagging), Task 20 (table)

  **Acceptance Criteria**:
  - [ ] Search filters transactions by text.
  - [ ] Amount range filter works.
  - [ ] Date range filter works.
  - [ ] Tag filter shows only selected tag types.
  - [ ] Filter presets can be saved and loaded.

  **QA Scenarios**:
  ```
  Scenario: Search transactions
    Tool: Playwright
    Preconditions: App with transactions
    Steps:
      1. Type "amazon" in search bar
    Expected Result: Table shows only transactions containing "amazon".
    Evidence: .sisyphus/evidence/task-22-search.png

  Scenario: Amount filter
    Tool: Playwright
    Preconditions: App with transactions
    Steps:
      1. Set amount min=1000, max=5000
    Expected Result: Only transactions in range visible.
    Evidence: .sisyphus/evidence/task-22-amount-filter.png
  ```

  **Commit**: YES
  - Message: `feat(ui): search + advanced filters with presets`
  - Files: `src/components/SearchBar.tsx`, `src/components/FilterPanel.tsx`

- [ ] 23. **PDF Preview Panel** — `visual-engineering`

  **What to do**:
  - Implement PDF viewer panel using react-pdf or PDF.js via iframe.
  - Side-by-side with table: resizable split pane.
  - Page navigation: prev/next, page number input, zoom in/out.
  - Highlight tagged transactions on PDF: draw colored rectangles over bounding boxes (from parser).
  - Color coding: client=blue, broker=green, suspicious=red highlights.
  - Click transaction in table → scroll PDF to page and highlight.
  - Click highlight in PDF → select transaction in table.

  **Must NOT do**:
  - Do NOT implement bidirectional sync here (Task 38 handles full sync).
  - Do NOT implement PDF export here (Task 29 handles export).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18-22, 24-26)
  - **Blocks**: Task 29 (highlighted PDF export), Task 30 (clean PDF report), Task 38 (auto-sync)
  - **Blocked By**: Task 1 (scaffolding), Task 6 (API types), Task 8 (parser bounding boxes), Task 18 (layout)

  **Acceptance Criteria**:
  - [ ] PDF renders in preview panel.
  - [ ] Tagged transactions highlighted with colored boxes.
  - [ ] Page navigation works.
  - [ ] Click table row scrolls PDF to correct page.

  **QA Scenarios**:
  ```
  Scenario: PDF preview with highlights
    Tool: Playwright
    Preconditions: App with parsed PDF
    Steps:
      1. Open PDF preview panel
      2. Screenshot
    Expected Result: PDF visible with colored highlights on tagged transactions.
    Evidence: .sisyphus/evidence/task-23-pdf-preview.png

  Scenario: Table to PDF navigation
    Tool: Playwright
    Preconditions: App with transactions
    Steps:
      1. Click transaction in table
    Expected Result: PDF scrolls to page containing that transaction.
    Evidence: .sisyphus/evidence/task-23-navigation.png
  ```

  **Commit**: YES
  - Message: `feat(ui): pdf preview panel with transaction highlights`
  - Files: `src/components/PdfPreview.tsx`

- [ ] 24. **Settings Panel** — `visual-engineering`

  **What to do**:
  - Create settings modal/page with tabs:
    - General: theme, auto-save interval, language.
    - Broker List: editable table of brokers, add/remove/import/export, exclusion toggle.
    - Rules: suspicious threshold slider (0-100,000), custom rule editor (condition builder), rule enable/disable toggles.
    - Bank Profiles: list of saved profiles, create/edit/delete, test parser button.
    - Aliases: manage name aliases (canonical → alias mappings).
  - All settings persisted to backend (Task 5).
  - Reset to defaults button per tab.
  - Validation: prevent empty broker names, invalid rule conditions.

  **Must NOT do**:
  - Do NOT implement rule engine logic here (Task 13 handles logic).
  - Do NOT implement bank profile parser here (Task 10 handles parser).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18-23, 25-26)
  - **Blocks**: Task 5 (config system receives UI), Task 12 (broker manager), Task 13 (rule engine), Task 35 (alias assignment)
  - **Blocked By**: Task 1 (scaffolding), Task 5 (config API), Task 6 (API types), Task 18 (layout)

  **Acceptance Criteria**:
  - [ ] Settings panel opens from toolbar/menu.
  - [ ] Broker list editable with add/remove.
  - [ ] Threshold slider updates value in real-time.
  - [ ] Custom rules can be added with condition builder.
  - [ ] Settings persist after app restart.

  **QA Scenarios**:
  ```
  Scenario: Change threshold
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Open settings
      2. Move threshold slider to 5000
      3. Save
      4. Refresh app
    Expected Result: Threshold still 5000.
    Evidence: .sisyphus/evidence/task-24-threshold.png

  Scenario: Add broker
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Open settings → Broker List
      2. Add "New Broker"
      3. Save
    Expected Result: Broker appears in list after refresh.
    Evidence: .sisyphus/evidence/task-24-broker.png
  ```

  **Commit**: YES
  - Message: `feat(ui): settings panel with broker/rules/profiles`
  - Files: `src/components/SettingsPanel.tsx`

- [ ] 25. **Progress Bar + Background Processing UI** — `visual-engineering`

  **What to do**:
  - Implement progress indicators for: file parsing, OCR, matching, tagging, export.
  - Background processing: show spinner/progress bar in status bar.
  - Cancel operation button for long-running tasks.
  - Batch queue sidebar: list of files being processed with per-file progress.
  - Toast notifications: success/error messages for completed operations.
  - WebSocket integration: receive real-time progress updates from backend.

  **Must NOT do**:
  - Do NOT implement batch processing logic here (Task 31 handles logic).
  - Do NOT implement multi-file queue backend here.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18-24, 26)
  - **Blocks**: Task 31 (batch processing uses progress UI)
  - **Blocked By**: Task 1 (scaffolding), Task 4 (WebSocket via preload), Task 6 (API types), Task 18 (layout)

  **Acceptance Criteria**:
  - [ ] Progress bar shows during parsing.
  - [ ] Cancel button stops operation.
  - [ ] Toast notifications appear on completion.
  - [ ] WebSocket receives progress updates.

  **QA Scenarios**:
  ```
  Scenario: Parsing progress
    Tool: Playwright
    Preconditions: App running, large PDF ready
    Steps:
      1. Drop large PDF
      2. Observe progress bar
    Expected Result: Progress bar fills, toast on completion.
    Evidence: .sisyphus/evidence/task-25-progress.png
  ```

  **Commit**: YES
  - Message: `feat(ui): progress bar + toasts + background processing`
  - Files: `src/components/ProgressBar.tsx`, `src/components/Toast.tsx`

- [ ] 26. **Undo/Redo System** — `unspecified-high`

  **What to do**:
  - Implement undo/redo for: tag changes, alias assignments, broker exclusions.
  - Use command pattern: each action is a command with execute() and undo().
  - History stack: limited to 100 actions (configurable), persist in memory.
  - Keyboard shortcuts: Ctrl+Z (undo), Ctrl+Y (redo).
  - Visual indicator: undo/redo buttons in toolbar, disabled when no history.
  - Batch operations: undo applies to entire batch.
  - Sync with backend: undo sends reverse operation to API.

  **Must NOT do**:
  - Do NOT make import actions undoable (out of scope).
  - Do NOT persist undo history across app restarts.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 18-25)
  - **Blocks**: Task 34 (keyboard shortcuts for undo)
  - **Blocked By**: Task 1 (scaffolding), Task 6 (API types), Task 11 (matcher), Task 14 (tagger), Task 17 (audit logger), Task 20 (table), Task 21 (tag editing)

  **Acceptance Criteria**:
  - [ ] Undo removes last tag change.
  - [ ] Redo reapplies undone change.
  - [ ] History stack limited to 100.
  - [ ] Ctrl+Z / Ctrl+Y work.
  - [ ] Batch undo works.

  **QA Scenarios**:
  ```
  Scenario: Undo tag removal
    Tool: Playwright
    Preconditions: App with tagged transaction
    Steps:
      1. Remove tag from row
      2. Press Ctrl+Z
    Expected Result: Tag restored.
    Evidence: .sisyphus/evidence/task-26-undo.png
  ```

  **Commit**: YES
  - Message: `feat(ui): undo/redo system for tag changes`
  - Files: `src/stores/history.ts`, `src/hooks/useUndoRedo.ts`

- [ ] 27. **CSV Export Engine** — `unspecified-high`

  **What to do**:
  - Create `backend/services/export_csv.py` for CSV export.
  - Export modes: all transactions, clients only, brokers only, suspicious only, all tagged.
  - Include all transaction fields + tags + confidence scores.
  - Support filtered export: export only current view (Task 39).
  - CSV formatting: proper escaping, UTF-8 BOM for Excel compatibility, configurable delimiter.
  - Frontend: export dialog with format selection, preview row count.

  **Must NOT do**:
  - Do NOT implement Excel export here (Task 28 handles Excel).
  - Do NOT implement PDF export here (Task 29 handles PDF).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 28-35)
  - **Blocks**: Task 39 (filtered export)
  - **Blocked By**: Task 1 (scaffolding), Task 3 (FastAPI), Task 6 (API types), Task 14 (tagging), Task 20 (table), Task 22 (filters)

  **Acceptance Criteria**:
  - [ ] All 5 export modes produce valid CSV files.
  - [ ] CSV opens correctly in Excel (UTF-8 BOM).
  - [ ] Filtered export includes only matching rows.

  **QA Scenarios**:
  ```
  Scenario: Export client CSV
    Tool: Bash (curl)
    Preconditions: Backend running, tagged session
    Steps:
      1. GET /api/sessions/test/export?format=csv&type=client
      2. Check response
    Expected Result: CSV file with client-tagged transactions only.
    Evidence: .sisyphus/evidence/task-27-csv-export.csv
  ```

  **Commit**: YES
  - Message: `feat(export): csv export engine for all filter modes`
  - Files: `backend/services/export_csv.py`, `src/components/ExportDialog.tsx`

- [ ] 28. **Excel Export Engine** — `unspecified-high`

  **What to do**:
  - Create `backend/services/export_excel.py` using openpyxl.
  - Same export modes as CSV (all, client, broker, suspicious, tagged).
  - Styled headers: bold, background color, freeze top row.
  - Multiple sheets: summary sheet + detail sheet.
  - Summary sheet: counts by tag type, total amounts, date range.
  - Auto-width columns based on content.
  - Color coding: tag colors in cells.

  **Must NOT do**:
  - Do NOT implement charts/graphs in Excel (out of scope).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 27, 29-35)
  - **Blocks**: Task 39 (filtered export)
  - **Blocked By**: Task 1 (scaffolding), Task 3 (FastAPI), Task 6 (API types), Task 14 (tagging), Task 20 (table)

  **Acceptance Criteria**:
  - [ ] Excel file opens with styled headers.
  - [ ] Summary sheet has correct totals.
  - [ ] Multiple sheets present.

  **QA Scenarios**:
  ```
  Scenario: Export Excel
    Tool: Bash (curl)
    Preconditions: Backend running, tagged session
    Steps:
      1. GET /api/sessions/test/export?format=excel&type=all
      2. Check response headers (Content-Type)
    Expected Result: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
    Evidence: .sisyphus/evidence/task-28-excel-export.xlsx
  ```

  **Commit**: YES
  - Message: `feat(export): excel export with styling + summary sheets`
  - Files: `backend/services/export_excel.py`

- [ ] 29. **Highlighted PDF Export** — `unspecified-high`

  **What to do**:
  - Create `backend/services/export_pdf.py` using PyMuPDF.
  - Annotate original PDF with colored highlights over tagged transactions.
  - Annotation legend: page with color key (client=blue, broker=green, suspicious=red).
  - Add annotation popup with tag type, confidence, reason.
  - Preserve original PDF quality and structure.
  - Export modes: highlight all tags, or filter by tag type.

  **Must NOT do**:
  - Do NOT create new PDF from scratch — annotate original.
  - Do NOT implement clean summary PDF here (Task 30 handles that).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 27-28, 30-35)
  - **Blocks**: Task 39 (filtered export)
  - **Blocked By**: Task 1 (scaffolding), Task 3 (FastAPI), Task 6 (API types), Task 8 (parser bounding boxes), Task 14 (tagging), Task 23 (PDF preview)

  **Acceptance Criteria**:
  - [ ] Exported PDF has colored highlights on tagged transactions.
  - [ ] Legend page included.
  - [ ] Annotations contain tag info.

  **QA Scenarios**:
  ```
  Scenario: Highlighted PDF export
    Tool: Bash (curl)
    Preconditions: Backend running, tagged session
    Steps:
      1. GET /api/sessions/test/export?format=highlighted-pdf
      2. Open downloaded PDF
    Expected Result: Colored highlights visible on transactions.
    Evidence: .sisyphus/evidence/task-29-highlighted.pdf
  ```

  **Commit**: YES
  - Message: `feat(export): highlighted pdf export with annotations`
  - Files: `backend/services/export_pdf.py`

- [ ] 30. **Clean PDF Summary Report** — `unspecified-high`

  **What to do**:
  - Create `backend/services/export_report.py` for shareable summary PDF.
  - Generate new PDF (not annotate original) with:
    - Cover page: session name, date, file names, summary stats.
    - Summary tables: counts by tag, total amounts, top clients/brokers.
    - Detail pages: paginated transaction list with tags.
  - Professional layout: headers, footers, page numbers.
  - Export option in frontend: "Generate Report" button.

  **Must NOT do**:
  - Do NOT include raw PDF pages (this is a summary report, not original).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 27-29, 31-35)
  - **Blocks**: None
  - **Blocked By**: Task 1 (scaffolding), Task 3 (FastAPI), Task 6 (API types), Task 14 (tagging)

  **Acceptance Criteria**:
  - [ ] Report PDF has cover page with stats.
  - [ ] Summary tables correct.
  - [ ] Detail pages paginated.

  **QA Scenarios**:
  ```
  Scenario: Generate summary report
    Tool: Bash (curl)
    Preconditions: Backend running, tagged session
    Steps:
      1. GET /api/sessions/test/export?format=report
    Expected Result: PDF with cover page and summary tables.
    Evidence: .sisyphus/evidence/task-30-report.pdf
  ```

  **Commit**: YES
  - Message: `feat(export): clean pdf summary report`
  - Files: `backend/services/export_report.py`

- [ ] 31. **Batch Processing** — `unspecified-high`

  **What to do**:
  - Implement multi-file queue: users can drop multiple PDFs + CSVs.
  - Queue sidebar: list files with status (queued, processing, done, error).
  - Aggregate results: all transactions merged into single audit view with source file indicator.
  - Per-file progress: individual progress bars in queue.
  - Process files sequentially or in parallel (configurable, default sequential to avoid memory issues).
  - Allow adding files to existing session.

  **Must NOT do**:
  - Do NOT implement queue persistence across app restarts.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 27-30, 32-35)
  - **Blocks**: Task 42 (integration test)
  - **Blocked By**: Task 1 (scaffolding), Task 3 (FastAPI), Task 6 (API types), Task 8 (parser), Task 9 (CSV), Task 19 (drag-drop), Task 25 (progress UI)

  **Acceptance Criteria**:
  - [ ] Multiple files can be queued.
  - [ ] Queue shows per-file status.
  - [ ] All transactions aggregated in single view.
  - [ ] Source file visible per transaction.

  **QA Scenarios**:
  ```
  Scenario: Batch process files
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Drop 3 PDFs + 1 CSV
      2. Wait for completion
    Expected Result: All files processed, transactions in table.
    Evidence: .sisyphus/evidence/task-31-batch.png
  ```

  **Commit**: YES
  - Message: `feat(batch): multi-file processing queue`
  - Files: `src/components/BatchQueue.tsx`, `backend/services/batch_processor.py`

- [ ] 32. **Duplicate & Pattern Detection Engine** — `deep`

  **What to do**:
  - Create `backend/services/pattern_detector.py` for detecting duplicates and patterns.
  - Duplicate detection: exact duplicate transactions (same date, amount, description within 1 day).
  - Near-duplicate detection: similar descriptions + same amount (fuzzy match).
  - Recurring pattern detection: same amount + same party at regular intervals (weekly, monthly).
  - Round-number pattern: flag round amounts (5000, 10000, etc.) as potential structuring.
  - Weekend/holiday detection: flag transactions on non-business days.
  - Pattern results shown as additional tags (e.g., "duplicate", "recurring", "round-amount").

  **Must NOT do**:
  - Do NOT automatically tag as suspicious — patterns are informational.
  - Do NOT implement complex ML models — rule-based only.

  **Recommended Agent Profile**:
  - **Category**: `deep`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 27-31, 33-35)
  - **Blocks**: Task 33 (visual indicators for patterns)
  - **Blocked By**: Task 1 (scaffolding), Task 2 (DB models), Task 3 (FastAPI), Task 8 (transactions), Task 10 (normalization), Task 15 (OCR)

  **Acceptance Criteria**:
  - [ ] Duplicate transactions detected.
  - [ ] Recurring patterns identified.
  - [ ] Round amounts flagged.
  - [ ] Pattern tags displayed in table.

  **QA Scenarios**:
  ```
  Scenario: Detect duplicates
    Tool: Bash (curl)
    Preconditions: Backend running, session with duplicate transactions
    Steps:
      1. POST /api/sessions/test/detect-patterns
      2. Check transactions
    Expected Result: Duplicate transactions have "duplicate" tag.
    Evidence: .sisyphus/evidence/task-32-duplicates.json
  ```

  **Commit**: YES
  - Message: `feat(patterns): duplicate + recurring + round-amount detection`
  - Files: `backend/services/pattern_detector.py`

- [ ] 33. **Visual Confidence Indicators** — `visual-engineering`

  **What to do**:
  - Add visual indicators for match confidence in table:
    - High confidence (>0.8): solid color badge.
    - Medium confidence (0.6-0.8): badge with warning icon.
    - Low confidence (<0.6): dashed border, muted color, warning tooltip.
  - Color coding: green=high, yellow=medium, red=low.
  - Tooltip on hover: show exact confidence score, matched against, match algorithm.
  - "Why flagged" panel: slide-out panel showing detailed explanation for selected transaction.
  - Aggregate confidence: session-level average confidence score in status bar.

  **Must NOT do**:
  - Do NOT change matching logic here (Task 11 handles logic).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 27-32, 34-35)
  - **Blocks**: None
  - **Blocked By**: Task 1 (scaffolding), Task 6 (API types), Task 11 (matcher confidence), Task 14 (tagger), Task 20 (table), Task 21 (tag display)

  **Acceptance Criteria**:
  - [ ] Confidence badges have correct colors/icons.
  - [ ] Tooltip shows score and details.
  - [ ] Why-flagged panel displays for selected row.

  **QA Scenarios**:
  ```
  Scenario: Confidence indicators
    Tool: Playwright
    Preconditions: App with tagged transactions
    Steps:
      1. Hover over low-confidence tag
    Expected Result: Tooltip shows confidence score <0.6.
    Evidence: .sisyphus/evidence/task-33-confidence.png
  ```

  **Commit**: YES
  - Message: `feat(ui): visual confidence indicators + why-flagged panel`
  - Files: `src/components/ConfidenceIndicator.tsx`, `src/components/WhyFlaggedPanel.tsx`

- [ ] 34. **Keyboard Shortcuts** — `quick`

  **What to do**:
  - Implement keyboard shortcuts using react-hotkeys-hook:
    - Ctrl+Z: undo
    - Ctrl+Y: redo
    - Ctrl+F: focus search
    - Ctrl+S: save session
    - Ctrl+E: open export dialog
    - Ctrl+1/2/3: toggle tag filter (client/broker/suspicious)
    - Space: toggle selection of focused row
    - Arrow keys: navigate table rows
    - Enter: open tag editor for focused row
    - Delete: remove tag from focused row
  - Shortcut cheat sheet: modal showing all shortcuts (? key).
  - Configurable: allow users to customize shortcuts in settings.

  **Must NOT do**:
  - Do NOT override system shortcuts (Ctrl+C, Ctrl+V).

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 27-33, 35)
  - **Blocks**: None
  - **Blocked By**: Task 1 (scaffolding), Task 18 (layout), Task 20 (table), Task 21 (tag editing), Task 26 (undo/redo)

  **Acceptance Criteria**:
  - [ ] All shortcuts work as documented.
  - [ ] Cheat sheet modal opens with ? key.
  - [ ] Customizable shortcuts saved to settings.

  **QA Scenarios**:
  ```
  Scenario: Keyboard navigation
    Tool: Playwright
    Preconditions: App with transactions
    Steps:
      1. Press Down arrow 3 times
      2. Press Enter
    Expected Result: Tag editor opens for 4th row.
    Evidence: .sisyphus/evidence/task-34-shortcuts.png
  ```

  **Commit**: YES
  - Message: `feat(ui): keyboard shortcuts + cheat sheet`
  - Files: `src/hooks/useKeyboardShortcuts.ts`

- [ ] 35. **Name Normalization + Alias Assignment UI** — `quick`

  **What to do**:
  - Show name normalization preview: before/after comparison when importing CSV.
  - Alias assignment UI: when manual review finds variant names, allow user to assign alias.
  - Alias management page: list all aliases, edit/delete, import/export.
  - Auto-suggest aliases: detect similar unmatched names and suggest grouping.
  - Apply aliases retroactively: re-run matching with new aliases.

  **Must NOT do**:
  - Do NOT implement ML-based alias detection (rule-based only).

  **Recommended Agent Profile**:
  - **Category**: `quick`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 27-34)
  - **Blocks**: None
  - **Blocked By**: Task 1 (scaffolding), Task 6 (API types), Task 9 (CSV parser), Task 11 (matcher), Task 20 (table), Task 21 (tag editing)

  **Acceptance Criteria**:
  - [ ] Alias assignment works during manual review.
  - [ ] Aliases saved to backend.
  - [ ] Re-run matching updates tags.

  **QA Scenarios**:
  ```
  Scenario: Assign alias
    Tool: Playwright
    Preconditions: App with unmatched transaction
    Steps:
      1. Click "Assign Alias"
      2. Select canonical name
      3. Save
    Expected Result: Alias saved, transaction re-tagged.
    Evidence: .sisyphus/evidence/task-35-alias.png
  ```

  **Commit**: YES
  - Message: `feat(ui): alias assignment + management`
  - Files: `src/components/AliasManager.tsx`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + build check. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- Per wave commits recommended: `feat(wave-1): scaffold electron-vite + fastapi + sqlite`
- Individual commits per task within waves for granular history.
- Final integration commit: `feat(release): v1.0.0 windows installer`

---

## Success Criteria

### Verification Commands
```bash
# Backend health check
curl http://localhost:{PORT}/health
# Expected: {"status":"ok","version":"1.0.0"}

# Frontend build
npm run build
# Expected: Build succeeds, no TypeScript errors

# Python bundle check
pyinstaller --onedir backend/main.py
# Expected: dist/ folder created with .exe and dependencies

# Electron package
npm run dist
# Expected: out/ folder created with .exe installer
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All QA scenarios pass with evidence captured
- [ ] Windows installer works on clean Windows machine without Python installed
- [ ] App successfully processes sample PDF + CSV end-to-end
- [ ] All export formats verified
- [ ] Settings persist across app restarts
- [ ] Crash recovery restores last session
