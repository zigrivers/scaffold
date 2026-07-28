import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { buildGuide, buildAllGuides, crossGuideAnchorErrors } from './build.js'
import { renderIndexPage } from './index-page.js'

const CSS = ':root{--bg:#fff}'

const GUIDE_MD = `---
title: MMR
topic: mmr
description: review
category: tools
order: 10
---

## Intro

:::callout{type=tip}
Use :sev[P1]{level=p1} wisely.
:::

| Flag | Desc |
|---|---|
| --pr | number |
`

describe('buildGuide', () => {
  it('writes a self-contained index.html and returns the lint result', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'), GUIDE_MD)
    const res = await buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '<svg><rect/></svg>' })
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
    expect(html).toContain('<title>MMR</title>')
    expect(html).toContain('callout-tip')
    expect(html).toContain('sev-p1')
    expect(res.lint.errors).toEqual([])
  })

  it('throws when lint finds a missing text-equivalent', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'),
      GUIDE_MD + '\n:::embed{src=partials/x.svg}\n:::\n')
    await expect(buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' }))
      .rejects.toThrow(/text-equivalent/i)
  })

  it('throws when a relative link target does not resolve', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'),
      GUIDE_MD + '\nSee [concepts](../concepts/index.md).\n')
    await expect(buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' }))
      .rejects.toThrow(/broken relative link/i)
  })

  it('throws when a same-page anchor matches no heading', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'), GUIDE_MD + '\nSee [below](#no-such-heading).\n')
    await expect(buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' }))
      .rejects.toThrow(/broken anchor link/i)
  })

  it('leaves index.html untouched when an anchor is broken (fails closed)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'), GUIDE_MD + '\n[x](#nope)\n')
    await expect(buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' })).rejects.toThrow()
    expect(fs.existsSync(path.join(dir, 'index.html'))).toBe(false)
  })

  it('accepts an anchor to a heading whose text is a directive', async () => {
    // The renderer runs remark-directive and remarkSev BEFORE assigning ids, so
    // "## The :sev[P0]{level=p0} rule" becomes id="the-p0-rule". Deriving ids by
    // re-parsing the markdown instead yielded "the-sevp0levelp0-rule", which
    // rejected this correct anchor and accepted the wrong one. Taking the ids
    // from the renderer is what makes this pass.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'),
      GUIDE_MD + '\n## The :sev[P0]{level=p0} rule\n\n[go](#the-p0-rule)\n')
    const res = await buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' })
    expect(res.ids.has('the-p0-rule')).toBe(true)
    expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toContain('id="the-p0-rule"')
  })

  it('rejects the pre-directive spelling of that same id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'),
      GUIDE_MD + '\n## The :sev[P0]{level=p0} rule\n\n[go](#the-sevp0levelp0-rule)\n')
    await expect(buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' }))
      .rejects.toThrow(/broken anchor link/i)
  })

  it('accepts an anchor to an h4, which now gets an id even though the TOC skips it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'), GUIDE_MD + '\n#### Deep Thing\n\n[go](#deep-thing)\n')
    const res = await buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' })
    expect(res.ids.has('deep-thing')).toBe(true)
    // …but it stays out of the TOC rail, which is h2/h3 only.
    expect(res.lint.errors).toEqual([])
    expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toContain('id="deep-thing"')
  })

  it('preserves a previous index.html when the build throws', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), 'SENTINEL')
    fs.writeFileSync(path.join(dir, 'index.md'), GUIDE_MD + '\n[x](#nope)\n')
    await expect(buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' })).rejects.toThrow()
    expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toBe('SENTINEL')
  })

  it('suffixes a repeated heading instead of failing the build', async () => {
    // "#### Example" under two different sections is ordinary documentation.
    // Both stay reachable: example, then example-1.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'),
      GUIDE_MD + '\n## One\n\n#### Example\n\n## Two\n\n#### Example\n\n[a](#example) [b](#example-1)\n')
    const res = await buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' })
    expect(res.ids.has('example')).toBe(true)
    expect(res.ids.has('example-1')).toBe(true)
  })

  it('gives a punctuation- or emoji-only heading a positional id', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'), GUIDE_MD + '\n#### `&&`\n\n###### ✅\n')
    const res = await buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' })
    expect([...res.ids].some((id) => /^section-\d+$/.test(id))).toBe(true)
  })

  it('keeps non-ASCII letters in an id, so the natural anchor resolves', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'), GUIDE_MD + '\n## Überblick\n\n[a](#überblick)\n')
    const res = await buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' })
    expect(res.ids.has('überblick')).toBe(true)
  })

  it('turns an underscore into a hyphen, as \\w did before the unicode class', async () => {
    // "### Stable identity (`finding_key`)" must stay stable-identity-finding-key.
    // A unicode class without `_` renamed it to …-findingkey and broke a live
    // cross-guide link — caught by the real build, not by the unit tests.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.md'),
      GUIDE_MD + '\n### Stable identity (`finding_key`)\n\n[a](#stable-identity-finding-key)\n')
    const res = await buildGuide({ guideDir: dir, css: CSS, mermaidRender: async () => '' })
    expect(res.ids.has('stable-identity-finding-key')).toBe(true)
  })

  it('deferWrite returns the html and leaves an existing index.html alone', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-'))
    const dir = path.join(root, 'mmr')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'index.html'), 'SENTINEL')
    fs.writeFileSync(path.join(dir, 'index.md'), GUIDE_MD)
    const res = await buildGuide({
      guideDir: dir, css: CSS, mermaidRender: async () => '', deferWrite: true,
    })
    expect(res.pending?.html).toContain('<title>MMR</title>')
    expect(res.pending?.outPath).toBe(path.join(dir, 'index.html'))
    expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toBe('SENTINEL')
  })
})

describe('buildAllGuides (the two-phase render/validate/write path)', () => {
  /** A temp dir that resolveContentDir will accept as the scaffold package root. */
  function guidesRoot(guides: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gall-'))
    const own = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'),
    ) as { name: string }
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: own.name }))
    for (const [topic, body] of Object.entries(guides)) {
      const dir = path.join(root, 'content', 'guides', topic)
      fs.mkdirSync(dir, { recursive: true })
      const fm = `---\ntitle: ${topic}\ntopic: ${topic}\ndescription: d\ncategory: c\norder: 1\n---\n\n`
      fs.writeFileSync(path.join(dir, 'index.md'), fm + body)
      fs.writeFileSync(path.join(dir, 'index.html'), `SENTINEL-${topic}`)
    }
    return root
  }
  const page = (root: string, topic: string): string =>
    fs.readFileSync(path.join(root, 'content', 'guides', topic, 'index.html'), 'utf8')

  it('writes every guide page and the root index on success', async () => {
    const root = guidesRoot({ a: '## Setup\n\n[m](../b/index.md#channels)\n', b: '## Channels\n' })
    await buildAllGuides(root)
    expect(page(root, 'a')).toContain('<title>a</title>')
    expect(page(root, 'b')).toContain('<title>b</title>')
    expect(fs.existsSync(path.join(root, 'content', 'guides', 'index.html'))).toBe(true)
  })

  it('rejects a broken cross-guide anchor and writes NOTHING', async () => {
    // This is the property deferWrite exists for: the break is only visible
    // after every guide has rendered, so without buffering both pages would
    // already be on disk by the time it is found.
    const root = guidesRoot({ a: '## Setup\n\n[m](../b/index.md#nope)\n', b: '## Channels\n' })
    await expect(buildAllGuides(root)).rejects.toThrow(/cross-guide anchor/i)
    expect(page(root, 'a')).toBe('SENTINEL-a')
    expect(page(root, 'b')).toBe('SENTINEL-b')
    expect(fs.existsSync(path.join(root, 'content', 'guides', 'index.html'))).toBe(false)
  })

  it('rejects a broken same-page anchor before any page is written', async () => {
    const root = guidesRoot({ a: '## Setup\n\n[x](#nope)\n', b: '## Channels\n' })
    await expect(buildAllGuides(root)).rejects.toThrow(/broken anchor link/i)
    expect(page(root, 'a')).toBe('SENTINEL-a')
  })
})

describe('crossGuideAnchorErrors', () => {
  const ids = new Map<string, ReadonlySet<string>>([
    ['cli', new Set(['setup'])],
    ['mmr', new Set(['channels'])],
  ])

  it('reports a fragment missing from the target guide, naming the source', () => {
    const sources = new Map([['cli', 'See [m](../mmr/index.md#nope).']])
    expect(crossGuideAnchorErrors(sources, ids)).toEqual(['cli: ../mmr/index.md#nope'])
  })

  it('passes a fragment the target guide really has', () => {
    const sources = new Map([['cli', 'See [m](../mmr/index.md#channels).']])
    expect(crossGuideAnchorErrors(sources, ids)).toEqual([])
  })

  it('does not re-report same-page anchors, which buildGuide already checked', () => {
    const sources = new Map([['cli', '[a](#setup)']])
    expect(crossGuideAnchorErrors(sources, ids)).toEqual([])
  })

  it('keys on the topic, so ../<dir>/ resolves to that guide', () => {
    // buildGuidesIndex guarantees frontmatter.topic === directory name
    // (pinned in loader.test.ts), which is what makes this keying sound.
    const sources = new Map([['mmr', '[c](../cli/index.md#setup) [d](../cli/index.md#gone)']])
    expect(crossGuideAnchorErrors(sources, ids)).toEqual(['mmr: ../cli/index.md#gone'])
  })
})

describe('renderIndexPage', () => {
  it('lists guides by order with links', () => {
    const html = renderIndexPage([
      /* eslint-disable @typescript-eslint/no-explicit-any */
      ({ topic: 'mmr', frontmatter: {
        title: 'MMR', topic: 'mmr', description: 'review', category: 'tools', order: 10,
      } }) as any,
      /* eslint-enable @typescript-eslint/no-explicit-any */
    ], CSS)
    expect(html).toContain('href="mmr/index.html"')
    expect(html).toContain('MMR')
    expect(html).toContain('review')
  })

  it('groups guides into ordered category card sections', () => {
    const html = renderIndexPage([
      /* eslint-disable @typescript-eslint/no-explicit-any */
      ({ topic: 'cli', frontmatter: {
        title: 'CLI', topic: 'cli', description: 'commands', category: 'reference', order: 20,
      } }) as any,
      ({ topic: 'pipeline', frontmatter: {
        title: 'Pipeline', topic: 'pipeline', description: 'the pipeline', category: 'concepts', order: 10,
      } }) as any,
      /* eslint-enable @typescript-eslint/no-explicit-any */
    ], CSS)
    // category section headings (ids derived by catId) + labels
    expect(html).toContain('id="cat-concepts"')
    expect(html).toContain('id="cat-reference"')
    expect(html).toContain('>Concepts<')
    expect(html).toContain('>Reference<')
    // card markup, not a bare list
    expect(html).toContain('class="guide-card" href="pipeline/index.html"')
    expect(html).toContain('class="guide-card-title"')
    // CATEGORY_ORDER puts concepts before reference regardless of input order
    expect(html.indexOf('cat-concepts')).toBeLessThan(html.indexOf('cat-reference'))
  })

  it('appends unknown categories after the known ones with a capitalized label', () => {
    const html = renderIndexPage([
      /* eslint-disable @typescript-eslint/no-explicit-any */
      ({ topic: 'odd', frontmatter: {
        title: 'Odd', topic: 'odd', description: 'misc', category: 'experimental', order: 5,
      } }) as any,
      ({ topic: 'cli', frontmatter: {
        title: 'CLI', topic: 'cli', description: 'commands', category: 'reference', order: 20,
      } }) as any,
      /* eslint-enable @typescript-eslint/no-explicit-any */
    ], CSS)
    // Unknown 'experimental' category gets a capitalized label and an id…
    expect(html).toContain('id="cat-experimental"')
    expect(html).toContain('>Experimental<')
    // …and sorts AFTER the known 'reference' category despite a lower order
    expect(html.indexOf('cat-reference')).toBeLessThan(html.indexOf('cat-experimental'))
  })

  it('escapes < and & in frontmatter fields', () => {
    const html = renderIndexPage([
      /* eslint-disable @typescript-eslint/no-explicit-any */
      ({ topic: 'x', frontmatter: {
        title: 'A & B', topic: 'x', description: '<script>x</script>', category: 'c', order: 1,
      } }) as any,
      /* eslint-enable @typescript-eslint/no-explicit-any */
    ], ':root{}')
    expect(html).toContain('A &amp; B')
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
