import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

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
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    stopProgress: vi.fn(),
  })),
}))

// Mock the build command to avoid circular deps / actual build execution
vi.mock('./build.js', () => ({
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

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-init-test-'))
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    mockResolveOutputMode.mockReturnValue('auto')
    mockRunWizard.mockResolvedValue(makeSuccessResult(tmpDir))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Runs wizard successfully in temp directory
  it('runs wizard and exits 0 on success', async () => {
    await initCommand.handler(defaultArgv({ root: tmpDir }))
    expect(mockRunWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: tmpDir }),
    )
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  // Test 2: JSON mode outputs InitResult shape
  it('JSON mode outputs result with success shape', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const mockOutput = {
      success: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      result: vi.fn(),
      prompt: vi.fn().mockResolvedValue(''),
      confirm: vi.fn().mockResolvedValue(false),
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
  })

  // Test 5: --methodology flag is passed through to wizard
  it('passes methodology flag to wizard', async () => {
    await initCommand.handler(defaultArgv({ root: tmpDir, methodology: 'mvp' }))
    expect(mockRunWizard).toHaveBeenCalledWith(
      expect.objectContaining({ methodology: 'mvp' }),
    )
  })

  // Test 6: Creates .scaffold/ in correct location (uses process.cwd() when root not given)
  it('uses process.cwd() as projectRoot when root not provided', async () => {
    const cwd = process.cwd()
    mockRunWizard.mockResolvedValue(makeSuccessResult(cwd))
    await initCommand.handler(defaultArgv({ root: undefined }))
    expect(mockRunWizard).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: cwd }),
    )
  })
})
