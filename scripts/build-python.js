const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'python-dist')
function firstExisting(paths) {
  return paths.find((candidate) => fs.existsSync(candidate))
}

const PYTHON_BIN = process.env.PYTHON || firstExisting(
  process.platform === 'win32'
    ? [
        path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe'),
        path.join(__dirname, '..', 'backend', 'venv', 'Scripts', 'python.exe')
      ]
    : [
        path.join(__dirname, '..', '.venv', 'bin', 'python'),
        path.join(__dirname, '..', 'backend', 'venv', 'bin', 'python')
      ]
)

function main() {
  console.log('[Build] Starting Python backend build...')

  // Clean previous build
  if (fs.existsSync(RESOURCES_DIR)) {
    fs.rmSync(RESOURCES_DIR, { recursive: true })
  }
  fs.mkdirSync(RESOURCES_DIR, { recursive: true })

  if (!PYTHON_BIN) {
    console.error('[Build] Python virtual environment not found. Create .venv or backend/venv, or set PYTHON.')
    process.exit(1)
  }

  // PyInstaller command
  const pyinstallerArgs = [
    '-m',
    'PyInstaller',
    '--onedir',
    '--noconfirm',
    '--clean',
    '--name', 'backend',
    '--distpath', RESOURCES_DIR,
    '--hidden-import', 'uvicorn.logging',
    '--hidden-import', 'uvicorn.loops',
    '--hidden-import', 'uvicorn.loops.auto',
    '--hidden-import', 'uvicorn.protocols',
    '--hidden-import', 'uvicorn.protocols.http',
    '--hidden-import', 'uvicorn.protocols.http.auto',
    '--hidden-import', 'uvicorn.protocols.websockets',
    '--hidden-import', 'uvicorn.protocols.websockets.auto',
    '--hidden-import', 'uvicorn.lifespan',
    '--hidden-import', 'uvicorn.lifespan.on',
    '--hidden-import', 'sqlalchemy.ext.baked',
    '--hidden-import', 'alembic',
    '--hidden-import', 'pandas._libs.tslibs.np_datetime',
    '--hidden-import', 'pandas._libs.tslibs.timedeltas',
    '--hidden-import', 'fitz',
    '--hidden-import', 'pdfplumber',
    '--hidden-import', 'rapidfuzz',
    '--hidden-import', 'pytesseract',
    '--hidden-import', 'PIL',
    '--hidden-import', 'openpyxl',
    '--hidden-import', 'backend.api.routes.sessions',
    '--hidden-import', 'backend.api.routes.transactions',
    '--hidden-import', 'backend.api.routes.tags',
    '--hidden-import', 'backend.api.routes.brokers',
    '--hidden-import', 'backend.api.routes.export',
    '--hidden-import', 'backend.api.routes.settings',
    '--hidden-import', 'backend.api.routes.audit',
    '--hidden-import', 'backend.services.config_service',
    '--hidden-import', 'backend.services.pdf_service',
    '--hidden-import', 'backend.services.csv_service',
    '--hidden-import', 'backend.services.fuzzy_service',
    '--hidden-import', 'backend.services.tagging_service',
    '--hidden-import', 'backend.services.export_service',
    '--hidden-import', 'backend.services.session_service',
    '--hidden-import', 'backend.services.audit_service',
    '--hidden-import', 'backend.security',
    '--hidden-import', 'backend.services.pdf_worker',
    '--hidden-import', 'backend.services.tagging_worker',
    '--collect-submodules', 'backend.services.parsers',
    path.join(__dirname, '..', 'backend', 'main.py')
  ]

  console.log('[Build] Running:', PYTHON_BIN, pyinstallerArgs.join(' '))

  try {
    execFileSync(PYTHON_BIN, pyinstallerArgs, { stdio: 'inherit' })
    console.log('[Build] Python backend built successfully!')
  } catch (error) {
    console.error('[Build] PyInstaller failed:', error)
    process.exit(1)
  }
}

main()
