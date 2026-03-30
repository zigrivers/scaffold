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
}))

// ---------------------------------------------------------------------------
// Real imports (after mock declarations)
// ---------------------------------------------------------------------------

import { detectProjectMode } from '../project/detector.js'
import { runWizard } from '../wizard/wizard.js'
import { StateManager } from '../state/state-manager.js'
import { loadConfig } from '../config/loader.js'

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
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    stopProgress: vi.fn(),
  }
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
})
