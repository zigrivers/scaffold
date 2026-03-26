import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { ClaudeMdManager } from './claude-md.js'
import type { SectionRegistry } from './claude-md.js'

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-claude-md-test-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

const testRegistry: SectionRegistry = {
  'create-prd': { heading: '## Project Overview', tokenBudget: 50 },
  'system-architecture': { heading: '## Architecture Summary', tokenBudget: 100 },
  'tdd': { heading: '## Testing Strategy', tokenBudget: 30 },
}

describe('ClaudeMdManager', () => {
  it('fillSection creates CLAUDE.md if it does not exist', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    manager.fillSection('create-prd', 'This project builds a todo app.')
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(true)
  })

  it('fillSection writes section between open and close markers', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    manager.fillSection('create-prd', 'Todo app content.')
    const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')
    expect(content).toContain('<!-- scaffold:managed by create-prd -->')
    expect(content).toContain('<!-- /scaffold:managed -->')
    expect(content).toContain('Todo app content.')
    expect(content).toContain('## Project Overview')
  })

  it('fillSection replaces existing section content on re-fill', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    manager.fillSection('create-prd', 'Original content.')
    manager.fillSection('create-prd', 'Updated content.')
    const content = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')
    expect(content).not.toContain('Original content.')
    expect(content).toContain('Updated content.')
    // Only one block for this section
    const matches = content.match(/<!-- scaffold:managed by create-prd -->/g)
    expect(matches?.length).toBe(1)
  })

  it('unmanaged content is preserved when re-filling a section', () => {
    const root = makeTmpDir()
    const claudeMdPath = path.join(root, 'CLAUDE.md')
    fs.writeFileSync(claudeMdPath, '# My CLAUDE.md\n\nHand-written content that should stay.\n')
    const manager = new ClaudeMdManager(root, testRegistry)
    manager.fillSection('create-prd', 'Auto-generated overview.')
    const content = fs.readFileSync(claudeMdPath, 'utf8')
    expect(content).toContain('Hand-written content that should stay.')
    expect(content).toContain('Auto-generated overview.')
  })

  it('readSection returns section content when section exists', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    manager.fillSection('create-prd', 'This is the PRD overview.')
    const section = manager.readSection('create-prd')
    expect(section).toBe('This is the PRD overview.')
  })

  it('readSection returns null when section is not present', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    const section = manager.readSection('create-prd')
    expect(section).toBeNull()
  })

  it('listSections returns all registered sections', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    const sections = manager.listSections()
    expect(sections.length).toBe(Object.keys(testRegistry).length)
    const slugs = sections.map(s => s.slug)
    expect(slugs).toContain('create-prd')
    expect(slugs).toContain('system-architecture')
    expect(slugs).toContain('tdd')
  })

  it('fillSection returns CMD_SECTION_OVER_BUDGET warning when content exceeds token budget', () => {
    const root = makeTmpDir()
    // tokenBudget for tdd is 30 — use lots of words to exceed it
    const manager = new ClaudeMdManager(root, testRegistry)
    const longContent = Array(50).fill('word').join(' ')
    const warnings = manager.fillSection('tdd', longContent)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.code === 'CMD_SECTION_OVER_BUDGET')).toBe(true)
  })

  it('getBudgetStatus reports total tokens used across sections', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    manager.fillSection('create-prd', 'Short content.')
    manager.fillSection('system-architecture', 'Another section content.')
    const status = manager.getBudgetStatus()
    expect(status).toHaveProperty('totalBudget')
    expect(status).toHaveProperty('totalUsed')
    expect(status).toHaveProperty('sections')
    expect(status.totalUsed).toBeGreaterThan(0)
    expect(typeof status.totalBudget).toBe('number')
  })

  it('creates CLAUDE.md in the correct directory (project root)', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    manager.fillSection('create-prd', 'Content.')
    expect(fs.existsSync(path.join(root, 'CLAUDE.md'))).toBe(true)
    // Should NOT be in a subdirectory
    expect(fs.existsSync(path.join(root, '.scaffold', 'CLAUDE.md'))).toBe(false)
  })

  it('listSections shows filled=true for filled sections and filled=false otherwise', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    manager.fillSection('create-prd', 'Some content.')
    const sections = manager.listSections()
    const prd = sections.find(s => s.slug === 'create-prd')
    const arch = sections.find(s => s.slug === 'system-architecture')
    expect(prd?.filled).toBe(true)
    expect(arch?.filled).toBe(false)
  })

  it('fillSection returns no warnings when content is within budget', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    // Very short content — well within the 50 token budget for create-prd
    const warnings = manager.fillSection('create-prd', 'Short.')
    const overBudgetWarnings = warnings.filter(w => w.code === 'CMD_SECTION_OVER_BUDGET')
    expect(overBudgetWarnings.length).toBe(0)
  })

  it('readSection returns null when CLAUDE.md does not exist', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    expect(manager.readSection('system-architecture')).toBeNull()
  })

  it('multiple sections can coexist in the same CLAUDE.md', () => {
    const root = makeTmpDir()
    const manager = new ClaudeMdManager(root, testRegistry)
    manager.fillSection('create-prd', 'PRD content.')
    manager.fillSection('system-architecture', 'Architecture content.')
    const prd = manager.readSection('create-prd')
    const arch = manager.readSection('system-architecture')
    expect(prd).toBe('PRD content.')
    expect(arch).toBe('Architecture content.')
  })
})
