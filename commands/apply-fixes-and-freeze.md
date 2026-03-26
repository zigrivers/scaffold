---
description: "Apply validation fixes and freeze documentation"
long-description: "Reviews all validation phase findings, applies prioritized fixes to affected documents, re-validates, and freezes all artifacts as implementation-ready."
---

Apply all validation phase findings as prioritized fixes, re-validate the results, and freeze every documentation artifact for implementation. After freeze, only typo fixes and implementation-gap discoveries are allowed.

## Mode Detection

Before starting, check if `docs/validation/fix-log.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing fix log completely. Check for a tracking comment on line 1: `<!-- scaffold:apply-fixes-and-freeze v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Check freeze state**: Look for `<!-- FROZEN: ... -->` markers in phase artifacts. If documents are already frozen, report the current freeze state and ask whether to re-run validation and apply new fixes.
3. **Diff against current state**: Compare existing fix log entries against current validation findings. Categorize:
   - **ADD** — New findings not yet addressed
   - **RESOLVED** — Previously logged fixes that are still valid
   - **STALE** — Logged fixes whose source findings no longer exist
4. **Preview changes**: Present the user a summary table of new fixes needed. Wait for approval before proceeding.
5. **Execute update**: Apply new fixes following the process below. Update tracking comment.
6. **Post-update summary**: Report fixes applied, documents re-frozen, and any new deferrals.

**In both modes**, follow all instructions below — update mode starts from the existing fix log rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/validation/fix-log.md`
- **Secondary output**: Updated phase artifacts with fixes applied, freeze markers
- **Preserve**: Previously applied fixes, existing deferral rationale
- **Related docs**: `docs/validation/*.md`, all phase output artifacts
- **Special rules**: Never remove a fix log entry. New fixes append to the log. If a previously deferred P2 is now P0/P1, escalate it and log the rationale change.

---

## Inputs

Read ALL validation findings before categorizing any fixes:

| Source | What to Extract |
|--------|----------------|
| `docs/validation/*.md` | All findings from every validation pass |
| All `docs/*.md` phase artifacts | Documents that need fixes applied |

---

## Fix Categorization

Assign each finding to exactly one priority using these decision rules:

### P0 — Blocking
Would an implementing agent produce incorrect code if this is not fixed? Cross-document inconsistencies, broken traceability links, missing requirements, dependency cycles.

### P1 — Important
Would an implementing agent have to guess or make assumptions? Ambiguity, underspecified error handling, vague acceptance criteria.

### P2 — Deferred
Is the issue real but unlikely to affect implementation correctness? Minor polish, editorial inconsistencies, documentation gaps that do not affect code generation.

When a finding spans multiple categories, assign it to the highest applicable priority. Do not duplicate findings across levels. When a single root cause appears in 3+ reports, mark it as a **systemic issue** and track it separately.

---

## Fix Execution

For each fix (P0 first, then P1, grouped by document):

1. Read the finding and the affected document section.
2. Make the **minimal change** that resolves the finding. Do not refactor, improve prose, or add features.
3. Check whether the fix affects other documents — search for all references before changing any term.
4. Log the fix in `docs/validation/fix-log.md` with: finding ID, affected files, what changed, why.
5. For systemic issues, fix the source of truth first, then sweep all downstream references in a single pass.

### Fix Execution Rules
- **One finding per commit** (or one systemic issue per commit) to enable rollback.
- **Fix forward, not around.** If a finding reveals a design mistake, fix the design.
- **Preserve document structure.** Content changes only — no section reorganization.
- **Cross-document fixes must be atomic.** A half-applied rename is worse than the original inconsistency.

---

## Re-Validation

After all fixes are applied:

1. Re-run affected validation checks on modified documents.
2. Spot-check adjacent sections in each modified document.
3. Verify all counts and cross-references — any quantity change requires checking every document that cites it.
4. For systemic fixes, grep for the old term/value across the entire `docs/` directory.
5. **If re-validation finds new issues**, treat them as P0 and loop back to Fix Execution. Continue until re-validation produces zero new findings.

---

## Freeze Criteria Checklist

Before declaring freeze, verify ALL of the following:

- [ ] All P0 findings resolved and re-validated
- [ ] All P1 findings resolved (or explicitly risk-accepted with documented rationale)
- [ ] Re-validation produced zero new findings on the final pass
- [ ] Fix log is complete with all changes documented
- [ ] P2 deferrals are logged with rationale
- [ ] Cross-document counts are internally consistent (final count sweep)
- [ ] All traceability links resolve (no dangling references)
- [ ] Terminology is consistent across all documents (final terminology sweep)

---

## Freeze Marker Format

Add the following marker to the top of each frozen document, immediately after the frontmatter:

```markdown
<!-- FROZEN: Implementation-ready as of YYYY-MM-DD. Changes require fix-log entry. -->
```

Create a **Frozen Artifact Manifest** in the fix log listing every frozen document with its freeze date and fix counts.

---

## What's Allowed After Freeze

| Change Type | Allowed? | Process |
|------------|----------|---------|
| Typo fixes, formatting | Yes | Direct edit, no re-validation needed |
| Gap discovered during implementation | Yes | Prioritize as P0/P1, apply fix, re-validate, log in fix log |
| "Nice to have" improvements | No | Log as P2 deferral for post-implementation |
| Scope additions | No | Must go through PRD amendment process |
| Terminology alignment (missed in freeze) | Yes | Treat as P0, apply and re-validate |

---

## Process

1. **Read all validation findings** from `docs/validation/*.md`
2. **Build the fix plan** — deduplicate, categorize (P0/P1/P2), group by document, order by priority
3. **Use AskUserQuestionTool** if any finding is ambiguous or the correct fix is unclear
4. **Apply fixes** following the execution rules above, committing atomically
5. **Re-validate** after all fixes — loop until zero new findings
6. **Verify freeze criteria checklist** — every item must pass
7. **Add freeze markers** to all phase artifacts
8. **Create the frozen artifact manifest** in `docs/validation/fix-log.md`
9. **Update tracking comment** on line 1: `<!-- scaffold:apply-fixes-and-freeze v<ver> <date> -->`

## After This Step

When this step is complete, tell the user:

---
**Finalization in progress** — All validation findings addressed, documentation frozen and implementation-ready.

**Next:** Run `/scaffold:developer-onboarding-guide` — Generate the "start here" guide for new contributors.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
