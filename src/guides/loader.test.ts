import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { extractGuideFrontmatter, buildGuidesIndex } from './loader.js'

const tmpDirs: string[] = []

function tmpGuides(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guides-'))
  tmpDirs.push(root)
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body)
  }
  return root
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

const VALID_FM = `---
title: MMR Reference
topic: mmr
description: Multi-model review
category: tools
order: 10
---

# Body
`

describe('extractGuideFrontmatter', () => {
  it('parses required fields', () => {
    const fm = extractGuideFrontmatter(VALID_FM)
    expect(fm).toEqual({
      title: 'MMR Reference', topic: 'mmr',
      description: 'Multi-model review', category: 'tools', order: 10,
    })
  })

  it('returns null when frontmatter missing required fields', () => {
    expect(extractGuideFrontmatter('# no frontmatter')).toBeNull()
  })
})

describe('buildGuidesIndex', () => {
  it('indexes guide dirs by topic and skips invalid ones', () => {
    const root = tmpGuides({
      'mmr/index.md': VALID_FM,
      'broken/index.md': '# missing frontmatter',
    })
    const idx = buildGuidesIndex(root)
    expect([...idx.keys()]).toEqual(['mmr'])
    const entry = idx.get('mmr')!
    expect(entry.topic).toBe('mmr')
    expect(entry.mdPath).toBe(path.join(root, 'mmr', 'index.md'))
    expect(entry.htmlPath).toBe(path.join(root, 'mmr', 'index.html'))
  })

  it('returns empty map when dir does not exist', () => {
    expect(buildGuidesIndex(path.join(os.tmpdir(), 'nope-xyz')).size).toBe(0)
  })

  it('skips a guide dir whose frontmatter topic does not match the directory name', () => {
    const root = tmpGuides({
      'mmr/index.md': VALID_FM,
      'not-mmr/index.md': VALID_FM, // frontmatter says topic: mmr, but dir is not-mmr
    })
    const idx = buildGuidesIndex(root)
    expect([...idx.keys()]).toEqual(['mmr'])
    expect(idx.has('not-mmr')).toBe(false)
  })
})

describe('extractGuideFrontmatter — escape_scripts', () => {
  it('parses escape_scripts array into string[]', () => {
    const content = `---
title: MMR Reference
topic: mmr
description: Multi-model review
category: tools
order: 10
escape_scripts: [custom.js]
---

# Body
`
    const fm = extractGuideFrontmatter(content)
    expect(fm).not.toBeNull()
    expect(fm!.escape_scripts).toEqual(['custom.js'])
  })

  it('filters out non-string entries from escape_scripts', () => {
    const content = `---
title: MMR Reference
topic: mmr
description: Multi-model review
category: tools
order: 10
escape_scripts: [valid.js, 42, null, another.js]
---

# Body
`
    const fm = extractGuideFrontmatter(content)
    expect(fm).not.toBeNull()
    expect(fm!.escape_scripts).toEqual(['valid.js', 'another.js'])
  })
})
