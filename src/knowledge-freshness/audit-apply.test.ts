import { describe, it, expect } from 'vitest'
import { applyVerdictToEntry } from './audit-apply.js'

describe('applyVerdictToEntry', () => {
  const baseEntry = `---
name: x
description: y
topics: []
volatility: fast-moving
last-reviewed: null
sources:
  - url: https://x
    hash: 'old'
---

## Summary

## Deep Guidance

Old content.
`

  // Covers `baseEntry`'s single source so the round-2 F-002 guard (refuse to
  // advance last-reviewed when the verdict does not cover every declared
  // source) does not fire on tests that focus on heading or frontmatter
  // behavior rather than source-coverage behavior.
  const baseEntryChecked = [
    { url: 'https://x', retrieved_at: '2026-05-24', content_hash: 'sha256:new', summary: '' },
  ]

  it('updates last-reviewed to verdict.audit_date', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [], preserve_warnings: [],
    }
    const out = applyVerdictToEntry(baseEntry, verdict)
    // yaml.dump with JSON_SCHEMA emits the date unquoted (e.g. `last-reviewed: 2026-05-24`)
    // — match that, since JSON_SCHEMA is what audit-apply uses to avoid Date-coercion (F-001).
    expect(out).toContain('last-reviewed: 2026-05-24')
  })

  it('applies an insert kind by appending new text after the targeted section', () => {
    const entry = `---
name: x
description: y
topics: []
---

## Summary

## OWASP Top 10

The 2021 list.

## Deep Guidance

keep me
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '## OWASP Top 10', kind: 'insert' as const,
          rationale: '', new_text: '> 2025 edition adds A11 Software Supply Chain Failures.' },
      ],
      preserve_warnings: [],
    }
    const out = applyVerdictToEntry(entry, verdict)
    expect(out).toContain('## OWASP Top 10')
    expect(out).toContain('The 2021 list.')
    expect(out).toContain('2025 edition adds A11')
    expect(out).toContain('## Deep Guidance')
    expect(out).toContain('keep me')
    // The insert must land between the OWASP section and the next H2,
    // not after the entire file.
    const idxOwasp = out.indexOf('## OWASP Top 10')
    const idxInsert = out.indexOf('2025 edition')
    const idxDeepGuidance = out.indexOf('## Deep Guidance')
    expect(idxOwasp).toBeLessThan(idxInsert)
    expect(idxInsert).toBeLessThan(idxDeepGuidance)
  })

  it('applies a replace proposed_change targeting "## Deep Guidance"', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '## Deep Guidance', kind: 'replace' as const,
          rationale: '', new_text: '## Deep Guidance\n\nNew content with [source](https://x).\n' },
      ],
      preserve_warnings: [],
    }
    const out = applyVerdictToEntry(baseEntry, verdict)
    expect(out).toContain('New content with')
    expect(out).not.toContain('Old content.')
  })

  it('preserves the "## Deep Guidance" heading if a proposed_change tries to delete it', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '## Deep Guidance', kind: 'delete' as const, rationale: '' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/Deep Guidance/)
  })

  it('throws when a proposed_change.location does not match a heading (no silent last-reviewed advance)', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '## Nonexistent Heading', kind: 'replace' as const,
          rationale: '', new_text: '## Nonexistent Heading\n\nx' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/did not match/)
  })

  it('coverage is anchor-aware: two same-base sources with different anchors must both be checked', () => {
    // Round-5 F-002: an entry with two sources at the same base URL but
    // different anchors must require BOTH anchors in verdict.sources_checked.
    // Without this, an audit that only fetched #a would falsely satisfy
    // coverage for both #a and #b.
    const entry = `---
name: x
description: y
topics: []
sources:
  - url: https://x
    anchor: '#a'
    hash: 'old-a'
  - url: https://x
    anchor: '#b'
    hash: 'old-b'
---

## Deep Guidance

body
`
    const verdictPartial = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const,
      sources_checked: [
        { url: 'https://x#a', retrieved_at: '2026-05-24', content_hash: 'sha256:1', summary: '' },
        // #b NOT checked
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(entry, verdictPartial)).toThrow(/missing entry source "https:\/\/x#b"/)

    // Full coverage → passes.
    const verdictFull = {
      ...verdictPartial,
      sources_checked: [
        { url: 'https://x#a', retrieved_at: '2026-05-24', content_hash: 'sha256:1', summary: '' },
        { url: 'https://x#b', retrieved_at: '2026-05-24', content_hash: 'sha256:2', summary: '' },
      ],
    }
    expect(() => applyVerdictToEntry(entry, verdictFull)).not.toThrow()
  })

  it('refuses to advance last-reviewed when sources_checked is missing a declared source', () => {
    // Round-2 F-002: a malformed/ungrounded verdict whose `sources_checked`
    // does not cover every declared frontmatter source must throw BEFORE
    // last-reviewed is updated. Otherwise the prefilter would skip the entry
    // until cadence expires, leaving the un-checked source stale.
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const,
      // Empty: doesn't cover baseEntry's `https://x` source.
      sources_checked: [],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/missing entry source/)
  })

  it('rejects an H3 (### …) location — Phase 1 supports H2 only', () => {
    const entry = `---
name: x
description: y
topics: []
sources:
  - url: https://x
    hash: 'old'
---

## Deep Guidance

### Some Subsection

content
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '### Some Subsection', kind: 'replace' as const,
          rationale: '', new_text: '### Some Subsection\n\nnew content' },
      ],
      preserve_warnings: [],
    }
    // H3 location → findHeading() returns null → applyVerdictToEntry throws
    // BEFORE any disk edit. Verifies the Phase 1 "H2 only" contract.
    expect(() => applyVerdictToEntry(entry, verdict)).toThrow(/did not match/)
  })

  it('rejects an H1 (# …) location — only "## " is a valid target', () => {
    const entry = `---
name: x
description: y
topics: []
sources:
  - url: https://x
    hash: 'old'
---

# Some H1

## Deep Guidance

x
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '# Some H1', kind: 'replace' as const,
          rationale: '', new_text: '# Some H1\n\nnew' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(entry, verdict)).toThrow(/did not match/)
  })

  it('applies a delete kind by removing the targeted section', () => {
    const entry = `---
name: x
description: y
topics: []
---

## Summary

## Deprecated Section

old stuff here

## Deep Guidance

keep me
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '## Deprecated Section', kind: 'delete' as const, rationale: '' },
      ],
      preserve_warnings: [],
    }
    const out = applyVerdictToEntry(entry, verdict)
    expect(out).not.toContain('Deprecated Section')
    expect(out).not.toContain('old stuff here')
    expect(out).toContain('## Deep Guidance')
    expect(out).toContain('keep me')
  })

  it('preserves literal "$1" in new_text (no replace-string interpolation)', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '## Deep Guidance', kind: 'replace' as const,
          rationale: '', new_text: '## Deep Guidance\n\nCost: $1 per request, $20/month plan.' },
      ],
      preserve_warnings: [],
    }
    const out = applyVerdictToEntry(baseEntry, verdict)
    expect(out).toContain('Cost: $1 per request, $20/month plan.')
  })

  it('throws when minor-drift or current verdicts carry proposed_changes', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'minor-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '## Deep Guidance', kind: 'replace' as const,
          rationale: '', new_text: '## Deep Guidance\n\nNew.' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/must have no proposed_changes/)
  })

  it('matches sources by normalized URL so anchors do not block hash updates', () => {
    const entry = `---
name: x
description: y
topics: []
sources:
  - url: https://example.org/spec
    hash: 'old'
---

## Deep Guidance

x
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const,
      sources_checked: [
        // Verdict's URL has an anchor; frontmatter's doesn't. Apply should still match.
        { url: 'https://example.org/spec#section-2', retrieved_at: '2026-05-24',
          content_hash: 'sha256:new', summary: '' },
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }
    const out = applyVerdictToEntry(entry, verdict)
    // yaml.dump quoting under JSON_SCHEMA is value-dependent; match by content.
    expect(out).toMatch(/hash:\s*['"]?sha256:new['"]?/)
    // Old hash must be absent in any quoting — leaving the stale value behind
    // is the bug we're guarding against.
    expect(out).not.toMatch(/hash:\s*['"]?old['"]?/)
  })

  it('prefers caller-supplied trustedHashes over LLM-claimed content_hash', () => {
    const entry = `---
name: x
description: y
topics: []
sources:
  - url: https://example.org/spec
    hash: 'old'
---

## Deep Guidance

x
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const,
      sources_checked: [
        { url: 'https://example.org/spec', retrieved_at: '2026-05-24',
          content_hash: 'sha256:llm-claimed-untrusted', summary: '' },
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }
    const trustedHashes = new Map([['https://example.org/spec', 'sha256:deterministic']])
    const out = applyVerdictToEntry(entry, verdict, { trustedHashes })
    expect(out).toMatch(/hash:\s*['"]?sha256:deterministic['"]?/)
    expect(out).not.toContain('llm-claimed-untrusted')
  })

  it('throws when trustedHashes is supplied but is missing a verdict source URL', () => {
    const entry = `---
name: x
description: y
topics: []
sources:
  - url: https://example.org/spec
    hash: 'old'
---

## Deep Guidance

x
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const,
      sources_checked: [
        { url: 'https://example.org/spec', retrieved_at: '2026-05-24',
          content_hash: 'sha256:llm', summary: '' },
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }
    // Supply trustedHashes but omit the URL → strict mode: throw rather than
    // silently fall back to the LLM-claimed hash.
    const trustedHashes = new Map<string, string>()
    expect(() => applyVerdictToEntry(entry, verdict, { trustedHashes })).toThrow(/trustedHashes/)
  })

  it('stops the targeted section at an H1 boundary, not just at the next H2', () => {
    // Knowledge entries rarely have H1s (titles live in frontmatter) but if
    // one ever appears, an H2 region must end at the H1 — not swallow it.
    const entry = `---
name: x
description: y
topics: []
---

## Old Section

old content

# Stray H1 inside the body

other content

## Deep Guidance

keep me
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '## Old Section', kind: 'delete' as const, rationale: '' },
      ],
      preserve_warnings: [],
    }
    const out = applyVerdictToEntry(entry, verdict)
    expect(out).not.toContain('## Old Section')
    expect(out).not.toContain('old content')
    expect(out).toContain('# Stray H1 inside the body')
    expect(out).toContain('other content')
    expect(out).toContain('## Deep Guidance')
    expect(out).toContain('keep me')
  })

  it('rejects near-miss heading replacements that would break extractDeepGuidance()', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        // "## Deep Guidance (Updated)" starts with "## Deep Guidance" but is
        // NOT the exact heading the assembly engine matches. Must throw.
        { location: '## Deep Guidance', kind: 'replace' as const,
          rationale: '', new_text: '## Deep Guidance (Updated)\n\nbody' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/must equal "## Deep Guidance" exactly/)
  })

  it('protects "## Summary" the same way it protects "## Deep Guidance"', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [
        { location: '## Summary', kind: 'delete' as const, rationale: '' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/Summary/)
  })

  it('parses unquoted ISO dates in existing entries correctly (no Date coercion)', () => {
    const entryWithUnquotedDate = `---
name: x
description: y
topics: []
last-reviewed: 2026-04-01
sources:
  - url: https://x
    hash: 'old'
---

## Deep Guidance

Old content.
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const, sources_checked: baseEntryChecked, findings: [],
      proposed_changes: [], preserve_warnings: [],
    }
    const out = applyVerdictToEntry(entryWithUnquotedDate, verdict)
    // The new date is set, and it serializes as a string (not [object Object]).
    expect(out).toContain('last-reviewed: 2026-05-24')
    expect(out).not.toContain('[object Object]')
  })
})
