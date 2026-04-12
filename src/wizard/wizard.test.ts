import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yaml from 'js-yaml'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../project/detector.js', () => ({
  detectProjectMode: vi.fn(() => ({
    mode: 'greenfield',
    signals: [],
    methodologySuggestion: 'deep',
    sourceFileCount: 0,
  })),
}))

vi.mock('../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { detectProjectMode } from '../project/detector.js'
import { runWizard } from './wizard.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-wizard-test-'))
}

function makeOutputContext() {
  return {
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
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runWizard', () => {
  const mockDetectProjectMode = vi.mocked(detectProjectMode)
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
    mockDetectProjectMode.mockReturnValue({
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

  // Test 1: Creates .scaffold/ directory
  it('creates .scaffold/ directory', async () => {
    const output = makeOutputContext()
    await runWizard({ projectRoot: tmpDir, auto: true, force: false, output })
    expect(fs.existsSync(path.join(tmpDir, '.scaffold'))).toBe(true)
  })

  // Test 2: Writes valid config.yml with YAML content
  it('writes valid config.yml with YAML content', async () => {
    const output = makeOutputContext()
    await runWizard({ projectRoot: tmpDir, auto: true, force: false, output })
    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    expect(fs.existsSync(configPath)).toBe(true)
    const content = fs.readFileSync(configPath, 'utf8')
    const parsed = yaml.load(content) as Record<string, unknown>
    expect(parsed).toMatchObject({ version: 2, methodology: expect.any(String) })
    expect(Array.isArray(parsed['platforms'])).toBe(true)
    expect((parsed['platforms'] as string[]).length).toBeGreaterThan(0)
  })

  // Test 3: Creates state.json
  it('creates state.json', async () => {
    const output = makeOutputContext()
    await runWizard({ projectRoot: tmpDir, auto: true, force: false, output })
    const statePath = path.join(tmpDir, '.scaffold', 'state.json')
    expect(fs.existsSync(statePath)).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>
    expect(parsed['schema-version']).toBe(1)
  })

  // Test 4: Creates empty decisions.jsonl
  it('creates empty decisions.jsonl', async () => {
    const output = makeOutputContext()
    await runWizard({ projectRoot: tmpDir, auto: true, force: false, output })
    const decisionsPath = path.join(tmpDir, '.scaffold', 'decisions.jsonl')
    expect(fs.existsSync(decisionsPath)).toBe(true)
    expect(fs.readFileSync(decisionsPath, 'utf8')).toBe('')
  })

  // Test 5: Creates .scaffold/instructions/ directory
  it('creates .scaffold/instructions/ directory', async () => {
    const output = makeOutputContext()
    await runWizard({ projectRoot: tmpDir, auto: true, force: false, output })
    expect(fs.existsSync(path.join(tmpDir, '.scaffold', 'instructions'))).toBe(true)
    expect(fs.statSync(path.join(tmpDir, '.scaffold', 'instructions')).isDirectory()).toBe(true)
  })

  // Test 6: Returns INIT_SCAFFOLD_EXISTS error when .scaffold/ exists without --force
  it('returns INIT_SCAFFOLD_EXISTS error when .scaffold/ exists and force=false', async () => {
    fs.mkdirSync(path.join(tmpDir, '.scaffold'))
    const output = makeOutputContext()
    const result = await runWizard({ projectRoot: tmpDir, auto: true, force: false, output })
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]!.code).toBe('INIT_SCAFFOLD_EXISTS')
  })

  // Test 7: With --force, backs up existing .scaffold/ and reinitializes
  it('backs up existing .scaffold/ when force=true and reinitializes', async () => {
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir)
    fs.writeFileSync(path.join(scaffoldDir, 'marker.txt'), 'original')
    const output = makeOutputContext()
    const result = await runWizard({ projectRoot: tmpDir, auto: true, force: true, output })
    expect(result.success).toBe(true)
    // Original .scaffold/ backed up — a .scaffold.backup dir should exist
    const backupExists = fs.existsSync(path.join(tmpDir, '.scaffold.backup'))
    expect(backupExists).toBe(true)
    // New .scaffold/ should exist and have config.yml, not marker.txt
    expect(fs.existsSync(path.join(scaffoldDir, 'config.yml'))).toBe(true)
    expect(fs.existsSync(path.join(scaffoldDir, 'marker.txt'))).toBe(false)
  })

  // Test 8: --auto mode uses suggestion as methodology without prompting
  it('uses suggestion methodology in auto mode without calling prompt', async () => {
    const output = makeOutputContext()
    await runWizard({ projectRoot: tmpDir, auto: true, force: false, output })
    expect(output.prompt).not.toHaveBeenCalled()
    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    // Default suggestion from greenfield is 'deep'
    expect(parsed['methodology']).toBe('deep')
  })

  // Test 9: --methodology 'mvp' skips methodology question and uses it
  it('uses pre-set --methodology flag without prompting', async () => {
    const output = makeOutputContext()
    const result = await runWizard({
      projectRoot: tmpDir,
      auto: true,
      force: false,
      methodology: 'mvp',
      output,
    })
    expect(result.success).toBe(true)
    expect(result.methodology).toBe('mvp')
    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    expect(parsed['methodology']).toBe('mvp')
    expect(output.prompt).not.toHaveBeenCalled()
  })

  // Test 10: Interactive mode preserves Gemini in config.yml when selected
  it('writes Gemini to config.yml when Codex is declined and Gemini is accepted in interactive mode', async () => {
    const output = makeOutputContext()
    vi.mocked(output.prompt).mockResolvedValueOnce('deep')
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(true)    // Gemini
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
    vi.mocked(output.select).mockResolvedValueOnce('web-app')  // projectType

    const result = await runWizard({
      projectRoot: tmpDir,
      auto: false,
      force: false,
      output,
    })

    expect(result.success).toBe(true)
    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    expect(parsed['platforms']).toEqual(['claude-code', 'gemini'])
  })

  // Test 11: Result has success: true on successful init
  it('returns success: true on successful init', async () => {
    const output = makeOutputContext()
    const result = await runWizard({ projectRoot: tmpDir, auto: true, force: false, output })
    expect(result.success).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.projectRoot).toBe(tmpDir)
    expect(result.configPath).toBe(path.join(tmpDir, '.scaffold', 'config.yml'))
  })

  // Test 12: Game config written to config.yml when projectType is 'game'
  it('writes gameConfig to config.yml when projectType is game', async () => {
    const output = makeOutputContext()
    vi.mocked(output.prompt).mockResolvedValueOnce('deep')
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // Gemini
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
      .mockResolvedValueOnce(false)   // advanced options
    vi.mocked(output.select)
      .mockResolvedValueOnce('game')     // projectType
      .mockResolvedValueOnce('godot')    // engine
      .mockResolvedValueOnce('none')     // multiplayer
      .mockResolvedValueOnce('discrete') // contentStructure
      .mockResolvedValueOnce('none')     // economy
    vi.mocked(output.multiSelect)
      .mockResolvedValueOnce(['pc'])     // targetPlatforms

    const result = await runWizard({
      projectRoot: tmpDir,
      auto: false,
      force: false,
      output,
    })

    expect(result.success).toBe(true)
    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = parsed['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('game')
    expect(project['gameConfig']).toBeDefined()
    const gc = project['gameConfig'] as Record<string, unknown>
    expect(gc['engine']).toBe('godot')
    expect(gc['multiplayerMode']).toBe('none')
    expect(gc['targetPlatforms']).toEqual(['pc'])
  })

  // Test 13: No gameConfig in config.yml when projectType is not 'game'
  it('does not write gameConfig to config.yml when projectType is not game', async () => {
    const output = makeOutputContext()
    vi.mocked(output.prompt).mockResolvedValueOnce('deep')
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // Gemini
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
    vi.mocked(output.select)
      .mockResolvedValueOnce('backend')  // projectType

    const result = await runWizard({
      projectRoot: tmpDir,
      auto: false,
      force: false,
      output,
    })

    expect(result.success).toBe(true)
    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = parsed['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('backend')
    expect(project['gameConfig']).toBeUndefined()
  })

  // Test 14: Auto mode does not write projectType or gameConfig
  it('does not write projectType or gameConfig in auto mode', async () => {
    const output = makeOutputContext()
    const result = await runWizard({ projectRoot: tmpDir, auto: true, force: false, output })
    expect(result.success).toBe(true)
    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = parsed['project'] as Record<string, unknown>
    expect(project['projectType']).toBeUndefined()
    expect(project['gameConfig']).toBeUndefined()
  })

  // Test 15: --project-type game --auto writes gameConfig with Zod defaults
  it('writes gameConfig to config.yml with --project-type game --auto', async () => {
    const output = makeOutputContext()
    const result = await runWizard({
      projectRoot: tmpDir,
      auto: true,
      force: false,
      projectType: 'game',
      output,
    })
    expect(result.success).toBe(true)
    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const parsed = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = parsed['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('game')
    expect(project['gameConfig']).toBeDefined()
    const gc = project['gameConfig'] as Record<string, unknown>
    expect(gc['engine']).toBe('custom')
    expect(gc['multiplayerMode']).toBe('none')
    expect(gc['persistence']).toBe('progression')
    // No interactive prompts
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})
