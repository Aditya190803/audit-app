const { execFileSync } = require('child_process')
const path = require('path')
const { loadEnvLocal, resolveUpdateFeedUrl } = require('./load-env-local')

const ROOT = path.join(__dirname, '..')
loadEnvLocal(ROOT)
process.env.UPDATE_FEED_URL = process.env.UPDATE_FEED_URL || resolveUpdateFeedUrl(ROOT)
process.env.LICENSE_CHECK_URL =
  process.env.LICENSE_CHECK_URL || 'https://the-ska-auditing-app.vercel.app/api/license'
process.env.ALLOW_UNSIGNED_RELEASE = process.env.ALLOW_UNSIGNED_RELEASE || '1'

console.log('[eb] UPDATE_FEED_URL=', process.env.UPDATE_FEED_URL)
execFileSync('bunx', ['electron-builder', '--win', '--x64', '--publish', 'never'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
})