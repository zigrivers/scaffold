import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runCli } from './index.js'
import { readPackageVersion } from './commands/version.js'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DIST_CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url))
// Sources whose changes affect `scaffold --version` behavior.
const VERSION_SOURCES = ['src/cli/index.ts', 'src/cli/commands/version.ts'].map(
  (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url)),
)

describe('CLI framework', () => {
  it('exports runCli function', () => {
    expect(typeof runCli).toBe('function')
  })
})

describe('scaffold --version (global flag, PRD F-030)', () => {
  // Exercises real yargs exit behavior by spawning the built CLI — the same
  // `scaffold --version` invocation users and the mmr doc-conformance auth check
  // rely on. (In-process testing can't observe yargs' process.exit under Vitest.)
  // Rebuild dist only when it's missing or older than the relevant sources, so the
  // test is never stale yet adds no cost in `make ts-check` (which builds first).
  beforeAll(() => {
    const distMtime = fs.existsSync(DIST_CLI) ? fs.statSync(DIST_CLI).mtimeMs : 0
    const stale = VERSION_SOURCES.some((s) => fs.existsSync(s) && fs.statSync(s).mtimeMs > distMtime)
    if (distMtime === 0 || stale) {
      execSync('npm run build', { cwd: REPO_ROOT, stdio: 'ignore' })
    }
  }, 120_000)

  it('prints the package version and exits 0 (not disabled)', () => {
    // execFileSync throws on non-zero exit, so a clean return already asserts
    // exit 0. Before the fix, `.version(false)` + `.demandCommand(1)` made
    // `--version` fall through to "You must specify a command" and exit 1.
    const out = execFileSync('node', [DIST_CLI, '--version'], { encoding: 'utf8' })
    expect(out).toContain(readPackageVersion())
    expect(out).toMatch(/\d+\.\d+\.\d+/)
  })
})
