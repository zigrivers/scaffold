import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { headingIds } from './render.js'
import { findBrokenAnchors } from './links.js'

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ganchors-'))
}

/** A guide dir with an index.md, so cross-guide anchors have a source to read. */
function guide(root: string, name: string, md: string): string {
  const dir = path.join(root, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'index.md'), md)
  return dir
}

describe('headingIds (ids come from the renderer, never a second implementation)', () => {
  it('slugs h2 and h3 headings', () => {
    expect(headingIds('## Setup & adoption\n\n### Why worktrees\n')).toEqual(
      new Set(['setup-adoption', 'why-worktrees']),
    )
  })

  it('ignores h1 and h4 — the renderer only assigns ids to h2/h3', () => {
    expect(headingIds('# Title\n\n#### Deep\n')).toEqual(new Set())
  })

  it('strips frontmatter before collecting', () => {
    const md = '---\ntitle: X\n---\n\n## Real heading\n'
    expect(headingIds(md)).toEqual(new Set(['real-heading']))
  })

  it('keeps the repeated hyphens a flag name produces (the --fix trap)', () => {
    // "### The `--fix` flow" renders id="the---fix-flow": the space collapses to
    // one hyphen and the flag's own "--" survives. A checker that normalised
    // "--" to "-" would report this correct anchor as broken.
    expect(headingIds('### The `--fix` flow\n')).toEqual(new Set(['the---fix-flow']))
  })
})

describe('findBrokenAnchors (R2-10: #fragments must resolve, not just files)', () => {
  it('reports a same-page anchor with no matching heading', () => {
    const root = tmpdir()
    const dir = guide(root, 'cli', '## Real section\n\nSee [below](#no-such-section).\n')
    const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8')
    expect(findBrokenAnchors(md, dir)).toEqual(['#no-such-section'])
  })

  it('passes a same-page anchor that matches a heading', () => {
    const root = tmpdir()
    const dir = guide(root, 'cli', '## Real section\n\nSee [below](#real-section).\n')
    const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8')
    expect(findBrokenAnchors(md, dir)).toEqual([])
  })

  it('reports a cross-guide anchor missing from the target guide', () => {
    const root = tmpdir()
    guide(root, 'mmr', '## Channel architecture\n')
    const dir = guide(root, 'cli', 'See [mmr](../mmr/index.md#nope).\n')
    const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8')
    expect(findBrokenAnchors(md, dir)).toEqual(['../mmr/index.md#nope'])
  })

  it('passes a cross-guide anchor present in the target guide', () => {
    const root = tmpdir()
    guide(root, 'mmr', '## Channel architecture\n')
    const dir = guide(root, 'cli', 'See [mmr](../mmr/index.md#channel-architecture).\n')
    const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8')
    expect(findBrokenAnchors(md, dir)).toEqual([])
  })

  it('resolves an index.html cross-guide link against the index.md source', () => {
    const root = tmpdir()
    guide(root, 'mmr', '## Channel architecture\n')
    const dir = guide(root, 'cli', 'See [mmr](../mmr/index.html#channel-architecture).\n')
    const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8')
    expect(findBrokenAnchors(md, dir)).toEqual([])
  })

  it('does not flag the --fix-flow anchor, whose id really does hold "---"', () => {
    const root = tmpdir()
    const dir = guide(root, 'obs', '### The `--fix` flow\n\n[go](#the---fix-flow)\n')
    const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8')
    expect(findBrokenAnchors(md, dir)).toEqual([])
  })

  it('ignores links with no fragment, external URLs, and bare files', () => {
    const root = tmpdir()
    guide(root, 'mmr', '## X\n')
    const dir = guide(
      root,
      'cli',
      '[a](../mmr/index.md) [b](https://x.com#frag) [c](mailto:a@b.c) [d](#)\n',
    )
    const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8')
    expect(findBrokenAnchors(md, dir)).toEqual([])
  })

  it('stays silent when the cross-guide target does not exist (that is the file check’s job)', () => {
    const root = tmpdir()
    const dir = guide(root, 'cli', '[x](../gone/index.md#anything)\n')
    const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8')
    expect(findBrokenAnchors(md, dir)).toEqual([])
  })

  it('does not read anchors out of fenced code or inline code', () => {
    const root = tmpdir()
    const dir = guide(root, 'cli', '## Real\n\n```\n[x](#fake-one)\n```\n\n`[y](#fake-two)`\n')
    const md = fs.readFileSync(path.join(dir, 'index.md'), 'utf8')
    expect(findBrokenAnchors(md, dir)).toEqual([])
  })
})

describe('every shipped guide anchor resolves', () => {
  it('has no broken fragment in content/guides', () => {
    const guidesDir = path.resolve(__dirname, '../../content/guides')
    if (!fs.existsSync(guidesDir)) return
    const broken: string[] = []
    for (const e of fs.readdirSync(guidesDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const dir = path.join(guidesDir, e.name)
      const md = path.join(dir, 'index.md')
      if (!fs.existsSync(md)) continue
      for (const b of findBrokenAnchors(fs.readFileSync(md, 'utf8'), dir)) {
        broken.push(`${e.name}: ${b}`)
      }
    }
    expect(broken).toEqual([])
  })
})
