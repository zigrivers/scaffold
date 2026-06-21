import { describe, expect, it } from 'vitest'
import { parseCritiqueOutput } from '../../src/core/critique-parser.js'

describe('parseCritiqueOutput', () => {
  it('parses fenced JSON surrounded by prose', () => {
    const raw = 'Here is my critique:\n```json\n' +
      '{"items":[{"kind":"concern","theme":"scaling","observation":"polling won\'t scale","recommendation":"use SSE"}],' +
      '"summary":"ok for a prototype"}\n```\nHope that helps.'
    const out = parseCritiqueOutput(raw)
    expect(out.items).toHaveLength(1)
    expect(out.items[0].kind).toBe('concern')
    expect(out.items[0].theme).toBe('scaling')
    expect(out.items[0].recommendation).toBe('use SSE')
    expect(out.summary).toBe('ok for a prototype')
  })

  it('coerces an invalid kind to consideration', () => {
    const raw = '{"items":[{"kind":"nonsense","theme":"t","observation":"o"}],"summary":""}'
    expect(parseCritiqueOutput(raw).items[0].kind).toBe('consideration')
  })

  it('drops items without an observation', () => {
    const raw = '{"items":[{"kind":"concern","theme":"t"},{"kind":"concern","theme":"u","observation":"real"}],"summary":""}'
    const out = parseCritiqueOutput(raw)
    expect(out.items).toHaveLength(1)
    expect(out.items[0].observation).toBe('real')
  })

  it('omits recommendation when absent', () => {
    const raw = '{"items":[{"kind":"open-question","theme":"scale","observation":"what is the target?"}],"summary":""}'
    expect(parseCritiqueOutput(raw).items[0].recommendation).toBeUndefined()
  })

  it('unwraps a claude-style {result: "...json..."} envelope', () => {
    const inner = JSON.stringify({
      items: [{ kind: 'concern', theme: 'scaling', observation: 'polling will not scale to many users' }],
      summary: 'prototype only',
    })
    const envelope = JSON.stringify({ type: 'result', is_error: false, result: inner })
    const out = parseCritiqueOutput(envelope)
    expect(out.items).toHaveLength(1)
    expect(out.items[0].theme).toBe('scaling')
    expect(out.summary).toBe('prototype only')
  })

  it('unwraps a grok-style {text: "...json..."} envelope', () => {
    const inner = '{"items":[{"kind":"alternative","theme":"sse","observation":"use server-sent events here"}],"summary":""}'
    const out = parseCritiqueOutput(JSON.stringify({ text: inner, thought: '...' }))
    expect(out.items[0].kind).toBe('alternative')
  })

  it('never throws on non-JSON — returns empty items + a diagnostic summary', () => {
    const out = parseCritiqueOutput('the model refused and wrote only prose')
    expect(out.items).toEqual([])
    expect(out.summary.toLowerCase()).toContain('parse')
  })
})
