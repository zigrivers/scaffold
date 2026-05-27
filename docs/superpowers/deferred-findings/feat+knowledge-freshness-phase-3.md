# Deferred Findings — feat/knowledge-freshness-phase-3

Phase 3 (gap-detection) review loops. Per the execution rule on this
branch, rounds 1–5 fix every P2-or-above finding; rounds 6+ fix only
P0/P1 and defer P2/P3 here. Revisit during T1–T5 implementation or in
a Phase 4 hardening pass.

## Plan review loop summary (rounds 1–5)

| Round | MMR verdict | MMR findings | Grok findings | Notes |
|---|---|---|---|---|
| 1 | blocked | 10 (5 P1, 5 P2, 1 P3) | 7 (1 P0-halluc, 2 P2, 4 P3) | 1 grok hallucination (LensFn arity) |
| 2 | blocked | 6 (2 P1, 4 P2) | 6 (3 P1, 3 P2) | 11 distinct fixes after dedup |
| 3 | blocked | 3 (1 P1, 2 P2) | 1 P1 (over-correction) + 1 P2 (style) | Codex-only MMR; grok caught observe.test.ts pattern mismatch |
| 4 | blocked | 2 (1 P1, 1 P2) | 1 P1 (hallucination — wrong dir search) | engine.test.ts lifecycle imports + scanner topic validity |
| 5 | **degraded-pass** | **0** | 1 P2 (hallucination — bare-engine.test.ts misread) | Plan stop conditions met |

Total plan P0/P1/P2 fixes: ~31 across 4 review rounds. Hallucinations: 3
(grok F-001 r1 LensFn arity claim verified false via `npm run type-check`;
grok r4 wrong-dir search verified false via `ls src/observability/checks/`;
grok r5 misread bare `engine.test.ts` refs as missing prefix).

## Spec review loop summary

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

## PR review (PR #397)

### F-001 (PR round 1) — Lens I doesn't suppress findings for already-covered topics (P1 → reclassified P2, deferred)

- **Round:** PR review round 1
- **MMR job_id:** mmr-d476a1257fa7
- **Severity claimed:** P1 (codex)
- **Reclassified:** P2 (UX enhancement, not correctness bug)
- **Sources:** codex (unique)
- **Location:** `src/observability/checks/lens-i-knowledge-gaps.ts:98`
- **Description:** Lens I never checks whether the reported topic is
  already covered by an existing knowledge entry, so once a topic
  crosses the threshold it will continue emitting a gap finding for up
  to 90 days even after `content/knowledge/<category>/<topic>.md` is
  added.
- **Why deferred:** The fix codex suggested (filesystem glob check for
  `content/knowledge/**/<topic>.md`) is not trivially implementable in
  Phase 3 because Lens I runs in a *downstream project's* `context.cwd`,
  not the scaffold install root. The downstream project does not have
  `content/knowledge/` — that directory lives in the scaffold install
  the downstream was generated from. Adding an existing-entry check
  requires designing how the knowledge-base index is distributed across
  the scaffold-install / downstream boundary, which is properly Phase 4
  scope. The 90-day window provides eventual self-clearance: signals
  decay out of scope, the topic stops being emitted from the freshly-
  populated KB, and the finding disappears in ≤90 days. Operators can
  also use `scaffold observe ack <finding-id>` to silence the finding
  immediately.
- **Suggested Phase 4 design**: add a `--knowledge-root <path>` flag to
  `scaffold observe audit` (defaults to the scaffold install's
  `content/knowledge/` via `findScaffoldInstall()` or similar), thread
  it through to Lens I via `context`, and skip buckets where
  `${knowledgeRoot}/**/${topic}.md` exists. Update the operations doc
  to reflect the new immediate-closure behavior once this lands.
