# Changelog

## [Unreleased]

## [3.1.1] — 2026-07-13

### Fixed

- **grok channel: unblock reviews broken by an upstream grok regression.**
  Starting with grok 0.2.99, grok aborts
  headless session creation with `agent building failed: ... RequirementError {
  tool: GrokBuild:run_terminal_cmd, auto_background_on_timeout requires
  enabled_background to be true }` because it **builds and validates every
  built-in tool before applying the `--tools` allowlist** — so restricting tools
  to `web_search,web_fetch` was not enough; the broken `run_terminal_cmd`
  definition still failed the build and exited 1 before any model call, degrading
  the grok channel on every review. The built-in grok channel now passes
  `--disallowed-tools run_terminal_cmd`, removing the offending tool from the
  build. A closed-book text review never needs a terminal, so this also tightens
  the hardened posture (no bash surface) and stays correct once grok fixes the
  upstream default. Customizers who override `channels.grok.flags` in `.mmr.yaml`
  must restate this flag (array overrides replace, not merge).

## [3.1.0] — 2026-06-21

### Added

- **OpenCode skill platform.** `mmr skill install --platform opencode` (and
  `--all`) now installs the full review Agent Skill to
  `.opencode/skills/mmr/SKILL.md`, which OpenCode auto-discovers (the directory
  name matches the skill's `name:`, as OpenCode requires). This is richer than
  the `AGENTS.md` managed block OpenCode also reads.

### Removed

- **Gemini channel retired.** Google's Gemini CLI is sunset; **Antigravity**
  (`agy`) is the supported replacement. The `gemini` review channel is now a
  disabled, never-dispatched **tombstone**: existing `.mmr.yaml` files that name
  `gemini` (e.g. in `channels_disabled` or a `channels.gemini` override) keep
  loading, but it is never dispatched, an explicit `--channels gemini` errors
  with a migration hint, retirement is enforced at load (a config cannot
  un-retire it), and `mmr config init`/`doctor`/`config test`/`config enable`
  all treat it as retired. The `gemini` skill-install platform and its template
  were removed. This is non-breaking — the channel was already disabled by
  default and its backend is sunset.

## [3.0.1] — 2026-06-21

### Fixed

- **`mmr skill install` now teaches `mmr critique`.** The per-platform skill
  templates that ship in the package (`templates/skills/{agents,gemini,cursor}`
  — installed into Codex/Antigravity `AGENTS.md`, `GEMINI.md`, and Cursor rules)
  covered only `mmr review`. They now include a "Design critique" section
  (advisory; convergence/divergence/synthesis; `--context`/`--session`/
  `--lenses`), and the Cursor rule's `description` mentions design critique so it
  activates on critique requests. (3.0.0 added `mmr critique` but missed these
  installable skills.)

## [3.0.0] — 2026-06-20

**Repositioned: from code reviewer to multi-model second-opinion engine.** MMR
now has two peer commands sharing one core (independent fan-out + reconciliation):
the existing `mmr review` (code review, gated) and a new `mmr critique` (design
review, advisory). This release is **purely additive** — `mmr review` and all
existing behaviour are unchanged; the major bump signals the repositioning.

### Added — `mmr critique`

A multi-model **design/brainstorm critique** of an artifact (a design doc, a
pasted "problem + proposed solution", or a plan). It fans the artifact out to the
same independent channels with a design-critique prompt (alternatives, missed
considerations, tradeoffs, risks — *not* bug-finding) and is **advisory**: no
severity, no pass/fail gate, **always exits 0**.

- **Convergence vs. divergence (D1/D2).** Clusters items by cross-model agreement
  (consensus / majority / unique) and surfaces genuine disagreements as
  first-class **`split`** items carrying the deciding **crux** — it never picks a
  winner.
- **Editorial synthesis (D6).** An optional pass (one `claude -p` call) that
  groups, cites item ids, and recommends — editorial, not judicial; never
  resolves a split. `--no-synthesis` skips it.
- **Repo grounding (D3).** `--context repo` (or `--context-paths a.ts,b.ts`)
  folds a structural skeleton of the codebase into the critique so models judge
  fit against the real system. No embeddings; path-contained; secret files
  (`.env`, keys, credentials) are never read; budget-capped; the report discloses
  `context_used`.
- **Iterative refinement (D7).** `--session <id>` carries a bounded prior-round
  ledger so a re-run after edits asks "which prior points did the revision
  address?" without the prompt growing unbounded.
- **Persona lenses (D5).** `--lenses skeptic,simplifier,…` gives each channel a
  distinct lens for breadth; because that trades away independence, the output
  relabels "consensus" as "perspectives".
- Flexible input (file path or `-` for stdin); `--focus`; `--format text|json`.

## [2.0.0] — 2026-06-20

**Agent-legible config & self-healing channels.** Makes MMR's configuration
discoverable, mutable, and self-healing for the AI agents that drive it — you no
longer hand-edit `.mmr.yaml` to manage channels, and the review stops wasting
work on channels that aren't installed.

### ⚠️ Behavior changes (why this is a major release)

- **Structurally-absent channels are no longer compensated by default.** A
  channel whose CLI is **not installed** (`not_installed`) used to get a
  substitute "compensating pass" on **every** review — added latency, no real
  coverage. It is now **skipped by default** with a one-line remediation notice.
  *Transient* failures (auth expired, timeout, runtime error) are still
  compensated automatically. Restore the old behavior with `--compensate-missing`
  on the review, or mark a channel `required: true` in config. A CI gate that
  implicitly relied on the compensating pass for a missing CLI may see different
  results — install the CLI, set `required: true`, or pass `--compensate-missing`.

### Added

- **Config mutation commands** (no more hand-editing YAML):
  - `mmr config enable|disable <channel>` — toggle a channel; writes the canonical
    `channels.<name>.enabled`. Disabling a *not-installed* channel records to the
    global `~/.mmr/config.yaml` (machine-level); `--global`/`--project` override.
  - `mmr config set <dotted.path> <value>` / `unset <dotted.path>` — edit any
    value, validated before write (an edit that would break config loading is
    rolled back), scope-aware, type/string-aware (env/headers stay strings).
- **Config introspection:** `mmr config path` (read/write search order),
  a provenance `source` column + `--format text` table on `config channels`, and
  a top-level `mmr config show <channel>` alias.
- **`mmr doctor`** — one-shot channel health (install + auth, HTTP probed over
  the wire) with per-channel remediation; `--fix` disables not-installed channels;
  `--format json` for agents.
- **`mmr commands [--json]`** — machine-readable capability manifest; an agent
  loads the whole command surface in one call instead of probing `--help`.
- **`mmr explain <topic>`** — inline docs for channels, config, scopes,
  compensation, redaction, provenance.
- **Per-channel `required: true`** schema field (compensation opt-in).
- **Point-of-pain remediation** in review output for degraded channels.

### Changed / Security

- **Comment-preserving, symlink-safe config writes.** Mutations preserve comments
  and key order (eemeli `yaml`), create new files `0600`, refuse to write through
  a symlinked project config (clobber guard), and validate before committing.
- **Secret redaction is centralized and complete.** A user-configurable
  `auth.recovery` (or inline command token) is redacted everywhere it is printed —
  `config test`/`channels`/`show`, `mmr doctor`, and review dry-run/results output.
- **A disabled channel no longer needs a `command`** — a bare `enabled: false`
  override is valid in any layer, so scoped disables are portable across repos.

## [1.7.0] — 2026-06-19

### Added

- **New built-in `opencode` review channel** running the open-source OpenCode CLI
  (`opencode run`). **Disabled by default** (opt-in) — enable in `.mmr.yaml`
  (`channels: { opencode: { enabled: true } }`) or pass `--channels=opencode`
  (alias: `opc`). The prompt is delivered over stdin and the plain-text model reply
  is parsed by the `default` findings parser. Runs hardened: a neutral cwd (closed-book
  — opencode reviews only the diff in the prompt, not the working tree) and, because
  opencode has no OS sandbox flag, every tool is denied via
  `OPENCODE_PERMISSION='{"*":"deny"}'` so a prompt-injected diff has no execution
  surface (no bash/read/write — the review is text-in/text-out); `--pure` skips external
  plugins. `$HOME` is left real so opencode finds its credentials at
  `~/.local/share/opencode/auth.json`; the auth probe runs a real `opencode run` over
  stdin and treats a non-zero exit as failure (recovery: `opencode auth login`).
  An unavailable `opencode` channel gets a correctness-focused compensating pass.

## [1.6.2] — 2026-06-19

### Changed

- **Default reviewer switched from Gemini to Antigravity (`agy`).** The built-in `gemini` channel is now `enabled: false` by default — Gemini Code Assist for individuals is discontinued and the CLI hard-fails auth with `IneligibleTierError`. The `antigravity` channel (`agy`) is Google's supported replacement and remains enabled by default. `gemini` stays available as an explicit opt-in for anyone with a working configuration. Updated config defaults, `config init`, skill templates, and the README to match.

## [1.6.1] — 2026-06-08

### Fixed

- **`doc-conformance` channel auth check always failed.** The auth probe ran
  `scaffold --version`, which exits 1 on scaffold installs that don't expose a
  `--version` flag — and 1 is in the channel's `failure_exit_codes`, so the `&&`
  chain reported auth failure even when scaffold and Claude were both installed and
  working. Switched the probe to the `scaffold version` subcommand, which works on
  every scaffold release. (The channel is disabled by default, so impact was
  limited to configs that enable `doc-conformance`.)

## [1.6.0] — 2026-06-04

### Added
- `mmr skill install` — install a "use MMR for code review" skill into a project in
  the native convention of each agent CLI: Cursor (`.cursor/rules/mmr-review.mdc`),
  Gemini (`GEMINI.md`), Codex and Antigravity (`AGENTS.md`). Supports `--platform`
  (repeatable), `--all`, `--dir`, `--force`, and `--dry-run`.
- Block-mode targets (`GEMINI.md`, `AGENTS.md`) are managed idempotently between
  `<!-- BEGIN mmr-skill -->` / `<!-- END mmr-skill -->` delimiters, preserving
  surrounding user content; Codex and Antigravity share the `AGENTS.md` block (the
  install dedupes by resolved path and reports both). Skill templates are bundled
  under `templates/skills/` and published with the package.

## [1.5.0] — 2026-05-30

### Added
- New built-in `antigravity` review channel running Google's `agy` CLI (the
  forward replacement for the deprecating Gemini CLI), enabled by default and
  running in parallel with the `gemini` channel until Gemini's 2026-06-18 sunset. Runs
  hardened: neutral cwd (strips project config + denies repo access), `--sandbox`,
  auto-approve to avoid headless hangs; real HOME (agy creds live under `$HOME`).
- `agy` accepted as an alias for the canonical `antigravity` channel name in
  `--channels`, `channels_disabled`, and `channels:` config keys.

### Fixed
- Host isolation: the grok credential symlink is now gated on HOME neutralization,
  so a cwd-only neutral posture (the antigravity channel) no longer creates a
  `.grok/auth.json` symlink in its working directory.

## [1.4.1] — 2026-05-30

Reliability hardening for the built-in **grok** review channel. A grok review
could silently answer from the *wrong* context — it is agentic and could ignore
the supplied prompt/diff, read the working tree, or latch onto a prior session's
cross-session memory (observed: a review of one repo's doc that instead reviewed
an unrelated repo and reported that repo's findings). The grok channel now runs
**closed-book** by construction. Web search stays on by default; this is a
fix/security change, not a feature.

### Fixed

- **Grok channel context bleed (P1).** The built-in `grok` channel now invokes
  grok with `--no-memory` (no cross-session memory), a deny-by-default web-only
  tool allowlist `--tools web_search,web_fetch` (blocks `read_file` and other
  filesystem tools while keeping web search), and `--no-subagents --no-plan`.
- **Host-config injection.** The channel runs grok under an isolated `HOME` /
  `XDG_CONFIG_HOME` and a neutral working directory (a per-run temp dir), so a
  review is no longer seeded with the host's grok skills, MCP servers, hooks,
  permission rules, or the project's `Claude.md` / `Agents.md`. Verified via
  `grok inspect` (all host-config sources empty under the hardened posture).
- **File-based auth preserved.** Only `~/.grok/auth.json` is symlinked into the
  isolated HOME, so auth keeps working on file-credential platforms (Linux/CI)
  without re-introducing host config. (macOS keychain auth was already
  unaffected.)
- **Temp-dir lifecycle.** Per-run isolated dirs are cleaned up on every dispatch
  termination path (close/error/timeout/synchronous-throw) and on SIGINT/SIGTERM,
  with a startup sweep backstop for orphans; created `0700`; cwd-pointing env
  vars (`PWD`/`OLDPWD`/`INIT_CWD`) pinned to the neutral dir.

### Changed

- The same hardened posture is inherited by the **compensator** path when grok
  is the configured compensator channel (a new optional `cwd` flows through the
  channel config, dispatcher, auth probe, and compensator dispatch).

### Notes

- To run grok **closed-book** (no web access), override `channels.grok.flags` in
  `.mmr.yaml`. Because config merge replaces arrays, the override must restate
  the full hardened flags array and add `--disable-web-search`; any file-path
  flag must be absolute (the channel runs in a neutral cwd). See the README. An
  existing `channels.grok.flags` override **replaces** the new hardened defaults
  — restate the full array to keep the protections.

## [1.4.0] — 2026-05-30

A large feature wave spanning channel ergonomics, the review loop (sessions +
sticky acks), a security trust boundary, and HTTP-endpoint channels. Almost
everything is additive and opt-in; the one behavior change is the trust
default-deny called out under **Changed** and **Migration** below.

### Added

- **Channel inheritance — `extends:` and `abstract:` templates.** Define an
  abstract parent channel once and inherit it per model; the parent is
  deep-merged into the child (child overrides win). Abstract channels are
  templates and never dispatch. Cycle detection rejects `A→B→A` loops, the
  maximum `extends` depth is 4, and concrete channels must resolve a `command`
  after merge.
- **`mmr config init` local-runtime probing.** Probes for `ollama`, `lms`
  (LM Studio), `llama-server` (llama.cpp), and `local-ai-delegate` (1s
  per-probe timeout) and emits commented example channel blocks for detected
  runtimes. `--with-examples` emits the full OSS catalog regardless of
  detection.
- **`mmr config channels show <name>`.** Prints the fully merged config for one
  channel with per-field provenance (`# from default | user | project`).
  Secrets in `env`/`headers` are redacted by default; `--no-redact` prints them
  verbatim with a stderr warning banner.
- **Custom output parsers (object form for `output_parser`).** In addition to
  string parser names, `output_parser` now accepts a structured object:
  `kind: unwrap-jsonpath` (extract the model output from an envelope via a
  `wrap:` JSONPath selector, then run `then:`) and `kind: regex-findings`
  (one finding per regex match via `pattern` + a `fields` index mapping).
- **Configurable compensator.** `defaults.compensator.channel` redirects
  compensating passes from the built-in `claude -p` default to any configured
  channel, and `defaults.compensator.channel_focus_map` overrides the focus
  preamble per channel. Enables a fully OSS compensator. (Default behavior is
  unchanged when `defaults.compensator` is unset.)
- **Grok built-in review channel.** Enabled by default alongside Codex, Gemini,
  and Claude. Disable with `channels_disabled: ["grok"]`.
- **Per-channel `prompt_delivery: stdin | prompt-file`.** First-class support
  for arg-only CLIs that ignore stdin (e.g. Grok): writes the prompt to a temp
  file and substitutes a `{{prompt_file}}` placeholder in flags. Defaults to
  `stdin`.
- **`mmr review --dry-run` preview mode.** Resolves the target diff, runs
  install/auth checks, and prints the assembled prompt each valid channel would
  receive — without spawning review subprocesses.
- **Sessions — `mmr sessions start | list | show | end`.** Group related review
  rounds. `mmr review` gains `--session <id>`, `--round N` (one-based), and
  `--max-rounds`. Review jobs auto-link to session state. Session ids must match
  `^[a-zA-Z0-9_-]+$` and exclude reserved names (`con`, `prn`, `aux`, `nul`,
  `com1`–`com9`, `lpt1`–`lpt9`, `index`, `__proto__`).
- **Stable `finding_key`.** Each reconciled finding carries a deterministic
  identity hash from the normalized location + category + a SHA-1 of the
  normalized description/suggestion (severity excluded). Normalization strips
  trailing line/column spans and inline `line N` mentions and folds
  case/whitespace, so line drift and severity changes don't change a finding's
  identity across rounds. The reconciler now groups by stable identity rather
  than location alone.
- **Sticky acks — `mmr ack add | list | rm | prune`.** Acknowledge an
  intentional finding so later reviews surface it as advisory instead of
  blocking. Keyed by `finding_key` with a location-anchored fuzzy fallback
  (Jaccard ≥ 0.7 on the description shingle) that survives small phrasing
  changes. `add` takes `--reason`; `--scope project` (default, committed at
  `./.mmr/acks/<key>.json`) or `--scope user` (`~/.mmr/acks/`). Acked findings
  stay visible with `acknowledged: true` and `ack_match: 'exact' | 'fuzzy'`.
- **HTTP-endpoint channels (`kind: http`).** POST reviews to OpenAI-compatible
  `/v1/chat/completions` endpoints (LM Studio, vLLM, llama-server, the Ollama
  shim, Groq, Together.ai, Anyscale, Fireworks) without a shell wrapper. Fields:
  `endpoint`, `model`, `endpoint_convention: openai-chat` (the only convention
  in this release; `generic` is rejected), `api_key_env`, `api_key_header`
  (default `Authorization`), `api_key_prefix` (default `Bearer `; set `""` for
  raw keys), and `headers`. The auth-probe derives a `/models` URL from a
  trailing `/chat/completions` or uses an explicit `auth.check_endpoint`. Status
  mapping: 200→completed, 401→auth_failed, 429/5xx→failed, timeout→timeout.
  Review and compensator dispatch route by channel kind. The API key value is
  sent per request but never logged or persisted.
- **Trust-boundary flags and reporting.** New `--accept-new-acks`,
  `--trust-project-config`, `--trust-project-acks`, and `--config-base-ref <ref>`
  flags; a `trust_mode` field (`'base-ref' | 'untrusted-head' | 'non-git'`) on
  review output; and `proposed_acks` / `proposed_config_change` reporting (see
  **Security** and **Changed**).
- **Loop-control config (`defaults.loop_control`).** `max_rounds_default` (default 5)
  supplies the automatic `--max-rounds` cap when `--session` is used without an
  explicit value. The `repeat_suppression_enabled` / `repeat_downgrade_after` /
  `repeat_suppress_after` fields are accepted and validated for future use (T2-C)
  but do not yet affect review or reconciliation behavior.
- **`doc-conformance` built-in channel** running
  `scaffold observe audit --output-mode=mmr-findings` and mapping audit-engine
  findings into MMR's Finding shape. Disabled by default; enable via
  `--channels=doc-conformance` or `.mmr.yaml`.
- **Interactive HTML MMR reference** (`docs/reference/mmr-reference.html`)
  covering the flag surface, channel architecture, Finding/verdict model, and
  `.mmr.yaml` configuration.

### Changed

- **Default-deny for working-tree project config/acks (behavior change).** In
  `untrusted-head` mode (`--staged`, `--diff`, an unresolvable `--pr` under CI)
  and `non-git` mode, project `.mmr.yaml` and `./.mmr/acks/` are **no longer
  loaded** unless you pass `--trust-project-config` / `--trust-project-acks`
  (or supply `--config-base-ref`). Previously they were auto-loaded from the
  working tree. A diff that adds or modifies `.mmr.yaml` or `./.mmr/acks/`
  returns `verdict: 'needs-user-decision'` until the operator opts in. See
  **Migration**.
- **Discriminated channel schema on `kind`.** `ChannelConfigSchema` is now a
  discriminated union (`kind: 'subprocess' | 'http'`); a `z.preprocess` injects
  `kind: 'subprocess'` for legacy configs that omit the field, so existing
  subprocess configs keep parsing unchanged.
- **Per-arm auth schema.** `auth` is split per channel kind: subprocess keeps
  the existing `check` / `failure_exit_codes` / `recovery` shape; http uses a
  new auth-probe shape (`check_endpoint?` / `check_method` / `check_status_ok` /
  `timeout`). HTTP channels with a non-standard `endpoint` path now require
  `auth.check_endpoint`. Subprocess configs are unaffected.
- **`--max-rounds` cap.** With `--session` set, exceeding the round cap exits
  early with `verdict: 'needs-user-decision'` and a `summary` of
  `max_rounds_exceeded: …`.
- **Reconciler groups findings by stable `finding_key`** instead of by location.
- **`output_parser` widened** to `string | OutputParserConfig` across the
  loader, parser factory, and results pipeline (string form remains valid).
- **`JobMetadata` / `ReconciledResults`** gained optional fields: `session_id`,
  `round`, `finding_key`, ack/suppression fields, and persisted `trust_mode` /
  `proposed_acks` / `proposed_config_change` (so `results` and `reconcile`
  reproduce trust/ack context without re-deriving it). Text and markdown
  formatters render trust context.

### Fixed

- **`MMR_HOME` is now honored everywhere.** Previously only `review`'s jobs dir
  honored `MMR_HOME`; `jobs`/`status`/`results`/`reconcile` read a hardcoded
  `~/.mmr/jobs`. All commands now resolve through a single `resolveJobsDir()`.
- **`results`/`reconcile` no longer strip ack and trust context** by re-running
  the pipeline and overwriting saved results; they rebuild from persisted job
  state so acknowledged/trust stamping survives.
- **`mmr config channels show`** now renders object-form `output_parser` as its
  `kind` instead of an empty/incorrect value.
- **Secret-redaction hardening** in config introspection (inline secret-shaped
  header detection and warnings; env-var-name pointers such as `api_key_env`
  treated as non-secret).

### Security

- **P0 — HTTP-channel secret exfiltration fix (load-bearing).** A PR adding a
  `kind: http` channel to `.mmr.yaml` (e.g. pointed at an attacker endpoint with
  `api_key_env: OPENAI_API_KEY`) could otherwise exfiltrate CI secrets and diff
  content when a maintainer's CI ran `mmr review --pr` on the untrusted head.
  Closed by base-ref config/ack loading plus a pre-dispatch trust gate, with a
  dedicated regression test.
- **Base-ref trust boundary.** When a trusted base ref is resolved (`--pr` with
  a resolved upstream base, explicit `--base`, explicit `--config-base-ref`, or
  the local non-CI `HEAD` default), `.mmr.yaml` and `./.mmr/acks/` are loaded
  exclusively from that ref via `git show`, never from the working tree. Closes
  ack self-suppression (a PR acking findings it introduces in the same diff) and
  the HTTP exfiltration above. The gate is hoisted before dry-run / job creation
  / dispatch; base refs are validated against a safe-refname allow-list. User-
  scope config/acks (`~/.mmr/...`) are trusted unconditionally in every mode.
- **AckStore path hardening.** Strict SHA-1 `finding_key` validation,
  filename==key + shape integrity checks, write-side symlink rejection with
  `O_EXCL` atomic temp writes (TOCTOU), read-side `lstat`/size/symlink skipping,
  realpath ancestor containment, and fail-safe degradation (a poisoned acks tree
  degrades to no-suppression rather than crashing).

### Migration

- **Default-deny trust boundary.** If you review with `--staged`, `--diff`, an
  unresolvable `--pr` under CI, or in a non-git directory and relied on an
  auto-loaded working-tree `.mmr.yaml` or `./.mmr/acks/`, those are no longer
  loaded automatically. Either run against a trusted base ref (`--pr` with a
  resolvable base, `--base`, or `--config-base-ref <ref>`) or opt in explicitly
  with `--trust-project-config` / `--trust-project-acks` / `--accept-new-acks`.
  The common `--pr`-with-resolvable-base and local-`HEAD` flows are unchanged.

## [1.3.0] — 2026-04-28

### Added
- **`advisory_count` field in reconciled results.** Findings strictly below
  the configured `fix_threshold` are now counted in `results.advisory_count`
  in the JSON output and rendered as `Advisory: N` (text) or
  `**Advisory:** N` (markdown) in the verdict copy when non-zero. The gate
  is unchanged — advisory findings remain in `reconciled_findings` but
  don't cause `blocked`.
- **Self-documenting `mmr config init` template.** New `.mmr.yaml` files
  include an explanatory comment block above `fix_threshold` describing
  the P0–P3 tiers, and the value is written explicitly (`P2`) rather than
  relying on the schema default — so future default shifts don't silently
  change behavior for existing projects.

## [1.2.2] — 2026-04-27

### Fixed
- **Default `gemini` channel command was broken — channel failed every dispatch in 0s.**
  `BUILTIN_CHANNELS.gemini.command` was `'gemini -p'`. The `-p`/`--prompt`
  flag *requires* a positional value, but MMR delivers prompts via stdin.
  With `gemini -p --output-format json` and prompt on stdin, gemini parsed
  `--output-format` as `-p`'s value and bailed out with
  `Not enough arguments following: p`, failing the channel in 0s every
  time. Default command is now just `'gemini'` so gemini reads stdin
  natively. Auth probe at `auth.check` keeps `-p "respond with ok"` since
  that supplies an explicit value. Reproduced across 4 real MMR jobs
  before the fix; verified via local-build smoke test (gemini now
  completes in ~14s with valid output).
- **Channel logs were captured but never surfaced in the failure error.**
  The dispatcher wrote stderr / spawn-error detail to `<channel>.log`
  via `saveChannelLog`, but `runResultsPipeline` only emitted a generic
  `"Channel failed"` / `"Channel timed out"` and ignored the log.
  Consumers had no way to diagnose failures without manually reading
  `~/.mmr/jobs/<id>/channels/<name>.log`. Now `JobStore.loadChannelLog`
  pulls the saved log and the per-channel `error` field includes the
  first 1000 chars of stderr / spawn-error text, with a single `…`
  truncation marker. Whitespace-only logs and missing logs fall through
  cleanly to the base message.

## [1.2.1] — 2026-04-27

### Fixed
- `mmr review --diff -` and `mmr reconcile ... --input -` now accept the bare `-` token for stdin when written with a space separator. Previously yargs treated the `-` as an unknown positional and rejected the command unless callers used `--diff=-` / `--input=-`. This unblocks the `git diff HEAD | mmr review --diff -` pattern documented in CLAUDE.md.

## [1.2.0] — 2026-04-22

### Changed
- **Raise default auth-check timeout for `claude` and `gemini` channels
  from 5s to 20s.** Both CLIs' auth probes (`claude -p "respond with ok"`,
  `NO_BROWSER=true gemini -p "respond with ok" -o json`) are full LLM
  round-trips that routinely take 9-14s, so 5s false-failed normal
  environments and silently dropped them into compensating passes.
  Codex's auth probe (`codex login status`) stays at 5s since it's a
  local file check, not a round-trip. Defined in
  `packages/mmr/src/config/defaults.ts`; callers can still override
  via `~/.mmr/config.yaml` or a project `.mmr.yaml`.

## [1.1.0] — 2026-04-13

### Added
- `mmr reconcile <job-id> --channel <name> --input <source>` — inject external review findings into a job for unified reconciliation
- `normalizeExternalInput` helper — handles wrapper and bare-array input with strict validation, markdown fence stripping, prose-wrapped extraction
- Strict validators (`validateFindingStrict`, `validateParsedOutputStrict`) that throw on invalid input
- Exported parser helpers for reuse: `stripMarkdownFences`, `extractJson`, `fixTrailingCommas`

### Changed
- Tool specs updated for 4-channel flow: 3 CLI channels via `mmr review` + agent skill via `mmr reconcile`
- CLAUDE.md updated with `mmr reconcile` quick reference

## [1.0.0] — 2026-04-13

### Added
- **P0-6:** Degraded-mode lifecycle tests — partial failure, all-failed, timeout+parse paths
- **P1-16:** Spawn error test for nonexistent commands
- **P3-39:** JSDoc comment on JobStatus documenting intentional subset relationship

### Summary
All 45 findings from the MMR CLI audit are resolved across 10 batches (v0.2.0–v1.0.0).
The CLI is now production-ready with comprehensive test coverage, proper type system,
verdict-based gating, compensating passes, and spec-aligned documentation.

## [0.9.0] — 2026-04-13

### Changed
- **P1-7:** Tool spec (`review-pr.md`) updated for CLI-first architecture — 3 CLI channels (claude, gemini, codex), `mmr review --sync` as primary entry point
- **P1-12:** Fix cycle documented as orchestration concern, not CLI responsibility
- **P1-13:** Knowledge base entries (`multi-model-review-dispatch`, `automated-review-tooling`) updated to match CLI implementation
- **P1-14:** CLAUDE.md MMR section updated with CLI-first model and correct channel names

### Removed
- **P2-30:** Removed `sarif` from OutputFormat (no formatter exists)
- Superpowers subagent references replaced with Claude CLI channel
- Depth-based scaling removed from knowledge base (CLI always runs all enabled channels)

## [0.8.0] — 2026-04-13

### Fixed
- **P2-24:** Job ID uses 6 random bytes (12 hex chars) to reduce collision risk
- **P2-25:** loadJob validates job metadata structure after JSON parse
- **P2-26:** Reconciler uses longest description as representative (deterministic)
- **P2-28:** Markdown formatter escapes newlines with `<br>` in table cells
- **P2-35:** deepMerge skips undefined overlay values

### Added
- **P3-41:** `approved` boolean and `summary` string added to ReconciledResults
- **P3-43:** Gemini channel default timeout set to 360s (was inheriting global 300s)

### Changed
- **P3-42:** Recovery commands no longer include `Run:` prefix — consumers add formatting

## [0.7.0] — 2026-04-13

### Fixed
- **P2-20:** Parent process now cleans up child processes on SIGINT/SIGTERM
- **P2-21:** Stderr modes `suppress`, `capture`, `passthrough` correctly mapped to child stdio
- **P2-27:** `resolveDiff` uses 10MB maxBuffer to handle large diffs
- **P2-37:** Status command exit codes aligned with results command (5=CLI error)

## [0.6.0] — 2026-04-13

### Added
- **P0-2:** Compensating passes — when channels are unavailable (not_installed, auth_failed, timeout), a Claude-based review is dispatched focused on the missing channel's strength area
- **P2-33:** Compensating findings assigned `low` confidence in reconciliation
- Codex-equivalent focus: implementation correctness, security, API contracts
- Gemini-equivalent focus: architectural patterns, design consistency
- Generic focus for unknown channels

## [0.5.0] — 2026-04-13

### Added
- **P0-1:** `--sync` flag on `mmr review` — single-command entry point that dispatches, parses, reconciles, formats, and exits with verdict code
- Extracted `runResultsPipeline` shared helper — eliminates code duplication between review --sync and results command
- Fixed latent bug where `loadChannelOutput` returned JSON-encoded strings that the parser couldn't handle (double-encoding from `saveChannelOutput`)

## [0.4.0] — 2026-04-13

### Fixed
- **P1-18:** Use POSIX-portable `command -v` instead of `which` for installation checks
- **P1-19:** Auth check retries once on timeout before reporting failure
- **P2-22:** Skipped and auth-failed channels now recorded in job metadata with status and recovery info

## [0.3.0] — 2026-04-13

### Added
- **P0-3:** Verdict system — `pass`, `degraded-pass`, `blocked`, `needs-user-decision` replaces binary `gate_passed`
- **P1-8:** Exit codes — 0=pass/degraded-pass, 2=blocked, 3=needs-user-decision, 5=CLI error
- **P1-17:** `not_installed` channel status for missing CLI tools
- **P2-34:** Optional `id` (auto-generated F-001) and `category` fields on Finding type

### Changed
- **P3-38:** `TERMINAL_STATUSES` exported from types.ts; duplicated lists removed from dispatcher, status, results
- **P2-36:** Removed unused `divergent` from Agreement type
- Verdict derivation considers channel health: degraded-pass when some channels failed, needs-user-decision when none completed

## [0.2.0] — 2026-04-13

### Fixed
- **P0-4:** Concurrent job.json writes race — derive channel state on read from per-channel status files with atomic temp+rename writes
- **P0-5:** stdin.write() crash — handle EPIPE when child closes stdin early
- **P1-15:** Timeout/close race condition — in-memory settled flag prevents double status writes
- **P1-9:** Sequential dispatch was broken — dispatchChannel now returns completion Promise; channels only dispatched inside loop when parallel is false
- **P1-10:** extractJson brace counting failed on braces inside JSON strings — now string-aware with escaped quote handling
- **P1-11:** Gemini parser skipped validation on unwrapped output — unsafe cast replaced with validateParsedOutput
- **P2-23:** Parser names 'claude'/'codex' silently fell back to 'default' — made explicit

### Added
- Channel name validation across all file operations (path traversal prevention)
- Centralized `channelFilePath` helper for consistent channel file path construction
- `listJobs` now derives channel state consistently via `loadJob`
- Dispatch result output reflects actual completion status instead of hard-coded 'dispatched'
- Tests for concurrent channel updates, stdin pipe errors, awaitable dispatch, string braces, empty input, unbalanced braces, unsafe channel names
