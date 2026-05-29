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
})
