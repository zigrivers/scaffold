/**
 * E2E tests for scaffold init — exercises runWizard against the real file system.
 *
 * These tests use real temp directories and do NOT mock the modules under test.
 * External collaborators that are mocked:
 *   - detectProjectMode (project detector — avoids scanning caller's real FS)
 *   - discoverMetaPrompts (meta-prompt loader — keeps tests hermetic, no real pipeline needed)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before real imports
// ---------------------------------------------------------------------------

vi.mock('../../src/project/detector.js', () => ({
  detectProjectMode: vi.fn(() => ({
    mode: 'greenfield',
    signals: [],
    methodologySuggestion: 'deep',
    sourceFileCount: 0,
  })),
}))

vi.mock('../../src/core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
  discoverAllMetaPrompts: vi.fn(() => new Map()),
}))

// ---------------------------------------------------------------------------
// Real imports (after mock declarations)
// ---------------------------------------------------------------------------

import { detectProjectMode } from '../project/detector.js'
import { runWizard } from '../wizard/wizard.js'
import { StateManager } from '../state/state-manager.js'
import { loadConfig } from '../config/loader.js'
import { runBuild } from '../cli/commands/build.js'
import { discoverAllMetaPrompts } from '../core/assembly/meta-prompt-loader.js'
import initCommand from '../cli/commands/init.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-e2e-init-'))
}

function createMockOutput() {
  return {
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
}

function makeMetaPromptFixture() {
  return new Map([
    ['create-prd', {
      stepName: 'create-prd',
      filePath: '/fake/pipeline/create-prd.md',
      frontmatter: {
        name: 'create-prd',
        description: 'Create a PRD',
        summary: null,
        phase: 'planning',
        order: 1,
        dependencies: [],
        outputs: ['docs/prd.md'],
        conditional: null,
        knowledgeBase: [],
        reads: [],
        stateless: false,
        category: 'pipeline',
      },
      body: '## Purpose\nCreate a PRD.',
      sections: { Purpose: 'Create a PRD.' },
    }],
  ])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scaffold init E2E', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
    vi.mocked(detectProjectMode).mockReturnValue({
      mode: 'greenfield',
      signals: [],
      methodologySuggestion: 'deep',
      sourceFileCount: 0,
    })
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Creates .scaffold/ directory structure
  it('creates .scaffold/ directory structure', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      methodology: 'mvp',
      force: false,
      auto: true,
      output,
    })

    expect(fs.existsSync(path.join(tmpDir, '.scaffold'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.scaffold', 'config.yml'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.scaffold', 'state.json'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.scaffold', 'decisions.jsonl'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.scaffold', 'instructions'))).toBe(true)
  })

  // Test 2: config.yml contains correct methodology when methodology is 'mvp'
  it('config.yml contains correct methodology for mvp', async () => {
    const output = createMockOutput()
    await runWizard({ projectRoot: tmpDir, methodology: 'mvp', force: false, auto: true, output })
    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.methodology).toBe('mvp')
  })

  // Test 3: config.yml contains correct methodology when methodology is 'deep'
  it('config.yml contains correct methodology for deep', async () => {
    const output = createMockOutput()
    await runWizard({ projectRoot: tmpDir, methodology: 'deep', force: false, auto: true, output })
    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.methodology).toBe('deep')
  })

  // Test 4: state.json has correct structure
  it('state.json has correct structure', async () => {
    const output = createMockOutput()
    await runWizard({ projectRoot: tmpDir, methodology: 'deep', force: false, auto: true, output })
    const stateManager = new StateManager(tmpDir, () => [])
    const state = stateManager.loadState()
    expect(state['schema-version']).toBe(1)
    expect(state.config_methodology).toBe('deep')
    expect(typeof state.steps).toBe('object')
    expect(state.in_progress).toBeNull()
    expect(Array.isArray(state.next_eligible)).toBe(true)
  })

  // Test 5: Returns INIT_SCAFFOLD_EXISTS without --force if .scaffold/ exists
  it('errors without --force if .scaffold/ exists', async () => {
    const output = createMockOutput()
    // First init
    await runWizard({ projectRoot: tmpDir, methodology: 'mvp', force: false, auto: true, output })
    // Second init without --force should fail
    const result = await runWizard({ projectRoot: tmpDir, methodology: 'mvp', force: false, auto: true, output })
    expect(result.success).toBe(false)
    expect(result.errors[0]?.code).toBe('INIT_SCAFFOLD_EXISTS')
  })

  // Test 6: --force backs up existing .scaffold/ directory
  it('--force backs up existing .scaffold/', async () => {
    const output = createMockOutput()
    // First init with mvp
    await runWizard({ projectRoot: tmpDir, methodology: 'mvp', force: false, auto: true, output })
    // Second init with --force and deep
    await runWizard({ projectRoot: tmpDir, methodology: 'deep', force: true, auto: true, output })
    // Backup directory must exist
    const backupExists =
      fs.existsSync(path.join(tmpDir, '.scaffold.backup')) ||
      fs.readdirSync(tmpDir).some(f => f.startsWith('.scaffold.backup'))
    expect(backupExists).toBe(true)
    // New config should have 'deep'
    const { config } = loadConfig(tmpDir, [])
    expect(config!.methodology).toBe('deep')
  })

  // Test 7: Returns success: true with correct fields on first init
  it('returns success: true with correct fields on first init', async () => {
    const output = createMockOutput()
    const result = await runWizard({ projectRoot: tmpDir, methodology: 'mvp', force: false, auto: true, output })
    expect(result.success).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.projectRoot).toBe(tmpDir)
    expect(result.configPath).toBe(path.join(tmpDir, '.scaffold', 'config.yml'))
    expect(result.methodology).toBe('mvp')
  })

  // Test 8: decisions.jsonl is created empty
  it('decisions.jsonl is created as empty file', async () => {
    const output = createMockOutput()
    await runWizard({ projectRoot: tmpDir, methodology: 'mvp', force: false, auto: true, output })
    const decisionsPath = path.join(tmpDir, '.scaffold', 'decisions.jsonl')
    expect(fs.existsSync(decisionsPath)).toBe(true)
    expect(fs.readFileSync(decisionsPath, 'utf8')).toBe('')
  })

  // Test 9: instructions/ is a real directory (not a file)
  it('instructions/ is a directory', async () => {
    const output = createMockOutput()
    await runWizard({ projectRoot: tmpDir, methodology: 'mvp', force: false, auto: true, output })
    const instrPath = path.join(tmpDir, '.scaffold', 'instructions')
    expect(fs.statSync(instrPath).isDirectory()).toBe(true)
  })

  // Test 10: Brownfield mode sets init-mode correctly
  it('brownfield detection sets init-mode to brownfield', async () => {
    vi.mocked(detectProjectMode).mockReturnValue({
      mode: 'brownfield',
      signals: [],
      methodologySuggestion: 'deep',
      sourceFileCount: 0,
    })
    const output = createMockOutput()
    await runWizard({ projectRoot: tmpDir, methodology: 'deep', force: false, auto: true, output })
    const stateManager = new StateManager(tmpDir, () => [])
    const state = stateManager.loadState()
    expect(state['init-mode']).toBe('brownfield')
  })

  // Test 11: init command auto-runs build into hidden .scaffold/generated output
  it('init command creates hidden generated output and .gitignore without root commands', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await initCommand.handler({
      _: [],
      $0: 'scaffold',
      root: tmpDir,
      auto: true,
      force: false,
      methodology: 'mvp',
      idea: undefined,
      format: undefined,
      verbose: false,
    })

    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(fs.existsSync(path.join(tmpDir, '.scaffold', 'generated', 'universal', 'prompts', 'README.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true)
    expect(fs.readFileSync(path.join(tmpDir, '.gitignore'), 'utf8')).toContain('.scaffold/generated/')
    expect(fs.existsSync(path.join(tmpDir, 'commands'))).toBe(false)
  })

  // Test 12: init command still writes hidden generated output from the default build path
  it('init command creates hidden generated output in the temp project', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await initCommand.handler({
      _: [],
      $0: 'scaffold',
      root: tmpDir,
      auto: true,
      force: false,
      methodology: 'mvp',
      idea: undefined,
      format: undefined,
      verbose: false,
    })

    expect(exitSpy).toHaveBeenCalledWith(0)
    expect(fs.existsSync(path.join(tmpDir, '.scaffold', 'generated', 'universal', 'prompts', 'README.md'))).toBe(true)
  })

  // Test 13: real wizard + build path produces Gemini output with a tiny step fixture
  it('runWizard and runBuild produce Gemini output for a configured project', async () => {
    vi.mocked(discoverAllMetaPrompts).mockReturnValue(
      makeMetaPromptFixture() as ReturnType<typeof discoverAllMetaPrompts>,
    )

    const output = createMockOutput()
    output.prompt.mockResolvedValueOnce('mvp')
    output.confirm
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)

    const wizardResult = await runWizard({
      projectRoot: tmpDir,
      force: false,
      auto: false,
      output,
    })
    expect(wizardResult.success).toBe(true)

    const buildResult = await runBuild({
      'validate-only': false,
      force: false,
      format: undefined,
      auto: false,
      verbose: false,
      root: tmpDir,
    }, { output })

    expect(buildResult.exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-runner', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.agents', 'skills', 'scaffold-pipeline', 'SKILL.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, 'GEMINI.md'))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, '.gemini', 'commands', 'scaffold', 'create-prd.toml'))).toBe(true)
    expect(fs.readFileSync(path.join(tmpDir, '.gemini', 'commands', 'scaffold', 'create-prd.toml'), 'utf8'))
      .toContain('User request: scaffold create-prd')
  })
})
