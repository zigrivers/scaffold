import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { sanitizeSvg, resolveDiagram, computeFingerprint, pruneDiagrams, remarkMermaid } from './mermaid.js'
import { renderGuideBody } from './render.js'

describe('sanitizeSvg', () => {
  it('strips script, foreignObject, on* and javascript hrefs', () => {
    const dirty =
      '<svg><script>x()</script><foreignObject></foreignObject>' +
      '<a xlink:href="javascript:x()" onclick="y()"><rect/></a></svg>'
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

describe('pruneDiagrams', () => {
  it('removes unlisted SVGs and drops their manifest entries, keeping listed ones', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-prune-'))
    const cacheDir = path.join(dir, '.diagrams')
    fs.mkdirSync(cacheDir)
    fs.writeFileSync(path.join(cacheDir, 'keep.svg'), '<svg/>')
    fs.writeFileSync(path.join(cacheDir, 'drop.svg'), '<svg/>')
    fs.writeFileSync(
      path.join(cacheDir, 'manifest.json'),
      JSON.stringify({ keep: 'fp-keep', drop: 'fp-drop' }, null, 2) + '\n',
    )

    pruneDiagrams(dir, ['keep'])

    expect(fs.existsSync(path.join(cacheDir, 'keep.svg'))).toBe(true)
    expect(fs.existsSync(path.join(cacheDir, 'drop.svg'))).toBe(false)

    const manifest = JSON.parse(fs.readFileSync(path.join(cacheDir, 'manifest.json'), 'utf8'))
    expect(manifest).toEqual({ keep: 'fp-keep' })
  })

  it('self-heals a corrupt manifest (writes a pruned-empty manifest)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-prune-corrupt-'))
    const cacheDir = path.join(dir, '.diagrams')
    fs.mkdirSync(cacheDir)
    fs.writeFileSync(path.join(cacheDir, 'drop.svg'), '<svg/>')
    fs.writeFileSync(path.join(cacheDir, 'manifest.json'), '{bad json}')

    // Should not throw; drop.svg removed; manifest rewritten as {}
    expect(() => pruneDiagrams(dir, [])).not.toThrow()
    expect(fs.existsSync(path.join(cacheDir, 'drop.svg'))).toBe(false)
    const manifest = JSON.parse(fs.readFileSync(path.join(cacheDir, 'manifest.json'), 'utf8'))
    expect(manifest).toEqual({})
  })
})

describe('remarkMermaid — sequential manifest writes', () => {
  it('resolves two mermaid blocks and writes both entries to the manifest', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-seq-'))
    let callCount = 0
    const render = vi.fn(async () => {
      callCount++
      return `<svg><rect id="r${callCount}"/></svg>`
    })

    const md = [
      '```mermaid',
      'flowchart LR\nA-->B',
      '```',
      '',
      '```mermaid',
      'flowchart LR\nC-->D',
      '```',
    ].join('\n') + '\n'

    const plugin = remarkMermaid({ guideDir: dir, render })
    const { body } = await renderGuideBody(md, { plugins: [plugin] })

    // Both diagrams rendered and inlined
    expect(body).toContain('class="mermaid"')
    expect(render).toHaveBeenCalledTimes(2)

    // Both entries written to the manifest (no clobber from race)
    const manifestPath = path.join(dir, '.diagrams', 'manifest.json')
    expect(fs.existsSync(manifestPath)).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    expect(Object.keys(manifest)).toContain('diagram-0')
    expect(Object.keys(manifest)).toContain('diagram-1')
  })
})
