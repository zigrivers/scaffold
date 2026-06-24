# Knowledge-Freshness Operations Guide

Audience: a maintainer who just landed on the repo and needs to understand how
the freshness system works and how to operate it.

Cross-references:
- Design spec: [`docs/superpowers/specs/2026-05-24-knowledge-freshness-design.md`](../superpowers/specs/2026-05-24-knowledge-freshness-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-05-24-knowledge-freshness.md`](../superpowers/plans/2026-05-24-knowledge-freshness.md)

## 1. What this system does (90 seconds)

External authoritative sources (OWASP, NIST, IETF, MCP, Anthropic, etc.) change.
Downstream agents consume `content/knowledge/**` as injected expertise. Without
a refresh loop, agents read stale knowledge. The freshness system:

1. Tracks each entry's `volatility`, `last-reviewed`, `sources`, `version-pin`.
2. Daily cron pre-filters entries whose cadence window has elapsed or whose
   source content hash has drifted.
3. For each candidate (max 10/day), runs a grounded LLM audit via the selected
   provider (DeepSeek HTTP in CI by default, `claude -p` locally; see §4
   "Choosing a provider"). The audit dispatcher pre-fetches source bodies in
   Node and passes them into the prompt — the model itself has no tools
   available — and emits a structured verdict.
4. If the verdict is `major-drift` or `superseded`, opens a PR with the rewrite.
5. PR gates enforce link health, anti-over-rewrite, Deep-Guidance preservation,
   and frontmatter validity. Humans merge.
6. On merge, `content/knowledge/VERSION` auto-bumps per Conventional-Commits prefix.

### Architecture (reproduced from spec §Architecture Overview)

```
   ┌───────────────────────────────────────────────────────────────────┐
   │ Daily GitHub Action: knowledge-freshness-audit.yml (cron 09:00 UTC)│
   └────────────────────┬──────────────────────────────────────────────┘
                        ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 1. Pre-filter (cheap, no LLM)                                     │
   │   `scaffold knowledge-freshness audit-prefilter --max=10`         │
   │   - reads each entry's `sources:` URLs                            │
   │   - fetches with HEAD / ETag / Last-Modified, hash body otherwise │
   │   - emits candidates whose cadence elapsed OR sources changed     │
   └────────────────────┬──────────────────────────────────────────────┘
                        ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 2. Grounded audit (per entry, max 10/day)                         │
   │   `scaffold knowledge-freshness audit-run-entry <path>`           │
   │   tool meta-prompt: content/tools/knowledge-audit-entry.md        │
   │   dispatched via the selected provider:                           │
   │     - DeepSeek HTTP (cron default, requires DEEPSEEK_API_KEY)     │
   │     - `claude -p` (local default, requires Claude Code on PATH)   │
   │   - source bodies are pre-fetched in Node and embedded in the     │
   │     prompt; the model runs with no tools                          │
   │   - explicit instruction: "trust the retrieved source over priors"│
   │   - emits structured verdict JSON                                 │
   └────────────────────┬──────────────────────────────────────────────┘
                        ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 3. PR generation + gates                                          │
   │   `scaffold knowledge-freshness audit-apply <path> <verdict>      │
   │       --open-pr`                                                  │
   │   - one PR per entry, direct to main                              │
   │   - gates: validator, link-check, lint-unsourced, anti-over-      │
   │     rewrite, Deep-Guidance-preserved                              │
   └───────────────────────────────────────────────────────────────────┘
```

### Where each piece lives

| Piece | Path |
|---|---|
| CLI commands | `src/knowledge-freshness/` (built into `dist/index.js`) |
| Cron workflow | `.github/workflows/knowledge-freshness-audit.yml` |
| PR gates workflow | `.github/workflows/knowledge-freshness-gates.yml` |
| VERSION bump workflow | `.github/workflows/knowledge-freshness-version-bump.yml` |
| Source allowlist | `docs/knowledge-freshness/authoritative-sources.yaml` |
| Tool meta-prompt | `content/tools/knowledge-audit-entry.md` |
| Knowledge entries | `content/knowledge/**/*.md` |
| KB version file | `content/knowledge/VERSION` |

## 2. Daily life — what the cron does

The cron is defined in `.github/workflows/knowledge-freshness-audit.yml`.

- **Schedule**: `0 9 * * *` (09:00 UTC daily). UTC chosen so DST does not shift it.
  Change the cron line to retime.
- **Also triggers**: `workflow_dispatch` (manual run from the Actions tab).
- **Concurrency**: `knowledge-freshness-audit` group prevents two runs racing.

Each run:

1. Checks out `main` with full history.
2. Runs `audit-prefilter --max=10`, writing candidates to `/tmp/candidates.json`.
3. For each candidate: runs `audit-run-entry`, captures the verdict JSON,
   runs the inline gates (validator + link-check + deep-guidance +
   anti-over-rewrite as BLOCKING; lint-unsourced as advisory), and then:
   - All four verdicts (`current` / `minor-drift` / `major-drift` /
     `superseded`) → runs `audit-apply --open-pr`. A `current` verdict
     produces a small metadata-only refresh PR (frontmatter
     `last-reviewed`, `hash`, `retrieved` updates). Without this, those
     entries would re-enter the prefilter queue every day and starve
     other candidates.
   - unknown verdict → logged and skipped.
   - inline gates failing (validator / link-check / deep-guidance /
     anti-over-rewrite) → no PR opened, error logged. For
     anti-over-rewrite specifically (stable entry, >20% churn), the
     cron refuses to open: the PR-gate workflow doesn't fire on
     GITHUB_TOKEN-opened PRs, so the cron can't rely on the label-
     based override path. Maintainers needing to push the rewrite
     through should run `audit-apply --open-pr` locally as themselves
     (their user token DOES trigger the gate workflow), and apply the
     `override:anti-over-rewrite` label.
4. Per-entry failures are isolated; the loop continues.

### The 10 PRs/day ceiling

The ceiling is enforced by `audit-prefilter --max=10`. To change it:

- Permanently: edit the `--max=10` in the workflow's "Pre-filter candidates" step.
- One-off: not yet supported via `workflow_dispatch` inputs — known gap, future
  enhancement.

### Where to read its output

- **Actions tab**: GitHub → Actions → "Knowledge Freshness Audit" → per-run log.
  Each entry's audit is grouped under a `::group::audit <name>` block.
- **Opened PRs**: filter by label `knowledge-freshness` and/or
  `volatility:<tier>` (the apply step adds both).

## 3. Reviewing a freshness PR — checklist

For each cron-opened PR, verify before merging:

1. **Verdict JSON matches the diff.** The PR body embeds the verdict's
   `findings` table. Skim it against the diff: are the source citations in
   the body reflected in the entry changes?
2. **Each `evidence_url` returns 2xx and quotes the claimed excerpt.** This
   is the human spot-check of the grounded audit. One URL is enough if you
   trust the bot; sample more on stable-tier rewrites.
3. **All five automated gates pass** (see `knowledge-freshness-gates.yml`):
   - Gate 1 — `make validate-knowledge` (frontmatter schema).
   - Gate 2 — `link-check`: every `sources[*].url` in the diff returns 2xx.
   - Gate 3 — `lint-unsourced` (advisory): warns on new normative claims
     with no nearby source link. Does not block.
   - Gate 4 — `anti-over-rewrite`: a `volatility: stable` entry with >20%
     line churn fails unless a maintainer with write access applies the
     `override:anti-over-rewrite` label to the PR. PR-body markers are
     intentionally NOT honored — a malicious source could prompt-inject
     one via the generated verdict text, so the trust anchor must be a
     label only humans with write access can apply. Skipped on
     non-`knowledge-freshness/*` branches (human edits to stable entries
     are governed by review, not heuristics).
   - Gate 5 — `deep-guidance-check`: the literal `## Deep Guidance` heading
     must survive the rewrite.
4. **Version-pin alignment.** If the verdict is `superseded`, the body
   should reference the NEW edition (e.g. "OWASP Top 10 2025" replacing
   "OWASP Top 10 2021"). If the verdict is `superseded` but the entry body
   still claims the old edition, **request changes**: the `last-reviewed`
   bump alone is wrong for `superseded`, and a separate rewrite PR is
   needed. See spec §A.5 "last-reviewed-not-advancing" behavior.
5. **Decision**:
   - **Merge** when verdict matches diff and gates are green.
   - **Request changes** for verdict/diff mismatch, broken evidence URL,
     or version-pin misalignment.
   - **Close** (rare) if the source itself moved upstream and the entry
     should be reorganized instead of patched — file a follow-up issue.

## 4. Running an audit manually (locally)

### Choosing a provider

Three LLM providers are supported for the per-entry audit dispatch:

- **anthropic** (default for local) — invokes `claude -p` as a subprocess.
  Requires the Claude Code CLI on `$PATH`. Auth via Claude Code's
  keychain integration (run `claude /login` once) OR via
  `ANTHROPIC_API_KEY` env var — but in both cases the CLI must be
  installed; the env var alone is not sufficient.
- **zai** (default primary for the cron) — HTTPS POST to
  `api.z.ai/api/paas/v4/chat/completions`. Auth via `ZAI_API_KEY` env var.
  Requires no CLI install. Default model `glm-4.6` (flagship reasoning,
  200K context — a good fit for the grounded audit, which embeds source
  documents in the prompt).
- **deepseek** (cron fallback) — HTTPS POST to
  `api.deepseek.com/chat/completions`. Auth via `DEEPSEEK_API_KEY`
  env var. Requires no CLI install.

Provider selection (highest precedence first):

1. `--provider <anthropic|deepseek|zai>` flag on `audit-run-entry`
2. `KNOWLEDGE_FRESHNESS_PROVIDER` env var
3. Inferred from which API key is set
4. **Error** if more than one key is set without an explicit choice
5. Falls back to `anthropic` when `claude` is on `$PATH` (local dev case)
6. **Error** if nothing is configured

### Provider fallback (zai → deepseek)

The cron runs **Z.ai as the primary** researcher with **DeepSeek as a
per-entry fallback**. Set `KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER` to the
secondary provider's name; the dispatcher then tries the primary first for
every entry and drops to the fallback when that call fails **transiently**:
transport error, timeout, malformed JSON, empty response, or a transient HTTP
status (**429** rate-limit, **5xx** server error, **408** request timeout).

It deliberately does **not** fall back on a **permanent** primary failure —
a bad/missing API key (**401/403**) or a malformed request (**400**). Those
mean the primary is misconfigured; failing over would hide that and let the
cron run entirely on the fallback, never using the intended primary. Such
errors are surfaced and **fail the entry loudly** so the operator fixes the
primary. Content-quality differences also do **not** trigger fallback — only a
transient failure to return usable text does.

- The fallback is **per entry**: if Z.ai fails on one candidate but
  recovers, later candidates use Z.ai again. There is no cross-entry latch.
- When the fallback fires it logs a `[fallback] zai dispatch failed; retrying
  with deepseek …` line to stderr, so cron logs record the switch.
- If **both** providers fail for an entry, the dispatcher throws a combined
  error naming both failures.
- The fallback provider must differ from the primary, and its key must be
  present, or `buildDispatcher` errors at construction time.

The cron sets `KNOWLEDGE_FRESHNESS_PROVIDER=zai` explicitly, so the "multiple
keys set" ambiguity error (rule 4) is never reached even though both
`ZAI_API_KEY` and `DEEPSEEK_API_KEY` are configured.

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

For a local one-off Z.ai run:

```bash
ZAI_API_KEY=... node dist/index.js knowledge-freshness audit-run-entry \
  content/knowledge/core/<entry>.md --provider zai
```

For the cron: the secret + env block are configured in
`.github/workflows/knowledge-freshness-audit.yml`. Set both secrets
once with `gh secret set ZAI_API_KEY` (primary) and
`gh secret set DEEPSEEK_API_KEY` (fallback).

#### Z.ai model override

The default Z.ai model is `glm-4.6`. To use the lighter, cheaper
`glm-4.5-air` instead, set `KNOWLEDGE_FRESHNESS_ZAI_MODEL=glm-4.5-air` in
the workflow env block (or your shell). Only the two allowlisted values are
accepted — the dispatcher rejects any other model name at startup.

#### DeepSeek model override

The default DeepSeek model is `deepseek-v4-flash`. To use `deepseek-v4-pro`
instead (slower, more expensive, more thorough chain-of-thought), set
`KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL=deepseek-v4-pro` in the
workflow env block (or your shell). Only the two allowlisted values
are accepted — the dispatcher rejects any other model name at startup.

The CLI mirrors what the cron does. Build first: `npm run build`.

```bash
# 1. See what's due (cadence + source-hash check, no LLM).
node dist/index.js knowledge-freshness audit-prefilter --max=10

# 2. Pick one and audit it. Output is verdict JSON on stdout.
node dist/index.js knowledge-freshness audit-run-entry \
  content/knowledge/core/<name>.md > /tmp/verdict.json

# 3. Inspect.
jq . /tmp/verdict.json

# 4. Apply locally (prints diff, edits file, NO PR opened).
node dist/index.js knowledge-freshness audit-apply \
  content/knowledge/core/<name>.md /tmp/verdict.json

# 5. Apply AND open a PR.
node dist/index.js knowledge-freshness audit-apply \
  content/knowledge/core/<name>.md /tmp/verdict.json --open-pr
```

### Auth caveat

Each provider has its own auth path:

- **anthropic** (default for local): the audit subprocess invokes
  `claude -p`, so Claude Code must be on `$PATH`. Locally it uses the
  keychain auth from `claude /login` — no env var needed. If you set
  `ANTHROPIC_API_KEY` alongside the CLI, `claude` prefers it (useful
  for running against a different account). The env var alone is NOT
  sufficient — the CLI must exist regardless; resolveProvider rejects
  this combination at startup so you find out before the first audit.
- **zai** (primary for cron): the audit makes a direct HTTPS POST to
  `api.z.ai`. Requires `ZAI_API_KEY` in env; no CLI install needed.
- **deepseek** (cron fallback): the audit makes a direct HTTPS
  POST to `api.deepseek.com`. Requires `DEEPSEEK_API_KEY` in env;
  no CLI install needed.

The cron workflow pins `KNOWLEDGE_FRESHNESS_PROVIDER=zai` +
`KNOWLEDGE_FRESHNESS_FALLBACK_PROVIDER=deepseek` and reads both keys from
repo secrets. `ZAI_API_KEY` is **required** (set it with
`gh secret set ZAI_API_KEY` before the first scheduled run); `DEEPSEEK_API_KEY`
is the fallback and is recommended but optional (without it the run loses its
safety net — see §4 "Provider fallback").

`--open-pr` requires `gh auth login` to have run (and `gh` to be on PATH).

## 5. Skipping an audit (opt out)

Several ways, in increasing order of permanence:

1. **Empty `sources:` list.** The pre-filter skips entries with no sources and
   surfaces a warning in CI (not an error). Use this to keep an entry in the
   KB without subjecting it to freshness audits.
2. **`volatility: stable`.** Stretches the cadence window to 180 days. The
   entry still gets audited eventually, just rarely.
3. **One-off skip via workflow_dispatch.** The workflow currently has no
   per-run "exclude" input. Known gap — file a follow-up if needed.

## 6. Adding a new entry to the freshness system

For an existing knowledge entry, add the freshness frontmatter and validate:

```yaml
---
title: "Some KB entry"
category: core
# ... existing fields ...
volatility: evolving        # stable | evolving | fast-moving
last-reviewed: 2026-05-25   # YYYY-MM-DD; null/omitted = "never"
sources:
  - url: https://owasp.org/Top10/
    anchor: "A01:2021"      # optional, helps reviewers
    retrieved: 2026-05-25   # optional, ISO-8601 date
version-pin: "OWASP Top 10 2021"  # optional, exact edition tracked
---
```

Then:

```bash
make validate-knowledge   # Zod-validates frontmatter across content/knowledge/
git add content/knowledge/<...>.md
git commit -m "feat(knowledge): add freshness metadata to <entry>"
```

The next cron run will pick the entry up if it's due.

## 7. Expanding the source allowlist

`docs/knowledge-freshness/authoritative-sources.yaml` is the allowlist.

```yaml
hosts:
  - owasp.org                  # bare host: any path under owasp.org allowed
  - anthropic.com/docs         # host + path prefix: only this prefix allowed

github_repos:
  - modelcontextprotocol/specification   # owner/repo
```

To add a new authoritative source:

- Bare host: add `- example.com` under `hosts:`.
- Host with path prefix: add `- example.com/specific-path` under `hosts:`.
- GitHub repo: add `- owner/repo` under `github_repos:`.

**Important**: sources outside the allowlist trigger an **advisory warning**,
not a hard block (resolved decision #4 in spec). Contributors are not blocked
from citing other sources — reviewers should weigh whether the source merits
allowlist inclusion before merging.

## 8. Handling MMR corroboration

The spec calls for MMR corroboration of freshness PRs (spec §A.4). That step
is **not yet wired into the cron** — Task 10 deliberately deferred it. Two
options today:

1. **Manual after PR opens**: from a checkout of the PR branch, run
   `git diff origin/main...HEAD | mmr review --diff - --focus "knowledge-freshness" --sync --format json`,
   then `mmr reconcile <job_id>` per the project's standard review flow.
2. **Wait for Phase 5**: a native `doc-conformance`-style `knowledge-freshness`
   MMR channel is planned. See spec §A.4 and the Phase 5 roadmap notes below.

When reviewing manually, follow the project's
[3-round-per-finding-hash limit](../../CLAUDE.md#mandatory-code-review) — stop
and surface to the user when a blocking finding's hash hits 3 attempts.

## 9. Failure modes and recovery

| Symptom | Diagnosis | Fix |
|---|---|---|
| `audit subprocess failed: exit 1` | (anthropic only) `claude` CLI not on PATH, or `ANTHROPIC_API_KEY` invalid. | Install Claude Code and run `claude /login`, or switch to the deepseek provider via `DEEPSEEK_API_KEY` + `KNOWLEDGE_FRESHNESS_PROVIDER=deepseek`. The cron now uses deepseek by default — see § 4 "Choosing a provider". |
| `Error: provider selection ambiguous` | Both `ANTHROPIC_API_KEY` and `DEEPSEEK_API_KEY` are set without an explicit choice via `--provider` or `KNOWLEDGE_FRESHNESS_PROVIDER`. | Pass `--provider anthropic` or `--provider deepseek`, or set `KNOWLEDGE_FRESHNESS_PROVIDER` in env. |
| `Error: no provider configured` | Neither API key is set, and `claude` is not on `$PATH`. | Install Claude Code locally (`brew install anthropic/claude-code/claude-code` then `claude /login`) for anthropic, or set `DEEPSEEK_API_KEY` for deepseek. |
| ``Error: anthropic provider selected but the `claude` CLI is not on PATH`` | The anthropic dispatcher shells out to `claude -p`; the CLI must exist regardless of how the provider was chosen (`--provider anthropic`, `KNOWLEDGE_FRESHNESS_PROVIDER=anthropic`, or `ANTHROPIC_API_KEY` inference). The env var alone is not sufficient. | Install Claude Code (`brew install anthropic/claude-code/claude-code` or `npm install -g @anthropic-ai/claude-code`), OR switch to the deepseek provider. |
| `Error: unsupported DeepSeek model "..."` | `KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL` was set to a value outside the hardcoded allowlist. | Set it to `deepseek-v4-flash` or `deepseek-v4-pro`, or unset it for the default. |
| `Error: deepseek dispatcher: HTTP 4xx/5xx` | DeepSeek API rejected the request (auth failure, rate limit, server-side error). | Check the secret value, the DeepSeek service status, and your account's rate limits. The cron isolates per-entry failures and retries the entry the next day. |
| `fetch failed` for a source URL | Source is down OR the SSRF guard rejected it. | Hit the URL with `curl -I`; if guard-blocked, see next row. |
| `DNS-rebinding guard: <host> resolves to blocked IP` | Source URL resolves to a private/loopback/link-local IP — usually a typo in the hostname, occasionally a misbehaving CDN. | Double-check the hostname; if legitimate, file an issue (the guard does not have an exception list by design). |
| `verdict.sources_checked is missing entry source` | The audit subprocess dropped a source mid-run (timeout, parse error). | Re-run `audit-run-entry`. If persistent, increase `--timeout` (default 600s). |
| Gate 4 fails: "stable entry with >20% line churn" | A rewrite landed on a `volatility: stable` entry without the override label. | Either narrow the diff, downgrade `volatility` to `evolving` in the entry, or (as a maintainer with write access) apply the `override:anti-over-rewrite` label to the PR — PR-body markers are deliberately NOT honored since a malicious source could prompt-inject one. |
| Version-bump didn't fire on merge | PR title prefix not recognized by `bump-version`. | Recognized prefixes: `BREAKING CHANGE:` (major), `feat(knowledge):` / `feat(knowledge-freshness):` (minor), `chore(knowledge):` / `chore(knowledge-freshness):` (patch). Unrecognized prefixes default to patch and emit a `::notice::`. |

## 10. Roadmap (Phase 3+)

The current implementation covers Phase 1 (foundation: frontmatter, validator,
prefilter, audit, apply) and Phase 2 (cron, gates, version bump, backfill).
Planned next:

- **Phase 3 — Gap detection (Lens I)**: pipeline meta-prompts emit
  `scaffold observe event` signals when a step has no usable knowledge entry;
  Lens I aggregates them. Spec §B.1.
- **Phase 4 — Native MMR `knowledge-freshness` channel**: inline corroboration
  in the cron, mirroring how `doc-conformance` is wired today. Spec §A.4.
- **Phase 5 — Frontier scan**: lightweight scan for newly authoritative
  sources missing from the KB. Spec §B.2.
- **Phase 5 — Taxonomy cross-reference**: detect KB structure drift versus the
  pipeline taxonomy. Spec §B.3.

See the [design spec Part B](../superpowers/specs/2026-05-24-knowledge-freshness-design.md#part-b--detect-documentation-gaps)
and the [implementation plan](../superpowers/plans/2026-05-24-knowledge-freshness.md)
for the full roadmap.

## Phase 3: Gap Detection

The knowledge-freshness system surfaces topics agents need but the
knowledge base doesn't yet cover. Two signal sources feed Lens I:

1. **Agent-search signals** — pipeline meta-prompts include a tail
   instruction (auto-injected at assembly time) telling the executing
   agent to emit a `knowledge_gap_signal` event when they search the
   injected knowledge base and find nothing. The agent runs the
   command embedded in the tail; the event lands in the worktree's
   `.scaffold/activity.jsonl` ledger.
2. **Lessons scanner** — Lens I reads `tasks/lessons.md` inline at
   audit time. Two extraction passes:
   - Explicit markers: `<!-- gap-topic: kebab-case-slug -->`
   - Heuristic phrases: "would have helped to have a guide on X",
     "no knowledge entry for X", "missing knowledge: X"
   Code-fenced blocks are skipped.

Synthetic lessons signals are tagged with `project_id='lessons'`, which
is excluded from the diversity gate's `distinct_project_count`. This
means lessons mentions corroborate real signals but cannot
independently manufacture a gap finding.

### Suppression

Set `SCAFFOLD_GAP_SIGNAL_QUIET=1` to suppress the tail in tests, CI,
or local runs where you don't want the noise.

### Severity thresholds

| Severity | Threshold |
|---|---|
| P2 | ≥3 signals × ≥2 distinct real projects |
| P1 | ≥5 signals × ≥3 distinct real projects |

P1 takes precedence; one finding per topic at the highest applicable
severity.

### Manual validation procedure

To verify the loop end-to-end in a fresh worktree:

```bash
TMPDIR_E2E=$(mktemp -d) && cd "$TMPDIR_E2E"
git init -q && git remote add origin https://example.org/test-e2e
mkdir -p tasks && echo 'No knowledge entry for "agent-eval-harnesses".' > tasks/lessons.md
PROJECT_A=$(printf 'https://example.org/project-a' | shasum -a 256 | awk '{print $1}')
PROJECT_B=$(printf 'https://example.org/project-b' | shasum -a 256 | awk '{print $1}')
for proj in "$PROJECT_A" "$PROJECT_A" "$PROJECT_B"; do
  scaffold observe event knowledge_gap_signal \
    --branch=main --topic=agent-eval-harnesses --source=agent_search \
    --project-id="$proj" --step-name=tech-stack \
    --agent-excerpt="manual e2e test"
done
scaffold observe audit --scope=docs --json | jq '.findings[] | select(.lens_id=="I-knowledge-gaps")'
```

Expected: one finding with `severity=P2`, `signal_count=4` (3 ledger +
1 lessons), `distinct_project_count=2`.

### Where to find the finding

`scaffold observe audit` (with no scope flag, or `--scope=all`) writes
the audit sidecar to `docs/audits/<id>.{md,json}`. The terminal output
also surfaces Lens I findings inline. To run just Lens I, scope to
`--scope=docs` (it lives in `SCOPE_DOC_LENSES` alongside lens H).

### Adding a knowledge entry from a Lens I finding

The finding's `fix_hint.target` is `content/knowledge/<category>/<topic>.md`
with `<category>` as a literal placeholder — categories are a human
judgment. The `fix_hint.prompt` is a summary suitable for handing to
a writing-knowledge agent.

**What happens after the entry lands:**

- *New* gap signals stop accumulating: downstream agents now find the
  topic in the injected knowledge base and do not emit a
  `knowledge_gap_signal` event for it.
- *Existing* signals — the ones already in the 90-day window that drove
  the finding — keep contributing to Lens I's bucket count until they
  age out. The finding may therefore re-appear on subsequent audit runs
  for up to 90 days after the entry is added.
- To silence the finding immediately, use
  `scaffold observe ack <finding-id>`. Acknowledged findings are
  excluded from future audit output until they're reopened.

Phase 4 adds an "existing-entry suppression" check inside Lens I that
will close the finding automatically once
`content/knowledge/<category>/<topic>.md` exists. See
`docs/superpowers/deferred-findings/feat+knowledge-freshness-phase-3.md`
(PR #397 review F-001) for the design rationale.

## Existing-entry suppression (Lens I)

Lens I (knowledge gaps) automatically suppresses gap findings for topics
that already have an entry in `content/knowledge/`. Adding
`content/knowledge/<category>/<slug>.md` with frontmatter `name: <slug>`
removes the matching finding on the next audit — no need to `scaffold
observe ack` it.

**How the audit finds the knowledge base.** Three-tier resolution
(highest precedence first):

1. `scaffold observe audit --knowledge-root <path>` — operator-typed
   CLI override; hard-errors if `<path>` doesn't exist, isn't a
   directory, or lacks the `VERSION` marker file.
2. `.scaffold/observability.yaml`:
   ```yaml
   lenses:
     I-knowledge-gaps:
       knowledge_root: /absolute/path/to/content/knowledge
   ```
   Soft-fails to auto-detect if the path is invalid.
3. Auto-detect — walks parent directories of the running CLI module
   looking for a `package.json` whose `name` is `@zigrivers/scaffold`
   AND a sibling `content/knowledge/` directory.

If all three tiers miss, Lens I emits exactly one warning to stderr
(`[Lens I] knowledge-root not located; …`) and runs without
suppression. Findings still appear; new entries just won't close
them automatically.

**`--fix` flow.** `scaffold observe audit --fix --knowledge-root <p>`
threads the override into the initial audit, the per-finding verifier
audits, and the postfix audit — suppression behavior is consistent
across the whole fix run.

**Relationship to `scaffold observe ack`.** Suppression is automatic
for the mechanical case (entry exists with matching slug → no
finding). `ack` remains the manual override for everything else
(noise topics, stale signals, intentionally-deferred gaps).
