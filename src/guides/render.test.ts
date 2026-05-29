import { describe, it, expect } from 'vitest'
import { renderGuideBody } from './render.js'

describe('renderGuideBody', () => {
  it('renders headings, paragraphs, and a GFM table; strips frontmatter', async () => {
    const md = `---\ntitle: T\ntopic: t\ndescription: d\ncategory: c\norder: 1\n---\n\n## Section One\n\nHello **world**.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n`
    const { body, headings } = await renderGuideBody(md)
    expect(body).toContain('<h2')
    expect(body).toContain('Section One')
    expect(body).toContain('<table>')
    expect(body).not.toContain('title: T')
    expect(headings).toEqual([{ depth: 2, text: 'Section One', id: 'section-one' }])
  })

  it('strips a raw <script> tag in prose', async () => {
    const { body } = await renderGuideBody('Hi\n\n<script>alert(1)</script>\n')
    expect(body).not.toContain('<script>')
  })

  it('gives h2/h3 stable slug ids', async () => {
    const { headings } = await renderGuideBody('## Foo Bar\n\n### Baz Qux\n')
    expect(headings).toEqual([
      { depth: 2, text: 'Foo Bar', id: 'foo-bar' },
      { depth: 3, text: 'Baz Qux', id: 'baz-qux' },
    ])
  })

  it('strips frontmatter whose closing delimiter has trailing whitespace', async () => {
    const md = '---\ntitle: Leaky\n---  \n\n## Body\n'
    const { body } = await renderGuideBody(md)
    expect(body).not.toContain('title:')
    expect(body).toContain('Body')
  })
})
