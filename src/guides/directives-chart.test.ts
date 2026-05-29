import { describe, it, expect } from 'vitest'
import { renderGuideBody } from './render.js'
import { remarkChart } from './directives.js'

describe('remarkChart', () => {
  it('renders static bars from the following table and keeps the table', async () => {
    const md = ':::chart{type=bar}\n\n| Host | Count |\n|---|---|\n| github.com | 40 |\n| npmjs.com | 10 |\n:::\n'
    const { body } = await renderGuideBody(md, { plugins: [remarkChart] })
    expect(body).toContain('class="chart chart-bar"')
    expect(body).toContain('width:100%')
    expect(body).toContain('width:25%')
    expect(body).toContain('aria-label="github.com: 40"')
    expect(body).toContain('<table>')
  })

  it('fails the build when not followed by a table', async () => {
    await expect(
      renderGuideBody(':::chart{type=bar}\nno table\n:::\n', { plugins: [remarkChart] }),
    ).rejects.toThrow(/chart.*table/i)
  })
})
