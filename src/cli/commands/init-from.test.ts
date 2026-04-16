import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yargs, { type Argv } from 'yargs'

// ---------------------------------------------------------------------------
// Hoisted mocks (mirror init.test.ts, extended for --from path)
// ---------------------------------------------------------------------------

vi.mock('../../wizard/wizard.js', () => ({
  runWizard: vi.fn(),
  materializeScaffoldProject: vi.fn(),
  readOldStateIfExists: vi.fn().mockReturnValue(undefined),
}))

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'auto'),
}))

vi.mock('../output/context.js', () => ({
  createOutputContext: vi.fn(() => ({
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    result: vi.fn(),
    supportsInteractivePrompts: vi.fn().mockReturnValue(false),
    prompt: vi.fn().mockResolvedValue(''),
    confirm: vi.fn().mockResolvedValue(false),
    select: vi.fn().mockResolvedValue(''),
    multiSelect: vi.fn().mockResolvedValue([]),
    multiInput: vi.fn().mockResolvedValue([]),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    stopProgress: vi.fn(),
  })),
}))

vi.mock('../../core/skills/sync.js', () => ({
  syncSkillsIfNeeded: vi.fn(),
}))

vi.mock('../shutdown.js', () => {
  const ExitCode = { UserCancellation: 4 }
  return {
    shutdown: {
      withPrompt: vi.fn(async (fn: () => Promise<unknown>) => {
        try {
          return await fn()
        } catch (e) {
          if (e instanceof Error && e.name === 'ExitPromptError') {
            process.exit(ExitCode.UserCancellation)
            const sentinel = new Error('process.exit')
            sentinel.name = 'ProcessExit'
            throw sentinel
          }
          throw e
        }
      }),
      withContext: vi.fn(async (_msg: string, fn: () => Promise<unknown>) => fn()),
    },
  }
})

vi.mock('./build.js', () => ({
  runBuild: vi.fn().mockResolvedValue({
    exitCode: 0,
    data: {
      stepsTotal: 2,
      stepsEnabled: 2,
      platforms: ['claude-code', 'universal'],
      generatedFiles: 3,
      buildTimeMs: 10,
    },
  }),
  default: {
    handler: vi.fn().mockResolvedValue(undefined),
  },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { materializeScaffoldProject, readOldStateIfExists } from '../../wizard/wizard.js'
import { runBuild } from './build.js'
import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
import initCommand, { CONFIG_SETTING_FLAGS } from './init.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type InitArgv = Parameters<typeof initCommand.handler>[0]

function defaultArgv(overrides: Partial<InitArgv> = {}): InitArgv {
  return {
    format: undefined,
    auto: true,
    verbose: undefined,
    root: undefined,
    force: false,
    idea: undefined,
    methodology: undefined,
    ...overrides,
  } as InitArgv
}

/** Valid services.yml content for tests */
const VALID_SERVICES_YAML = `version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: research-engine
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: apikey
        asyncMessaging: none
        deployTarget: container
        domain: fintech
      path: services/research
`

/**
 * Run the init builder through yargs.parseAsync so .check() fires.
 */
async function parseInitArgs(args: string[]): Promise<Record<string, unknown>> {
  const instance = yargs(args)
    .exitProcess(false)
    .fail(false)
  const builderFn = initCommand.builder as (y: Argv) => Argv
  const built = builderFn(instance)
  return built.parseAsync() as Promise<Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('init --from: builder-level flag conflicts', () => {
  it('rejects --from with --methodology', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--methodology', 'deep']),
    ).rejects.toThrow(/--from cannot be combined with/)
  })

  it('rejects --from with --backend-api-style', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--backend-api-style', 'rest']),
    ).rejects.toThrow(/--from cannot be combined with/)
  })

  it('rejects --from with --idea', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--idea', 'my cool project']),
    ).rejects.toThrow(/--from cannot be combined with/)
  })

  it('rejects --from with --project-type', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--project-type', 'backend']),
    ).rejects.toThrow(/--from cannot be combined with/)
  })

  it('rejects --from with --depth (config-setting flag)', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--depth', '3']),
    ).rejects.toThrow(/--from cannot be combined with/)
  })

  it('rejects --from with --web-rendering', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--web-rendering', 'ssr']),
    ).rejects.toThrow(/--from cannot be combined with/)
  })
})

describe('init --from: operational flags accepted alongside --from', () => {
  it('accepts --from with --root', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--root', '/tmp/foo']),
    ).resolves.toMatchObject({ from: 'services.yml', root: '/tmp/foo' })
  })

  it('accepts --from with --force', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--force']),
    ).resolves.toMatchObject({ from: 'services.yml', force: true })
  })

  it('accepts --from with --verbose', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--verbose']),
    ).resolves.toMatchObject({ from: 'services.yml', verbose: true })
  })

  it('accepts --from with --auto', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--auto']),
    ).resolves.toMatchObject({ from: 'services.yml', auto: true })
  })

  it('accepts --from with --format json', async () => {
    await expect(
      parseInitArgs(['--from', 'services.yml', '--format', 'json']),
    ).resolves.toMatchObject({ from: 'services.yml', format: 'json' })
  })
})

describe('init --from: handler integration', () => {
  let tmpDir: string
  const mockMaterialize = vi.mocked(materializeScaffoldProject)
  const mockReadOldState = vi.mocked(readOldStateIfExists)
  const mockRunBuild = vi.mocked(runBuild)

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-from-test-'))
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    mockMaterialize.mockReset()
    mockReadOldState.mockReset().mockReturnValue(undefined)
    mockRunBuild.mockReset().mockResolvedValue({
      exitCode: 0,
      data: {
        stepsTotal: 2,
        stepsEnabled: 2,
        platforms: ['claude-code', 'universal'],
        generatedFiles: 3,
        buildTimeMs: 10,
      },
    })
    vi.mocked(syncSkillsIfNeeded).mockReset()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('valid services.yml materializes and runs build', async () => {
    const ymlPath = path.join(tmpDir, 'services.yml')
    fs.writeFileSync(ymlPath, VALID_SERVICES_YAML)

    await initCommand.handler(defaultArgv({ root: tmpDir, from: ymlPath }))

    expect(mockMaterialize).toHaveBeenCalledWith(
      expect.objectContaining({ version: 2, methodology: 'deep' }),
      expect.objectContaining({ projectRoot: tmpDir, force: false }),
    )
    expect(mockRunBuild).toHaveBeenCalled()
    expect(syncSkillsIfNeeded).toHaveBeenCalled()
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('valid services.yml with --force passes force to materialize', async () => {
    const ymlPath = path.join(tmpDir, 'services.yml')
    fs.writeFileSync(ymlPath, VALID_SERVICES_YAML)

    await initCommand.handler(defaultArgv({ root: tmpDir, from: ymlPath, force: true }))

    expect(mockMaterialize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ force: true }),
    )
  })

  it('calls readOldStateIfExists and passes result', async () => {
    const ymlPath = path.join(tmpDir, 'services.yml')
    fs.writeFileSync(ymlPath, VALID_SERVICES_YAML)
    const fakeState = { version: 1, steps: {} }
    mockReadOldState.mockReturnValue(fakeState as never)

    await initCommand.handler(defaultArgv({ root: tmpDir, from: ymlPath }))

    expect(mockReadOldState).toHaveBeenCalledWith(tmpDir)
    expect(mockMaterialize).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ oldState: fakeState }),
    )
  })

  it('missing file exits with code 2', async () => {
    await initCommand.handler(defaultArgv({
      root: tmpDir,
      from: path.join(tmpDir, 'nonexistent.yml'),
    }))

    expect(process.exitCode).toBe(2)
    expect(mockMaterialize).not.toHaveBeenCalled()
  })

  it('invalid YAML exits with code 2', async () => {
    const ymlPath = path.join(tmpDir, 'bad.yml')
    fs.writeFileSync(ymlPath, 'foo: [bar: baz')  // malformed YAML

    await initCommand.handler(defaultArgv({ root: tmpDir, from: ymlPath }))

    expect(process.exitCode).toBe(2)
    expect(mockMaterialize).not.toHaveBeenCalled()
  })

  it('invalid schema (missing version) exits with code 2', async () => {
    const ymlPath = path.join(tmpDir, 'bad-schema.yml')
    fs.writeFileSync(ymlPath, 'methodology: deep\n')

    await initCommand.handler(defaultArgv({ root: tmpDir, from: ymlPath }))

    expect(process.exitCode).toBe(2)
    expect(mockMaterialize).not.toHaveBeenCalled()
  })

  it('invalid schema (wrong version) exits with code 2', async () => {
    const ymlPath = path.join(tmpDir, 'bad-ver.yml')
    fs.writeFileSync(ymlPath, 'version: 99\nmethodology: deep\n')

    await initCommand.handler(defaultArgv({ root: tmpDir, from: ymlPath }))

    expect(process.exitCode).toBe(2)
    expect(mockMaterialize).not.toHaveBeenCalled()
  })

  it('ExistingScaffoldError from materialize exits with code 2', async () => {
    const ymlPath = path.join(tmpDir, 'services.yml')
    fs.writeFileSync(ymlPath, VALID_SERVICES_YAML)

    // Import the actual error class for the test
    const { ExistingScaffoldError } = await import('../../utils/user-errors.js')
    mockMaterialize.mockRejectedValue(new ExistingScaffoldError(tmpDir))

    await initCommand.handler(defaultArgv({ root: tmpDir, from: ymlPath }))

    expect(process.exitCode).toBe(2)
  })

  it('--from - with TTY stdin exits with code 2', async () => {
    // Mock process.stdin.isTTY to be true
    const origIsTTY = process.stdin.isTTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, writable: true })

    try {
      await initCommand.handler(defaultArgv({ root: tmpDir, from: '-' }))
      expect(process.exitCode).toBe(2)
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: origIsTTY, writable: true })
    }
  })

  it('--from success falls through to runBuild and syncSkillsIfNeeded', async () => {
    const ymlPath = path.join(tmpDir, 'services.yml')
    fs.writeFileSync(ymlPath, VALID_SERVICES_YAML)

    await initCommand.handler(defaultArgv({ root: tmpDir, from: ymlPath }))

    expect(mockRunBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        'validate-only': false,
        root: tmpDir,
      }),
      expect.any(Object),
    )
    expect(syncSkillsIfNeeded).toHaveBeenCalledWith(tmpDir)
  })

  it('non-ScaffoldUserError propagates (not swallowed)', async () => {
    const ymlPath = path.join(tmpDir, 'services.yml')
    fs.writeFileSync(ymlPath, VALID_SERVICES_YAML)
    mockMaterialize.mockRejectedValue(new TypeError('unexpected'))

    await expect(
      initCommand.handler(defaultArgv({ root: tmpDir, from: ymlPath })),
    ).rejects.toThrow('unexpected')
  })
})

// ---------------------------------------------------------------------------
// Flag universe linter: every non-operational init flag is in CONFIG_SETTING_FLAGS
// ---------------------------------------------------------------------------

describe('CONFIG_SETTING_FLAGS universe coverage', () => {
  /**
   * Operational flags that should NOT be in CONFIG_SETTING_FLAGS.
   * These are the flags that --from is compatible with.
   */
  const OPERATIONAL_FLAGS = new Set([
    'root', 'force', 'auto', 'format', 'verbose', 'from',
    // yargs internals
    'help', 'version', '$0', '_',
  ])

  it('every non-operational init flag appears in CONFIG_SETTING_FLAGS', async () => {
    // Parse with no args to get the full set of known keys (with defaults)
    const parsed = await parseInitArgs([])
    const allFlags = Object.keys(parsed)
      // yargs adds camelCase aliases — keep only kebab-case originals
      .filter(k => !k.includes('$') && k !== '_')
      // Remove camelCase versions of kebab flags (yargs adds both)
      .filter(k => {
        // If it contains uppercase, it's a camelCase alias — skip
        if (/[A-Z]/.test(k)) return false
        return true
      })

    const configSettingSet = new Set(CONFIG_SETTING_FLAGS)

    const uncovered = allFlags.filter(
      f => !OPERATIONAL_FLAGS.has(f) && !configSettingSet.has(f),
    )

    expect(uncovered).toEqual([])
  })
})
