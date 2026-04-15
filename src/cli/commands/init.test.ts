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
            // Simulate process termination — throw so callers don't continue
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
    process.exitCode = undefined
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
    expect(process.exitCode ?? 0).toBe(0)
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
    expect(process.exitCode ?? 0).toBe(0)
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
    expect(process.exitCode).toBe(1)
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

  it('handles Ctrl-C (ExitPromptError) via shutdown.withPrompt and exits 4', async () => {
    const exitPromptError = new Error('prompt was cancelled')
    exitPromptError.name = 'ExitPromptError'
    mockRunWizard.mockRejectedValue(exitPromptError)

    // The mock withPrompt calls process.exit(4) then throws a sentinel
    // to simulate process termination, so the handler rejects.
    await Promise.resolve(initCommand.handler(defaultArgv({ root: tmpDir }))).catch(() => {})

    expect(exitSpy).toHaveBeenCalledWith(4)
    expect(mockRunBuild).not.toHaveBeenCalled()
  })

  it('exits with build exit code when auto-build fails', async () => {
    mockRunBuild.mockResolvedValue({ exitCode: 5 })

    await initCommand.handler(defaultArgv({ root: tmpDir }))

    expect(process.exitCode).toBe(5)
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

  it('rejects --backend-domain with a value outside declared choices', async () => {
    await expect(parseInitArgs([
      '--project-type', 'backend',
      '--backend-api-style', 'rest',
      '--backend-domain', 'bogus',
    ])).rejects.toThrow(/Invalid values|Choices/)
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
      'web-deploy-target': 'serverless',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        projectType: 'web-app',
        webAppFlags: expect.objectContaining({
          webRendering: 'ssr',
          webDeployTarget: 'serverless',
        }),
      }),
    )
  })

  it('handler auto-detects backend from --backend-api-style flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'backend-api-style': 'rest',
      'backend-data-store': ['relational'],
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        projectType: 'backend',
        backendFlags: expect.objectContaining({
          backendApiStyle: 'rest',
          backendDataStore: ['relational'],
        }),
      }),
    )
  })

  it('forwards --backend-domain=fintech into the wizard\'s backendFlags', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'backend-api-style': 'rest',
      'backend-domain': 'fintech',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        backendFlags: expect.objectContaining({ backendDomain: 'fintech' }),
      }),
    )
  })

  it('handler auto-detects cli from --cli-interactivity flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'cli-interactivity': 'hybrid',
      'cli-structured-output': true,
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        projectType: 'cli',
        cliFlags: expect.objectContaining({
          cliInteractivity: 'hybrid',
          cliStructuredOutput: true,
        }),
      }),
    )
  })

  it('handler builds gameFlags from --game-* flags', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      engine: 'unity',
      multiplayer: 'online',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        projectType: 'game',
        gameFlags: expect.objectContaining({
          engine: 'unity',
          multiplayer: 'online',
        }),
      }),
    )
  })

  it('handler builds libraryFlags from --lib-* flags', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'lib-visibility': 'public',
      'lib-bundle-format': 'dual',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        projectType: 'library',
        libraryFlags: expect.objectContaining({
          libVisibility: 'public',
          libBundleFormat: 'dual',
        }),
      }),
    )
  })

  it('handler builds mobileAppFlags from --mobile-* flags', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'mobile-platform': 'ios',
      'mobile-distribution': 'public',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        projectType: 'mobile-app',
        mobileAppFlags: expect.objectContaining({
          mobilePlatform: 'ios',
          mobileDistribution: 'public',
        }),
      }),
    )
  })

  it('handler builds dataPipelineFlags from --pipeline-* flags', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'pipeline-processing': 'streaming',
      'pipeline-orchestration': 'event-driven',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        projectType: 'data-pipeline',
        dataPipelineFlags: expect.objectContaining({
          pipelineProcessing: 'streaming',
          pipelineOrchestration: 'event-driven',
        }),
      }),
    )
  })

  it('handler builds mlFlags from --ml-* flags', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'ml-phase': 'training',
      'ml-model-type': 'llm',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        projectType: 'ml',
        mlFlags: expect.objectContaining({
          mlPhase: 'training',
          mlModelType: 'llm',
        }),
      }),
    )
  })

  it('handler builds browserExtensionFlags from --ext-* flags', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'ext-manifest': '3',
      'ext-content-script': true,
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({
        projectType: 'browser-extension',
        browserExtensionFlags: expect.objectContaining({
          extManifest: '3',
          extContentScript: true,
        }),
      }),
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

  it('accepts --game-engine alias for --engine', async () => {
    const args = await parseInitArgs(['--game-engine', 'unity'])
    expect(args.engine).toBe('unity')
  })

  it('rejects --game-engine with --web-rendering (mixed families)', async () => {
    await expect(
      parseInitArgs(['--game-engine', 'unity', '--web-rendering', 'ssr']),
    ).rejects.toThrow(/mix/)
  })

  // -------------------------------------------------------------------------
  // Library auto-detection
  // -------------------------------------------------------------------------

  it('accepts --lib-visibility public without explicit --project-type', async () => {
    await expect(parseInitArgs(['--lib-visibility', 'public'])).resolves.toMatchObject({
      'lib-visibility': 'public',
    })
  })

  it('handler auto-detects library from --lib-visibility flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'lib-visibility': 'public',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: 'library' }),
    )
  })

  // -------------------------------------------------------------------------
  // Mobile-app auto-detection
  // -------------------------------------------------------------------------

  it('accepts --mobile-platform ios without explicit --project-type', async () => {
    await expect(parseInitArgs(['--mobile-platform', 'ios'])).resolves.toMatchObject({
      'mobile-platform': 'ios',
    })
  })

  it('handler auto-detects mobile-app from --mobile-platform flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'mobile-platform': 'ios',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: 'mobile-app' }),
    )
  })

  // -------------------------------------------------------------------------
  // Mixed-family rejection: library / mobile
  // -------------------------------------------------------------------------

  it('rejects mixing --lib-visibility with --mobile-platform', async () => {
    await expect(
      parseInitArgs(['--lib-visibility', 'public', '--mobile-platform', 'ios']),
    ).rejects.toThrow(/mix/)
  })

  it('rejects mixing --lib-visibility with --web-rendering', async () => {
    await expect(
      parseInitArgs(['--lib-visibility', 'public', '--web-rendering', 'ssr']),
    ).rejects.toThrow(/mix/)
  })

  // -------------------------------------------------------------------------
  // Project type conflict: library / mobile
  // -------------------------------------------------------------------------

  it('rejects --project-type backend with --lib-visibility public', async () => {
    await expect(
      parseInitArgs(['--project-type', 'backend', '--lib-visibility', 'public']),
    ).rejects.toThrow(/lib-\* flags require/)
  })

  it('rejects --project-type web-app with --mobile-platform ios', async () => {
    await expect(
      parseInitArgs(['--project-type', 'web-app', '--mobile-platform', 'ios']),
    ).rejects.toThrow(/mobile-\* flags require/)
  })

  // -------------------------------------------------------------------------
  // Acceptance tests (valid combos — no cross-field constraints for lib/mobile)
  // -------------------------------------------------------------------------

  it('accepts --lib-visibility with other library flags', async () => {
    await expect(
      parseInitArgs(['--lib-visibility', 'internal', '--lib-runtime-target', 'node', '--lib-bundle-format', 'esm']),
    ).resolves.toMatchObject({
      'lib-visibility': 'internal',
      'lib-runtime-target': 'node',
      'lib-bundle-format': 'esm',
    })
  })

  it('accepts --mobile-platform with other mobile flags', async () => {
    await expect(
      parseInitArgs([
        '--mobile-platform', 'cross-platform',
        '--mobile-distribution', 'public', '--mobile-offline', 'cache',
      ]),
    ).resolves.toMatchObject({
      'mobile-platform': 'cross-platform',
      'mobile-distribution': 'public',
      'mobile-offline': 'cache',
    })
  })

  // -------------------------------------------------------------------------
  // Data-pipeline auto-detection
  // -------------------------------------------------------------------------

  it('accepts --pipeline-processing batch without explicit --project-type', async () => {
    await expect(parseInitArgs(['--pipeline-processing', 'batch'])).resolves.toMatchObject({
      'pipeline-processing': 'batch',
    })
  })

  it('handler auto-detects data-pipeline from --pipeline-processing flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'pipeline-processing': 'batch',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: 'data-pipeline' }),
    )
  })

  // -------------------------------------------------------------------------
  // ML auto-detection
  // -------------------------------------------------------------------------

  it('accepts --ml-phase training without explicit --project-type', async () => {
    await expect(parseInitArgs(['--ml-phase', 'training'])).resolves.toMatchObject({
      'ml-phase': 'training',
    })
  })

  it('handler auto-detects ml from --ml-phase flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'ml-phase': 'training',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: 'ml' }),
    )
  })

  // -------------------------------------------------------------------------
  // Browser-extension auto-detection
  // -------------------------------------------------------------------------

  it('accepts --ext-manifest 3 without explicit --project-type', async () => {
    await expect(parseInitArgs(['--ext-manifest', '3'])).resolves.toMatchObject({
      'ext-manifest': '3',
    })
  })

  it('handler auto-detects browser-extension from --ext-manifest flag', async () => {
    const argv = defaultArgv({
      root: os.tmpdir(),
      'ext-manifest': '3',
    } as Partial<InitArgv>)
    await initCommand.handler(argv)
    expect(runWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: 'browser-extension' }),
    )
  })

  // -------------------------------------------------------------------------
  // Mixed-family rejection: data-pipeline / ml / browser-extension
  // -------------------------------------------------------------------------

  it('rejects mixing --pipeline-processing with --ml-phase', async () => {
    await expect(
      parseInitArgs(['--pipeline-processing', 'batch', '--ml-phase', 'training']),
    ).rejects.toThrow(/mix/)
  })

  it('rejects mixing --ext-manifest with --web-rendering', async () => {
    await expect(
      parseInitArgs(['--ext-manifest', '3', '--web-rendering', 'ssr']),
    ).rejects.toThrow(/mix/)
  })

  // -------------------------------------------------------------------------
  // Project type conflict: data-pipeline / ml / browser-extension
  // -------------------------------------------------------------------------

  it('rejects --project-type backend with --pipeline-processing batch', async () => {
    await expect(
      parseInitArgs(['--project-type', 'backend', '--pipeline-processing', 'batch']),
    ).rejects.toThrow(/pipeline-\* flags require/)
  })

  it('rejects --project-type backend with --ml-phase training', async () => {
    await expect(
      parseInitArgs(['--project-type', 'backend', '--ml-phase', 'training']),
    ).rejects.toThrow(/ml-\* flags require/)
  })

  it('rejects --project-type backend with --ext-manifest 3', async () => {
    await expect(
      parseInitArgs(['--project-type', 'backend', '--ext-manifest', '3']),
    ).rejects.toThrow(/ext-\* flags require/)
  })

  // -------------------------------------------------------------------------
  // CSV validation: --ext-ui-surfaces
  // -------------------------------------------------------------------------

  it('rejects invalid --ext-ui-surfaces value', async () => {
    await expect(
      parseInitArgs(['--ext-ui-surfaces', 'invalid-surface']),
    ).rejects.toThrow(/Invalid --ext-ui-surfaces/)
  })

  it('accepts valid --ext-ui-surfaces CSV values', async () => {
    await expect(
      parseInitArgs(['--ext-ui-surfaces', 'popup,options']),
    ).resolves.toMatchObject({
      'ext-ui-surfaces': ['popup', 'options'],
    })
  })

  // -------------------------------------------------------------------------
  // Acceptance: valid flag combos pass
  // -------------------------------------------------------------------------

  it('accepts --pipeline-processing with other data-pipeline flags', async () => {
    await expect(
      parseInitArgs([
        '--pipeline-processing', 'streaming',
        '--pipeline-orchestration', 'event-driven',
        '--pipeline-quality', 'observability',
        '--pipeline-schema', 'schema-registry',
      ]),
    ).resolves.toMatchObject({
      'pipeline-processing': 'streaming',
      'pipeline-orchestration': 'event-driven',
      'pipeline-quality': 'observability',
      'pipeline-schema': 'schema-registry',
    })
  })

  it('accepts --ml-phase with other ml flags', async () => {
    await expect(
      parseInitArgs([
        '--ml-phase', 'both',
        '--ml-model-type', 'llm',
        '--ml-serving', 'realtime',
      ]),
    ).resolves.toMatchObject({
      'ml-phase': 'both',
      'ml-model-type': 'llm',
      'ml-serving': 'realtime',
    })
  })

  it('accepts --ext-manifest with other browser-extension flags', async () => {
    await expect(
      parseInitArgs([
        '--ext-manifest', '3',
        '--ext-ui-surfaces', 'popup,sidepanel',
        '--ext-content-script',
        '--ext-background-worker',
      ]),
    ).resolves.toMatchObject({
      'ext-manifest': '3',
      'ext-ui-surfaces': ['popup', 'sidepanel'],
      'ext-content-script': true,
      'ext-background-worker': true,
    })
  })
})
