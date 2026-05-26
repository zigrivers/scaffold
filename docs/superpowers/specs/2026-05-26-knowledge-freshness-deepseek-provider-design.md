---
status: design-locked
owner: zigrivers
created: 2026-05-26
related-plan: docs/superpowers/plans/2026-05-26-knowledge-freshness-deepseek-provider.md
---

# Knowledge-Freshness DeepSeek Provider — Design

Add DeepSeek as an alternative LLM provider for the knowledge-freshness
per-entry audit dispatch (the daily cron's `audit-run-entry` call). Anthropic's
`claude -p` subprocess path remains the default for local development; the
cron switches to DeepSeek's OpenAI-compatible HTTP API. MMR review
(Codex/Gemini/Claude channels) is **out of scope** and untouched.

## Findings & Corrections (Phase 0 grounding)

- `src/observability/engine/llm-dispatcher.ts` is currently subprocess-only,
  spawning a shell-quoted command via `child_process.spawn`. There is no
  HTTP path. Adding DeepSeek means adding a new dispatch backend, not
  swapping one subprocess for another.
- DeepSeek has **no first-party CLI** comparable to `claude` / `codex` /
  `gemini`. Their public surface is an HTTP API at
  `https://api.deepseek.com/chat/completions`, OpenAI-compatible
  (single-message + choices array). A subprocess-wrapper would have to be
  invented from scratch; a direct HTTP call is simpler and avoids the
  extra layer.
- Resolved decision #7 in the parent knowledge-freshness design locked
  the dispatcher to a "hardcoded `claude -p`, no project-config override"
  shape. The security rationale was preventing a repo-local CLAUDE.md
  from injecting `command: rm -rf /`. This spec **extends** decision #7,
  not overrides it: the DeepSeek path is also hardcoded (literal URL,
  fixed model-name allowlist), never reads project config. Spec calls
  this out explicitly so a future maintainer doesn't read "we added a
  second path" and infer the door is open to project-controlled
  dispatch commands more broadly.
- Round-6 F-001 moved web-fetching from the model into Node. The model
  runs with `--tools ""` (no tools) and reads pre-fetched bodies from
  the `{{prefetched_sources}}` placeholder. This is the property that
  makes DeepSeek a drop-in: the runner doesn't need any provider-specific
  tool semantics.
- The audit runner already takes an injectable `Dispatcher` function
  (`(prompt: string) => Promise<string>`). The provider abstraction
  doesn't require touching `runEntryAudit` at all — only the CLI handler
  that constructs the Dispatcher.
- Round-7 F-002's DNS-rebinding / SSRF concerns do **not** apply to the
  DeepSeek dispatcher because the destination URL is a hardcoded literal
  in source code, not derived from frontmatter. The validator stack that
  guards `fetchAndHash` is intentionally not invoked on this fixed URL.

## Problem Statement

Operators who don't have an Anthropic billing relationship (or who want
to use cheaper inference for the daily cron) need a way to point the
audit dispatcher at a different LLM provider without abandoning the
existing infrastructure. The cron is the right insertion point: it's
the high-volume, automation-friendly workload, and any quality drop is
caught downstream by MMR corroboration before a freshness PR merges.

MMR review **stays on Anthropic/Codex/Gemini** because its multi-channel
reconciliation depends on a specific set of installed CLIs and channel
defaults that live in the sibling MMR package — out of scope here.

## Goals & Non-Goals

**Goals**

- Operators can configure the cron to use DeepSeek for all per-entry
  audit dispatches via a single repo secret (`DEEPSEEK_API_KEY`).
- Local dev still works with the existing keychain / `ANTHROPIC_API_KEY`
  flow — no breaking change.
- Provider selection is explicit and predictable, never silently
  routes traffic to an unintended billing account.
- The DeepSeek path stays hardcoded (URL, model name allowlist) so the
  threat model from decision #7 holds.

**Non-Goals**

- Provider abstraction for MMR. MMR keeps its current Codex/Gemini/Claude
  channels.
- Arbitrary OpenAI-compatible endpoint support (e.g., OpenRouter,
  vLLM-self-hosted, custom URLs). Phase 1 hardcodes `api.deepseek.com`.
  Generalizing to "any OpenAI-compatible URL" reintroduces SSRF concerns
  and is deferred.
- Provider-side tool-call wiring. The model continues to run without
  tools, reading pre-fetched bodies from the prompt.
- Streaming responses. Single-shot completion is sufficient; we already
  buffer the whole output for JSON extraction.

## Architecture Overview

```
   ┌─────────────────────────────────────────────────────────────────┐
   │ scaffold knowledge-freshness audit-run-entry <path> [flags]     │
   └──────────────────────────────┬──────────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ resolveProvider(argv, env)                                      │
   │   1. --provider flag       (highest precedence)                 │
   │   2. KNOWLEDGE_FRESHNESS_PROVIDER env var                       │
   │   3. inferred from which API key is set                         │
   │   4. fail with setup instructions if ambiguous or unset         │
   └──────────────────────────────┬──────────────────────────────────┘
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ Provider factory                                                 │
   │   anthropic → buildAnthropicDispatcher(opts)                    │
   │   deepseek  → buildDeepseekDispatcher(opts)                     │
   │   returns a `Dispatcher` (prompt → Promise<string>)             │
   └──────────────────────────────┬──────────────────────────────────┘
                                  ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ runEntryAudit(entryPath, dispatcher, opts)                      │
   │   (unchanged — already provider-agnostic)                       │
   └─────────────────────────────────────────────────────────────────┘
```

## Provider Selection

The CLI resolves a provider via the following precedence chain. The first
matching rule wins; subsequent rules don't run.

| Precedence | Source | Behavior |
|---|---|---|
| 1 (highest) | `--provider <anthropic\|deepseek>` flag | Explicit operator override. Used for testing both paths from one dev box. |
| 2 | `KNOWLEDGE_FRESHNESS_PROVIDER` env var | Explicit cron / CI configuration. The workflow YAML sets this to `deepseek`. |
| 3 | Single API key present in env | Infer: only `DEEPSEEK_API_KEY` → deepseek; only `ANTHROPIC_API_KEY` → anthropic. |
| 4 | Both API keys set, no explicit choice | **Fail** with a clear "please pick one via `--provider` or `KNOWLEDGE_FRESHNESS_PROVIDER`" message. |
| 5 | Neither API key set, `claude` CLI on `$PATH` | Use **anthropic** — the subprocess delegates auth to claude's keychain integration. This is the common local-dev case. |
| 6 (lowest) | Neither API key set, `claude` CLI absent | **Fail** with setup instructions for both providers. |

This means local development on a Mac with `claude` installed and
`claude /login` already run continues to work without any new
configuration — rule 5 catches it and the existing keychain flow
takes over. CI explicitly sets rule 2 to `deepseek`, so the
inference rules 3-6 don't fire there.

### Examples

| Configuration | Result |
|---|---|
| `--provider deepseek` (regardless of env) | deepseek |
| `KNOWLEDGE_FRESHNESS_PROVIDER=deepseek` | deepseek |
| `DEEPSEEK_API_KEY=...` (only) | deepseek |
| `ANTHROPIC_API_KEY=...` (only) | anthropic |
| Both keys set, no explicit choice | error: ambiguous |
| `claude` on PATH, no env vars (typical local dev) | anthropic (subprocess uses keychain) |
| `claude` NOT on PATH, no env vars | error: setup instructions for both providers |

## File Layout

```
src/knowledge-freshness/providers/
├── index.ts            # Provider type, resolveProvider(), buildDispatcher()
├── anthropic.ts        # Factored-out claude -p subprocess (existing logic)
├── deepseek.ts         # New HTTP dispatcher
└── *.test.ts           # Unit tests per file
```

The `audit-run-entry` CLI handler shrinks: it parses argv, calls
`resolveProvider()`, calls `buildDispatcher()`, calls `runEntryAudit()`,
prints the verdict. The provider-specific implementation details live
in the provider files.

## DeepSeek Dispatcher

### Request shape

```
POST https://api.deepseek.com/chat/completions
Authorization: Bearer ${DEEPSEEK_API_KEY}
Content-Type: application/json

{
  "model": "deepseek-v4-flash",        # or via env override (see below)
  "messages": [
    {"role": "user", "content": "<rendered meta-prompt>"}
  ],
  "temperature": 0,
  "max_tokens": 8192,
  "stream": false
}
```

- `temperature: 0` matches the deterministic-output stance of the
  audit (the prompt expects structured JSON, not creative variance).
- `max_tokens: 8192` is comfortable headroom for a verdict JSON;
  most verdicts come in under 2KB.
- `stream: false` keeps the response single-shot for the runner's
  schema-aware JSON extractor.

### Model selection

Default: `deepseek-v4-flash`. Operators can override via
`KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL` env var, but only to a
**hardcoded allowlist**:

- `deepseek-v4-flash`
- `deepseek-v4-pro`

Any other value triggers an error at provider construction (not at
fetch time). This preserves decision #7's hardcoded-paths property:
the project cannot route requests at an arbitrary model name.

### Response handling

- HTTP 200: parse `choices[0].message.content` as the raw text; hand to
  the runner's schema-aware JSON extractor.
- HTTP non-2xx: throw with status code + truncated body (first 200
  chars) for diagnostic visibility in the cron logs.
- HTTP timeout: rely on `AbortSignal.timeout(argv.timeout * 1000)`;
  AbortError surfaces with a clear "audit dispatcher timed out" wrap.
- Malformed response (no `choices[0].message.content`): throw with a
  diagnostic message and the truncated response body.

### Network specifics

- Use undici's `fetch` (the existing project pattern from
  `fetchAndHash`).
- No retries at the provider layer. The cron loop already isolates
  per-entry failures and continues to the next candidate; adding a
  retry layer here would double-bill on transient errors with little
  benefit.

## Anthropic Dispatcher (factored out)

The existing inline construction in `audit-run-entry.ts` moves to
`providers/anthropic.ts` verbatim, including:

- Hardcoded `claude -p --tools ""` command
- All security comments (round-6 F-001, round-7 F-001 `--bare`-decision-
  reversion-from-Task-9, etc.)
- `dispatchLlm` from the existing `llm-dispatcher.ts`

No behavior change — pure refactor. The CLI handler imports
`buildAnthropicDispatcher` instead of constructing it inline.

## Workflow Changes

`.github/workflows/knowledge-freshness-audit.yml`:

1. Drop the `npm install -g @anthropic-ai/claude-code` step (no longer
   needed in CI). Local devs already have it; CI doesn't.
2. Replace the env block:

```yaml
env:
  DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
  KNOWLEDGE_FRESHNESS_PROVIDER: deepseek
```

3. No other workflow file changes. The gates workflow doesn't dispatch
   the model; the version-bump workflow doesn't dispatch the model.

CI run time decreases by ~30 seconds (one less `npm install -g`).

## Operations.md Updates

§ 4 "Running an audit manually (locally)" gets a new subsection:

### Choosing a provider

Two LLM providers are supported for the per-entry audit dispatch:

- **anthropic** (default for local) — invokes `claude -p` as a subprocess.
  Auth via keychain (`claude /login`) or `ANTHROPIC_API_KEY` env var.
- **deepseek** (default for cron) — HTTP POST to `api.deepseek.com`.
  Auth via `DEEPSEEK_API_KEY` env var.

Selection (highest precedence first):

1. `--provider <anthropic|deepseek>` flag on `audit-run-entry`
2. `KNOWLEDGE_FRESHNESS_PROVIDER` env var
3. Inferred from which API key is set
4. Error if ambiguous (both keys set, no explicit choice) or unset

For local one-off runs against DeepSeek:

```bash
DEEPSEEK_API_KEY=sk-... node dist/index.js knowledge-freshness audit-run-entry content/knowledge/core/<entry>.md
```

For the cron, set `DEEPSEEK_API_KEY` as a repository secret and add the
env block above to the workflow.

§ 9 "Failure modes" gets:

| `Error: provider selection ambiguous` | Both `ANTHROPIC_API_KEY` and `DEEPSEEK_API_KEY` are set without an explicit `--provider` flag or `KNOWLEDGE_FRESHNESS_PROVIDER` env var. | Pick one. |
| `Error: no provider configured` | Neither API key is set and `claude` CLI is not on `$PATH`. | Either install Claude Code locally (`brew install anthropic/claude-code/claude-code`) and authenticate, or set `DEEPSEEK_API_KEY` in env. |

## Testing Strategy

### Unit tests

- `providers/deepseek.test.ts`:
  - Constructs request with correct URL, auth header, model, body shape
  - Parses `choices[0].message.content` from 200 response
  - Throws on non-2xx with status + truncated body in the message
  - Honors `AbortSignal.timeout` (mock fetch returning a delayed promise; assert reject within deadline)
  - Throws on malformed response (missing choices, missing message.content)
  - Rejects unsupported model name at construction time

- `providers/anthropic.test.ts`:
  - Constructs `claude -p --tools ""` command exactly
  - Honors `--timeout` flag plumbing
  - Returns raw stdout (not parsed) so the runner's extractor sees full text

- `providers/index.test.ts`:
  - All 7 precedence cases from the Provider Selection table
  - Helpful error messages for ambiguous + unset

### Integration test (manual, documented)

After implementation lands and `DEEPSEEK_API_KEY` is set, run:

```bash
DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY \
KNOWLEDGE_FRESHNESS_PROVIDER=deepseek \
node dist/index.js knowledge-freshness audit-run-entry content/knowledge/core/security-best-practices.md
```

and verify the verdict JSON validates against the schema.

### Workflow validation

After merge, trigger `workflow_dispatch` on the cron workflow with the
new env block. Confirm:
1. The `npm install -g @anthropic-ai/claude-code` step is gone.
2. The audit step runs to completion with a deepseek-v4-flash verdict.
3. An end-to-end PR opens (or the candidate is dropped on `current`/`minor-drift` per the existing logic — which now persists `last-reviewed` metadata-only PRs).

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Quality drop from deepseek-v4-flash producing weaker drift detection | MMR corroboration step (Codex/Gemini/Claude on the proposed diff) catches hallucinations regardless of which model produced them. Human review is the final gate. |
| Operator forgets to set the secret in the GitHub repo | The cron fails on the first audit step with "no provider configured" — visible immediately in the Actions tab. |
| DeepSeek API outage or rate-limiting | Per-entry failure isolation in the cron loop means the workflow continues; no PRs open that day for affected entries; next day's cron retries. No retry layer at the provider level (avoids double-billing). |
| Token-budget mismatch (deepseek-v4-flash's context window is smaller than Claude's) | The audit prompt with pre-fetched bodies is bounded to 96KB per source × N sources (typically 1-3). DeepSeek-chat handles 64K context; we cap source bodies in audit-runner.ts already. If a verdict ever overruns, the cron logs the truncation; operator can shrink `MAX_SOURCE_BODY_BYTES` for DeepSeek specifically. |
| A future contributor reintroduces project-config-controlled provider URLs | Comment in `providers/deepseek.ts` and `providers/index.ts` explicitly documents decision #7's hardcoded-paths invariant. The unit test asserting the URL string is literal acts as a tripwire. |
| Operator sets `KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL` to an unsupported value | Validated at provider construction against a hardcoded allowlist; fails before any HTTP request. |

## Cost & Cadence Model

The Phase 1 design's "≤10 audits/day, ~2-4 steady state" budget is
unchanged. Per-call DeepSeek pricing (deepseek-v4-flash, May 2026) is
approximately one-tenth of Claude Opus 4.7 for comparable token counts,
so the steady-state monthly LLM-call cost drops accordingly. MMR
corroboration costs (Codex/Gemini/Claude on the diff) are unchanged —
those continue at Anthropic prices.

## Naming Reference

The locked name `knowledge-freshness` continues unchanged. New file
paths:

- `src/knowledge-freshness/providers/` — new directory
- `src/knowledge-freshness/providers/{index,anthropic,deepseek}.ts`
- `src/knowledge-freshness/providers/{index,anthropic,deepseek}.test.ts`

Env vars introduced:

- `DEEPSEEK_API_KEY` — DeepSeek auth (operator secret)
- `KNOWLEDGE_FRESHNESS_PROVIDER` — explicit provider selection (`anthropic` or `deepseek`)
- `KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL` — optional model override within the allowlist

CLI flag introduced:

- `--provider <anthropic|deepseek>` on `audit-run-entry`

## Resolved Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Scope of provider abstraction | Cron audit dispatch only; MMR untouched | Confirmed with operator: MMR depends on a specific sibling-package channel set, and the cron is the high-volume workload where switching matters. |
| 2 | Mechanism | New HTTP dispatcher alongside existing subprocess one (Provider abstraction) | Operator-confirmed preference for clean extensibility over the minimal-change branch-in-CLI shape. |
| 3 | Provider selection precedence | Flag > env var > inferred-from-key-presence > error | Matches operator's mental model of "explicit wins, ambiguity is loud, missing is loud." |
| 4 | Both-keys-set behavior | Fail loudly, demand explicit choice | Safer than silent guessing. Operator can `KNOWLEDGE_FRESHNESS_PROVIDER=deepseek` in their shell to disambiguate. |
| 5 | DeepSeek URL | Hardcoded literal `https://api.deepseek.com/chat/completions` | Preserves decision #7's "no project-config override of dispatch target." |
| 6 | DeepSeek model | Default `deepseek-v4-flash`; env override only within a hardcoded allowlist (`deepseek-v4-flash`, `deepseek-v4-pro`) | Cheaper, faster default; `deepseek-v4-pro` is available for operators who want a more capable model. The previously-supported `deepseek-chat` and `deepseek-reasoner` names are deprecated per the official DeepSeek changelog and intentionally excluded from the allowlist. |
| 7 | Retries | None at provider layer | Cron loop already isolates per-entry failures; adding retries would double-bill on transient errors. |
| 8 | Streaming | Off (`stream: false`) | The runner's JSON extractor needs the complete response. No latency benefit from streaming for a single ~2KB verdict. |
| 9 | CI: drop `npm install -g @anthropic-ai/claude-code`? | Yes, the cron is DeepSeek-only | Saves ~30s per run and avoids one transitive-dep risk. |
