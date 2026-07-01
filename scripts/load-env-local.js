const fs = require('fs')
const path = require('path')

/**
 * Load repo-root .env.local into process.env (does not override existing env vars).
 */
function loadEnvLocal(rootDir) {
  const file = path.join(rootDir, '.env.local')
  if (!fs.existsSync(file)) return false

  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value
    }
  }
  return true
}

function pkgVersion(rootDir) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version
}

/** Resolve UPDATE_FEED_URL from env, .env.local GITHUB_REPOSITORY, or package version. */
function resolveUpdateFeedUrl(rootDir) {
  if (process.env.UPDATE_FEED_URL) return process.env.UPDATE_FEED_URL
  const repo = process.env.GITHUB_REPOSITORY || 'aditya190803/audit-app'
  const version = pkgVersion(rootDir)
  return `https://github.com/${repo}/releases/download/v${version}`
}

module.exports = { loadEnvLocal, resolveUpdateFeedUrl, pkgVersion }