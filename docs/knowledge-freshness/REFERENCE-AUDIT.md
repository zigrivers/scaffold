# Knowledge-Freshness Reference — Audit Findings

Generated 2026-05-27 from `92550d7b`.

## Summary

**31 findings**: 4 P0 (blocking accuracy), 11 P1 (mental-model traps), 11 P2 (coverage gaps), 5 P3 (enhancements).

The dominant theme: the page does an excellent job documenting *what was intended* (per the design specs), but several places where the **code shipped differently** are documented as-spec'd rather than as-built. The reader walks away with a mental model that matches Phase 1 design rounds but not the final implementation. The single most damaging widget is the topic-normalization sandbox (§6) — it actively miseducates by silently producing wrong slugs.

A second theme: the cadence widget (§3) is effectively decorative because the baked KB inventory is uniformly `last-reviewed: null` (Phase 4 backfilled volatility + sources but left review dates null). The build script's frontmatter parser also parses YAML literal `null` as the string `"null"`, masking this with always-the-same output. So the reader sees 266/266 due regardless of date and nothing about why that is.

Most file:line references hold up (14 of 15 spot-checks resolved exactly; one near-miss). The CLI reference is incomplete — five gate-side subcommands and the `bump-version` subcommand exist but aren't documented.

## Findings

---

### F-001
- **Severity:** P0
- **Axis:** Interactive-element quality
- **Where:** §6 / `docs/knowledge-freshness/reference.html:2480-2491` (the `normalizeTopic` JS reimplementation; the widget is at HTML lines 1843-1858)
- **What:** The in-page `normalizeTopic()` strips non-slug characters instead of replacing them with hyphens, producing different output than the production function for any input containing spaces, punctuation, or version-style dots.
- **Evidence:**
  - Page implementation (HTML:2480-2491): `.replace(/[^a-z0-9-]/g, '')` — strips
  - Real implementation (`src/observability/checks/lens-i-lessons-scanner.ts:32-38`): `.replace(/[^a-z0-9-]+/g, '-')` — replaces with hyphen
  - Tested 8 inputs in the browser; **5 disagree:**
    | input | real | page |
    |-------|------|------|
    | `Agent Eval Harnesses!` | `agent-eval-harnesses` | `agentevalharnesses` |
    | `react-19.0` | `react-19-0` | `react-190` |
    | `foo_bar baz` | `foo-bar-baz` | `foo-barbaz` |
    | `multi service auth` | `multi-service-auth` | `multiserviceauth` |
    | `   leading and trailing   ` | `leading-and-trailing` | `leadingandtrailing` |
  - The widget's default value `"Agent Eval Harnesses!"` lands directly on a divergent case, so the very first thing an operator sees is wrong.
- **Recommendation:** Replace the in-page `normalizeTopic` with the production logic verbatim, including the smart-quote strip:
  ```js
  function normalizeTopic(raw) {
    if (typeof raw !== 'string') return '';
    return raw.toLowerCase()
      .replace(/['‘’]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  ```
  Drop the `.trim()` and `_`-to-`-` transforms (the real fn doesn't have them; `_` already gets mapped via the catch-all). Drop the post-normalize regex re-validation (that's a separate step in `isValidTopic`; the production `normalizeTopic` never returns `''` based on the regex — only when the input had no slug-shaped chars). The page should make clear that *validation* (the regex + ≤80 char check) is a separate step in `isValidTopic` at `lens-i-lessons-scanner.ts:114`.

---

### F-002
- **Severity:** P0
- **Axis:** Accuracy
- **Where:** §4 / HTML:1783 ("PR generation" paragraph)
- **What:** Page claims VERSION bump is driven by `fix(knowledge):` for drift and `feat(knowledge):` for superseded. The actual bump rules are completely different and `fix(knowledge):` isn't a recognized prefix at all.
- **Evidence:**
  - Page text: *"Conventional Commits headline (`fix(knowledge):` for drift; `feat(knowledge):` for superseded) drives the automatic VERSION bump on merge."*
  - Real rules at `src/knowledge-freshness/bump-version.ts:26-45`:
    1. `BREAKING CHANGE:` anywhere → major
    2. `feat(knowledge):` or `feat(knowledge-freshness):` → minor
    3. `chore(knowledge):` or `chore(knowledge-freshness):` → patch
    4. Anything else (including `fix(knowledge):`) → patch (with `::notice::`)
  - Confirmed in workflow `.github/workflows/knowledge-freshness-version-bump.yml:5-10`.
- **Recommendation:** Replace the sentence with:
  > *Conventional Commits prefix on the squash-merge title drives the VERSION bump: `BREAKING CHANGE:` → major, `feat(knowledge):` → minor, `chore(knowledge):` → patch. Anything else (including `fix(knowledge):`) falls through to patch with a `::notice::` in the workflow log.*

  Then add `.github/workflows/knowledge-freshness-version-bump.yml` to the architecture diagram callout for the `merge` node.

---

### F-003
- **Severity:** P0
- **Axis:** Interactive-element quality / Accuracy
- **Where:** §3 / HTML:1633-1661 (cadence chart card)
- **What:** The cadence date slider doesn't change the result for any date, because the build script parses YAML `last-reviewed: null` as the string `"null"`, AND because every KB entry has `last-reviewed: null` on disk. The widget claims to show "which entries the prefilter would surface on that day"; in practice it shows 266/266 due for every date.
- **Evidence:**
  - Browser test scrubbed 4 dates from 2025-01-01 to 2030-01-01 — every call returned `due: 266, fast: 19, evol: 150, stable: 97`.
  - `KB_INVENTORY.entries.every(e => e.lastReviewed === 'null')` returned `true`.
  - Build script `scripts/build-freshness-reference.mjs:21-26` extracts frontmatter values as strings, then leaves `last-reviewed: null` as `"null"` (the parser never converts to JS `null`).
  - In-page `recomputeCadence()` falls through both branches (`!e.lastReviewed` is false because `"null"` is truthy; `Date.parse('nullT00:00:00Z')` is NaN, which is treated as "due").
- **Recommendation:** Two fixes are needed:
  1. **Build script (`scripts/build-freshness-reference.mjs:21-26`):** convert `value === "null"` to JavaScript `null` so the JSON faithfully represents the on-disk state.
  2. **Page text:** add a one-line caveat above the chart: *"As of this build, every entry has `last-reviewed: null` — the cron has not yet populated review dates. Once the cron runs, this slider will become meaningful."* Optionally fabricate a synthetic `last-reviewed` for the demo (e.g. assign each entry a random `last-reviewed` between 2025-10-01 and 2026-05-01) so the slider demonstrates the algorithm even when real data isn't there yet.

---

### F-004
- **Severity:** P0
- **Axis:** Accuracy / Mental-model trap
- **Where:** §4 verdict cards (HTML:1763-1780)
- **What:** Page describes verdict→PR behavior inconsistently with the cron. The cron opens a PR for **every** verdict that passes inline gates — including `current`. The page implies only `minor-drift`, `major-drift`, and `superseded` open PRs.
- **Evidence:**
  - Page §4 `current` card: *"Sources confirm; no findings. cron still persists last-reviewed/hash/retrieved so the entry exits the queue."* No mention of PR.
  - Page §4 `minor-drift` card: *"A PR opens with the touchups."*
  - Cron at `.github/workflows/knowledge-freshness-audit.yml:113-155`:
    ```bash
    case "$verdict" in
      current|minor-drift|major-drift|superseded)
        # apply (dry-run for gating)
        node ... audit-apply "$path" "$verdict_path"
        # run gates
        ...
        node ... audit-apply "$path" "$verdict_path" --open-pr
    ```
  - All four verdicts go through `--open-pr`. A `current` verdict opens a frontmatter-only PR (last-reviewed/hash/retrieved persistence).
- **Recommendation:** Rewrite the four cards to make the PR contract uniform. The `current` card should say:
  > Sources confirm; no body findings. A frontmatter-only PR opens that updates `last-reviewed`, `sources[*].hash`, and `sources[*].retrieved` so the entry exits the prefilter queue. The verdict.json is embedded in the PR body for provenance.

  And `minor-drift`:
  > Wording slightly outdated; no substantive claim wrong. **The contract refuses any `proposed_changes` (see audit-apply.ts:54-58).** The PR opens with frontmatter persistence and the findings table as commentary — no body edits.

  (The current/minor-drift no-changes contract is silently surprising; surfacing it is high-value for any reviewer.)

---

### F-005
- **Severity:** P1
- **Axis:** Mental-model trap
- **Where:** §4 `superseded` card (HTML:1776-1779)
- **What:** Page omits the critical behavior that `superseded` does NOT advance `last-reviewed`. An operator reading the card will assume the merged PR brings the entry back to fresh state.
- **Evidence:**
  - `src/knowledge-freshness/audit-apply.ts:103-118`:
    ```ts
    // Do NOT advance `last-reviewed` on a `superseded` verdict. Superseded
    // means the source has shipped a new edition... A human must re-review
    // ... before `last-reviewed` advances. Source `hash` and `retrieved`
    // still update so the prefilter can tell the upstream changed.
    if (verdict.verdict !== 'superseded') {
      fmObj['last-reviewed'] = verdict.audit_date
    }
    ```
- **Recommendation:** Append to the `superseded` card:
  > **`last-reviewed` does NOT advance for superseded** — only `hash`/`retrieved` update. The entry stays due in the next prefilter run until a human re-audits against the new edition and produces a `current` or `major-drift` verdict. This prevents a known-stale entry from looking fresh.

---

### F-006
- **Severity:** P1
- **Axis:** Mental-model trap
- **Where:** §2 architecture diagram (HTML:1529-1533, `merge` node) + §4 PR generation paragraph (HTML:1783)
- **What:** Page presents "human merge → VERSION bump" as if it were Conventional Commits magic, masking the fact that a dedicated GitHub Action workflow (`.github/workflows/knowledge-freshness-version-bump.yml`) runs on PR `closed` events. The reader can't deduce where the bump runs, what triggers it, or what permissions it needs.
- **Evidence:**
  - The merge-node callout in `ARCH_CALLOUTS.merge` (build script lines 200-201) cites only `src/knowledge-freshness/bump-version.ts` (the pure-functions module), not the workflow that calls it.
  - The actual workflow is a 127-line file with its own trigger filter (PR merged from `knowledge-freshness/*` OR labeled `knowledge-freshness`), git identity config, dry-run via CLI, and rebase-then-push behavior.
- **Recommendation:** Add `knowledge-freshness-version-bump.yml` to the architecture callout for `merge`, and add a bullet to §4 PR generation:
  > Bumping happens in a dedicated workflow (`knowledge-freshness-version-bump.yml`) that fires on PR `closed` events when the source branch starts with `knowledge-freshness/` OR the PR is labeled `knowledge-freshness`. It rebases against main before pushing the bump commit (commit prefix `chore(knowledge):` to avoid retriggering itself).

---

### F-007
- **Severity:** P1
- **Axis:** Coverage gap / Mental-model trap
- **Where:** §6 (Lens I + suppression) — no mention of phase-audit hook
- **What:** The page omits a major auditing pathway: `StateManager.markCompleted` calls `runPhaseAudit` at phase boundaries (`user-stories`, `tech-stack`, etc.), running **only Lens H-cross-doc** — not Lens I. Without this context, a reader who hears about phase audits elsewhere in the codebase will assume Lens I fires too.
- **Evidence:**
  - `src/observability/engine/phase-audit.ts:72-81`: `lensIds: ['H-cross-doc']`
  - The CLAUDE.md project context describes phase-audit at length; the reference is silent.
- **Recommendation:** Add a one-paragraph subsection at the end of §6:
  > **Phase audits don't trigger Lens I.** The phase-boundary audit hook (`StateManager.markCompleted` → `runPhaseAudit`, `src/observability/engine/phase-audit.ts:63`) runs only `H-cross-doc`. To see Lens I findings you must invoke `scaffold observe audit --scope=docs` or `--scope=all` explicitly. Lens I is also wired into the daily cron pipeline only via developer audit invocation — the freshness cron doesn't run it.

---

### F-008
- **Severity:** P1
- **Axis:** Mental-model trap
- **Where:** §1 lede + §6 lede + §13 roadmap
- **What:** Page conflates "Phase 5 native MMR channel" with the existing `doc-conformance` MMR channel that is already shipped. CLAUDE.md mentions the doc-conformance channel is built-in (Lens H sub-checks routed into MMR). The page treats native MMR for knowledge-freshness as still a roadmap item, which is true for the *knowledge-freshness-specific* channel, but it leaves the reader without the broader picture.
- **Evidence:**
  - §13: *"Native MMR `knowledge-freshness` channel."* (correct — that specific channel isn't shipped)
  - But CLAUDE.md: *"the `doc-conformance` MMR channel is **disabled by default**; enable via `.mmr.yaml` or `--channels=doc-conformance`."* — this is the existing path through which Lens I findings can already round-trip into MMR via `--output-mode=mmr-findings`.
  - Page §4 MMR-corroboration block recommends manual `mmr review --diff -` but doesn't mention the doc-conformance channel as an alternative.
- **Recommendation:** In §4 MMR-corroboration block, add a paragraph:
  > For Lens I and other doc lenses, the built-in `doc-conformance` MMR channel already routes findings via `scaffold observe audit --output-mode=mmr-findings`. It's disabled by default — enable per-PR with `mmr review --channels=doc-conformance`. The Phase 5 roadmap item is a *knowledge-freshness-specific* channel for the cron-opened PRs.

---

### F-009
- **Severity:** P1
- **Axis:** Mental-model trap
- **Where:** §8 Anthropic card (HTML:2022-2025)
- **What:** Page says Anthropic auth is via `claude /login` keychain *or* `ANTHROPIC_API_KEY`, implying either works without the CLI. But the resolver enforces `claude` on PATH for **every** anthropic path (flag, env, or inferred). `ANTHROPIC_API_KEY` alone is not sufficient — the CLI is still required because the dispatcher shells out to `claude -p`.
- **Evidence:**
  - Page text: *"Auth via `claude /login` keychain or `ANTHROPIC_API_KEY`."*
  - `src/knowledge-freshness/providers/index.ts:44-56`:
    ```ts
    if (choice === 'anthropic' && !input.claudeOnPath) {
      throw new Error(
        'anthropic provider selected but the `claude` CLI is not on PATH. ' +
        'The dispatcher invokes `claude -p` as a subprocess, so the CLI is ' +
        'required regardless of how the provider was chosen ...'
      )
    }
    ```
- **Recommendation:** Rewrite the Anthropic card:
  > Subprocess: `claude -p --tools ""`. Requires Claude Code on PATH (the resolver enforces this even when chosen via flag/env or inferred from `ANTHROPIC_API_KEY`). Auth via `claude /login` keychain OR `ANTHROPIC_API_KEY` — but the CLI install is non-negotiable. (`--tools ""` disables every built-in tool so the model can't WebFetch; bodies come pre-fetched via Node guards.)

---

### F-010
- **Severity:** P1
- **Axis:** Coverage gap
- **Where:** §8 — DeepSeek model defaults missing
- **What:** Page mentions the allowlist (`deepseek-v4-flash`, `deepseek-v4-pro`) but doesn't say which is the default. An operator wanting to set `KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL` can't tell from the page whether they're changing or keeping current behavior.
- **Evidence:**
  - `src/knowledge-freshness/providers/deepseek.ts:23`: `export const DEFAULT_DEEPSEEK_MODEL: DeepseekModel = 'deepseek-v4-flash'`
- **Recommendation:** Append to the DeepSeek card:
  > Default model: `deepseek-v4-flash`. Override via `KNOWLEDGE_FRESHNESS_DEEPSEEK_MODEL` env to `deepseek-v4-pro`; other values throw at dispatcher build time. Hardcoded `thinking: { type: 'disabled' }` because v4 ignores `temperature: 0` when thinking is on, and chain-of-thought before structured JSON output wastes the 8192-token budget.

---

### F-011
- **Severity:** P1
- **Axis:** Coverage gap
- **Where:** §9 CLI reference — missing subcommands
- **What:** The five gate-side subcommands (`link-check`, `lint-unsourced`, `anti-over-rewrite`, `deep-guidance-check`) and `bump-version` are referenced obliquely in §5 and §13 but never documented in the CLI reference. An operator triaging a CI failure needs to invoke them locally.
- **Evidence:**
  - Source files exist: `src/cli/commands/knowledge-freshness-link-check.ts`, `knowledge-freshness-lint-unsourced.ts`, `knowledge-freshness-anti-over-rewrite.ts`, `knowledge-freshness-deep-guidance-check.ts`, `knowledge-freshness-bump-version.ts`.
  - Page §5 mentions `--pr-labels` and `--files-from` flags but the CLI is never expanded with their synopses.
- **Recommendation:** Add five collapsible `<details class="cli-cmd">` entries to §9 with: synopsis, flags (`--files-from <json>`, `--diff <patch>`, `--pr-labels <csv>`, `--title <str>`, `--body <str>`), exit codes (0 pass, 1 block, 2 advisory-only fail), and one example each.

---

### F-012
- **Severity:** P1
- **Axis:** Mental-model trap
- **Where:** §4 prefilter (HTML:1744-1759)
- **What:** Page's prefilter pseudocode shows `hash check` as `if (anyHashChanged)` but elides the timing — the hash check fetches all sources concurrently via `Promise.all` and is *only* run when `ageDays ≤ window`. An operator looking at this code can't tell whether hash check runs for every entry on every cron run (it doesn't — it's only the "in-window" tiebreaker).
- **Evidence:** `src/knowledge-freshness/audit-prefilter.ts:34-62` shows the hash-check is the `else` branch of `if (ageDays > window)`.
- **Recommendation:** Annotate the pseudocode to make the order explicit:
  > The hash check is a **tiebreaker** — only entries that pass the cadence check (`ageDays ≤ window`) reach it. So a stale entry inside its window can still be picked up if its source has drifted, while an out-of-window entry is selected immediately without paying the network cost. Hash check runs `Promise.all` over the entry's 1-3 sources, swallows fetch errors, and reads the cached `sources[*].hash` from frontmatter.

---

### F-013
- **Severity:** P1
- **Axis:** Mental-model trap
- **Where:** §4 PR generation (HTML:1783)
- **What:** Page's branch naming is documented but the page doesn't surface that the cron does an explicit `git checkout main` between candidates (each entry's PR creation starts from a clean main, not from the previous entry's branch). Without this, a reader might assume PRs stack.
- **Evidence:** `.github/workflows/knowledge-freshness-audit.yml:151-165` shows `git checkout -- "$path"` after each iteration and `git checkout main` to reset.
- **Recommendation:** Add to §4 PR generation:
  > Each candidate gets its own PR off `origin/main`. The cron explicitly `git checkout main` between iterations (`audit.yml:161-164`) and `git checkout -- "$path"` to restore the entry between the dry-run audit-apply and the `--open-pr` call. PRs do not stack; failures isolate per-candidate.

---

### F-014
- **Severity:** P1
- **Axis:** Mental-model trap
- **Where:** §2 architecture diagram doc-drift note (HTML:1595-1597)
- **What:** The doc-drift note cites `audit.yml:11-13` for the MMR-not-wired claim. Those lines do say MMR isn't wired, but the rationale they give (Task 11 will add it) implies it's a Phase 2 to-do. In fact, MMR-in-cron is the Phase 5 spec item (§13), and the cron deliberately runs inline gates instead. The drift note is technically correct but reframes a deliberate design as a forgotten task.
- **Evidence:**
  - `audit.yml:11-13`: *"MMR corroboration is intentionally NOT wired into this Phase 2 workflow. Task 11 will add it as a separate CI gate that fires on the freshness PR's pushed branch..."*
  - Parent spec §A.4 + decision #3: MMR-in-cron is deferred to Phase 5.
- **Recommendation:** Rewrite the drift note:
  > **Doc-drift note.** Operations.md §8 describes MMR corroboration as "Task 11 will add it" — but the parent spec's locked decision #3 reframed this as a Phase 5 deferral (native MMR channel). The current cron deliberately runs only inline gates (`.github/workflows/knowledge-freshness-audit.yml:115-118`); reviewers wanting MMR corroboration on a freshness PR run it manually via `mmr review --diff -` (see §4) or enable the built-in `doc-conformance` channel.

---

### F-015
- **Severity:** P1
- **Axis:** Mental-model trap
- **Where:** §2 architecture diagram — gap-arm edges
- **What:** The architecture diagram's gap arm draws an arrow from `finding` to nothing further, and the resolver dangles below Lens I as a "feeder" rather than a *filter*. The reader can't tell whether suppression happens *before* the finding or *after* (it's before — buckets are skipped, no finding is emitted). The labels and edge direction encourage the wrong mental model.
- **Evidence:** SVG `data-arch="resolver"` is positioned at y=395 (below Lens I), with an arrow pointing **up** to Lens I (HTML:1585-1587). The arrow direction + position implies the resolver feeds *findings* — but it actually feeds the `knowledgeIndex` Set into LensContext, which Lens I uses to *skip* buckets before emitting.
- **Recommendation:** Add a small text label on the resolver→Lens I edge: `provides knowledgeIndex Set` and rewrite the gap-arm narrative caption (`HTML:1590`):
  > When the resolver returns an index, Lens I skips buckets whose normalized topic appears in it — no finding is emitted at all (suppression, not after-the-fact filtering). When the resolver returns `null`, Lens I emits every bucket that crosses threshold and prints a single `[Lens I] knowledge-root not located` warning to stderr.

---

### F-016
- **Severity:** P2
- **Axis:** Coverage gap
- **Where:** §3 — no mention of `SCAFFOLD_GAP_SIGNAL_QUIET` env var
- **What:** The env var is mentioned in the §3 gap-signal code excerpt comment in `event-schemas.ts` but the page never surfaces it as an operator-facing knob in the CLI reference or environment section.
- **Evidence:** Parent spec decision #9 + `src/core/assembly/gap-signal-tail.ts` (referenced in CLAUDE.md).
- **Recommendation:** Add to §3 gap-signal section:
  > **Suppressing emission in tests/CI:** Set `SCAFFOLD_GAP_SIGNAL_QUIET=1` in the environment. The assembly-time tail then renders no emission template into the pipeline step. Default is always-on per locked decision #9 (catch gaps everywhere they occur).

---

### F-017
- **Severity:** P2
- **Axis:** Coverage gap
- **Where:** Operations cheat sheet (§10) — no playbook for "DNS-rebinding guard rejected my source"
- **What:** The SSRF guard's DNS-rebinding check (`source-url-validator.ts:211-244`) is one of the most surprising failure modes: a publicly-resolving hostname can be rejected at fetch time because its A/AAAA record happens to be private. Operators hitting this won't know how to diagnose.
- **Evidence:** Error string: `[knowledge-freshness] DNS-rebinding guard: "<host>" resolves to blocked IPv4 <ip>...`
- **Recommendation:** Add a fifth playbook to §10:
  > **A source URL fetches fine in `curl` but the cron rejects it.** The SSRF guard re-resolves the hostname at fetch time and rejects any IP in a non-globally-routable range (RFC1918, link-local, CGNAT, ULA, IPv4-mapped IPv6, etc.). Common cause: an internal DNS view returning a private IP for a public-looking hostname.
  >
  > Diagnose:
  > ```bash
  > # Show every IP the guard would see
  > node -e 'require("node:dns").promises.lookup("<host>", { all: true }).then(console.log)'
  > ```
  > Fix: either move the source to a globally-routable host or remove it from `sources[]` until the DNS view changes.

---

### F-018
- **Severity:** P2
- **Axis:** Coverage gap
- **Where:** §6 Warning policy table
- **What:** The yaml-invalid sub-message is described in row 1 of the warning policy table but the page never shows the actual stderr fragment. An operator searching CI logs for *"was invalid:"* won't know what to grep for.
- **Evidence:** `src/observability/checks/lens-i-knowledge-gaps.ts:122-130` composes:
  ```
  — yaml lenses.I-knowledge-gaps.knowledge_root '<path>' was invalid: <reason>
  ```
- **Recommendation:** Append a second stderr example to the `lens-i:no-root` row showing the yaml-augmented form:
  > ```
  > [Lens I] knowledge-root not located; existing-entry suppression disabled
  >   — yaml lenses.I-knowledge-gaps.knowledge_root '/path/that/does/not/exist'
  >   was invalid: path does not exist: /path/that/does/not/exist.
  >   Pass --knowledge-root or set lenses.I-knowledge-gaps.knowledge_root
  >   in .scaffold/observability.yaml.
  > ```

---

### F-019
- **Severity:** P2
- **Axis:** Coverage gap
- **Where:** §3 Frontmatter schema table (HTML:1610-1625)
- **What:** The `sources` row says *"each: url+SSRF guard, anchor#, retrieved date, hash"* but doesn't describe the `anchor` validation (`^#`) or surface that the audit fetcher appends `url + (anchor ?? '')` to compose the fetch URL. This matters because operators putting `https://x.com#frag1` directly in `url` (instead of split between `url` and `anchor`) produce frontmatter that passes the schema but defeats hash-based change detection.
- **Evidence:** `knowledge-frontmatter-validator.ts:33`: `anchor: z.string().regex(/^#/).optional()`; `audit-prefilter.ts:41`: `const fetchUrl = s.url + (s.anchor ?? '')`.
- **Recommendation:** Replace the `sources` row with:
  > | `sources[]` | object[] | [] | each entry: `url` (SSRF-checked at fetch), `anchor` (optional, must start with `#` — appended to URL at fetch time), `retrieved` (ISO date, populated by audit-apply), `hash` (sha256 of fetched body, populated by audit-apply) | prefilter (hash + cadence), audit runner |
  >
  > **Anchor semantics:** put the fragment in `anchor`, not `url`. The audit fetches `url + anchor` and hashes the response body; coverage checking matches the same combined string.

---

### F-020
- **Severity:** P2
- **Axis:** Coverage gap
- **Where:** §6 — three-tier resolver picker omits the "auto-detect-via-yaml-invalid" combination
- **What:** The resolver picker offers `(none / configured-valid / configured-invalid)` for yaml and `(found / not-found)` for auto-detect. But the real interesting case is `(yaml invalid → fall through to auto-detect succeed)`. Selecting that combination should show how the yaml's reason appears in the attempts trail even though tier 3 wins.
- **Evidence:** Browser test of `yaml="invalid", auto="found"` confirms: trail shows yaml-invalid → auto-detect used, root is auto-detect's path.
- **Recommendation:** No code change needed — the widget already handles it. Add a one-line caption below the resolver:
  > **Most instructive case:** set yaml to "invalid" and auto-detect to "found". The trail records the yaml failure *and* the auto-detect success; root is the auto-detect path. This is what an operator sees when they had yaml configured for an older install path and an `npm update -g @zigrivers/scaffold` moved the install.

---

### F-021
- **Severity:** P2
- **Axis:** Coverage gap / Accuracy
- **Where:** §11 Test pyramid
- **What:** PYRAMID.ci.count says "6 jobs" but the inventory lists only 4 (`audit.yml`, `gates.yml`, `check.yml`, `make check-all`). The `version-bump.yml` workflow is missing from the list entirely, and `make check-all` isn't a job. Also missing: the bats suite (`tests/*.bats`) is a separate test layer not represented in the pyramid at all.
- **Evidence:** `ls .github/workflows/` shows `knowledge-freshness-audit.yml`, `knowledge-freshness-gates.yml`, `knowledge-freshness-version-bump.yml`, `ci.yml`, `publish.yml`, `update-homebrew.yml`, `publish-mmr.yml`.
- **Recommendation:** Fix PYRAMID.ci in the build script:
  ```js
  ci: {
    name: 'CI gates',
    count: '4 workflows',
    files: [
      '.github/workflows/knowledge-freshness-audit.yml',
      '.github/workflows/knowledge-freshness-gates.yml',
      '.github/workflows/knowledge-freshness-version-bump.yml',
      '.github/workflows/ci.yml (check)',
    ],
  }
  ```
  Consider adding a fourth pyramid tier "bash gates" between unit and integration for the bats suite.

---

### F-022
- **Severity:** P2
- **Axis:** Coverage gap
- **Where:** §3 — `version-pin` field semantics
- **What:** Schema table says `version-pin` is "read by audit (superseded detection)" but doesn't explain *how*. The audit prompt instructs the LLM to compare `version-pin` against the current edition number scraped from the source — and a `superseded` verdict signals that `version-pin` should advance.
- **Evidence:** `content/tools/knowledge-audit-entry.md` mentions `version-pin` in the audit instructions; `audit-apply.ts:103-118` rationale.
- **Recommendation:** Augment the `version-pin` row:
  > | `version-pin` | string | null | any string (e.g. `"PCI-DSS v4.0.1"`, `"OWASP Top 10 2021"`) | audit prompt compares against current source edition; `superseded` verdict signals it needs to advance manually |

---

### F-023
- **Severity:** P2
- **Axis:** Coverage gap
- **Where:** §9 CLI reference, `audit-apply` entry (HTML:2100-2111)
- **What:** Page omits the `trustedHashes` option, which is the production mechanism for deterministic hashing — the CLI wrapper computes hashes from real fetches and passes them via `trustedHashes`, bypassing the LLM-claimed `content_hash`. Without surfacing this, an operator wondering "why does the verdict have one hash but the entry have another" can't find the answer.
- **Evidence:** `src/knowledge-freshness/audit-apply.ts:36-46`:
  > Optional map of normalized-url → fresh sha256 hash, computed deterministically by the caller... When provided, these hashes are persisted to frontmatter instead of the LLM-claimed `content_hash` (which is not deterministically verifiable).
- **Recommendation:** Add a flag note to the `audit-apply` CLI entry:
  > **Hash provenance:** the CLI wrapper re-fetches every `verdict.sources_checked.url` and computes its own sha256, then passes the map to `applyVerdictToEntry` via `trustedHashes`. The persisted `sources[*].hash` is therefore deterministic, not the LLM's claim. Unit tests that bypass the wrapper fall back to the LLM-claimed value.

---

### F-024
- **Severity:** P2
- **Axis:** Coverage gap
- **Where:** §6 — `tasks/lessons.md` scanner explanation is thin
- **What:** Page says synthetic signals come from `tasks/lessons.md` but doesn't show what the scanner actually looks for. Operators don't know what to write in lessons.md to make a gap surface.
- **Evidence:** `src/observability/checks/lens-i-lessons-scanner.ts:4-23`:
  ```
  EXPLICIT_MARKER_RE: /<!--\s*gap-topic:\s*([a-z0-9]+(?:-[a-z0-9]+)*)\s*-->/g
  HEURISTIC_PATTERNS: [
    "would have helped to have <a> guide|knowledge entry on <…>",
    "no knowledge|kb entry for <…>",
    "missing knowledge: <…>",
  ]
  // Code-fenced blocks are skipped.
  ```
- **Recommendation:** Add a new subsection to §6 with examples:
  > **What the lessons.md scanner sees**
  >
  > Two passes per non-fenced line:
  >
  > 1. **Explicit marker** — `<!-- gap-topic: <slug> -->` (slug must be kebab-case and pre-normalized). Multiple markers per line allowed.
  > 2. **Heuristic phrases** (case-insensitive, sentence-terminating `.!?` end the capture):
  >    - *"would have helped to have a guide on X"*
  >    - *"missing knowledge entry for X"*
  >    - *"no knowledge entry for X"*
  >    - *"missing knowledge: X"*
  >
  > Captured topics run through `normalizeTopic` then `isValidTopic` (≤80 chars, kebab-case). Synthetic signals carry `project_id: "lessons"` and are excluded from the distinct-projects gate — they corroborate but don't independently satisfy the threshold (decision #6).

---

### F-025
- **Severity:** P2
- **Axis:** Coverage gap
- **Where:** §13 Roadmap — missing reference to `.scaffold/observability.yaml` knobs
- **What:** Page never points to the `disabled_lenses`, `phase_audit`, `fix.dispatcher_command`, `fix.timeout_s`, `fix.per_finding_max_attempts`, `lenses.I-knowledge-gaps.knowledge_root` config keys all in one place. An operator wanting to know "what can I tune" has to comb sections.
- **Evidence:** CLAUDE.md has the full yaml block; the page only shows the `lenses.I-knowledge-gaps.knowledge_root` example in playbook §10.
- **Recommendation:** Add a final subsection to §10 or new §11.5:
  > **Operator-tunable config (`.scaffold/observability.yaml`)**
  >
  > ```yaml
  > lenses:
  >   I-knowledge-gaps:
  >     knowledge_root: /path/to/content/knowledge   # tier-2 resolver
  > disabled_lenses: [I-knowledge-gaps]              # opt out
  > phase_audit:
  >   enabled: true                                  # default
  >   timeout_s: 60
  >   detached: false
  > fix:
  >   dispatcher_command: "claude -p"                # default
  >   timeout_s: 300
  >   per_finding_max_attempts: 3
  > ```

---

### F-026
- **Severity:** P2
- **Axis:** Accuracy (near-miss)
- **Where:** §3 KnowledgeRootResolution code excerpt (HTML:1721)
- **What:** Page cites `src/observability/knowledge-index.ts:275-291` but the `KnowledgeRootResolution` interface actually starts at line **282**. Lines 275-281 are the `KnowledgeRootAttempt` interface (not shown in the excerpt).
- **Evidence:**
  - `awk 'NR==282' src/observability/knowledge-index.ts` → `export interface KnowledgeRootResolution {`
- **Recommendation:** Change the citation to `:282-291`, or extend the excerpt to also show the `KnowledgeRootAttempt` interface (which has its own pedagogical value — the `outcome` enum is the key to reading the attempts trail).

---

### F-027
- **Severity:** P3
- **Axis:** Visual / accessibility
- **Where:** Theme tokens used pervasively (light mode)
- **What:** `--text-faint` (`#9ba1c0`) on `--bg` (`#f5f6fa`) has a contrast ratio of **2.36:1**, well below WCAG AA's 4.5:1 (normal text) and 3:1 (large text). Used in: rail footer, `.stat-label`, `.s-eyebrow`, `.code-bar .path`, `.tier-node-q`, table caption text.
- **Evidence:** Computed in the browser:
  ```
  --text-faint #9ba1c0 on --bg #f5f6fa  →  2.36
  --text-faint on --bg-card #ffffff     →  2.54
  ```
  Dark mode `--text-faint` (`#555c80`) on `--bg` (`#0f1117`) is 2.90 — also fails.
- **Recommendation:** Bump `--text-faint` toward muted in both themes:
  - Light: `#7d83a3` (≈ 3.2:1, large-text AA)
  - Dark: `#7080a8` (≈ 4.6:1, AA)
  Or restrict `--text-faint` to text ≥ 18px and use `--text-muted` everywhere else.

---

### F-028
- **Severity:** P3
- **Axis:** Visual / accessibility
- **Where:** Allowlist table (§7) and decision-spec dropdown
- **What:** All 47 host entries with `path-prefix` or `host` kind chip and 0-cite hosts (anything not in the bare-host count) appear at the bottom when sorted by cites desc. With 35 host entries showing `0 cites` and only ~15 with non-zero, the chart-vs-table tells two stories the reader has to reconcile. Worse: hosts like `the-turing-way.netlify.app` have 15 cites in the top-hosts bar chart but show 0 in the allowlist table.
- **Evidence:** `the-turing-way.netlify.app` host count is keyed on the bare host `the-turing-way.netlify.app`, but the allowlist entry is also `the-turing-way.netlify.app`. So this case should match. Let me check…

  Actually re-reading the build script: `bareHost = h.split('/')[0].replace(/^www\./, '')`. So `the-turing-way.netlify.app` → bareHost `the-turing-way.netlify.app`. The `TOP_HOSTS[bareHost]` lookup should match the 15-cite bar. Confirm with a Playwright re-test if doubts remain.
- **Recommendation:** Spot-check 5 allowlist rows against the top-hosts chart to confirm cites match. If they don't (the `www.`-prefix entries are a known mismatch source per deferred F-001 phase-4), surface that in a footnote: *"`www.`-prefixed allowlist entries match the bare host in citations; the redundant prefix is tracked in deferred-findings P3-www-prefix-inconsistency."*

---

### F-029
- **Severity:** P3
- **Axis:** Visual
- **Where:** File map deep-links — double slash in URL
- **What:** Generated `vscode://file//Users/kenallred/...` URLs have a double slash after `file//`. While VS Code's handler tolerates this, the doubled slash is unsightly and some editor URL parsers (e.g. Cursor on certain builds) reject it. Tested URL: `vscode://file//Users/kenallred/Developer/scaffold/.claude/worktrees/feat+knowledge-freshness/src/observability/knowledge-index.ts:326`.
- **Evidence:** Browser inspection of file tree leaf `href`.
- **Recommendation:** In `renderTree` (HTML script section), change to `vscode://file${node.absPath}` (no slash before `${node.absPath}` since `absPath` already starts with `/`).

---

### F-030
- **Severity:** P3
- **Axis:** Examples / walk-throughs
- **Where:** Whole page lacks one concrete end-to-end example
- **What:** The page describes the lifecycle abstractly (animations, schemas) but never walks through a single real example with sample JSON. A reader who wants to know "what does the cron actually produce" has no concrete artifact to anchor to.
- **Recommendation:** Add a new section §X "A real audit, blow-by-blow" with:
  1. The actual `audit-prefilter` JSON output for `content/knowledge/core/security-best-practices.md` (truncated to 1-2 candidates)
  2. The verdict JSON (sample with one finding, one proposed_change)
  3. The diff `audit-apply` produces
  4. The PR body that gets opened (title, description, label, the rendered findings table)
  5. The gate workflow's output (5 gate results)
  6. The VERSION bump commit message

  Even a synthetic blow-by-blow shifts comprehension significantly. Three places this should land: (i) inline in §4 between "Audit verdicts" and "PR generation"; (ii) as a downloadable JSON artifact linked from §3; (iii) as a sidebar in §10 operations.

---

### F-031
- **Severity:** P3
- **Axis:** Examples / walk-throughs
- **Where:** §6 Lens I — no example finding JSON
- **What:** Page describes `evidence.kind = "knowledge_gap"` in a callout but doesn't show what a Lens I finding's JSON actually looks like. The reader sees the animation but not the artifact.
- **Recommendation:** Append to §6:
  > **What a Lens I finding looks like in the audit sidecar:**
  > ```json
  > {
  >   "id": "a3f2c1d4...",
  >   "lens_id": "I-knowledge-gaps",
  >   "severity": "P2",
  >   "title": "Knowledge base lacks coverage for \"agent-eval-harnesses\" — 4 signals across 2 projects",
  >   "description": "Downstream agents have emitted 4 signals for the topic ...",
  >   "source_doc": "",
  >   "evidence": {
  >     "kind": "knowledge_gap",
  >     "topic": "agent-eval-harnesses",
  >     "signal_count": 4,
  >     "distinct_project_count": 2,
  >     "distinct_projects": ["a3f2...", "1c4e..."],
  >     "first_seen": "2026-04-12T09:00:00Z",
  >     "last_seen": "2026-05-21T14:30:00Z",
  >     "example_excerpts": ["No knowledge entry for agent eval harnesses", ...]
  >   },
  >   "fix_hint": {
  >     "kind": "edit_doc",
  >     "target": "content/knowledge/<category>/agent-eval-harnesses.md",
  >     "prompt": "Propose a new knowledge entry for \"agent-eval-harnesses\". Evidence: 4 signals from 2 projects in the last 90 days."
  >   }
  > }
  > ```

---

## Suggested next-iteration enhancements

These are bigger swings than the per-finding fixes — they would meaningfully change what the page is *for*.

### 1. Show what's actually in the audit sidecars

The page describes the system but doesn't show any of the system's outputs. Adding a single live-from-disk audit sidecar (or a representative fixture) — rendered as a collapsible JSON tree below §6 — would let the reader anchor every abstract description against a concrete artifact. Pair with a "diff between two consecutive audits" view to show how findings transition between runs.

### 2. Replace the cadence demo with one driven by real cron output

The cadence slider is the page's most prominent interactive widget and currently does nothing meaningful. The high-value replacement: read the most recent `audit-prefilter` JSON output (the cron writes `/tmp/candidates.json` — could persist a copy under `docs/audits/`) and visualize the actual queue. Show "today's 10 candidates" with their `(volatility, last-reviewed, priority)` triple and which trigger fired. This gives the reader a window into what the cron is *actually* doing on the latest run instead of a math demo.

### 3. Auto-generated content provenance footer

Every claim, threshold, and file path in the page should trace to a `file:line` reference visible on hover. Implement once via a small markdown-extension at build time: tag claims with `<cite src="path:line"/>` and the build script (a) verifies the line still exists, (b) extracts the surrounding code as a tooltip preview, (c) inserts the `vscode://` deep-link. This forecloses future drift like F-002, F-005, F-009.

### 4. A "what would I do today" launcher

The page is structured by concept (architecture, data model, etc.). A maintainer landing cold usually starts with a task ("I need to add a new entry", "I need to debug why Lens I is noisy", "I need to roll back a freshness PR"). Add a top-level launcher that maps tasks → sections → CLI commands. The 4 operations playbooks are the start of this; expand to 10-15 and surface as the page's primary navigation alongside the conceptual TOC.

### 5. Run the audit against the page itself

The page is markdown-shaped enough that a doc-conformance audit could surface drift between it and the code. Add a CI step that runs `scaffold observe audit --lens H-cross-doc --include docs/knowledge-freshness/reference.html` (or a small custom check) that diffs cited line numbers against the actual files and fails the build if anything is off. The fix-flow could then auto-PR the corrections via the same dispatcher_command path. This makes the page self-healing instead of relying on someone remembering to re-run `scripts/build-freshness-reference.mjs` after KB edits.
