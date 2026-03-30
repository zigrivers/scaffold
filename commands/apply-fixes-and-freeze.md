---
description: "Apply validation findings and freeze documentation"
long-description: "Applies all findings from the validation phase, fixes blocking issues, and freezes every document with a version marker — signaling that specs are implementation-ready."
---

## Purpose
Review all validation phase findings, create a prioritized fix plan, apply fixes
to the relevant documents, and mark the documentation as frozen (ready for
implementation). After this step, documents should not change unless a specific
issue is discovered during implementation.

## Inputs
- docs/validation/*.md (required) — all validation findings
- All phase output artifacts (to apply fixes to)

## Expected Outputs
- docs/validation/fix-log.md — log of all fixes applied
- Updated phase artifacts with fixes applied
- Freeze marker added to each document (tracking comment)

## Quality Criteria
- (mvp) All P0 and P1 validation findings resolved: fixed in source document or explicitly deferred with documented rationale
- (deep) P2 findings fixed in source document or explicitly deferred with documented rationale
- (mvp) Fix log documents what changed and why
- (deep) Cross-phase-consistency validation re-run after fixes yields no new P0 or P1 findings
- (mvp) Every frozen document contains a tracking comment matching `<!-- scaffold:step-name vN YYYY-MM-DD -->`

## Methodology Scaling
- **deep**: All findings addressed. Full fix log. Final consistency check.
- **mvp**: P0 findings only. Brief fix log.
- **custom:depth(1-5)**: Depth 1: address P0 findings only with minimal fix log. Depth 2: address P0 findings with brief fix log and freeze markers on updated documents. Depth 3: address P0-P1 findings with detailed fix log and deferred rationale. Depth 4: address P0-P2 with full deferred rationale and re-validation passes. Depth 5: all findings addressed, final consistency re-check, and freeze verification audit.

## Mode Detection
Check if `docs/validation/fix-log.md` already exists.
- If exists: UPDATE MODE — read existing fix log, identify newly introduced validation findings, apply incremental fixes, preserve previously applied fixes and their verification status.
- If not: FRESH MODE — apply all validation findings from scratch.

## Update Mode Specifics

- **Detect**: `docs/validation/fix-log.md` exists with tracking comment
- **Preserve**: Previous fix decisions, deferred rationale, freeze markers on already-frozen documents
- **Triggers**: New validation findings since last freeze, documents modified after freeze
- **Conflict resolution**: Re-frozen documents with new changes require updated freeze markers and fix-log entries

---

## Domain Knowledge

### apply-fixes-and-freeze

*Guidance on prioritizing validation fixes, applying them safely, and freezing documentation for implementation*

# Apply Fixes and Freeze

The apply-fixes-and-freeze step is the last gate before implementation begins. Its purpose is to resolve all actionable validation findings, verify the fixes don't introduce new issues, and mark the documentation as frozen. After this step, documents change only if implementation reveals a genuine gap.

## Summary

- **Fix prioritization**: P0 (blocking, must fix), P1 (significant gap, should fix), P2 (improvement, defer with rationale). Decision rule: would an agent produce incorrect code? (P0), have to guess? (P1), neither? (P2).
- **Fix process**: Build fix plan (deduplicate, group by document, order by priority), apply minimal targeted fixes, re-validate affected checks, loop until zero new findings.
- **Fix execution rules**: One finding per commit, fix forward not around, preserve document structure, cross-document fixes must be atomic.
- **Re-validation**: Re-run the specific validation passes that flagged each fix. Spot-check adjacent sections. Verify counts and cross-references. Grep for old terms after renames.
- **Documentation freeze**: All P0 and P1 resolved, re-validation clean. Add `<!-- FROZEN -->` marker to each artifact. No further content changes unless implementation reveals a genuine gap.
- **Post-freeze rules**: Typo fixes allowed. Implementation-discovered gaps go through P0/P1 prioritization. No scope additions. No "nice to have" improvements.
- **Common pitfalls**: Fixing symptoms instead of root causes, introducing new inconsistencies, over-fixing beyond implementation readiness, skipping re-validation, premature freeze.

## Deep Guidance

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

### Categorization Methodology

When collecting findings from multiple validation reports, assign each finding to exactly one category using these decision rules:

1. **Would an agent produce incorrect code if this is not fixed?** -> P0
2. **Would an agent have to guess or make assumptions?** -> P1
3. **Is the issue real but unlikely to affect implementation correctness?** -> P2

When a finding spans multiple categories (e.g., a stale count that is also ambiguous), assign it to the highest applicable priority. Do not duplicate findings across priority levels.

## Fix Application Process

### Step 1: Build the Fix Plan

1. Collect all findings from validation phase outputs (cross-phase-consistency, traceability-matrix, decision-completeness, critical-path-walkthrough, implementability-dry-run, dependency-graph-validation, scope-creep-check).
2. Deduplicate — the same root cause often appears in multiple validation reports. When a single root cause appears in 3+ reports, mark it as a **systemic issue** and track it separately.
3. Group by affected document — batch fixes to minimize file churn.
4. Order by priority (P0 first), then by document (reduce context switching).
5. Estimate impact radius for each fix — how many other documents does this fix touch?

#### Fix Plan Output Format

The fix plan is a working document that guides fix execution. Structure it as follows:

```markdown
## Fix Plan

### Systemic Issues (multi-document root causes)
| ID | Root Cause | Affected Documents | Priority | Est. Impact |
|----|------------|-------------------|----------|-------------|
| SYS-1 | Pipeline expanded from 32→36 steps, counts not propagated | architecture, state-schema, cli-contract, 12 others | P0 | 15 files |

### Individual Fixes
| ID | Finding Source | Finding | Priority | Target Document | Dependencies |
|----|--------------|---------|----------|-----------------|--------------|
| FIX-1 | CPC-007 | Terminology drift: "prompts" vs "steps" | P0 | state-json-schema.md | FIX-2 |
| FIX-2 | CPC-007 | Terminology drift: "prompts" vs "steps" | P0 | cli-contract.md | — |
```

### Step 2: Apply Fixes

For each fix:
1. Read the finding and the affected document section.
2. Make the minimal change that resolves the finding. Do not refactor, improve prose, or add features — fix only what the finding identifies.
3. Check whether the fix affects other documents (e.g., changing a field name in the schema requires updating API contracts and state documentation). Use project-wide search to find all references before changing any term.
4. Log the fix in `docs/validation/fix-log.md` with: finding ID, affected files, what changed, why.
5. For systemic issues, fix the source of truth first, then sweep all downstream references in a single pass.

#### Fix Execution Rules

- **One finding per commit** (or one systemic issue per commit). This makes rollback possible if a fix introduces a regression.
- **Fix forward, not around.** If a finding reveals a design mistake, fix the design — do not patch the symptom.
- **Preserve document structure.** Fixes should not reorganize sections, add new headings, or change formatting conventions. Content changes only.
- **Cross-document fixes must be atomic.** If a terminology change spans 5 files, update all 5 in the same commit. A half-applied rename is worse than the original inconsistency.

### Step 3: Re-validation

After all fixes are applied, re-validate to confirm fixes resolved the findings without introducing new issues:

1. **Re-run affected validation checks.** For each fix, identify which validation pass originally flagged it and re-run that specific check against the modified document(s). At minimum, re-run:
   - Cross-phase consistency checks on all modified documents
   - Traceability link resolution (no broken references introduced by renames)
   - Scope-creep check (fixes did not add new requirements)
2. **Spot-check adjacent sections.** When a fix modifies a section, read the surrounding sections in the same document to verify internal consistency was not broken.
3. **Verify counts and cross-references.** Any fix that changes a quantity (step count, story count, task count) requires verifying every other document that cites that quantity.
4. **Regression test systemic fixes.** For systemic issues that touched many files, grep for the old term/value across the entire docs directory to confirm no instances were missed.
5. **If re-validation finds new issues**, treat them as P0 findings and loop back to Step 2. The fix→revalidate cycle continues until re-validation produces zero new findings.

#### Re-validation Output

Record re-validation results alongside the fix log:

```markdown
## Re-validation Results

| Fix ID | Re-validation Check | Result | Notes |
|--------|-------------------|--------|-------|
| FIX-1 | CPC re-run | PASS | All "step" references consistent |
| FIX-3 | Traceability links | FAIL | New broken ref in tasks.md line 47 |
```

## Documentation Freeze

Once all P0 and P1 findings are resolved and re-validation produces zero new findings:

1. Add a freeze marker (tracking comment) to each phase artifact indicating the document is implementation-ready.
2. Record the freeze timestamp and the validation findings that were addressed.
3. P2 deferrals are logged in the fix log with rationale — these become backlog items for post-implementation polish.

### Freeze Criteria Checklist

Before declaring freeze, verify all of the following:

- [ ] All P0 findings resolved and re-validated
- [ ] All P1 findings resolved (or explicitly risk-accepted with documented rationale)
- [ ] Re-validation produced zero new findings on the final pass
- [ ] Fix log is complete with all changes documented
- [ ] P2 deferrals are logged with rationale
- [ ] Cross-document counts are internally consistent (final count sweep)
- [ ] All traceability links resolve (no dangling references)
- [ ] Terminology is consistent across all documents (final terminology sweep)

### What Freeze Means

- **No further content changes** unless implementation reveals a genuine gap (not a preference).
- **Formatting and typo fixes** are allowed — they don't affect implementation.
- **If a gap is found during implementation**, the fix goes through the same prioritization process: update the document, log the change, re-verify consistency.
- **Freeze does NOT mean the documents are perfect.** P2 deferrals exist. The standard is implementation readiness — an implementing agent can produce correct code from these documents without guessing.

### What Is Allowed After Freeze

| Change Type | Allowed? | Process |
|------------|----------|---------|
| Typo fixes, formatting | Yes | Direct edit, no re-validation needed |
| Gap discovered during implementation | Yes | Prioritize as P0/P1, apply fix, re-validate affected section, log in fix log |
| "Nice to have" improvements | No | Log as P2 deferral for post-implementation |
| Scope additions | No | Out of scope — must go through PRD amendment process |
| Terminology alignment (missed in freeze) | Yes | Treat as P0 fix, apply and re-validate |

### Freeze Marker Format

Add the following marker to the top of each frozen document, immediately after the frontmatter:

```markdown
<!-- FROZEN: Implementation-ready as of YYYY-MM-DD. Changes require fix-log entry. -->
```

### Frozen Artifact Set

The complete set of frozen artifacts should be documented in the fix log as a manifest:

```markdown
## Frozen Artifact Manifest

| Document | Freeze Date | P0 Fixes | P1 Fixes | P2 Deferred |
|----------|------------|----------|----------|-------------|
| docs/plan.md | 2025-01-15 | 0 | 2 | 1 |
| docs/system-architecture.md | 2025-01-15 | 3 | 4 | 2 |
| docs/api-contracts.md | 2025-01-15 | 1 | 1 | 0 |
| docs/database-schema.md | 2025-01-15 | 2 | 3 | 1 |
| ... | ... | ... | ... | ... |
```

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

## The Fix-Revalidate-Freeze Cycle

The full process follows a strict cycle:

```
Collect findings
    │
    ▼
Build fix plan (categorize, prioritize, estimate impact)
    │
    ▼
┌─> Apply fixes (one finding or systemic issue per commit)
│       │
│       ▼
│   Re-validate (re-run affected checks, spot-check adjacent sections)
│       │
│       ▼
│   New findings? ──Yes──┐
│       │                │
│       No               │
│       │                │
│       ▼                │
│   Freeze criteria met? │
│       │                │
│       No               │
│       │                │
└───────┘ ◄──────────────┘
        │
        Yes
        │
        ▼
   Declare freeze (add markers, create manifest, log deferrals)
```

Each iteration through the cycle should produce strictly fewer findings than the previous iteration. If the count of findings is not decreasing, stop and investigate — you may be fixing symptoms while the root cause persists.

## Common Pitfalls

1. **Fixing symptoms instead of root causes.** If the same stale count appears in 15 files, the root cause is a single pipeline change that wasn't propagated. Fix the source and sweep all references. A good diagnostic: if your fix plan has 10+ individual fixes that all trace to the same upstream change, consolidate them into one systemic fix.

2. **Introducing new inconsistencies.** Renaming a field in one document but missing it in another. Always search for all references before changing a term. Run a project-wide grep for the old term after every rename.

3. **Over-fixing.** The goal is implementation readiness, not perfection. If a P2 finding doesn't affect an implementing agent's ability to produce correct code, defer it. A common trap: improving prose clarity during the fix phase. This is not fixing — it is editing, and it risks introducing new inconsistencies.

4. **Skipping re-validation.** A fix that breaks a cross-reference is worse than the original finding. Always re-validate after applying fixes. The most dangerous fixes are the ones that "obviously" don't need re-validation — those are the ones that introduce silent regressions.

5. **Premature freeze.** Declaring freeze before all P0 and P1 findings are resolved because of time pressure. A premature freeze sends agents into implementation with known issues, guaranteeing rework. If time is short, reduce scope (defer entire features) rather than freezing with known P0 issues.

6. **Scope creep during the fix phase.** A finding says "the error format is unspecified" and the fix adds a complete error taxonomy, error codes, error localization strategy, and retry semantics. The fix should specify the minimum error format needed for implementation. Everything else is new scope.

7. **Infinite fix loops.** Each fix introduces a new finding, which requires another fix, which introduces another finding. This happens when fixes are too broad (changing things beyond what the finding requires) or when the underlying documents have systemic structural problems. Break the loop by: (a) making smaller, more targeted fixes, or (b) stepping back to identify the structural issue and fixing that instead.

8. **Incomplete fix log.** Applying fixes without logging them. The fix log is not bureaucracy — it is the audit trail that proves the freeze is valid. If an implementation agent later questions a design choice, the fix log explains why the document says what it says.

---

## After This Step

Continue with: `/scaffold:developer-onboarding-guide`
