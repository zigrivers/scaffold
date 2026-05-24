import { describe, it, expect } from 'vitest'
import { BUILTIN_CHANNELS } from '../../src/config/defaults.js'

describe('BUILTIN_CHANNELS — doc-conformance', () => {
  it('exposes a doc-conformance channel', () => {
    expect(BUILTIN_CHANNELS['doc-conformance']).toBeDefined()
  })

  it('command invokes scaffold observe audit with --output-mode=mmr-findings', () => {
    const channel = BUILTIN_CHANNELS['doc-conformance']
    expect(channel).toBeDefined()
    expect(channel?.command).toMatch(/scaffold observe audit/)
    expect(channel?.command).toMatch(/--output-mode=mmr-findings/)
  })

  it('output_parser is set to doc-conformance', () => {
    expect(BUILTIN_CHANNELS['doc-conformance']?.output_parser).toBe('doc-conformance')
  })

  it('auth.check verifies scaffold is installed and claude can run an authenticated prompt', () => {
    expect(BUILTIN_CHANNELS['doc-conformance']?.auth?.check).toMatch(/scaffold/)
    expect(BUILTIN_CHANNELS['doc-conformance']?.auth?.check).toMatch(/claude -p/)
  })

  it('auth timeout is 20s to accommodate a live LLM probe', () => {
    expect(BUILTIN_CHANNELS['doc-conformance']?.auth?.timeout).toBe(20)
  })

  it('failure_exit_codes includes 127 so a missing binary fails auth rather than silently passing', () => {
    expect(BUILTIN_CHANNELS['doc-conformance']?.auth?.failure_exit_codes).toContain(127)
  })

  it('is disabled by default (requires explicit opt-in due to 3 LLM calls)', () => {
    expect(BUILTIN_CHANNELS['doc-conformance']?.enabled).toBe(false)
  })
})
