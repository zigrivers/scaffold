import { describe, it, expect } from 'vitest'
import { lintUnsourcedClaims, parseUnifiedDiff } from './lint-unsourced.js'

const fmWithSource = [
  '---',
  'name: x',
  'sources:',
  '  - url: https://owasp.org/Top10/',
  '---',
].join('\n')

describe('lintUnsourcedClaims', () => {
  it('flags normative claims with no nearby source link', () => {
    const content = `${fmWithSource}\n## Body\nYou must use bcrypt cost 12.\n`
    const findings = lintUnsourcedClaims([
      { file: 'x.md', content, addedLines: [{ line: 7, text: 'You must use bcrypt cost 12.' }] },
    ])
    expect(findings).toHaveLength(1)
    expect(findings[0].reason).toMatch(/no link/)
  })

  it('does not flag claims with a nearby source link', () => {
    const content = `${fmWithSource}
## Body
You must use bcrypt cost 12.
See [OWASP](https://owasp.org/Top10/).
`
    const findings = lintUnsourcedClaims([
      { file: 'x.md', content, addedLines: [{ line: 7, text: 'You must use bcrypt cost 12.' }] },
    ])
    expect(findings).toHaveLength(0)
  })

  it('does not flag non-normative additions', () => {
    const content = `${fmWithSource}\n## Body\nThis section covers passwords.\n`
    const findings = lintUnsourcedClaims([
      { file: 'x.md', content, addedLines: [{ line: 7, text: 'This section covers passwords.' }] },
    ])
    expect(findings).toHaveLength(0)
  })
})

describe('parseUnifiedDiff', () => {
  it('extracts added lines from a unified diff for knowledge files', () => {
    const diff = [
      'diff --git a/content/knowledge/x/y.md b/content/knowledge/x/y.md',
      'index abc..def 100644',
      '--- a/content/knowledge/x/y.md',
      '+++ b/content/knowledge/x/y.md',
      '@@ -1,3 +1,4 @@',
      ' line one',
      '+new line two',
      ' line three',
      '+new line four',
    ].join('\n')
    const out = parseUnifiedDiff(diff)
    expect(out).toHaveLength(1)
    expect(out[0].file).toBe('content/knowledge/x/y.md')
    expect(out[0].addedLines.map((l) => l.text)).toEqual(['new line two', 'new line four'])
  })

  it('ignores non-knowledge files', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,1 +1,2 @@',
      ' x',
      '+y',
    ].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([])
  })
})
