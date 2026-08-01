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

  // The severity rubric below is the highest-blast-radius text in the package:
  // every channel and every consuming project reads it on every review. These
  // pin the properties it must keep, so a future edit cannot quietly drop one.
  describe('severity rubric', () => {
    it('gives every level a worth-fixing-now test, not only an impact test', () => {
      const prompt = assemblePrompt({ diff: 'test' })
      // Four levels, four tests — an edit that adds a level or drops a test fails here.
      expect(prompt.match(/\*Worth fixing now:\*/g) ?? []).toHaveLength(4)
    })

    it('exempts security, data-loss and data-corruption from the worth-fixing-now test', () => {
      // Without this, the worth-fixing-now test becomes a downgrade path for
      // exactly the findings a review exists to catch.
      const prompt = assemblePrompt({ diff: 'test' })
      expect(prompt).toMatch(/Never lower a security, data-loss, or data-corruption finding/)
      expect(prompt).toMatch(/graded on impact alone/)
    })

    it('requires a named path before reporting an unhandled input or state', () => {
      const prompt = assemblePrompt({ diff: 'test' })
      expect(prompt).toContain('## Reporting Bar')
      expect(prompt).toMatch(/name the caller, flag, config\s+value, or documented contract/)
      expect(prompt).toMatch(/do not report it/)
    })

    it('exempts trust boundaries from the reporting bar', () => {
      // A repository contains no caller for a hostile HTTP request, so an
      // unqualified reachability bar would suppress the highest-value findings.
      const prompt = assemblePrompt({ diff: 'test' })
      expect(prompt).toMatch(/does \*\*not\*\* apply at a trust boundary/)
      for (const surface of ['public API', 'CLI argument', 'HTTP handler', 'deserializer']) {
        expect(prompt).toContain(surface)
      }
      expect(prompt).toMatch(/reachable by definition/)
    })

    it('asks what is unnecessary, not only what is missing', () => {
      const prompt = assemblePrompt({ diff: 'test' })
      expect(prompt).toContain('Unnecessary code')
      expect(prompt).toMatch(/Say what to delete/)
    })

    it('keeps the four severity tokens the gate depends on', () => {
      // reconciler/gate logic keys off these exact strings; renaming a level
      // would silently detach findings from the threshold.
      const prompt = assemblePrompt({ diff: 'test' })
      for (const level of ['P0', 'P1', 'P2', 'P3']) {
        expect(prompt).toContain(`- ${level} (`)
      }
    })
  })
})
