# Bank Audit App

A desktop bank statement auditing application built with **Electron + Vite + React** frontend and **FastAPI + Python** backend.

## Project Structure

```
audit-app/
├── backend/              # Python FastAPI backend
│   ├── alembic/          # Database migrations
│   ├── alembic.ini
│   ├── api/              # API route handlers
│   ├── services/         # Business logic (PDF, CSV, fuzzy matching, export, etc.)
│   ├── venv/             # Python virtual environment
│   ├── audit.db          # SQLite database (auto-created)
│   ├── main.py           # FastAPI entry point
│   ├── models.py         # SQLAlchemy models
│   ├── schemas.py        # Pydantic schemas
│   ├── seed.py           # Default data seeder
│   └── requirements.txt  # Python dependencies
├── frontend/             # Electron + React + Vite frontend
│   ├── electron/         # Electron main & preload processes
│   │   ├── main.ts       # Electron app, Python subprocess lifecycle
│   │   └── preload.ts    # Secure contextBridge API
│   ├── src/              # React application
│   │   ├── components/   # UI components
│   │   ├── stores/       # Zustand state stores
│   │   ├── lib/          # API client
│   │   └── types/        # TypeScript interfaces
│   └── index.html
├── resources/            # Bundled runtime resources
│   ├── python-dist/      # PyInstaller output (built)
│   └── tesseract/        # OCR engine (built)
├── scripts/              # Build scripts
├── uploads/              # Uploaded file storage
├── out/                  # Vite build output
├── package.json          # Root orchestrator
└── tsconfig.json
```

## Prerequisites

- **Node.js** >= 18
- **Bun** >= 1.0
- **Python** >= 3.12

## Quick Start

```bash
bun install
python -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt
```

**Windows setup:**
```cmd
bun install
python -m venv backend\venv
backend\venv\Scripts\activate.bat
pip install -r backend\requirements.txt
```

## Development

```bash
bun run dev
```

## Build

```bash
bun run build          # Frontend only
bun run build:python   # Python backend (PyInstaller)
bun run dist:win       # Full Windows installer
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server with hot reload |
| `bun run build` | Build frontend (Vite) |
| `bun run build:python` | Bundle Python backend (PyInstaller) |
| `bun run preview` | Preview production build |
| `bun run dist` | Full build + package for current platform |
| `bun run dist:win` | Full build + Windows NSIS installer |

## Tech Stack

### Frontend
- **Electron** — Desktop shell
- **Vite** — Build tool + dev server
- **React 19** — UI library
- **TypeScript** — Type safety
- **Tailwind CSS** — Styling
- **Zustand** — State management
- **TanStack Table** — Data table
- **React-PDF** — PDF preview

### Backend
- **FastAPI** — HTTP API framework
- **Uvicorn** — ASGI server
- **SQLAlchemy** — ORM
- **Alembic** — Database migrations
- **SQLite** — Local database
- **PyMuPDF** — PDF parsing
- **pdfplumber** — Table extraction
- **RapidFuzz** — Fuzzy name matching
- **Pandas** — CSV processing
- **pytesseract** — OCR (scanned PDFs)
- **PyInstaller** — Python bundling

## Architecture

The app uses a local HTTP bridge pattern:

1. **Electron main process** finds a free TCP port using `get-port`
2. Spawns the Python backend as a subprocess (`uvicorn`)
3. Waits for `/health` to respond before showing the UI
4. Frontend communicates with backend via HTTP/Axios on the dynamic port
5. On quit, Electron gracefully terminates the Python process

This avoids Webpack/bundler issues and keeps Python logic fully isolated.

## License

MIT
