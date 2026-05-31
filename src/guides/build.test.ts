import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { buildGuide } from './build.js'
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
