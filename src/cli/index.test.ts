import { describe, it, expect, beforeAll } from 'vitest'
import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runCli } from './index.js'
import { readPackageVersion } from './commands/version.js'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DIST_CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url))
// Map each source that affects `scaffold --version` to its compiled output, so the
// staleness check looks at the actual code under test (not just the dist entry).
const BUILD_TARGETS: Array<[src: string, out: string]> = [
  ['src/cli/index.ts', 'dist/cli/index.js'],
  ['src/cli/commands/version.ts', 'dist/cli/commands/version.js'],
].map(([s, o]) => [
  fileURLToPath(new URL(`../../${s}`, import.meta.url)),
  fileURLToPath(new URL(`../../${o}`, import.meta.url)),
])

describe('CLI framework', () => {
  it('exports runCli function', () => {
    expect(typeof runCli).toBe('function')
  })
})

describe('scaffold --version (global flag, PRD F-030)', () => {
  // Exercises real yargs exit behavior by spawning the built CLI — the same
  // `scaffold --version` invocation that users (and the documented CLI contract)
  // rely on. (In-process testing can't observe yargs' process.exit under Vitest.)
  // Rebuild dist only when the entry is missing or a compiled output is older than
  // its source, so the test is never stale yet adds no cost in `make ts-check`
  // (which builds first).
  beforeAll(() => {
    const needBuild =
      !fs.existsSync(DIST_CLI) ||
      BUILD_TARGETS.some(
        ([src, out]) =>
          !fs.existsSync(out) ||
          (fs.existsSync(src) && fs.statSync(src).mtimeMs > fs.statSync(out).mtimeMs),
      )
    if (needBuild) {
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
