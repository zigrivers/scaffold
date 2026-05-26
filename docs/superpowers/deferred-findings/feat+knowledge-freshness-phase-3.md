# Deferred Findings — feat/knowledge-freshness-phase-3

Phase 3 (gap-detection) spec review loop. Per the execution rule on
this branch, rounds 1–5 fix every P2-or-above finding; rounds 6+ fix
only P0/P1 and defer P2/P3 here. Revisit during T1–T5 implementation
or in a Phase 4 hardening pass.

## Spec review loop summary

| Round | MMR job_id | MMR verdict | MMR findings | Grok findings | Notes |
|---|---|---|---|---|---|
| 1 | (lost — see commit `a0c6ab2`) | blocked | 9 (5 P1, 3 P2, 1 P3) | 7 (1 P1, 4 P2, 2 P3) | Claude channel timed out |
| 2 | (commit `38de612`) | blocked | 11 (5 P1, 5 P2, 1 P3) | 4 (1 P1, 3 P2) | Caught round-1 over-corrections |
| 3 | (commit `b836cea`) | blocked | 10 (7 P1, 3 P2, 1 P3) | clean (0) | Grok missed contract-shape bugs |
| 4 | (commit `6334c2e`) | blocked | 6 (3 P1, 2 P2, 1 hallucination) | clean (0) | 1 hallucination from gemini |
| 5 | (commit `2b6b812`) | blocked | 4 (2 P1, 2 P2) | clean (0) | Last round under fix-every-P2 budget |
| 6 | (this round) | **degraded-pass** | **0** | clean (0) | Both tools converge; stop conditions met |

Total review rounds: 6. Total MMR P0/P1/P2 findings fixed: 24. Total
grok P0/P1/P2 findings fixed: 8 (after dedup). Hallucinations
identified and skipped: 1.

## Hallucinations (verified false, not fixed)

### Round 4 F-004 — Heuristic-regex closing class contains `'`

- **Round:** 4
- **Source:** MMR / gemini
- **Severity:** P2 (claimed)
- **Location:** spec §4.3, line 836 of pre-fix file
- **Claim:** "The HEURISTIC_PATTERNS regex closing character class
  `[\"'.]` includes a single quote (`'`) and truncates `agent's eval`
  to `agent`."
- **Verification:** `sed -n '892p'` against the file showed the actual
  closing class was `[\"`.]` (double-quote, backtick, period). Gemini
  misread the backtick as a single quote. The single-quote-removal fix
  had already been applied in round 3 and was correct.

## Deferred P3 findings

### `as never` TypeScript anti-pattern in validator

- **Rounds surfaced:** 2, 3, 4 (gemini, every round)
- **Severity:** P3
- **Sources:** gemini (unique)
- **Location:** spec §1.3, validator switch case
  `VALID_GAP_SOURCES.includes(filteredPayload.source as never)`
- **Description:** Casting to `as never` to bypass `Array.prototype.includes`
  strict-typing on `unknown` is a code-smell that's already widespread
  in the existing event-schemas.ts (see `VALID_OUTCOMES.includes(... as never)`
  patterns at the same level). It works correctly at runtime but
  represents weak type discipline.
- **Suggestion:** Use a properly-typed type guard
  (`(VALID_GAP_SOURCES as readonly string[]).includes(source as string)`)
  or define a `Set<typeof VALID_GAP_SOURCES[number]>` with a
  type-predicate function. Cross-cutting style decision: applies to all
  enum-check sites in event-schemas.ts, not just the new one.
- **Defer rationale:** The new code follows the existing pattern in
  event-schemas.ts exactly — fixing only the new occurrence would
  introduce inconsistency, and fixing all sites is a separate refactor
  out of Phase 3 scope. Phase 4 or a follow-up TS-hardening pass is
  the right venue.

## Where the P2 fixes landed

All P2 findings raised in rounds 1–5 were fixed in the same round they
surfaced. See commit messages on this branch (`git log
feat/knowledge-freshness-phase-3 --oneline`) for the line-by-line
record:

- a0c6ab2 — round 1 fixes
- 38de612 — round 2 fixes (over-corrections from round 1)
- b836cea — round 3 fixes (shape/contract bugs)
- 6334c2e — round 4 fixes (regex escape + var-scope + wording)
- 2b6b812 — round 5 fixes (normalizeTopic validator-compat + TimedSignal + heuristic terminators + distinct_project_count)
