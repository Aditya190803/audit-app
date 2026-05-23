const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', '..')

const REQUIRED_BACKEND_MODULES = [
  'aiosqlite',
  'alembic',
  'fastapi',
  'fitz',
  'openpyxl',
  'pandas',
  'pdfplumber',
  'PIL',
  'pydantic',
  'pytesseract',
  'rapidfuzz',
  'sqlalchemy',
  'uvicorn',
]

function pythonCandidates() {
  const names = process.platform === 'win32'
    ? ['Scripts/python.exe', 'Scripts/python']
    : ['bin/python']

  const envs = [
    path.join(ROOT, 'backend', 'venv'),
    path.join(ROOT, '.venv'),
  ]

  return envs.flatMap((envPath) => names.map((name) => path.join(envPath, name)))
}

function moduleProbe(modules) {
  const imports = modules
    .map((name) => `importlib.import_module(${JSON.stringify(name)})`)
    .join('\n')

  return [
    'import importlib',
    imports,
  ].join('\n')
}

function hasModules(pythonBin, modules) {
  try {
    execFileSync(pythonBin, ['-c', moduleProbe(modules)], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function missingModules(pythonBin, modules) {
  const script = [
    'import importlib',
    'missing = []',
    'for name in ' + JSON.stringify(modules) + ':',
    '    try:',
    '        importlib.import_module(name)',
    '    except Exception:',
    '        missing.append(name)',
    'print(",".join(missing))',
  ].join('\n')

  const output = execFileSync(pythonBin, ['-c', script], { encoding: 'utf8' }).trim()
  return output ? output.split(',') : []
}

function resolvePythonBin(options = {}) {
  const requiredModules = options.requiredModules || REQUIRED_BACKEND_MODULES
  const explicit = process.env.PYTHON

  if (explicit) {
    if (!fs.existsSync(explicit)) {
      throw new Error(`PYTHON points to a missing interpreter: ${explicit}`)
    }
    const missing = missingModules(explicit, requiredModules)
    if (missing.length > 0) {
      throw new Error(`PYTHON is missing backend modules: ${missing.join(', ')}`)
    }
    return explicit
  }

  const existing = pythonCandidates().filter((candidate) => fs.existsSync(candidate))
  const usable = existing.find((candidate) => hasModules(candidate, requiredModules))
  if (usable) return usable

  if (existing.length === 0) {
    throw new Error('Python virtual environment not found. Create backend/venv or .venv, or set PYTHON.')
  }

  const details = existing.map((candidate) => {
    const missing = missingModules(candidate, requiredModules)
    return `${candidate}: missing ${missing.join(', ') || 'unknown modules'}`
  })

  throw new Error(`No Python environment has the production backend dependencies.\n${details.join('\n')}`)
}

module.exports = {
  REQUIRED_BACKEND_MODULES,
  ROOT,
  hasModules,
  resolvePythonBin,
}
