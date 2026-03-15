---
name: apply-fixes-and-freeze
description: Guidance on prioritizing validation fixes, applying them safely, and freezing documentation for implementation
topics: [finalization, fixes, freeze, validation, documentation-quality]
---

# Apply Fixes and Freeze

The apply-fixes-and-freeze step is the last gate before implementation begins. Its purpose is to resolve all actionable validation findings, verify the fixes don't introduce new issues, and mark the documentation as frozen. After this step, documents change only if implementation reveals a genuine gap.

## Fix Prioritization

Validation phases produce findings at three priority levels. Address them in strict order:

### P0 — Blocking

Cross-document inconsistencies, broken traceability links, missing requirements, dependency cycles, and any finding that would cause an implementing agent to produce incorrect output. P0 findings must all be resolved before proceeding.

**Examples**: Stale counts that contradict the pipeline definition, terminology drift between schemas and API contracts, missing domain model references in architecture, broken cross-references between ADRs.

### P1 — Important

Ambiguity, underspecified error handling, vague acceptance criteria, and findings that would force an implementing agent to guess. P1 findings should be resolved unless the fix introduces more risk than the ambiguity.

**Examples**: Missing error response formats, unspecified concurrency behavior, vague NFR targets, incomplete state transition definitions.

### P2 — Deferred

Minor polish, documentation gaps that don't affect implementation correctness, and findings that are real but low-impact. P2 findings are logged with rationale for deferral.

**Examples**: Missing UX specs for secondary flows, incomplete examples in knowledge base entries, editorial inconsistencies in prose.

## Fix Application Process

### Step 1: Build the Fix Plan

1. Collect all findings from validation phase outputs (cross-phase-consistency, traceability-matrix, decision-completeness, critical-path-walkthrough, implementability-dry-run, dependency-graph-validation, scope-creep-check).
2. Deduplicate — the same root cause often appears in multiple validation reports.
3. Group by affected document — batch fixes to minimize file churn.
4. Order by priority (P0 first), then by document (reduce context switching).

### Step 2: Apply Fixes

For each fix:
1. Read the finding and the affected document section.
2. Make the minimal change that resolves the finding.
3. Check whether the fix affects other documents (e.g., changing a field name in the schema requires updating API contracts and state documentation).
4. Log the fix in `docs/validation/fix-log.md` with: finding ID, affected files, what changed, why.

### Step 3: Verify No Regressions

After all fixes are applied:
1. Re-run cross-phase consistency checks on modified documents.
2. Verify traceability links still resolve (no broken references introduced by renames).
3. Spot-check that counts, terminology, and cross-references are internally consistent.
4. If a fix introduced a new issue, treat it as a P0 and resolve before proceeding.

## Documentation Freeze

Once all P0 and P1 findings are resolved:

1. Add a freeze marker (tracking comment) to each phase artifact indicating the document is implementation-ready.
2. Record the freeze timestamp and the validation findings that were addressed.
3. P2 deferrals are logged in the fix log with rationale — these become backlog items for post-implementation polish.

### What Freeze Means

- **No further content changes** unless implementation reveals a genuine gap (not a preference).
- **Formatting and typo fixes** are allowed — they don't affect implementation.
- **If a gap is found during implementation**, the fix goes through the same prioritization process: update the document, log the change, re-verify consistency.

## Fix Log Format

```markdown
## Fix Log

| # | Finding | Priority | Files Changed | What Changed | Why |
|---|---------|----------|---------------|--------------|-----|
| 1 | TM-003: Stale step count in architecture | P0 | system-architecture.md | "32 steps" → "36 steps" | Pipeline expanded with user stories phase |
| 2 | CPC-007: Terminology drift in state schema | P0 | state-json-schema.md, cli-contract.md | "prompts" → "steps" | PRD canonical term is "step" |

### Deferred (P2)
| # | Finding | Rationale |
|---|---------|-----------|
| 1 | IR-012: Missing adopt-flow UX spec | Low implementation impact; adopt is secondary flow |
```

## Common Pitfalls

1. **Fixing symptoms instead of root causes.** If the same stale count appears in 15 files, the root cause is a single pipeline change that wasn't propagated. Fix the source and sweep all references.
2. **Introducing new inconsistencies.** Renaming a field in one document but missing it in another. Always search for all references before changing a term.
3. **Over-fixing.** The goal is implementation readiness, not perfection. If a P2 finding doesn't affect an implementing agent's ability to produce correct code, defer it.
4. **Skipping verification.** A fix that breaks a cross-reference is worse than the original finding. Always re-verify after applying fixes.
