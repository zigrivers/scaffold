---
status: decisions-locked
owner: zigrivers
created: 2026-05-24
related-plan: docs/superpowers/plans/2026-05-24-knowledge-freshness.md
---

# Knowledge-Base Freshness System — Design Specs

A system that keeps Scaffold's injected knowledge accurate against evolving best practices by performing **grounded** (web-retrieval-backed) audits on a volatility-aware cadence, and that surfaces **gaps** where the knowledge base does not yet cover what downstream projects need.

This is a design document, not an implementation. All decisions are resolved (see end of document); implementation proceeds per the companion plan at `docs/superpowers/plans/2026-05-24-knowledge-freshness.md`.

## Findings & Corrections (Phase 0 grounding)

The framing in the planning prompt was largely accurate, but the following needed correction or clarification before designing on top of it:

- **Entry count and category count.** `content/knowledge/` contains **267 entries across 18 category subdirectories** — not "~64 entries in 7 categories" as `CLAUDE.md` currently states (`CLAUDE.md:71`). The CLAUDE.md figure is stale and is fixed in the prerequisite Task 0 of the implementation plan.
- **Knowledge entries are NOT routed through `src/validation/frontmatter-validator.ts`.** That validator handles only pipeline steps and tool meta-prompts (`content/pipeline/`, `content/tools/`). Knowledge entries are parsed by an independent, ad-hoc parser at `src/core/assembly/knowledge-loader.ts:18` (`extractKBFrontmatter`), backed by the `KBFrontmatter` shape (`knowledge-loader.ts:8-12`) and the public `KnowledgeEntry` type at `src/types/assembly.ts:8-13`. The extension point for new freshness metadata is the **knowledge loader**, not the pipeline frontmatter validator. The pipeline validator stays untouched.
- **`topics:` is not a known YAML key in the pipeline validator.** `KNOWN_YAML_KEYS` (`src/project/frontmatter.ts:18-34`) does not list `topics`. If knowledge entries ever pass through that path they emit `unknown field` warnings. They do not pass through it today — but anyone proposing to "extend the frontmatter validator" must understand which validator they mean.
- **`security-best-practices.md` confirmed.** Frontmatter is exactly `name` / `description` / `topics` (no version pin, no source URL). The body opens with an empty `## Summary` heading and then `## OWASP Top 10` with no edition marker. This is the canonical first-pass target for the end-to-end loop.
- **`## Deep Guidance` is a real, code-enforced contract, not a styling convention.** The assembly engine has a documented dual-channel split: `extractDeepGuidance()` (`knowledge-loader.ts:102-113`) returns only the content after `## Deep Guidance` for runtime CLI prompts (`loadEntries`), while `loadFullEntries` returns the full body for static command generation. Any rewrite must preserve this heading; deleting it changes what downstream agents see.
- **`doc-conformance` is a finding-category string, not an MMR channel.** It is assigned by the observability renderer at `src/observability/renderers/mmr-findings.ts:22`. The MMR channel layer (Codex / Gemini / Claude) is separate and lives in the `mmr` package outside this repo. The reconciliation logic the prompt referenced (P0–P3, consensus rules) is described in `content/knowledge/core/multi-model-review-dispatch.md:29-32` but is **implemented in the `mmr` CLI itself, not in Scaffold**. We can dispatch audits to it; we cannot modify its reconciliation from this repo.
- **`.mmr.yaml` is intentionally minimal** (only `channels.claude.auth.timeout` and `channels.gemini.auth.timeout`). The authoritative channel defaults live in `packages/mmr/src/config/defaults.ts` in the sibling MMR repo. Adding a new built-in MMR channel for knowledge freshness is therefore a change in the MMR package, not in Scaffold. Phase 1 routes knowledge audits through an MMR `--diff`-style invocation against a temporary patch file; a native channel is deferred to Phase 5.
- **No scheduled GitHub Actions exist.** `.github/workflows/` has `ci.yml`, `publish.yml`, `publish-mmr.yml`, `update-homebrew.yml`. The scheduler the design needs is greenfield.
- **Pipeline counts.** The exploration agent counted **89 step files across 16 phases** in `content/pipeline/`. `CLAUDE.md` says 60 / 16 (`CLAUDE.md:55`). This is consistent with the entries-count drift above and is fixed in Task 0.
- **`scripts/validate-frontmatter.sh` is a legacy stub.** It checks only YAML delimiters and the presence of `description`. The real validation gate is `npm run check` via the Zod validator in `src/project/frontmatter.ts`. The bash script is referenced in `make validate` but is not load-bearing; it is safe to leave alone (or quietly retire) and add a new `make validate-knowledge` target for the knowledge-specific gate.
- **Beads lessons-learned is an external mechanism.** `content/pipeline/foundation/beads.md` only initializes the `tasks/lessons.md` skeleton; the `bd` CLI (external to Scaffold) writes to it. We can read it as a signal for gap detection but should not assume Scaffold owns its contents.
- **Phase-audit hook already exists** in `StateManager.markCompleted()` (called from `src/cli/commands/complete.ts:141`). It runs Lens H (`H-cross-doc`) at phase boundaries via `runPhaseAudit()` in `src/observability/engine/phase-audit.ts`. Freshness audits will be a separate cadence (cron), not piggybacked onto this hook — the two have different signals and trust models.

## Problem Statement

Scaffold's 267 knowledge entries are injected verbatim into the prompts that drive downstream AI agents. When those entries lag external reality — OWASP releasing a 2025 edition, the MCP spec adding an authorization profile, a multi-model CLI changing its auth model — the agents downstream of Scaffold build the wrong software, confidently. The entries carry no notion of when they were last verified, what external sources they depend on, or how fast each topic decays. There is also no signal for the opposite problem: topics that *should* be in the knowledge base but aren't.

The single hardest constraint is that **the model cannot be both the auditor and the source of truth**. An ungrounded "is this still current?" prompt will confirm the model's own outdated priors. Every audit path here must therefore be grounded in fresh web retrieval and explicitly instructed to trust the retrieved source over training.

## Goals & Non-Goals

**Goals**
- Detect drift in existing knowledge entries against authoritative external sources, on a volatility-aware cadence.
- Produce verifiable, source-cited proposed updates that land as PRs with full provenance.
- Detect gaps where downstream agents repeatedly need knowledge the base does not cover.
- Reuse Scaffold's existing infrastructure (knowledge loader, observability engine, MMR dispatch pattern, CI). Build no parallel system.
- Avoid the failure mode of "model invents a new standard" — gate with multi-model corroboration and a regression check that preserves timeless specifics.

**Non-goals (Phase 1)**
- Real-time freshness checking during pipeline execution. Audits run on cron, not per-build.
- Auto-merge of audit PRs. Final landing is always a human gate.
- Replacing the existing build-observability audit lenses A–H. Freshness is a new lens (I) in a separate cadence; the existing lenses are unchanged.
- Modifying the MMR package itself (a sibling repo). Phase 1 dispatches to MMR as it exists today; a native `knowledge-freshness` MMR channel is a Phase 5 enhancement.

## Architecture Overview

```
   ┌───────────────────────────────────────────────────────────────────┐
   │ Daily GitHub Action: knowledge-freshness-audit.yml (cron)         │
   └────────────────────┬──────────────────────────────────────────────┘
                        ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 1. Pre-filter (cheap)                                             │
   │   `scaffold knowledge-freshness audit-prefilter`                  │
   │   - reads each entry's `sources:` URLs                            │
   │   - fetches with HEAD / ETag / Last-Modified                      │
   │   - hashes body if no validators                                  │
   │   - emits a list of entries whose sources changed OR whose        │
   │     `last-reviewed` is older than its volatility tier window      │
   └────────────────────┬──────────────────────────────────────────────┘
                        ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 2. Grounded audit (per entry in the filtered set, max 10/day)     │
   │   tool meta-prompt: content/tools/knowledge-audit-entry.md        │
   │   dispatched via the existing observability LLM dispatcher        │
   │   (`claude -p`, hardcoded for injection safety)                   │
   │   - loads the entry + its `sources:`                              │
   │   - performs WebFetch on each source                              │
   │   - emits structured verdict JSON                                 │
   │   - explicit instruction: "trust the retrieved source over priors"│
   └────────────────────┬──────────────────────────────────────────────┘
                        ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 3. Multi-model corroboration via MMR                              │
   │   pack verdicts as a diff against the current entry,              │
   │   run `mmr review --diff <patch> --focus "knowledge-freshness"`   │
   │   - Codex / Gemini / Claude channels each receive the same input  │
   │   - reconciliation rules already enforced by MMR                  │
   └────────────────────┬──────────────────────────────────────────────┘
                        ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │ 4. PR generation + gates                                          │
   │   - open PR direct to `main`, one per entry                       │
   │   - revised entry + updated `last-reviewed`, citations in body    │
   │   - automated gates: knowledge-frontmatter validator, source      │
   │     link-check, "no unsourced new claims", anti-over-rewrite,     │
   │     Deep-Guidance-preserved check                                 │
   │   - human review required to merge                                │
   └───────────────────────────────────────────────────────────────────┘

   In parallel, gap detection (separate cadence):
   ┌───────────────────────────────────────────────────────────────────┐
   │ pipeline meta-prompts emit `scaffold observe gap-signal …`        │
   │ (always-on; SCAFFOLD_GAP_SIGNAL_QUIET=1 silences for tests/CI)    │
   │ aggregated by Lens I in docs/audits/                              │
   └───────────────────────────────────────────────────────────────────┘
```

## Part A — Refresh Existing Entries

### A.1 Frontmatter extension (the foundation)

Extend the knowledge frontmatter additively. All new fields optional; old files load unchanged.

| Field | Type | Default | Purpose |
|---|---|---|---|
| `volatility` | `'stable' \| 'evolving' \| 'fast-moving'` | `'evolving'` | Cadence tier. Drives the pre-filter window. |
| `last-reviewed` | ISO-8601 date string (`YYYY-MM-DD`) | `null` (treated as "never") | When the entry was last grounded-audited. Updated by the audit PR merge. |
| `sources` | array of `{url: string, anchor?: string, retrieved?: YYYY-MM-DD, hash?: string}` | `[]` | Authoritative external sources the entry depends on. Required for grounded audit to run; empty list = entry is opted out (warns in CI). |
| `version-pin` | string | `null` | Optional explicit version of the source the entry tracks (e.g. `"OWASP Top 10 2021"`). Used for the verdict's `superseded` check. |

Cadence windows (defaults; project-configurable later):

| Volatility | Re-audit if `last-reviewed` older than |
|---|---|
| `fast-moving` | 14 days |
| `evolving` | 60 days |
| `stable` | 180 days |

**Extension points in code:**

- `src/core/assembly/knowledge-loader.ts:8-12` — extend the `KBFrontmatter` interface with the four new optional fields.
- `src/core/assembly/knowledge-loader.ts:18-63` — extend `extractKBFrontmatter()` to parse them. Unknown shapes (e.g., `volatility: 'urgent'`) get defaulted with a warning rather than rejected.
- `src/types/assembly.ts:8-13` — extend the `KnowledgeEntry` type so callers (assembly engine, future audit tooling) can read freshness metadata.
- Add a separate validator at `src/validation/knowledge-frontmatter-validator.ts` using a Zod schema that mirrors `KBFrontmatter`. Wire it into a new `make validate-knowledge` target and a CI job in `ci.yml`. This is distinct from the pipeline-step validator.

**Backfill strategy.** All fields are optional, so existing entries continue to load with sensible defaults. The audit runs only on entries that have at least one `sources:` entry — so backfilling `sources:` is what opts an entry in. Initial backfill targets the 10 fastest-moving entries (see A.6); the long tail is filled opportunistically as audits run.

### A.2 Triage and scheduling

A single CLI subcommand handles both selection and dispatch:

```
scaffold knowledge-freshness audit-prefilter [--max=10] [--dry-run]
```

**Selection algorithm**

```
candidates = []
for entry in content/knowledge/**/*.md:
  if entry has no `sources:`: skip (warn in CI, not here)
  if entry.last-reviewed is null: priority = HIGH; add
  else:
    window = window_for(entry.volatility)
    if now - entry.last-reviewed > window: priority = HIGH; add
    else:
      changed = any source.url with ETag/Last-Modified or content hash
                differs from entry.sources[*].hash
      if changed: priority = HIGH; add
return candidates sorted by (priority, last-reviewed asc)[:max]
```

The pre-filter is intentionally cheap (HTTP HEAD where possible, GET + hash where not) and contains no LLM calls. It outputs a JSON list which the GitHub Action then feeds to the grounded audit step. The default `--max=10` ceiling bounds per-day cost.

### A.3 Grounded audit step

A new tool meta-prompt at `content/tools/knowledge-audit-entry.md` (`category: tool`, `stateless: true`). It takes one entry name as its argument, loads the entry's body + its `sources:`, performs `WebFetch` on each source, and emits a single JSON object on stdout.

**Verdict schema** (canonical, validated by the audit driver):

```json
{
  "entry_name": "security-best-practices",
  "audit_date": "2026-05-24",
  "model": "claude-opus-4-7",
  "verdict": "superseded",
  "sources_checked": [
    {"url": "https://owasp.org/Top10/", "retrieved_at": "2026-05-24",
     "content_hash": "sha256:...", "summary": "OWASP Top 10 2025 edition is now canonical."}
  ],
  "findings": [
    {
      "claim_in_entry": "OWASP Top 10 represents the most critical security risks (generic, no edition)",
      "evidence_url": "https://owasp.org/Top10/",
      "evidence_date": "2026-01-15",
      "source_excerpt": "The 2025 Top 10 introduces A11:2025 Software Supply Chain Failures and …",
      "severity": "P1",
      "drift_kind": "edition-upgrade"
    }
  ],
  "proposed_changes": [
    {"location": "## OWASP Top 10 heading", "kind": "replace",
     "rationale": "Entry pins generically to a 2021-shaped list; 2025 added supply-chain category and folded SSRF into Broken Access Control."}
  ],
  "preserve_warnings": []
}
```

Verdict values: `current` (no findings), `minor-drift` (findings, no proposed changes), `major-drift` (proposed changes, structure preserved), `superseded` (proposed changes, structure may shift; PR description must call this out explicitly).

The meta-prompt **must** include the line: *"You are auditing an entry against retrieved external sources. Where retrieval contradicts the entry, trust retrieval. Where retrieval contradicts your own prior knowledge, trust retrieval. State explicitly when you have no evidence either way; do not invent."*

**Dispatcher.** Reuses the existing LLM dispatcher pattern at `src/observability/engine/llm-dispatcher.ts` (hardcoded `claude -p`, project-config-controlled `timeout_s` only — security rationale: prevents command injection from untrusted repos). One code path to audit and harden.

### A.4 Multi-model corroboration via MMR

For each entry where the single-channel audit returns `major-drift` or `superseded`, the audit driver:

1. Generates a proposed patch (`git diff`–shaped) from the verdict's `proposed_changes`.
2. Writes the patch to a temp file.
3. Invokes `mmr review --diff <patch> --sync --format json --focus "Are the proposed changes justified by retrieved evidence? Are any new claims unsourced?"`.

MMR's existing channels (Codex, Gemini, Claude) each receive the same patch, perform their own analyses, and MMR's existing reconciliation produces a consolidated finding list with severities. The audit driver then maps the MMR verdict:

- `pass` or `degraded-pass` with no new P0/P1 findings → proceed to PR.
- `blocked`, `needs-user-decision`, or new P0/P1 findings → surface to a human, do not auto-PR.

This reuses every piece of MMR's reconciliation logic. No new reconciliation code is written in Scaffold. Phase 5 covers promoting this to a native `knowledge-freshness` MMR channel once we have evidence of what behavior is actually worth standardizing.

### A.5 PR generation and gates

A second CLI subcommand handles the PR step:

```
scaffold knowledge-freshness audit-apply <verdict.json>
```

Behavior:

1. Apply the proposed changes to the entry on a new branch `knowledge-freshness/<entry-name>-<date>`.
2. Update the entry's `last-reviewed` to today's ISO date.
3. Update each `sources[*].hash` and `sources[*].retrieved` to current values.
4. Open a PR with:
   - Title: `chore(knowledge): refresh <entry-name> against <source-summary>`
   - Body: the verdict JSON's findings rendered as a table, evidence URLs as links, MMR job ID.
   - Labels: `knowledge-freshness`, plus the volatility tier as a tag.
   - **Target: `main`, direct.** One PR per entry. Provenance stays per-entry; blame, revert, and review all operate at the smallest meaningful unit.

**Automated gates** (CI on the PR branch):

| Gate | Check |
|---|---|
| Knowledge frontmatter validator | New fields parse; `last-reviewed` is a real ISO date; every `sources[*]` has a URL. |
| Source link-check | Every URL in `sources:` returns 2xx. |
| No unsourced new claims | A simple lint: any sentence added in the diff that ends with a normative claim (e.g. starts with "must"/"should"/"never") must be within N lines of a markdown link to a URL present in `sources:`. Heuristic, advisory; flags for review, doesn't block. |
| Anti-over-rewrite | For `volatility: stable` entries, fail if the diff deletes more than 20% of lines or removes more than one `### `-level subsection without an explicit override label in PR description. |
| Deep Guidance preserved | `## Deep Guidance` heading still present (assembly engine depends on it). |

Final merge is always human review.

### A.6 Initial backfill targets

The 10 entries to backfill `sources:` and `volatility` for first (decisions-locked):

1. `core/security-best-practices.md` — OWASP, `fast-moving`. (Primary validation target.)
2. `core/ai-memory-management.md` — MCP spec, Claude memory docs, `fast-moving`.
3. `core/multi-model-research-dispatch.md` — Codex / Gemini / Claude CLI docs, `fast-moving`.
4. `core/multi-model-review-dispatch.md` — same, `fast-moving`.
5. `core/multi-service-architecture.md` — `evolving`.
6. `core/multi-service-api-contracts.md` — `evolving`.
7. `core/multi-service-auth.md` — OAuth / OIDC RFCs, `evolving`.
8. `core/multi-service-testing.md` — `evolving`.
9. `core/multi-service-patterns.md` — `evolving`.
10. `core/api-design.md` — OpenAPI / GraphQL specs, `evolving`.

This mix validates both the `fast-moving` 14-day cadence and the `evolving` 60-day cadence in real conditions during Phase 1/2.

### A.7 Source-authority allowlist (seed)

`docs/knowledge-freshness/authoritative-sources.yaml` is created in Task 4 with this seed:

```yaml
# Sources outside this list trigger a warning (not a block) in the audit gates.
# Expand per-PR with reviewer approval.
hosts:
  - owasp.org              # OWASP Top 10, ASVS, SAMM
  - nist.gov               # NIST SSDF, SP 800-series
  - ietf.org/rfc           # IETF RFCs (OAuth, OIDC, HTTP, etc.)
  - modelcontextprotocol.io # MCP specification
  - anthropic.com/docs     # Anthropic API docs, Claude model cards
  - platform.openai.com    # OpenAI API docs
  - ai.google.dev          # Gemini API docs
# github.com is allowed only for specific repos (curated by anchor):
github_repos:
  - modelcontextprotocol/specification
  - anthropic-experimental/code-execution-mcp
  # extend with reviewer approval
```

## Part B — Detect Documentation Gaps

Two complementary mechanisms; the strongest (usage-demand) is in scope for Phase 3, the others are roadmap.

### B.1 Usage-demand signal (Phase 3)

A new observability event `knowledge_gap_signal`, emitted by pipeline meta-prompts when an executing agent searches the injected knowledge for a topic and finds nothing — or when the `beads` lessons-learned file accumulates similar bug classes.

**Event shape:**

```json
{
  "type": "knowledge_gap_signal",
  "step_name": "tech-stack",
  "topic": "agent-eval-harnesses",
  "source": "agent_search",
  "agent_excerpt": "<short quote of what the agent was looking for>",
  "project_id": "<hash>"
}
```

**Emission policy (decisions-locked): always-on.** Every pipeline meta-prompt that references `knowledge-base:` entries gets a tail instruction telling the executing agent to run `scaffold observe gap-signal --topic=<slug> --step=<name>` when it can't find what it needs. `SCAFFOLD_GAP_SIGNAL_QUIET=1` suppresses for tests/CI. Trade-off: small token bloat in every prompt is accepted in exchange for catching gaps everywhere they occur, including in steps where someone would have forgotten to opt in.

**Aggregation: Lens I.** Add a new audit lens (`I-knowledge-gaps`) that reads the build-observability ledger, counts signals per topic over a rolling window, and surfaces the top topics in `docs/audits/<id>.md`. Severity rules: a topic with ≥3 signals across ≥2 distinct projects becomes a P2 finding ("propose a new knowledge entry for X"). The lens fits the existing audit structure exactly — `src/observability/checks/lens-i-knowledge-gaps.ts`, registered alongside the existing lenses.

### B.2 Frontier scan (roadmap, Phase 5)

A periodic (monthly) tool meta-prompt `content/tools/knowledge-frontier-scan.md` that issues category-level queries ("what do well-run projects of type X document in 2026?") against authoritative sources and diffs the result against current category coverage. Emits candidate-entry stubs as draft PRs.

### B.3 Taxonomy cross-reference (roadmap, Phase 5)

Static map of existing categories against OWASP 2025, NIST SSDF, AWS Well-Architected pillars, etc. Cells with no matching entry surface as gaps. Implementable as a single offline script once the source maps are curated.

## Cross-Cutting Principles

- **Grounded retrieval is mandatory.** Every audit pass uses `WebFetch` against URLs in `sources:`. The audit meta-prompt explicitly instructs the model to trust retrieved sources over its own priors.
- **Anti-over-rewrite.** Volatility tagging + the diff-size gate on stable entries prevents "the cadence fired so the model rewrote a perfectly good DDD entry."
- **Provenance on every change.** Each PR carries: source URLs with retrieval dates, source content hashes, MMR job ID, the model that produced the proposal. The next audit reads these to know what to re-check.
- **Source authority ranking.** Each entry's `sources:` should prefer: official specs / RFCs > project changelogs / release notes > maintained documentation sites > everything else. The allowlist (A.7) enumerates trusted hosts per category; sources outside the list trigger a warning, not a block.
- **Version the knowledge base.** A single SemVer for the whole KB at `content/knowledge/VERSION`. Bumped per Conventional Commits on each merged freshness PR (`chore(knowledge):` → patch, `feat(knowledge):` → minor, `BREAKING CHANGE:` → major). Downstream Scaffold users can pin to a KB version.

## Cost & Cadence Model

| Activity | Frequency | Approx. cost per run |
|---|---|---|
| Pre-filter | Daily (cron) | ~0; HTTP HEAD per source |
| Grounded audit per entry | Only when pre-filter flags + per-day ceiling | 1 LLM call + N WebFetches |
| MMR corroboration | Only on `major-drift`/`superseded` | 3 LLM calls (Codex/Gemini/Claude) |
| PR open + gates | Per surfaced entry | ~0 |

**Daily ceiling on grounded audits: 10** (configurable via `.scaffold/observability.yaml`). Expected steady state once backfilled: 2–4 audits/day → <100 LLM calls/month for the audit path.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Model invents a "new standard" that doesn't exist | Grounded retrieval is mandatory; MMR multi-channel corroboration; lone "outdated" claims get P2 single-source treatment; human gate on every PR. |
| Cadence churn on stable entries | `volatility: stable` + anti-over-rewrite gate; the audit returns `current` quickly when sources hash-match. |
| Source URL rot | Link-check gate; `last-reviewed: null` if a source 404s twice in a row, surfaces as P1 in the next audit. |
| Backfill paralysis (267 entries) | Optional fields + opt-in via `sources:`. Start with 10; expand as audits succeed. |
| WebFetch hitting paywalls or auth-walls | Source allowlist favors public official sources; the meta-prompt records "unable to verify" instead of inventing. |
| `tasks/lessons.md` is empty or noisy | Gap signal accepts multiple sources (agent search, lessons file, manual flag); lens I has a minimum-count threshold. |
| MMR availability | Audit driver gracefully degrades if any MMR channel is missing; emits a degraded-confidence PR with explicit warning, never silently. |
| Stale CLAUDE.md numbers | Fixed in Task 0 (standalone prerequisite PR). |

## Resolved Decisions

All ten decisions are locked. Each was confirmed by zigrivers on 2026-05-24 against the recommended option.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | System name | `knowledge-freshness` | Names the goal not the mechanism; avoids collision with `scaffold observe audit` / Lens A–H. Used in CLI subcommands, branch prefixes, GHA filename, docs directory, and the new lens. |
| 2 | PR target | Direct to `main`, one PR per entry | Matches Scaffold's existing workflow; provenance per-entry; small reviewable diffs; trivial reverts. Accepts more PR noise as the cost. |
| 3 | MMR channel timing | Phase 1 uses `mmr review --diff` against existing channels; native `knowledge-freshness` MMR channel deferred to Phase 5 | Phase 1 stays inside this repo and doesn't block on a sibling-package release. Native channel waits until we know what behavior is worth standardizing. |
| 4 | Source-authority allowlist seed | Accept proposed seed: owasp.org, nist.gov, ietf.org/rfc, modelcontextprotocol.io, anthropic.com/docs, platform.openai.com, ai.google.dev, curated github.com repos | Covers security/architecture (OWASP/NIST/RFCs) and the AI/MCP fast-moving cluster (vendor docs). Out-of-list sources warn, not block. Expand per-PR. |
| 5 | Initial backfill list | 10 entries per §A.6 (4 fast-moving + 6 evolving) | Exercises both the 14-day and 60-day cadence in real conditions; `security-best-practices.md` is the primary validation target. |
| 6 | Knowledge-base SemVer | Single number at `content/knowledge/VERSION`; bumped per Conventional Commits on each merged freshness PR | Simple for downstream pinning; one number to watch. Per-entry versioning deferred as unjustified complexity at current scale. |
| 7 | LLM dispatcher | Reuse `src/observability/engine/llm-dispatcher.ts` (hardcoded `claude -p`, security rationale: no project-config override) | One subprocess-injection-defense code path to harden. Extract whatever helper isn't yet exported into the dispatcher's public surface as part of Task 7. |
| 8 | Daily audit ceiling | 10 grounded audits per day; configurable via `.scaffold/observability.yaml` | ~10 audits + ~30 MMR runs daily worst case. Steady state 2–4/day. Comfortable headroom; safety valve against pre-filter bugs. |
| 9 | Gap-signal emission | Always-on; `SCAFFOLD_GAP_SIGNAL_QUIET=1` silences for tests/CI | Catches gaps everywhere they occur. Small token bloat per prompt accepted in exchange for not missing signals in forgetfully-configured steps. |
| 10 | CLAUDE.md drift fix | Standalone small PR off `main` before Phase 1 Task 1 (Task 0 in the plan) | Keeps the freshness work focused; takes ~5 minutes; removes a misleading reference for everyone. |

## Naming Reference

The locked name `knowledge-freshness` appears in:

- CLI subcommand: `scaffold knowledge-freshness <verb>` (verbs: `audit-prefilter`, `audit-run-entry`, `audit-apply`)
- Branch prefix: `knowledge-freshness/<entry-name>-<date>`
- PR label: `knowledge-freshness`
- GitHub Actions filename: `.github/workflows/knowledge-freshness-audit.yml`
- Docs directory: `docs/knowledge-freshness/` (operations doc + allowlist YAML)
- Source-tree namespace: `src/knowledge-freshness/` for new modules (pre-filter, runner, apply); existing `src/core/assembly/knowledge-loader.ts` is extended in place
- Tool meta-prompt: `content/tools/knowledge-audit-entry.md` (note: tool name reflects what it does, not the system name — `knowledge-audit-entry` reads naturally; the dispatching CLI carries the `knowledge-freshness` namespace)
- Audit lens ID: `I-knowledge-gaps` (the gap-detection arm; the freshness arm has no lens because it runs on cron, not on `scaffold observe audit`)
