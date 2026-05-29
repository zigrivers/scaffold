import { describe, it, expect } from 'vitest'
import { renderGuideBody } from './render.js'
import { remarkCallout } from './directives.js'

describe('remarkCallout', () => {
  it('renders a container directive as a typed callout div', async () => {
    const md = ':::callout{type=warning}\nBe careful **here**.\n:::\n'
    const { body } = await renderGuideBody(md, { plugins: [remarkCallout] })
    expect(body).toContain('class="callout callout-warning"')
    expect(body).toContain('<strong>here</strong>')
  })

  it('defaults to type=note when no type given', async () => {
    const { body } = await renderGuideBody(':::callout\ntext\n:::\n', { plugins: [remarkCallout] })
    expect(body).toContain('class="callout callout-note"')
  })
})
