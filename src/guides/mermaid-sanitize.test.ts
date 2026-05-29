import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderGuideBody } from './render.js'
import { remarkMermaid } from './mermaid.js'

describe('mermaid SVG through full render pipeline', () => {
  it('keeps <rect> and <svg> but strips <script> (double-defence: sanitizeSvg + rehype-sanitize)', async () => {
    // Stub renderer returns SVG that contains a script tag (to prove double-defence).
    const stubbedRender = async (_source: string) =>
      '<svg viewBox="0 0 100 50"><rect x="0" y="0" width="100" height="50"/><script>evil()</script></svg>'

    const md = '```mermaid\nflowchart LR\nA-->B\n```\n'

    // remarkMermaid needs a guideDir for cache. We pass the stub renderer so no browser is involved.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-san-'))

    const { body } = await renderGuideBody(md, {
      plugins: [remarkMermaid({ guideDir: dir, render: stubbedRender })],
    })

    // SVG structural tags must survive rehype-sanitize
    expect(body).toContain('<svg')
    expect(body).toContain('<rect')
    // <script> must be stripped — sanitizeSvg removes it before rehype-sanitize sees it,
    // and rehype-sanitize would strip any that somehow slipped through.
    expect(body).not.toContain('<script')
    expect(body).not.toContain('evil()')
    // figure wrapper must survive
    expect(body).toContain('class="mermaid"')
  })

  it('preserves mermaid arrowhead structure (marker/use/marker-end) through sanitize', async () => {
    // Realistic mermaid-style SVG with arrowhead wiring: <defs><marker …>, marker-end="url(#id)", <use href="#id">
    const stubbedRender = async (_source: string) =>
      '<svg viewBox="0 0 100 50">' +
      '<defs>' +
      '<marker id="arrow" markerWidth="10" markerHeight="10" orient="auto" refX="5" refY="5">' +
      '<path d="M0,0 L10,5 L0,10 z"/>' +
      '</marker>' +
      '</defs>' +
      '<path d="M0,25 L90,25" marker-end="url(#arrow)" stroke="black"/>' +
      '<use href="#arrow"/>' +
      '</svg>'

    const md = '```mermaid\nflowchart LR\nA-->B\n```\n'
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-arrow-'))

    const { body } = await renderGuideBody(md, {
      plugins: [remarkMermaid({ guideDir: dir, render: stubbedRender })],
    })

    // <marker> element and its key attributes must survive
    expect(body).toContain('<marker')
    expect(body).toContain('id="arrow"')
    expect(body).toContain('orient="auto"')

    // marker-end attribute wiring the path to the marker must survive
    // hast/rehype-stringify preserves SVG presentation attributes in their original hyphenated form
    expect(body).toContain('marker-end="url(#arrow)"')

    // <use> element referencing the marker must survive
    expect(body).toContain('<use')
    expect(body).toContain('href="#arrow"')

    // The path element itself must survive
    expect(body).toContain('<path')
  })
})
