import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { findBrokenRelativeLinks } from './links.js'

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'glinks-'))
}

describe('findBrokenRelativeLinks (R2-9: inter-guide links must resolve)', () => {
  it('reports a relative link whose target is missing', () => {
    const dir = tmpdir()
    expect(findBrokenRelativeLinks('See [concepts](../concepts/index.md).', dir)).toEqual([
      '../concepts/index.md',
    ])
  })

  it('passes when the relative target exists', () => {
    const root = tmpdir()
    const dir = path.join(root, 'pipeline')
    fs.mkdirSync(dir)
    fs.mkdirSync(path.join(root, 'concepts'))
    fs.writeFileSync(path.join(root, 'concepts', 'index.md'), '# c')
    expect(findBrokenRelativeLinks('See [concepts](../concepts/index.md).', dir)).toEqual([])
  })

  it('accepts an index.html link when the index.md source exists (not yet built)', () => {
    const root = tmpdir()
    const dir = path.join(root, 'pipeline')
    fs.mkdirSync(dir)
    fs.mkdirSync(path.join(root, 'concepts'))
    fs.writeFileSync(path.join(root, 'concepts', 'index.md'), '# c')
    expect(findBrokenRelativeLinks('[c](../concepts/index.html)', dir)).toEqual([])
  })

  it('ignores external URLs, mailto, and pure anchors', () => {
    const dir = tmpdir()
    expect(
      findBrokenRelativeLinks('[e](https://x.com) [a](#sec) [m](mailto:x@y.com)', dir),
    ).toEqual([])
  })

  it('strips a trailing anchor before resolving', () => {
    const root = tmpdir()
    const dir = path.join(root, 'pipeline')
    fs.mkdirSync(dir)
    fs.mkdirSync(path.join(root, 'concepts'))
    fs.writeFileSync(path.join(root, 'concepts', 'index.md'), '# c')
    expect(findBrokenRelativeLinks('[c](../concepts/index.md#worktree)', dir)).toEqual([])
  })

  it('catches broken reference-style links (definitions)', () => {
    const dir = tmpdir()
    const md = 'See [concepts][c].\n\n[c]: ../concepts/index.md\n'
    expect(findBrokenRelativeLinks(md, dir)).toEqual(['../concepts/index.md'])
  })

  it('ignores links inside fenced code blocks', () => {
    const dir = tmpdir()
    const md = 'Example:\n\n```\n[x](../nope/index.md)\n```\n'
    expect(findBrokenRelativeLinks(md, dir)).toEqual([])
  })

  it('ignores link-like text inside frontmatter', () => {
    const dir = tmpdir()
    const md = '---\ntitle: T\ndescription: see [x](../nope/index.md)\n---\n\n# Body\n'
    expect(findBrokenRelativeLinks(md, dir)).toEqual([])
  })

  it('handles parentheses in the link target', () => {
    const root = tmpdir()
    const dir = path.join(root, 'g')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'file(1).md'), 'x')
    expect(findBrokenRelativeLinks('[x](<file(1).md>)', dir)).toEqual([])
  })

  it('decodes percent-encoded targets before resolving', () => {
    const dir = tmpdir()
    fs.writeFileSync(path.join(dir, 'with space.md'), 'x')
    expect(findBrokenRelativeLinks('[x](with%20space.md)', dir)).toEqual([])
  })
})
