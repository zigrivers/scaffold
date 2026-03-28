import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import {
  buildIndex, buildIndexWithOverrides, loadEntries,
  loadFullEntries, extractDeepGuidance, extractKBFrontmatter,
} from './knowledge-loader.js'

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
    fs.writeFileSync(
      path.join(dir, subPath),
      `---\nname: ${name}\ndescription: ${description}\ntopics: []\n---\n# Body`,
    )
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

// --- Dual-channel content fixture used by multiple test blocks ---
const dualChannelContent = `---
name: dual-channel
description: Entry with both Summary and Deep Guidance
topics:
  - testing
---

# Dual Channel Entry

## Summary

Summary content that overlaps with the command prompt.
This should be included in full loads but excluded in deep-only loads.

## Deep Guidance

Deep guidance content with supplementary expertise.

### Advanced Patterns

Advanced pattern details here.
`

describe('extractKBFrontmatter', () => {
  it('returns null for content without frontmatter delimiters', () => {
    expect(extractKBFrontmatter('Just plain markdown')).toBeNull()
  })

  it('returns null for content with opening delimiter but no closing', () => {
    expect(extractKBFrontmatter('---\nname: test\nno closing delimiter')).toBeNull()
  })

  it('returns null when name field is missing', () => {
    const content = '---\ndescription: no name here\ntopics: []\n---\n\nBody.'
    expect(extractKBFrontmatter(content)).toBeNull()
  })

  it('returns null when name field is empty string', () => {
    const content = '---\nname: ""\ndescription: empty name\n---\n\nBody.'
    expect(extractKBFrontmatter(content)).toBeNull()
  })

  it('returns null for invalid YAML', () => {
    const content = '---\n: bad: yaml: [unclosed\n---\n\nBody.'
    expect(extractKBFrontmatter(content)).toBeNull()
  })

  it('parses valid frontmatter with all fields', () => {
    const result = extractKBFrontmatter(prdCraftContent)
    expect(result).toEqual({
      name: 'prd-craft',
      description: 'Best practices for writing effective PRDs',
      topics: ['product', 'requirements'],
    })
  })

  it('defaults description to empty string when missing', () => {
    const content = '---\nname: no-desc\ntopics: []\n---\n\nBody.'
    const result = extractKBFrontmatter(content)
    expect(result).not.toBeNull()
    expect(result!.description).toBe('')
  })

  it('defaults topics to empty array when missing', () => {
    const content = '---\nname: no-topics\ndescription: desc\n---\n\nBody.'
    const result = extractKBFrontmatter(content)
    expect(result).not.toBeNull()
    expect(result!.topics).toEqual([])
  })
})

describe('loadEntries — edge cases', () => {
  it('returns warning when indexed file has been deleted before load', () => {
    const dir = makeTmpDir()
    const filePath = writeTmpFile(dir, 'ephemeral.md', prdCraftContent)

    const index = buildIndex(dir)
    expect(index.has('prd-craft')).toBe(true)

    // Delete the file after indexing
    fs.unlinkSync(filePath)

    const { entries, warnings } = loadEntries(index, ['prd-craft'])
    expect(entries).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('FRONTMATTER_KB_ENTRY_MISSING')
    expect(warnings[0].message).toContain('Failed to load')
  })

  it('returns warning when indexed file has had frontmatter corrupted', () => {
    const dir = makeTmpDir()
    const filePath = writeTmpFile(dir, 'entry.md', prdCraftContent)

    const index = buildIndex(dir)
    expect(index.has('prd-craft')).toBe(true)

    // Corrupt the file after indexing (remove frontmatter)
    fs.writeFileSync(filePath, 'No frontmatter anymore', 'utf8')

    const { entries, warnings } = loadEntries(index, ['prd-craft'])
    expect(entries).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('FRONTMATTER_KB_ENTRY_MISSING')
    expect(warnings[0].message).toContain('invalid frontmatter')
  })

  it('extracts Deep Guidance only (excludes Summary) for dual-channel entries', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'dual-channel.md', dualChannelContent)

    const index = buildIndex(dir)
    const { entries, warnings } = loadEntries(index, ['dual-channel'])

    expect(warnings).toHaveLength(0)
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toContain('Deep guidance content with supplementary expertise')
    expect(entries[0].content).toContain('Advanced pattern details here')
    expect(entries[0].content).not.toContain('Summary content that overlaps')
  })

  it('uses full body for entries without Deep Guidance section', () => {
    const dir = makeTmpDir()
    const noDeepContent = `---
name: simple-entry
description: No deep guidance here
topics:
  - misc
---

# Simple Entry

All content here is the full body.

## Some Section

Section details.
`
    writeTmpFile(dir, 'simple-entry.md', noDeepContent)

    const index = buildIndex(dir)
    const { entries } = loadEntries(index, ['simple-entry'])

    expect(entries).toHaveLength(1)
    expect(entries[0].content).toContain('All content here is the full body')
    expect(entries[0].content).toContain('Section details')
  })
})

describe('loadFullEntries', () => {
  it('loads full body including Summary AND Deep Guidance sections', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'dual-channel.md', dualChannelContent)

    const index = buildIndex(dir)
    const { entries, warnings } = loadFullEntries(index, ['dual-channel'])

    expect(warnings).toHaveLength(0)
    expect(entries).toHaveLength(1)

    const entry = entries[0]
    expect(entry.name).toBe('dual-channel')
    expect(entry.description).toBe('Entry with both Summary and Deep Guidance')
    expect(entry.topics).toEqual(['testing'])
    // Full body includes both Summary and Deep Guidance
    expect(entry.content).toContain('Summary content that overlaps with the command prompt')
    expect(entry.content).toContain('Deep guidance content with supplementary expertise')
    expect(entry.content).toContain('Advanced pattern details here')
    // Should NOT include frontmatter
    expect(entry.content).not.toContain('name: dual-channel')
  })

  it('returns warning for missing entry reference', () => {
    const index = new Map<string, string>()
    const { entries, warnings } = loadFullEntries(index, ['nonexistent'])

    expect(entries).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('FRONTMATTER_KB_ENTRY_MISSING')
    expect(warnings[0].message).toContain('nonexistent')
    expect(warnings[0].message).toContain('not found in index')
  })

  it('returns all warnings for multiple missing entries', () => {
    const index = new Map<string, string>()
    const { entries, warnings } = loadFullEntries(index, ['missing-x', 'missing-y', 'missing-z'])

    expect(entries).toHaveLength(0)
    expect(warnings).toHaveLength(3)
    expect(warnings.every(w => w.code === 'FRONTMATTER_KB_ENTRY_MISSING')).toBe(true)
  })

  it('returns warning when indexed file has been deleted before load', () => {
    const dir = makeTmpDir()
    const filePath = writeTmpFile(dir, 'entry.md', prdCraftContent)

    const index = buildIndex(dir)
    fs.unlinkSync(filePath)

    const { entries, warnings } = loadFullEntries(index, ['prd-craft'])
    expect(entries).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('FRONTMATTER_KB_ENTRY_MISSING')
    expect(warnings[0].message).toContain('Failed to load')
  })

  it('returns warning when indexed file has corrupted frontmatter', () => {
    const dir = makeTmpDir()
    const filePath = writeTmpFile(dir, 'entry.md', prdCraftContent)

    const index = buildIndex(dir)
    fs.writeFileSync(filePath, 'Corrupted - no frontmatter', 'utf8')

    const { entries, warnings } = loadFullEntries(index, ['prd-craft'])
    expect(entries).toHaveLength(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('invalid frontmatter')
  })

  it('loads entries without Deep Guidance using full body', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)

    const index = buildIndex(dir)
    const { entries, warnings } = loadFullEntries(index, ['prd-craft'])

    expect(warnings).toHaveLength(0)
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toContain('This is the knowledge base content for PRD crafting')
    expect(entries[0].content).toContain('Details about section one')
  })

  it('handles empty names list', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)
    const index = buildIndex(dir)

    const { entries, warnings } = loadFullEntries(index, [])
    expect(entries).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('loads multiple entries successfully', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)
    writeTmpFile(dir, 'gap-analysis.md', gapAnalysisContent)

    const index = buildIndex(dir)
    const { entries, warnings } = loadFullEntries(index, ['prd-craft', 'gap-analysis'])

    expect(warnings).toHaveLength(0)
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.name).sort()).toEqual(['gap-analysis', 'prd-craft'])
  })

  it('mixes found and missing entries, producing partial results', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)

    const index = buildIndex(dir)
    const { entries, warnings } = loadFullEntries(index, ['prd-craft', 'does-not-exist'])

    expect(entries).toHaveLength(1)
    expect(entries[0].name).toBe('prd-craft')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('does-not-exist')
  })
})

describe('buildIndexWithOverrides — additional edge cases', () => {
  it('local entries in subdirectories are found', () => {
    const tmpDir = makeTmpDir()
    const globalDir = path.join(tmpDir, 'knowledge')
    fs.mkdirSync(globalDir, { recursive: true })

    const localDir = path.join(tmpDir, '.scaffold', 'knowledge', 'nested', 'deep')
    fs.mkdirSync(localDir, { recursive: true })
    fs.writeFileSync(
      path.join(localDir, 'nested-entry.md'),
      '---\nname: nested-entry\ndescription: deeply nested\ntopics: []\n---\n# Nested body',
    )

    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.has('nested-entry')).toBe(true)
    expect(index.get('nested-entry')).toContain('.scaffold')
    expect(index.get('nested-entry')).toContain('nested-entry.md')
  })

  it('local non-.md files are ignored', () => {
    const tmpDir = makeTmpDir()
    const globalDir = path.join(tmpDir, 'knowledge')
    fs.mkdirSync(globalDir, { recursive: true })

    const localDir = path.join(tmpDir, '.scaffold', 'knowledge')
    fs.mkdirSync(localDir, { recursive: true })
    fs.writeFileSync(path.join(localDir, 'data.json'), '{"name": "json-entry"}')
    fs.writeFileSync(path.join(localDir, 'notes.txt'), 'name: txt-entry')
    fs.writeFileSync(
      path.join(localDir, 'valid.md'),
      '---\nname: valid-local\ndescription: valid\ntopics: []\n---\n# Body',
    )

    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.size).toBe(1)
    expect(index.has('valid-local')).toBe(true)
  })

  it('local files without valid frontmatter are skipped', () => {
    const tmpDir = makeTmpDir()
    const globalDir = path.join(tmpDir, 'knowledge')
    fs.mkdirSync(globalDir, { recursive: true })

    const localDir = path.join(tmpDir, '.scaffold', 'knowledge')
    fs.mkdirSync(localDir, { recursive: true })
    fs.writeFileSync(path.join(localDir, 'no-fm.md'), 'Just plain text, no frontmatter')
    fs.writeFileSync(path.join(localDir, 'no-name.md'), '---\ndescription: missing name\n---\n# Body')

    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.size).toBe(0)
  })

  it('merges global and local entries with distinct names', () => {
    const tmpDir = makeTmpDir()
    const globalDir = path.join(tmpDir, 'knowledge')
    fs.mkdirSync(globalDir, { recursive: true })
    fs.writeFileSync(
      path.join(globalDir, 'global-only.md'),
      '---\nname: global-only\ndescription: global\ntopics: []\n---\n# Global body',
    )

    const localDir = path.join(tmpDir, '.scaffold', 'knowledge')
    fs.mkdirSync(localDir, { recursive: true })
    fs.writeFileSync(
      path.join(localDir, 'local-only.md'),
      '---\nname: local-only\ndescription: local\ntopics: []\n---\n# Local body',
    )

    const index = buildIndexWithOverrides(tmpDir, globalDir)
    expect(index.size).toBe(2)
    expect(index.has('global-only')).toBe(true)
    expect(index.has('local-only')).toBe(true)
    expect(index.get('global-only')).toContain('knowledge')
    expect(index.get('local-only')).toContain('.scaffold')
  })
})

describe('loadEntries vs loadFullEntries — depth behavior contrast', () => {
  it('loadEntries extracts Deep Guidance only while loadFullEntries returns full body', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'dual-channel.md', dualChannelContent)

    const index = buildIndex(dir)

    const shallow = loadEntries(index, ['dual-channel'])
    const full = loadFullEntries(index, ['dual-channel'])

    // Both should succeed without warnings
    expect(shallow.warnings).toHaveLength(0)
    expect(full.warnings).toHaveLength(0)

    // loadEntries should have Deep Guidance only (no Summary)
    expect(shallow.entries[0].content).toContain('Deep guidance content')
    expect(shallow.entries[0].content).not.toContain('Summary content that overlaps')

    // loadFullEntries should have both Summary AND Deep Guidance
    expect(full.entries[0].content).toContain('Summary content that overlaps')
    expect(full.entries[0].content).toContain('Deep guidance content')
  })

  it('both functions return identical content for entries without Deep Guidance', () => {
    const dir = makeTmpDir()
    writeTmpFile(dir, 'prd-craft.md', prdCraftContent)

    const index = buildIndex(dir)

    const shallow = loadEntries(index, ['prd-craft'])
    const full = loadFullEntries(index, ['prd-craft'])

    expect(shallow.entries[0].content).toBe(full.entries[0].content)
  })
})
