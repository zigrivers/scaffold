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

interface Env { ANTHROPIC_API_KEY?: string; DEEPSEEK_API_KEY?: string; KNOWLEDGE_FRESHNESS_PROVIDER?: string }
interface Args { provider?: string }
// `claudeOnPath` is injected so tests don't depend on the host's $PATH.
const opts = (env: Env, args: Args = {}, claudeOnPath = false) => ({ env, args, claudeOnPath })

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

  it('rule 3b: only ANTHROPIC_API_KEY set → anthropic', () => {
    expect(resolveProvider(opts({ ANTHROPIC_API_KEY: 'a' }))).toBe('anthropic')
  })

  it('rule 4: both keys set without explicit choice → error with helpful message', () => {
    expect(() => resolveProvider(opts({ ANTHROPIC_API_KEY: 'a', DEEPSEEK_API_KEY: 'd' })))
      .toThrow(/ambiguous.*--provider.*KNOWLEDGE_FRESHNESS_PROVIDER/i)
  })

  it('rule 5: no env vars but claude on PATH → anthropic (keychain delegation)', () => {
    expect(resolveProvider(opts({}, {}, true))).toBe('anthropic')
  })

  it('rule 6: no env vars and no claude on PATH → error with setup instructions', () => {
    expect(() => resolveProvider(opts({}, {}, false)))
      .toThrow(/no provider configured.*DEEPSEEK_API_KEY.*ANTHROPIC_API_KEY/i)
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
  // Rule 5: PATH probe.
  if (input.claudeOnPath) return 'anthropic'
  // Rule 6: nothing.
  throw new Error(
    'no provider configured for the knowledge-freshness audit. Either:\n' +
    '  - export ANTHROPIC_API_KEY (or have `claude` on PATH after `claude /login`) for the anthropic provider, OR\n' +
    '  - export DEEPSEEK_API_KEY for the deepseek provider.\n' +
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
    // the module level. The Dispatcher contract is "string in → string out".
    const dispatchSpy = vi.fn().mockResolvedValue({ ok: true, raw: 'verdict json here' })
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
 * for local devs. Reverted in Task 9 because the audit subcommand only
 * operates on scaffold's own content/knowledge/, never on a downstream
 * repo — so the round-7 isolation rationale doesn't apply.
 */
export const ANTHROPIC_COMMAND = 'claude -p --tools ""'

/**
 * Injectable dispatch function. Production uses the real `dispatchLlm`;
 * tests inject a mock. Same shape as the production function's return
 * value to keep the type contract consistent.
 */
export type DispatchLlmFn = (input: {
  prompt: string
  command: string
  timeoutMs: number
}) => Promise<{ ok: true; raw: string } | { ok: false; reason: string }>

export interface BuildAnthropicDispatcherOptions {
  timeoutSec: number
  /** Injectable for tests. Defaults to the real `dispatchLlm`. */
  dispatchLlmFn?: DispatchLlmFn
}

export function buildAnthropicDispatcher(opts: BuildAnthropicDispatcherOptions): Dispatcher {
  const dispatch = opts.dispatchLlmFn ?? (dispatchLlm as DispatchLlmFn)
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

Replace the "not yet wired" stub for `'anthropic'` in `src/knowledge-freshness/providers/index.ts`:

```typescript
// src/knowledge-freshness/providers/index.ts (top imports — ADD)
import { buildAnthropicDispatcher } from './anthropic.js'

// In buildDispatcher() — REPLACE the anthropic branch:
  if (provider === 'anthropic') {
    return buildAnthropicDispatcher({ timeoutSec: _opts.timeoutSec })
  }
```

Drop the leading underscore from the `opts` parameter name (it's now used).

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
    const fetchSpy: DeepseekFetch = vi.fn(async () => ok({
      choices: [{ message: { content: '{"verdict":"current"}' } }],
    })) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({
      apiKey: 'sk-test-key',
      timeoutSec: 600,
      fetchImpl: fetchSpy,
    })
    const result = await dispatcher('the meta-prompt body')
    expect(result).toBe('{"verdict":"current"}')
    // Verify the request shape exactly.
    expect(fetchSpy).toHaveBeenCalledWith(
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
    const call = (fetchSpy as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    const sentBody = JSON.parse(call[1].body as string)
    expect(sentBody).toEqual({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'the meta-prompt body' }],
      temperature: 0,
      max_tokens: 8192,
      stream: false,
    })
  })

  it('uses the model from KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL when set (allowlist member)', async () => {
    const fetchSpy: DeepseekFetch = vi.fn(async () => ok({
      choices: [{ message: { content: 'response' } }],
    })) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({
      apiKey: 'k',
      timeoutSec: 60,
      model: 'deepseek-reasoner',
      fetchImpl: fetchSpy,
    })
    await dispatcher('x')
    const call = (fetchSpy as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(JSON.parse(call[1].body as string).model).toBe('deepseek-reasoner')
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
 * arbitrary text.
 */
const ALLOWED_MODELS = ['deepseek-chat', 'deepseek-reasoner'] as const
export type DeepseekModel = typeof ALLOWED_MODELS[number]
export const DEFAULT_DEEPSEEK_MODEL: DeepseekModel = 'deepseek-chat'

const MAX_TOKENS = 8192

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
      temperature: 0,
      max_tokens: MAX_TOKENS,
      stream: false,
    })
    const res = await doFetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => '<unreadable>')
      throw new Error(
        `deepseek dispatcher: HTTP ${res.status} from ${DEEPSEEK_URL}. ` +
        `Body (first 200 chars): ${text.slice(0, 200)}`,
      )
    }
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      const truncated = JSON.stringify(json).slice(0, 200)
      throw new Error(
        `deepseek dispatcher: response missing choices[0].message.content. ` +
        `Truncated response: ${truncated}`,
      )
    }
    return content
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
runner's JSON extractor. Model allowlist (deepseek-chat,
deepseek-reasoner) enforced at construction time; URL is a literal
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

  it('throws on a 200 response whose body is not JSON', async () => {
    const fetchSpy: DeepseekFetch = vi.fn(async () =>
      new Response('not json at all', {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as DeepseekFetch
    const dispatcher = buildDeepseekDispatcher({ apiKey: 'k', timeoutSec: 60, fetchImpl: fetchSpy })
    // Either undici's response.json() throws, OR we surface our missing-content error.
    // Both are acceptable — the dispatcher must NOT swallow the failure.
    await expect(dispatcher('x')).rejects.toThrow()
  })

  it('rejects an unsupported model at construction time (not at fetch time)', () => {
    expect(() => buildDeepseekDispatcher({
      apiKey: 'k', timeoutSec: 60, model: 'gpt-4',
    })).toThrow(/unsupported DeepSeek model "gpt-4".*deepseek-chat.*deepseek-reasoner/i)
  })

  it('rejects construction when apiKey is empty', () => {
    expect(() => buildDeepseekDispatcher({ apiKey: '', timeoutSec: 60 })).toThrow(/DEEPSEEK_API_KEY is required/)
  })
})
```

- [ ] **Step 2: Run tests, confirm pass (no impl changes needed — happy-path code already covers these)**

Run: `npx vitest run src/knowledge-freshness/providers/deepseek.test.ts`
Expected: PASS (2 happy-path + 5 error-path = 7 tests).

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
Expected: PASS (9 resolver + 3 anthropic + 7 deepseek + 2 factory wiring = 21 tests).

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
 * `command -v` is shell-portable and exits non-zero when the binary is
 * missing.
 */
function probeClaudeOnPath(): boolean {
  try {
    execSync('command -v claude', { stdio: 'ignore' })
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

Find the first line of section 4 (just after the `## 4. Running an audit manually (locally)` header). Insert the following block BEFORE the existing step-by-step (it becomes the new first subsection of § 4):

```markdown
### Choosing a provider

Two LLM providers are supported for the per-entry audit dispatch:

- **anthropic** (default for local) — invokes `claude -p` as a subprocess.
  Auth via Claude Code's keychain integration (run `claude /login`) or
  via `ANTHROPIC_API_KEY` env var.
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

The default DeepSeek model is `deepseek-chat`. To use `deepseek-reasoner`
instead (slower, more expensive, more thorough chain-of-thought), set
`KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL=deepseek-reasoner` in the
workflow env block (or your shell). Only the two allowlisted values
are accepted — the dispatcher rejects any other model name at startup.
```

- [ ] **Step 3: Add new entries to § 9 (Failure modes and recovery)**

Find § 9. Add two new rows to the existing failure-modes table:

```markdown
| `Error: provider selection ambiguous` | Both `ANTHROPIC_API_KEY` and `DEEPSEEK_API_KEY` are set without an explicit choice via `--provider` or `KNOWLEDGE_FRESHNESS_PROVIDER`. | Pass `--provider anthropic` or `--provider deepseek`, or set `KNOWLEDGE_FRESHNESS_PROVIDER` in env. |
| `Error: no provider configured` | Neither API key is set, and `claude` is not on `$PATH`. | Install Claude Code locally (`brew install anthropic/claude-code/claude-code` then `claude /login`) for anthropic, or set `DEEPSEEK_API_KEY` for deepseek. |
| `Error: unsupported DeepSeek model "..."` | `KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL` was set to a value outside the hardcoded allowlist. | Set it to `deepseek-chat` or `deepseek-reasoner`, or unset it for the default. |
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
Expected: exit 0; `/tmp/verdict-deepseek.json` contains a verdict object validating against the audit-runner schema. The `model` field will read something like `"deepseek-chat"` (the model self-identifies in the verdict body).

- [ ] **Step 4: Inspect the verdict**

Run: `jq '{ verdict, model, audit_date, num_findings: (.findings | length) }' /tmp/verdict-deepseek.json`
Expected: a small JSON object showing the verdict + model + findings count. Compare against the Phase 1 Task 9 dry-run output (which used `claude-sonnet-4-6`) to sanity-check quality.

- [ ] **Step 5: Document the smoke result in the PR description**

Paste the verdict summary into the PR description so reviewers can see end-to-end validation happened.

No commit for Task 8 — it's a manual sanity check, not a code change.

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
- `DispatchLlmFn` from anthropic.ts mirrors the real `dispatchLlm` return shape (`{ ok: true, raw } | { ok: false, reason }`).

**Decisions coverage:** All 9 resolved decisions from the spec map to concrete tasks. #1 (cron-only scope) → all task scoping is correct. #2 (Provider abstraction shape) → Tasks 1-4. #3 (precedence) → Task 1 tests. #4 (both-keys-set fails loudly) → Task 1 rule 4 test. #5 (hardcoded URL) → Task 3 constant + Task 2-style tripwire test. #6 (model allowlist + env override) → Task 3 implementation + Task 4 test. #7 (no retries) → Task 3 has no retry logic. #8 (no streaming) → Task 3 request body `stream: false` + Task 3 test asserts it. #9 (drop claude-code install) → Task 6 step 2.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-knowledge-freshness-deepseek-provider.md`.
