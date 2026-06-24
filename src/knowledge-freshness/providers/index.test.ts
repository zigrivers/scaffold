import { describe, it, expect, vi } from 'vitest'
import { resolveProvider, buildDispatcher } from './index.js'
import type { ZaiFetch } from './zai.js'

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

  it('rule 1: --provider zai wins', () => {
    expect(resolveProvider(opts({ ZAI_API_KEY: 'z' }, { provider: 'zai' }))).toBe('zai')
  })

  it('rule 2: KNOWLEDGE_FRESHNESS_PROVIDER=zai', () => {
    // Env var alone (no API key in env) must still resolve to zai — this
    // exercises rule 2 specifically, not key inference (rule 3, tested below).
    expect(resolveProvider(opts({ KNOWLEDGE_FRESHNESS_PROVIDER: 'zai' }, {}))).toBe('zai')
  })

  it('rule 3: only ZAI_API_KEY set → zai', () => {
    expect(resolveProvider(opts({ ZAI_API_KEY: 'z' }))).toBe('zai')
  })

  it('rule 4: ZAI_API_KEY + DEEPSEEK_API_KEY without explicit choice → ambiguous error', () => {
    // The fallback config DOES set both keys — but it also sets
    // KNOWLEDGE_FRESHNESS_PROVIDER explicitly, so rule 2 short-circuits
    // before this inference path. Inference with two keys and no explicit
    // choice stays ambiguous on purpose.
    const call = () => resolveProvider(opts({ ZAI_API_KEY: 'z', DEEPSEEK_API_KEY: 'd' }))
    expect(call).toThrow(/ambiguous/i)
    expect(call).toThrow(/KNOWLEDGE_FRESHNESS_PROVIDER/)
  })

  it('rule 4: all three keys without explicit choice → ambiguous error', () => {
    const call = () => resolveProvider(opts({ ZAI_API_KEY: 'z', DEEPSEEK_API_KEY: 'd', ANTHROPIC_API_KEY: 'a' }))
    expect(call).toThrow(/ambiguous/i)
  })

  it('does not throw when --provider zai is specified (zai is a known provider)', () => {
    // Guard against a regression where zai is missing from KNOWN_PROVIDERS.
    expect(() => resolveProvider(opts({}, { provider: 'zai' }))).not.toThrow(/unknown provider/i)
  })
})

describe('buildDispatcher — zai wiring', () => {
  it('throws when zai is selected but ZAI_API_KEY is not in env', () => {
    expect(() => buildDispatcher('zai', { timeoutSec: 60, env: {} }))
      .toThrow(/ZAI_API_KEY env var is not set/)
  })

  it('constructs a Dispatcher when ZAI_API_KEY is set', () => {
    const d = buildDispatcher('zai', { timeoutSec: 60, env: { ZAI_API_KEY: 'z' } })
    expect(typeof d).toBe('function')
  })
})

describe('buildDispatcher — fallback wiring', () => {
  it('returns a bare dispatcher when no fallback env var is set', () => {
    const d = buildDispatcher('zai', { timeoutSec: 60, env: { ZAI_API_KEY: 'z' } })
    expect(typeof d).toBe('function')
  })

  it('builds a WORKING composite that falls back to the secondary when the primary fails', async () => {
    // Strong wiring check (not just typeof===function): inject a fetch that
    // makes the zai primary fail with a retryable 429 and the deepseek
    // fallback succeed, then assert the composite returns the SECONDARY's
    // content. This fails if the fallback wrapping is ever dropped and a bare
    // primary dispatcher is returned.
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).includes('z.ai')) return new Response('rate limited', { status: 429 })
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'from-deepseek' } }] }),
        { status: 200 },
      )
    }) as unknown as ZaiFetch
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const d = buildDispatcher('zai', {
      timeoutSec: 60,
      env: { ZAI_API_KEY: 'z', DEEPSEEK_API_KEY: 'd', KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER: 'deepseek' },
      fetchImpl,
    })
    expect(await d('prompt')).toBe('from-deepseek')
  })

  it('does NOT fall back when the primary fails with a non-retryable error', async () => {
    // A 401 from the primary is a permanent misconfiguration; the composite
    // must surface it rather than silently running on the fallback.
    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).includes('z.ai')) return new Response('unauthorized', { status: 401 })
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'from-deepseek' } }] }),
        { status: 200 },
      )
    }) as unknown as ZaiFetch
    const d = buildDispatcher('zai', {
      timeoutSec: 60,
      env: { ZAI_API_KEY: 'z', DEEPSEEK_API_KEY: 'd', KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER: 'deepseek' },
      fetchImpl,
    })
    await expect(d('prompt')).rejects.toThrow(/HTTP 401/)
  })

  it('throws when the fallback provider is unknown', () => {
    expect(() => buildDispatcher('zai', {
      timeoutSec: 60,
      env: { ZAI_API_KEY: 'z', KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER: 'openai' },
    })).toThrow(/unknown.*fallback.*openai/i)
  })

  it('throws when the fallback provider equals the primary', () => {
    expect(() => buildDispatcher('zai', {
      timeoutSec: 60,
      env: { ZAI_API_KEY: 'z', KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER: 'zai' },
    })).toThrow(/fallback.*same.*primary/i)
  })

  it('throws when the fallback provider key is missing', () => {
    // primary zai is configured, but the deepseek fallback has no key — the
    // composite cannot be built, so fail at construction rather than at the
    // first fallback attempt.
    expect(() => buildDispatcher('zai', {
      timeoutSec: 60,
      env: { ZAI_API_KEY: 'z', KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER: 'deepseek' },
    })).toThrow(/DEEPSEEK_API_KEY env var is not set/)
  })
})

describe('buildDispatcher — deepseek wiring', () => {
  it('throws when deepseek is selected but DEEPSEEK_API_KEY is not in env', () => {
    expect(() => buildDispatcher('deepseek', { timeoutSec: 60, env: {} }))
      .toThrow(/DEEPSEEK_API_KEY env var is not set/)
  })

  it('constructs a Dispatcher when DEEPSEEK_API_KEY is set', () => {
    // We don't call the dispatcher (no fetch mock here) — just verify
    // construction succeeds.
    const d = buildDispatcher('deepseek', { timeoutSec: 60, env: { DEEPSEEK_API_KEY: 'sk-x' } })
    expect(typeof d).toBe('function')
  })
})
