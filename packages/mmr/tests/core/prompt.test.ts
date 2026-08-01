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

  describe('product stage', () => {
    it('leaves the prompt byte-identical when no stage is set', () => {
      // The guarantee every existing project depends on: opting into nothing
      // changes nothing. The marker and the blank line it sits on both vanish.
      const withoutStage = assemblePrompt({ diff: 'd' })
      expect(withoutStage).not.toContain('{{stage_calibration}}')
      expect(withoutStage).not.toContain('Stage:')
      // No blank-line scar where the marker was.
      expect(withoutStage).not.toMatch(/impact alone\.\n\n\n/)
      expect(assemblePrompt({ diff: 'd', stage: undefined })).toBe(withoutStage)
    })

    it('substitutes calibration INTO the severity section, not after the criteria', () => {
      // Appending advice at the end leaves it competing with the rubric; the
      // point of a stage is to change the definitions themselves.
      const prompt = assemblePrompt({ diff: 'd', stage: 'mvp' })
      const severityIdx = prompt.indexOf('## Severity Definitions')
      const stageIdx = prompt.indexOf('Stage: MVP')
      const criteriaIdx = prompt.indexOf('## Review Criteria')
      expect(stageIdx).toBeGreaterThan(severityIdx)
      expect(stageIdx).toBeLessThan(criteriaIdx)
      expect(prompt).not.toContain('{{stage_calibration}}')
    })

    it('changes what counts as P1 versus P2 across stages', () => {
      // Not merely different prose: the same class of finding lands at a
      // different level in each preset.
      const proto = assemblePrompt({ diff: 'd', stage: 'prototype' })
      const prod = assemblePrompt({ diff: 'd', stage: 'production' })
      expect(proto).toMatch(/Missing tests are P3/)
      expect(prod).toMatch(/Missing tests for changed behavior are P1/)
      expect(proto).toMatch(/A bug on a path nobody exercises yet is P3/)
      expect(prod).toMatch(/A rare but reachable failure in a user-facing path is P1/)
    })

    it('never lets a stage soften security, data loss, or data corruption', () => {
      // prototype is the stage most likely to be set on the codebase least able
      // to absorb a vulnerability, so the floor is asserted on every preset that
      // relaxes anything.
      for (const stage of ['prototype', 'mvp'] as const) {
        const prompt = assemblePrompt({ diff: 'd', stage })
        expect(prompt, `${stage} must state the floor`)
          .toMatch(/Unchanged at this stage: security, data loss, and data corruption/)
      }
      // The rubric's own floor survives in every case, stage or not.
      for (const stage of [undefined, 'prototype', 'mvp', 'production'] as const) {
        expect(assemblePrompt({ diff: 'd', stage }))
          .toMatch(/Never lower a security, data-loss, or data-corruption finding/)
      }
    })

    it('keeps the diff last whatever the stage', () => {
      const prompt = assemblePrompt({ diff: 'THE_DIFF', stage: 'production' })
      expect(prompt.indexOf('THE_DIFF')).toBeGreaterThan(prompt.indexOf('Stage: PRODUCTION'))
    })
  })

  // The severity rubric below is the highest-blast-radius text in the package:
  // every channel and every consuming project reads it on every review. These
  // pin the properties it must keep, so a future edit cannot quietly drop one.
  describe('severity rubric', () => {
    it('gives every level a worth-fixing-now test, not only an impact test', () => {
      const prompt = assemblePrompt({ diff: 'test' })
      // Per level, not a global count: four markers bunched under one level
      // would satisfy a total and leave three levels without the test.
      for (const level of ['P0', 'P1', 'P2', 'P3']) {
        const section = prompt.slice(prompt.indexOf(`- ${level} (`))
        const nextLevel = section.slice(1).search(/\n- P[0-3] \(/)
        const own = nextLevel === -1 ? section : section.slice(0, nextLevel + 1)
        expect(own.match(/\*Worth fixing now:\*/g) ?? [],
          `${level} must carry exactly one worth-fixing-now test`).toHaveLength(1)
      }
    })

    it('separates P0 from P1 by blast radius, not by whether something breaks', () => {
      // Both levels answer "yes" to worth-fixing-now, so the deciding test
      // cannot resolve them — the impact wording has to.
      const prompt = assemblePrompt({ diff: 'test' })
      expect(prompt).toMatch(/P0 \(Critical\): Catastrophic or systemic/)
      expect(prompt).toMatch(/P1 \(High\): An ordinary bug/)
      expect(prompt).toMatch(/separated by blast radius, not by whether something breaks/)
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
