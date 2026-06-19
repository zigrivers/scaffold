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

  it('auth.check uses the cross-version `scaffold version` subcommand, not `scaffold --version`', () => {
    // The `version` subcommand works on every scaffold release; `scaffold --version`
    // exits 1 on older installs that predate the `--version` flag — which is in
    // failure_exit_codes, so the `&&` auth chain would always report failure there.
    const check = BUILTIN_CHANNELS['doc-conformance']?.auth?.check ?? ''
    expect(check).not.toMatch(/scaffold\s+--version/)
    expect(check).toMatch(/scaffold version/)
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

describe('BUILTIN_CHANNELS — antigravity', () => {
  const ch = () => BUILTIN_CHANNELS.antigravity

  it('exposes an antigravity channel enabled by default', () => {
    expect(ch()).toBeDefined()
    expect(ch()?.enabled).toBe(true)
  })

  it('invokes the agy CLI in print mode', () => {
    expect(ch()?.command).toBe('agy')
    expect(ch()?.flags).toContain('--print')
  })

  it('delivers the prompt via stdin', () => {
    expect(ch()?.prompt_delivery).toBe('stdin')
  })

  it('runs in a neutral cwd but does NOT override HOME/XDG (agy creds live under real HOME)', () => {
    expect(ch()?.cwd).toBe('{{neutral_cwd}}')
    expect(ch()?.env).toEqual({})
    expect(ch()?.env).not.toHaveProperty('HOME')
    expect(ch()?.env).not.toHaveProperty('XDG_CONFIG_HOME')
  })

  it('is hardened with --sandbox and auto-approve, with a bounded print timeout', () => {
    expect(ch()?.flags).toContain('--sandbox')
    expect(ch()?.flags).toContain('--dangerously-skip-permissions')
    expect(ch()?.flags).toContain('--print-timeout')
    expect(ch()?.flags).toContain('300s') // guard the bound value, not just the flag
  })

  it('parses plain model output with the default findings parser', () => {
    expect(ch()?.output_parser).toBe('default')
  })

  it('auth.check matches BOTH auth-failure sentinels and recovery triggers the OAuth flow', () => {
    const check = ch()?.auth?.check ?? ''
    expect(check).toMatch(/authentication required/i)
    expect(check).toMatch(/authentication timed out/i)
    expect(ch()?.auth?.failure_exit_codes).toContain(41)
    expect(ch()?.auth?.recovery).toMatch(/agy -p/)
  })
})

describe('BUILTIN_CHANNELS — opencode', () => {
  const ch = () => BUILTIN_CHANNELS.opencode

  it('exposes an opencode channel DISABLED by default (opt-in, like doc-conformance)', () => {
    expect(ch()).toBeDefined()
    expect(ch()?.enabled).toBe(false)
  })

  it('invokes the opencode `run` subcommand', () => {
    expect(ch()?.command).toBe('opencode run')
  })

  it('delivers the prompt via stdin (verified: `opencode run` reads stdin)', () => {
    expect(ch()?.prompt_delivery).toBe('stdin')
  })

  it('runs in a neutral cwd but does NOT override HOME/XDG (opencode creds live under real HOME)', () => {
    // Same posture as antigravity: creds at ~/.local/share/opencode/auth.json are
    // found via real $HOME, so neutralizing HOME would break auth. The neutral cwd
    // gives a closed-book review (no repo access — only the diff in the prompt).
    expect(ch()?.cwd).toBe('{{neutral_cwd}}')
    expect(ch()?.env).toEqual({})
    expect(ch()?.env).not.toHaveProperty('HOME')
    expect(ch()?.env).not.toHaveProperty('XDG_CONFIG_HOME')
  })

  it('hardens the run: auto-approve (no headless approval hang) and no external plugins', () => {
    expect(ch()?.flags).toContain('--dangerously-skip-permissions')
    expect(ch()?.flags).toContain('--pure')
  })

  it('parses plain model output with the default findings parser', () => {
    expect(ch()?.output_parser).toBe('default')
  })

  it('auth.check probes a real run; a non-zero exit fails auth, recovery points at opencode auth login', () => {
    const check = ch()?.auth?.check ?? ''
    expect(check).toMatch(/opencode run/)
    expect(ch()?.auth?.failure_exit_codes).toContain(1)
    expect(ch()?.auth?.recovery).toBe('opencode auth login')
  })

  it('is NOT in the default-enabled set (opt-in only)', () => {
    const defaultEnabled = Object.entries(DEFAULT_CONFIG.channels)
      .filter(([, channel]) => channel.enabled)
      .map(([name]) => name)
    expect(defaultEnabled).not.toContain('opencode')
  })
})

describe('default reviewer selection', () => {
  it('uses agy/antigravity instead of the deprecated Gemini CLI by default', () => {
    expect(BUILTIN_CHANNELS.antigravity?.enabled).toBe(true)
    expect(BUILTIN_CHANNELS.antigravity?.command).toBe('agy')
    expect(BUILTIN_CHANNELS.gemini?.enabled).toBe(false)

    const defaultEnabled = Object.entries(DEFAULT_CONFIG.channels)
      .filter(([, channel]) => channel.enabled)
      .map(([name]) => name)
    expect(defaultEnabled).toContain('antigravity')
    expect(defaultEnabled).not.toContain('gemini')
  })
})

describe('DEFAULT_CONFIG compensator (T1-G)', () => {
  it('omits the compensator block (so back-compat resolveCompensatorDispatch kicks in)', () => {
    expect(DEFAULT_CONFIG.defaults.compensator).toBeUndefined()
  })
})
