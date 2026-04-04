import path from 'node:path'
import fs from 'node:fs'
import { syncSkillsIfNeeded } from '../../core/skills/sync.js'

/**
 * Walk up from startDir looking for a directory containing .scaffold/.
 * Returns absolute path to the directory containing .scaffold/, or null if not found.
 */
export function findProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir)
  while (true) {
    const scaffoldDir = path.join(current, '.scaffold')
    if (fs.existsSync(scaffoldDir) && fs.statSync(scaffoldDir).isDirectory()) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) return null  // reached filesystem root
    current = parent
  }
}

/**
 * Commands that do NOT require an initialized .scaffold/ directory.
 * All other commands require it.
 */
export const ROOT_OPTIONAL_COMMANDS = ['init', 'version', 'update'] as const

/**
 * Yargs middleware that detects project root and sets it on argv.
 * For commands not in ROOT_OPTIONAL_COMMANDS, throws if .scaffold/ not found.
 *
 * Usage: .middleware(createProjectRootMiddleware())
 *
 * Sets argv.detectedRoot to the found project root (string | undefined).
 * Commands should use argv.root ?? argv.detectedRoot as the project root.
 */
export function createProjectRootMiddleware(): (argv: Record<string, unknown>) => void {
  return (argv: Record<string, unknown>) => {
    if (typeof argv['root'] === 'string') {
      argv['detectedRoot'] = argv['root']
      try {
        syncSkillsIfNeeded(argv['root'])
      } catch {
        // best-effort
      }
      return
    }

    const found = findProjectRoot(process.cwd())
    argv['detectedRoot'] = found ?? undefined

    // Auto-sync project-local skills when version changes
    if (argv['detectedRoot']) {
      try {
        syncSkillsIfNeeded(argv['detectedRoot'] as string)
      } catch {
        // Skill sync is best-effort — never block CLI commands
      }
    }

    if (argv['detectedRoot'] === undefined) {
      const commands = argv['_'] as string[]
      const command = commands[0] ?? ''
      const optionalCommands: readonly string[] = ROOT_OPTIONAL_COMMANDS
      if (!optionalCommands.includes(command)) {
        process.stderr.write(
          '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n' +
          '  Fix: Run `scaffold init` to initialize a project\n',
        )
        process.exit(1)
      }
    }
  }
}
