import { describe, it, expect } from 'vitest'
import { getParser } from '../../src/core/parser.js'

describe('doc-conformance parser', () => {
  it('getParser("doc-conformance") returns a distinct parser (not the default fallback)', () => {
    const parser = getParser('doc-conformance')
    const dflt = getParser('default')
    expect(parser).not.toBe(dflt)
    expect(typeof parser).toBe('function')
  })

  it('parses a JSON-array input into ParsedOutput.findings', () => {
    const parser = getParser('doc-conformance')
    const input = JSON.stringify([
      {
        severity: 'P0',
        location: 'docs/x.md::A-tdd::abc12345',
        description: '[doc-conformance/A-tdd] failing test',
        suggestion: 'fix it',
        category: 'doc-conformance',
      },
      {
        severity: 'P2',
        location: 'docs/y.md::B::def67890',
        description: 'desc',
        suggestion: '',
        category: 'doc-conformance',
      },
    ])
    const result = parser(input)
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0].severity).toBe('P0')
    expect(result.findings[0].location).toContain('A-tdd::abc12345')
  })

  it('sets approved=false when any P0 or P1 finding is present', () => {
    const parser = getParser('doc-conformance')
    const input = JSON.stringify([
      { severity: 'P1', location: 'docs/x.md::A-tdd::abc12345', description: 'desc', suggestion: '' },
    ])
    const result = parser(input)
    expect(result.approved).toBe(false)
  })

  it('sets approved=true when all findings are P2 or P3', () => {
    const parser = getParser('doc-conformance')
    const input = JSON.stringify([
      { severity: 'P2', location: 'docs/x.md::A-tdd::abc12345', description: 'desc', suggestion: '' },
      { severity: 'P3', location: 'docs/y.md::B::def67890', description: 'desc2', suggestion: '' },
    ])
    const result = parser(input)
    expect(result.approved).toBe(true)
  })

  it('sets approved=true and findings=[] for empty array input', () => {
    const parser = getParser('doc-conformance')
    const result = parser('[]')
    expect(result.approved).toBe(true)
    expect(result.findings).toHaveLength(0)
  })

  it('returns a summary string', () => {
    const parser = getParser('doc-conformance')
    const result = parser('[]')
    expect(typeof result.summary).toBe('string')
  })

  it('returns error finding and approved=false for non-JSON input', () => {
    const parser = getParser('doc-conformance')
    const result = parser('not json at all')
    expect(result.approved).toBe(false)
    expect(result.findings.length).toBeGreaterThan(0)
  })
})
