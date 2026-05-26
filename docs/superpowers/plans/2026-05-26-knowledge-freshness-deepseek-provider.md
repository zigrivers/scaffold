# Knowledge-Freshness DeepSeek Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DeepSeek as an alternative LLM provider for the knowledge-freshness per-entry audit dispatch. Anthropic remains the default for local dev (rule-5 PATH-probe fallthrough); the cron switches to DeepSeek's HTTP API via repo secret. MMR review is unchanged.

**Architecture:** New `src/knowledge-freshness/providers/` module with three files — `index.ts` (Provider type, 6-rule selection chain, dispatcher factory), `anthropic.ts` (factored-out subprocess from the current CLI), `deepseek.ts` (new HTTP dispatcher via undici). The `audit-run-entry` CLI shrinks to argv parsing + `resolveProvider` + `buildDispatcher`. The cron workflow's env block adds `DEEPSEEK_API_KEY` + `KNOWLEDGE_FRESHNESS_PROVIDER=deepseek` and drops the `npm install -g @anthropic-ai/claude-code` step.

**Tech Stack:** TypeScript, undici (HTTP), vitest (tests). All existing — no new deps.

**Companion design doc:** [`docs/superpowers/specs/2026-05-26-knowledge-freshness-deepseek-provider-design.md`](../specs/2026-05-26-knowledge-freshness-deepseek-provider-design.md). Read the Resolved Decisions table before starting.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/knowledge-freshness/providers/index.ts` | Create | `Provider` type, `resolveProvider()`, `buildDispatcher()` factory |
| `src/knowledge-freshness/providers/index.test.ts` | Create | All 7 precedence cases + clear-error messages |
| `src/knowledge-freshness/providers/anthropic.ts` | Create | `buildAnthropicDispatcher()` (factored from CLI) |
| `src/knowledge-freshness/providers/anthropic.test.ts` | Create | Command string + dispatcher contract |
| `src/knowledge-freshness/providers/deepseek.ts` | Create | `buildDeepseekDispatcher()` HTTP path |
| `src/knowledge-freshness/providers/deepseek.test.ts` | Create | Request shape + response parsing + error paths + model allowlist |
| `src/cli/commands/knowledge-freshness-audit-run-entry.ts` | Modify | Replace inline dispatcher construction with provider resolution + `--provider` flag |
| `.github/workflows/knowledge-freshness-audit.yml` | Modify | Drop claude-code install, add DEEPSEEK env vars |
| `docs/knowledge-freshness/operations.md` | Modify | Add "Choosing a provider" subsection + failure-mode entries |

---

## Task 1: Provider type + selection logic (TDD)

**Files:**
- Create: `src/knowledge-freshness/providers/index.ts`
- Create: `src/knowledge-freshness/providers/index.test.ts`

This task builds only the selection skeleton — no actual dispatchers yet. The factory throws "not implemented" for now; later tasks fill the providers in.

- [ ] **Step 1: Write failing tests for `resolveProvider`**

```typescript
// src/knowledge-freshness/providers/index.test.ts
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
    expect(resolveProvider(opts(env, { provider: 'deepseek' }))).toBe('deepseek')
    expect(resolveProvider(opts(env, { provider: 'anthropic' }))).toBe('anthropic')
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
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `npx vitest run src/knowledge-freshness/providers/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resolveProvider` + skeleton factory**

```typescript
// src/knowledge-freshness/providers/index.ts
import type { Dispatcher } from '../audit-runner.js'

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

export function buildDispatcher(provider: Provider, _opts: BuildDispatcherOptions): Dispatcher {
  if (provider === 'anthropic') {
    throw new Error('anthropic provider not yet wired — see Task 2')
  }
  if (provider === 'deepseek') {
    throw new Error('deepseek provider not yet wired — see Task 4')
  }
  // Unreachable: the type narrowing above is exhaustive.
  throw new Error(`unknown provider ${provider as string}`)
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `npx vitest run src/knowledge-freshness/providers/index.test.ts`
Expected: PASS (all 9 tests).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/knowledge-freshness/providers/index.ts \
        src/knowledge-freshness/providers/index.test.ts
git commit -m "$(cat <<'EOF'
feat(knowledge-freshness): provider selection skeleton (Task 1)

Implements `resolveProvider()` with the 6-rule precedence chain and a
`buildDispatcher()` factory whose provider implementations land in
follow-up tasks. 9 unit tests cover every case in the precedence
table plus invalid-value rejection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Factor out the Anthropic dispatcher (TDD)

**Files:**
- Create: `src/knowledge-freshness/providers/anthropic.ts`
- Create: `src/knowledge-freshness/providers/anthropic.test.ts`
- Modify: `src/knowledge-freshness/providers/index.ts` (wire it into the factory)

Pure refactor — the dispatcher logic moves from the CLI handler verbatim. No behavior change.

- [ ] **Step 1: Write failing test for `buildAnthropicDispatcher`**

```typescript
// src/knowledge-freshness/providers/anthropic.test.ts
import { describe, it, expect, vi } from 'vitest'
import { ANTHROPIC_COMMAND, buildAnthropicDispatcher } from './anthropic.js'

describe('anthropic provider', () => {
  it('exports the exact hardcoded command (decision #7 invariant)', () => {
    // The command MUST be literal — never read from project config — so the
    // threat model from the parent design's decision #7 holds. This test
    // acts as a tripwire if a future contributor introduces a templated
    // command string.
    expect(ANTHROPIC_COMMAND).toBe('claude -p --tools ""')
  })

  it('builds a Dispatcher that calls dispatchLlm with the hardcoded command + timeout', async () => {
    // We can't run a real subprocess in unit tests; we mock dispatchLlm at
    // the module level. The mock returns the full DispatchResult shape
    // (`parsed: unknown` on success, `raw?: string` on failure) so the
    // production typeof-derived DispatchLlmFn signature is satisfied.
    const dispatchSpy = vi.fn().mockResolvedValue({ ok: true, raw: 'verdict json here', parsed: undefined })
    const dispatcher = buildAnthropicDispatcher({ timeoutSec: 600, dispatchLlmFn: dispatchSpy })
    const result = await dispatcher('hello world')
    expect(dispatchSpy).toHaveBeenCalledWith({
      prompt: 'hello world',
      command: 'claude -p --tools ""',
      timeoutMs: 600_000,
    })
    expect(result).toBe('verdict json here')
  })

  it('throws with the dispatcher reason verbatim when dispatchLlm fails', async () => {
    const dispatchSpy = vi.fn().mockResolvedValue({ ok: false, reason: 'subprocess exit 127' })
    const dispatcher = buildAnthropicDispatcher({ timeoutSec: 60, dispatchLlmFn: dispatchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/subprocess exit 127/)
  })
})
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npx vitest run src/knowledge-freshness/providers/anthropic.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `anthropic.ts`**

```typescript
// src/knowledge-freshness/providers/anthropic.ts
import { dispatchLlm } from '../../observability/engine/llm-dispatcher.js'
import type { Dispatcher } from '../audit-runner.js'

/**
 * SECURITY: the dispatcher command is hardcoded to `claude -p --tools ""`,
 * never loaded from project-local config. The parent knowledge-freshness
 * design's decision #7 locked this in: a repo-local CLAUDE.md must NOT be
 * able to inject `command: rm -rf /` into the subprocess invocation.
 *
 * The `--tools ""` flag disables every built-in tool. The audit prompt
 * reads pre-fetched source bodies (round-6 F-001), so the model never
 * needs WebFetch or any other tool.
 *
 * Earlier rounds experimented with `--bare`, which broke keychain auth
 * for local devs. Reverted in Phase 1 Task 9 because the audit subcommand only
 * operates on scaffold's own content/knowledge/, never on a downstream
 * repo — so the round-7 isolation rationale doesn't apply.
 */
export const ANTHROPIC_COMMAND = 'claude -p --tools ""'

/**
 * Injectable dispatch function. Production uses the real `dispatchLlm`;
 * tests inject a mock. Typed via `typeof dispatchLlm` so the signature
 * stays in lock-step with the production function — no `as` cast
 * needed at the call site, and any future change to `DispatchResult`
 * surfaces as a type error here instead of a runtime surprise.
 */
export type DispatchLlmFn = typeof dispatchLlm

export interface BuildAnthropicDispatcherOptions {
  timeoutSec: number
  /** Injectable for tests. Defaults to the real `dispatchLlm`. */
  dispatchLlmFn?: DispatchLlmFn
}

export function buildAnthropicDispatcher(opts: BuildAnthropicDispatcherOptions): Dispatcher {
  const dispatch = opts.dispatchLlmFn ?? dispatchLlm
  const timeoutMs = opts.timeoutSec * 1000
  return async (prompt) => {
    const result = await dispatch({ prompt, command: ANTHROPIC_COMMAND, timeoutMs })
    if (!result.ok) {
      throw new Error(`audit dispatcher failed: ${result.reason}`)
    }
    // Return raw stdout. The audit runner's schema-aware extractor walks
    // the full response; the dispatcher's last-→-first parser is the
    // wrong shape for our use case (see audit-runner.ts findFirstMatchingJson).
    return result.raw
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/knowledge-freshness/providers/anthropic.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire into `index.ts` factory**

First, drop the leading underscore from the `_opts` parameter of
`buildDispatcher` in `src/knowledge-freshness/providers/index.ts` — the
parameter is about to become used, so the lint suppression name is no
longer appropriate:

```typescript
// BEFORE:
export function buildDispatcher(provider: Provider, _opts: BuildDispatcherOptions): Dispatcher {

// AFTER:
export function buildDispatcher(provider: Provider, opts: BuildDispatcherOptions): Dispatcher {
```

Then replace the "not yet wired" stub for `'anthropic'`:

```typescript
// src/knowledge-freshness/providers/index.ts (top imports — ADD)
import { buildAnthropicDispatcher } from './anthropic.js'

// In buildDispatcher() — REPLACE the anthropic branch:
  if (provider === 'anthropic') {
    return buildAnthropicDispatcher({ timeoutSec: opts.timeoutSec })
  }
```

- [ ] **Step 6: Run full vitest, confirm nothing broke**

Run: `npx vitest run src/knowledge-freshness/`
Expected: PASS (all existing knowledge-freshness tests + 3 new anthropic + 9 new resolver).

- [ ] **Step 7: Commit**

```bash
git add src/knowledge-freshness/providers/anthropic.ts \
        src/knowledge-freshness/providers/anthropic.test.ts \
        src/knowledge-freshness/providers/index.ts
git commit -m "$(cat <<'EOF'
feat(knowledge-freshness): factor anthropic dispatcher into provider module (Task 2)

Pure refactor: moves the `claude -p --tools ""` subprocess construction
from the audit-run-entry CLI into `providers/anthropic.ts`. The hardcoded
command string is exported so tests can assert it stays literal
(decision #7 tripwire). The factory in providers/index.ts now wires
the anthropic case; deepseek remains stubbed for Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: DeepSeek HTTP dispatcher — happy path (TDD)

**Files:**
- Create: `src/knowledge-freshness/providers/deepseek.ts`
- Create: `src/knowledge-freshness/providers/deepseek.test.ts`

This task implements only the happy path. Task 4 wires it into the factory and adds error / edge-case tests.

- [ ] **Step 1: Write failing happy-path test**

```typescript
// src/knowledge-freshness/providers/deepseek.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildDeepseekDispatcher, type DeepseekFetch } from './deepseek.js'

const ok = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

describe('deepseek provider — happy path', () => {
  it('POSTs to api.deepseek.com/chat/completions with bearer auth and the prompt as user message', async () => {
    // Keep a separate reference to the raw vi.fn() result BEFORE casting to
    // DeepseekFetch, so we can read .mock.calls without an `as unknown as`
    // dive into vitest internals (round-6 grok finding).
    const rawFetchMock = vi.fn(async () => ok({
      choices: [{ message: { content: '{"verdict":"current"}' } }],
    }))
    const fetchSpy = rawFetchMock as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({
      apiKey: 'sk-test-key',
      timeoutSec: 600,
      fetchImpl: fetchSpy,
    })
    const result = await dispatcher('the meta-prompt body')
    expect(result).toBe('{"verdict":"current"}')
    // Verify the request shape exactly.
    expect(rawFetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test-key',
          'Content-Type': 'application/json',
        }),
        body: expect.any(String),
      }),
    )
    // Parse the JSON body to verify the request shape precisely.
    const sentBody = JSON.parse(rawFetchMock.mock.calls[0][1]!.body as string)
    expect(sentBody).toEqual({
      model: 'deepseek-v4-flash',
      messages: [{ role: 'user', content: 'the meta-prompt body' }],
      // Round-5 F-001: thinking mode is explicitly disabled so temperature: 0
      // takes effect and the model goes straight to the JSON verdict.
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: 8192,
      stream: false,
    })
  })

  it('uses the model from KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL when set (allowlist member)', async () => {
    const rawFetchMock = vi.fn(async () => ok({
      choices: [{ message: { content: 'response' } }],
    }))
    const fetchSpy = rawFetchMock as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({
      apiKey: 'k',
      timeoutSec: 60,
      model: 'deepseek-v4-pro',
      fetchImpl: fetchSpy,
    })
    await dispatcher('x')
    expect(JSON.parse(rawFetchMock.mock.calls[0][1]!.body as string).model).toBe('deepseek-v4-pro')
  })
})
```

- [ ] **Step 2: Run tests, confirm failure**

Run: `npx vitest run src/knowledge-freshness/providers/deepseek.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `deepseek.ts`**

```typescript
// src/knowledge-freshness/providers/deepseek.ts
import { fetch as undiciFetch } from 'undici'
import { z } from 'zod'
import type { Dispatcher } from '../audit-runner.js'

/**
 * SECURITY: like decision #7's anthropic-subprocess invariant, the
 * DeepSeek URL and the model-name allowlist are HARDCODED. Project-local
 * config can never redirect this dispatcher at a different host or run
 * an unsupported model. Future contributors who feel tempted to read a
 * URL from `.scaffold/observability.yaml` here should re-read the parent
 * design doc's Resolved Decisions table first.
 */
export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

/**
 * Hardcoded allowlist of DeepSeek model names. KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL
 * may override the default, but only to a value in this set — never to
 * arbitrary text. The previously-supported `deepseek-chat` and
 * `deepseek-reasoner` IDs are deprecated and intentionally excluded.
 */
const ALLOWED_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const
export type DeepseekModel = typeof ALLOWED_MODELS[number]
export const DEFAULT_DEEPSEEK_MODEL: DeepseekModel = 'deepseek-v4-flash'

const MAX_TOKENS = 8192

/**
 * Minimal Zod schema for the DeepSeek (OpenAI-compatible) response. We
 * validate only the path we actually consume — `choices[0].message.content`
 * — rather than the whole API surface. Replaces the previous inline
 * `as { choices?: … }` cast (round-2 F-003) so the response shape is
 * checked at parse time, not implicitly via optional-chaining-then-typeof.
 */
const responseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }),
  })).min(1),
})

/** Test-injectable fetch. Production uses undici's fetch. */
export type DeepseekFetch = typeof undiciFetch

export interface BuildDeepseekDispatcherOptions {
  apiKey: string
  timeoutSec: number
  /** Optional model override (must be in the allowlist). */
  model?: string
  /** Test-injectable fetch implementation. Default: undici's fetch. */
  fetchImpl?: DeepseekFetch
}

export function buildDeepseekDispatcher(opts: BuildDeepseekDispatcherOptions): Dispatcher {
  const model = opts.model ?? DEFAULT_DEEPSEEK_MODEL
  if (!(ALLOWED_MODELS as readonly string[]).includes(model)) {
    throw new Error(
      `unsupported DeepSeek model "${model}". Allowed values: ${ALLOWED_MODELS.join(', ')}. ` +
      `Set KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL to one of those, or unset it to use the default.`,
    )
  }
  if (!opts.apiKey) {
    throw new Error('DEEPSEEK_API_KEY is required to use the deepseek provider')
  }
  const doFetch = opts.fetchImpl ?? undiciFetch
  const timeoutMs = opts.timeoutSec * 1000
  return async (prompt) => {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      // Thinking mode defaults ON for v4 models and IGNORES temperature
      // (per https://api-docs.deepseek.com/guides/thinking_mode). The
      // audit prompt produces structured JSON via the runner's schema-
      // aware extractor — chain-of-thought reasoning before the JSON
      // wastes the output token budget and produces non-deterministic
      // text. Disable thinking so temperature: 0 actually takes effect
      // and the response goes straight to the verdict.
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: MAX_TOKENS,
      stream: false,
    })
    // Timeout via AbortController + setTimeout — NOT AbortSignal.timeout(),
    // which is unavailable on the project's declared Node floor of 18.17
    // (round-6 grok finding). Matches the pattern llm-dispatcher.ts
    // already uses on the subprocess side.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      // Wrap the fetch itself in a try/catch so DNS failures, connection
      // resets, and timeout-aborts surface as a consistent
      // `deepseek dispatcher: …` error instead of leaking raw undici /
      // DOMException objects up the call stack (round-6 grok finding).
      try {
        res = await doFetch(DEEPSEEK_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${opts.apiKey}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: controller.signal,
        })
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        throw new Error(`deepseek dispatcher: fetch failed: ${reason}`)
      }
      // Always read the body as TEXT first so we can produce a useful
      // diagnostic on both non-2xx AND malformed-JSON responses
      // (round-2 F-004: previously `await res.json()` propagated a raw
      // SyntaxError that masked the actual response body).
      const rawText = await res.text().catch(() => '<unreadable>')
      if (res.status < 200 || res.status >= 300) {
        throw new Error(
          `deepseek dispatcher: HTTP ${res.status} from ${DEEPSEEK_URL}. ` +
          `Body (first 200 chars): ${rawText.slice(0, 200)}`,
        )
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(rawText)
      } catch {
        throw new Error(
          `deepseek dispatcher: response was not valid JSON. ` +
          `Body (first 200 chars): ${rawText.slice(0, 200)}`,
        )
      }
      const result = responseSchema.safeParse(parsed)
      if (!result.success) {
        throw new Error(
          `deepseek dispatcher: response missing choices[0].message.content. ` +
          `Truncated response: ${rawText.slice(0, 200)}`,
        )
      }
      const content = result.data.choices[0].message.content
      // Round-6 grok finding: an empty-string content satisfies the zod
      // schema but is useless to the runner's JSON extractor and produces
      // a confusing downstream parse error. Surface the empty-response
      // case with a clear message and the truncated body.
      if (content.trim() === '') {
        throw new Error(
          `deepseek dispatcher: model returned empty content. ` +
          `Truncated response: ${rawText.slice(0, 200)}`,
        )
      }
      return content
    } finally {
      clearTimeout(timer)
    }
  }
}
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npx vitest run src/knowledge-freshness/providers/deepseek.test.ts`
Expected: PASS (2 happy-path tests).

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/knowledge-freshness/providers/deepseek.ts \
        src/knowledge-freshness/providers/deepseek.test.ts
git commit -m "$(cat <<'EOF'
feat(knowledge-freshness): deepseek dispatcher happy path (Task 3)

POSTs the rendered meta-prompt to api.deepseek.com/chat/completions
with Bearer auth and returns choices[0].message.content for the
runner's JSON extractor. Model allowlist (deepseek-v4-flash,
deepseek-v4-pro) enforced at construction time; URL is a literal
constant. Error-path tests follow in Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: DeepSeek error paths + wire into factory (TDD)

**Files:**
- Modify: `src/knowledge-freshness/providers/deepseek.test.ts` (add error-path tests)
- Modify: `src/knowledge-freshness/providers/index.ts` (wire deepseek into factory)

- [ ] **Step 1: Write failing tests for error paths**

Append to `src/knowledge-freshness/providers/deepseek.test.ts`:

```typescript
describe('deepseek provider — error paths', () => {
  it('throws on non-2xx response with status + truncated body', async () => {
    const fetchSpy: DeepseekFetch = vi.fn(async () =>
      new Response('{"error":{"message":"rate limited","type":"rate_limit_error"}}', { status: 429 }),
    ) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/HTTP 429.*rate limited/i)
  })

  it('throws on a 200 response that lacks choices[0].message.content', async () => {
    const fetchSpy: DeepseekFetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    ) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/missing choices\[0\]\.message\.content/i)
  })

  it('throws a diagnostic error on a 200 response whose body is not JSON', async () => {
    // Round-2 F-004: must NOT propagate a bare SyntaxError. The dispatcher
    // catches the parse failure and throws a message containing the
    // truncated body so cron logs are actionable.
    const fetchSpy: DeepseekFetch = vi.fn(async () =>
      new Response('not json at all', {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/response was not valid JSON.*not json at all/i)
  })

  it('rejects an unsupported model at construction time (not at fetch time)', () => {
    expect(() => buildDeepseekDispatcher({
      apiKey: 'k', timeoutSec: 60, model: 'gpt-4',
    })).toThrow(/unsupported DeepSeek model "gpt-4".*deepseek-v4-flash.*deepseek-v4-pro/i)
  })

  it('rejects construction when apiKey is empty', () => {
    expect(() => buildDeepseekDispatcher({ apiKey: '', timeoutSec: 60 })).toThrow(/DEEPSEEK_API_KEY is required/)
  })

  it('normalizes transport errors (DNS / connection reset / fetch reject) into a deepseek-prefixed message (round-6 grok)', async () => {
    // The dispatcher must wrap the fetch call so raw undici / DOMException
    // errors don't leak to the cron logs unstyled. Mock a fetch that
    // rejects synchronously; assert the wrapped error has the diagnostic
    // prefix.
    const fetchSpy: DeepseekFetch = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.deepseek.com')
    }) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/deepseek dispatcher: fetch failed.*ENOTFOUND/i)
  })

  it('throws a diagnostic error when the model returns empty content (round-6 grok)', async () => {
    // A 200 response with content === "" satisfies the zod schema but is
    // useless to the runner's JSON extractor. The dispatcher must surface
    // it with a clear message rather than handing back an empty string.
    const fetchSpy: DeepseekFetch = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] }), { status: 200 }),
    ) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/model returned empty content/i)
  })
})
```

- [ ] **Step 2: Run tests, confirm pass (no impl changes needed — Task 3's code already covers these)**

Run: `npx vitest run src/knowledge-freshness/providers/deepseek.test.ts`
Expected: PASS (2 happy-path + 7 error-path = 9 tests).

If any error-path test fails, the Task 3 implementation has a bug — fix `deepseek.ts` so the tests pass before continuing.

- [ ] **Step 3: Wire deepseek into the factory in `index.ts`**

Open `src/knowledge-freshness/providers/index.ts` and update:

```typescript
// Top imports — ADD
import { buildDeepseekDispatcher } from './deepseek.js'

// In buildDispatcher() — REPLACE the deepseek branch:
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
    })
  }
```

(Drop the underscore from `_opts` if it's still there from Task 1 — should already be gone after Task 2.)

- [ ] **Step 4: Add a factory test for deepseek wiring**

Append to `src/knowledge-freshness/providers/index.test.ts`:

```typescript
import { buildDispatcher } from './index.js'

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
```

- [ ] **Step 5: Run all tests, confirm pass**

Run: `npx vitest run src/knowledge-freshness/providers/`
Expected: PASS (12 resolver + 3 anthropic + 9 deepseek + 2 factory wiring = 26 tests).

- [ ] **Step 6: Commit**

```bash
git add src/knowledge-freshness/providers/deepseek.test.ts \
        src/knowledge-freshness/providers/index.ts \
        src/knowledge-freshness/providers/index.test.ts
git commit -m "$(cat <<'EOF'
feat(knowledge-freshness): deepseek factory wiring + error-path tests (Task 4)

5 new error-path tests for the deepseek dispatcher: non-2xx HTTP,
missing choices[0].message.content, non-JSON response body, unsupported
model, and missing apiKey. Factory in providers/index.ts now constructs
a deepseek Dispatcher from DEEPSEEK_API_KEY + optional
KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL env override. 2 new factory-wiring
tests verify the env-var requirement and successful construction.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Replace inline dispatcher in audit-run-entry CLI

**Files:**
- Modify: `src/cli/commands/knowledge-freshness-audit-run-entry.ts`

The CLI handler shrinks from ~70 to ~50 lines: argv → `resolveProvider` → `buildDispatcher` → `runEntryAudit`.

- [ ] **Step 1: Read the current CLI handler**

Open `src/cli/commands/knowledge-freshness-audit-run-entry.ts`. Note:
- It currently imports `dispatchLlm` directly
- Constructs the dispatcher inline (~10 lines, hardcoded `claude -p --tools ""`)
- The `timeout` argv option already exists

You're replacing the inline construction with a provider-driven one and adding a `--provider` flag.

- [ ] **Step 2: Rewrite the file**

Replace the entire file with:

```typescript
import { execSync } from 'node:child_process'
import type { Argv, CommandModule } from 'yargs'
import { runEntryAudit } from '../../knowledge-freshness/audit-runner.js'
import {
  resolveProvider,
  buildDispatcher,
  type Provider,
} from '../../knowledge-freshness/providers/index.js'

interface AuditRunEntryArgs {
  entryPath: string
  timeout: number
  provider?: string
}

/**
 * Probe whether the `claude` CLI is on PATH. Used only for rule 5 of the
 * provider precedence chain (the "local dev with keychain auth" case).
 *
 * Platform-aware: POSIX systems use `command -v` (POSIX builtin, exits
 * non-zero when the binary is missing); Windows uses `where`, which has
 * the same exit-code semantics. The existing llm-dispatcher already
 * special-cases Windows via `cmd.exe`, so we follow the same convention
 * to keep rule-5 fallback working for Windows operators with Claude Code
 * installed.
 */
function probeClaudeOnPath(): boolean {
  const probe = process.platform === 'win32' ? 'where claude' : 'command -v claude'
  try {
    execSync(probe, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const auditRunEntryCommand: CommandModule<Record<string, unknown>, AuditRunEntryArgs> = {
  command: 'audit-run-entry <entryPath>',
  describe: 'Run a grounded freshness audit on a single knowledge entry',
  builder: (y) => y
    .positional('entryPath', {
      type: 'string',
      describe: 'Path to the knowledge entry .md file to audit',
      demandOption: true,
    })
    .option('timeout', {
      type: 'number',
      default: 600,
      describe: 'Subprocess / HTTP timeout in seconds (default 600s for grounded audits)',
    })
    .option('provider', {
      type: 'string',
      choices: ['anthropic', 'deepseek'],
      describe:
        'Force a specific LLM provider. Overrides KNOWLEDGE_FRESHNESS_PROVIDER and ' +
        'auto-detection from env vars. Default: resolved from env (see ' +
        'docs/knowledge-freshness/operations.md §4).',
    }) as Argv<AuditRunEntryArgs>,
  handler: async (argv) => {
    // Resolve the provider FIRST so a misconfiguration fails before we
    // do any other work (entry-file reading, frontmatter parsing, etc.).
    const provider: Provider = resolveProvider({
      env: process.env,
      args: { provider: argv.provider },
      claudeOnPath: probeClaudeOnPath(),
    })
    const dispatcher = buildDispatcher(provider, {
      timeoutSec: argv.timeout,
      env: process.env,
    })
    const verdict = await runEntryAudit(argv.entryPath, dispatcher)
    process.stdout.write(JSON.stringify(verdict, null, 2) + '\n')
  },
}

export default auditRunEntryCommand
```

- [ ] **Step 3: Build and smoke-test help output**

Run: `npm run build && node dist/index.js knowledge-freshness audit-run-entry --help`
Expected: help text shows `--provider` option with `choices: [anthropic, deepseek]`.

- [ ] **Step 4: Run the audit-runner tests to confirm nothing broke**

Run: `npx vitest run src/knowledge-freshness/audit-runner.test.ts`
Expected: PASS (8 tests). These tests inject a Dispatcher directly so they're agnostic to the CLI wiring; if they fail, something fundamental is wrong.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (everything).

- [ ] **Step 6: Run `make check-all`**

Run: `make check-all`
Expected: green (validator clean, type-check clean, lint clean, tests clean).

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/knowledge-freshness-audit-run-entry.ts
git commit -m "$(cat <<'EOF'
feat(knowledge-freshness): wire provider selection into audit-run-entry CLI (Task 5)

The CLI handler is now ~20 lines shorter: argv parsing → resolveProvider
(with a PATH probe for rule 5) → buildDispatcher → runEntryAudit. New
--provider <anthropic|deepseek> flag overrides KNOWLEDGE_FRESHNESS_PROVIDER
env. The inline `claude -p --tools ""` construction is gone — that logic
lives in providers/anthropic.ts now.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Cron workflow — switch to DeepSeek

**Files:**
- Modify: `.github/workflows/knowledge-freshness-audit.yml`

- [ ] **Step 1: Open the workflow file and find the relevant steps**

Open `.github/workflows/knowledge-freshness-audit.yml`. Find:
- The "Install Claude CLI" step (added in Phase 2 round 4) — will be removed
- The "Run audits and open PRs" step's `env:` block — needs `ANTHROPIC_API_KEY` replaced with `DEEPSEEK_API_KEY` + `KNOWLEDGE_FRESHNESS_PROVIDER`

- [ ] **Step 2: Remove the Claude CLI install step**

Delete the entire step block:

```yaml
      - name: Install Claude CLI (audit subprocess hardcodes `claude -p`)
        # F-002 round-4: ...
        run: npm install -g @anthropic-ai/claude-code
```

(The exact block lives between `Install npm dependencies` and `Build CLI` in the current file.)

- [ ] **Step 3: Update the env block of the "Run audits and open PRs" step**

Find:

```yaml
      - name: Run audits and open PRs
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Replace with:

```yaml
      - name: Run audits and open PRs
        env:
          # The cron uses the DeepSeek HTTP provider instead of `claude -p`.
          # See docs/knowledge-freshness/operations.md §4 "Choosing a
          # provider" for the precedence rules. The operator must set
          # DEEPSEEK_API_KEY as a repository secret before the first run.
          DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
          KNOWLEDGE_FRESHNESS_PROVIDER: deepseek
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 4: Verify the YAML is well-formed**

Run: `cat .github/workflows/knowledge-freshness-audit.yml | head -80`
Expected: no `Install Claude CLI` block; `DEEPSEEK_API_KEY` + `KNOWLEDGE_FRESHNESS_PROVIDER` are visible in the env block.

Optional sanity-check with a YAML parser:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/knowledge-freshness-audit.yml'))" \
  && echo "YAML parses OK"
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/knowledge-freshness-audit.yml
git commit -m "$(cat <<'EOF'
feat(knowledge-freshness): cron workflow uses DeepSeek provider (Task 6)

Drops the `npm install -g @anthropic-ai/claude-code` step entirely
(saves ~30s per run, removes one transitive dep). Replaces the
ANTHROPIC_API_KEY env with DEEPSEEK_API_KEY + KNOWLEDGE_FRESHNESS_PROVIDER=
deepseek. The audit-run-entry CLI's resolveProvider() picks up the env
var and constructs the HTTP dispatcher.

Operator setup: `gh secret set DEEPSEEK_API_KEY` in the repo before
the first scheduled run. Local dev unchanged (still uses claude
keychain auth via rule-5 PATH probe).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Operations documentation

**Files:**
- Modify: `docs/knowledge-freshness/operations.md`

- [ ] **Step 1: Find § 4 (Running an audit manually) in the doc**

Run: `grep -n "^## 4\." docs/knowledge-freshness/operations.md`
Note the line number of the section header.

- [ ] **Step 2: Add the "Choosing a provider" subsection at the top of § 4**

Find the first line of section 4 (just after the `## 4. Running an audit manually (locally)` header). Insert the following content BEFORE the existing step-by-step (it becomes the new first subsection of § 4).

**Important:** the block below is wrapped in a 4-backtick fence purely so this plan document can show its contents (which include 3-backtick `bash` fences). When you paste into `operations.md`, copy **only the lines INSIDE the outer 4-backtick fence** — do NOT include the outer ````markdown` and ```` lines themselves. The pasted content's 3-backtick fences are part of the final rendered doc.

````markdown
### Choosing a provider

Two LLM providers are supported for the per-entry audit dispatch:

- **anthropic** (default for local) — invokes `claude -p` as a subprocess.
  Requires the Claude Code CLI on `$PATH`. Auth via Claude Code's
  keychain integration (run `claude /login` once) OR via
  `ANTHROPIC_API_KEY` env var — but in both cases the CLI must be
  installed; the env var alone is not sufficient.
- **deepseek** (default for the cron) — HTTPS POST to
  `api.deepseek.com/chat/completions`. Auth via `DEEPSEEK_API_KEY`
  env var. Requires no CLI install.

Provider selection (highest precedence first):

1. `--provider <anthropic|deepseek>` flag on `audit-run-entry`
2. `KNOWLEDGE_FRESHNESS_PROVIDER` env var
3. Inferred from which API key is set
4. **Error** if both keys are set without an explicit choice
5. Falls back to `anthropic` when `claude` is on `$PATH` (local dev case)
6. **Error** if nothing is configured

For a local one-off DeepSeek run:

```bash
DEEPSEEK_API_KEY=sk-... node dist/index.js knowledge-freshness audit-run-entry \
  content/knowledge/core/<entry>.md
```

For a local Anthropic run when both keys happen to be set:

```bash
node dist/index.js knowledge-freshness audit-run-entry \
  content/knowledge/core/<entry>.md \
  --provider anthropic
```

For the cron: the secret + env block are configured in
`.github/workflows/knowledge-freshness-audit.yml`. Set the secret
once with `gh secret set DEEPSEEK_API_KEY`.

#### DeepSeek model override

The default DeepSeek model is `deepseek-v4-flash`. To use `deepseek-v4-pro`
instead (slower, more expensive, more thorough chain-of-thought), set
`KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL=deepseek-v4-pro` in the
workflow env block (or your shell). Only the two allowlisted values
are accepted — the dispatcher rejects any other model name at startup.
````

- [ ] **Step 2b: Replace the existing "Auth caveat" subsection**

The current `operations.md` § 4 ends with an `### Auth caveat` subsection (around line 184) that says CI sets `ANTHROPIC_API_KEY` and the subprocess uses `claude -p`. After Task 6's workflow change, that's wrong for CI — replace it with provider-aware language.

Find:

```markdown
### Auth caveat

The audit subprocess uses `claude -p` (per `src/observability/engine/llm-dispatcher.ts`).
Locally this picks up your `claude` CLI's keychain auth — no env var needed.
In CI the workflow sets `ANTHROPIC_API_KEY` from the repo secret of the same
name; the subprocess then uses that. If you want to run the audit locally with
an API key (e.g. against a different account), export `ANTHROPIC_API_KEY` and
the `claude` CLI will prefer it.

`--open-pr` requires `gh auth login` to have run (and `gh` to be on PATH).
```

Replace with:

```markdown
### Auth caveat

Each provider has its own auth path:

- **anthropic** (default for local): the audit subprocess invokes
  `claude -p`, so Claude Code must be on `$PATH`. Locally it uses the
  keychain auth from `claude /login` — no env var needed. If you set
  `ANTHROPIC_API_KEY` alongside the CLI, `claude` prefers it (useful
  for running against a different account). The env var alone is NOT
  sufficient — the CLI must exist regardless; resolveProvider rejects
  this combination at startup so you find out before the first audit.
- **deepseek** (default for cron): the audit makes a direct HTTPS
  POST to `api.deepseek.com`. Requires `DEEPSEEK_API_KEY` in env;
  no CLI install needed.

The cron workflow sets `DEEPSEEK_API_KEY` from the repo secret and
`KNOWLEDGE_FRESHNESS_PROVIDER=deepseek` to pin the choice. Set the
secret once with `gh secret set DEEPSEEK_API_KEY` before the first
scheduled run.

`--open-pr` requires `gh auth login` to have run (and `gh` to be on PATH).
```

- [ ] **Step 2c: Update the stale failure-mode row about `ANTHROPIC_API_KEY` in CI**

Also in `operations.md` § 9, find the row that says:

```markdown
| `audit subprocess failed: exit 1` | Missing `ANTHROPIC_API_KEY` (CI) or `claude` CLI not on PATH (local). | Set the secret / install `claude` CLI. |
```

Replace with:

```markdown
| `audit subprocess failed: exit 1` | (anthropic only) `claude` CLI not on PATH, or `ANTHROPIC_API_KEY` invalid. | Install Claude Code and run `claude /login`, or switch to the deepseek provider via `DEEPSEEK_API_KEY` + `KNOWLEDGE_FRESHNESS_PROVIDER=deepseek`. The cron now uses deepseek by default — see § 4 "Choosing a provider". |
```

- [ ] **Step 3: Add new entries to § 9 (Failure modes and recovery)**

Find § 9. Add two new rows to the existing failure-modes table:

```markdown
| `Error: provider selection ambiguous` | Both `ANTHROPIC_API_KEY` and `DEEPSEEK_API_KEY` are set without an explicit choice via `--provider` or `KNOWLEDGE_FRESHNESS_PROVIDER`. | Pass `--provider anthropic` or `--provider deepseek`, or set `KNOWLEDGE_FRESHNESS_PROVIDER` in env. |
| `Error: no provider configured` | Neither API key is set, and `claude` is not on `$PATH`. | Install Claude Code locally (`brew install anthropic/claude-code/claude-code` then `claude /login`) for anthropic, or set `DEEPSEEK_API_KEY` for deepseek. |
| ``Error: anthropic provider selected but the `claude` CLI is not on PATH`` | The anthropic dispatcher shells out to `claude -p`; the CLI must exist regardless of how the provider was chosen (`--provider anthropic`, `KNOWLEDGE_FRESHNESS_PROVIDER=anthropic`, or `ANTHROPIC_API_KEY` inference). The env var alone is not sufficient. | Install Claude Code (`brew install anthropic/claude-code/claude-code` or `npm install -g @anthropic-ai/claude-code`), OR switch to the deepseek provider. |
| `Error: unsupported DeepSeek model "..."` | `KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL` was set to a value outside the hardcoded allowlist. | Set it to `deepseek-v4-flash` or `deepseek-v4-pro`, or unset it for the default. |
| `Error: deepseek dispatcher: HTTP 4xx/5xx` | DeepSeek API rejected the request (auth failure, rate limit, server-side error). | Check the secret value, the DeepSeek service status, and your account's rate limits. The cron isolates per-entry failures and retries the entry the next day. |
```

- [ ] **Step 4: Run a basic doc-build sanity check**

Run: `make validate` (the bash frontmatter validator). It doesn't lint markdown but it does catch unclosed frontmatter or stray characters in the doc directory.

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add docs/knowledge-freshness/operations.md
git commit -m "$(cat <<'EOF'
docs(knowledge-freshness): provider-selection operator guide (Task 7)

§4 now leads with a "Choosing a provider" subsection covering the
6-rule precedence chain, an example DeepSeek invocation, an
explicit-override example when both keys are set, and the DeepSeek
model allowlist. §9 (Failure modes) gains four new rows for the
errors the new selection logic can produce.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: End-to-end smoke (optional but recommended)

**Files:** none modified.

If you have a `DEEPSEEK_API_KEY` available, run a single live audit to validate the wiring end-to-end. If you don't, skip this task and trust the unit tests — the live test happens on the first cron run after merge.

- [ ] **Step 1: Set the env var (do NOT commit)**

```bash
export DEEPSEEK_API_KEY=sk-...your-key-here
export KNOWLEDGE_FRESHNESS_PROVIDER=deepseek
```

- [ ] **Step 2: Build the CLI**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Run a real audit against a backfilled entry**

Run: `node dist/index.js knowledge-freshness audit-run-entry content/knowledge/core/security-best-practices.md > /tmp/verdict-deepseek.json`
Expected: exit 0; `/tmp/verdict-deepseek.json` contains a verdict object validating against the audit-runner schema. The `model` field will read something like `"deepseek-v4-flash"` (the model self-identifies in the verdict body).

- [ ] **Step 4: Inspect the verdict**

Run: `jq '{ verdict, model, audit_date, num_findings: (.findings | length) }' /tmp/verdict-deepseek.json`
Expected: a small JSON object showing the verdict + model + findings count. Compare against the Phase 1 Task 9 dry-run output (which used `claude-sonnet-4-6`) to sanity-check quality.

- [ ] **Step 5: Document the smoke result in the PR description**

Paste the verdict summary into the PR description so reviewers can see end-to-end validation happened.

No commit for Task 8 — it's a manual sanity check, not a code change.

---

## Task 9: Land the work (REQUIRED)

**Files:** none modified. This task runs the project's standard merge-prep checks and creates the PR. Per `CLAUDE.md` § "Committing and Creating PRs" and § "Mandatory Code Review", these steps are not optional.

- [ ] **Step 1: Run the full quality gate**

Run: `make check-all`
Expected: green. Bash gate (lint + bats), TypeScript gate (`npm run type-check` + vitest), knowledge-frontmatter validator. If anything fails, fix it before continuing — do NOT push.

- [ ] **Step 2: Rebase against latest origin/main**

Run: `git fetch origin main && git rebase origin/main`
Expected: clean rebase (no conflicts). If conflicts surface, resolve them and re-run `make check-all` before continuing.

- [ ] **Step 3: Push the branch**

Run: `git push -u origin HEAD`
Expected: branch pushed, tracking set. The pre-push hook runs the full bats suite — if it fails, fix and re-push.

- [ ] **Step 4: Create the PR**

```bash
gh pr create --base main \
  --title "feat(knowledge-freshness): DeepSeek provider for the cron audit" \
  --body "$(cat <<'EOF'
## Summary

Adds DeepSeek as an alternative LLM provider for the per-entry audit dispatch (cron). Anthropic remains the default for local dev via the rule-5 PATH probe; the cron switches to DeepSeek's HTTP API via repo secret. MMR review is intentionally untouched.

## Architecture

- New `src/knowledge-freshness/providers/` module: `index.ts` (Provider type, 6-rule selection chain, dispatcher factory), `anthropic.ts` (factored-out subprocess), `deepseek.ts` (new HTTP dispatcher).
- `audit-run-entry` CLI shrinks: argv → `resolveProvider` → `buildDispatcher` → `runEntryAudit`. New `--provider <anthropic|deepseek>` flag.
- Cron workflow: drops `npm install -g @anthropic-ai/claude-code`, adds `DEEPSEEK_API_KEY` + `KNOWLEDGE_FRESHNESS_PROVIDER=deepseek` env block.
- Operations doc: new "Choosing a provider" subsection + 5 new failure-mode rows.

## Decision-#7 invariant

Both providers stay hardcoded — Anthropic command and DeepSeek URL/model-allowlist are literal constants in source, never read from project config. The threat model from the parent design's decision #7 is preserved. Unit tests assert the literal command/URL as tripwires.

## Test plan

- [x] `make check-all` green locally
- [ ] CI green on this branch (check + gates workflows)
- [ ] (Optional) Live DeepSeek smoke: set `DEEPSEEK_API_KEY` locally, run \`node dist/index.js knowledge-freshness audit-run-entry content/knowledge/core/security-best-practices.md\`, verify verdict shape

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

If the title needs trimming to fit GitHub's 256-char limit, the body holds the detailed summary.

- [ ] **Step 5: Run MMR review on the branch diff**

Per `CLAUDE.md` § "Mandatory Code Review", run all three channels:

```bash
PR_NUMBER=$(gh pr view --json number --jq .number)
mmr review --pr "$PR_NUMBER" --sync --format json --focus \
  "DeepSeek provider for the cron audit: provider selection logic, HTTP dispatcher correctness, hardcoded URL + model-allowlist invariant, workflow YAML changes."
```

Apply the per-PR round budget (rounds 1-5: fix every ≥P2 finding; rounds 6+: fix only P0/P1; defer the rest to `docs/superpowers/deferred-findings/<branch>.md`). Stop when the verdict is `pass` or `degraded-pass`.

- [ ] **Step 6: Wait for CI to go green**

Run: `gh pr checks`
Expected: `check` and `gates` workflows pass. The gates workflow may not actually fire on this PR (it triggers on `content/knowledge/**` paths and this PR touches code/workflow only) — that's fine.

- [ ] **Step 7: Verify status is clean and the branch is up-to-date with origin**

Run: `git status && git log --oneline origin/main..HEAD | head -10`
Expected: working tree clean; all local commits are pushed (no "ahead by N" message in git status).

- [ ] **Step 8: Hand off**

Surface to the operator: the PR URL, the MMR verdict (job ID + rounds run), any deferred-findings file path, and the next step ("ready for human review; the cron workflow will not activate until the PR merges and `DEEPSEEK_API_KEY` is set as a repo secret").

---

## Known related issue (out of scope)

`src/knowledge-freshness/gates/link-check.ts` (already on main) uses the same `AbortSignal.timeout(ms)` pattern that grok flagged in round-6 review. This is a *latent* bug on Node 18.17 today — it would only surface if a gate workflow actually triggered (gate tests use mocked fetch, so the timeout path isn't exercised). Fixing it is genuinely separate work (different file, different commit history); track as a follow-up issue rather than expanding this plan's scope. The DeepSeek provider correctly uses the `AbortController + setTimeout` pattern from the start.

---

## Self-Review Notes

**Spec coverage:**
- Architecture (provider abstraction, factory) → Tasks 1, 2, 3, 4
- Provider selection precedence (6 rules) → Task 1 (tests + implementation)
- DeepSeek request shape → Task 3
- DeepSeek error handling (non-2xx, malformed, model allowlist) → Tasks 3 + 4
- Anthropic dispatcher extraction → Task 2
- CLI `--provider` flag → Task 5
- Workflow env-block change → Task 6
- Workflow `npm install -g` removal → Task 6
- Operations.md "Choosing a provider" → Task 7
- Operations.md failure-mode rows → Task 7
- Decision #7 hardcoded-paths invariant → enforced via Task 2 tripwire test + Task 3 `DEEPSEEK_URL` literal + comments

**Placeholder scan:** clean — every step has either complete code or exact-command instructions.

**Type consistency:**
- `Dispatcher` from `audit-runner.ts` is the shared contract; both providers return that type.
- `Provider` enum from `index.ts` matches yargs `choices` in Task 5.
- `BuildDispatcherOptions { timeoutSec, env }` is used by both `buildAnthropicDispatcher` (which reads only timeoutSec) and `buildDeepseekDispatcher` (which reads env for the API key + optional model).
- `DispatchLlmFn` from anthropic.ts is defined as `typeof dispatchLlm` so the test mock's resolved-value shape (`{ ok: true; parsed; raw }` / `{ ok: false; reason; raw? }`) stays in lock-step with the production return type.

**Decisions coverage:** All 9 resolved decisions from the spec map to concrete tasks. #1 (cron-only scope) → all task scoping is correct. #2 (Provider abstraction shape) → Tasks 1-4. #3 (precedence) → Task 1 tests. #4 (both-keys-set fails loudly) → Task 1 rule 4 test. #5 (hardcoded URL) → Task 3 constant + Task 2-style tripwire test. #6 (model allowlist + env override) → Task 3 implementation + Task 4 test. #7 (no retries) → Task 3 has no retry logic. #8 (no streaming) → Task 3 request body `stream: false` + Task 3 test asserts it. #9 (drop claude-code install) → Task 6 step 2.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-knowledge-freshness-deepseek-provider.md`.
