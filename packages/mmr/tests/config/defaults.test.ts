import { describe, it, expect } from 'vitest'
import { BUILTIN_CHANNELS } from '../../src/config/defaults.js'

describe('BUILTIN_CHANNELS — doc-conformance', () => {
  it('exposes a doc-conformance channel', () => {
    expect(BUILTIN_CHANNELS['doc-conformance']).toBeDefined()
  })

  it('command invokes scaffold observe audit with --output-mode=mmr-findings', () => {
    expect(BUILTIN_CHANNELS['doc-conformance'].command).toMatch(/scaffold observe audit/)
    expect(BUILTIN_CHANNELS['doc-conformance'].command).toMatch(/--output-mode=mmr-findings/)
  })

  it('output_parser is set to doc-conformance', () => {
    expect(BUILTIN_CHANNELS['doc-conformance'].output_parser).toBe('doc-conformance')
  })

  it('auth.check verifies scaffold is installed', () => {
    expect(BUILTIN_CHANNELS['doc-conformance'].auth.check).toMatch(/scaffold/)
  })

  it('is disabled by default (requires explicit opt-in due to 3 LLM calls)', () => {
    expect(BUILTIN_CHANNELS['doc-conformance'].enabled).toBe(false)
  })
})
