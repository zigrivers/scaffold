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
3. For each candidate (max 10/day), runs a grounded LLM audit (`claude -p`) that
   fetches the sources via WebFetch and emits a structured verdict.
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
   │   dispatched via the LLM dispatcher (`claude -p`)                 │
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
3. For each candidate: runs `audit-run-entry`, captures the verdict JSON, and:
   - `current` / `minor-drift` → no PR opened.
   - `major-drift` / `superseded` → runs `audit-apply --open-pr`.
   - unknown verdict → logged and skipped.
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
     line churn fails unless the PR body contains an explicit override
     phrase. Skipped on non-`knowledge-freshness/*` branches (human edits
     to stable entries are governed by review, not heuristics).
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

The audit subprocess uses `claude -p` (per `src/observability/engine/llm-dispatcher.ts`).
Locally this picks up your `claude` CLI's keychain auth — no env var needed.
In CI the workflow sets `ANTHROPIC_API_KEY` from the repo secret of the same
name; the subprocess then uses that. If you want to run the audit locally with
an API key (e.g. against a different account), export `ANTHROPIC_API_KEY` and
the `claude` CLI will prefer it.

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
| `audit subprocess failed: exit 1` | Missing `ANTHROPIC_API_KEY` (CI) or `claude` CLI not on PATH (local). | Set the secret / install `claude` CLI. |
| `fetch failed` for a source URL | Source is down OR the SSRF guard rejected it. | Hit the URL with `curl -I`; if guard-blocked, see next row. |
| `DNS-rebinding guard: <host> resolves to blocked IP` | Source URL resolves to a private/loopback/link-local IP — usually a typo in the hostname, occasionally a misbehaving CDN. | Double-check the hostname; if legitimate, file an issue (the guard does not have an exception list by design). |
| `verdict.sources_checked is missing entry source` | The audit subprocess dropped a source mid-run (timeout, parse error). | Re-run `audit-run-entry`. If persistent, increase `--timeout` (default 600s). |
| Gate 4 fails: "stable entry with >20% line churn" | A rewrite landed on a `volatility: stable` entry without an override phrase in the PR body. | Either narrow the diff, downgrade `volatility` to `evolving` in the entry, or add the explicit override phrase the gate looks for. |
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
