import { describe, it, expect } from 'vitest'
import {
  renderPrTitle,
  renderPrBody,
  renderFindingsTable,
  renderFreshnessPr,
  branchNameForEntry,
  sanitizeForBranch,
  todayUtcYmd,
  volatilityLabel,
  readVolatility,
} from './audit-apply-pr.js'
import type { AuditVerdict } from './audit-runner.js'

const baseVerdict: AuditVerdict = {
  entry_name: 'security-owasp',
  audit_date: '2026-05-25',
  model: 'claude-opus-4-7',
  verdict: 'major-drift',
  sources_checked: [
    {
      url: 'https://owasp.org/Top10/',
      retrieved_at: '2026-05-25',
      content_hash: 'sha256:abc123',
      summary: 'OWASP Top 10 landing page',
    },
  ],
  findings: [
    {
      claim_in_entry: 'OWASP Top 10 was last updated in 2021.',
      evidence_url: 'https://owasp.org/Top10/2025/',
      evidence_date: '2026-05-25',
      source_excerpt: 'The 2025 edition adds A11 Software Supply Chain Failures.',
      severity: 'P1',
      drift_kind: 'edition-supersession',
    },
  ],
  proposed_changes: [
    {
      location: '## Summary',
      kind: 'replace',
      rationale: 'Note new 2025 edition',
      new_text: '## Summary\n\n> 2025 edition adds A11.',
    },
  ],
  preserve_warnings: ['Keep ## Deep Guidance heading.'],
}

describe('renderPrTitle', () => {
  it('uses the conventional-commits chore(knowledge) prefix', () => {
    const title = renderPrTitle(baseVerdict)
    expect(title.startsWith('chore(knowledge): refresh security-owasp against ')).toBe(true)
    expect(title).toContain('https://owasp.org/Top10/')
  })

  it('summarizes multi-source verdicts with "and N other source(s)"', () => {
    const v: AuditVerdict = {
      ...baseVerdict,
      sources_checked: [
        ...baseVerdict.sources_checked,
        { url: 'https://example.com/a', retrieved_at: '2026-05-25', content_hash: 'sha256:1', summary: '' },
        { url: 'https://example.com/b', retrieved_at: '2026-05-25', content_hash: 'sha256:2', summary: '' },
      ],
    }
    expect(renderPrTitle(v)).toContain('and 2 other source(s)')
  })
})

describe('renderFindingsTable', () => {
  it('renders a markdown table with one row per finding', () => {
    const table = renderFindingsTable(baseVerdict)
    expect(table).toContain('| severity | drift_kind | claim_in_entry | evidence_url |')
    expect(table).toContain('|---|---|---|---|')
    expect(table).toContain('| P1 | edition-supersession |')
    expect(table).toContain('https://owasp.org/Top10/2025/')
  })

  it('escapes pipes and collapses newlines so a stray bar does not break the row', () => {
    const v: AuditVerdict = {
      ...baseVerdict,
      findings: [{
        claim_in_entry: 'has | a pipe and\nnewline',
        evidence_url: 'https://x',
        evidence_date: '2026-05-25',
        source_excerpt: '',
        severity: 'P2',
        drift_kind: 'fact-change',
      }],
    }
    const table = renderFindingsTable(v)
    // Pipe must be escaped; newline must collapse to a space.
    expect(table).toContain('has \\| a pipe and newline')
    // Exactly 3 rows: header + sep + 1 finding (no extra rows from the newline).
    expect(table.split('\n').length).toBe(3)
  })

  it('emits "_No findings._" when the verdict has no findings', () => {
    const v: AuditVerdict = { ...baseVerdict, findings: [] }
    expect(renderFindingsTable(v)).toBe('_No findings._')
  })
})

describe('renderPrBody', () => {
  it('contains all required sections in order', () => {
    const body = renderPrBody(baseVerdict)
    const sections = ['## Summary', '## Verdict', '## Findings', '## MMR', '## Sources', '## Preserve warnings']
    let cursor = -1
    for (const s of sections) {
      const idx = body.indexOf(s)
      expect(idx).toBeGreaterThan(cursor)
      cursor = idx
    }
  })

  it('includes verdict fields verbatim', () => {
    const body = renderPrBody(baseVerdict)
    expect(body).toContain('- verdict: major-drift')
    expect(body).toContain('- audit_date: 2026-05-25')
    expect(body).toContain('- model: claude-opus-4-7')
  })

  it('shows MMR job ID when supplied, placeholder otherwise', () => {
    expect(renderPrBody(baseVerdict, { mmrJobId: 'job-abc' })).toContain('job_id: job-abc')
    expect(renderPrBody(baseVerdict)).toContain('_Not run inline')
  })

  it('renders source provenance with hash and retrieved date', () => {
    const body = renderPrBody(baseVerdict)
    expect(body).toContain('https://owasp.org/Top10/ (sha256:abc123, retrieved 2026-05-25)')
  })

  it('shows preserve_warnings list when present, "_None._" when empty', () => {
    expect(renderPrBody(baseVerdict)).toContain('- Keep ## Deep Guidance heading.')
    const empty: AuditVerdict = { ...baseVerdict, preserve_warnings: [] }
    expect(renderPrBody(empty)).toContain('## Preserve warnings\n_None._')
  })

  it('handles a verdict with zero sources_checked without throwing', () => {
    const v: AuditVerdict = { ...baseVerdict, sources_checked: [] }
    const body = renderPrBody(v)
    expect(body).toContain('_No sources._')
  })

  it('strips ALL JS line terminators from LLM fields (round-7 F-002/F-003/F-004)', () => {
    // Build a verdict whose preserve_warnings contains every JS line
    // terminator followed by BREAKING CHANGE:. The rendered body must NOT
    // contain a start-of-line "BREAKING CHANGE:" — otherwise the
    // version-bump workflow would treat it as a real major-bump footer.
    const v: AuditVerdict = {
      ...baseVerdict,
      preserve_warnings: [
        'before\nBREAKING CHANGE: injected via LF',
        'before\rBREAKING CHANGE: injected via CR',
        'before\r\nBREAKING CHANGE: injected via CRLF',
        'before BREAKING CHANGE: injected via LS',
        'before BREAKING CHANGE: injected via PS',
      ],
    }
    const body = renderPrBody(v)
    // No matter which terminator the LLM used, none of them should produce
    // a line whose start is "BREAKING CHANGE:". A multiline-anchor regex
    // confirms the round-2 deriveBumpKind check would now see zero matches.
    expect(/^BREAKING CHANGE:/m.test(body)).toBe(false)
  })

  it('strips line terminators from findings-table cells too', () => {
    const v: AuditVerdict = {
      ...baseVerdict,
      findings: [{
        claim_in_entry: 'old claim\rBREAKING CHANGE: still smuggled',
        evidence_url: 'https://example.org/x',
        evidence_date: '2026-05-25',
        source_excerpt: 'irrelevant',
        severity: 'P1',
        drift_kind: 'wording',
      }],
    }
    const body = renderPrBody(v)
    expect(/^BREAKING CHANGE:/m.test(body)).toBe(false)
  })
})

describe('renderFreshnessPr', () => {
  it('returns title, body, and entry_name in one structured payload', () => {
    const out = renderFreshnessPr(baseVerdict, { mmrJobId: 'job-xyz' })
    expect(out.title).toContain('chore(knowledge): refresh security-owasp')
    expect(out.body).toContain('job_id: job-xyz')
    expect(out.entryName).toBe('security-owasp')
  })
})

describe('branchNameForEntry', () => {
  it('uses the knowledge-freshness/<entry>-<date> shape', () => {
    expect(branchNameForEntry('security-owasp', '2026-05-25')).toBe('knowledge-freshness/security-owasp-2026-05-25')
  })

  it('sanitizes whitespace and forbidden characters out of the entry name', () => {
    expect(sanitizeForBranch('a b/c d')).toBe('a-b-c-d')
    expect(sanitizeForBranch('--leading-trailing--')).toBe('leading-trailing')
    expect(() => sanitizeForBranch('/// ')).toThrow(/empty string/)
  })
})

describe('todayUtcYmd', () => {
  it('formats UTC date as YYYY-MM-DD with leading zeros', () => {
    expect(todayUtcYmd(new Date('2026-01-05T23:59:59Z'))).toBe('2026-01-05')
  })

  it('uses UTC, not local time (boundary case)', () => {
    // 2026-05-25 23:30 UTC is still 2026-05-25 in UTC regardless of local TZ.
    expect(todayUtcYmd(new Date('2026-05-25T23:30:00Z'))).toBe('2026-05-25')
  })
})

describe('volatilityLabel', () => {
  it('maps known volatility values to labels', () => {
    expect(volatilityLabel('fast-moving')).toBe('volatility:fast-moving')
    expect(volatilityLabel('evolving')).toBe('volatility:evolving')
    expect(volatilityLabel('stable')).toBe('volatility:stable')
  })

  it('returns undefined for unknown values so we do not attach a bogus label', () => {
    expect(volatilityLabel(undefined)).toBeUndefined()
    expect(volatilityLabel('something-else')).toBeUndefined()
  })
})

describe('readVolatility', () => {
  it('parses volatility from a frontmatter block', () => {
    const entry = `---
name: x
volatility: fast-moving
sources: []
---

body
`
    expect(readVolatility(entry)).toBe('fast-moving')
  })

  it('returns undefined when there is no frontmatter', () => {
    expect(readVolatility('# no frontmatter')).toBeUndefined()
  })
})
