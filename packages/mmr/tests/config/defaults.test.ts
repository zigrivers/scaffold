import { describe, it, expect } from 'vitest'
import { BUILTIN_CHANNELS, DEFAULT_CONFIG } from '../../src/config/defaults.js'

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

describe('BUILTIN_CHANNELS — grok', () => {
  it('exposes a grok channel enabled by default', () => {
    expect(BUILTIN_CHANNELS.grok).toBeDefined()
    expect(BUILTIN_CHANNELS.grok?.enabled).toBe(true)
  })

  it('invokes the grok CLI', () => {
    expect(BUILTIN_CHANNELS.grok?.command).toBe('grok')
  })

  it('delivers the prompt via a file (grok -p/--prompt-file requires an arg, ignores stdin)', () => {
    expect(BUILTIN_CHANNELS.grok?.prompt_delivery).toBe('prompt-file')
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('--prompt-file')
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('{{prompt_file}}')
  })

  it('requests JSON headless output', () => {
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('--output-format')
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('json')
  })

  it('unwraps grok JSON ($.text) before the default findings parser', () => {
    const parser = BUILTIN_CHANNELS.grok?.output_parser
    expect(typeof parser).toBe('object')
    if (typeof parser === 'object') {
      expect(parser).toMatchObject({ kind: 'unwrap-jsonpath', wrap: '$.text' })
    }
  })

  it('auth.check probes grok models and recovery points at grok login', () => {
    expect(BUILTIN_CHANNELS.grok?.auth?.check).toMatch(/grok models/)
    expect(BUILTIN_CHANNELS.grok?.auth?.recovery).toBe('grok login')
  })

  it('disables cross-session memory', () => {
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('--no-memory')
  })

  it('locks tools to a web-only allowlist (no filesystem tools)', () => {
    const flags = BUILTIN_CHANNELS.grok?.flags ?? []
    const i = flags.indexOf('--tools')
    expect(i).toBeGreaterThanOrEqual(0)
    const value = flags[i + 1] ?? ''
    expect(value.split(',')).toEqual(['web_search', 'web_fetch'])
    expect(value).not.toMatch(/read_file|write_file/)
  })

  it('disables agentic subagents and planning for determinism', () => {
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('--no-subagents')
    expect(BUILTIN_CHANNELS.grok?.flags).toContain('--no-plan')
  })

  it('isolates host config via neutral HOME/XDG and cwd', () => {
    expect(BUILTIN_CHANNELS.grok?.env?.HOME).toBe('{{neutral_home}}')
    expect(BUILTIN_CHANNELS.grok?.env?.XDG_CONFIG_HOME).toBe('{{neutral_home}}')
    expect((BUILTIN_CHANNELS.grok as { cwd?: string }).cwd).toBe('{{neutral_cwd}}')
  })

  it('does NOT disable web search (web stays available by default)', () => {
    expect(BUILTIN_CHANNELS.grok?.flags).not.toContain('--disable-web-search')
  })
})

describe('DEFAULT_CONFIG compensator (T1-G)', () => {
  it('omits the compensator block (so back-compat resolveCompensatorDispatch kicks in)', () => {
    expect(DEFAULT_CONFIG.defaults.compensator).toBeUndefined()
  })
})
