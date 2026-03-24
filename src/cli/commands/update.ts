import type { CommandModule, Argv } from 'yargs'
import { execSync } from 'node:child_process'
import https from 'node:https'
import fs from 'node:fs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'

interface UpdateArgs {
  'check-only': boolean
  'skip-build': boolean
  format?: string
  auto?: boolean
  verbose?: boolean
}

/**
 * Read the installed version from package.json.
 * Falls back to '0.0.0' if not found.
 */
function readInstalledVersion(): string {
  try {
    const locations = [
      new URL('../../../package.json', import.meta.url),
      new URL('../../../../package.json', import.meta.url),
    ]
    for (const loc of locations) {
      try {
        const pkg = JSON.parse(fs.readFileSync(loc.pathname, 'utf8')) as { version?: string }
        if (pkg.version) return pkg.version
      } catch {
        // try next location
      }
    }
  } catch {
    // ignore
  }
  return '0.0.0'
}

/**
 * Detect the install channel and return the appropriate upgrade command.
 */
function detectInstallChannel(): { channel: string; upgradeCommand: string } {
  const execPath = process.execPath
  if (execPath.includes('/opt/homebrew/') || execPath.includes('/usr/local/Cellar/')) {
    return { channel: 'homebrew', upgradeCommand: 'brew upgrade scaffold' }
  }
  try {
    execSync('npm list -g @zigrivers/scaffold 2>/dev/null', { stdio: 'pipe' })
    return { channel: 'npm-global', upgradeCommand: 'npm update -g @zigrivers/scaffold' }
  } catch {
    // not npm global
  }
  return { channel: 'npx', upgradeCommand: 'npx @zigrivers/scaffold@latest' }
}

/**
 * Fetch the latest version from the npm registry.
 * Times out after 3 seconds and returns null on failure.
 */
function fetchLatestVersion(packageName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 3000)
    const req = https.get(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += String(chunk)
        })
        res.on('end', () => {
          clearTimeout(timeout)
          try {
            const parsed = JSON.parse(data) as { version?: string }
            resolve(parsed.version ?? null)
          } catch {
            resolve(null)
          }
        })
      },
    )
    req.on('error', () => {
      clearTimeout(timeout)
      resolve(null)
    })
  })
}

const updateCommand: CommandModule<Record<string, unknown>, UpdateArgs> = {
  command: 'update',
  describe: 'Check for and display scaffold CLI updates',
  builder: (yargs: Argv) => {
    return yargs
      .option('check-only', {
        type: 'boolean',
        description: 'Check for updates without installing',
        default: false,
      })
      .option('skip-build', {
        type: 'boolean',
        description: 'Skip auto-rebuild after update',
        default: false,
      })
  },
  handler: async (argv) => {
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const currentVersion = readInstalledVersion()
    const { channel, upgradeCommand } = detectInstallChannel()

    // Dependency injection for testability
    const _fetchLatestVersion = (
      argv as unknown as { _fetchLatestVersion?: typeof fetchLatestVersion }
    )._fetchLatestVersion ?? fetchLatestVersion

    let latestVersion: string | null = null
    try {
      latestVersion = await _fetchLatestVersion('@zigrivers/scaffold')
    } catch {
      // network error — latestVersion stays null
    }

    const updateAvailable = latestVersion !== null && latestVersion !== currentVersion

    if (argv['check-only']) {
      if (outputMode === 'json') {
        output.result({
          current_version: currentVersion,
          latest_version: latestVersion,
          update_available: updateAvailable,
          channel,
        })
      } else {
        output.info(`scaffold v${currentVersion} (installed via ${channel})`)
        if (latestVersion !== null) {
          if (updateAvailable) {
            output.info(`Update available: v${latestVersion} \u2014 run: ${upgradeCommand}`)
          } else {
            output.success('Up to date')
          }
        } else {
          output.info('Could not check for updates (network unavailable)')
        }
      }
      process.exit(0)
      return
    }

    // Default: check and instruct (we don't run installs from within CLI)
    if (updateAvailable) {
      output.info(`Update available: v${latestVersion}`)
      output.info(`Run: ${upgradeCommand}`)
    } else if (latestVersion !== null) {
      output.success(`scaffold v${currentVersion} is up to date`)
    } else {
      output.info(`Could not check for updates. Run: ${upgradeCommand}`)
    }

    if (outputMode === 'json') {
      output.result({
        updated: false,
        previous_version: currentVersion,
        new_version: latestVersion,
        changelog: [],
        rebuild_result: null,
      })
    }

    process.exit(0)
  },
}

export default updateCommand
