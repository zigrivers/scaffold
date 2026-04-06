import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yargs, { type Argv } from 'yargs'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../../wizard/wizard.js', () => ({
  runWizard: vi.fn(),
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

// Mock the build command to avoid circular deps / actual build execution
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

import { runWizard } from '../../wizard/wizard.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { runBuild } from './build.js'
import { syncSkillsIfNeeded } from '../../core/skills/sync.js'
import initCommand from './init.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type InitArgv = Parameters<typeof initCommand.handler>[0]

function makeSuccessResult(projectRoot: string) {
  return {
    success: true,
    projectRoot,
    configPath: path.join(projectRoot, '.scaffold', 'config.yml'),
    methodology: 'deep',
    errors: [],
  }
}

function makeFailResult(projectRoot: string) {
  return {
    success: false,
    projectRoot,
    configPath: path.join(projectRoot, '.scaffold', 'config.yml'),
    methodology: 'unknown',
    errors: [
      {
        code: 'INIT_SCAFFOLD_EXISTS',
        message: '.scaffold/ directory already exists',
        exitCode: 1,
        recovery: 'Use --force to back up and reinitialize',
      },
    ],
  }
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('init command', () => {
  let exitSpy: MockInstance
  let tmpDir: string
  const mockRunWizard = vi.mocked(runWizard)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const mockRunBuild = vi.mocked(runBuild)

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-init-test-'))
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    vi.mocked(syncSkillsIfNeeded).mockReset()
    mockResolveOutputMode.mockReturnValue('auto')
    mockRunWizard.mockResolvedValue(makeSuccessResult(tmpDir))
    mockRunBuild.mockResolvedValue({
      exitCode: 0,
      data: {
        stepsTotal: 2,
        stepsEnabled: 2,
        platforms: ['claude-code', 'universal'],
        generatedFiles: 3,
        buildTimeMs: 10,
      },
    })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Runs wizard successfully in temp directory and auto-runs build
  it('runs wizard, auto-runs build, and exits 0 on success', async () => {
    await initCommand.handler(defaultArgv({ root: tmpDir }))
    expect(mockRunWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: tmpDir }),
    )
    expect(mockRunBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        root: tmpDir,
        'validate-only': false,
      }),
      expect.any(Object),
    )
    expect(syncSkillsIfNeeded).toHaveBeenCalled()
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // Test 2: JSON mode outputs single InitResult payload including buildResult
  it('JSON mode outputs result with success shape and buildResult', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const mockOutput = {
      success: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      result: vi.fn(),
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
    }
    vi.mocked(createOutputContext).mockReturnValue(mockOutput)

    await initCommand.handler(defaultArgv({ root: tmpDir, format: 'json' }))

    expect(mockOutput.result).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: tmpDir,
        methodology: 'deep',
        success: true,
        buildResult: expect.objectContaining({
          generatedFiles: 3,
        }),
      }),
    )
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // Test 3: --force backs up existing .scaffold/
  it('passes force=true to wizard when --force flag given', async () => {
    await initCommand.handler(defaultArgv({ root: tmpDir, force: true }))
    expect(mockRunWizard).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    )
  })

  // Test 4: Exits 1 when .scaffold/ exists without --force
  it('exits 1 when wizard returns INIT_SCAFFOLD_EXISTS error', async () => {
    mockRunWizard.mockResolvedValue(makeFailResult(tmpDir))
    await initCommand.handler(defaultArgv({ root: tmpDir }))
    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(mockRunBuild).not.toHaveBeenCalled()
  })

  // Test 5: --methodology flag is passed through to wizard
  it('passes methodology flag to wizard', async () => {
    await initCommand.handler(defaultArgv({ root: tmpDir, methodology: 'mvp' }))
    expect(mockRunWizard).toHaveBeenCalledWith(
      expect.objectContaining({ methodology: 'mvp' }),
    )
  })

  // Test 6: --project-type flag is passed through to wizard
  it('passes project-type flag to wizard', async () => {
    await initCommand.handler(defaultArgv({ root: tmpDir, 'project-type': 'game' } as Partial<InitArgv>))
    expect(mockRunWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: 'game' }),
    )
  })

  // Test 7: Creates .scaffold/ in correct location (uses process.cwd() when root not given)
  it('uses process.cwd() as projectRoot when root not provided', async () => {
    const cwd = process.cwd()
    mockRunWizard.mockResolvedValue(makeSuccessResult(cwd))
    await initCommand.handler(defaultArgv({ root: undefined }))
    expect(mockRunWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: cwd }),
    )
  })

  it('exits with build exit code when auto-build fails', async () => {
    mockRunBuild.mockResolvedValue({ exitCode: 5 })

    await initCommand.handler(defaultArgv({ root: tmpDir }))

    expect(exitSpy).toHaveBeenCalledWith(5)
  })
})

// ---------------------------------------------------------------------------
// .check() validation tests — invoked via the yargs builder
// ---------------------------------------------------------------------------

/**
 * Run the init builder through yargs.parseAsync so .check() fires.
 * Returns the parsed argv on success, throws on validation failure.
 */
async function parseInitArgs(args: string[]): Promise<Record<string, unknown>> {
  const instance = yargs(args)
    .exitProcess(false)
    .fail(false)
  const builderFn = initCommand.builder as (y: Argv) => Argv
  const built = builderFn(instance)
  return built.parseAsync() as Promise<Record<string, unknown>>
}

describe('init command — .check() validation', () => {
  const mockRunWizard = vi.mocked(runWizard)
  const mockRunBuild = vi.mocked(runBuild)

  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    mockRunWizard.mockResolvedValue(makeSuccessResult(os.tmpdir()))
    mockRunBuild.mockResolvedValue({
      exitCode: 0,
      data: {
        stepsTotal: 2,
        stepsEnabled: 2,
        platforms: ['claude-code'],
        generatedFiles: 2,
        buildTimeMs: 5,
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Auto-detection: type-specific flags set projectType in handler
  // -------------------------------------------------------------------------

  // Note: .check() itself does NOT set projectType — that happens in the handler.
  // These tests verify that the flags are ACCEPTED without error (no .check() throw)
  // and that the handler auto-detects the correct project type.

  it('accepts --web-rendering ssr without explicit --project-type', async () => {
    await expect(parseInitArgs(['--web-rendering', 'ssr'])).resolves.toMatchObject({
      'web-rendering': 'ssr',
    })
  })

  it('accepts --backend-api-style rest without explicit --project-type', async () => {
    await expect(parseInitArgs(['--backend-api-style', 'rest'])).resolves.toMatchObject({
      'backend-api-style': 'rest',
    })
  })

  it('accepts --cli-interactivity hybrid without explicit --project-type', async () => {
    await expect(parseInitArgs(['--cli-interactivity', 'hybrid'])).resolves.toMatchObject({
      'cli-interactivity': 'hybrid',
    })
  })

  // Handler auto-detection tests (calls handler with mock argv)
  it('handler auto-detects web-app from --web-rendering flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'web-rendering': 'ssr',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: 'web-app' }),
    )
  })

  it('handler auto-detects backend from --backend-api-style flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'backend-api-style': 'rest',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: 'backend' }),
    )
  })

  it('handler auto-detects cli from --cli-interactivity flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'cli-interactivity': 'hybrid',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: 'cli' }),
    )
  })

  // -------------------------------------------------------------------------
  // Mixed-family rejection
  // -------------------------------------------------------------------------

  it('rejects mixing --web-rendering with --backend-api-style', async () => {
    await expect(
      parseInitArgs(['--web-rendering', 'ssr', '--backend-api-style', 'rest']),
    ).rejects.toThrow(/mix/)
  })

  it('rejects mixing --web-rendering with game flag --engine', async () => {
    await expect(
      parseInitArgs(['--web-rendering', 'ssr', '--engine', 'unity']),
    ).rejects.toThrow(/mix/)
  })

  // -------------------------------------------------------------------------
  // Project type conflict
  // -------------------------------------------------------------------------

  it('rejects --project-type backend with --web-rendering ssr', async () => {
    await expect(
      parseInitArgs(['--project-type', 'backend', '--web-rendering', 'ssr']),
    ).rejects.toThrow(/web-\* flags require/)
  })

  // -------------------------------------------------------------------------
  // CSV enum validation
  // -------------------------------------------------------------------------

  it('rejects invalid --backend-data-store value', async () => {
    await expect(
      parseInitArgs(['--backend-data-store', 'invalid-value']),
    ).rejects.toThrow(/Invalid --backend-data-store/)
  })

  it('rejects invalid --cli-distribution value', async () => {
    await expect(
      parseInitArgs(['--cli-distribution', 'invalid-channel']),
    ).rejects.toThrow(/Invalid --cli-distribution/)
  })

  it('accepts valid --backend-data-store CSV values', async () => {
    await expect(
      parseInitArgs(['--backend-data-store', 'relational,document']),
    ).resolves.toMatchObject({
      'backend-data-store': ['relational', 'document'],
    })
  })

  // -------------------------------------------------------------------------
  // Cross-field validation (SSR/static, session/static)
  // -------------------------------------------------------------------------

  it('rejects --web-rendering ssr with --web-deploy-target static', async () => {
    await expect(
      parseInitArgs(['--web-rendering', 'ssr', '--web-deploy-target', 'static']),
    ).rejects.toThrow(/SSR/)
  })

  it('accepts --web-rendering ssg with --web-deploy-target static', async () => {
    await expect(
      parseInitArgs(['--web-rendering', 'ssg', '--web-deploy-target', 'static']),
    ).resolves.toMatchObject({
      'web-rendering': 'ssg',
      'web-deploy-target': 'static',
    })
  })

  it('rejects --web-auth-flow session with --web-deploy-target static', async () => {
    await expect(
      parseInitArgs(['--web-auth-flow', 'session', '--web-deploy-target', 'static']),
    ).rejects.toThrow(/Session auth/)
  })
})
