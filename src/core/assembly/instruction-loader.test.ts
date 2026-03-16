import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadInstructions } from './instruction-loader.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let tmpDir: string
let instructionsDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'instruction-loader-test-'))
  instructionsDir = path.join(tmpDir, '.scaffold', 'instructions')
  fs.mkdirSync(instructionsDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('loadInstructions', () => {
  it('loads global.md when present', () => {
    fs.writeFileSync(path.join(instructionsDir, 'global.md'), '# Global instructions', 'utf8')

    const { instructions } = loadInstructions(tmpDir, 'create-prd')

    expect(instructions.global).toBe('# Global instructions')
  })

  it('loads <step>.md when present', () => {
    fs.writeFileSync(path.join(instructionsDir, 'create-prd.md'), '# Step instructions', 'utf8')

    const { instructions } = loadInstructions(tmpDir, 'create-prd')

    expect(instructions.perStep).toBe('# Step instructions')
  })

  it('accepts inline instructions string', () => {
    const { instructions } = loadInstructions(tmpDir, 'create-prd', 'Focus on mobile')

    expect(instructions.inline).toBe('Focus on mobile')
  })

  it('returns null for global when global.md missing (no error)', () => {
    // No global.md created

    const { instructions, warnings } = loadInstructions(tmpDir, 'create-prd')

    expect(instructions.global).toBeNull()
    expect(warnings.filter(w => w.code !== 'ASM_INSTRUCTION_EMPTY')).toHaveLength(0)
  })

  it('returns null for perStep when step file missing (no error)', () => {
    // No create-prd.md created

    const { instructions } = loadInstructions(tmpDir, 'create-prd')

    expect(instructions.perStep).toBeNull()
  })

  it('silently skips missing files (no error for absent global.md)', () => {
    // No files at all

    const { instructions, warnings } = loadInstructions(tmpDir, 'review-prd')

    expect(instructions.global).toBeNull()
    expect(instructions.perStep).toBeNull()
    expect(instructions.inline).toBeNull()
    // No warnings for missing files (only for empty files)
    expect(warnings).toHaveLength(0)
  })

  it('warns on empty instruction file (ASM_INSTRUCTION_EMPTY)', () => {
    fs.writeFileSync(path.join(instructionsDir, 'global.md'), '', 'utf8')

    const { instructions, warnings } = loadInstructions(tmpDir, 'create-prd')

    expect(instructions.global).toBeNull()
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('ASM_INSTRUCTION_EMPTY')
    expect(warnings[0].message).toContain('global')
  })

  it('returns all three layers separately (for display with provenance)', () => {
    fs.writeFileSync(path.join(instructionsDir, 'global.md'), 'Global rule', 'utf8')
    fs.writeFileSync(path.join(instructionsDir, 'create-prd.md'), 'Step rule', 'utf8')

    const { instructions } = loadInstructions(tmpDir, 'create-prd', 'Inline rule')

    expect(instructions.global).toBe('Global rule')
    expect(instructions.perStep).toBe('Step rule')
    expect(instructions.inline).toBe('Inline rule')
    // All three are distinct strings — not merged
    expect(instructions.global).not.toBe(instructions.perStep)
    expect(instructions.perStep).not.toBe(instructions.inline)
  })

  it('returns null for inline when inline is undefined', () => {
    const { instructions } = loadInstructions(tmpDir, 'create-prd', undefined)

    expect(instructions.inline).toBeNull()
  })

  it('returns null for inline when inline is empty string', () => {
    const { instructions } = loadInstructions(tmpDir, 'create-prd', '')

    expect(instructions.inline).toBeNull()
  })

  it('returns null for inline when inline is whitespace only', () => {
    const { instructions } = loadInstructions(tmpDir, 'create-prd', '   ')

    expect(instructions.inline).toBeNull()
  })

  it('warns on empty per-step instruction file (ASM_INSTRUCTION_EMPTY)', () => {
    fs.writeFileSync(path.join(instructionsDir, 'create-prd.md'), '  \n  ', 'utf8')

    const { instructions, warnings } = loadInstructions(tmpDir, 'create-prd')

    expect(instructions.perStep).toBeNull()
    expect(warnings.some(w => w.code === 'ASM_INSTRUCTION_EMPTY')).toBe(true)
    const warn = warnings.find(w => w.code === 'ASM_INSTRUCTION_EMPTY')
    expect(warn?.message).toContain('create-prd')
  })

  it('trims whitespace from loaded instruction content', () => {
    fs.writeFileSync(path.join(instructionsDir, 'global.md'), '  \n# Instructions\n  ', 'utf8')

    const { instructions } = loadInstructions(tmpDir, 'create-prd')

    expect(instructions.global).toBe('# Instructions')
  })

  it('returns warnings array for all empty files found', () => {
    fs.writeFileSync(path.join(instructionsDir, 'global.md'), '', 'utf8')
    fs.writeFileSync(path.join(instructionsDir, 'create-prd.md'), '', 'utf8')

    const { warnings } = loadInstructions(tmpDir, 'create-prd')

    expect(warnings.filter(w => w.code === 'ASM_INSTRUCTION_EMPTY')).toHaveLength(2)
  })

  it('includes file path in warning context', () => {
    const emptyFile = path.join(instructionsDir, 'global.md')
    fs.writeFileSync(emptyFile, '', 'utf8')

    const { warnings } = loadInstructions(tmpDir, 'create-prd')

    const warn = warnings.find(w => w.code === 'ASM_INSTRUCTION_EMPTY')
    expect(warn?.context?.file).toBe(emptyFile)
  })
})
