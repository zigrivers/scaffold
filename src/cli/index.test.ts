import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { runCli } from './index.js'
import { readPackageVersion } from './commands/version.js'

const DIST_CLI = fileURLToPath(new URL('../../dist/index.js', import.meta.url))

describe('CLI framework', () => {
  it('exports runCli function', () => {
    expect(typeof runCli).toBe('function')
  })
})

describe('scaffold --version (global flag, PRD F-030)', () => {
  // Spawns the built CLI (dist is built before tests in `make ts-check`). This
  // exercises real yargs exit behavior — the same `scaffold --version` invocation
  // users and the mmr doc-conformance auth check rely on. Before the fix,
  // `.version(false)` + `.demandCommand(1)` made `--version` exit 1.
  it('prints the package version and exits 0', () => {
    // execFileSync throws if the process exits non-zero, so a passing call
    // already asserts exit code 0.
    const out = execFileSync('node', [DIST_CLI, '--version'], { encoding: 'utf8' })
    expect(out).toContain(readPackageVersion())
    expect(out).toMatch(/\d+\.\d+\.\d+/)
  })
})
