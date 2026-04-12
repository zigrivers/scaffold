import type { CommandModule } from 'yargs'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { shutdown } from '../shutdown.js'

interface VersionArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  // Internal DI override for testing
  _fetchLatestVersion?: (name: string) => Promise<string | null>
}

function readPackageVersion(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  // In dist/cli/commands/version.js, package.json is at ../../package.json
  // In src/cli/commands/version.ts (dev/test), package.json is at ../../../package.json
  const candidates = [
    path.resolve(__dirname, '../../package.json'),
    path.resolve(__dirname, '../../../package.json'),
  ]
  for (const pkgPath of candidates) {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string }
      if (pkg.version) return pkg.version
    }
  }
  return 'unknown'
}

/**
 * Returns true if semver string `a` is strictly newer than `b`.
 * Handles "X.Y.Z" format only.
 */
function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split('.').map(n => parseInt(n, 10))
  const pb = b.split('.').map(n => parseInt(n, 10))
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff > 0) return true
    if (diff < 0) return false
  }
  return false
}

export async function fetchLatestVersion(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 3000)
    timeout.unref()
    const url = `https://registry.npmjs.org/${encodeURIComponent(name)}/latest`
    const req = https.get(url, { signal: shutdown.signal }, (res) => {
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        clearTimeout(timeout)
        try {
          const result = JSON.parse(body) as { version?: string }
          resolve(result.version ?? null)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => {
      clearTimeout(timeout)
      resolve(null)
    })
  })
}

const versionCommand: CommandModule<Record<string, unknown>, VersionArgs> = {
  command: 'version',
  describe: 'Show scaffold version and check for updates',
  builder: (yargs) => {
    return yargs
  },
  handler: async (argv) => {
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const version = readPackageVersion()
    const nodeVersion = process.version
    const platform = process.platform

    // Support DI override for testing; otherwise use real implementation
    const latestVersionFn = argv._fetchLatestVersion ?? fetchLatestVersion
    const latestVersion = await latestVersionFn('@zigrivers/scaffold').catch(() => null)
    const updateAvailable = latestVersion !== null ? isNewerVersion(latestVersion, version) : null

    if (outputMode === 'json') {
      output.result({
        version,
        node_version: nodeVersion,
        platform,
        latest_version: latestVersion,
        update_available: updateAvailable,
      })
    } else {
      output.info(`scaffold v${version}`)
      output.info(`Node.js ${nodeVersion} (${platform})`)
      if (latestVersion !== null) {
        if (updateAvailable) {
          output.info(`Latest: ${latestVersion} (update available)`)
        } else if (isNewerVersion(version, latestVersion)) {
          output.info(`Latest: ${latestVersion} (ahead of registry)`)
        } else {
          output.info(`Latest: ${latestVersion} (up to date)`)
        }
      }
    }
    process.exit(0)
  },
}

export default versionCommand
