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
  assert(main.includes('validatedExternalUrl'), 'Packaged external update/license URLs must be validated')
  assert(main.includes("url.protocol !== 'https:'"), 'Packaged external URLs must require HTTPS')
  assert(main.includes("execFileSync('taskkill'"), 'Windows backend shutdown must use taskkill for process trees')
  assert(main.includes('requestSingleInstanceLock'), 'Electron app must enforce a single instance')

  const clientListPreview = read('frontend/src/hooks/useClientListPreview.ts')
  const apCodeSelection = read('frontend/src/hooks/useApCodeSelection.ts')
  assert(clientListPreview.includes("XLSX.read(text, { type: 'string' })"), 'CSV headers must be parsed with XLSX, not naive comma splitting')
  assert(apCodeSelection.includes('rowsToObjects(rawRows, headerRow, detectedColumns)'), 'AP-code extraction must respect selected CSV header row')
  assert(clientListPreview.includes('reader.readAsArrayBuffer(clientListFile)'), 'Excel client-list parsing must read the whole workbook')
  assert(!clientListPreview.includes('clientListFile.slice(0, 2 * 1024 * 1024)'), 'Excel client-list parsing must not truncate workbooks')

  const releaseGate = read('scripts/check-release-readiness.js')
  assert(releaseGate.includes('icon\\.ico'), 'Release gate must allow the tracked Windows icon')
  assert(releaseGate.includes('entitlements\\.mac\\.plist'), 'Release gate must allow tracked macOS entitlements')
  assert(releaseGate.includes('/^resources\\/python-dist\\//'), 'Release gate must still block generated Python bundles')

  const releaseWorkflow = read('.github/workflows/release.yml')
  assert(releaseWorkflow.includes('Run release readiness gate'), 'Release workflow must run the release readiness gate')
  assert(releaseWorkflow.includes('Run production verification'), 'Release workflow must run full production verification')
  assert(!releaseWorkflow.includes('Copy release manifests for update site'), 'Release workflow must not contain obsolete manifest-copy step')

  const preload = read('frontend/electron/preload.ts')
  assert(preload.includes('contextBridge.exposeInMainWorld'), 'Preload must expose a narrow bridge')
  assert(preload.includes('onBackendCrashed'), 'Preload must expose backend crash events')

  assertIncludes('frontend/src/main.tsx', '<ErrorBoundary>', 'React root must be wrapped by ErrorBoundary')
  assertIncludes('frontend/src/components/SettingsPanel.tsx', 'useFocusTrap', 'Settings panel must trap focus')
  assertIncludes('frontend/src/components/ExportPanel.tsx', 'useFocusTrap', 'Export panel must trap focus')

  const api = read('frontend/src/lib/api.ts')
  assert(api.includes("'X-Audit-Token': backendToken"), 'API client must send the local API token')
  assert(api.includes('client.post(`/transactions/${transactionId}/notes`, { notes })'), 'Notes must be sent in JSON body')

  console.log('[Frontend Smoke] Production hardening checks passed.')
}

try {
  main()
} catch (error) {
  console.error(`[Frontend Smoke] ${error.message}`)
  process.exit(1)
}
