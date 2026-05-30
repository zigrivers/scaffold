# Scaffold Guides — Coverage Expansion & Migration Plan

**Date:** 2026-05-30
**Branch:** `docs/guides-coverage-expansion-plan`
**Status:** Reviewed (R1 + R2 folded in; all 4 channels passed in R2); open questions settled — **ready to execute**
**Builds on:** [`2026-05-28-markdown-html-guides-pipeline-design.md`](./2026-05-28-markdown-html-guides-pipeline-design.md) (the markdown→HTML guides *pipeline*; this plan is the *content coverage + migration* follow-on)

## Problem

`scaffold guides` is meant to give users and AI agents comprehensive,
discoverable, agent-readable coverage of every major scaffold/mmr capability.
Today it ships **one** guide — `content/guides/mmr/index.md`. Every other major
subsystem (the prompt pipeline, build observability, multi-agent worktrees, the
CLI surface, the dashboard, install/update, the knowledge base) has **no
guide** in the new system.

Complicating this: scaffold has **two parallel reference systems**, and most of
the deep reference content lives in the *old* one, where agents can't read it
and `scaffold guides` can't discover it.

The goal: close the coverage gap so **no major aspect of scaffold or mmr is
un-guided**, prioritizing the most complex / error-prone / under-documented
areas, while honoring the markdown-source-of-truth model established by the
pipeline spec.

## The two reference systems (ground truth)

| Page | System | Authored | Provenance | Agent-readable? | `scaffold guides`-discoverable? |
|---|---|---|---|---|---|
| `content/guides/mmr/index.md` | **new** (markdown→HTML) | hand-authored MD | none (light) | ✅ reads `.md` | ✅ |
| `docs/reference/mmr-reference.html` | legacy | generated-from-`packages/mmr` | file:line citations | ❌ | ❌ |
| `docs/observability/reference.html` | legacy | hand-authored HTML (1,840 lines) | file:line citations | ❌ | ❌ |
| `docs/knowledge-freshness/reference.html` | legacy | **generated** by `build-freshness-reference.mjs` (3,621 lines; bakes live KB data) | file:line citations | ❌ | ❌ |

Key facts established during discovery:

- **`scaffold guides --build`** (`src/guides/build.ts`) renders each
  `content/guides/<topic>/index.md` → a self-contained `index.html` in the same
  dir, plus a top-level index page. Guides are discovered dynamically by
  `src/guides/loader.ts` (any dir with valid frontmatter is a guide; no manifest).
- **`content/guides/mmr` is hand-authored markdown** and does **not** use the
  file:line citation-provenance mechanism the legacy pages have. `mmr` is the
  only subsystem that has already crossed into the new system; its legacy HTML
  twin (`docs/reference/mmr-reference.html`) is now a redundant precursor.
- The **legacy pages carry verified file:line citations**, gated by
  `scripts/check-reference-citations.mjs` (run in `make check-all` via the
  `check-reference-citations` target; `PAGES` array lists the three pages).
- `docs/knowledge-freshness/reference.html` is **generated**:
  `scripts/build-freshness-reference.mjs` bakes live data (host counts from
  `authoritative-sources.yaml`, KB stats from `content/knowledge`, design
  decisions, gate wiring) into the HTML. The citation checker has a `rebake:`
  hook for it.

So the legacy pages are **high-fidelity but invisible** to the workflow scaffold
has since standardized on (agents read markdown; users discover via
`scaffold guides`). Closing the gap is partly authoring and partly **migrating**
this existing content into the new system.

## Confirmed decisions (from planning)

| # | Decision | Choice | Consequence |
|---|---|---|---|
| D1 | Citation provenance for migrated/new guides | **Port the citation gate to `content/guides`** | The new guide renderer must express + emit file:line citations; `check-reference-citations.mjs` `PAGES` extends to cover generated guide HTML. Raises the fidelity bar for *all* future guides. |
| D2 | The generated freshness page | **Retool the generator to emit the guide** | `build-freshness-reference.mjs` retargets to `content/guides/knowledge-freshness/index.md` (markdown + directives + baked data), rendered to HTML by `scaffold guides --build`. Preserves live data. |
| D3 | Legacy `docs/reference/mmr-reference.html` | **Retire it; reconcile the new guide** | Confirm `content/guides/mmr` authoritative, drift-check vs MMR v3.30 (`finding_key`, native session/round-bounding), add citations, delete the HTML, drop from `PAGES`. |
| D4 | Sequencing | **Migrations first** | Port existing content (observability, knowledge-freshness) before authoring greenfield guides. Resolves the two-systems split early. |

These compose with the **pipeline spec's** already-confirmed decisions: command
name `guides`; generated HTML is checked in + drift-gated; escape hatch is narrow
with a lint warning; diagrams default to mermaid.

### Knock-on effect of D1 + D4

"Migrations first" + "port the gate" means the **first migration carries an
infrastructure prerequisite**: the new guide system cannot faithfully migrate
the citation-bearing legacy pages until it can *express and verify* file:line
citations — which it cannot today (the `mmr` guide doesn't use them). This is
formalized as **Phase 0** below.

## Target guide set (11 guides)

Each entry: **complexity/pain addressed · audience · outline (H2s) · directives ·
overlap check.** Suggested frontmatter `category` and `order` keep them sorted
sensibly alongside `mmr`.

### Track A — Migrate (content exists in legacy system)

#### `observability` — Build Observability  · category: tools · order: 40
- **Pain.** Highest config-complexity, lowest-discoverability subsystem: ledger +
  8 event types; 9 audit lenses (A–I) each with different config + skip behavior;
  progress/replay (8 fused sources, correlation-id dedupe); stall detection (6
  signals); the 5-phase `--fix` loop with snapshot/restore; phase-boundary audits
  firing on `scaffold complete`; `.scaffold/observability.yaml`. Users don't know
  when to `--fix` vs `ack`, what `lens_skipped` means, or why `complete` emitted
  findings.
- **Audience.** Downstream maintainer (primary); new user during build.
- **Source.** Migrate `docs/observability/reference.html` (its headings already
  cover the full outline). Restructure HTML→markdown-with-directives; re-verify
  every file:line citation against current `src/observability/`.
- **Outline.** What it is (ledger + events) · the 9 lenses (scope, adapters, skip
  behavior) · verdicts & severities · progress & replay · stall detection · the
  `--fix` flow · phase-boundary audits · `.scaffold/observability.yaml` reference.
- **Directives.** `:::filter-table` (lenses), `:sev[P0..P3]`, `mermaid` (`--fix`
  loop + replay fusion), YAML blocks, `:::callout` danger (phase-boundary
  surprise, lens-skip false positives).
- **Overlap.** `cli` *lists* the `observe` subcommands; `mmr` owns the
  doc-conformance channel. This owns the engine (lenses/verdicts/config).

#### `knowledge-freshness` — Knowledge Freshness & Lens I · category: tools · order: 42
- **Pain.** The freshness/Lens-I/cron/allowlist subsystem: frontmatter & cadence
  tiers, gap signals → findings, the 5 PR gates, source allowlist, DeepSeek cron
  provider, 3-tier `--knowledge-root` resolution, suppression lifecycle. Deep and
  entirely invisible to agents today.
- **Audience.** Downstream maintainer; scaffold maintainer.
- **Source.** **Retool `build-freshness-reference.mjs`** (D2) to emit
  `content/guides/knowledge-freshness/index.md` with baked data, rendered by
  `scaffold guides --build`. Re-verify citations.
- **Outline.** What the system does · frontmatter, signals & resolution · cadence
  & tiers · candidate→merged-PR flow · the 5 gates · allowlist & sources · cron &
  provider · `--knowledge-root` resolution · config · every command.
- **Directives.** `mermaid` (end-to-end + gap-closure), `:::filter-table`
  (commands, allowlist hosts), `:::chart`/baked data (live host counts), `:sev`,
  `:::callout`.
- **Overlap.** Cross-links `knowledge` (KB authoring) and `observability` (Lens I
  surfaces in the audit). This owns the freshness machinery.

### Track B — Reconcile / retire (D3)

#### `mmr` — Multi-Model Review *(existing; reconcile)* · category: tools · order: 35
- **Action.** Drift-check `content/guides/mmr` against MMR v3.30 (the legacy
  page's "Stable identity (`finding_key`)" section predates native session/
  round-bounding); add file:line citations now that the gate exists (Phase 0);
  delete `docs/reference/mmr-reference.html`; remove it from
  `check-reference-citations.mjs` `PAGES`.
- **Overlap.** Stays the *tool/channel/config* reference; `review-workflow`
  (below) owns the *how-to-use-it* flow.

### Track C — Author (genuinely missing)

#### `pipeline` — The Scaffold Pipeline · category: concepts · order: 10
- **Pain.** The product's core and the single most confusing thing for users: 16
  phases / 89 files / 88+ inter-file dependencies forming a DAG (not a tree); 26
  conditional "if-needed" steps; project-type branches (game adds 8 specs;
  multi-service/multi-platform branch differently); depth/methodology sensitivity;
  the `reads:` vs `dependencies:` distinction; CREATE vs UPDATE MODE. New users
  assume "phase N → N+1" and hit silent skips.
- **Audience.** New user (primary); downstream maintainer.
- **Outline.** Mental model (planning phases 0–14 vs stateless build phase 15) ·
  the 16 phases at a glance · methodology & depth (mvp/custom/deep) · project-type
  playbooks · navigating (`next/run/complete/skip/rework/reset/status`) · why a
  phase is blocked (dependencies vs `reads`, conditional-step catalog) · CREATE vs
  UPDATE MODE.
- **Directives.** `mermaid` (phase DAG + critical path), `:::filter-table`
  (phases × project-type × depth × conditional), `::::tabs` (project types),
  `:::callout` warnings (silent-skip traps).
- **Overlap.** Borders `concepts` (terms link out, not defined) and `cli`
  (commands used here, catalogued there). **Split candidate:** UPDATE MODE +
  dependency-DAG depth could spin into `pipeline-advanced` if it exceeds the
  `mmr` guide's length; start unified.

#### `concepts` — Concepts & Glossary · category: concepts · order: 5
- **Pain.** Pervasive vocabulary confusion flagged across all surveys: worktree,
  stateless, if-needed, UPDATE MODE, `reads` vs `dependencies`, depth/methodology,
  phase, lens, verdict, finding-hash, ADR, bounded context, ubiquitous language,
  compensating pass, degraded-pass. The connective tissue for every other guide.
- **Audience.** New user.
- **Outline.** Term clusters: pipeline concepts · observability concepts · review
  concepts · multi-agent concepts.
- **Directives.** `:::filter-table` (term / category / "see also" cross-links),
  `:::callout` for the most-misunderstood (e.g. stateless ≠ side-effect-free).
- **Overlap.** Defines, never deep-dives — every term links to its owning guide.

#### `cli` — Scaffold CLI Reference · category: reference · order: 20
- **Pain.** ~22 top-level commands with sub-commands; only fragments live in
  CLAUDE.md tables. No single reference.
- **Audience.** All.
- **Outline.** Command groups (setup & adoption · navigation · status ·
  observability · knowledge · validation · version & update · platform & skills) ·
  per-command synopsis/flags/example · common flag patterns
  (`--json/--output/--render`, scope/profile/lens) · exit codes & CI scaffolding.
- **Directives.** `:::filter-table` (commands by group/audience), code blocks.
- **Overlap.** Terse index that links into the deep guides; `observe` explained in
  `observability`, not here.

#### `multi-agent` — Parallel Agents & Worktrees · category: workflows · order: 45
- **Pain.** Worktree lifecycle is error-prone: ledger-harvest-before-`git
  worktree remove` ordering (skip it → lost metrics); branch-deletion guards; the
  `--recover` salvage path; concurrent-cleanup races; build-phase entry-point
  confusion (`single-agent-start` vs `multi-agent-start` vs `new-enhancement` vs
  `quick-task`). Lives only in `docs/git-workflow.md §7` + two scripts.
- **Audience.** Downstream maintainer.
- **Outline.** Why worktrees vs branches · setup
  (`scripts/setup-agent-worktree.sh`, identity files) · the build-phase decision
  tree · working in parallel (conflict avoidance, rebasing) · teardown & harvest
  (required ordering, `scaffold observe harvest`, `--recover`) · resuming.
- **Directives.** `mermaid` (lifecycle + decision tree), `:::callout` danger
  (teardown ordering / metric loss), `::::tabs` (single vs multi-agent).
- **Overlap.** Harvest mechanics referenced in `observability`; entry points
  introduced in `pipeline` (phase 15) and detailed here.

#### `review-workflow` — The Code-Review Workflow · category: workflows · order: 30
- **Pain.** `mmr` documents the *tool*; missing is the *scaffold workflow*: when
  review is mandatory (post-`gh pr create` hook); choosing the entry point
  (`review-pr` vs `review-code` vs `post-implementation-review`); the input-mode
  decision tree (PR / `--staged` / branch diff / delivery candidate /
  **untracked-file synthesized diff**); verdict→action mapping; the
  **3-round-per-finding-hash limit** + `.scaffold/review-attempts/` bookkeeping;
  degraded mode + compensating passes; auth recovery.
- **Audience.** Downstream maintainer; new user.
- **Outline.** When to review & which entry point · choosing the input mode
  (decision tree incl. `diff -u /dev/null` pattern) · reading the verdict & next
  steps · fixing findings (3-round limit, hashes, when to stop) · degraded mode,
  compensating passes & auth recovery.
- **Directives.** `mermaid` (input-mode tree + verdict→action), `:::filter-table`
  (entry point × scope), `:sev`, `:::callout` danger (untracked silently skipped;
  "fixed but still blocked").
- **Overlap.** **Highest overlap risk** — borders `mmr` heavily. Rule: `mmr` =
  tool/channel/config reference; `review-workflow` = how to use it in the scaffold
  flow + wrapper-specific bookkeeping + `post-implementation-review`.

#### `dashboard` — Dashboard & Design System · category: tools · order: 50
- **Pain.** `scaffold dashboard` generates self-contained HTML (Build-Progress +
  Audit/Beads panels) with a strict token-based design system (light/dark parity,
  `--sp-*` scale). Customizers have only `docs/design-system.md`; the Playwright
  visual-test workflow is undocumented in shipped guides.
- **Audience.** Downstream maintainer.
- **Outline.** Opening & reading the dashboard · the design token system
  (light+dark parity) · customizing safely (parity rules) · visual testing with
  Playwright.
- **Directives.** `:::filter-table` (tokens), `:::callout` warning (don't invent
  styles; always both modes), code blocks.
- **Overlap.** Distills `docs/design-system.md` for guide consumers. None with
  other guides.

#### `knowledge` — Knowledge Base (Authoring & Injection) · category: reference · order: 55
- **Pain.** 266 entries across 19 categories injected into prompts during
  assembly; global vs local overrides; `--knowledge-root`. Undocumented for users
  who want to extend/override. **Re-scoped** to avoid colliding with
  `knowledge-freshness` (which owns the audit/freshness machinery).
- **Audience.** Downstream maintainer.
- **Outline.** What the KB is & how it's injected during assembly · browsing &
  overriding entries (global vs local) · authoring a new entry (frontmatter) ·
  pointer to `knowledge-freshness` for the audit lifecycle.
- **Directives.** `:::filter-table` (categories), `:::callout` tips, code blocks.
- **Overlap.** Freshness/Lens-I/audit lives in `knowledge-freshness`; this owns
  authoring/injection/overrides.

#### `install` — Install, Update & Adopt · category: reference · order: 25
- **Pain.** Three install channels (npm primary, Homebrew, Claude Code plugin)
  with distinct update mechanics; the **`brew update` before `brew upgrade`**
  gotcha (stale tap cache reports "already latest"); onboarding paths
  (`scaffold init` new vs `scaffold adopt` existing vs `scaffold update`). Only
  README fragments today.
- **Audience.** New user (primary); downstream maintainer.
- **Outline.** Installing (npm / Homebrew / plugin) · keeping current
  (`npm update`, `brew update && brew upgrade`, `scaffold update`) · fresh vs
  adopt (`init` vs `adopt`) · troubleshooting.
- **Directives.** `::::tabs` (channels), `:::callout` danger (the `brew update`
  trap), code blocks.
- **Overlap.** `scaffold update/version` *listed* in `cli`; this owns the
  install/upgrade narrative.

### Out of the public set
- **Maintainer release flow** (NPM_TOKEN vs OIDC, brew tap, concurrent-tag race)
  stays in `docs/architecture/operations-runbook.md`. `scaffold guides` targets
  *users* of scaffold, not its maintainers. Listed here only so coverage is
  explicit. Revisit if a maintainer guide category is later desired.

## Phased roadmap

### Phase 0 — Guide-system infrastructure *(prerequisite; unlocks D1 + D2)*
1. **Citation syntax + support in `content/guides`** (D1). Adopt a concrete
   inline markdown syntax — **`:cite[path:line]`** (and an optional range
   `:cite[path:start-end]`) — that the renderer transforms into the
   `fp`/`data-path` spans `check-reference-citations.mjs` already understands.
   For the advisory tier use **directive-compatible attribute syntax**
   `:cite[path:line]{mode=advisory}` (warns, never blocks) — **not** `:cite?[…]`,
   which the remark-directive parser would read as an empty `:cite` directive
   followed by literal text (R2-3). Teach `scaffold guides --build`
   (`src/guides/build.ts` + the markdown renderer) to emit the spans; cover
   **both blocking and advisory** citations with TDD fixtures.
2. **Make the citation gate discover guides dynamically** (R2-1). Do **not**
   rely on the hard-coded `PAGES` array in `check-reference-citations.mjs` for
   guides — that silently misses newly authored guides and defeats the D1
   promise. Either have the checker glob `content/guides/*/index.html`, or add a
   coverage test that **fails** when a generated guide containing `:cite`
   citations is not covered by the checker. Wire into `make check-all` alongside
   `guides-check`.
3. **Structured-data directive for baked content** (resolves R1-2). Define a
   first-class **`:::data-chart` / `:::data-table`** directive whose body is
   **YAML** (R2-6) — structured data, not raw HTML — so the retooled freshness
   generator (D2) has a stable, non-HTML emission target. Prove this directive
   with **dedicated Phase 0 fixtures + integration tests** (R2-8), *not* by
   forcing synthetic content into the observability guide; its first real
   consumer is `knowledge-freshness` (Phase 1). The narrow escape hatch from the
   pipeline spec remains for genuinely one-off interactivity. *(The observability
   slice still stress-tests mermaid + `:::filter-table` + `:sev` early, which it
   genuinely uses — see Phase 1.)*
4. **Authoring spec + governance** (R2-7). Produce **`content/guides/AUTHORING.md`**:
   the single source of truth for the guides markdown dialect (existing
   directives + the new `:cite`/`:cite{mode=advisory}`/`:::data-chart`/
   `:::data-table`), escaping rules, error behavior, the citation-gate contract
   (P0-a), and the process for proposing new directives. Required reading in the
   Phase 3 authoring checklist.
5. **Reconcile the two build paths** (D2). Decide the markdown contract so
   `build-freshness-reference.mjs` emits `content/guides/knowledge-freshness/
   index.md` (using `:::data-chart`/`:::data-table` for baked values) and lets
   `scaffold guides --build` render the HTML (the citation checker's existing
   `rebake:` no-op pattern carries to the new location).

**Phase-0 decisions to lock:**
- **P0-a (citation gate granularity).** `:cite[...]` is **blocking** (drift
  fails `make check-all`, per D1); `:cite[...]{mode=advisory}` **warns**. Default
  authoring guidance: cite the code that backs a normative claim with `:cite`;
  use the advisory mode for "see also" pointers. Bounds the D1 maintenance
  contract. Stated authoritatively in `AUTHORING.md`.

- **Effort: M–L** (citation renderer + dynamic-coverage gate + structured-data
  directive + authoring spec).

### Phase 1 — Migrations (Track A) — *observability before knowledge-freshness*
4. **`observability`** — port + refresh + verify citations + retire legacy page.
   Cleaner slice to prove citations + the structured-data directive on (no
   generator). **Effort: M.**
5. **`knowledge-freshness`** — retool the generator (D2) + verify citations +
   **asset-localization** (drop the Google Fonts CDN dependency the legacy page
   carries, so the generated guide is self-contained per the pipeline spec) +
   retire legacy page. Add a **self-containment assertion** to the build/test
   (no external `http(s)://` asset refs in generated guide HTML). **Effort: M–L.**

### Phase 2 — Reconcile / retire (Track B, D3)
6. **`mmr`** — drift-check vs v3.30, add citations, delete legacy HTML, prune any
   guide entry from the checker, and **leave a redirect shim** at each retired
   legacy path (e.g. `docs/reference/mmr-reference.html` → its `scaffold guides`
   equivalent) so existing bookmarks/external refs don't 404 (R2-5). Same shim
   applies to the `observability`/`knowledge-freshness` legacy pages when their
   migrations retire them in Phase 1. **Effort: S–M.**

### Phase 3 — Author the gaps (Track C)
**Stub-first (R2-4).** Before authoring any Phase 3 guide, create
frontmatter-only **stub `index.md` files for every planned guide** so the
`concepts` hub's cross-links (and any inter-guide links) resolve from the first
commit instead of dangling across the sequential PRs. Then author in order:

7. `pipeline` (L) → 8. `concepts` (S) → 9. `cli` (M) → 10. `multi-agent` (M) →
   11. `review-workflow` (M) → 12. `dashboard` (M) → 13. `knowledge` (M) →
   14. `install` (S).
- `pipeline` stays **first in Phase 3** (it's the most directive-heavy authored
  guide — mermaid DAG + complex filter-tables). The renderer's limits are
  already stress-tested earlier by the `observability` slice (Phase 1), so
  surprises surface before this point.
- Authored *after* citations + the build pattern are proven, so each guide
  carries valid `:cite[...]` references from the start (and inherits the D1
  maintenance contract — `:cite` drift breaks `make check-all`; advisory warns).
- **Cross-link verification (R2-9):** `guides-check` gains a relative-link
  validator (every inter-guide markdown link resolves) — added in Phase 0,
  enforced through Phase 3, protecting the `concepts` hub in particular.

## Coverage matrix (post-plan)

| Feature group | Today | Action | Owning guide |
|---|---|---|---|
| MMR review tool | ✅ new-system | reconcile + retire legacy HTML | `mmr` |
| Build observability | ⚠️ legacy HTML only | **migrate** | `observability` |
| Knowledge freshness / Lens I / cron | ⚠️ legacy HTML (generated) | **migrate** | `knowledge-freshness` |
| Prompt pipeline (phases/DAG/UPDATE MODE) | ❌ gap | author | `pipeline` |
| Methodology & depth, project-type branches | ❌ gap | author | `pipeline` |
| CLI command surface | ⚠️ fragments | author | `cli` |
| Worktrees + multi-agent lifecycle | ⚠️ `docs/` only | author | `multi-agent` |
| Code-review *workflow* | ⚠️ partly in `mmr` | author | `review-workflow` |
| Dashboard + design system | ⚠️ `docs/` only | author | `dashboard` |
| Install / update / adopt | ⚠️ README | author | `install` |
| Knowledge base authoring/injection | ❌ gap | author | `knowledge` |
| Concepts / glossary | ❌ gap | author | `concepts` |
| Maintainer release flow | ⚠️ runbook | keep in runbook | — (out of public set) |

After execution, **every major feature group is owned by exactly one guide**,
with the maintainer release flow deliberately kept as internal runbook docs.

## Testing strategy

- **Phase 0 (TDD).** Unit tests for: blocking `:cite[path:line]` **and** advisory
  `:cite[…]{mode=advisory}` → `fp`/`data-path` span rendering in
  `src/guides/build.ts`; a failing-first test that the citation checker flags a
  bad guide citation and passes a good one; the **dynamic-coverage test** (R2-1)
  that fails when a `:cite`-bearing guide isn't covered by the checker; the
  `:::data-chart`/`:::data-table` YAML-body directive fixtures (R2-8); the
  **relative-link validator** in `guides-check` (R2-9). `guides-check` continues
  to pass on the existing `mmr` guide.
- **Migrations.** Every file:line citation in the migrated guide must resolve
  (the gate enforces this); a **self-containment assertion** that
  `scaffold guides --build` output has no external `http(s)://` asset refs (the
  freshness legacy page's Google-Fonts CDN must be localized — R1-3); golden-file
  or snapshot check that the freshness generator's baked data still renders
  post-retool.
- **Visual (R2-2).** The existing `make dashboard-test` + Playwright flow is
  scoped by CLAUDE.md to dashboard CSS/HTML/JS — it is **not** a general guide
  harness. Decide in Phase 0: default to **manual verification + a screenshot
  attached to the PR that first introduces a new shared directive or theme
  change** (desktop + mobile, light + dark); optionally generalize the dashboard
  harness into a reusable `make guides-visual-test` if churn warrants. Update the
  CLAUDE.md cross-reference accordingly. Do **not** imply the dashboard flow
  already covers guides.
- **Gate parity.** `make check-all` (incl. `check-reference-citations` +
  `guides-check`) green before each PR; mandatory MMR review after `gh pr create`.

## Resolved by review R1 (see Review log)

- **Citation syntax gap** → resolved: concrete `:cite[path:line]` syntax +
  advisory `:cite?[...]` variant defined in Phase 0.1.
- **Baked-data directive instability (D2)** → resolved: first-class
  `:::data-chart`/`:::data-table` directive locked in Phase 0.2 as the
  generator's stable target; decided up front, not reactively.
- **Legacy CDN / self-containment** → resolved: asset-localization is now an
  explicit Phase 1 task with a self-containment assertion in the build/test.
- **Citation-gate friction (D1)** → bounded: P0-a splits blocking `:cite` from
  advisory `:cite?`, reserving the gate for claim-backing citations.
- **Renderer-limits-discovered-late** → mitigated: the `observability` slice
  (Phase 1) stress-tests mermaid + filter-table + the new directive before the
  large `pipeline` guide is authored.

## Settled questions (owner sign-off, 2026-05-30)

1. **`review-workflow` vs `mmr` overlap** → **separate guide.** `mmr` stays the
   tool/channel/config reference; `review-workflow` owns the how-to flow
   (entry-point + input-mode decision trees, 3-round/finding-hash mechanics,
   `post-implementation-review`).
2. **`pipeline` size** → **start unified.** Author one `pipeline` guide; split to
   `pipeline-advanced` reactively only if it outgrows the `mmr` guide's length.
3. **`order:` renumbering** → **approved.** `concepts: 5`, `pipeline: 10`,
   `cli: 20`, `install: 25`, `review-workflow: 30`, `mmr: 35`, `observability: 40`,
   `knowledge-freshness: 42`, `multi-agent: 45`, `dashboard: 50`, `knowledge: 55`.

## Review log

### R1 — 2026-05-30 (multi-model, plan-soundness focus)
Channels: **Claude** ✅, **Gemini** ✅, **compensating-Codex** ✅ (Codex native
channel failed; compensating pass ran). **Grok** ✗ — its agentic CLI ignored the
supplied prompt and reviewed an unrelated plan from another repo; output
discarded. Verdict: BLOCKED on 5 plan-improvement findings (all Gemini-unique),
all dispositioned as **accepted** and folded into Phase 0/1 + sequencing above:

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| R1-1 | P1 | Phase 0 lacked a concrete citation markdown syntax | Accepted → `:cite[...]` defined (Phase 0.1) |
| R1-2 | P1 | `:::chart` vs escape-hatch indecision threatens generator stability | Accepted → `:::data-chart`/`:::data-table` locked (Phase 0.2) |
| R1-3 | P1 | Legacy CDN deps not a migration task | Accepted → asset-localization task + self-containment assertion (Phase 1) |
| R1-4 | P2 | Blocking every citation adds refactor friction | Accepted → advisory `:cite?` tier (P0-a) |
| R1-5 | P2 | Largest guide (`pipeline`) authored late risks late renderer surprises | Accepted → renderer stress-tested in Phase 1; rationale documented |

### R2 — 2026-05-30 (multi-model, all channels native; mmr 1.4.0)
Channels: **Claude** ✅, **Gemini** ✅, **Codex** ✅, **Grok** ✅ — all four
native and completed (the mmr 1.4.0 upgrade fixed the grok channel). **No R1
finding was re-raised** (R1 dispositions held). 9 new execution-readiness
findings, all **accepted** and folded into Phase 0/1/2/3 + testing strategy:

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| R2-1 | P1 | Hard-coded `PAGES` silently misses new guides → weakens D1 gate | Accepted → dynamic guide discovery / coverage test (Phase 0.2) |
| R2-2 | P1 | Playwright dashboard-test is dashboard-scoped; no guide visual harness defined | Accepted → Phase 0 decision: manual screenshot trigger (opt. `guides-visual-test`); fix CLAUDE.md ref (Testing) |
| R2-3 | P1 | `:cite?[…]` is incompatible with remark-directive parser | Accepted → advisory tier uses `:cite[…]{mode=advisory}` (Phase 0.1) |
| R2-4 | P2 | `concepts` hub cross-links dangle across sequential PRs | Accepted → stub-first all Phase 3 guides (Phase 3) |
| R2-5 | P2 | Retiring legacy HTML breaks bookmarks/external refs | Accepted → redirect shims at retired paths (Phase 1/2) |
| R2-6 | P2 | `:::data-chart`/`:::data-table` body format unspecified | Accepted → YAML body (Phase 0.3) |
| R2-7 | P2 | No source-of-truth dialect spec / governance | Accepted → `content/guides/AUTHORING.md` (Phase 0.4) |
| R2-8 | P2 | Proving the data directive via observability is ambiguous | Accepted → dedicated Phase 0 fixtures; first real use in `knowledge-freshness` (Phase 0.3) |
| R2-9 | P2 | No internal relative-link verification between guides | Accepted → relative-link validator in `guides-check` (Phase 0 / Phase 3) |

**Assessment:** R2 surfaced no conceptual/scoping flaws — only execution-readiness
gaps, now closed. The plan is considered **ready to execute**; a confirmatory R3
is optional (recommended only if the Phase 0 implementation diverges from the
locked directive/citation contracts).

## Out of scope (this plan)

- Authoring a maintainer-facing `releasing` guide (stays in the runbook).
- Changing the guides *pipeline* mechanics already settled in the
  2026-05-28 spec (command name, checked-in HTML + drift gate, escape-hatch
  policy, mermaid default).
- Per-entry knowledge-base versioning, or any change to the freshness
  *subsystem* behavior (only its documentation is in scope).
