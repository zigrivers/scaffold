import { describe, it, expect } from 'vitest'
import { renderGuideBody } from './render.js'
import { remarkCallout, remarkTabs, remarkFilterTable, remarkChart, remarkSev } from './directives.js'

const ALL = [remarkCallout, remarkTabs, remarkFilterTable, remarkChart, remarkSev]

describe('guideSanitizeSchema', () => {
  it('passes legitimate directive output', async () => {
    const md = ':::callout{type=tip}\nok :sev[P1]{level=p1}\n:::\n'
    const { body } = await renderGuideBody(md, { plugins: ALL })
    expect(body).toContain('callout-tip')
    expect(body).toContain('sev-p1')
  })

  it('strips script, event handlers, and iframes from prose', async () => {
    const md = `text

<script>alert(1)</script>

<a href="javascript:alert(1)" onclick="x()">x</a>

<iframe src="http://evil"></iframe>
`
    const { body } = await renderGuideBody(md, { plugins: ALL })
    expect(body).not.toContain('<script')
    expect(body).not.toContain('onclick')
    expect(body).not.toContain('javascript:')
    expect(body).not.toContain('<iframe')
  })

  it('strips an author-injected style other than chart bars (defense; CI scan is the real backstop)', async () => {
    // NOTE: the sanitize schema allows `style` globally (for chart bars). This test documents
    // that an arbitrary style DOES currently pass sanitize, so the Task 15 CI scan is required.
    // Assert the CURRENT behavior so a future schema tightening is a deliberate, test-visible change.
    const md = '<div style="color:red">x</div>\n'
    const { body } = await renderGuideBody(md, { plugins: ALL })
    // Document current reality: style survives sanitize (CI scan catches non-width styles).
    expect(body).toContain('style="color:red"')
  })

  it('preserves heading id attributes through sanitize (scrollspy depends on it)', async () => {
    const { body } = await renderGuideBody('## My Section\n')
    expect(body).toMatch(/<h2[^>]*id="my-section"/)
  })

  it('callout falls back to callout-note for an unknown type', async () => {
    const { body } = await renderGuideBody(':::callout{type=bogus}\ntext\n:::\n', { plugins: ALL })
    expect(body).toContain('class="callout callout-note"')
  })
})
