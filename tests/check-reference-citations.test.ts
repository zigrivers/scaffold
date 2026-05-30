import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Importing the checker must NOT execute its main loop / process.exit — it has to
// be importable so the dynamic-discovery logic can be unit-tested (R2-1).
const mod = await import('../scripts/check-reference-citations.mjs')

describe('discoverGuidePages (R2-1: guides are covered dynamically, not hard-coded)', () => {
  it('returns an fp-checked page for every guide dir containing index.html', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'guides-cov-'))
    const guides = path.join(root, 'content', 'guides')
    fs.mkdirSync(path.join(guides, 'alpha'), { recursive: true })
    fs.writeFileSync(
      path.join(guides, 'alpha', 'index.html'),
      '<span class="fp" data-path="src/x.ts:1">src/x.ts:1</span>',
    )
    fs.mkdirSync(path.join(guides, 'beta'), { recursive: true }) // no index.html — skipped
    fs.mkdirSync(path.join(guides, 'gamma'), { recursive: true })
    fs.writeFileSync(path.join(guides, 'gamma', 'index.html'), 'no citations here')

    const pages = mod.discoverGuidePages(guides, root)
    const names = pages.map((p: { name: string }) => p.name).sort()

    expect(names).toEqual(['guide:alpha', 'guide:gamma'])
    expect(pages.every((p: { fp: boolean }) => p.fp === true)).toBe(true)
    const alpha = pages.find((p: { name: string }) => p.name === 'guide:alpha')
    expect(alpha.path).toBe(path.join('content', 'guides', 'alpha', 'index.html'))
  })

  it('returns [] when the guides dir does not exist', () => {
    expect(mod.discoverGuidePages('/nope/does/not/exist', '/nope')).toEqual([])
  })

  it('returns [] when guidesDir is a file, not a directory (P3-J)', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gd-')), 'afile')
    fs.writeFileSync(f, 'x')
    expect(mod.discoverGuidePages(f, '/')).toEqual([])
  })
})

describe('collect — guide citation enforcement', () => {
  it('strictCites validates fp data-path for repo-root files like CLAUDE.md (P1-C)', () => {
    const html = '<span class="fp" data-path="CLAUDE.md:1">CLAUDE.md:1</span>'
    const { cites } = mod.collect(html, { fp: true, strictCites: true })
    expect([...cites]).toContain('CLAUDE.md|1|')
  })

  it('legacy pages (no strictCites) still skip paths outside the source dirs', () => {
    const html = '<span class="fp" data-path="CLAUDE.md:1">CLAUDE.md:1</span>'
    const { cites } = mod.collect(html, { fp: true })
    expect([...cites]).not.toContain('CLAUDE.md|1|')
  })

  it('collects advisory citations into a separate warn-only set (P2-D)', () => {
    const html = '<span class="cite-advisory" data-path="src/x.ts:3">src/x.ts:3</span>'
    const { cites, advisory } = mod.collect(html, { fp: true, strictCites: true })
    expect([...advisory]).toContain('src/x.ts|3|')
    expect([...cites]).not.toContain('src/x.ts|3|') // advisory must NOT be blocking
  })
})
