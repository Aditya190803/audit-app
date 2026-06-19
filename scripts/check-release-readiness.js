const fs = require('fs')
const { execFileSync } = require('child_process')

function fail(message) {
  console.error(`[Release Gate] ${message}`)
  process.exitCode = 1
}

function has(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0
}

function requireEnv(name, why) {
  if (!has(name)) fail(`Missing ${name}: ${why}`)
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !['localhost', '127.0.0.1', '0.0.0.0'].includes(url.hostname)
  } catch {
    return false
  }
}

function checkTrackedArtifacts() {
  const forbidden = [
    /^backend\/audit\.db(?:-shm|-wal)?$/,
    /^uploads\//,
    /^exports\//,
    /^resources\/python-dist\//,
    /^resources\/tesseract\//,
    /^out\//,
    /^example\/(?!synthetic\/).*\.(?:pdf|xlsx|xls|csv)$/i,
    /^build\/(?!(?:icon\.png|icon\.ico|icon\.svg|entitlements\.mac\.plist)$)/,
    /(^|\/)__pycache__\//,
    /\.pyc$/,
    /^backend\/venv\//,
    /^\.venv\//,
  ]

  let tracked = ''
  try {
    tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  } catch {
    console.warn('[Release Gate] Git not available; skipping tracked artifact check.')
    return
  }

  const offenders = tracked.split('\n').filter(Boolean).filter((file) => forbidden.some((pattern) => pattern.test(file)))
  if (offenders.length > 0) {
    fail(`Forbidden generated/local artifacts are tracked:\n${offenders.map((f) => `  - ${f}`).join('\n')}`)
  }
}

function checkPackageMetadata() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  if (!pkg.author || String(pkg.author).trim().length === 0) fail('package.json author must be set for public release metadata')
  if (!pkg.version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pkg.version)) fail('package.json version must be valid semver')
  if (!pkg.build?.publish?.url || !String(pkg.build.publish.url).includes('${env.UPDATE_FEED_URL}')) {
    fail('package.json build.publish.url must use ${env.UPDATE_FEED_URL}')
  }
}

function checkUrls() {
  requireEnv('UPDATE_FEED_URL', 'public HTTPS generic electron-updater feed URL')
  requireEnv('LICENSE_CHECK_URL', 'public HTTPS license endpoint URL')
  for (const name of ['UPDATE_FEED_URL', 'LICENSE_CHECK_URL']) {
    if (has(name) && !isHttpsUrl(process.env[name])) {
      fail(`${name} must be a public https:// URL, not localhost or plain HTTP`)
    }
  }
}

function checkSigning() {
  if (process.env.ALLOW_UNSIGNED_RELEASE === '1') {
    console.warn('[Release Gate] ALLOW_UNSIGNED_RELEASE=1 set; code-signing requirements bypassed.')
    return
  }

  const platform = process.env.RELEASE_PLATFORM || process.platform
  const hasGenericCert = has('CSC_LINK') && has('CSC_KEY_PASSWORD')
  const hasWindowsCert = has('WIN_CSC_LINK') && has('WIN_CSC_KEY_PASSWORD')

  if (platform === 'win32' || platform === 'windows' || platform === 'all') {
    if (!hasGenericCert && !hasWindowsCert) {
      fail('Windows release requires WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD or CSC_LINK/CSC_KEY_PASSWORD')
    }
  }

  if (platform === 'darwin' || platform === 'mac' || platform === 'all') {
    if (!hasGenericCert) fail('macOS release requires CSC_LINK and CSC_KEY_PASSWORD')
    requireEnv('APPLE_ID', 'macOS notarization Apple ID')
    requireEnv('APPLE_APP_SPECIFIC_PASSWORD', 'macOS notarization app-specific password')
    requireEnv('APPLE_TEAM_ID', 'macOS notarization team ID')
  }

  if (platform === 'linux') {
    console.warn('[Release Gate] Linux AppImage has no mandatory code-signing gate configured.')
  }
}

function main() {
  console.log('[Release Gate] Checking public release readiness...')
  checkPackageMetadata()
  checkTrackedArtifacts()
  checkUrls()
  checkSigning()
  if (process.exitCode) process.exit(process.exitCode)
  console.log('[Release Gate] Public release readiness checks passed.')
}

main()
