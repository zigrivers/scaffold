import { describe, it, expect } from 'vitest'
import { parseChannelOutput, getParser } from '../../src/core/parser.js'

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
