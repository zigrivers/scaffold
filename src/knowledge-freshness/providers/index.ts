import type { Dispatcher } from '../audit-runner.js'
import { buildAnthropicDispatcher } from './anthropic.js'
import { buildDeepseekDispatcher, type DeepseekFetch } from './deepseek.js'
import { buildZaiDispatcher } from './zai.js'
import { buildFallbackDispatcher } from './fallback.js'

export type Provider = 'anthropic' | 'deepseek' | 'zai'

const KNOWN_PROVIDERS: readonly Provider[] = ['anthropic', 'deepseek', 'zai']

function isKnownProvider(s: string): s is Provider {
  return (KNOWN_PROVIDERS as readonly string[]).includes(s)
}

export interface ResolveProviderInput {
  /** Process env. Pass `process.env` in production; inject a stub in tests. */
  env: Record<string, string | undefined>
  /** Parsed CLI args. `provider` is set when the operator passed `--provider`. */
  args: { provider?: string }
  /** Whether the `claude` CLI is available on PATH. Inject in tests. */
  claudeOnPath: boolean
}

/**
 * Resolve which LLM provider the audit runner should use.
 *
 * Precedence (highest first):
 *   1. --provider <name>           (explicit flag — operator override)
 *   2. KNOWLEDGE_FRESHNESS_PROVIDER env var
 *   3. Single API key in env       (inferred)
 *   4. >1 API key present          → error (ambiguous)
 *   5. No env, claude on PATH      → anthropic (subprocess uses keychain)
 *   6. Nothing                     → error (no provider configured)
 *
 * Errors are thrown with operator-facing messages that name the exact env
 * var or flag the operator should set.
 */
export function resolveProvider(input: ResolveProviderInput): Provider {
  const choice = pickProviderFromRules(input)
  // Post-resolution runtime validation: ANY path that ends in 'anthropic'
  // requires the `claude` CLI on PATH because the dispatcher shells out.
  // This check covers BOTH inferred (rule-3b) and explicit (rule-1 flag,
  // rule-2 env) paths so an operator can't pick anthropic via flag/env and
  // then get a confusing command-not-found at first audit (round-4 F-001
  // of the plan review).
  if (choice === 'anthropic' && !input.claudeOnPath) {
    throw new Error(
      'anthropic provider selected but the `claude` CLI is not on PATH. ' +
      'The dispatcher invokes `claude -p` as a subprocess, so the CLI is ' +
      'required regardless of how the provider was chosen (--provider flag, ' +
      'KNOWLEDGE_FRESHNESS_PROVIDER env, or ANTHROPIC_API_KEY inference). ' +
      'Install Claude Code (`brew install anthropic/claude-code/claude-code` ' +
      'or `npm install -g @anthropic-ai/claude-code`), OR switch to an ' +
      'HTTP provider that needs no CLI — export ZAI_API_KEY and set ' +
      'KNOWLEDGE_FRESHNESS_PROVIDER=zai (or DEEPSEEK_API_KEY + ' +
      'KNOWLEDGE_FRESHNESS_PROVIDER=deepseek).',
    )
  }
  return choice
}

/**
 * Apply rules 1-6 to pick a Provider — does NOT enforce runtime
 * preconditions (claudeOnPath for anthropic). The wrapper above is the
 * single place where those preconditions are validated, so we only have
 * to maintain that invariant in one location.
 */
function pickProviderFromRules(input: ResolveProviderInput): Provider {
  // Rule 1: explicit flag wins.
  if (input.args.provider) {
    if (!isKnownProvider(input.args.provider)) {
      throw new Error(
        `unknown provider "${input.args.provider}" passed to --provider. ` +
        `Supported values: ${KNOWN_PROVIDERS.join(', ')}.`,
      )
    }
    return input.args.provider
  }
  // Rule 2: env var.
  const envChoice = input.env['KNOWLEDGE_FRESHNESS_PROVIDER']
  if (envChoice) {
    if (!isKnownProvider(envChoice)) {
      throw new Error(
        `unknown provider "${envChoice}" set in KNOWLEDGE_FRESHNESS_PROVIDER. ` +
        `Supported values: ${KNOWN_PROVIDERS.join(', ')}.`,
      )
    }
    return envChoice
  }
  // Rules 3/4: infer from API keys. More than one key present is ambiguous
  // (the operator must say which is primary — this is exactly the case the
  // fallback config hits, which is why the fallback config ALSO sets
  // KNOWLEDGE_FRESHNESS_PROVIDER explicitly so rule 2 short-circuits above).
  const present: Provider[] = []
  if (input.env['ZAI_API_KEY']) present.push('zai')
  if (input.env['DEEPSEEK_API_KEY']) present.push('deepseek')
  if (input.env['ANTHROPIC_API_KEY']) present.push('anthropic')
  if (present.length > 1) {
    const setVars = present
      .map((p) => (p === 'zai' ? 'ZAI_API_KEY' : p === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'ANTHROPIC_API_KEY'))
      .join(', ')
    throw new Error(
      `provider selection ambiguous: multiple API keys are set (${setVars}). ` +
      `Set KNOWLEDGE_FRESHNESS_PROVIDER=${KNOWN_PROVIDERS.join('|')} (or pass --provider) to disambiguate.`,
    )
  }
  if (present.length === 1) return present[0]
  // Rule 5: PATH probe (no env vars set, but Claude Code is installed and
  // already authenticated via `claude /login`).
  if (input.claudeOnPath) return 'anthropic'
  // Rule 6: nothing.
  throw new Error(
    'no provider configured for the knowledge-freshness audit. Either:\n' +
    '  - install Claude Code and run `claude /login` (anthropic provider), OR\n' +
    '  - export ANTHROPIC_API_KEY AND have `claude` on PATH (anthropic, env-var auth), OR\n' +
    '  - export ZAI_API_KEY (zai provider, no CLI install needed), OR\n' +
    '  - export DEEPSEEK_API_KEY (deepseek provider, no CLI install needed).\n' +
    'See docs/knowledge-freshness/operations.md §4 for details.',
  )
}

/**
 * Construct a Dispatcher for the chosen provider. Each provider's
 * implementation lives in its own file. This factory is the ONLY place
 * the audit-run-entry CLI knows about provider differences.
 */
export interface BuildDispatcherOptions {
  /** Per-fetch / per-subprocess timeout in seconds. */
  timeoutSec: number
  /** Process env (production: `process.env`). Used by provider implementations
   *  for API keys and any optional overrides (e.g. model name). */
  env: Record<string, string | undefined>
  /** Test-injectable fetch for the HTTP providers (zai/deepseek). Production
   *  omits this so the providers use undici's fetch. */
  fetchImpl?: DeepseekFetch
  /** Whether the `claude` CLI is on PATH. Pass `false` to fail construction
   *  of an anthropic dispatcher (primary OR fallback) early, instead of at
   *  first dispatch. Leave undefined to skip the check (back-compat). */
  claudeOnPath?: boolean
}

export function buildDispatcher(provider: Provider, opts: BuildDispatcherOptions): Dispatcher {
  const primary = buildSingleDispatcher(provider, opts)
  // Optional primary→secondary fallback. When set, the primary is tried
  // first for every prompt and the secondary only runs if that call throws
  // (per-entry, no cross-call latch — see fallback.ts). The cron sets this
  // to chain zai → deepseek.
  const fallbackName = opts.env['KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER']
  if (!fallbackName) return primary
  if (!isKnownProvider(fallbackName)) {
    throw new Error(
      `unknown fallback provider "${fallbackName}" set in ` +
      `KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER. Supported values: ${KNOWN_PROVIDERS.join(', ')}.`,
    )
  }
  if (fallbackName === provider) {
    throw new Error(
      `KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER ("${fallbackName}") is the same as the ` +
      'primary provider. The fallback must be a different provider, or unset it.',
    )
  }
  // Build the secondary eagerly so a misconfigured fallback (e.g. missing
  // key) fails at construction time, not silently at the first fallback.
  const secondary = buildSingleDispatcher(fallbackName, opts)
  return buildFallbackDispatcher({
    primary,
    secondary,
    primaryName: provider,
    secondaryName: fallbackName,
  })
}

/**
 * Build a single provider's dispatcher with no fallback wrapping. This is
 * the per-provider switch; `buildDispatcher` composes it with an optional
 * fallback chain.
 */
function buildSingleDispatcher(provider: Provider, opts: BuildDispatcherOptions): Dispatcher {
  if (provider === 'anthropic') {
    // The anthropic dispatcher shells out to `claude -p`, so the CLI must be
    // on PATH. When the caller has probed PATH and passed `false`, fail here
    // (covers an anthropic FALLBACK too, not just a primary resolved via the
    // CLI's resolveProvider path). Undefined skips the check for back-compat.
    if (opts.claudeOnPath === false) {
      throw new Error(
        'anthropic provider selected but the `claude` CLI is not on PATH. ' +
        'The dispatcher invokes `claude -p` as a subprocess, so the CLI is ' +
        'required. Install Claude Code, or pick a different provider (e.g. ' +
        'export ZAI_API_KEY / DEEPSEEK_API_KEY).',
      )
    }
    return buildAnthropicDispatcher({ timeoutSec: opts.timeoutSec })
  }
  if (provider === 'deepseek') {
    const apiKey = opts.env['DEEPSEEK_API_KEY']
    if (!apiKey) {
      throw new Error(
        'deepseek provider selected but DEEPSEEK_API_KEY env var is not set. ' +
        'Either export the key or pick a different provider via --provider / ' +
        'KNOWLEDGE_FRESHNESS_PROVIDER.',
      )
    }
    const modelOverride = opts.env['KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL']
    return buildDeepseekDispatcher({
      apiKey,
      timeoutSec: opts.timeoutSec,
      model: modelOverride,
      fetchImpl: opts.fetchImpl,
    })
  }
  if (provider === 'zai') {
    const apiKey = opts.env['ZAI_API_KEY']
    if (!apiKey) {
      throw new Error(
        'zai provider selected but ZAI_API_KEY env var is not set. ' +
        'Either export the key or pick a different provider via --provider / ' +
        'KNOWLEDGE_FRESHNESS_PROVIDER.',
      )
    }
    const modelOverride = opts.env['KNOWLEDGE_FRESHNESS_ZAI_MODEL']
    return buildZaiDispatcher({
      apiKey,
      timeoutSec: opts.timeoutSec,
      model: modelOverride,
      fetchImpl: opts.fetchImpl,
    })
  }
  // Unreachable: the type narrowing above is exhaustive.
  throw new Error(`unknown provider ${provider as string}`)
}
