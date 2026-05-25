import { describe, it, expect, afterEach } from 'vitest'
import { validateKnowledgeFile } from './knowledge-frontmatter-validator.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const tmpDirs: string[] = []

function tmpFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'))
  tmpDirs.push(dir)
  const file = path.join(dir, 'entry.md')
  fs.writeFileSync(file, content)
  return file
}

afterEach(() => {
  while (tmpDirs.length) {
    fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  }
})

describe('validateKnowledgeFile', () => {
  it('passes a minimal valid entry', () => {
    const file = tmpFile('---\nname: x\ndescription: y\n---\nbody')
    const result = validateKnowledgeFile(file)
    expect(result.errors).toEqual([])
  })

  it('errors when last-reviewed is not an ISO date', () => {
    const file = tmpFile('---\nname: x\ndescription: y\nlast-reviewed: \'last tuesday\'\n---\nbody')
    const result = validateKnowledgeFile(file)
    expect(result.errors[0].message).toMatch(/last-reviewed/)
  })

  it('errors when last-reviewed is shaped right but is not a real calendar date', () => {
    // Round-3 F-002: "2026-99-99" passes the YYYY-MM-DD regex but is invalid.
    // Cadence math (new Date(...)) becomes NaN and silently breaks selection.
    const file = tmpFile('---\nname: x\ndescription: y\nlast-reviewed: \'2026-99-99\'\n---\nbody')
    const result = validateKnowledgeFile(file)
    expect(result.errors.some(e => /calendar date/.test(e.message))).toBe(true)
  })

  it('errors when source.retrieved is shaped right but is not a real calendar date', () => {
    const file = tmpFile(
      '---\nname: x\ndescription: y\nsources:\n  - url: https://x\n    retrieved: \'2026-13-01\'\n---\nbody',
    )
    const result = validateKnowledgeFile(file)
    expect(result.errors.some(e => /calendar date/.test(e.message))).toBe(true)
  })

  it('errors when a source entry is missing url', () => {
    const file = tmpFile('---\nname: x\ndescription: y\nsources:\n  - anchor: \'#a\'\n---\nbody')
    const result = validateKnowledgeFile(file)
    expect(result.errors[0].message).toMatch(/url/)
  })

  it('warns when sources is empty and volatility is fast-moving', () => {
    const file = tmpFile('---\nname: x\ndescription: y\nvolatility: fast-moving\nsources: []\n---\nbody')
    const result = validateKnowledgeFile(file)
    expect(result.warnings.some(w => /sources/.test(w.message))).toBe(true)
  })
})
