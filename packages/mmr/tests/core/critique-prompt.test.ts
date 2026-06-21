import { describe, expect, it } from 'vitest'
import { assembleCritiquePrompt } from '../../src/core/critique-prompt.js'

describe('assembleCritiquePrompt', () => {
  it('frames a design critique, not a code review', () => {
    const prompt = assembleCritiquePrompt({ artifact: 'design X' })
    expect(prompt.toLowerCase()).toContain('critique')
    expect(prompt.toLowerCase()).toContain('alternative')
    // the JSON output contract is present
    expect(prompt).toMatch(/"items"/)
    expect(prompt).toMatch(/concern|consideration|open-question/)
  })

  it('embeds the artifact last, fenced', () => {
    const prompt = assembleCritiquePrompt({ artifact: 'POLL every 30s' })
    expect(prompt).toContain('POLL every 30s')
    // artifact appears after the instructions
    expect(prompt.indexOf('POLL every 30s')).toBeGreaterThan(prompt.indexOf('items'))
  })

  it('includes a focus block when provided', () => {
    const prompt = assembleCritiquePrompt({ artifact: 'a', focus: 'scaling to 1M users' })
    expect(prompt).toContain('scaling to 1M users')
  })

  it('uses a longer fence when the artifact contains triple backticks', () => {
    const artifact = 'Design:\n```ts\nconst x = 1\n```\nmore text'
    const prompt = assembleCritiquePrompt({ artifact })
    // the inner ``` must survive intact (the wrapping fence is longer)
    expect(prompt).toContain('```ts')
    expect(prompt).toContain('````') // a 4-backtick wrapping fence
  })

  it('places repo context before the artifact when provided', () => {
    const prompt = assembleCritiquePrompt({
      artifact: 'THE-DESIGN-BODY', repoContext: 'REPO-CONTEXT-BLOB',
    })
    expect(prompt).toContain('Repository context')
    expect(prompt).toContain('REPO-CONTEXT-BLOB')
    expect(prompt.indexOf('REPO-CONTEXT-BLOB')).toBeLessThan(prompt.indexOf('THE-DESIGN-BODY'))
  })

  it('applies a prompt wrapper', () => {
    const prompt = assembleCritiquePrompt({ artifact: 'a', promptWrapper: 'BEGIN {{prompt}} END' })
    expect(prompt.startsWith('BEGIN ')).toBe(true)
    expect(prompt.endsWith(' END')).toBe(true)
  })
})
