import { describe, expect, it } from 'vitest'
import { extractModelJson } from '../../src/core/cli-envelope.js'

describe('extractModelJson', () => {
  it('extracts a plain JSON object from surrounding prose + fences', () => {
    const out = extractModelJson('blah\n```json\n{"a":1}\n```\nok') as { a: number }
    expect(out.a).toBe(1)
  })

  it('unwraps a claude-style result envelope', () => {
    const inner = JSON.stringify({ a: 2 })
    const out = extractModelJson(JSON.stringify({ type: 'result', result: inner })) as { a: number }
    expect(out.a).toBe(2)
  })

  it('unwraps a grok-style text envelope', () => {
    const out = extractModelJson(JSON.stringify({ text: '{"a":3}' })) as { a: number }
    expect(out.a).toBe(3)
  })

  it('returns the object directly when it already has a non-wrapper shape', () => {
    const out = extractModelJson('{"items":[],"summary":"x"}') as { summary: string }
    expect(out.summary).toBe('x')
  })

  it('returns null on non-JSON', () => {
    expect(extractModelJson('only prose, no json')).toBeNull()
  })
})
