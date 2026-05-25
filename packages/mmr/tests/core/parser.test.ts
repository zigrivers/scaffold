import { describe, it, expect } from 'vitest'
import type { OutputParserConfig } from '../../src/config/schema.js'
import { parseChannelOutput, getParser, validateFindingStrict, validateParsedOutputStrict } from '../../src/core/parser.js'

describe('default parser', () => {
  const parse = getParser('default')

  it('parses clean JSON output', () => {
    const raw = '{"approved": true, "findings": [], "summary": "No issues."}'
    const result = parse(raw)
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('strips markdown fences from output', () => {
    const raw = '```json\n{"approved": true, "findings": [], "summary": "ok"}\n```'
    const result = parse(raw)
    expect(result.approved).toBe(true)
  })

  it('extracts JSON from surrounding text', () => {
    const raw = 'Here is my review:\n{"approved": false, "findings": [{"severity": "P1", "location": "file.ts:10", "description": "bug", "suggestion": "fix it"}], "summary": "found bug"}\nEnd of review.'
    const result = parse(raw)
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
  })

  it('handles braces inside JSON string values', () => {
    const raw = '{"approved": false, "findings": [{"severity": "P1", "location": "f.ts:1", "description": "use { and } carefully", "suggestion": "wrap in quotes"}], "summary": "ok"}'
    const result = parse(raw)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].description).toBe('use { and } carefully')
  })

  it('handles unbalanced braces inside JSON string values', () => {
    const raw = '{"approved": false, "findings": [{"severity": "P2", "location": "f.ts:5", "description": "missing closing }", "suggestion": "add }"}], "summary": "ok"}'
    const result = parse(raw)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].description).toBe('missing closing }')
  })

  it('handles escaped quotes inside JSON strings with braces', () => {
    const raw = '{"approved": true, "findings": [], "summary": "said \\"use {braces}\\" here"}'
    const result = parse(raw)
    expect(result.approved).toBe(true)
    expect(result.summary).toContain('use {braces}')
  })

  it('preserves optional id and category fields', () => {
    const raw = '{"approved": false, "findings": [{"id": "X-1", "category": "security", "severity": "P0", "location": "f.ts:1", "description": "vuln", "suggestion": "fix"}], "summary": "found issue"}'
    const result = parse(raw)
    expect(result.findings[0].id).toBe('X-1')
    expect(result.findings[0].category).toBe('security')
  })
})

describe('gemini parser', () => {
  const parse = getParser('gemini')

  it('extracts findings from gemini wrapper JSON', () => {
    const raw = JSON.stringify({
      response: '{"approved": false, "findings": [{"severity": "P0", "location": "f.ts:1", "description": "bad", "suggestion": "fix"}], "summary": "critical"}',
    })
    const result = parse(raw)
    expect(result.approved).toBe(false)
    expect(result.findings[0].severity).toBe('P0')
  })

  it('handles direct JSON (no wrapper)', () => {
    const raw = '{"approved": true, "findings": [], "summary": "clean"}'
    const result = parse(raw)
    expect(result.approved).toBe(true)
  })

  it('handles trailing commas', () => {
    const raw = '{"approved": true, "findings": [], "summary": "ok",}'
    const result = parse(raw)
    expect(result.approved).toBe(true)
  })

  it('validates unwrapped gemini output (missing fields get defaults)', () => {
    const raw = '{"status": "done", "result": "all good"}'
    const result = parse(raw)
    expect(result.approved).toBe(false)
    expect(result.findings).toEqual([])
    expect(result.summary).toBe('')
  })
})

describe('parser factory', () => {
  it('still resolves string parser names (back-compat)', () => {
    const parser = getParser('default')
    const out = parser('{"approved": true, "findings": [], "summary": "ok"}')
    expect(out.approved).toBe(true)
  })

  it('unwraps jsonpath output and parses it with the next parser', () => {
    const cfg: OutputParserConfig = { kind: 'unwrap-jsonpath', wrap: '$', then: 'default' }
    const result = parseChannelOutput('{"approved": true, "findings": [], "summary": "ok"}', cfg)
    expect(result.approved).toBe(true)
  })

  it('unwraps nested jsonpath output before parsing', () => {
    const cfg: OutputParserConfig = {
      kind: 'unwrap-jsonpath',
      wrap: '$.choices[0].message.content',
      then: 'default',
    }
    const result = parseChannelOutput(JSON.stringify({
      choices: [{ message: { content: '{"approved": true, "findings": [], "summary": "ok"}' } }],
    }), cfg)
    expect(result.approved).toBe(true)
  })

  it('unwraps root array jsonpath output before parsing', () => {
    const cfg: OutputParserConfig = {
      kind: 'unwrap-jsonpath',
      wrap: '$[0]',
      then: 'default',
    }
    const result = parseChannelOutput(JSON.stringify([
      '{"approved": true, "findings": [], "summary": "ok"}',
    ]), cfg)
    expect(result.approved).toBe(true)
  })

  it('returns a parser error when jsonpath does not match', () => {
    const cfg: OutputParserConfig = { kind: 'unwrap-jsonpath', wrap: '$.missing', then: 'default' }
    const result = parseChannelOutput('{"approved": true}', cfg)
    expect(result.approved).toBe(false)
    expect(result.findings[0].description).toMatch(/jsonpath did not match/)
  })

  it('parses regex findings', () => {
    const cfg: OutputParserConfig = {
      kind: 'regex-findings',
      pattern: '^(P[0-3])\\|([^|]+)\\|(.+)$',
      fields: { severity: 1, location: 2, description: 3 },
    }
    const result = parseChannelOutput('P2|src/a.ts:1|Needs a fix', cfg)
    expect(result.approved).toBe(false)
    expect(result.findings[0]).toMatchObject({
      severity: 'P2',
      location: 'src/a.ts:1',
      description: 'Needs a fix',
    })
  })

  it('uses default_severity when regex severity is not captured', () => {
    const cfg: OutputParserConfig = {
      kind: 'regex-findings',
      pattern: '^([^|]+)\\|(.+)$',
      default_severity: 'P1',
      fields: { location: 1, description: 2 },
    }
    const result = parseChannelOutput('src/a.ts:1|Needs a fix', cfg)
    expect(result.findings[0].severity).toBe('P1')
  })

  it('honors regex flags from config', () => {
    const cfg: OutputParserConfig = {
      kind: 'regex-findings',
      pattern: '^(src/[^|]+)\\|(.+)$',
      flags: 'i',
      fields: { location: 1, description: 2 },
    }
    const result = parseChannelOutput('SRC/A.TS:1|Needs a fix', cfg)
    expect(result.findings[0].location).toBe('SRC/A.TS:1')
  })

  it('returns a parser error when required regex captures are empty', () => {
    const cfg: OutputParserConfig = {
      kind: 'regex-findings',
      pattern: '^(P[0-3])\\|([^|]*)\\|(.+)$',
      fields: { severity: 1, location: 2, description: 3 },
    }
    const result = parseChannelOutput('P2||Needs a fix', cfg)
    expect(result.approved).toBe(false)
    expect(result.findings[0].description).toMatch(/requires non-empty location and description/)
  })
})

describe('parseChannelOutput', () => {
  it('returns error finding when output is unparseable', () => {
    const result = parseChannelOutput('not json at all', 'default')
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P1')
    expect(result.findings[0].description).toContain('parse')
  })

  it('returns error finding for empty string input', () => {
    const result = parseChannelOutput('', 'default')
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P1')
    expect(result.findings[0].description).toContain('No JSON object found')
  })

  it('returns error finding for unbalanced braces', () => {
    const result = parseChannelOutput('{"approved": true', 'default')
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].description).toContain('Unbalanced braces')
  })
})

describe('validateFindingStrict', () => {
  it('accepts a valid finding', () => {
    const f = validateFindingStrict({ severity: 'P1', location: 'f.ts:10', description: 'bug', suggestion: 'fix' })
    expect(f.severity).toBe('P1')
  })

  it('throws on missing severity', () => {
    expect(() => validateFindingStrict({ location: 'f.ts:1', description: 'bug', suggestion: '' }))
      .toThrow('missing or invalid severity')
  })

  it('throws on invalid severity value', () => {
    expect(() => validateFindingStrict({ severity: 'CRITICAL', location: 'f.ts:1', description: 'bug', suggestion: '' }))
      .toThrow('missing or invalid severity')
  })

  it('throws on missing description', () => {
    expect(() => validateFindingStrict({ severity: 'P2', location: 'f.ts:1', suggestion: '' }))
      .toThrow('missing description')
  })

  it('throws on missing location', () => {
    expect(() => validateFindingStrict({ severity: 'P2', description: 'bug', suggestion: '' }))
      .toThrow('missing location')
  })

  it('preserves optional id and category', () => {
    const f = validateFindingStrict({ id: 'X-1', category: 'security', severity: 'P0', location: 'f.ts:1', description: 'vuln', suggestion: 'fix' })
    expect(f.id).toBe('X-1')
    expect(f.category).toBe('security')
  })
})

describe('doc-conformance parser', () => {
  const parse = getParser('doc-conformance')

  it('parses a valid findings array', () => {
    const raw = JSON.stringify([
      { severity: 'P1', location: 'lens::H-cross-doc::feature-no-story', description: 'missing story', suggestion: 'add story' },
    ])
    const result = parse(raw)
    expect(Array.isArray(result.findings)).toBe(true)
    expect(result.findings[0].severity).toBe('P1')
  })

  it('returns a P1 blocking finding when output is not an array', () => {
    const raw = '{"findings": []}'
    const result = parse(raw)
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P1')
  })

  it('returns a P1 blocking finding when output fails to parse', () => {
    const raw = 'not-json'
    const result = parse(raw)
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P1')
  })
})

describe('validateParsedOutputStrict', () => {
  it('accepts valid wrapper with findings', () => {
    const result = validateParsedOutputStrict({
      approved: false,
      findings: [{ severity: 'P1', location: 'f.ts:1', description: 'bug', suggestion: 'fix' }],
      summary: 'found bug',
    })
    expect(result.findings).toHaveLength(1)
  })

  it('throws when findings is not an array', () => {
    expect(() => validateParsedOutputStrict({ approved: true, findings: 'none', summary: 'ok' }))
      .toThrow('findings must be an array')
  })

  it('throws when a finding inside is invalid', () => {
    expect(() => validateParsedOutputStrict({
      approved: false,
      findings: [{ severity: 'BAD', location: 'f.ts:1', description: 'x', suggestion: '' }],
      summary: 'x',
    })).toThrow('missing or invalid severity')
  })
})
