const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'python-dist')

function main() {
  console.log('[Build] Starting Python backend build...')

  // Clean previous build
  if (fs.existsSync(RESOURCES_DIR)) {
    fs.rmSync(RESOURCES_DIR, { recursive: true })
  }
  fs.mkdirSync(RESOURCES_DIR, { recursive: true })

  // PyInstaller command
  const pyinstallerCmd = [
    'pyinstaller',
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
    path.join(__dirname, '..', 'backend', 'main.py')
  ].join(' ')

  console.log('[Build] Running:', pyinstallerCmd)

  try {
    execSync(pyinstallerCmd, { stdio: 'inherit' })
    console.log('[Build] Python backend built successfully!')
  } catch (error) {
    console.error('[Build] PyInstaller failed:', error)
    process.exit(1)
  }
}

main()
