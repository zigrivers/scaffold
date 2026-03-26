import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { buildIndex, buildIndexWithOverrides, loadEntries, extractDeepGuidance } from './knowledge-loader.js'

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-kbl-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function writeTmpFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content, 'utf8')
  return p
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

const prdCraftContent = `---
name: prd-craft
description: Best practices for writing effective PRDs
topics:
  - product
  - requirements
---

This is the knowledge base content for PRD crafting.

## Section One

Details about section one.
`

const gapAnalysisContent = `---
name: gap-analysis
description: Systematic approaches to finding gaps
topics:
  - analysis
  - requirements
---

Gap analysis content here.
`

describe('buildIndex', () => {
  it('builds name → filepath index from directory scan', () => {
    const dir = makeTmpDir()
    const prdPath = writeTmpFile(dir, 'prd-craft.md', prdCraftContent)

    const index = buildIndex(dir)

    expect(index.size).toBe(1)
    expect(index.has('prd-craft')).toBe(true)
    expect(index.get('prd-craft')).toBe(prdPath)
  })

  it('scans subdirectories recursively', () => {
    const dir = makeTmpDir()
    const subDir = path.join(dir, 'product')
    fs.mkdirSync(subDir)

    writeTmpFile(dir, 'gap-analysis.md', gapAnalysisContent)
    writeTmpFile(subDir, 'prd-craft.md', prdCraftContent)

    const index = buildIndex(dir)

    expect(index.size).toBe(2)
    expect(index.has('gap-analysis')).toBe(true)
    expect(index.has('prd-craft')).toBe(true)
  })

  it('returns empty map when directory does not exist', () => {
    const index = buildIndex('/nonexistent/directory/xyz-abc')
    expect(index.size).toBe(0)
  })

  it('skips files without valid frontmatter', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)
    writeTmpFile(dir, 'no-frontmatter.md', 'Just plain markdown with no frontmatter')
    writeTmpFile(dir, 'no-name.md', '---\ndescription: missing name\n---\n\nContent here.')

    const index = buildIndex(dir)

    expect(index.size).toBe(1)
    expect(index.has('prd-craft')).toBe(true)
  })

  it('ignores non-.md files', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)
    writeTmpFile(dir, 'readme.txt', 'Not a markdown file')
    writeTmpFile(dir, 'config.yml', 'name: test')

    const index = buildIndex(dir)

    expect(index.size).toBe(1)
    expect(index.has('prd-craft')).toBe(true)
  })
})

describe('buildIndexWithOverrides', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-kb-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  function writeEntry(dir: string, subPath: string, name: string, description = 'desc') {
    const fullDir = path.join(dir, path.dirname(subPath))
    fs.mkdirSync(fullDir, { recursive: true })
    fs.writeFileSync(path.join(dir, subPath), `---\nname: ${name}\ndescription: ${description}\ntopics: []\n---\n# Body`)
  }

  it('returns global entry when no local override exists', () => {
    const globalDir = path.join(tmpDir, 'knowledge')
    writeEntry(globalDir, 'core/api-design.md', 'api-design', 'Global API design')
    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.has('api-design')).toBe(true)
    expect(index.get('api-design')).toContain('knowledge')
    expect(index.get('api-design')).toContain('api-design.md')
  })

  it('local override wins over global entry', () => {
    const globalDir = path.join(tmpDir, 'knowledge')
    writeEntry(globalDir, 'core/api-design.md', 'api-design', 'Global')
    const localDir = path.join(tmpDir, '.scaffold', 'knowledge')
    writeEntry(localDir, 'api-design.md', 'api-design', 'Local override')
    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.get('api-design')).toContain('.scaffold')
  })

  it('returns empty map when both dirs do not exist', () => {
    const index = buildIndexWithOverrides(tmpDir, path.join(tmpDir, 'missing'))
    expect(index.size).toBe(0)
  })

  it('includes global entries not overridden locally', () => {
    const globalDir = path.join(tmpDir, 'knowledge')
    writeEntry(globalDir, 'core/api-design.md', 'api-design')
    writeEntry(globalDir, 'core/testing.md', 'testing-strategy')
    const localDir = path.join(tmpDir, '.scaffold', 'knowledge')
    writeEntry(localDir, 'api-design.md', 'api-design')
    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.has('testing-strategy')).toBe(true)
    expect(index.get('testing-strategy')).toContain('knowledge')
  })

  it('emits warning to stderr for duplicate names in local override dir', () => {
    const globalDir = path.join(tmpDir, 'knowledge')
    const localDir = path.join(tmpDir, '.scaffold', 'knowledge')
    writeEntry(localDir, 'a/api-design.md', 'api-design', 'First')
    writeEntry(localDir, 'b/api-design.md', 'api-design', 'Second')
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    buildIndexWithOverrides(tmpDir, globalDir)
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('api-design'))
    stderrSpy.mockRestore()
  })
})

describe('loadEntries', () => {
  it('loads entries by name from index', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)
    writeTmpFile(dir, 'gap-analysis.md', gapAnalysisContent)

    const index = buildIndex(dir)
    const { entries, warnings } = loadEntries(index, ['prd-craft', 'gap-analysis'])

    expect(warnings).toHaveLength(0)
    expect(entries).toHaveLength(2)

    const prdEntry = entries.find(e => e.name === 'prd-craft')
    expect(prdEntry).toBeDefined()
    expect(prdEntry!.name).toBe('prd-craft')
    expect(prdEntry!.description).toBe('Best practices for writing effective PRDs')
    expect(prdEntry!.topics).toEqual(['product', 'requirements'])

    const gapEntry = entries.find(e => e.name === 'gap-analysis')
    expect(gapEntry).toBeDefined()
    expect(gapEntry!.name).toBe('gap-analysis')
  })

  it('returns full content after frontmatter', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)

    const index = buildIndex(dir)
    const { entries } = loadEntries(index, ['prd-craft'])

    expect(entries).toHaveLength(1)
    const entry = entries[0]
    expect(entry.content).toContain('This is the knowledge base content for PRD crafting')
    expect(entry.content).toContain('Section One')
    // Should not include the frontmatter delimiters
    expect(entry.content).not.toContain('name: prd-craft')
  })

  it('returns warning for missing entry name', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)

    const index = buildIndex(dir)
    const { entries, warnings } = loadEntries(index, ['prd-craft', 'nonexistent-entry'])

    expect(entries).toHaveLength(1)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('FRONTMATTER_KB_ENTRY_MISSING')
    expect(warnings[0].message).toContain('nonexistent-entry')
  })

  it('handles empty names list (returns empty entries)', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)

    const index = buildIndex(dir)
    const { entries, warnings } = loadEntries(index, [])

    expect(entries).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('returns all warnings for all missing entries', () => {
    const index = new Map<string, string>()
    const { entries, warnings } = loadEntries(index, ['missing-a', 'missing-b'])

    expect(entries).toHaveLength(0)
    expect(warnings).toHaveLength(2)
    expect(warnings.every(w => w.code === 'FRONTMATTER_KB_ENTRY_MISSING')).toBe(true)
  })

  it('loads only Deep Guidance section when present', () => {
    const dir = makeTmpDir()
    const deepContent = `---
name: test-deep
description: Test deep guidance extraction
topics:
  - testing
---

# Test Deep

## Summary

This content overlaps with the command prompt and should be skipped.

## Deep Guidance

This is the deep guidance that should be loaded.

### Subsection

More deep content here.
`
    writeTmpFile(dir, 'test-deep.md', deepContent)

    const index = buildIndex(dir)
    const { entries } = loadEntries(index, ['test-deep'])

    expect(entries).toHaveLength(1)
    expect(entries[0].content).toContain('This is the deep guidance that should be loaded')
    expect(entries[0].content).toContain('More deep content here')
    expect(entries[0].content).not.toContain('overlaps with the command prompt')
    expect(entries[0].content).not.toContain('## Summary')
  })

  it('loads full body when no Deep Guidance section exists', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)

    const index = buildIndex(dir)
    const { entries } = loadEntries(index, ['prd-craft'])

    expect(entries).toHaveLength(1)
    expect(entries[0].content).toContain('This is the knowledge base content for PRD crafting')
    expect(entries[0].content).toContain('Section One')
  })
})

describe('extractDeepGuidance', () => {
  it('returns content after Deep Guidance heading', () => {
    const body = `# Title

## Summary

Summary content.

## Deep Guidance

Deep content here.

### More

Even more.`

    const result = extractDeepGuidance(body)
    expect(result).not.toBeNull()
    expect(result).toContain('Deep content here')
    expect(result).toContain('Even more')
    expect(result).not.toContain('Summary content')
  })

  it('returns null when no Deep Guidance heading exists', () => {
    const body = `# Title

## Section One

Content.

## Section Two

More content.`

    expect(extractDeepGuidance(body)).toBeNull()
  })

  it('handles case-insensitive heading match', () => {
    const body = `## Summary

Stuff.

## deep guidance

Deep stuff here.`

    const result = extractDeepGuidance(body)
    expect(result).not.toBeNull()
    expect(result).toContain('Deep stuff here')
  })
})
