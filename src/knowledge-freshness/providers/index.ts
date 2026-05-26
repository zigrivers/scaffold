import type { Dispatcher } from '../audit-runner.js'
import { buildAnthropicDispatcher } from './anthropic.js'

export type Provider = 'anthropic' | 'deepseek'

const KNOWN_PROVIDERS: readonly Provider[] = ['anthropic', 'deepseek']

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
 *   4. Both API keys present       → error (ambiguous)
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
      'or `npm install -g @anthropic-ai/claude-code`), OR switch to the ' +
      'deepseek provider (export DEEPSEEK_API_KEY and set ' +
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
  // Rules 3/4: infer from API keys.
  const hasAnthropic = !!input.env['ANTHROPIC_API_KEY']
  const hasDeepseek = !!input.env['DEEPSEEK_API_KEY']
  if (hasAnthropic && hasDeepseek) {
    throw new Error(
      'provider selection ambiguous: both ANTHROPIC_API_KEY and DEEPSEEK_API_KEY are set. ' +
      'Set KNOWLEDGE_FRESHNESS_PROVIDER=anthropic|deepseek (or pass --provider) to disambiguate.',
    )
  }
  if (hasDeepseek) return 'deepseek'
  if (hasAnthropic) return 'anthropic'
  // Rule 5: PATH probe (no env vars set, but Claude Code is installed and
  // already authenticated via `claude /login`).
  if (input.claudeOnPath) return 'anthropic'
  // Rule 6: nothing.
  throw new Error(
    'no provider configured for the knowledge-freshness audit. Either:\n' +
    '  - install Claude Code and run `claude /login` (anthropic provider), OR\n' +
    '  - export ANTHROPIC_API_KEY AND have `claude` on PATH (anthropic, env-var auth), OR\n' +
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
}

export function buildDispatcher(provider: Provider, opts: BuildDispatcherOptions): Dispatcher {
  if (provider === 'anthropic') {
    return buildAnthropicDispatcher({ timeoutSec: opts.timeoutSec })
  }
  if (provider === 'deepseek') {
    throw new Error('deepseek provider not yet wired — see Task 4')
  }
  // Unreachable: the type narrowing above is exhaustive.
  throw new Error(`unknown provider ${provider as string}`)
}
