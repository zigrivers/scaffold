import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { normalizeExternalInput, readInput } from '../../src/core/normalize-input.js'

describe('normalizeExternalInput', () => {
  it('normalizes wrapper format with findings', () => {
    const input = JSON.stringify({
      approved: false,
      findings: [{ severity: 'P1', location: 'f.ts:1', description: 'bug', suggestion: 'fix' }],
      summary: 'found bug',
    })
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P1')
    expect(result.summary).toBe('found bug')
  })

  it('normalizes bare array of findings', () => {
    const input = JSON.stringify([
      { severity: 'P2', location: 'a.ts:5', description: 'style', suggestion: 'refactor' },
    ])
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
    expect(result.summary).toBe('Injected external findings')
    expect(result.approved).toBe(true)
  })

  it('infers approved=false when bare array has P0 findings', () => {
    const input = JSON.stringify([
      { severity: 'P0', location: 'f.ts:1', description: 'critical', suggestion: 'fix now' },
    ])
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(false)
  })

  it('infers approved=false when bare array has P1 findings', () => {
    const input = JSON.stringify([
      { severity: 'P1', location: 'f.ts:1', description: 'important', suggestion: 'fix' },
    ])
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(false)
  })

  it('strips markdown fences from input', () => {
    const input = '```json\n{"approved": true, "findings": [], "summary": "ok"}\n```'
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('strips markdown fences from bare array', () => {
    const input = '```json\n[{"severity": "P2", "location": "f.ts:1", "description": "nit", "suggestion": ""}]\n```'
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
  })

  it('handles wrapper with surrounding text', () => {
    const input = 'Here are my findings:\n{"approved": false, "findings": [{"severity": "P1", "location": "f.ts:1", "description": "bug", "suggestion": "fix"}], "summary": "review"}\nEnd.'
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
  })

  it('fixes trailing commas', () => {
    const input = '{"approved": true, "findings": [], "summary": "ok",}'
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(true)
  })

  it('throws on invalid input (plain string)', () => {
    expect(() => normalizeExternalInput('not json at all')).toThrow()
  })

  it('throws on finding with invalid severity (strict)', () => {
    const input = JSON.stringify([
      { severity: 'CRITICAL', location: 'f.ts:1', description: 'bad', suggestion: '' },
    ])
    expect(() => normalizeExternalInput(input)).toThrow('severity')
  })

  it('throws on finding missing location (strict)', () => {
    const input = JSON.stringify([
      { severity: 'P1', description: 'bad', suggestion: '' },
    ])
    expect(() => normalizeExternalInput(input)).toThrow('location')
  })

  it('normalizes empty array to approved output', () => {
    const result = normalizeExternalInput('[]')
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('normalizes wrapper with empty findings', () => {
    const input = JSON.stringify({ approved: true, findings: [], summary: 'clean' })
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('preserves approved=false from wrapper even with empty findings', () => {
    const input = JSON.stringify({ approved: false, findings: [], summary: 'manual block' })
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(false)
  })

  it('handles bare array with surrounding prose text', () => {
    const input = 'Here are my findings:\n[{"severity": "P2", "location": "f.ts:1", "description": "nit", "suggestion": ""}]\nEnd of review.'
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('P2')
  })

  it('handles bare array with trailing text after ]', () => {
    const input = '[{"severity": "P2", "location": "f.ts:1", "description": "nit", "suggestion": ""}]\nEnd of review.'
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
  })

  it('coerces missing approved to false in wrapper format', () => {
    const input = JSON.stringify({ findings: [], summary: 'clean' })
    const result = normalizeExternalInput(input)
    expect(result.approved).toBe(false)
  })
})

describe('readInput', () => {
  it('returns inline JSON starting with {', () => {
    const result = readInput('{"findings": []}')
    expect(result).toBe('{"findings": []}')
  })

  it('returns inline JSON starting with [', () => {
    const result = readInput('[{"severity": "P1"}]')
    expect(result).toBe('[{"severity": "P1"}]')
  })

  it('returns inline JSON with leading whitespace', () => {
    const result = readInput('  {"findings": []}')
    expect(result).toBe('  {"findings": []}')
  })

  it('reads from file path', () => {
    const tmpFile = path.join(os.tmpdir(), `mmr-readinput-${Date.now()}.json`)
    fs.writeFileSync(tmpFile, '{"approved": true, "findings": [], "summary": "ok"}')
    try {
      const result = readInput(tmpFile)
      expect(result).toBe('{"approved": true, "findings": [], "summary": "ok"}')
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  it('throws on nonexistent non-JSON input', () => {
    expect(() => readInput('not-a-file-or-json')).toThrow('Input not found')
  })
})

describe('normalizeExternalInput edge cases', () => {
  it('handles fenced bare array with surrounding prose', () => {
    const input = 'Review output:\n```json\n[{"severity": "P2", "location": "f.ts:1", "description": "nit", "suggestion": ""}]\n```\nEnd.'
    const result = normalizeExternalInput(input)
    expect(result.findings).toHaveLength(1)
  })
})
