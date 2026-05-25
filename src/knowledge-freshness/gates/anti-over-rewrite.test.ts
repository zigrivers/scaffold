import { describe, it, expect } from 'vitest'
import { evaluateChurn, parseUnifiedDiffForChurn } from './anti-over-rewrite.js'

function makeContent(volatility: string, bodyLines: number): string {
  const body = Array.from({ length: bodyLines }, (_, i) => `body line ${i + 1}`).join('\n')
  return `---\nname: x\nvolatility: ${volatility}\n---\n${body}\n`
}

describe('evaluateChurn', () => {
  it('blocks a stable entry with >20% churn and no override', () => {
    const content = makeContent('stable', 100)
    // 100 body lines + frontmatter ≈ 105 total. 30 churn → 28%.
    const out = evaluateChurn([
      { file: 'x.md', content, addedCount: 15, removedCount: 15 },
    ])
    expect(out[0].blocking).toBe(true)
  })

  it('does not block when maintainer applied the override label', () => {
    const content = makeContent('stable', 100)
    const out = evaluateChurn(
      [{ file: 'x.md', content, addedCount: 15, removedCount: 15 }],
      { prLabels: ['knowledge-freshness', 'override:anti-over-rewrite'] },
    )
    expect(out[0].blocking).toBe(false)
    expect(out[0].overridden).toBe(true)
  })

  it('DOES still block when only a PR-body marker is present (no label)', () => {
    // F-005: the gate explicitly does not honor PR-body markers, which a
    // prompt-injected source body could plant. Only the maintainer-applied
    // label is trusted.
    const content = makeContent('stable', 100)
    const out = evaluateChurn(
      [{ file: 'x.md', content, addedCount: 15, removedCount: 15 }],
      { prLabels: [] },
    )
    expect(out[0].blocking).toBe(true)
    expect(out[0].overridden).toBe(false)
  })

  it('does not block evolving entries even at high churn', () => {
    const content = makeContent('evolving', 100)
    const out = evaluateChurn([
      { file: 'x.md', content, addedCount: 40, removedCount: 40 },
    ])
    expect(out[0].blocking).toBe(false)
  })

  it('passes stable entries under threshold', () => {
    const content = makeContent('stable', 100)
    const out = evaluateChurn([
      { file: 'x.md', content, addedCount: 5, removedCount: 5 },
    ])
    expect(out[0].blocking).toBe(false)
  })
})

describe('parseUnifiedDiffForChurn', () => {
  it('counts adds and removes per knowledge file', () => {
    const diff = [
      'diff --git a/content/knowledge/x/y.md b/content/knowledge/x/y.md',
      '--- a/content/knowledge/x/y.md',
      '+++ b/content/knowledge/x/y.md',
      '@@ -1,3 +1,3 @@',
      '-old',
      '+new',
      ' same',
      '-gone',
      '+came',
    ].join('\n')
    const out = parseUnifiedDiffForChurn(diff)
    expect(out).toEqual([{ file: 'content/knowledge/x/y.md', addedCount: 2, removedCount: 2 }])
  })
})
