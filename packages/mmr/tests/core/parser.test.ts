import { describe, it, expect } from 'vitest'
import type { OutputParserConfig } from '../../src/config/schema.js'
import { parseChannelOutput, getParser, validateFindingStrict, validateParsedOutputStrict, channelOutputMatchesIncompleteGuard } from '../../src/core/parser.js'

describe('grok channel output_parser (unwrap $.text → default)', () => {
  // Exercises the exact parser config used by BUILTIN_CHANNELS.grok against a
  // real-shaped `grok --output-format json` payload: the findings JSON lives
  // as a string inside $.text, alongside thought/stopReason/etc.
  const grokParser = getParser({ kind: 'unwrap-jsonpath', wrap: '$.text', then: 'default' })

  it('unwraps $.text and parses the findings JSON inside it', () => {
    const raw = JSON.stringify({
      text: '{"approved": false, "findings": [{"severity":"P0","location":"x.js:1","description":"eval on user input","suggestion":"remove eval"}], "summary": "RCE"}',
      stopReason: 'EndTurn',
      sessionId: '019e-...',
      thought: 'The task is to act as a code reviewer...',
    })
    const result = grokParser(raw)
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P0')
    expect(result.findings[0].location).toBe('x.js:1')
  })

  it('does not leak grok thought text into findings', () => {
    const raw = JSON.stringify({
      text: '{"approved": true, "findings": [], "summary": "ok"}',
      thought: 'I should respond with findings: P0 something something',
    })
    const result = grokParser(raw)
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })
})

describe('unwrap-jsonpath `incomplete` guard (grok Cancelled → honest error)', () => {
  // grok often cancels a review mid-run under heavy concurrent load: the envelope
  // comes back stopReason=Cancelled with only a short "I'll review..." ack in
  // $.text (no findings JSON). Without the guard, MMR throws the misleading
  // "No JSON object found in output". The guard turns that into an actionable
  // "did not complete (stopReason=Cancelled)" error instead.
  const grokParser: OutputParserConfig = {
    kind: 'unwrap-jsonpath',
    wrap: '$.text',
    incomplete: {
      status_path: '$.stopReason',
      values: ['Cancelled'],
      message: 'grok was interrupted mid-review — retry or reduce concurrent grok load.',
    },
    then: 'default',
  }

  it('reports an honest cancellation error (not "No JSON object found") when a Cancelled run has only ack text', () => {
    const raw = JSON.stringify({
      text: "I'll review the diff against the surrounding worker module and report findings.",
      stopReason: 'Cancelled',
      num_turns: 1,
    })
    const result = parseChannelOutput(raw, grokParser)
    expect(result.summary).toBe('Output parsing failed.')
    const desc = result.findings[0].description
    expect(desc).toMatch(/did not complete \(stopReason=Cancelled\)/)
    expect(desc).toMatch(/retry or reduce concurrent grok load/)
    expect(desc).not.toMatch(/No JSON object found/)
  })

  it('still parses findings normally on a completed (EndTurn) run — guard does not interfere', () => {
    const raw = JSON.stringify({
      text: '{"approved": false, "findings": [{"severity":"P0","location":"x.js:1","description":"bug","suggestion":"fix"}], "summary": "bad"}',
      stopReason: 'EndTurn',
    })
    const result = parseChannelOutput(raw, grokParser)
    expect(result.summary).not.toBe('Output parsing failed.')
    expect(result.findings).toHaveLength(1)
  })

  it('rejects a Cancelled run even when $.text holds parseable findings JSON (guard is preemptive)', () => {
    // With grok's --json-schema flag, intermediate progress turns are ALSO
    // schema-shaped JSON — a cancelled run's $.text can contain a parseable
    // "{approved:…, findings:[], summary:'Reviewing…'}" ack that would
    // masquerade as a clean completed review (verified against grok 0.2.103,
    // 2026-07-18 repro). A Cancelled envelope must therefore never be trusted,
    // parseable or not.
    const raw = JSON.stringify({
      text: '{"approved": true, "findings": [], "summary": "No issues found."}',
      stopReason: 'Cancelled',
    })
    const result = parseChannelOutput(raw, grokParser)
    expect(result.summary).toBe('Output parsing failed.')
    expect(result.findings[0].description).toMatch(/did not complete \(stopReason=Cancelled\)/)
  })

  it('without an `incomplete` config, a parse failure keeps the original generic error (backward compatible)', () => {
    const raw = JSON.stringify({ text: 'just prose, no json', stopReason: 'Cancelled' })
    const result = parseChannelOutput(raw, { kind: 'unwrap-jsonpath', wrap: '$.text', then: 'default' })
    expect(result.summary).toBe('Output parsing failed.')
    expect(result.findings[0].description).toMatch(/No JSON object found/)
  })

  it('does not fire when the status field is a non-string value (keeps the original error)', () => {
    // stopReason is a number here — typeof status === 'string' guards against it.
    const raw = JSON.stringify({ text: 'prose, no json', stopReason: 42 })
    const result = parseChannelOutput(raw, grokParser)
    expect(result.summary).toBe('Output parsing failed.')
    expect(result.findings[0].description).toMatch(/No JSON object found/)
    expect(result.findings[0].description).not.toMatch(/did not complete/)
  })

  it('a malformed status_path does not replace the original parse error with a jsonpath error', () => {
    const raw = JSON.stringify({ text: 'prose, no json', stopReason: 'Cancelled' })
    const badPath: OutputParserConfig = {
      kind: 'unwrap-jsonpath',
      wrap: '$.text',
      incomplete: { status_path: '$.foo[bad', values: ['Cancelled'], message: 'x' },
      then: 'default',
    }
    const result = parseChannelOutput(raw, badPath)
    expect(result.summary).toBe('Output parsing failed.')
    expect(result.findings[0].description).toMatch(/No JSON object found/)
    expect(result.findings[0].description).not.toMatch(/jsonpath/)
  })
})

describe('default-last parser (grok --json-schema emits one JSON object per turn)', () => {
  // Under --json-schema, grok's intermediate progress turns are schema-shaped
  // JSON objects concatenated into $.text ahead of the real final verdict.
  // Taking the FIRST object can flip the verdict (observed live: a first-turn
  // '{"approved":true,…,"summary":"No issues found."}' ack preceding a final
  // object with 3 real findings). default-last extracts the LAST top-level
  // JSON value instead.
  const parse = getParser('default-last')

  it('picks the final JSON object when several are concatenated (verdict-flip case)', () => {
    const raw = '{"approved": true, "findings": [], "summary": "No issues found."}'
      + '{"approved": true, "findings": [], "summary": "No issues found."}'
      + '{"approved": false, "findings": [{"severity":"P1","location":"a.ts:3","description":"bug","suggestion":"fix"}], "summary": "one real finding"}'
    const result = parse(raw)
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.summary).toBe('one real finding')
  })

  it('behaves like default on a single clean JSON object', () => {
    const result = parse('{"approved": true, "findings": [], "summary": "ok"}')
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('is not confused by nested objects inside the final value', () => {
    const raw = '{"approved": true, "findings": [], "summary": "ack"}'
      + '{"approved": false, "findings": [{"severity":"P0","location":"b.ts:1","description":"nested {brace} case","suggestion":"fix"}], "summary": "real"}'
    const result = parse(raw)
    expect(result.summary).toBe('real')
    expect(result.findings[0].severity).toBe('P0')
  })

  it('tolerates prose and markdown fences around the objects', () => {
    const raw = 'Progress:\n{"approved": true, "findings": [], "summary": "ack"}\nFinal:\n```json\n{"approved": true, "findings": [], "summary": "done"}\n```'
    const result = parse(raw)
    expect(result.summary).toBe('done')
  })

  it('rejects a truncated trailing candidate instead of silently using the previous object (strict tail)', () => {
    // The truncated tail could be the REAL final verdict; the earlier object
    // can be a progress ack (observed live with "approved": true). Falling
    // back silently could wrongly approve — fail the parse instead, which
    // fails the channel and triggers the compensating pass.
    const raw = '{"approved": true, "findings": [], "summary": "ack"} {"truncated": '
    const result = parseChannelOutput(raw, 'default-last')
    expect(result.summary).toBe('Output parsing failed.')
    expect(result.findings[0].description).toMatch(/may be truncated/)
  })

  it('ignores a broken candidate that appears BEFORE the final complete object', () => {
    const raw = '{bad json} {"approved": true, "findings": [], "summary": "real"}'
    const result = parse(raw)
    expect(result.summary).toBe('real')
  })

  it('steps past a mismatched-delimiter fragment and still finds a later valid object', () => {
    // '{]' is a LOCAL malformation (stray braces in prose), not a truncation —
    // truncation always presents as unbalanced-at-EOF. Scanning must continue.
    const raw = '{"approved": true, "findings": [], "summary": "ack"} {] {"approved": false, "findings": [{"severity":"P1","location":"c.ts:9","description":"bug","suggestion":"fix"}], "summary": "real"}'
    const result = parse(raw)
    expect(result.summary).toBe('real')
    expect(result.findings).toHaveLength(1)
  })

  it('throws the same error shape as default when no JSON is present', () => {
    const result = parseChannelOutput('no json here at all', 'default-last')
    expect(result.summary).toBe('Output parsing failed.')
    expect(result.findings[0].description).toMatch(/No JSON object found/)
  })

  it('self-diagnoses a top-level array (object-root restriction is by design)', () => {
    // Note: an array CONTAINING objects still yields its last nested object
    // (the scanner matches any '{'); the hint fires for object-free output.
    const result = parseChannelOutput('["P1", "P2"]', 'default-last')
    expect(result.summary).toBe('Output parsing failed.')
    expect(result.findings[0].description).toMatch(/only object roots/)
  })
})

describe('channelOutputMatchesIncompleteGuard (review-time retry probe)', () => {
  const grokSpec: OutputParserConfig = {
    kind: 'unwrap-jsonpath',
    wrap: '$.text',
    incomplete: { status_path: '$.stopReason', values: ['Cancelled'], message: 'interrupted' },
    then: 'default-last',
  }

  it('matches a Cancelled grok envelope', () => {
    const raw = JSON.stringify({ text: 'ack only', stopReason: 'Cancelled' })
    expect(channelOutputMatchesIncompleteGuard(raw, grokSpec)).toBe(true)
  })

  it('does not match a completed (EndTurn) envelope', () => {
    const raw = JSON.stringify({ text: '{"approved":true,"findings":[],"summary":"ok"}', stopReason: 'EndTurn' })
    expect(channelOutputMatchesIncompleteGuard(raw, grokSpec)).toBe(false)
  })

  it('returns false for parser specs without an incomplete guard', () => {
    const raw = JSON.stringify({ text: 'x', stopReason: 'Cancelled' })
    expect(channelOutputMatchesIncompleteGuard(raw, 'default')).toBe(false)
    expect(channelOutputMatchesIncompleteGuard(raw, { kind: 'unwrap-jsonpath', wrap: '$.text', then: 'default' })).toBe(false)
  })

  it('never throws on undecodable output', () => {
    expect(channelOutputMatchesIncompleteGuard('not json', grokSpec)).toBe(false)
    expect(channelOutputMatchesIncompleteGuard('', grokSpec)).toBe(false)
  })
})

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

  it('returns a parser when given an OutputParserConfig object', () => {
    const cfg: OutputParserConfig = { kind: 'unwrap-jsonpath', wrap: '$', then: 'default' }
    const parser = getParser(cfg)
    expect(typeof parser).toBe('function')
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

  it('unwraps nested jsonpath output from fenced JSON', () => {
    const cfg: OutputParserConfig = {
      kind: 'unwrap-jsonpath',
      wrap: '$.choices[0].message.content',
      then: 'default',
    }
    const result = parseChannelOutput('```json\n{"choices":[{"message":{"content":"{\\"approved\\":true,\\"findings\\":[],\\"summary\\":\\"ok\\"}"}}]}\n```', cfg)
    expect(result.approved).toBe(true)
  })

  it('unwraps nested jsonpath output from surrounding text', () => {
    const cfg: OutputParserConfig = {
      kind: 'unwrap-jsonpath',
      wrap: '$.choices[0].message.content',
      then: 'default',
    }
    const result = parseChannelOutput('Here is the result:\n{"choices":[{"message":{"content":"{\\"approved\\":true,\\"findings\\":[],\\"summary\\":\\"ok\\"}"}}]}\nDone.', cfg)
    expect(result.approved).toBe(true)
  })

  it('unwraps root array jsonpath output from surrounding text', () => {
    const cfg: OutputParserConfig = {
      kind: 'unwrap-jsonpath',
      wrap: '$[0]',
      then: 'default',
    }
    const result = parseChannelOutput('API response:\n["{\\"approved\\":true,\\"findings\\":[],\\"summary\\":\\"ok\\"}"]', cfg)
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

describe('unwrap-jsonpath parser kind', () => {
  it('unwraps an OpenAI-chat envelope and delegates to default', () => {
    const inner = '{"approved": false, "findings": [{"severity": "P1", "location": "f.ts:1", "description": "bug", "suggestion": "fix"}], "summary": "found bug"}'
    const envelope = JSON.stringify({ choices: [{ message: { content: inner } }] })
    const cfg = { kind: 'unwrap-jsonpath' as const, wrap: '$.choices[0].message.content', then: 'default' }
    const result = parseChannelOutput(envelope, cfg)
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P1')
  })

  it('defaults `then` to "default" when omitted', () => {
    const inner = '{"approved": true, "findings": [], "summary": "ok"}'
    const envelope = JSON.stringify({ content: inner })
    const cfg = { kind: 'unwrap-jsonpath' as const, wrap: '$.content' }
    const result = parseChannelOutput(envelope, cfg)
    expect(result.approved).toBe(true)
  })

  it('serializes non-string extracted values when chaining to another structured parser', () => {
    const inner = '{"approved": true, "findings": [], "summary": "ok"}'
    const envelope = JSON.stringify({ outer: { inner } })
    const cfg = {
      kind: 'unwrap-jsonpath' as const,
      wrap: '$.outer',
      then: { kind: 'unwrap-jsonpath' as const, wrap: '$.inner', then: 'default' },
    }
    const result = parseChannelOutput(envelope, cfg)
    expect(result.approved).toBe(true)
  })

  it('emits an error finding when the jsonpath does not resolve', () => {
    const envelope = JSON.stringify({ choices: [] })
    const cfg = { kind: 'unwrap-jsonpath' as const, wrap: '$.choices[0].message.content', then: 'default' }
    const result = parseChannelOutput(envelope, cfg)
    expect(result.approved).toBe(false)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P1')
    expect(result.findings[0].location).toBe('output-parser')
    expect(result.findings[0].description).toMatch(/jsonpath|did not resolve|wrap/i)
  })

  it('emits an error finding when the envelope is not JSON', () => {
    const cfg = { kind: 'unwrap-jsonpath' as const, wrap: '$.x', then: 'default' }
    const result = parseChannelOutput('totally not json', cfg)
    expect(result.approved).toBe(false)
    expect(result.findings[0].location).toBe('output-parser')
  })

  it('emits an error finding when the extracted value is not valid parser input', () => {
    const envelope = JSON.stringify({ choices: [{ message: { content: 'not valid parser input' } }] })
    const cfg = { kind: 'unwrap-jsonpath' as const, wrap: '$.choices[0].message.content', then: 'default' }
    const result = parseChannelOutput(envelope, cfg)
    expect(result.approved).toBe(false)
    expect(result.findings[0].description).toMatch(/parse|No JSON/i)
  })
})

describe('regex-findings parser kind', () => {
  it('extracts one finding per match using the fields map', () => {
    const raw = [
      'P1|src/foo.ts:10|Null check missing',
      'P2|src/bar.ts:42|Unused variable `x`',
    ].join('\n')
    const cfg = {
      kind: 'regex-findings' as const,
      pattern: '^(P[0-3])\\|([^|]+)\\|(.+)$',
      fields: { severity: 1, location: 2, description: 3 },
    }
    const result = parseChannelOutput(raw, cfg)
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0]).toEqual({
      severity: 'P1',
      location: 'src/foo.ts:10',
      description: 'Null check missing',
      suggestion: '',
    })
    expect(result.findings[1].severity).toBe('P2')
    expect(result.findings[1].location).toBe('src/bar.ts:42')
  })

  it('treats severity-less matches as P2 by default (via validateFinding)', () => {
    const raw = 'src/x.ts:1: some issue'
    const cfg = {
      kind: 'regex-findings' as const,
      pattern: '^([^:]+:\\d+): (.+)$',
      fields: { location: 1, description: 2 },
    }
    const result = parseChannelOutput(raw, cfg)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P2')
    expect(result.findings[0].location).toBe('src/x.ts:1')
  })

  it('coerces invalid severity capture to P2 (via validateFinding)', () => {
    const raw = 'CRITICAL|src/x.ts:1|boom'
    const cfg = {
      kind: 'regex-findings' as const,
      pattern: '^(\\w+)\\|([^|]+)\\|(.+)$',
      fields: { severity: 1, location: 2, description: 3 },
    }
    const result = parseChannelOutput(raw, cfg)
    expect(result.findings[0].severity).toBe('P2')
  })

  it('captures optional suggestion when fields.suggestion is set', () => {
    const raw = 'P0|src/a.ts:1|leaked secret|rotate the token'
    const cfg = {
      kind: 'regex-findings' as const,
      pattern: '^(P[0-3])\\|([^|]+)\\|([^|]+)\\|(.+)$',
      fields: { severity: 1, location: 2, description: 3, suggestion: 4 },
    }
    const result = parseChannelOutput(raw, cfg)
    expect(result.findings[0].suggestion).toBe('rotate the token')
  })

  it('returns approved=true with empty findings when no matches', () => {
    const raw = 'no review issues here'
    const cfg = {
      kind: 'regex-findings' as const,
      pattern: '^(P[0-3])\\|([^|]+)\\|(.+)$',
      fields: { severity: 1, location: 2, description: 3 },
    }
    const result = parseChannelOutput(raw, cfg)
    expect(result.findings).toHaveLength(0)
    expect(result.approved).toBe(true)
  })

  it('emits an error finding when the pattern is an invalid regex', () => {
    const cfg = {
      kind: 'regex-findings' as const,
      pattern: '[unclosed',
      fields: { location: 1, description: 2 },
    }
    const result = parseChannelOutput('anything', cfg)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].location).toBe('output-parser')
    expect(result.findings[0].description).toMatch(/regex|pattern|invalid/i)
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
