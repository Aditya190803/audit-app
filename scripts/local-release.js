/**
 * Local release pipeline with cached deps (node_modules + .venv).
 * Used by Makefile and: bun run release:win:local
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const { loadEnvLocal, resolveUpdateFeedUrl, pkgVersion: readPkgVersion } = require('./load-env-local')

const ROOT = path.join(__dirname, '..')
loadEnvLocal(ROOT)

const VENV = path.join(ROOT, '.venv')
const isWin = process.platform === 'win32'
const py = isWin ? path.join(VENV, 'Scripts', 'python.exe') : path.join(VENV, 'bin', 'python')
const pip = isWin ? path.join(VENV, 'Scripts', 'pip.exe') : path.join(VENV, 'bin', 'pip')
const venvStamp = path.join(VENV, '.deps-installed')
const nodeStamp = path.join(ROOT, 'node_modules', '.deps-installed')

function run(label, command, args, env = {}) {
  console.log(`\n[local] ${label}`)
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
}

function pkgVersion() {
  return readPkgVersion(ROOT)
}

function ensureVenv() {
  if (!fs.existsSync(py)) {
    const candidates = ['python', 'python3', 'py']
    let ok = false
    for (const c of candidates) {
      try {
        const args = c === 'py' ? ['-3.12', '-m', 'venv', VENV] : ['-m', 'venv', VENV]
        execFileSync(c, args, { cwd: ROOT, stdio: 'inherit' })
        ok = true
        break
      } catch {
        /* try next */
      }
    }
    if (!ok) throw new Error('Could not create .venv — install Python 3.12 and ensure it is on PATH')
  }
}

function depsNode() {
  const lock = path.join(ROOT, 'bun.lock')
  const pkg = path.join(ROOT, 'package.json')
  const need =
    !fs.existsSync(nodeStamp) ||
    !fs.existsSync(path.join(ROOT, 'node_modules')) ||
    fileNewer(pkg, nodeStamp) ||
    fileNewer(lock, nodeStamp)
  if (!need) {
    console.log('[local] bun deps OK (cached)')
    return
  }
  run('bun install', 'bun', ['install', '--frozen-lockfile'])
  fs.mkdirSync(path.join(ROOT, 'node_modules'), { recursive: true })
  fs.writeFileSync(nodeStamp, new Date().toISOString())
}

function depsPython() {
  const req = path.join(ROOT, 'backend', 'requirements.txt')
  const need =
    !fs.existsSync(venvStamp) ||
    !fs.existsSync(py) ||
    fileNewer(req, venvStamp)
  ensureVenv()
  if (!need) {
    console.log('[local] Python deps OK (cached)')
    return
  }
  run('pip upgrade', py, ['-m', 'pip', 'install', '--upgrade', 'pip'])
  run('pip requirements', py, ['-m', 'pip', 'install', '-r', 'backend/requirements.txt', 'pytest', 'pyinstaller'])
  fs.mkdirSync(VENV, { recursive: true })
  fs.writeFileSync(venvStamp, new Date().toISOString())
}

function fileNewer(a, b) {
  try {
    return fs.statSync(a).mtimeMs > fs.statSync(b).mtimeMs
  } catch {
    return true
  }
}

function defaultEnv() {
  return {
    PYTHON: py,
    ALLOW_UNSIGNED_RELEASE: process.env.ALLOW_UNSIGNED_RELEASE || '1',
    RELEASE_PLATFORM: process.env.RELEASE_PLATFORM || 'windows',
    LICENSE_CHECK_URL:
      process.env.LICENSE_CHECK_URL || 'https://the-ska-auditing-app.vercel.app/api/license',
    UPDATE_FEED_URL: resolveUpdateFeedUrl(ROOT),
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY || 'aditya190803/audit-app',
  }
}

function cmdDeps() {
  depsNode()
  depsPython()
}

function cmdTest() {
  cmdDeps()
  const env = defaultEnv()
  run('test (typecheck + smoke + pytest)', 'bun', ['run', 'test'], env)
}

function cmdTestBackend() {
  depsPython()
  run('backend pytest', 'node', ['scripts/test-backend.js'], { PYTHON: py })
}

function cmdReleaseWin() {
  cmdDeps()
  const env = defaultEnv()
  console.log(`[local] Release v${pkgVersion()}`)
  console.log(`[local] UPDATE_FEED_URL=${env.UPDATE_FEED_URL}`)
  run('release:check', 'bun', ['run', 'release:check'], env)
  run('verify:prod', 'bun', ['run', 'verify:prod'], env)
  run('electron-builder', 'bunx', ['electron-builder', '--win', '--x64', '--publish', 'never'], env)
  console.log('\n[local] Installer: out/dist/*.exe')
}

function cmdBuildApp() {
  cmdDeps()
  const env = defaultEnv()
  run('electron-vite build', 'bun', ['run', 'build'], env)
  run('PyInstaller', 'node', ['scripts/build-python.js'], env)
  run('electron-builder', 'bunx', ['electron-builder', '--win', '--x64', '--publish', 'never'], env)
}

const commands = {
  deps: cmdDeps,
  test: cmdTest,
  'test-backend': cmdTestBackend,
  'release-win': cmdReleaseWin,
  'build-app': cmdBuildApp,
}

const name = process.argv[2] || 'help'
if (name === 'help' || !commands[name]) {
  console.log(`
Local release (cached deps)

  node scripts/local-release.js deps
  node scripts/local-release.js test
  node scripts/local-release.js test-backend
  node scripts/local-release.js release-win
  node scripts/local-release.js build-app   # skip verify:prod

Or: bun run release:win:local
`)
  process.exit(name === 'help' ? 0 : 1)
}

try {
  commands[name]()
} catch (e) {
  console.error(`[local] ${e.message}`)
  process.exit(1)
}