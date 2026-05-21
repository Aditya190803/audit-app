const { execFileSync, spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')
const { REQUIRED_BACKEND_MODULES, ROOT, resolvePythonBin } = require('./lib/python-env')

function run(label, command, args, options = {}) {
  console.log(`\n[Verify] ${label}`)
  execFileSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...options.env },
  })
}

function requestHealth(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        body += chunk
      })
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`health returned HTTP ${res.statusCode}: ${body}`))
          return
        }
        try {
          const parsed = JSON.parse(body)
          if (parsed.status !== 'ok') {
            reject(new Error(`health returned unexpected payload: ${body}`))
            return
          }
          resolve(parsed)
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(1000, () => {
      req.destroy(new Error('health request timed out'))
    })
  })
}

async function smokeBackendBinary() {
  const executable = process.platform === 'win32'
    ? path.join(ROOT, 'resources', 'python-dist', 'backend', 'backend.exe')
    : path.join(ROOT, 'resources', 'python-dist', 'backend', 'backend')

  if (!fs.existsSync(executable)) {
    throw new Error(`Built backend executable not found: ${executable}`)
  }

  const dbPath = path.join(os.tmpdir(), `audit-prod-smoke-${process.pid}.db`)
  const port = 8765 + Math.floor(Math.random() * 1000)
  const child = spawn(executable, [], {
    cwd: path.dirname(executable),
    env: {
      ...process.env,
      AUDIT_API_TOKEN: 'production-smoke-token',
      AUDIT_DB_PATH: dbPath,
      AUDIT_DISABLE_DOCS: '1',
      BACKEND_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let output = ''
  child.stdout.on('data', (data) => {
    output += data.toString()
  })
  child.stderr.on('data', (data) => {
    output += data.toString()
  })

  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (child.exitCode !== null) {
        throw new Error(`backend exited during smoke test with code ${child.exitCode}\n${output}`)
      }
      try {
        await requestHealth(port)
        console.log(`[Verify] Packaged backend health check passed on port ${port}.`)
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    throw new Error(`backend did not become healthy\n${output}`)
  } finally {
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), 3000).unref()
    for (const suffix of ['', '-shm', '-wal']) {
      try {
        fs.rmSync(`${dbPath}${suffix}`, { force: true })
      } catch {}
    }
  }
}

async function main() {
  const pythonBin = resolvePythonBin({ requiredModules: [...REQUIRED_BACKEND_MODULES, 'PyInstaller'] })
  console.log(`[Verify] Using Python: ${pythonBin}`)

  run('Frontend production smoke checks', 'node', ['scripts/test-frontend-smoke.js'])
  run('TypeScript check', 'bun', ['run', 'typecheck'])
  run('Backend tests', 'node', ['scripts/test-backend.js'])

  const migrationDb = path.join(os.tmpdir(), `audit-prod-migration-${process.pid}.db`)
  run('Alembic upgrade head on a clean database', pythonBin, ['-m', 'alembic', '-c', 'backend/alembic.ini', 'upgrade', 'head'], {
    env: { AUDIT_DB_PATH: migrationDb },
  })
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${migrationDb}${suffix}`, { force: true })
  }

  run('Electron/Vite production build', 'bun', ['run', 'build'])
  run('PyInstaller backend build', 'node', ['scripts/build-python.js'], {
    env: { PYTHON: pythonBin },
  })

  console.log('\n[Verify] Packaged backend smoke test')
  await smokeBackendBinary()
  console.log('\n[Verify] Production verification passed.')
}

main().catch((error) => {
  console.error(`\n[Verify] ${error.message}`)
  process.exit(1)
})
