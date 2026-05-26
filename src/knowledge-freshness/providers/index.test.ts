import { describe, it, expect } from 'vitest'
import { resolveProvider } from './index.js'

// `claudeOnPath` is injected so tests don't depend on the host's $PATH.
// We type `env` as `Record<string, string | undefined>` directly rather
// than via a narrow named `interface` — round-3 F-003 of the plan review:
// a narrow interface lacks an index signature and won't satisfy the
// `Record<string, string | undefined>` parameter of `resolveProvider` in
// strict mode.
const opts = (
  env: Record<string, string | undefined>,
  args: { provider?: string } = {},
  claudeOnPath = false,
) => ({ env, args, claudeOnPath })

describe('resolveProvider', () => {
  it('rule 1: --provider flag wins over everything', () => {
    const env = { ANTHROPIC_API_KEY: 'a', DEEPSEEK_API_KEY: 'd', KNOWLEDGE_FRESHNESS_PROVIDER: 'anthropic' }
    // deepseek skips the PATH check entirely so claudeOnPath defaults to false here.
    expect(resolveProvider(opts(env, { provider: 'deepseek' }))).toBe('deepseek')
    // anthropic requires `claude` on PATH (round-4 F-001). The flag wins over env/keys,
    // but the post-resolution PATH precondition still applies, so pass claudeOnPath=true.
    expect(resolveProvider(opts(env, { provider: 'anthropic' }, true))).toBe('anthropic')
  })

  it('rule 2: KNOWLEDGE_FRESHNESS_PROVIDER env var when no flag', () => {
    const env = { ANTHROPIC_API_KEY: 'a', DEEPSEEK_API_KEY: 'd', KNOWLEDGE_FRESHNESS_PROVIDER: 'deepseek' }
    expect(resolveProvider(opts(env))).toBe('deepseek')
  })

  it('rule 3a: only DEEPSEEK_API_KEY set → deepseek', () => {
    expect(resolveProvider(opts({ DEEPSEEK_API_KEY: 'd' }))).toBe('deepseek')
  })

  it('rule 3b: ANTHROPIC_API_KEY set AND claude on PATH → anthropic', () => {
    expect(resolveProvider(opts({ ANTHROPIC_API_KEY: 'a' }, {}, true))).toBe('anthropic')
  })

  it('rule 3b error: ANTHROPIC_API_KEY set but claude NOT on PATH → error', () => {
    // Round-3 F-001: the env var alone is insufficient because the
    // anthropic dispatcher shells out to `claude -p`. Surface this at
    // resolveProvider time, not at first audit dispatch.
    const call = () => resolveProvider(opts({ ANTHROPIC_API_KEY: 'a' }, {}, false))
    expect(call).toThrow(/`claude` CLI is not on PATH/)
  })

  it('rule-1 error: --provider anthropic but claude NOT on PATH → error', () => {
    // Round-4 F-001: the post-resolution PATH check covers EVERY anthropic
    // selection path, not just the inferred-from-env one. An operator who
    // explicitly forces --provider anthropic on a machine without Claude
    // Code installed gets a clear early error instead of command-not-found
    // at first audit.
    const call = () => resolveProvider(opts({}, { provider: 'anthropic' }, false))
    expect(call).toThrow(/`claude` CLI is not on PATH/)
  })

  it('rule-2 error: KNOWLEDGE_FRESHNESS_PROVIDER=anthropic but claude NOT on PATH → error', () => {
    // Same protection on the env-var path.
    const call = () => resolveProvider(opts({ KNOWLEDGE_FRESHNESS_PROVIDER: 'anthropic' }, {}, false))
    expect(call).toThrow(/`claude` CLI is not on PATH/)
  })

  it('rule-1 explicit deepseek skips the PATH check entirely', () => {
    // Sanity check: the PATH precondition is anthropic-only. deepseek
    // doesn't need a CLI.
    expect(resolveProvider(opts({ DEEPSEEK_API_KEY: 'd' }, { provider: 'deepseek' }, false))).toBe('deepseek')
  })

  it('rule 4: both keys set without explicit choice → error with helpful message', () => {
    // The thrown message can list the env-var and the --provider flag in
    // either order — assert each substring independently so a wording
    // change to the message doesn't break the test.
    const call = () => resolveProvider(opts({ ANTHROPIC_API_KEY: 'a', DEEPSEEK_API_KEY: 'd' }))
    expect(call).toThrow(/ambiguous/i)
    expect(call).toThrow(/KNOWLEDGE_FRESHNESS_PROVIDER/)
    expect(call).toThrow(/--provider/)
  })

  it('rule 5: no env vars but claude on PATH → anthropic (keychain delegation)', () => {
    expect(resolveProvider(opts({}, {}, true))).toBe('anthropic')
  })

  it('rule 6: no env vars and no claude on PATH → error with setup instructions', () => {
    // The setup-instructions message spans multiple lines — use [\s\S]* so
    // the match crosses newlines, and assert each key substring independently
    // since they appear in human-readable order (ANTHROPIC then DEEPSEEK).
    const call = () => resolveProvider(opts({}, {}, false))
    expect(call).toThrow(/no provider configured/i)
    expect(call).toThrow(/ANTHROPIC_API_KEY/)
    expect(call).toThrow(/DEEPSEEK_API_KEY/)
  })

  it('rejects an invalid --provider flag value', () => {
    expect(() => resolveProvider(opts({}, { provider: 'openai' }, true)))
      .toThrow(/unknown provider "openai"/i)
  })

  it('rejects an invalid KNOWLEDGE_FRESHNESS_PROVIDER env value', () => {
    expect(() => resolveProvider(opts({ KNOWLEDGE_FRESHNESS_PROVIDER: 'gemini' }, {}, true)))
      .toThrow(/unknown provider "gemini"/i)
  })
})
