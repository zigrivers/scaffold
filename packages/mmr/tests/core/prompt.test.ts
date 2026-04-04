import { describe, it, expect } from 'vitest'
import { assemblePrompt } from '../../src/core/prompt.js'

describe('assemblePrompt', () => {
  it('always includes severity definitions in core layer', () => {
    const prompt = assemblePrompt({ diff: 'some diff' })
    expect(prompt).toContain('P0 (Critical)')
    expect(prompt).toContain('P1 (High)')
    expect(prompt).toContain('P2 (Medium)')
    expect(prompt).toContain('P3 (Trivial)')
  })

  it('always includes JSON output format spec', () => {
    const prompt = assemblePrompt({ diff: 'some diff' })
    expect(prompt).toContain('"approved"')
    expect(prompt).toContain('"findings"')
    expect(prompt).toContain('"severity"')
  })

  it('appends project review criteria when provided', () => {
    const prompt = assemblePrompt({
      diff: 'some diff',
      reviewCriteria: ['Check HIPAA compliance', 'Verify parameterized queries'],
    })
    expect(prompt).toContain('Check HIPAA compliance')
    expect(prompt).toContain('Verify parameterized queries')
  })

  it('appends focus areas when provided', () => {
    const prompt = assemblePrompt({
      diff: 'some diff',
      focus: 'price consistency, closed-session date logic',
    })
    expect(prompt).toContain('price consistency, closed-session date logic')
  })

  it('includes the diff as the final layer', () => {
    const diff = '--- a/file.ts\n+++ b/file.ts\n@@ -1,3 +1,4 @@'
    const prompt = assemblePrompt({ diff })
    expect(prompt).toContain(diff)
    const severityIdx = prompt.indexOf('P0 (Critical)')
    const diffIdx = prompt.indexOf(diff)
    expect(diffIdx).toBeGreaterThan(severityIdx)
  })

  it('applies channel prompt wrapper', () => {
    const prompt = assemblePrompt({
      diff: 'some diff',
      promptWrapper: '{{prompt}}\nIMPORTANT: Return raw JSON only.',
    })
    expect(prompt).toContain('IMPORTANT: Return raw JSON only.')
  })

  it('core prompt includes instruction to not add preamble', () => {
    const prompt = assemblePrompt({ diff: 'test' })
    expect(prompt).toContain('Do NOT include markdown fences')
  })

  it('core prompt includes all review criteria categories', () => {
    const prompt = assemblePrompt({ diff: 'test' })
    expect(prompt).toContain('Correctness')
    expect(prompt).toContain('Regressions')
    expect(prompt).toContain('Edge cases')
    expect(prompt).toContain('Test coverage')
    expect(prompt).toContain('Security')
  })
})
