import { describe, it, expect } from 'vitest'
import { renderGuideBody } from './render.js'
import { remarkFilterTable } from './directives.js'

describe('remarkFilterTable', () => {
  it('wraps a GFM table with a filter input and filterable container', async () => {
    const md = `:::filter-table\n\n| Flag | Description |\n|---|---|\n| --pr | PR number |\n| --staged | staged diff |\n:::\n`
    const { body } = await renderGuideBody(md, { plugins: [remarkFilterTable] })
    expect(body).toContain('class="filter-table"')
    expect(body).toContain('type="text"')
    expect(body).toContain('class="filter-input"')
    expect(body).toContain('<table>')
    expect(body).toContain('--staged')
  })
})
