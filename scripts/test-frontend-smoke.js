const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertIncludes(file, text, message) {
  assert(read(file).includes(text), `${message} (${file})`)
}

function main() {
  const indexHtml = read('frontend/index.html')
  assert(indexHtml.includes('Content-Security-Policy'), 'Renderer HTML must define a CSP')
  assert(indexHtml.includes("default-src 'self'"), 'CSP must default to self')
  assert(!/fonts\.googleapis|fonts\.gstatic/i.test(indexHtml), 'Renderer HTML must not load remote Google fonts')

  const css = read('frontend/src/index.css')
  assert(css.includes("@font-face"), 'Local font faces must be declared')
  assert(!/fonts\.googleapis|fonts\.gstatic/i.test(css), 'CSS must not load remote Google fonts')

  const fontFiles = [
    'frontend/src/assets/fonts/inter-400.ttf',
    'frontend/src/assets/fonts/inter-600.ttf',
    'frontend/src/assets/fonts/jetbrains-mono-400.ttf',
  ]
  for (const file of fontFiles) {
    assert(fs.existsSync(path.join(ROOT, file)), `Expected packaged font is missing: ${file}`)
  }

  const main = read('frontend/electron/main.ts')
  assert(main.includes('sandbox: true'), 'Electron renderer sandbox must stay enabled')
  assert(main.includes('contextIsolation: true'), 'Electron context isolation must stay enabled')
  assert(main.includes('nodeIntegration: false'), 'Electron nodeIntegration must stay disabled')
  assert(!main.includes('sandbox: false'), 'Electron renderer must not disable sandbox')
  assert(!main.includes('nodeIntegration: true'), 'Electron renderer must not enable nodeIntegration')
  assert(main.includes('publishBackendCrash'), 'Main process must notify renderer when backend crashes')
  assert(main.includes("proc.kill('SIGKILL')"), 'Backend shutdown must force-kill a stuck process')
  assert(main.includes('AUDIT_API_TOKEN'), 'Backend must receive a per-launch API token')
  assert(main.includes('AUDIT_DISABLE_DOCS'), 'Packaged backend docs must be disabled')

  const preload = read('frontend/electron/preload.ts')
  assert(preload.includes('contextBridge.exposeInMainWorld'), 'Preload must expose a narrow bridge')
  assert(preload.includes('onBackendCrashed'), 'Preload must expose backend crash events')

  assertIncludes('frontend/src/main.tsx', '<ErrorBoundary>', 'React root must be wrapped by ErrorBoundary')
  assertIncludes('frontend/src/components/SettingsPanel.tsx', 'useFocusTrap', 'Settings panel must trap focus')
  assertIncludes('frontend/src/components/ExportPanel.tsx', 'useFocusTrap', 'Export panel must trap focus')

  const api = read('frontend/src/lib/api.ts')
  assert(api.includes("'X-Audit-Token': backendToken"), 'API client must send the local API token')
  assert(api.includes('client.post(`/transactions/${transactionId}/review`, { status })'), 'Review status must be sent in JSON body')
  assert(api.includes('client.post(`/transactions/${transactionId}/notes`, { notes })'), 'Notes must be sent in JSON body')

  console.log('[Frontend Smoke] Production hardening checks passed.')
}

try {
  main()
} catch (error) {
  console.error(`[Frontend Smoke] ${error.message}`)
  process.exit(1)
}
