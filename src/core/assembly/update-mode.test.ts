import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { detectUpdateMode } from './update-mode.js'
import type { PipelineState } from '../../types/index.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Helper to make a minimal PipelineState */
function makeState(
  steps: PipelineState['steps'] = {},
): PipelineState {
  return {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps,
    next_eligible: [],
    'extra-steps': [],
  }
}

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-mode-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('detectUpdateMode', () => {
  it('returns isUpdateMode: false for a pending step', () => {
    const state = makeState({
      'create-prd': {
        status: 'pending',
        source: 'pipeline',
        produces: ['docs/prd.md'],
      },
    })

    const result = detectUpdateMode({
      step: 'create-prd',
      state,
      currentDepth: 3,
      projectRoot: tmpDir,
    })

    expect(result.isUpdateMode).toBe(false)
    expect(result.currentDepth).toBe(3)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns isUpdateMode: false for a completed step with no produces', () => {
    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 3,
      },
    })

    const result = detectUpdateMode({
      step: 'create-prd',
      state,
      currentDepth: 3,
      projectRoot: tmpDir,
    })

    expect(result.isUpdateMode).toBe(false)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns isUpdateMode: false for a completed step where artifacts do not exist on disk', () => {
    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 3,
        produces: ['docs/prd.md'],
      },
    })

    // File does NOT exist on disk
    const result = detectUpdateMode({
      step: 'create-prd',
      state,
      currentDepth: 3,
      projectRoot: tmpDir,
    })

    expect(result.isUpdateMode).toBe(false)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns isUpdateMode: true for a completed step with an existing artifact on disk', () => {
    const outputPath = 'docs/prd.md'
    const fullPath = path.join(tmpDir, outputPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, '# PRD Content', 'utf8')

    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 3,
        produces: [outputPath],
      },
    })

    const result = detectUpdateMode({
      step: 'create-prd',
      state,
      currentDepth: 3,
      projectRoot: tmpDir,
    })

    expect(result.isUpdateMode).toBe(true)
  })

  it('existingArtifact has correct content, filePath, previousDepth, completionTimestamp', () => {
    const outputPath = 'docs/prd.md'
    const fullPath = path.join(tmpDir, outputPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, '# PRD Content', 'utf8')

    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-06-15T10:30:00.000Z',
        depth: 3,
        produces: [outputPath],
      },
    })

    const result = detectUpdateMode({
      step: 'create-prd',
      state,
      currentDepth: 3,
      projectRoot: tmpDir,
    })

    expect(result.existingArtifact).toBeDefined()
    expect(result.existingArtifact!.content).toBe('# PRD Content')
    expect(result.existingArtifact!.filePath).toBe(outputPath)
    expect(result.existingArtifact!.previousDepth).toBe(3)
    expect(result.existingArtifact!.completionTimestamp).toBe('2024-06-15T10:30:00.000Z')
  })

  it('emits ASM_DEPTH_CHANGED warning when depth changed', () => {
    const outputPath = 'docs/prd.md'
    const fullPath = path.join(tmpDir, outputPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, '# PRD Content', 'utf8')

    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 3,
        produces: [outputPath],
      },
    })

    const result = detectUpdateMode({
      step: 'create-prd',
      state,
      currentDepth: 5,
      projectRoot: tmpDir,
    })

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe('ASM_DEPTH_CHANGED')
    expect(result.warnings[0].message).toContain('create-prd')
    expect(result.warnings[0].message).toContain('3')
    expect(result.warnings[0].message).toContain('5')
  })

  it('emits ASM_DEPTH_CHANGED and ASM_DEPTH_DOWNGRADE when current depth < previous depth', () => {
    const outputPath = 'docs/prd.md'
    const fullPath = path.join(tmpDir, outputPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, '# PRD Content', 'utf8')

    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 5,
        produces: [outputPath],
      },
    })

    const result = detectUpdateMode({
      step: 'create-prd',
      state,
      currentDepth: 2,
      projectRoot: tmpDir,
    })

    const codes = result.warnings.map(w => w.code)
    expect(codes).toContain('ASM_DEPTH_CHANGED')
    expect(codes).toContain('ASM_DEPTH_DOWNGRADE')

    const downgrade = result.warnings.find(w => w.code === 'ASM_DEPTH_DOWNGRADE')!
    expect(downgrade.message).toContain('create-prd')
    expect(downgrade.message).toContain('2')
    expect(downgrade.message).toContain('5')
  })

  it('does NOT emit ASM_DEPTH_CHANGED when depth is unchanged', () => {
    const outputPath = 'docs/prd.md'
    const fullPath = path.join(tmpDir, outputPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, '# PRD Content', 'utf8')

    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 3,
        produces: [outputPath],
      },
    })

    const result = detectUpdateMode({
      step: 'create-prd',
      state,
      currentDepth: 3,
      projectRoot: tmpDir,
    })

    expect(result.warnings).toHaveLength(0)
  })

  it('skips directory artifacts and uses next file artifact for update mode', () => {
    // Create a directory artifact and a file artifact
    const dirPath = 'docs/domain-models/'
    const filePath = 'docs/domain-models/index.md'
    const fullDirPath = path.join(tmpDir, dirPath)
    const fullFilePath = path.join(tmpDir, filePath)
    fs.mkdirSync(fullDirPath, { recursive: true })
    fs.writeFileSync(fullFilePath, '# Domain Models', 'utf8')

    const state = makeState({
      'domain-modeling': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 3,
        produces: [dirPath, filePath],
      },
    })

    const result = detectUpdateMode({
      step: 'domain-modeling',
      state,
      currentDepth: 3,
      projectRoot: tmpDir,
    })

    expect(result.isUpdateMode).toBe(true)
    expect(result.existingArtifact!.filePath).toBe(filePath)
    expect(result.existingArtifact!.content).toBe('# Domain Models')
  })

  it('returns isUpdateMode: false when only directory artifacts exist', () => {
    const dirPath = 'docs/domain-models/'
    fs.mkdirSync(path.join(tmpDir, dirPath), { recursive: true })

    const state = makeState({
      'domain-modeling': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 3,
        produces: [dirPath],
      },
    })

    const result = detectUpdateMode({
      step: 'domain-modeling',
      state,
      currentDepth: 3,
      projectRoot: tmpDir,
    })

    expect(result.isUpdateMode).toBe(false)
  })

  it('depthIncreased is true when currentDepth > previousDepth', () => {
    const outputPath = 'docs/prd.md'
    const fullPath = path.join(tmpDir, outputPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, '# PRD Content', 'utf8')

    const state = makeState({
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-01T00:00:00.000Z',
        depth: 2,
        produces: [outputPath],
      },
    })

    const result = detectUpdateMode({
      step: 'create-prd',
      state,
      currentDepth: 4,
      projectRoot: tmpDir,
    })

    expect(result.isUpdateMode).toBe(true)
    expect(result.depthIncreased).toBe(true)
    expect(result.previousDepth).toBe(2)
    expect(result.currentDepth).toBe(4)
  })
})
