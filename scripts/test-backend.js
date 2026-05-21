const { execFileSync } = require('child_process')
const { hasModules, resolvePythonBin } = require('./lib/python-env')

const TEST_MODULES = [
  'aiosqlite',
  'fastapi',
  'fitz',
  'openpyxl',
  'pandas',
  'pdfplumber',
  'PIL',
  'pytest',
  'rapidfuzz',
  'sqlalchemy',
]

function resolveTestPython() {
  const candidates = [
    process.env.PYTHON,
    process.platform === 'win32' ? 'python.exe' : 'python3',
    'python',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (hasModules(candidate, TEST_MODULES)) return candidate
  }

  return resolvePythonBin({ requiredModules: TEST_MODULES })
}

function main() {
  const pythonBin = resolveTestPython()
  console.log(`[Backend Test] Using Python: ${pythonBin}`)
  execFileSync(pythonBin, ['-m', 'pytest', 'backend/tests'], { stdio: 'inherit' })
}

try {
  main()
} catch (error) {
  console.error(`[Backend Test] ${error.message}`)
  process.exit(1)
}
