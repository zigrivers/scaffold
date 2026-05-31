import { describe, it, expect } from 'vitest'
import { renderGuideBody } from './render.js'
import { remarkTabs } from './directives.js'

describe('remarkTabs', () => {
  it('preserves stray prose children inside a ::::tabs block', async () => {
    const md = [
      '::::tabs',
      '',
      ':::tab{title="One"}',
      'Tab body',
      ':::',
      '',
      'Stray paragraph inside tabs',
      '',
      '::::',
    ].join('\n') + '\n'
    const { body } = await renderGuideBody(md, { plugins: [remarkTabs] })
    expect(body).toContain('Tab body')
    expect(body).toContain('Stray paragraph inside tabs')
  })

  it('renders a tab group with buttons and panes', async () => {
    const md = [
      '::::tabs',
      '',
      ':::tab{title="Codex"}',
      'Codex body',
      ':::',
      '',
      ':::tab{title="Gemini"}',
      'Gemini body',
      ':::',
      '',
      '::::',
    ].join('\n') + '\n'
    const { body } = await renderGuideBody(md, { plugins: [remarkTabs] })
    // No stray delimiter paragraph
    expect(body).not.toContain('<p>:::')
    // Structure
    expect(body).toContain('class="tabs"')
    expect(body).toContain('role="tab"')
    expect(body).toContain('data-tab="0"')
    expect(body).toContain('data-tab="1"')
    // Both tab bodies present
    expect(body).toContain('Codex body')
    expect(body).toContain('Gemini body')
    // Exactly one active tab button
    expect(body.match(/tab-btn active/g)?.length).toBe(1)
    // First pane is active
    expect(body).toContain('class="tabpane active"')
  })

  it('emits a complete ARIA tabs pattern that survives sanitization', async () => {
    const md = [
      '::::tabs',
      '',
      ':::tab{title="A"}',
      'A body',
      ':::',
      '',
      ':::tab{title="B"}',
      'B body',
      ':::',
      '',
      '::::',
    ].join('\n') + '\n'
    const { body } = await renderGuideBody(md, { plugins: [remarkTabs] })
    // Buttons: role=tab, controls + selected + roving tabindex
    expect(body).toContain('role="tab"')
    expect(body).toContain('aria-controls="tabpane-0-0"')
    expect(body).toContain('aria-selected="true"')
    expect(body).toContain('aria-selected="false"')
    expect(body).toContain('tabindex="0"')
    expect(body).toContain('tabindex="-1"')
    // Panes: role=tabpanel + back-reference (the casing-sensitive one the
    // sanitize allowlist must match: ariaLabelledBy, not ariaLabelledby)
    expect(body).toContain('role="tabpanel"')
    expect(body).toContain('aria-labelledby="tab-0-0"')
    expect(body).toContain('id="tabpane-0-1"')
  })
})
