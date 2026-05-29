import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { sanitizeSvg, resolveDiagram, computeFingerprint } from './mermaid.js'

describe('sanitizeSvg', () => {
  it('strips script, foreignObject, on* and javascript hrefs', () => {
    const dirty = `<svg><script>x()</script><foreignObject></foreignObject><a xlink:href="javascript:x()" onclick="y()"><rect/></a></svg>`
    const clean = sanitizeSvg(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('foreignObject')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('javascript:')
    expect(clean).toContain('<rect')
  })
})

describe('resolveDiagram', () => {
  it('renders on a cache miss and writes the SVG + manifest', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-'))
    const render = vi.fn(async () => '<svg><rect/></svg>')
    const svg = await resolveDiagram({ guideDir: dir, diagramId: 'd0', source: 'flowchart LR\nA-->B', render })
    expect(render).toHaveBeenCalledTimes(1)
    expect(svg).toContain('<rect')
    expect(fs.existsSync(path.join(dir, '.diagrams', 'd0.svg'))).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.diagrams', 'manifest.json'), 'utf8'))
    expect(manifest.d0).toBe(computeFingerprint('flowchart LR\nA-->B'))
  })

  it('uses cache on a hit (no render call)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-'))
    const render = vi.fn(async () => '<svg><rect/></svg>')
    await resolveDiagram({ guideDir: dir, diagramId: 'd0', source: 'X', render })
    render.mockClear()
    const svg = await resolveDiagram({ guideDir: dir, diagramId: 'd0', source: 'X', render })
    expect(render).not.toHaveBeenCalled()
    expect(svg).toContain('<rect')
  })
})
