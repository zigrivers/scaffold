import { describe, it, expect } from 'vitest'
import { renderGuideBody } from './render.js'
import { remarkTabs } from './directives.js'

describe('remarkTabs', () => {
  it('renders a tab group with buttons and panes', async () => {
    const md = `:::tabs\n\n:::tab{title="Codex"}\nCodex body\n:::\n\n:::tab{title="Gemini"}\nGemini body\n:::\n\n:::\n`
    const { body } = await renderGuideBody(md, { plugins: [remarkTabs] })
    expect(body).toContain('class="tabs"')
    expect(body).toContain('role="tab"')
    expect(body).toContain('data-tab="0"')
    expect(body).toContain('data-tab="1"')
    expect(body).toContain('Codex')
    expect(body).toContain('Codex body')
    expect(body).toContain('class="tabpane')
  })
})
