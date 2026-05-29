# Open-Source Model Channels for MMR — Implementation Plan

**Date:** 2026-05-28
**Status:** Proposed
**Scope:** Add open-source / self-hosted model support to MMR as review channels,
via two complementary paths:

- **Path C — `kind: http` channel** (the strategic unlock): a first-class HTTP
  dispatcher for OpenAI-chat-compatible endpoints — DeepSeek, Together, Fireworks,
  Groq, OpenRouter, Anyscale, plus self-hosted vLLM / LM Studio / llama.cpp
  `llama-server`. This is the remaining unshipped piece of the v3.30 spec (**T1-C**).
- **Path A — Ollama (and other CLI) subprocess channels**: documented, tested,
  adaptable `.mmr.yaml` example blocks. Mostly config + docs — the engine support
  already exists.

**Explicitly out of scope:** user-specific local bridges (e.g. a personal
`local-ai-delegate` MCP). Those belong in a user's own `.mmr.yaml`, not in
Scaffold's shipped defaults. We instead ship a *generic* "bring-your-own-local-
delegate" recipe (§7) so any such setup can be wired up by the user.

---

## Context: what already exists (do not rebuild)

This plan builds on machinery already shipped in the v3.30 line. Verify each before
starting; the plan assumes these are present on `main`:

| Capability | Where | Status |
|---|---|---|
| `extends:` + `abstract:` channel inheritance (T1-A) | `config/schema.ts`, `config/loader.ts` | **shipped** |
| Declarative parsers (`unwrap-jsonpath`, `regex-findings`) | `core/parser.ts` | **shipped** |
| `prompt_delivery: stdin \| prompt-file` (engine support for arg-only CLIs) | `config/schema.ts`, `core/dispatcher.ts` | **shipped** (Grok work, 2026-05-28) |
| Compensator-by-channel-reference (T1-G) | `core/compensator.ts`, `DefaultsSchema` | **shipped** |
| OSS-runtime probe catalog + commented examples | `core/oss-examples.ts`, `core/runtime-probe.ts` | **shipped** |
| Trust boundary: project `.mmr.yaml` loaded from diff base ref (§5 decision 1, P0) | `config/loader.ts:118-129`, `review.ts --config-base-ref / --trust-project-config` | **shipped** |
| Stable `finding_key` + shingle, sessions, acks, `--max-rounds` (T2-A/B/D/F) | `core/stable-id.ts`, `commands/sessions.ts`, `commands/ack.ts` | **shipped** |

**The gap this plan closes:** there is still no channel `kind` discriminator and no
HTTP dispatcher. Every channel is implicitly `kind: subprocess`
(`spawn(cmd, args)` with stdin or prompt-file delivery). To hit an HTTP endpoint
today a user must write a shell shim. Path C removes that.

**Trust-boundary note (important, and good news):** the P0 secret-exfiltration risk
the spec calls out for HTTP channels — "a PR adds a `kind: http` channel pointing at
`attacker.example` with `api_key_env: SOME_CI_SECRET`" — is **already mitigated** by
the existing base-ref config loading: a channel added in a diff only takes effect
after merge. Path C must *preserve* this property (Task 9), not build it from
scratch. In untrusted-HEAD / non-Git modes, project channel config is already
disabled unless `--trust-project-config` / `--config-base-ref` is passed.

---

## File structure

```
packages/mmr/src/config/schema.ts          # ChannelConfigSchema → discriminated union on `kind`
packages/mmr/src/config/loader.ts          # z.preprocess to inject kind:'subprocess'; merge/abstract already handle it
packages/mmr/src/core/http-dispatcher.ts   # NEW — kind:'http' dispatch + auth derivation
packages/mmr/src/core/dispatcher.ts        # route by kind (or a thin dispatch() facade)
packages/mmr/src/commands/review.ts        # dispatch site routes http vs subprocess
packages/mmr/src/core/auth.ts              # http auth probe (derive /models URL)
packages/mmr/src/core/oss-examples.ts      # promote lms/llama-server/http stubs to real examples
packages/mmr/README.md                     # Ollama + HTTP recipes; BYO-delegate recipe
docs/reference/mmr-reference.html           # add an "OSS / HTTP channels" subsection
tests/config/schema-http.test.ts           # NEW
tests/core/http-dispatcher.test.ts          # NEW (mock fetch)
tests/integration/http-channel.test.ts      # NEW (local stub server)
tests/config/oss-examples.test.ts           # extend
```

---

## Design decisions

1. **OpenAI-chat only for v3.30** (per spec T1-C / §5 decision 8). The HTTP
   dispatcher POSTs a fixed body to a `/v1/chat/completions`-shaped endpoint:
   `{ model, messages: [{ role: 'user', content: prompt }], response_format?: { type: 'json_object' } }`.
   `response_format` is sent only when the channel's `output_parser` suggests JSON
   (i.e. `default`, `gemini`, or an `unwrap-jsonpath`→`default` chain). A true
   `generic` body-template mode is deferred.

2. **Schema stays `version: 1`-compatible.** Adding `kind: http` is additive:
   absence of `kind` continues to mean `subprocess`. A `z.preprocess` step injects
   `kind: 'subprocess'` before the discriminated union runs, so every existing
   `.mmr.yaml` parses unchanged. This is the single highest-risk migration point —
   Task 1 tests it explicitly with real existing configs.

3. **Secrets only via `api_key_env`.** Never inline. The dispatcher reads the env
   var named by `api_key_env` and sends it as `<api_key_prefix><value>` in the
   `<api_key_header>` header (defaults: `Bearer ` / `Authorization`). The existing
   `redact.ts` already treats `api_key_env` as a non-secret env-var *name* while
   redacting actual header/env secret values.

4. **Auth probe derives the models URL** — never a naive `GET <endpoint>` (a GET on
   `/v1/chat/completions` returns 405 even with valid creds). Replace a trailing
   `/chat/completions` with `/models`; if the path doesn't end that way, require an
   explicit `auth.check_endpoint`. Probe with the channel's full header context;
   map `200`→`ok`, `401`→`auth_failed`, else `failed`.

5. **OSS findings are corroborating, not gating, by default.** Weaker OSS models
   should rarely block on their own. We lean on the *existing* reconciler scoring:
   a single-source OSS finding lands at `medium`/`low` confidence; an OSS finding
   that agrees with codex/gemini/claude promotes the group to `consensus`/`high`.
   No new gating math in this plan (a per-channel `weight` field is noted as a
   future option in §6, not built here).

---

## Path C — `kind: http` channel (Tasks 1–10)

### Task 1: Channel-kind discriminated union + zero-edit migration
- **Schema:** convert `ChannelConfigSchema` to `z.discriminatedUnion('kind', [SubprocessChannel, HttpChannel])`. Common fields (`enabled`, `flags`, `env`, `prompt_wrapper`, `output_parser`, `stderr`, `timeout`, `extends`, `abstract`, `prompt_delivery`) live on both arms. Subprocess arm adds `command` + shell-shape `auth`. HTTP arm adds `endpoint`, `model`, `endpoint_convention: z.literal('openai-chat')`, optional `headers`, `api_key_env`, `api_key_header` (default `Authorization`), `api_key_prefix` (default `Bearer `), and an HTTP-shape `auth` (`check_endpoint?`, `check_method?`, `check_status_ok?`, `timeout?`, `recovery?`).
- **Loader:** add a `z.preprocess` (or manual transform in `loadConfig`) that injects `kind: 'subprocess'` into any channel object missing it, before the union runs.
- **Tests (write first):** existing built-in channels and a `kind`-less user config still parse → `kind === 'subprocess'`; a valid `kind: http` channel parses; `endpoint_convention: 'generic'` is rejected; an http channel missing `endpoint` is rejected; an abstract http parent skips the `endpoint`-required check.

### Task 2: `extends`/abstract validate-on-merged still works for http
- Confirm (and test) that an abstract `kind: http` parent + concrete child that inherits `endpoint`/`model` validates on the merged result, mirroring the subprocess behavior already shipped.
- **Test:** `openai-compatible-base: { abstract: true, kind: http, endpoint_convention: openai-chat, output_parser: {...} }` + `deepseek: { extends: openai-compatible-base, endpoint: ..., model: deepseek-chat, api_key_env: DEEPSEEK_API_KEY }` validates.

### Task 3: `http-dispatcher.ts` — request shaping
- New module exporting `dispatchHttpChannel(store, jobId, channelName, opts)` mirroring `dispatchChannel`'s store contract (running → completed/failed/timeout; save output via `saveChannelOutput`).
- Build body `{ model, messages: [{ role: 'user', content: prompt }] }`; add `response_format: { type: 'json_object' }` when the parser is JSON-shaped.
- POST via `fetch` with `AbortController` for `timeout`. Map status: `2xx`→parse+complete, `401`→`auth_failed`, `429`/`5xx`→`failed`, abort→`timeout`, network error→`failed`.
- **Tests (mock `fetch`):** body shape; `response_format` present only for JSON parsers; each status→ChannelStatus mapping; timeout via aborted fetch; secret read from `api_key_env` and placed in the right header with prefix.

### Task 4: HTTP auth probe (derive `/models`)
- In `auth.ts` (or http-dispatcher), add `checkHttpAuth(channel)`: derive models URL by replacing trailing `/chat/completions` → `/models`; if not present, require `auth.check_endpoint`; GET with full header context; `200`/`401` → `ok`/`auth_failed`; other/timeout → `failed`/`timeout` with a `recovery` string.
- **Tests:** URL derivation cases (`/v1/chat/completions`→`/v1/models`, custom base, missing-path→error-requiring-check_endpoint); status mapping; header/secret inclusion in the probe.

### Task 5: Route dispatch by `kind`
- At the two dispatch sites in `review.ts` (parallel + serial), branch on `chConfig.kind`: `http` → `dispatchHttpChannel`, else `dispatchChannel`. Keep a single `dispatch()` facade if cleaner.
- Auth-check gate (`review.ts` preflight) routes to `checkHttpAuth` for http channels.
- **Test:** an integration test (Task 8) covers end-to-end; unit-assert the routing picks the right dispatcher per kind.

### Task 6: Redaction + config-show for http channels
- Verify `mmr config channels show <name>` redacts `headers` secret values and shows `api_key_env` *name* only (reuse existing `redact.ts`). Emit the existing "hardcoded secret in headers" warning for http channels too.
- **Tests:** show output for an http channel redacts an `Authorization` header literal; `api_key_env` name is printed.

### Task 7: Abstract base templates for common providers
- Ship `abstract: true` `kind: http` example blocks (commented, opt-in) in `oss-examples.ts` / generated `.mmr.yaml`: `openai-compatible-base`, plus concrete recipes for DeepSeek, Together, Groq, vLLM, LM Studio, llama-server. Each: endpoint, model, `api_key_env`, parser chain.
- **Test:** `mmr config init` emits the http example block; the emitted YAML round-trips through the loader (uncommented) and validates.

### Task 8: Integration test against a local stub server
- Stand up a tiny Node HTTP server in-test that mimics `/v1/chat/completions` (returns a findings JSON payload) and `/v1/models` (200). Configure a `kind: http` channel pointing at it and run the results pipeline end-to-end; assert findings reconcile and the verdict computes.
- Cover: JSON `response_format` path; a non-JSON reply that still parses via the parser chain; a 401 → `auth_failed` → compensating pass fires.

### Task 9: Trust-boundary regression coverage (P0 — preserve, don't rebuild)
- **Test:** a `kind: http` channel that exists ONLY in the working-tree `.mmr.yaml` (not in the base ref) is **not** dispatched when reviewing a diff without `--trust-project-config` — proving the existing base-ref loading gates HTTP channels exactly as it gates subprocess ones.
- **Test:** in non-Git / `--diff` stdin mode, project channels are disabled unless `--trust-project-config` / `--config-base-ref` is passed.
- This is the single most important safety test in the plan — an HTTP channel is an exfiltration vector, and the gate must demonstrably hold for it.

### Task 10: Docs for Path C
- `packages/mmr/README.md`: HTTP-channel section + DeepSeek/Together/Groq/vLLM/LM-Studio recipes; the `api_key_env` (no-inline-secret) rule; the trust-boundary note for CI.
- `docs/reference/mmr-reference.html`: add an "OSS / HTTP channels" subsection under §5 (channel architecture) and a `kind: http` row to the channel config shape.

---

## Path A — Ollama & CLI subprocess channels (Tasks 11–13)

Engine support already exists (subprocess + `prompt_delivery` + declarative parsers).
This path is real, tested examples — not new code.

### Task 11: Promote the Ollama example to a tested recipe
- Turn the commented `oss-examples.ts` Ollama stub into a documented, validated block:
  ```yaml
  channels:
    qwen-coder:
      command: ollama run
      flags: ["qwen2.5-coder:32b", "--format", "json"]
      output_parser: { kind: unwrap-jsonpath, wrap: "$.response", then: default }
      auth: { check: "ollama list", timeout: 5, failure_exit_codes: [1], recovery: "ollama serve" }
  ```
- **Test:** the emitted example, uncommented, parses and validates; `ollama` probe detection still gates whether the example is surfaced by `mmr config init`.

### Task 12: Arg-only local CLIs via `prompt_delivery`
- Document that a local CLI which requires the prompt as an arg (not stdin) uses `prompt_delivery: prompt-file` + `{{prompt_file}}` — the same mechanism Grok uses. Add one such example (e.g. `llama-cli --file {{prompt_file}}`-style).
- **Test:** schema accepts the example; (no new engine code — covered by existing prompt-file dispatch tests).

### Task 13: JSON-reliability guidance + shared strict wrapper
- Document the three-tier reliability strategy for weaker OSS models and ship a reusable `prompt_wrapper` snippet that hard-pins the Finding JSON schema:
  1. Provider JSON mode (`--format json` for Ollama; `response_format` for HTTP).
  2. `unwrap-jsonpath` → `default` parser chain (handles a wrapper envelope).
  3. `regex-findings` parser as a last-resort fallback for models that won't hold JSON.
- **Test:** a sample "messy" OSS output (prose + fenced JSON) parses via the documented chain; a no-JSON output yields a clean parser-error finding rather than a crash.

---

## §6 Confidence weighting (design note — mostly already handled)

No new gating code in this plan. The reconciler already scores single-source
`compensating-*` findings as `low` and other single-source as `medium`, and promotes
multi-source agreement to `high`. OSS channels inherit this for free. If experience
shows OSS channels are too noisy, a **future** follow-up could add an optional
per-channel `weight` (or `advisory: true`) flag that caps an OSS-only finding's
contribution to the gate — noted here, not built. Surfacing: ensure the report makes
OSS-only findings visibly single-source so humans can discount them.

## §7 Bring-your-own-local-delegate (generic recipe — not a built-in)

Ship documentation only (README + reference doc). Two supported shapes for users
with a local model bridge (Ollama, LM Studio, a personal MCP/OpenAI proxy, etc.):

- **HTTP:** point a `kind: http` channel at the local OpenAI-compatible endpoint
  (`http://localhost:11434/v1/chat/completions` for Ollama, `:1234` for LM Studio,
  the vLLM port, or a personal proxy). No secret needed for localhost.
- **Subprocess:** wrap any local CLI as a subprocess channel, using
  `prompt_delivery: prompt-file` if it won't read stdin.

Explicitly state: Scaffold does **not** ship any user-specific delegate as an
enabled default — these are recipes the user adapts in their own `.mmr.yaml`.

---

## Slotting against the in-flight v3.30 work

- Path C **is** spec item **T1-C**, the last unshipped v3.30 channel feature. Its
  prerequisites (T1-A `extends`/abstract, declarative parsers, base-ref trust
  boundary, `prompt_delivery`) are all already merged, so it can land as a focused
  PR. If v3.30 scope is tight, ship Path C as **v3.30b** (HTTP) after the loop-control
  work, per the spec's split suggestion.
- Path A is doc/example-only and can ship independently at any time.

## Test plan

- Unit: schema migration (kind-less → subprocess), http schema validation, request
  body shaping, status→ChannelStatus mapping, auth URL derivation, redaction.
- Integration: local stub `/v1/chat/completions` + `/v1/models` end-to-end through
  the results pipeline; 401→compensating-pass path.
- Security regression: working-tree-only http channel is NOT dispatched on a diff
  review without `--trust-project-config` (Task 9).
- Examples: every shipped recipe (Ollama + each HTTP provider), uncommented, parses
  and validates.
- `make check-all` green.

## Acceptance

- A user can add a DeepSeek/Together/Groq/vLLM/LM-Studio channel with ~5 lines of
  `.mmr.yaml` and an env var, and it participates in review + reconciliation.
- An Ollama (or other local CLI) channel works via documented config alone.
- Existing `.mmr.yaml` files and built-in channels parse unchanged (`kind` absent →
  subprocess).
- A `kind: http` channel introduced in a PR diff does not take effect until merged
  (trust boundary holds).
- OSS-only findings surface as single-source and don't block on their own through
  ordinary reconciliation.

## Self-review checklist

- [ ] No inline secrets anywhere; `api_key_env` only; redaction verified.
- [ ] `z.preprocess` migration tested against real existing configs.
- [ ] Auth probe never does a naive `GET` on the completions URL.
- [ ] Trust-boundary regression test present and passing for http channels.
- [ ] HTTP timeouts use `AbortController`; no hung fetches.
- [ ] Reference HTML + README updated; recipes validated by a test, not just prose.
- [ ] `make check-all` green.
