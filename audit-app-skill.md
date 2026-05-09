---
name: audit-app
description: "Desktop bank statement auditing application built with Electron + React + Vite frontend and FastAPI + Python backend. Uses a local HTTP bridge pattern where Electron spawns a Python subprocess. Parses PDF bank statements, fuzzy-matches transactions against client lists, auto-tags as client/broker/suspicious, provides manual review UI, and exports results in multiple formats."
license: MIT
compatibility: Node.js >=18, Bun >=1.0, Python >=3.12. Works on Windows (NSIS installer), Linux, macOS (dev only).
metadata:
  author: adi
  version: "1.0"
  domain: development
  type: application
  mode: assistive
---

# Bank Audit App

Desktop app for CA firm employees to automate bank statement auditing. Ingests PDF bank statements and client CSVs/Excel files, auto-tags transactions via fuzzy matching and rule engines, provides manual review UI, and exports results (CSV, Excel, highlighted PDF, PDF report).

## When to Use This Skill

Use this skill when working on any part of the audit app:
- Adding new bank statement PDF parsers
- Modifying fuzzy matching or tagging logic
- Adding export formats or changing export behavior
- Modifying the Electron main/preload processes
- Adding new React components, stores, or API endpoints
- Changing database schema or migrations
- Building/packaging the application
- Debugging the local HTTP bridge between Electron and Python

## Architecture Overview

**Local HTTP Bridge Pattern:**

```
Electron Main Process
├── Finds free TCP port (get-port, prefers 8765-8769)
├── Spawns Python FastAPI backend as subprocess (uvicorn)
├── Polls /health until backend is ready
├── Exposes IPC handlers (get-backend-port, select-file, etc.)
└── On quit: kills Python subprocess with SIGTERM

Preload Script (contextBridge)
└── window.electronAPI: getBackendPort, selectFile, showSaveDialog,
    getAppVersion, readExampleFiles, readFileBase64

Renderer (React + Vite + Tailwind + Zustand)
├── AppShell: sidebar, header, content area
├── FileDropZone: drag-and-drop PDF/CSV/Excel input
├── DataTable: TanStack Table with sort, filter, bulk tag
├── PDFPreview: side-by-side PDF viewer (react-pdf)
├── ExportPanel: format/mode selection
├── SettingsPanel: thresholds, broker list, keywords
└── Stores: sessionStore, settingsStore, uiStore

Python Backend (FastAPI + SQLAlchemy + SQLite)
├── /sessions - CRUD audit sessions
├── /transactions - parse PDFs, list, tag summary
├── /tags - manual/bulk add/remove tags
├── /brokers - CRUD broker list
├── /export - CSV, Excel, highlighted PDF, PDF report
├── /settings - app config
└── /audit - audit trail logs
```

### Directory Structure

```
audit-app/
├── backend/                    # Python FastAPI backend
│   ├── main.py                 # FastAPI app factory, lifespan, CORS
│   ├── database.py             # SQLAlchemy engine, session, Base
│   ├── models.py               # 9 ORM models
│   ├── schemas.py              # Pydantic v2 schemas
│   ├── seed.py                 # DB seeder (brokers, defaults)
│   ├── defaults.py             # Default config values
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/                # DB migrations
│   ├── api/routes/             # 7 route modules
│   ├── services/               # Business logic
│   │   ├── session_service.py
│   │   ├── pdf_service.py      # PDF parsing orchestration
│   │   ├── csv_service.py      # Client list parsing
│   │   ├── fuzzy_service.py    # RapidFuzz matching
│   │   ├── tagging_service.py  # Auto-tagging rules
│   │   ├── export_service.py   # Multi-format export
│   │   ├── config_service.py   # Settings CRUD
│   │   └── audit_service.py    # Audit trail
│   └── services/parsers/       # Bank-specific PDF parsers
│       ├── base.py             # Abstract parser
│       ├── generic.py          # Fallback parser
│       ├── icici_detailed.py
│       ├── icici_numbered.py
│       ├── sbi_standard.py
│       ├── sbi_compact.py
│       ├── kotak_mahindra.py
│       └── union_bank.py
├── frontend/
│   ├── electron/
│   │   ├── main.ts             # Window, Python subprocess, IPC
│   │   └── preload.ts          # contextBridge API
│   ├── src/
│   │   ├── main.tsx            # React entry
│   │   ├── App.tsx             # Root + settings load
│   │   ├── index.css           # Tailwind + design tokens
│   │   ├── components/         # UI components
│   │   ├── stores/             # Zustand stores
│   │   ├── lib/api.ts          # Axios API client
│   │   └── types/api.ts        # TypeScript interfaces
│   └── index.html
├── resources/                  # Bundled runtime (PyInstaller, Tesseract)
├── scripts/build-python.js     # PyInstaller build script
├── example/                    # Sample PDFs and client lists
├── uploads/                    # Runtime upload storage
├── package.json                # Orchestrator
├── electron.vite.config.ts
├── vite.main.config.ts
├── vite.renderer.config.ts
├── vite.preload.config.ts
├── tailwind.config.js
├── postcss.config.js
└── backend.spec                # PyInstaller spec
```

## Database Schema (SQLite)

9 tables managed by SQLAlchemy + Alembic:

| Table | Key Columns | Relationships |
|---|---|---|
| `audit_sessions` | id, name, status, pdf_path, csv_path, settings_snapshot | -> transactions, -> audit_logs |
| `transactions` | id, session_id(FK), date, amount, description, party_name, raw_text, page_number, bounding_box_json | -> session, -> tags |
| `tags` | id, transaction_id(FK), tag_type(client\|broker\|suspicious), confidence, reason, source(auto\|manual), is_manual | -> transaction |
| `brokers` | id, name(unique), aliases(JSON), is_active | |
| `aliases` | id, canonical_name, alias_name | |
| `audit_logs` | id, session_id(FK), action, entity_type, entity_id, old_value(JSON), new_value(JSON), is_auto | -> session |
| `configs` | id, key(unique), value(JSON), category | |
| `bank_profiles` | id, name(unique), parser_rules_json(JSON) | |
| `undo_redo_states` | id, session_id(FK), action_type, state_data(JSON) | |

## Key Patterns & Code Conventions

### Frontend

**State Management (Zustand):**
- `sessionStore`: sessions list, current session, transactions, tag summary, file processing state
- `settingsStore`: app config, threshold values, broker/keyword editors
- `uiStore`: sidebar toggle, modals, selected transactions, search query, filters, toasts

```typescript
// Store pattern
export const useSessionStore = create<SessionStore>()((set, get) => ({
  sessions: [],
  currentSession: null,
  transactions: [],
  tagSummary: null,
  loading: false,
  error: null,
  // Actions
  loadSessions: async () => { ... },
  createSession: async (data) => { ... },
}));
```

**API Client (`lib/api.ts`):**
- Dynamic backend port from `window.electronAPI.getBackendPort()`
- Axios instance per request (port may change)
- All API call functions return typed responses

**Component Patterns:**
- `AppShell` orchestrates layout + conditional rendering
- `DataTable` uses TanStack Table with: sorting, filtering, row selection, column visibility, inline tag editing
- `FileDropZone` uses `react-dropzone` with PDF validation on drop
- `PDFPreview` uses `react-pdf` with base64 loading via IPC

### Backend

**FastAPI Routes Pattern:**
```python
router = APIRouter(prefix="/transactions", tags=["transactions"])

@router.get("/session/{session_id}")
async def get_transactions(session_id: int, db: Session = Depends(get_db)):
    ...
```

**Service Layer:**
- Routes call services; services contain all business logic
- Services receive `db: Session` as parameter
- PDF parsing uses parser registry pattern (parsers dict keyed by bank name)

**Parser Pattern:**
```python
class BankParser(ABC):
    @abstractmethod
    def can_handle(self, text: str, tables: list) -> bool: ...
    @abstractmethod
    def parse(self, text: str, tables: list) -> list[TransactionData]: ...
```

**Fuzzy Matching:**
- Uses RapidFuzz `extractOne` with score cutoff
- Client matching: compares transaction `party_name` against client names + aliases
- Broker matching: applies significant-token filter (removes common words like "ltd", "private") before fuzzy matching
- Suspicious detection: amount threshold, recurring (same amount + party within 30 days), keyword matching

**Tag Types:**
- `client` (green badge) — matches client list
- `broker` (yellow badge) — matches broker list
- `suspicious` (red badge) — exceeds threshold or matches suspicious patterns
- Transactions can have multiple tags simultaneously

## Quick Reference

| Category | Key Patterns |
|---|---|
| Adding a new parser | Create `backend/services/parsers/<bank>.py` extending `BankParser`, register in `pdf_service.py` parser registry |
| New API endpoint | Add route in `backend/api/routes/`, register in `main.py` |
| New frontend component | Place in `frontend/src/components/`, use Tailwind + lucide-react icons |
| New Zustand store | Create in `frontend/src/stores/`, follow existing store pattern |
| IPC handler | Add handler in `frontend/electron/main.ts`, expose in `preload.ts`, add type in `electron.d.ts` |
| Export format | Add method in `backend/services/export_service.py`, add route, add UI in `ExportPanel.tsx` |
| DB migration | `cd backend && alembic revision --autogenerate -m "desc"`, then `alembic upgrade head` |

## Scripts & Commands

| Command | Description |
|---|---|
| `bun run dev` | Start dev with hot reload + Python backend |
| `bun run build` | Build frontend (Vite) |
| `bun run build:python` | Bundle Python via PyInstaller |
| `bun run dist` | Full build + package for current platform |
| `bun run dist:win` | Full build + Windows NSIS installer |
| `bun run preview` | Preview production build |

## Common Workflows

### Adding a new bank parser
1. Create parser file in `backend/services/parsers/` extending `BankParser`
2. Implement `can_handle()` and `parse()` methods
3. Register in `pdf_service.py` parser registry dict
4. Add sample PDF to `example/<bank>/`
5. Test via `POST /transactions/parse` with the sample PDF

### Modifying tagging logic
- `backend/services/tagging_service.py` contains all rules
- `backend/services/fuzzy_service.py` for matching thresholds
- Default values in `backend/defaults.py`
- Settings (thresholds, keywords) stored in `configs` table

### Adding an export format
1. Add export method in `backend/services/export_service.py`
2. Add route in `backend/api/routes/export.py`
3. Add format option in `frontend/src/components/ExportPanel.tsx`
4. Add export API call in `frontend/src/lib/api.ts`

## Design System

- **Fonts:** Inter (UI), JetBrains Mono (data/monospace)
- **Colors:** Cool-gray neutrals (`#f6f7f9` bg, `#ffffff` surfaces), Teal primary (`#0d9488`), Navy brand (`#115591`)
- **Tag colors:** client=green, broker=yellow, suspicious=red
- **Spacing:** 4px grid, sidebar 260px, header 48px
- **Border radius:** 6/8/10px
- **Light mode only** (office use)
- **WCAG 2.1 AA** compliance
- Full design tokens in `frontend/src/index.css` as CSS variables

## Important Gotchas

- Electron main process **must** bind backend to `127.0.0.1` (never `0.0.0.0`)
- Frontend API client uses **dynamic port** from IPC call — don't hardcode ports
- Preload **must not** expose raw `ipcRenderer` — always wrap in contextBridge
- Python subprocess is spawned with `detached: false` on Windows (different from `detached: true` on Linux/macOS) — see `main.ts`
- PDF parsers receive both extracted text and pdfplumber tables — use both
- PyMuPDF (`fitz`) is used for text extraction AND PDF annotation/highlighting
- OCR fallback via pytesseract only triggers when extracted text is empty (scanned PDFs)
- RapidFuzz cutoff defaults to 60; tunable via settings
- Backend auto-creates DB tables on startup via lifespan — alembic is for schema migrations only

## How to Install This Skill

To install `audit-app` as an opencode skill:

```bash
# Copy skill file to your skills directory
mkdir -p ~/.config/opencode/skills/audit-app
cp /home/adi/Projects/audit-app/audit-app-skill.md ~/.config/opencode/skills/audit-app/SKILL.md

# Or symlink for auto-updates
ln -s /home/adi/Projects/audit-app/audit-app-skill.md ~/.config/opencode/skills/audit-app/SKILL.md
```

Now when working in this repo, opencode will automatically load this skill and use its context when you ask questions or make changes related to the audit app.
