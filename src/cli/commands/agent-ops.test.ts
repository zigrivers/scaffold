import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import agentOpsCommand, { resolveComponents } from './agent-ops.js'

describe('resolveComponents', () => {
  it('maps all to both components', () => {
    expect(resolveComponents('all')).toEqual(['git', 'staging'])
  })
  it('maps single component names', () => {
    expect(resolveComponents('git')).toEqual(['git'])
    expect(resolveComponents('staging')).toEqual(['staging'])
  })
  it('defaults to all when omitted', () => {
    expect(resolveComponents(undefined)).toEqual(['git', 'staging'])
  })
  it('throws on unknown component', () => {
    expect(() => resolveComponents('nope')).toThrow(/unknown component/i)
  })
})

/**
 * Sentinel thrown by the mocked process.exit. Unlike skill.test.ts's no-op
 * mock, the agent-ops handler relies on process.exit's never-return for
 * control flow (check exits before the install path; the invalid-component
 * catch exits before installAgentOps runs), so the mock must actually
 * terminate execution to exercise the handler realistically.
 */
class ExitSignal extends Error {
  readonly code: number
  constructor(code: number) {
    super(`process.exit(${code})`)
    this.code = code
  }
}

type HandlerArgs = Parameters<typeof agentOpsCommand.handler>[0]

describe('agentOpsCommand.handler exit-code contract', () => {
  let exitSpy: MockInstance
  let outLines: string[]
  let errLines: string[]
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-cli-'))
    outLines = []
    errLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new ExitSignal(typeof code === 'number' ? code : 0)
    }) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      outLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      errLines.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  async function run(args: Record<string, unknown>): Promise<number> {
    try {
      await agentOpsCommand.handler({
        $0: 'scaffold',
        _: ['agent-ops'],
        root: tmpDir,
        ...args,
      } as HandlerArgs)
    } catch (e) {
      if (e instanceof ExitSignal) return e.code
      throw e
    }
    throw new Error('handler returned without calling process.exit')
  }

  function combinedOutput(): string {
    return outLines.join('') + errLines.join('')
  }

  it('check on a fresh project exits 1 and points at install', async () => {
    const code = await run({ action: 'check' })
    expect(code).toBe(1)
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(combinedOutput()).toContain('stale')
    expect(combinedOutput()).toContain('scaffold agent-ops install')
  })

  it('install exits 0, then check exits 0 (marker written)', async () => {
    expect(await run({ action: 'install', component: 'staging' })).toBe(0)
    expect(await run({ action: 'check' })).toBe(0)
    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(combinedOutput()).toContain('up to date')
    expect(fs.existsSync(path.join(tmpDir, '.scaffold', 'agent-ops-version'))).toBe(true)
  })

  it('check exits 1 and names a manifest file missing on disk', async () => {
    expect(await run({ action: 'install' })).toBe(0)
    const manifestPath = path.join(tmpDir, '.scaffold', 'agent-ops-manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      version: string
      files: Record<string, string>
    }
    manifest.files['scripts/ghost.sh'] = 'a'.repeat(64)
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

    const code = await run({ action: 'check' })
    expect(code).toBe(1)
    expect(exitSpy).toHaveBeenLastCalledWith(1)
    expect(combinedOutput()).toContain('missing: scripts/ghost.sh')
  })

  it('install with an unknown component exits 1 via AGENT_OPS_INVALID_COMPONENT', async () => {
    const code = await run({ action: 'install', component: 'nope' })
    expect(code).toBe(1)
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(combinedOutput()).toContain('AGENT_OPS_INVALID_COMPONENT')
    expect(combinedOutput()).toContain('unknown component "nope"')
  })

  it('check reports a pre-existing unmanaged file, without failing the check on it alone', async () => {
    // Pre-create a git-owned dest as a user file so install refuses to claim it
    // (it never enters the manifest).
    const doctor = path.join(tmpDir, 'scripts', 'doctor.sh')
    fs.mkdirSync(path.dirname(doctor), { recursive: true })
    fs.writeFileSync(doctor, '# user-owned doctor\n')
    expect(await run({ action: 'install', component: 'git' })).toBe(0)

    const code = await run({ action: 'check' })
    expect(combinedOutput()).toContain('exists but not managed by scaffold')
    expect(combinedOutput()).toContain('scripts/doctor.sh')
    // Unmanaged files are informational: everything scaffold DOES manage is
    // present and fresh, so the check still exits 0.
    expect(code).toBe(0)
  })
})
