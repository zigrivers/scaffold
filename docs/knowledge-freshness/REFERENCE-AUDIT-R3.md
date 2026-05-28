# Knowledge-Freshness Reference — Round-3 Audit Findings

Generated 2026-05-28 from `56dfbf8c`.

## R1/R2 fix durability check

| Finding | Still in place? | New bug introduced? |
|---|---|---|
| R1-F-001 normalizeTopic verbatim (smart-quote regex) | ✓ yes | no |
| R1-F-002 VERSION bump table with BREAKING CHANGE row | ✓ yes | no |
| R2-F-001 audit-prefilter `:43` citation | ✓ yes | no |
| R2-F-002 ceiling NOT in yaml — drift-note in §10 | ✓ yes | no |
| R2-F-003 bucket animation aggregator-still-sees | ✓ yes | no |
| R2-F-007 cadence "— pick a valid date" | ✓ yes | no |
| R2-F-008 glossary chips (5 chips) | ✓ yes | **yes — 4 of 5 chip targets land at the wrong place** (see R3-F-003) |
| R2-F-010 decision keyword search (`keywords` field) | ✓ yes | **yes — 4 of 10 reasonable queries return 0 hits** (see R3-F-004) |
| R2-F-012 drift CI script + `make check-freshness-citations` gate | ✓ yes | no (41/41 citations check clean) |
| R2-F-013 cadence caveat scales by `realReviewedCount` | ✓ yes | no |
| R2-F-014 `<span>` placeholders for prose numbers | ✓ yes | no (edit-survival test confirmed the build script correctly overwrites tampered values) |

Build idempotency: ✓ — 3 consecutive `node scripts/build-freshness-reference.mjs` runs produce byte-identical output **once the file is re-baked at HEAD**. R3-F-001 below: the file on `main` was last baked at the R2-base SHA, not the merge SHA — so the page's own provenance stamp was stale the moment it merged.

Drift CI: ✓ — 41 of 41 citations clean.

## Cross-doc consistency check

| Source doc | Page section | Agreement | Drift detected |
|---|---|---|---|
| operations.md §8 (MMR-deferral framing) | §2 doc-drift note | **disagree** | Page misattributes "Task 11 will add it" to operations.md; operations.md actually says **Task 10**. The "Task 11" wording is from `knowledge-freshness-audit.yml:13` workflow comment. R3-F-002. |
| operations.md §10 (roadmap phase numbering) | §13 | **disagree** | operations.md still calls MMR channel "Phase 4"; page + parent spec call it Phase 5. operations.md is the stale doc. R3-F-005. |
| operations.md line 466 (existing-entry suppression) | §6 + §10 | **disagree** | operations.md frames suppression as *"Phase 4 will add"*; the page correctly says it's shipped (Workstream B did). operations.md is stale. R3-F-005. |
| CLAUDE.md (knowledge-freshness yaml example) | §10 tunable-config | ✓ aligned | None — CLAUDE.md surface is small, page matches it. |
| parent spec decision #4 (allowlist seed = 7 hosts) | §12 decision card + §1 stat | partial | Spec's locked choice text says "7 hosts in seed"; page shows "47 hosts + 3 repos" (post-Phase-4 evolved state). Defensible but worth a "seed: 7 / current: 47" qualifier. R3-F-007. |
| parent spec §A.5 (anti-over-rewrite override via PR description marker) | §5 gate 4 + §10 | spec stale | Spec text describes a PR-description marker; the actual code (workflow + page) uses `--pr-labels` label-based override. Spec is stale; page is correct vs. code. R3-F-006. |
| parent spec §A.4 (MMR auto-PR rule) | §4 "Every verdict opens a PR" | spec stale | Spec describes a conditional auto-PR contingent on MMR verdict; cron today opens PRs for all four verdicts because MMR is deferred. Page is correct vs. code. Spec is the future-state. |
| gap-detection spec §2 (90-day window) | §6 + §1 stat | ✓ aligned | None. |
| knowledge-root spec decision #15 (validation contract) | §10 playbook 4 | ✓ aligned | All four requirements (exists, is-directory, VERSION marker, loader runs cleanly) on page. |
| deferred-findings phase-3.md (P3 `as never` open) | §13 deferred | **disagree** | Phase-3 doc still lists `P3-as-never-validator` as open; PR #411 shipped the fix (`refactor(observability): replace as never with typed isOneOf helper`). Both the doc and the page need updating — page omits it from §13; doc fails to mark it resolved. R3-F-008. |
| deferred-findings phase-3.md F-001 (Lens I suppression) | §13 deferred + §6 | partial | The Phase-3 F-001 is the seed of Workstream B (shipped). Page correctly treats as resolved; deferred-findings doc fails to mark it resolved. Traceability gap. |
| deferred-findings phase-4.md (3 still-open items) | §13 deferred | ✓ aligned | Page's three DEFERRED entries (www. prefix, fast-moving core/, thoughtworks.com) match. |
| `knowledge-freshness-audit.yml:11-13,15-21,80-89,113-114,161-165` | §2 + §3 + §5 + §8 | ✓ aligned | Workflow-comment nuances correctly reflected. |
| `knowledge-freshness-gates.yml:17-24,42-53` | §5 | ✓ aligned | activity-types + F-004 anti-tamper comment reflected. |

## Summary

**12 findings**: 1 P0 (silent stamp staleness), 7 P1 (cross-doc + glossary + search; F-002, F-003, F-004, F-005, F-006, F-007, F-008), 4 P2 (adversarial-read risks; F-009..F-012). Separately, the enhancement-feasibility axis scopes 3 P3-style next-iteration ideas (not findings against the page).

The page is more accurate than it's been at any prior round — drift CI catches one whole class of bugs, sentinel BAKE keeps the data fresh on every re-run, and 8 of 11 spot-checked R1/R2 fixes are still in place and behaving. But R3 found two infrastructure-introduced bugs and one drift class neither R1 nor R2 thought to check: the page's own provenance stamp goes stale silently when the file isn't re-baked after a merge.

The most consequential R3 finding is **R3-F-009: the page advertises "266 audited entries" five times without ever surfacing that zero entries have actually been cron-audited**. The cadence caveat in §3 says "all 266 entries have last-reviewed: null on disk" but only when the cadence chart is rendered; the hero, the §1 stat card, and the §13 phase-5 prose all use "audited entries" in a way that conflates "has audit-eligible frontmatter" with "has been audited." A skeptical reader would catch this within 5 minutes.

The cross-doc check produced findings the page-only audit couldn't have surfaced — operations.md is one phase behind the page on multiple facts; the parent spec's locked-decision text is itself outdated relative to the shipped code; the deferred-findings doc still shows resolved items as open. The page mostly tracks code-current; the rest of the doc surface is the problem now.

## Findings

---

### R3-F-001
- **Severity:** P0
- **Axis:** Durability — silent stamp staleness
- **Where:** Page's rail footer (`Generated <date> from <SHA>`)
- **What:** The file on `main` was last baked at the R2-base SHA (`70f2b662`), but `main` is now `56dfbf8c` (the merge commit). The page advertises wrong provenance until someone re-runs the build script — and nothing in CI forces a re-bake. The drift CI (R2-F-012) checks line citations, but not the stamp.
- **Evidence:**
  - `git show HEAD:docs/knowledge-freshness/reference.html | grep genSha` → `<code id="genSha">70f2b662</code>`
  - `git rev-parse --short HEAD` → `56dfbf8c`
  - These don't match. The drift exists in the version currently on `main`.
- **Recommendation:** Two paths:
  1. **(Cheap)** Extend `make check-freshness-citations` to also fail if the page's `<code id="genSha">` doesn't match `git rev-parse --short HEAD`. A maintainer who pushes the merge without re-baking gets blocked by CI.
  2. **(Better)** A pre-merge GitHub Action that re-bakes the page automatically and commits the result to the PR before merge. Removes the human-touchpoint entirely.

---

### R3-F-002
- **Severity:** P1
- **Axis:** Cross-doc — page misattributes a quote
- **Where:** §2 doc-drift note (`reference.html:1651`)
- **What:** Page says *"Operations.md §8 frames MMR corroboration as 'Task 11 will add it.'"* — operations.md says **Task 10** (`operations.md:330`). The "Task 11" wording comes from `knowledge-freshness-audit.yml:13`. The page is quoting the workflow comment but attributing the quote to operations.md.
- **Evidence:**
  - `awk 'NR==330' docs/knowledge-freshness/operations.md` → contains "Task 10 deliberately deferred"
  - `awk 'NR==13' .github/workflows/knowledge-freshness-audit.yml` → contains "Task 11 will add it"
- **Recommendation:** Rewrite the drift note to attribute the "Task 11" quote to the workflow, OR change the quote to operations.md's actual wording. Either:
  > *"`.github/workflows/knowledge-freshness-audit.yml:11-13` says 'Task 11 will add it'; operations.md §8 says 'Task 10 deliberately deferred'; the parent spec's locked decision #3 reframed this as a Phase 5 deferral."*

  Or just quote operations.md correctly.

---

### R3-F-003
- **Severity:** P1
- **Axis:** Durability — R2-F-008 glossary anchors land wrong
- **Where:** Hero glossary chip row
- **What:** 4 of 5 glossary chips advertise that they link to where a term is *defined*, but they actually land at the *section start* — none of which defines the term immediately.
  - **MMR** chip → `#s4` (§4 The pipeline) — MMR is first mentioned in §4's "MMR corroboration (manual)" subsection, not at the section top. Reader lands on prefilter content.
  - **Lens A–I** chip → `#s6` (§6 Lens I) — the page never defines what Lens A–H *are*. Just dives into Lens I.
  - **`--fix flow`** chip → `#s10` (§10 Operations cheat sheet) — `--fix` is documented as a flag on `scaffold observe audit` in §9, never defined as a "flow."
  - **Phase 5** chip → `#s13` — correct; Phase 5 IS at the §13 start.
  - **cron** chip → `#s9` (§9 CLI reference) — **wrong target**. cron is described in §2 architecture (`data-arch="cron"` node) and §4 pipeline. §9 is CLI commands. The cron isn't a CLI.
- **Evidence:** Playwright fetched the `href` + first 200 chars of each linked section. None of the four problem chips lands on definitional text.
- **Recommendation:** Change the chip anchors:
  - MMR → `#s4` (acceptable) but add `id="def-mmr"` to the "MMR corroboration (manual)" h3 and link to that.
  - Lens A–I → either define the taxonomy on the page (add a one-line table to §6) or change the chip text to "Lens I (knowledge gaps)" and link to `#s6`.
  - `--fix flow` → add `id="def-fix-flow"` near the `scaffold observe audit --fix` CLI card and link there.
  - cron → change to `#s2` (architecture diagram) or `#s4` (pipeline). Definitely not `#s9`.

---

### R3-F-004
- **Severity:** P1
- **Axis:** Durability — R2-F-010 decision search has new gaps
- **Where:** §12 decision index
- **What:** R2 fixed the search-for-`normalize`-returns-zero bug by adding a `keywords` field. R3 verified that fix works (✓), but also found four operator-vocabulary queries that still return 0:
  - `spec` → 0 hits (despite 36 decisions across **three specs**)
  - `cron` → 0 hits (despite the cron being the central system component)
  - `check` → 0 hits (despite gates being checks)
  - `ssrf` → 0 hits (acknowledged R2 gap, still present)
- **Evidence:** Playwright iterated the search input with each query; the count display read 0.
- **Recommendation:** Add the missing terms to `DECISION_KEYWORDS` in `scripts/build-freshness-reference.mjs`:
  - PARENT-1 (system name): add "spec specification"
  - All PARENT decisions: add "cron daily workflow"
  - Workstream B-15 (validator strictness): add "ssrf-adjacent path validation"
  - Gates-related decisions: add "check gate validation"
  Three new keyword bumps should restore coverage for these terms. Alternative: surface a "no results — try X / Y / Z" message when search returns 0 to help operators retry.

---

### R3-F-005
- **Severity:** P1
- **Axis:** Cross-doc — operations.md is one phase behind
- **Where:** Not the page — operations.md, but the page should call this out via drift note
- **What:** operations.md §10 line 367 puts the "Native MMR `knowledge-freshness` channel" in Phase 4; the page + parent spec say Phase 5. operations.md line 466 says "Phase 4 will add existing-entry suppression"; that has shipped (Workstream B). Both make operations.md a hazard to anyone reading it for the roadmap.
- **Evidence:**
  - operations.md:367, 466 (stale future-tense)
  - Page §13 + parent spec §A.4 (current)
- **Recommendation:** Two-step:
  1. **Page side (minor):** add a second drift-note in §13 alerting readers that operations.md's roadmap is one phase behind. Quote both.
  2. **operations.md side (the real fix):** open a follow-up PR to bring §10 + line 466 in sync with the page. The page can't do this alone.

---

### R3-F-006
- **Severity:** P1
- **Axis:** Cross-doc — parent spec stale on override mechanism
- **Where:** Not the page (page is correct) — parent spec §A.5
- **What:** Parent spec §A.5 line 247 describes the anti-over-rewrite override as a "label in PR description" marker — but the actual workflow and the page both use a maintainer-applied label (`override:anti-over-rewrite`) read from `github.event.pull_request.labels.*.name`. The spec is stale; the page reflects shipped behavior.
- **Evidence:**
  - Parent spec line 247
  - `.github/workflows/knowledge-freshness-gates.yml:148-152` (label-only mechanism)
  - Page §5 gate 4 description (matches code)
- **Recommendation:** Follow-up PR to update the parent spec. Page action: add a drift footnote in §5 ("The shipped mechanism is a label, not a PR-description marker — the parent spec's earlier wording is stale.") so an operator reading the spec doesn't get confused.

---

### R3-F-007
- **Severity:** P1
- **Axis:** Cross-doc — decision #4 "seed" vs "current" allowlist count
- **Where:** §12 decision #4 card + §1 stat (47 hosts)
- **What:** Parent spec decision #4's *choice* text says the seed was 7 hosts. The page's decision card says "Curated seed (47 hosts + 3 GitHub repos)" — that's the post-Phase-4 evolved state, not the locked decision's wording. A reader looking up "what was decision #4?" sees current-state instead of locked-state.
- **Evidence:**
  - parent spec line 365
  - Page baked DECISIONS array, PARENT-4 entry
- **Recommendation:** Replace the decision #4 choice text with: `"Curated seed of 7 hosts (Phase 1); 47 hosts + 3 repos current (post Phase-4 backfill)"`. Preserves the historical decision wording AND surfaces the evolution.

---

### R3-F-008
- **Severity:** P1
- **Axis:** Cross-doc + page coverage gap — Phase-3 `as never` resolution
- **Where:** §13 deferred-findings list (page) + Phase-3 deferred-findings doc (separate)
- **What:** The Phase-3 deferred-findings doc still lists `P3-as-never-validator` as open. PR #411 (`refactor(observability): replace as never with typed isOneOf helper`) actually fixed it. The page never had this finding in its §13 list (page only has the three Phase-4 deferrals); now we're sure why — but the deferred-findings doc disagrees with that omission.
- **Evidence:**
  - `docs/superpowers/deferred-findings/feat+knowledge-freshness-phase-3.md` still has P3-as-never-validator listed
  - PR #411 merged on 2026-05-26 with the `isOneOf` helper
  - Page §13 DEFERRED array has 3 entries, none related to `as never`
- **Recommendation:** Two-part:
  1. Page side: add a paragraph above §13 deferred-findings list saying "All Phase-3 deferrals are now resolved (P3-as-never-validator → PR #411; F-001 Lens I suppression → Workstream B). Remaining open items are from Phase 4."
  2. Follow-up: edit the Phase-3 deferred-findings doc to mark both resolved with the PR references.

---

### R3-F-009
- **Severity:** P2
- **Axis:** Adversarial-read — "266 audited" implies cron-audited
- **Where:** Hero meta, §1 stat card, all five occurrences of "266"
- **What:** The page advertises "266 audited entries" in five places. The cadence caveat in §3 quietly admits "all 266 entries have last-reviewed: null on disk" (only renders when the cadence chart is reached). The hero, the stat card, and the architecture narrative don't qualify the count. A skeptical reader within 5 minutes notices the implicit claim — "audited" means "the cron has produced verdicts on these entries" — is false (zero have been cron-audited).
- **Evidence:**
  - Hero meta: `<span><span id="metaEntries">266</span> audited entries</span>`
  - §1 stat: "Entries audited: 266"
  - `KB_INVENTORY.realReviewedCount === 0` baked into the page
- **Recommendation:** Reframe to "266 entries audit-eligible" or "266 entries with audit-ready frontmatter" everywhere except the §3 cadence caveat (which already says it correctly). Add a small "(0 cron-audited so far)" subtext to the §1 stat. The candor will improve trust more than the deflated number will dampen it.

---

### R3-F-010
- **Severity:** P2
- **Axis:** Adversarial-read — architecture diagram is incomplete
- **Where:** §2 architecture SVG (12 nodes)
- **What:** The architecture diagram has the 6-node refresh arm + 6-node gap arm. Three real components are documented in the prose but missing from the diagram:
  - **`phase-audit` hook** — `StateManager.markCompleted` → `runPhaseAudit` (mentioned in §6); not in diagram
  - **`doc-conformance` MMR channel** — referenced in §2 drift note as the existing partial path for routing Lens I findings; not in diagram
  - **`--fix` flow** — the verifier + postfix audit loop documented in §9 CLI; not in diagram
- **Evidence:** `document.querySelectorAll('[data-arch]')` returns 12 nodes — none with these names.
- **Recommendation:** Add three more nodes to the diagram (or, if space is tight, a "see also" pointer cluster off to the side). Each should be hoverable and link to its prose section. The diagram should be the canonical map of what's real; missing nodes mean an adversarial reader can argue "this isn't really a system, it's a marketing diagram."

---

### R3-F-011
- **Severity:** P2
- **Axis:** Adversarial-read — performance claims unmeasured
- **Where:** §6 resolver picker caption ("walk is sub-millisecond on ~270 files warm cache"); §3 cadence intro ("Hash check is a tiebreaker — only entries that pass the cadence check reach it")
- **What:** Both are asserted, not measured. A reviewer asking "have you actually timed this?" gets no answer. The "sub-millisecond" claim in particular is a specific scale claim that should either be backed by a benchmark or softened.
- **Evidence:** Page text. No benchmark sidecar exists.
- **Recommendation:** Either:
  1. Run a one-line benchmark, cite the result with the machine/Node version. (`time node -e 'import("./dist/observability/knowledge-index.js").then(({loadKnowledgeIndex}) => loadKnowledgeIndex("content/knowledge"))'`)
  2. Soften the claim: "walk is fast in practice (~270 files); cross-run cache would be unjustified complexity at current scale."

---

### R3-F-012
- **Severity:** P2
- **Axis:** Adversarial-read — security claims state invariant without threat model
- **Where:** §8 DeepSeek card; §12 decision #7 card
- **What:** "URL is hardcoded; project-local config cannot redirect" — true, but doesn't say what the threat is. A reader has to infer: the URL is the LLM endpoint; if a hostile project-local config could change it, an attacker could exfiltrate API keys to attacker-controlled hosts. The page treats this as an invariant ("decision #7 invariant") without naming the harm.
- **Evidence:** §8 DeepSeek card; §12 decision #7
- **Recommendation:** Add one sentence to the DeepSeek bullet and decision #7:
  > *"Threat model: an untrusted project's `.scaffold/observability.yaml` could otherwise redirect the LLM dispatcher at an attacker-controlled host that captures the API key."*

  Reduces handwaving; makes the security work legible.

## Adversarial-read register

Statements an unfriendly reader could quote-mine. One line each.

- §1 hero meta: *"266 audited entries"* — implies cron-audited; reality is "audit-eligible frontmatter." Reframe to "audit-eligible."
- §1 stat card "Entries audited 266": same as above.
- §13 "Phase 5 (planned)": pure future-talk; nothing on this page commits to a delivery target. Could be quote-mined as "feature creep / never shipping."
- §2 architecture: omits phase-audit, doc-conformance MMR, --fix flow nodes. Quote: "the diagram doesn't even include all the system's components."
- §6 resolver picker: *"walk is sub-millisecond on ~270 files warm cache"* — asserted, not measured. Quote: "performance claims without benchmarks."
- §6 KB lookup: *"Auto-detect handles common case (npm-global, Homebrew, local, dev worktree)"* — implies tested across all four. Has it been? Unclear from the page.
- §8 DeepSeek card: *"No subprocess; works in CI without installing the Claude CLI"* — implicit framing that subprocess (Anthropic) is the worse choice. Quote: "page tilts toward DeepSeek."
- §10 yaml playbook: *"the most common failure after an upgrade is that the install path moved"* — claim about common-ness without data.
- §12 decision #7: *"Hardcoded `claude -p`; the project-config override surface is intentionally not extended to prevent command injection in untrusted repos"* — names an invariant but not the threat model. (See R3-F-012.)
- §11 test pyramid: *"~40 files"* unit + *"~5 files"* integration — soft counts; quote-mineable as "they don't even know how many tests they have."
- §1 stat "Daily audit ceiling 10": *"set in knowledge-freshness-audit.yml via --max=10; edit there to change"* — true but invites "wait, the spec promised a yaml knob, why isn't it built?" §10 callout addresses this; first-pass reader may not get there.

## Outsider first-impression report

### 60-second skim (Playwright-fetched above-the-fold contents at 1280×800)

Visible immediately:
- Hero title "Knowledge·Freshness Reference"
- Lede explaining the system in one sentence, but uses three jargon terms (`--knowledge-root`, `--fix flow`, "resolver threads the install location")
- KB version chip: **KB 0.1.0** — strong signal of pre-v1
- Glossary chip row defining 5 terms (high-trust signal — author knows reader doesn't have context)
- §1 H2 "What this system does"

**What I understood in 60 seconds:** "A reference for a knowledge-base audit system, currently at version 0.1.0, with a daily cron and a Lens I gap-detection check. Five jargon terms are flagged for me upfront."

**Trust signals (60s):**
- Glossary chip row exists → author respects my time
- "Generated <date> from <SHA>" in rail → reproducibility is taken seriously
- Sectioned TOC → I can navigate

**Distrust signals (60s):**
- KB 0.1.0 — is this experimental?
- No "status: production / beta / experimental" badge
- "266 audited entries" — implies it's running; but no evidence of "last cron run"
- Lede has jargon BEFORE the glossary explains it (the glossary is below the lede)

**First thing I'd click:** §1 "Executive overview" in the TOC. Already at the top of the page, so I'd scroll.

**First question I'd want answered the page doesn't surface:** *"Has this cron ever actually run? When was the last successful audit?"* — not surfaced anywhere prominent. The KB SemVer is 0.1.0, but that's a content-VERSION not a system-version.

**Bookmark? Bounce?** Bookmark on visual quality + glossary + sectioning. But I'd want to come back with more context.

### 5-minute deep

After 5 minutes I'd have:
- Read §1, §2 architecture (with one diagram-node click), §3 frontmatter table, §6 Lens I overview, §10 playbooks.
- Played with the cadence slider and the topic-normalize input — both work, both feel real.
- Noticed the §3 cadence caveat: *"all 266 entries have last-reviewed: null on disk"* — wait, "audited entries" was misleading then.
- Noticed §13's "Phase 5 (planned)" — half the system is still aspirational.
- Noticed the architecture diagram doesn't include the phase-audit hook §6 talks about.

**Delta (60s → 5min):** trust dropped slightly. The page is excellent at explaining the system but isn't quite honest about its current state. The "266 audited" claim is the biggest hit — once I realize zero are *actually* cron-audited, every other count claim feels suspect.

**Quoted page text that helped:**
- *"Source of truth: the repo at HEAD. If the page disagrees with the code, trust the code."* (rail footer) — high integrity signal.
- *"Doc-drift note: Operations.md §8 frames MMR corroboration as 'Task 11 will add it.' The parent spec's locked decision #3 actually reframed this as a Phase 5 deferral."* (§2) — author is transparent about drift (even though the quote itself is wrong, see R3-F-002).

**Quoted page text that hurt:**
- *"266 audited entries"* (hero meta) — implicit lie.
- *"Phase 5 (planned)"* (§13) — half the roadmap is unscheduled.
- *"walk is sub-millisecond on ~270 files warm cache"* (§6) — unmeasured.

**Bookmark? Link from my own docs?** Yes to bookmark; not yet to link. The page is the best technical reference for this system but isn't yet defensible enough that I'd link to it as "see how to do X" — too many claims I'd have to second-source.

## Enhancement feasibility matrix

R2 proposed 5 bigger swings. R3 scores each against today's infrastructure:

| Enhancement | Cost | Leverage | Infrastructure ready? | Recommend? |
|---|---|---|---|---|
| 1. Generated symbol-trail citations | medium-high (write a citation registry + AST-based locator) | very high — eliminates the entire drift class | partial — the drift CI is the read-side; need the build-side write | **yes (top priority)** |
| 2. Live-data view from real cron output | medium (commit a `docs/audits/latest.json` weekly; render in page) | high — would defuse R3-F-009 directly | none — cron has never produced an audit; need a first successful run first | yes (gated on item 5 below: first successful audit) |
| 3. Task-completion navigation rail | low-medium (build a "I want to..." TOC + 10 task entry-points) | high — addresses every R2 task-simulation P1 in one swing | infrastructure-free, just markup | **yes (second priority)** |
| 4. Inline widget self-test | medium (reuse the Playwright oracle code from R2 + R3) | medium — useful for trust but lower leverage than #1 or #3 | partial — R2's stress-test JS is the prototype | maybe (lower priority) |
| 5. Audit-history shipped section | low (link to REFERENCE-AUDIT.md, R2, R3 from a new §14) | medium — promotes the audit reports from invisible to visible; reinforces R1+R2+R3 transparency | none — just markup | **yes (cheapest)** |

**Top pick: enhancement #1 (generated symbol-trail citations) — 1-page spec below.**

### One-page spec: generated symbol-trail citations

**Problem:** The page has 41 hand-stamped `file:line` citations. R2 drift CI catches when the line goes out of range; it doesn't catch when the symbol at the line shifted while the file is still long enough. R3 found one such drift (audit-prefilter:43 — line was correct after the R2 fix, but easy to imagine future drift inside a still-long-enough file).

**Solution shape:** Replace `file:line` with `file::symbol-or-context`. At build time, a script grep/AST-locates the symbol and renders it as `file:N` *for display* — but the source of truth is the symbol, not the line. If the symbol moves, the displayed line moves with it.

**Markup:**
```html
<code data-cite="src/observability/knowledge-index.ts::resolveKnowledgeRoot">
  src/observability/knowledge-index.ts:326-379
</code>
```

**Build script:**
```js
function resolveCitation(specifier) {
  const [path, symbol] = specifier.split('::')
  if (!symbol) return null
  const lines = fs.readFileSync(path, 'utf8').split('\n')
  // For TS: find `function symbol`, `const symbol`, `export interface symbol`, etc.
  const matchRe = new RegExp(
    `(export\\s+)?(function|const|interface|class|type|enum)\\s+${escapeRegExp(symbol)}\\b`,
  )
  const startIdx = lines.findIndex(l => matchRe.test(l))
  if (startIdx === -1) return null
  // Bracket-balance to find end of declaration (skip for now; just return start line)
  return { line: startIdx + 1 }
}
```

**At build time:** walk every `<code data-cite="...">` element, resolve the citation, rewrite the displayed text to `path:<resolved-line>`. If the symbol can't be found, fail the build with a clear error pointing at the missing symbol.

**Migration path:** keep the existing string-based citations alongside; add `data-cite` to ~5 high-traffic citations as a pilot; iterate.

**Effort:** ~1 day to ship the build-side logic + migrate 5 citations + add a CI gate that fails when a symbol citation can't resolve. Real value compounds as more citations migrate.

**Why this beats the alternatives:**
- Beats #3 (task-completion nav) on impact per line of HTML changed (drift CI is wider-reach).
- Beats #5 (audit history section) because #5 is a one-time markup add — #1 is recurring CI protection.
- Beats #2 (live-data view) because #2 is blocked on "first successful cron audit" (zero today).
- Beats #4 (widget self-test) because #4 only catches widget regressions; #1 catches every drift class R2 + R3 found.

## Audit-process notes (for R4)

What R3 added that R2 missed:
- **Cross-doc check** is the highest-leverage axis added. R1+R2 were page-only audits; R3's check against operations.md / specs / deferred-findings surfaced 5 findings none of the prior rounds could have caught. **R4 should keep this axis.**
- **Adversarial read** is the highest-trust-leverage axis. The "266 audited" finding (R3-F-009) is exactly the class of issue a 5-minute skeptic catches. **R4 should keep this axis.**
- **Outsider first-impression** is harder to evaluate because the auditor (an LLM) already has full context. R3 partially solved this by using Playwright to fetch only what's visible above the fold + the SHA stamp staleness. **R4 could improve this by having a fresh-session sub-agent do the 60-second skim with no prior context.**

What R3's prompt should change for R4:
- **Add a "shipped-since-last-round" axis.** R3 didn't check what code changed between R2 and R3 (only had 1 day, no diffs); a longer-running audit should examine merged PRs that touch the cited code paths.
- **Tighten the durability axis.** R3 was effective at the durability check; the trick was the *programmatic* re-verify (regex against the file). R4 should formalize this — auto-grep every R-finding's "Recommendation" text against the page to confirm the recommendation landed.
- **Drop the outsider first-impression's quote-trust-test** when running with an LLM. It overlapped too heavily with adversarial-read. Keep one or the other.
- **Add an explicit "P0 = silent staleness" definition.** R3's silent-stamp-staleness finding (R3-F-001) didn't cleanly fit "regressed" or "drift CI broken" — it's a NEW class. R4 should expand P0 to include "infrastructure didn't catch a real regression class."

## Suggested next-iteration enhancements (R3 picks)

R2's enhancements #1, #3, #5 in priority order:
1. **Symbol-trail citations** (1-page spec above) — addresses the entire drift class.
2. **Task-completion nav rail** — addresses R2's task simulation P1s + R3-F-005 (operations.md staleness can be defused by a "where do I find this?" rail on the page).
3. **Audit-history §14** — make REFERENCE-AUDIT.md, R2, R3 visible from the page. Doubles as transparency about what's been fixed and what's open.

Plus a new R3-specific:
4. **Re-bake on merge** — pre-merge GHA that runs the build script and commits the result. Closes R3-F-001 and is one of the cheapest possible infrastructure additions.

5. **"Has this cron run yet?" live signal** — surface `docs/audits/latest.json`'s timestamp (or "never run") in the hero. Defuses R3-F-009 and gives the page real-world groundedness.
