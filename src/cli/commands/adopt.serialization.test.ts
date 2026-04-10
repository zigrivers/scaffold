import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Hoisted mocks — must be before imports that use the mocked modules
// ---------------------------------------------------------------------------

vi.mock('../middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
}))

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'json'),
}))

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    config: { methodology: { preset: 'deep' } },
    errors: [],
    warnings: [],
  })),
}))

vi.mock('../../state/state-manager.js', () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    loadState: vi.fn(() => ({
      'schema-version': 1,
      'scaffold-version': '2.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2024-01-01T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
    })),
    saveState: vi.fn(),
    initializeState: vi.fn(),
  })),
}))

vi.mock('../../state/lock-manager.js', () => ({
  acquireLock: vi.fn(() => ({ acquired: true })),
  releaseLock: vi.fn(),
}))

vi.mock('../../project/adopt.js', () => ({
  runAdoption: vi.fn().mockResolvedValue({
    mode: 'brownfield',
    artifactsFound: 3,
    detectedArtifacts: [
      { artifactPath: 'docs/plan.md', matchedStep: 'create-prd', strategy: 'full-run' },
    ],
    stepsCompleted: ['create-prd'],
    stepsRemaining: ['tech-stack'],
    methodology: 'deep',
    errors: [],
    warnings: [],
    projectType: 'web-app',
    detectedConfig: {
      type: 'web-app',
      config: { renderingStrategy: 'ssr', deployTarget: 'serverless' },
    },
    detectionConfidence: 'high',
    detectionEvidence: [
      { signal: 'next-config', file: 'next.config.mjs' },
      { signal: 'react-dep' },
    ],
  }),
  TYPE_KEY: {
    'web-app': 'webAppConfig',
    backend: 'backendConfig',
    cli: 'cliConfig',
    library: 'libraryConfig',
    'mobile-app': 'mobileAppConfig',
    'data-pipeline': 'dataPipelineConfig',
    ml: 'mlConfig',
    'browser-extension': 'browserExtensionConfig',
    game: 'gameConfig',
  },
}))

vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))

vi.mock('../../utils/fs.js', () => ({
  getPackagePipelineDir: vi.fn(() => '/fake/pipeline'),
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { runAdoption } from '../../project/adopt.js'
import type { AdoptionResult } from '../../project/adopt.js'

// Dynamic import of the command module
const { default: adoptCommand } = await import('./adopt.js')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AdoptArgv = Parameters<typeof adoptCommand.handler>[0]

function defaultArgv(overrides: Partial<AdoptArgv> = {}): AdoptArgv {
  return {
    format: 'json',
    auto: undefined,
    verbose: undefined,
    root: undefined,
    force: undefined,
    'dry-run': false,
    'project-type': undefined,
    ...overrides,
    $0: 'scaffold',
    _: ['adopt'],
  } as AdoptArgv
}

describe('adopt CLI JSON serialization', () => {
  let writtenChunks: string[]
  let tmpDir: string

  beforeEach(() => {
    process.exitCode = undefined  // reset global state between tests
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-serial-'))
    fs.mkdirSync(path.join(tmpDir, '.scaffold'), { recursive: true })
    writtenChunks = []
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenChunks.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.mocked(findProjectRoot).mockReturnValue(tmpDir)

    // Re-set the default runAdoption mock (restoreAllMocks clears it between tests)
    vi.mocked(runAdoption).mockResolvedValue({
      mode: 'brownfield',
      artifactsFound: 3,
      detectedArtifacts: [
        { artifactPath: 'docs/plan.md', matchedStep: 'create-prd', strategy: 'full-run' },
      ],
      stepsCompleted: ['create-prd'],
      stepsRemaining: ['tech-stack'],
      methodology: 'deep',
      errors: [],
      warnings: [],
      projectType: 'web-app',
      detectedConfig: {
        type: 'web-app',
        config: { renderingStrategy: 'ssr', deployTarget: 'serverless' },
      },
      detectionConfidence: 'high',
      detectionEvidence: [
        { signal: 'next-config', file: 'next.config.mjs' },
        { signal: 'react-dep' },
      ],
    } as unknown as AdoptionResult)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function parseJsonOutput(): Record<string, unknown> {
    const raw = writtenChunks.join('')
    // JsonOutput.result() wraps data in { success: true, data: {...}, errors: [], warnings: [...], exit_code: 0 }
    const envelope = JSON.parse(raw) as { success: boolean; data: Record<string, unknown> }
    if (!envelope.data) throw new Error(`No 'data' in JSON envelope:\n${raw}`)
    return envelope.data
  }

  it('emits snake_case keys in JSON output', async () => {
    await adoptCommand.handler(defaultArgv())
    const json = parseJsonOutput()

    expect(json.schema_version).toBe(2)
    expect(json).toHaveProperty('artifacts_found')
    expect(json).toHaveProperty('detected_artifacts')
    expect(json).toHaveProperty('steps_completed')
    expect(json).toHaveProperty('steps_remaining')
    expect(json).toHaveProperty('dry_run')
    // Verify snake_case, NOT camelCase
    expect(json).not.toHaveProperty('artifactsFound')
    expect(json).not.toHaveProperty('stepsCompleted')
  })

  it('includes detected_config with correct structure', async () => {
    await adoptCommand.handler(defaultArgv())
    const json = parseJsonOutput()

    expect(json.project_type).toBe('web-app')
    expect(json.detected_config).toEqual({
      type: 'web-app',
      config: { renderingStrategy: 'ssr', deployTarget: 'serverless' },
    })
    expect(json.detection_confidence).toBe('high')
  })

  it('detection_evidence is array of structured objects', async () => {
    await adoptCommand.handler(defaultArgv())
    const json = parseJsonOutput()

    const evidence = json.detection_evidence as Array<Record<string, unknown>>
    expect(Array.isArray(evidence)).toBe(true)
    expect(evidence[0]).toHaveProperty('signal', 'next-config')
    expect(evidence[0]).toHaveProperty('file', 'next.config.mjs')
    expect(evidence[1]).toHaveProperty('signal', 'react-dep')
  })

  it('game detection emits both game_config and detected_config', async () => {
    vi.mocked(runAdoption).mockResolvedValueOnce({
      mode: 'brownfield',
      artifactsFound: 0,
      detectedArtifacts: [],
      stepsCompleted: [],
      stepsRemaining: [],
      methodology: 'deep',
      errors: [],
      warnings: [],
      projectType: 'game',
      gameConfig: { engine: 'unity' },
      detectedConfig: { type: 'game', config: { engine: 'unity' } },
      detectionConfidence: 'high',
      detectionEvidence: [{ signal: 'unity-assets-meta', file: 'Assets/' }],
    } as unknown as AdoptionResult)

    await adoptCommand.handler(defaultArgv())
    const json = parseJsonOutput()

    expect(json.game_config).toEqual({ engine: 'unity' })
    expect(json.detected_config).toEqual({ type: 'game', config: { engine: 'unity' } })
  })

  it('omits optional fields when not present', async () => {
    vi.mocked(runAdoption).mockResolvedValueOnce({
      mode: 'brownfield',
      artifactsFound: 0,
      detectedArtifacts: [],
      stepsCompleted: [],
      stepsRemaining: [],
      methodology: 'deep',
      errors: [],
      warnings: [],
    } as unknown as AdoptionResult)

    await adoptCommand.handler(defaultArgv())
    const json = parseJsonOutput()

    expect(json).not.toHaveProperty('project_type')
    expect(json).not.toHaveProperty('detected_config')
    expect(json).not.toHaveProperty('game_config')
    expect(json).not.toHaveProperty('detection_confidence')
  })
})
