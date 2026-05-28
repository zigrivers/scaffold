# Knowledge-Freshness Reference — Round-2 Audit Findings

Generated 2026-05-27 from `70f2b662`.

## Drift since R1

Verified all 36 file:line citations the page makes against the live code. **35 of 36 still resolve correctly.** One drift:

| Cite (as on page) | Live status | Resolution |
|---|---|---|
| `src/cli/commands/knowledge-freshness-audit-prefilter.ts:45` | drift | Actual code at `:43` |

The CLI's `candidates.map((c) => ({ name: c.name, path: ... }))` call moved up 2 lines after some intervening comments. The page's `:45` now points at the closing brace of the `handler:` block. R2-F-001 below.

Every other citation (including the 30+ added during R1) is byte-accurate against HEAD.

## Summary

**14 findings**: 3 P0 (drift / accuracy regression), 4 P1 (task-completion gaps), 4 P2 (cognitive friction at scale), 3 P3 (stale-risk pre-emptions).

The page is in much better shape than after R1's drift baseline: only one citation slipped in the days since merge. The bigger problems are higher-order:

1. **One R1 fix was incomplete (P0)** — the §1 stat card claims the daily audit ceiling is "configurable in `.scaffold/observability.yaml`", but no such config key exists. The mechanism is `--max=N` in the cron workflow, period. This is a *spec/code drift*: the parent spec's decision #8 promised yaml configurability that never shipped, and the page documents the spec, not the code. R1 didn't catch it because R1's coverage axis was satisfied by mentioning the ceiling at all.

2. **Two widgets have subtle pedagogy bugs.** The bucket-aggregation animation's final step ("next audit run — bucket empty / 0 signals") implies signals are purged between audits — they aren't (the 90-day window is rolling, suppression just skips emission). The cadence chart leaves stale bars on screen when given an invalid date, with no visual signal that the input was rejected.

3. **Half the task simulations failed or partial-succeeded.** "Lower the audit ceiling for my fork" fails outright (P0 above). "Add a new entry" gets you the schema but not the file location convention or a dry-run. "Diagnose a wrong --knowledge-root resolution" gets you a simulator but no way to read the real attempts trail from an audit output.

4. **The page accumulates forward references.** `--fix flow`, `MMR`, `doc-conformance channel`, `Lens A-I taxonomy`, `Phase 5`, `StateManager.markCompleted` all appear before introduction. Each is a small re-read; together they're a tax on the first-time reader.

5. **The R1 prompt produced lenient "addressed-correctly" verdicts.** Round 1's reviews marked F-021 (test pyramid count) addressed even though the SVG only got the data tier, not the visual tier (Gemini caught it in R1's review phase). R3 should require post-fix Playwright verification before a finding is closed.

## Findings

---

### R2-F-001
- **Severity:** P0
- **Axis:** Drift
- **Where:** §4 walk-through, blow-by-blow card #1 caption
- **What:** Page cites `src/cli/commands/knowledge-freshness-audit-prefilter.ts:45` for "CLI emits only `{ name, path }`" but the live code is at `:43`.
- **Evidence:**
  - Page (HTML line ~1853): *"The CLI emits only `{ name, path }` per candidate (`src/cli/commands/knowledge-freshness-audit-prefilter.ts:45`)."*
  - `awk 'NR==43' src/cli/commands/knowledge-freshness-audit-prefilter.ts` → `const out = candidates.map((c) => ({ name: c.name, path: kbIndex.get(c.name) ?? null }))`
  - `awk 'NR==45' src/cli/commands/knowledge-freshness-audit-prefilter.ts` → `  },` (closing brace of handler)
- **Recommendation:** Change `:45` to `:43` in the caption. Or — better — see R2-F-014 below: replace hard-coded line numbers with a CI'd citation system.

---

### R2-F-002
- **Severity:** P0
- **Axis:** Drift / accuracy — survived R1
- **Where:** §1 stat card "Daily audit ceiling: 10" and the link to §8
- **What:** The stat card's sub-text says *"configurable in .scaffold/observability.yaml"*, but no such config key exists in `loadObservabilityConfig` or anywhere else in `src/`. The ceiling is set by the workflow flag `--max=10` (`.github/workflows/knowledge-freshness-audit.yml:67`) with the CLI's default-10 (`src/cli/commands/knowledge-freshness-audit-prefilter.ts:18`) as the only fallback.
- **Evidence:**
  - `grep -rn 'audit_ceiling\|daily_ceiling\|max_audits' src/` → no matches
  - Parent spec decision #8: "10 grounded audits per day; configurable via .scaffold/observability.yaml" — promised but not shipped.
- **Recommendation:** Rewrite the sub-text to:
  > *"Set in `.github/workflows/knowledge-freshness-audit.yml:67` (`--max=10`); CLI default 10."*

  Also remove the `<a href="#s8">configurable</a>` link, which currently routes to the wrong section (Provider selection). Add a sentence to §10's "Tunable config" block:
  > *"Audit ceiling: edit the workflow's `--max=N` flag. There is no yaml knob (spec decision #8 promised one; never shipped — see deferred-findings if/when added)."*

---

### R2-F-003
- **Severity:** P0
- **Axis:** Widget pedagogy bug
- **Where:** §6 bucket-aggregation animation, step 6 ("next audit run — bucket empty")
- **What:** The animation's final state shows `bucket empty / 0 signals / 0 projects`. This implies signals are purged between audit runs. In reality the 90-day window is **rolling** — `lens-i-knowledge-gaps.ts:52` does `Date.now() - WINDOW_DAYS * 86400 * 1000`. Signals in the ledger from yesterday still count tomorrow. Suppression at `:155` (`if (index && index.has(bucket.topic)) continue`) *skips emission* without touching the signal count. An operator who reads the animation literally will be confused when their next audit run produces logs that show the bucket aggregator still seeing the suppressed topic.
- **Evidence:**
  - Page (BUCKET_STEPS, JS line ~2723): `{ sig: 0, proj: 0, state: 'next audit run — bucket empty', emit: false, suppressed: false, entry: true }`
  - Real code at `lens-i-knowledge-gaps.ts:142-156`:
    ```ts
    const index = context?.knowledgeIndex ?? null
    for (const bucket of buckets.values()) {
      // ... threshold checks ...
      if (index && index.has(bucket.topic)) continue   // skip emission, bucket still aggregated
      // ... finding push ...
    }
    ```
- **Recommendation:** Replace step 6 with:
  ```
  { sig: 4, proj: 2, state: 'next audit — bucket aggregated, index.has(topic) skips it', emit: false, suppressed: true, entry: true }
  ```
  Keep the signals visible. The bucket should remain "covered" colored, finding hidden. The pedagogical point is "suppression filters the EMIT step, not the AGGREGATE step."

---

### R2-F-004
- **Severity:** P1
- **Axis:** Task simulation B — "add a new fast-moving entry"
- **Where:** §3 (Frontmatter schema, Tier picker) + §9 (CLI reference)
- **What:** Page tells you what frontmatter fields exist and which tier they should be in, but never says **where to put the new file** (the `content/knowledge/<category>/<slug>.md` convention) or **how to confirm the cron will pick it up tomorrow** (no dry-run path is documented).
- **Evidence:**
  - §3 lists fields but no file-location guidance
  - §9 CLI reference lacks any "verify a single entry against the prefilter today" entry-point
  - The CLI `audit-prefilter` walks the full KB; there's no `--only=<slug>` flag. The closest dry-run is `audit-run-entry <path>` but that's the LLM audit, not the prefilter selection check.
- **Recommendation:** Add a §3 subsection "Adding a new entry":
  1. Choose a category directory under `content/knowledge/<category>/` (or create one — there are 19 categories today).
  2. File name = entry slug + `.md` (must match `name:` in frontmatter).
  3. Required frontmatter: `name`, `description`, plus `volatility` + `sources[]` if you want the cron to audit it.
  4. Validate locally: `make validate-knowledge`.
  5. Verify it's prefiltered: `node dist/index.js knowledge-freshness audit-prefilter --max=10 | jq '.[] | select(.name=="<slug>")'` — empty result means the entry isn't due today; non-empty means tomorrow's cron will pick it up.

---

### R2-F-005
- **Severity:** P1
- **Axis:** Task simulation E — "diagnose unexpected --knowledge-root resolution"
- **Where:** §6 resolver picker + §10 playbooks 3-4
- **What:** Playbooks cover "auto-detect can't find the KB" (root=null) and "yaml is invalid" (validation failure). They don't cover **"resolved-but-wrong"** — when auto-detect picks up a stale install at e.g. `~/.npm/_global/old-scaffold/content/knowledge` instead of the one you meant. The page never says how to *read the actual attempts trail* from a live audit run.
- **Evidence:**
  - `resolveKnowledgeRoot` returns `attempts: KnowledgeRootAttempt[]` (`knowledge-index.ts:282-291`) but only Lens I uses it (to compose the warn string when root is null at `lens-i-knowledge-gaps.ts:122-138`). When root resolves successfully, the trail is dropped on the floor — never logged, never JSON-rendered.
- **Recommendation:** Two-part fix:
  1. Add a §10 playbook "My `--knowledge-root` resolves to a path I didn't expect" with workaround: pass `--knowledge-root <explicit-path>` to confirm what *should* resolve; compare against the unset behavior. (No way to read the attempts trail today.)
  2. File a follow-up code change: log the resolution at debug level so operators can `SCAFFOLD_DEBUG=knowledge-root scaffold observe audit` to see attempts. Page should call out the gap and propose the workaround.

---

### R2-F-006
- **Severity:** P1
- **Axis:** Task simulation F — "add a host to the allowlist"
- **Where:** §7 "How to expand the allowlist"
- **What:** Tells you which file to edit and the matching rule. Doesn't surface **risks** (off-allowlist sources warn-not-block, so the wrong addition is low-blast-radius; but a host that doesn't actually exist will create per-PR link-check failures), **example PR diff**, or **who approves** (any maintainer? freshness team? security review for vendor-docs hosts? — operations.md is silent too).
- **Evidence:**
  - §7 text: *"Edit `docs/knowledge-freshness/authoritative-sources.yaml`. PR review approves each host addition."* — full extent of guidance.
- **Recommendation:** Replace the §7 closing paragraph with:
  > Adding a host:
  > 1. Append the bare hostname to `hosts:` (no `https://`, no `www.` unless the host requires it). Use `host/path` form only for shared-tenancy hosts like `ietf.org/rfc`.
  > 2. Verify the host serves 2xx for at least one URL via `curl -sI`.
  > 3. Open a normal PR — any maintainer can review. Vendor docs (Anthropic, OpenAI) get the same review as patterns hosts (Martin Fowler); the allowlist is content provenance, not security delegation.
  > 4. Risk model: off-allowlist sources still get fetched and audited; they just produce an advisory warning on the PR. The allowlist is for `lint-unsourced` Gate 3, which is itself advisory. Adding a bad host won't break anything; it'll surface as repeated link-check failures.

---

### R2-F-007
- **Severity:** P1
- **Axis:** Widget — cadence chart degrades silently
- **Where:** §3 cadence chart
- **What:** When the date input rejects an invalid value (`2026-99-99`, `2026-02-30`, empty string), the chart leaves whatever bars were last drawn on screen. No banner, no toast, no "Pick a valid date." The user thinks they're looking at fresh data.
- **Evidence (Playwright stress test):**
  - Set `2026-05-27` → `due: 266, fast: 19, evol: 150, stable: 97`
  - Set `2026-99-99` → input value cleared by browser; recomputeCadence sees empty, hits `isNaN(today)` guard, returns. Counts stay at 266/19/150/97.
- **Recommendation:** Two-line fix in `recomputeCadence`:
  ```js
  if (isNaN(today)) {
    document.getElementById('cadenceDue').textContent = '— pick a valid date';
    ['barFastFill','barEvolFill','barStableFill'].forEach(id => document.getElementById(id).style.width = '0%');
    ['barFastCount','barEvolCount','barStableCount'].forEach(id => document.getElementById(id).textContent = '—');
    return;
  }
  ```

---

### R2-F-008
- **Severity:** P2
- **Axis:** Cognitive friction — forward references
- **Where:** §1 hero (`--fix flow`), §2 doc-drift note (MMR, `doc-conformance channel`), §4 (Phase 5), §6 (`Lens A-I taxonomy`, `StateManager.markCompleted`)
- **What:** Six terms are used before they're introduced. A first-time reader either accepts them as opaque labels and keeps going (best case) or breaks flow to look them up (worst case).
- **Evidence:** See cognitive friction map below.
- **Recommendation:** Add a one-line glossary chip-row at the top of the page (under the hero meta, above §1):
  > **Quick glossary:** MMR (multi-model review), Lens (audit check, A–I), `--fix` flow (auto-dispatch fixes for blocking findings), Phase 5 (next iteration in the parent spec).
  Each chip clickable to its in-page anchor where it's actually defined.

---

### R2-F-009
- **Severity:** P2
- **Axis:** Cognitive friction — paragraph density
- **Where:** §8 DeepSeek card; §10 yaml `knowledge_root` playbook closing paragraph
- **What:** Two paragraphs cram 4+ distinct facts together with no visual separation. The DeepSeek card mixes: env var, default model, override env var, thinking mode disabling, max_tokens, URL hardcoding, decision #7 rationale. The yaml playbook closing crams: validation requirements (4 items) + fix recipe + `find` command.
- **Recommendation:** Convert both to bulleted lists. The DeepSeek card becomes ~6 short bullets; the playbook fix becomes a numbered procedure.

---

### R2-F-010
- **Severity:** P2
- **Axis:** Widget — decision search vocabulary mismatch
- **Where:** §12 decision index
- **What:** Searching the decision index for natural-vocabulary terms returns 0 results because the data uses technical vocabulary. Examples: search "normalize" → 0 hits (the actual decision GAP-DET-2 is titled "Topic clustering", choice "Strict slug match"); search "ssrf" → 0 (related decisions use "validator", "guard"); search "anchor" → 0 (decisions don't mention the field by name).
- **Evidence:** Playwright test of search "normalize" returns count=0; decision GAP-DET-2 covers normalization but uses different words.
- **Recommendation:** Either (a) add a `synonyms` field to each decision in the build script, or (b) prepend each card body with a search-friendly keyword line (e.g., "Keywords: normalize, slug, kebab-case, bucketing"). The latter is cheaper.

---

### R2-F-011
- **Severity:** P2
- **Axis:** Cognitive friction — out-of-order stat cards
- **Where:** §1 stat cards
- **What:** The stat row in §1 includes "Allowlist hosts: 47" and "Source citations: 310 across 45 hosts" — both are §7 concepts that the reader hasn't met yet. The first three cards (entries, tiers, ceiling) are foundational; the next three need §7 context.
- **Recommendation:** Either move the allowlist cards into §7's header, or replace them in §1 with foundation stats: "Avg audits/day (steady state): 2-4", "Daily ceiling: 10", "Verdict types: 4". Keep §1 to "what's the system about" rather than "what's its surface area."

---

### R2-F-012
- **Severity:** P3
- **Axis:** Stale-risk pre-emption — hardcoded line numbers
- **Where:** 35 of 36 file:line citations across the page
- **What:** Every citation will drift on the next nearby refactor of the cited file. R1 introduced the citations; R2 already caught one drift. Over 12 months, expect 5-10 drifts.
- **Recommendation:** Two paths:
  1. (Cheap) Convert citations from `file:N-M` to `file` (drop the line range) where the symbol is uniquely greppable. Reader doesn't lose much; drift surface drops to zero for those.
  2. (Better) Add a CI check: parse every `file:NNN` from the page; for each, assert that the line still contains a token from the surrounding page text. Falsifiable, prevents merging drift.

---

### R2-F-013
- **Severity:** P3
- **Axis:** Stale-risk pre-emption — synthetic demo dates
- **Where:** §3 cadence chart caveat + build script `synthesizeReviewDate`
- **What:** The build script synthesizes demo `last-reviewed` dates because every entry is currently `null`. Once the cron runs for a week, most entries will have *real* dates and only a few stragglers will need the synthesis. The caveat's "all 266 entries have last-reviewed: null on disk" line will be wrong silently, and the synthesized dates for some entries will conflict with the real ones for adjacent entries.
- **Recommendation:** Tighten the build script's branches:
  - If `realReviewedCount > 0 && realReviewedCount < total`: caveat should be a one-line subtle note, not the prominent `drift-note` box (the existing yellow-bordered call-out is too loud for a partial state).
  - If `realReviewedCount === total`: hide the caveat entirely (the existing code does this — good).
  - Stop synthesizing the moment `realReviewedCount > total/2`: real data is more useful than synthetic, even if a few bars are short.

---

### R2-F-014
- **Severity:** P3
- **Axis:** Stale-risk pre-emption — KB count + spec count in prose
- **Where:** Hero "266 audited entries"; §12 "36 decisions across three specs"; §7 "47 hosts + 3 GitHub repos"
- **What:** Three numbers appear hardcoded in the page's hero/section-lede prose. The build script substitutes some (e.g., `id="statEntries"`) but not all — the hero meta text and the §12 sentence are literal. When entry/decision/host counts change, the build must touch *every* occurrence, not just the data block.
- **Recommendation:** Replace the literal numbers in prose with `<span id="..."></span>` placeholders that the build script populates. Or — simpler — add a CI check that asserts every literal number in the page agrees with the corresponding baked data field.

---

## Cognitive friction map

A flat catalogue of the moments a careful first-read had to re-read or pause. One line each, section followed by the trigger phrase. No fixes here (those are in the findings list above).

- **§1 hero:** *"how the `--knowledge-root` resolver threads the install location through the `--fix` flow"* — `--fix flow` undefined.
- **§1 stat row:** Card "Allowlist hosts: 47" appears before §7 explains what the allowlist is.
- **§1 stat row:** Card "Daily audit ceiling: 10 — configurable in .scaffold/observability.yaml" — the link target is wrong AND the claim is wrong (see R2-F-002).
- **§1 caption under animation:** *"signals accumulate in the 90-day window, cross a threshold..."* — what threshold? §6 explains; here it's bare.
- **§2 diagram caption:** *"When an operator adds an entry whose name: matches the bucket topic, the resolver's index covers it..."* — "resolver's index" is forward to §6.
- **§2 doc-drift note:** Mentions "operations.md §8" — first-time readers don't have operations.md open.
- **§2 doc-drift note:** Mentions "doc-conformance MMR channel" — MMR is undefined.
- **§3 lede:** *"Every knowledge entry's frontmatter is a Zod-validated object with four freshness-relevant fields."* — Zod is undefined for non-TS readers.
- **§3 cadence chart caveat:** "djb2-hashed slug" — djb2 is an obscure hash algorithm name.
- **§3 KnowledgeRootResolution code block:** Pure interface dump with no narrative; reader sees the shape before knowing what produces it. (The §6 resolver picker would have been better as the introduction.)
- **§4 lede:** *"The cron is a thin bash loop — the brains live in three CLI subcommands and a meta-prompt..."* — the three CLI subcommands are unnamed at first reference.
- **§4 minor-drift card:** *"The applyVerdictToEntry contract refuses any proposed_changes on this verdict"* — `applyVerdictToEntry` is undefined.
- **§4 MMR section:** *"Phase 1 ships `mmr review --diff`..."* — "Phase 1" never introduced as a versioning scheme; reader has no model.
- **§4 VERSION bump table:** Row "Anything else (including `fix(knowledge):`)" — the inclusion is correct but the reader hasn't been told they'd expect `fix(knowledge):` to be minor; the surprise is the whole point but not framed.
- **§5 lede:** *"The cron's `GITHUB_TOKEN`-opened PRs don't fire downstream workflows..."* — assumes the reader knows GitHub Actions's `GITHUB_TOKEN` permission model.
- **§6 lede:** *"Lens I runs under `--scope=docs` and `--scope=all`"* — the Lens taxonomy (A-I) is never introduced.
- **§6 phase-audit subsection:** *"StateManager.markCompleted → runPhaseAudit"* — `StateManager` is undefined.
- **§7 lede:** *"Out-of-allowlist sources warn but don't block (decision #4)."* — decision #4 is a hyperlink to §12, but the parenthetical reads as if the reader has already seen the decision index.
- **§8 lede:** *"The cron switched to DeepSeek HTTP in PR #393..."* — first reference to PR numbers; only relevant for someone familiar with the project's PR history.
- **§8 DeepSeek card:** 7-line paragraph cramming 5 facts; reader has to slow down.
- **§9 CLI heading "Gate-side subcommands":** *"(also runnable locally for triage)"* — implies the reader has been triaging gates already.
- **§10 playbook 2:** *"check the entry's name: matches the bucket topic exactly. The match is exact and post-normalize."* — "post-normalize" forward-refs §6's normalizer.
- **§11 lede:** *"Vitest unit tests cover every public surface..."* — Vitest undefined.
- **§13:** "Phase 5 (planned)" — Phase 5 mentioned across the page never defined as "the next major version" or similar.

## Stale-risk register

| Axis | Will break first | By when | Mitigation |
|---|---|---|---|
| Hardcoded line numbers (35 citations) | Any refactor of cited file shifts a citation | 3 months at current refactor velocity | Drop line numbers; or CI assertion (see R2-F-012) |
| Numbers in prose vs. baked data ("266 entries", "36 decisions", "47 hosts") | Adding an entry/spec/host without re-running the build script | 1 month | Replace with `<span>` placeholders the build fills, OR CI check (R2-F-014) |
| Synthetic demo `last-reviewed` dates | First successful cron run populates real dates; caveat goes stale | When the cron first runs against a real KB | Tighten build-script branches (R2-F-013) |
| §13 "Phase 5 (planned)" wording | When the native MMR channel ships | 1-2 quarters per parent spec roadmap | Auto-detect from a CHANGELOG / commit-trail; OR move "shipped" items out automatically |
| Decision-spec dropdown values are hardcoded enum | When a 4th spec is added | Whenever the next spec ships | Generate the dropdown options from the DECISIONS array's `specId` field automatically — already partially there (the array drives the cards), just needs the dropdown to follow |
| `audit-prefilter.ts:43` (drifted line cited as `:45`) | Already broken | Now | See R2-F-001 |
| `audit-apply.ts:103-118` citations referencing line ranges of >5 lines | Likely to drift on next refactor of audit-apply | 6 months | Convert to symbol references where possible: `audit-apply.ts (superseded clause)` rather than `:103-118` |
| Hero meta "47 hosts · 3 repos" | Adding a single host requires editing prose | Next allowlist addition | Drive from the data (`<span id="allowlistCount">`) |

## Audit-process notes (R3 prompt recommendations)

What worked in R1:
- 8-axis structure surfaced the right *categories* of problems. R2 reused several axes verbatim.
- Per-finding format with severity / where / what / evidence / recommendation was high-signal — the auditor didn't have room to be vague.
- Spot-checks (R1 verified ~15 citations; R2 verified all 36) caught real bugs.

What didn't work in R1:
- **"Addressed-correctly" verdicts were sometimes premature.** F-021 was marked addressed because the PYRAMID data got a `bash` tier; Gemini's later review found the SVG didn't grow a polygon to host it. R3 should require Playwright verification of every fix that touches a widget.
- **R1 didn't run task simulations.** This is the single highest-leverage axis R2 added. Half of R2's P1s came from this axis alone. Keep it.
- **R1's P2 vs P3 distinction was fuzzy.** Some P3s were "nice-to-have polish"; others were "minor accuracy issues that ARE wrong." R2's recasting (P3 = "stale-risk pre-emption") is sharper. Keep that.
- **R1 axis 4 (interactive-element quality) was qualitative.** R2's stress-tests are quantitative — Playwright fingerprints + oracle comparison. Keep the quantitative approach.

For R3, propose:
1. Promote drift to axis 1 (R2 did this — keep).
2. Require Playwright verification before marking a widget-touching finding "addressed". Auditors must capture before/after Playwright fingerprints; reviewers spot-check by re-running the fingerprint.
3. Add a "task simulation" axis matching R2's, with a *different* set of 6 tasks each round to prevent regression-only thinking.
4. Sharpen P3 as "stale-risk pre-emption" (R2's convention). Reject P3s that are "would be nice" without a stale-risk theory.
5. Mandate the cognitive friction map. R1 had no analog and the page accumulated 22 friction points; without surfacing them, they compound.

## Suggested next-iteration enhancements

Five bigger swings that would move the page from "permanent reference" to "single source of truth other docs link to":

### 1. Replace static citations with a generated symbol-trail
Instead of `audit-apply.ts:103-118`, render `audit-apply › verdict !== 'superseded' branch`. At build time, the script greps the source for the symbol/branch label and finds the current line range; at render time it produces a `vscode://` link to the current line and a "see source" tooltip. Drift goes to zero — the page becomes self-healing for any cited identifier as long as the identifier itself doesn't get renamed.

### 2. Live-data view fed by the actual cron's output
The page currently shows synthetic walk-throughs. Add a third state: when the build script runs, if `docs/audits/latest.json` exists, render its actual contents. The page becomes a window into the system's most-recent real run, not just an abstract reference. This is how docs become indispensable — they show the *real* artifacts, not idealized ones.

### 3. Task-completion paths as first-class navigation
The current TOC is conceptual (Architecture → Data Model → Pipeline). Add a parallel "I want to..." rail with the 6 simulated tasks (and others) as entry-points; each spans 2-3 existing sections with deep-link anchors. This is how the page becomes "the place you go to do a thing", not "the place you go to learn about a thing." The bucket of P1s above is exactly the gap between conceptual and operational structure.

### 4. Inline self-test for every widget
Each interactive widget should ship with a 30-second self-test the reader can run from a button: "Confirm this widget matches production today." The button triggers the same Playwright-style oracle comparison this R2 audit ran. If anything drifts, the widget renders a warning band. The R1+R2 cycle was the auditor proving the widgets work; the page should prove it to every reader.

### 5. Promote the audit reports themselves to a shipped artifact
`REFERENCE-AUDIT.md` and `REFERENCE-AUDIT-R2.md` live as siblings of `reference.html` but are invisible to most readers. Add a §14 "Audit history" that lists each round's findings count + verdict, links to the full report, and shows the drift line cited above. This makes the page transparently fallible — readers see what's been wrong before, which raises trust more than implicit polish.
