import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { extractGuideFrontmatter, buildGuidesIndex } from './loader.js'

function tmpGuides(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guides-'))
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, body)
  }
  return root
}

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
})
