# MMR `fix_threshold` Configuration Design

**Date:** 2026-04-28
**Status:** Approved for implementation planning
**Owner:** Ken Allred

## Problem

Scaffold's review wrappers (`scaffold run review-pr`, `review-code`, `post-implementation-review`) and `CLAUDE.md`'s "Mandatory Code Review" section hardcode the literal phrase `P0/P1/P2` ~25 times. In reality, the appropriate fix threshold varies by project: a prototype or doc-only PR may only warrant blocking on P0/P1, while a security-sensitive change may warrant blocking on P0–P3.

MMR already exposes `fix_threshold` as a first-class field with full config layering (built-in default → `~/.mmr/config.yaml` → `.mmr.yaml` → CLI override) and a working `--fix-threshold` flag. The verdict JSON exposes `fix_threshold` and the gate (`evaluateGate`) already blocks correctly. The gap is doc/prompt drift, not missing capability.

## Goals

1. Eliminate hardcoded `P0/P1/P2` from agent-facing docs; have the agent read `fix_threshold` from the verdict JSON.
2. Give callers a per-invocation override path through scaffold's meta-prompt wrappers.
3. Make the configured threshold and its consequence (advisory findings) visible in verdict copy.
4. Ensure new scaffold projects can pin a threshold cleanly without scaffold owning MMR's config format.
5. Don't change behavior for existing projects; `P2` remains the default.

## Non-Goals

- Adding named modes (`--mode quick|standard|strict`). Raw `--fix-threshold P0|P1|P2|P3` is sufficient.
- Per-category thresholds (e.g., `security: P0, style: P2`).
- Changing the global default away from `P2`.
- Scaffold writing or owning `.mmr.yaml` directly. Scaffold delegates to `mmr config init`.

## Context

### Current state of `fix_threshold` in MMR

- `packages/mmr/src/config/schema.ts` — `fix_threshold: Severity.default('P2')` (P0–P3 enum).
- `packages/mmr/src/config/defaults.ts` — built-in default `'P2'`.
- `packages/mmr/src/config/loader.ts` — four-layer merge: built-in → user → project → CLI override.
- `packages/mmr/src/commands/review.ts` — accepts `--fix-threshold P0|P1|P2|P3` and passes through to job.
- `packages/mmr/src/core/reconciler.ts` — `evaluateGate` and `deriveVerdict` correctly gate on threshold.
- `packages/mmr/src/core/results-pipeline.ts` — emits `fix_threshold` in result JSON; below-threshold findings are retained in the reconciled list (advisory behavior is already de facto, just unlabeled).
- `packages/mmr/src/formatters/{text,markdown}.ts` — already render `Threshold: P2` in formatted output.
- `packages/mmr/src/commands/config.ts` — `mmr config init` writes `fix_threshold: 'P2'` into a fresh `.mmr.yaml`.

### How scaffold invokes MMR

`scaffold run` (`src/cli/commands/run.ts`) is an **assembler**, not a dispatcher. It:
1. Loads a meta-prompt from `content/tools/<name>.md`.
2. Assembles a final prompt with knowledge entries + artifacts + decisions + `$ARGUMENTS`.
3. Writes the assembled prompt to stdout for the AI agent to execute.

The agent reads the assembled prompt and runs `mmr review` itself via Bash. Therefore wrapper passthrough for `--fix-threshold` is a **content-only** change to the meta-prompts; no scaffold TypeScript code needs to know about MMR's flag.

`scaffold init` does not write `.mmr.yaml`. Users currently run `mmr config init` themselves.

## Design

### 1. MMR CLI: surface advisory count in verdict output

Add an `advisory_count` field to the result JSON: integer count of reconciled findings whose severity is strictly below `fix_threshold`. When non-zero, include it in formatted verdict copy.

**Field placement (top-level of result JSON, sibling to `fix_threshold` and `verdict`):**

```json
{
  "verdict": "pass",
  "fix_threshold": "P2",
  "advisory_count": 3,
  "findings": [...]
}
```

**Formatted output:**
- Text: `pass (threshold=P2; 3 advisory)` when `advisory_count > 0`; `pass (threshold=P2)` otherwise.
- Markdown: parallel.
- JSON: field is always present (zero when none below threshold), so consumers don't have to handle absence.

This makes the threshold choice and its consequence visible in every review output. A project running at `P1` with two unfixed `P2` findings will show `pass (threshold=P1; 2 advisory)` — impossible to ignore that real findings exist.

### 2. Wrapper meta-prompt passthrough (doc-only)

Each of the three tool meta-prompts gets two changes:

**Frontmatter** — extend `argument-hint`:
- `review-pr.md`: `"<PR# or blank> [--fix-threshold P0|P1|P2|P3]"`
- `review-code.md`: `"[--base <ref>] [--head <ref>] [--staged] [--report-only] [--fix-threshold P0|P1|P2|P3]"`
- `post-implementation-review.md`: `"[--report-only] [--fix-threshold P0|P1|P2|P3]"`

**Body** — add `$ARGUMENTS` parsing, mirroring how `--report-only` and `--staged` are already parsed:

```bash
FIX_THRESHOLD=""
if [[ "$ARGUMENTS" =~ --fix-threshold[[:space:]]+(P[0-3]) ]]; then
  FIX_THRESHOLD="${BASH_REMATCH[1]}"
fi
```

Then forward to the `mmr review` invocation:

```bash
MMR_FLAGS="--pr $PR_NUMBER --sync --format json"
[ -n "$FIX_THRESHOLD" ] && MMR_FLAGS="$MMR_FLAGS --fix-threshold $FIX_THRESHOLD"
mmr review $MMR_FLAGS
```

For `post-implementation-review.md`, threshold gates the **fix queue** language and feeds into the optional `mmr reconcile` step when an MMR job exists. This tool builds its own multi-phase review independent of `mmr review`, so the threshold's primary effect is on what enters the fix queue.

When `--fix-threshold` is absent from `$ARGUMENTS`, behavior is unchanged: MMR uses `.mmr.yaml` or its built-in default.

### 3. Doc dynamicization

Stop hardcoding `P0/P1/P2` in agent-facing docs. Replace with "findings at or above `fix_threshold`" and instruct the agent to read the value from `results.fix_threshold` in the verdict JSON.

Files (exhaustive list, from grep):

- `CLAUDE.md` — "Mandatory Code Review" section. Specifically:
  - Replace "Fix all P0/P1/P2 findings before proceeding to the next task" with "Fix all findings at or above the configured `fix_threshold` (read from `results.fix_threshold` in the verdict JSON; default `P2`)".
  - Replace "the *same* P0/P1/P2 finding" in the 3-round-limit rule with "the *same* blocking finding (severity at or above `fix_threshold`)".
- `content/tools/review-pr.md` — Step 7 ("Fix P0/P1/P2 Findings") title + body, Step 6a verdict descriptions, Process Rules 5 + 6, the after-step messaging.
- `content/tools/review-code.md` — Step 5 review prompt template (drop "Report only P0, P1, and P2 issues" and replace with "Report all P0–P3 findings"), Step 6 reconciliation table, Step 7 fix loop, Step 8 verdict copy, Process Rules 5.
- `content/tools/post-implementation-review.md` — Step 8 fix queue language (currently "P0, P1, and P2 findings enter the fix queue"; change to "findings at or above `fix_threshold` enter the fix queue"), Step 9 commit message templates, Step 10 summary, Process Rules 6.
- `content/pipeline/build/{single,multi}-agent-{start,resume}.md` (4 files) — replace the "Fix any P0/P1/P2 findings before proceeding" boilerplate (~8 occurrences) with "Fix any findings at or above `fix_threshold`".
- `content/pipeline/environment/automated-pr-review.md` — the `PostToolUse` hook reminder string. Replace the inline "Fix all P0/P1/P2 findings" with "Fix all findings at or above `fix_threshold`".
- `content/skills/mmr/SKILL.md` — verify the existing `--fix-threshold` examples still match; add a sentence describing `advisory_count` in the verdict output.

**Critical fix that's easy to miss:** `content/tools/review-code.md:316` ("Report only P0, P1, and P2 issues") is the prompt template channels actually see. Without changing this to "Report all P0–P3 findings," raising the threshold to `P3` would not surface anything new from any channel.

**What stays:** Severity-tier definitions in prompts (e.g., "P0: critical security issues; P1: significant bugs; P2: …") are educational, not threshold-related, and stay as-is.

### 4. `mmr config init` template — explicit value with explanatory comment

`packages/mmr/src/commands/config.ts` — replace `yaml.dump(...)` with a hand-written template string. Keep `fix_threshold: 'P2'` as the explicit value but add a comment block above it:

```yaml
defaults:
  # fix_threshold: minimum severity that blocks the review verdict.
  # Findings below this severity are kept in the result as advisory but
  # don't cause `blocked`. Choose based on project risk profile:
  #   P0 — block only on critical (security, data loss, broken functionality)
  #   P1 — block on critical + significant bugs                 [low friction]
  #   P2 — block on critical + significant + suggestions        [DEFAULT]
  #   P3 — block on everything down to nits                     [strict]
  fix_threshold: P2
```

Explicit value (rather than relying on the Zod default) means future MMR default shifts don't silently change behavior for existing projects.

### 5. Scaffold delegation, not direct ownership

Scaffold does not write `.mmr.yaml`. The cleanest pattern is delegation: scaffold invokes `mmr config init` when appropriate.

**Where:** `content/pipeline/environment/automated-pr-review.md` is the right home — it's the pipeline step where review tooling becomes relevant. Add a setup-time check + nudge:

> If `.mmr.yaml` does not exist and `mmr` is on PATH, run `mmr config init` to create one with the recommended defaults. If `mmr` is not installed, install it first (see `mmr` installation docs); review channels will degrade without it.

This is informational guidance the agent surfaces during pipeline execution. Scaffold does not run `mmr config init` programmatically — that crosses into MMR's territory. The agent decides.

**No `scaffold init` change.** No new TypeScript. No template files in scaffold. MMR remains the single owner of `.mmr.yaml`'s shape.

### 6. Tests

**MMR (`packages/mmr/tests/`):**
- New unit test for `results-pipeline.ts`: 1 P0 + 2 P3 + threshold P2 → verdict `blocked`, `advisory_count: 2`. Fix the P0 → verdict `pass`, `advisory_count: 2` (P3s remain advisory).
- New CLI integration test: `mmr review --diff <fixture> --fix-threshold P1 --sync --format json` produces JSON with `fix_threshold: "P1"` and the expected advisory count.
- Formatter tests: text/markdown output includes "(N advisory)" when `advisory_count > 0` and omits the parenthetical when zero.

**Scaffold (`tests/*.bats`):**
- Regression guard: a bats test greps `content/` and `CLAUDE.md` for the literal string `P0/P1/P2` and fails if any occurrences remain outside an explicit allowlist (severity-tier definition tables, historical CHANGELOG entries). The allowlist lives in the test file.

### 7. CHANGELOG

Two entries:
- **`packages/mmr/CHANGELOG.md`** (or whichever path mmr's release notes live at) — `advisory_count` field in result JSON; verdict copy now shows advisory count when non-zero; `mmr config init` template now has explanatory comment.
- **Scaffold `CHANGELOG.md`** — wrappers accept and forward `--fix-threshold P0|P1|P2|P3`; agent-facing docs no longer hardcode P0/P1/P2 thresholds and instead read from `fix_threshold` in the verdict JSON.

## Migration & Backwards Compatibility

- Existing projects with no `defaults.fix_threshold` in `.mmr.yaml` continue to receive the Zod default `P2`. Behavior unchanged.
- Existing projects with `.mmr.yaml` written by older `mmr config init` are unaffected; the comment block is purely additive for new files.
- Doc dynamicization is semantically equivalent at the default threshold (`P2`): "Fix all P0/P1/P2 findings" and "Fix all findings at or above `fix_threshold` (default `P2`)" describe the same set of findings. No behavior change for projects that don't change their threshold.
- `--fix-threshold` flag pre-exists in MMR; its passthrough through scaffold wrappers is purely additive.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| A project lowers threshold to `P1` and a real `P2` security finding ships unblocked. | Verdict copy shows "(N advisory)"; `advisory_count` field in JSON; documentation explicitly frames `P1` as "low friction" so the choice is conscious. |
| Doc dynamicization breaks an agent that pattern-matched on the literal "P0/P1/P2". | Bats regression guard catches accidental re-introduction; explicit migration sentence in CHANGELOG. |
| Channel returns only P0–P2 because of leftover prompt language even after threshold raised to P3. | Step 3 explicitly fixes `review-code.md:316` and similar prompt-template language. Validate by raising threshold to P3 in a manual smoke test and confirming P3 findings appear. |
| Future MMR default change silently shifts existing projects. | `mmr config init` writes the value explicitly, not relying on Zod default. |

## Files Touched (summary)

**MMR (`packages/mmr/`):**
- `src/core/results-pipeline.ts` — emit `advisory_count`.
- `src/types.ts` — add `advisory_count` to result type.
- `src/formatters/text.ts`, `src/formatters/markdown.ts` — render advisory count.
- `src/commands/config.ts` — hand-written `.mmr.yaml` template with comment block.
- `tests/` (new test cases as described above).

**Scaffold content:**
- `CLAUDE.md` (Mandatory Code Review section).
- `content/tools/review-pr.md`, `content/tools/review-code.md`, `content/tools/post-implementation-review.md`.
- `content/pipeline/build/single-agent-start.md`, `single-agent-resume.md`, `multi-agent-start.md`, `multi-agent-resume.md`.
- `content/pipeline/environment/automated-pr-review.md`.
- `content/skills/mmr/SKILL.md`.

**Scaffold tests:**
- New bats regression guard against literal `P0/P1/P2` strings.

**Changelogs:**
- `packages/mmr/CHANGELOG.md` (or equivalent).
- `CHANGELOG.md` (scaffold root).

## Open Questions (none blocking)

None. Both pre-implementation questions resolved during brainstorm:
1. Scaffold-side `.mmr.yaml` writer: **delegated init** (scaffold calls `mmr config init`; doesn't write the file).
2. New field name: **`advisory_count`**.

## Implementation Ordering

1. MMR CLI: `advisory_count` plumbing + formatters + tests.
2. `mmr config init` template improvement + test.
3. Meta-prompt argument passthrough (`review-pr.md`, `review-code.md`, `post-implementation-review.md`).
4. Doc dynamicization (CLAUDE.md + remaining content/ files).
5. Bats regression guard.
6. CHANGELOG entries.

Each step is independently testable. Step 1 lands in MMR and can release independently. Steps 2–6 are scaffold-side and can release together.
