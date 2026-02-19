---
description: "Verify workflow consistency across all docs"
long-description: "Cross-references all documentation files to detect contradictions, stale references, and workflow inconsistencies, then fixes any found issues."
---

Review all project documentation to ensure the standard feature workflow is clearly documented, consistent across all files, and provides unambiguous guidance for AI agents and human developers.

The workflow below is the canonical source of truth. Your job is to ensure every document that touches workflow is aligned with it.

**Ordering note:** This prompt should run AFTER the Claude.md Optimization prompt. That prompt consolidates; this one verifies alignment with the canonical workflow and fixes any remaining gaps.

---

## Canonical Workflow

See `CLAUDE.md` for the authoritative workflow. The 6-step workflow below is the source of truth for auditing — ensure every document aligns to it.

### Step-by-step Feature Workflow

| Step | Action | Commands |
|------|--------|----------|
| 1 | Pick task | `bd ready` → `bd update <id> --status in_progress --claim` |
| 2 | Create branch | `git checkout -b bd-<id>/<desc> origin/main` |
| 3 | Implement (TDD) | Red/Green/Refactor/Verify/Commit — `make check` before push |
| 4 | Push + PR | `git fetch origin && git rebase origin/main && git push -u origin HEAD && gh pr create --title "[BD-<id>] type(scope): desc" --body "Closes BD-<id>"` |
| 5 | Merge + close | `gh pr merge --squash --delete-branch && bd close <id> && bd sync` |
| 6 | Next task | `bd ready` (if tasks remain, go to step 1) |

**Worktree agents** (cannot `git checkout main` — it's checked out in the main repo):
```bash
# After merge (step 5):
bd close <id> && bd sync
git fetch origin --prune
# Branch from origin/main for next task:
git checkout -b bd-<next-id>/<desc> origin/main
```

### Key Constraints (Always Apply)
- Never push directly to main — everything goes through squash-merge PRs
- Every commit carries a Beads task ID in format `[BD-<id>]`
- Lint and test must pass before any commit (use the project's lint and test commands from CLAUDE.md Key Commands)
- Only `--force-with-lease` on feature branches, never force push to main
- Use subagents for research/exploration to keep the main context clean
- If a task requires human action or is outside your capability, skip it: `bd update <id> --status blocked` with a note, then pick the next task

---

## Phase 1: Document Inventory

Read these documents and note any workflow-related content:

| Document | What to Look For |
|----------|------------------|
| `CLAUDE.md` | Workflow section, git rules, Beads commands, commit format |
| `docs/dev-setup.md` | Development workflow, common commands |
| `docs/coding-standards.md` | Commit message format, TDD requirements, linting |
| `docs/git-workflow.md` | Branch naming, PR process, merge strategy, worktree workflow |
| `docs/implementation-plan.md` (if exists) | Task workflow references |
| `Makefile` or `package.json` or `pyproject.toml` | Available commands (lint, test, install, dev) |
| `.github/` | PR templates, CI workflows |
| `tasks/lessons.md` | Referenced in workflow? Contains useful patterns? |

For each document, extract:
- Current workflow instructions (verbatim quotes)
- Commands mentioned
- Constraints stated
- Anything that contradicts or partially covers the canonical workflow

---

## Phase 2: Completeness Check

### 2.1 CLAUDE.md Audit (Critical — AI Agents Read This)

CLAUDE.md must contain the complete workflow. Check for:

**Workflow Section Exists**:
- [ ] Dedicated section for feature workflow (e.g., "## Feature Workflow")
- [ ] All 6 steps present (pick task → next task)
- [ ] Commands are copy-pasteable (not pseudo-code)

**Step 1: Task Selection**:
- [ ] `bd ready` documented
- [ ] `bd update <id> --status in_progress --claim` documented

**Step 2: Branch Creation**:
- [ ] Branch naming format: `bd-<task-id>/<short-desc>`
- [ ] Branch from `origin/main` (not checkout main, pull, then branch)

**Step 3: TDD Implementation**:
- [ ] Red → Green → Refactor cycle documented
- [ ] `make check` (or equivalent) run before push
- [ ] Commit message format: `[BD-<id>] type(scope): description`

**Step 4: Push + PR**:
- [ ] `git fetch origin && git rebase origin/main` before push
- [ ] `git push -u origin HEAD`
- [ ] `gh pr create` with title format matching `[BD-<id>] type(scope): description` and `--body "Closes BD-<id>"`

**Step 5: Merge + Close**:
- [ ] `gh pr merge --squash --delete-branch` documented
- [ ] `bd close <id>` documented (not `bd update --status completed`)
- [ ] `bd sync` documented
- [ ] Worktree variant explicitly documented (cannot `git checkout main`; use `git fetch origin --prune` then branch from `origin/main`)

**Step 6: Next Task**:
- [ ] `bd ready` to check for more work
- [ ] "Keep working until no tasks remain" stated

**Key Constraints Section**:
- [ ] Never push directly to main
- [ ] Every commit has Beads task ID in `[BD-<id>]` format
- [ ] Lint and test before commit (references Key Commands table, not hardcoded commands)
- [ ] Only `--force-with-lease` on feature branches
- [ ] Subagents for research

### 2.2 Supporting Documents Audit

**docs/coding-standards.md**:
- [ ] Commit message format matches: `[BD-<id>] type(scope): description`
- [ ] TDD requirements documented
- [ ] Linting requirements documented
- [ ] No contradictory commit format (e.g., doesn't say `feat: description` without task ID)
- [ ] Styling / Design System section exists (if project has frontend) — references docs/design-system.md, prohibits arbitrary hex/px values

**docs/dev-setup.md**:
- [ ] Lint and test commands documented and match CLAUDE.md Key Commands table
- [ ] How to run tests in watch mode
- [ ] No workflow steps that contradict CLAUDE.md

**Makefile / package.json / pyproject.toml**:
- [ ] Lint command exists and matches CLAUDE.md
- [ ] Test command exists and matches CLAUDE.md
- [ ] Install command exists and matches CLAUDE.md

**docs/git-workflow.md** (if exists):
- [ ] Branch naming matches: `bd-<task-id>/<short-desc>`
- [ ] Branching from `origin/main` (not checkout-pull-branch)
- [ ] Rebase onto origin/main before push documented
- [ ] Commit format matches: `[BD-<id>] type(scope): description`
- [ ] `gh pr merge --squash --delete-branch` documented
- [ ] Task closure with `bd close` documented
- [ ] Worktree workflow variant documented (cannot `git checkout main`)
- [ ] Agent crash recovery documented
- [ ] No contradictory merge strategy or commit format

**.github/PULL_REQUEST_TEMPLATE.md** (if exists):
- [ ] References task ID format
- [ ] Matches documented PR title format

**tasks/lessons.md**:
- [ ] File exists
- [ ] Contains actual lessons (not empty placeholder)
- [ ] Referenced in CLAUDE.md workflow

### 2.3 Consistency Check

Cross-reference all documents for contradictions:

| Element | Check For Consistency |
|---------|----------------------|
| Commit format | `[BD-<id>] type(scope): description` everywhere |
| Branch naming | `bd-<task-id>/<short-desc>` from `origin/main` everywhere |
| Merge strategy | `--squash --delete-branch` stated consistently |
| Required checks | Lint and test commands consistent across CLAUDE.md Key Commands, dev-setup.md, and Makefile/package.json |
| Task ID format | `[BD-<id>]` consistent (not `BD-<id>` without brackets, not `(bd-<id>)` suffix) |
| Close command | `bd close` consistently (not `bd update --status completed`) |
| PR workflow | 6-step workflow consistent (pick → branch → TDD → push+PR → merge+close → next) |
| Worktree variant | No `git checkout main` in worktree context — always branch from `origin/main` |

---

## Phase 3: Gap Analysis

### 3.1 Identify Gaps

Create a table of findings:

| Document | Issue Type | Problem | Fix |
|----------|------------|---------|-----|
| CLAUDE.md | Incomplete | Says "create PR" but no merge step | Add `gh pr merge --squash --delete-branch` |
| CLAUDE.md | Missing | No merge confirmation step | Add `gh pr view --json state` check |
| CLAUDE.md | Missing | No task closure commands | Add `bd close`, `bd sync`, branch cleanup |
| CLAUDE.md | Missing | No reference to tasks/lessons.md | Add to step 2 |
| CLAUDE.md | Wrong format | Commit uses `feat(scope): desc (bd-<id>)` | Update to `[BD-<id>] type(scope): description` |
| coding-standards.md | Contradiction | Says `feat: description` | Update to `[BD-<id>] type(scope): description` |
| git-workflow.md | Missing | No worktree cleanup between tasks | Add `git clean -fd && <install-deps>` step |
| Makefile | Missing | No `lint` target | Create lint target |
| tasks/lessons.md | Missing | File doesn't exist | Create with initial structure |

### 3.2 Categorize by Severity

**Critical** (agents will do the wrong thing):
- Wrong or missing git workflow (push to main, wrong branch naming)
- Missing task ID requirement (commits without `[BD-<id>]`)
- Wrong merge strategy (merge instead of squash, missing --delete-branch)
- Missing verification steps (no merge confirmation)
- Wrong commit format (task ID at end instead of prefix, missing brackets)
- Missing task closure (`bd close` not documented)

**High** (workflow friction, inconsistency):
- Incomplete steps (missing cleanup commands, missing --prune)
- Contradictions between documents
- Missing Makefile targets that are referenced
- Branching from local main instead of origin/main

**Medium** (missing context):
- No tasks/lessons.md reference
- Incomplete TDD documentation
- Missing planning guidance (think through approach, NOT interactive `/plan` mode)
- No worktree cleanup between tasks
- No crash recovery documentation

**Low** (polish):
- Formatting inconsistencies
- Redundant documentation
- Could be clearer

---

## Phase 4: Recommendations

This phase provides fixes for gaps found. If CLAUDE.md was already consolidated by the Claude.md Optimization prompt, most issues should be minor alignment fixes. If CLAUDE.md is missing the workflow entirely, use the complete section below as a fallback.

### 4.1 CLAUDE.md Updates

If CLAUDE.md is missing the workflow or has gaps, provide the complete section:

```markdown
## Feature Workflow

| Step | Action | Commands |
|------|--------|----------|
| 1 | Pick task | `bd ready` → `bd update <id> --status in_progress --claim` |
| 2 | Create branch | `git checkout -b bd-<task-id>/<short-desc> origin/main` |
| 3 | Implement (TDD) | Red/Green/Refactor/Verify/Commit — `make check` (or equivalent) before push |
| 4 | Push + PR | `git fetch origin && git rebase origin/main && git push -u origin HEAD && gh pr create --title "[BD-<id>] type(scope): desc" --body "Closes BD-<id>"` |
| 5 | Merge + close | `gh pr merge --squash --delete-branch && bd close <id> && bd sync` |
| 6 | Next task | `bd ready` (if tasks remain, go to step 1) |

**Worktree agents (cannot `git checkout main`):**
```bash
# After merge:
bd close <id> && bd sync
git fetch origin --prune
git checkout -b bd-<next-task>/<desc> origin/main
```

---

## Git Rules (CRITICAL)

- **Never push directly to main** — all changes through squash-merge PRs
- **Every commit has task ID** — format: `[BD-<id>] type(scope): description`
- **Verify before commit** — lint and test must pass (see Key Commands)
- **Force push safely** — only `--force-with-lease`, only on feature branches
- **Branch from origin** — always `git checkout -b <branch> origin/main`
- **Worktree agents** — never `git checkout main`; always branch from `origin/main`

## Working Practices

- **Subagents for research** — keeps main context clean
- **Keep working** — continue until `bd ready` returns nothing
```

### 4.2 Other Document Updates

For each document with issues, provide specific fixes:

**docs/coding-standards.md — Commit Format**:
```markdown
## Commit Messages

Format: `[BD-<id>] type(scope): description`

Examples:
- `[BD-42] feat(auth): add login endpoint`
- `[BD-42] fix(auth): handle expired tokens`
- `[BD-42] test(auth): add login validation tests`
- `[BD-42] refactor(auth): extract token validation`

Types: feat, fix, test, refactor, docs, chore

The task ID is required — every commit must trace to a Beads task.
```

**Makefile / package.json — Missing Commands**:

If lint or test commands don't exist, create them. The Dev Setup prompt should have configured these — if they're missing, add them now. The specific commands depend on the tech stack (check `docs/tech-stack.md`):

```makefile
# Makefile example (Python projects)
.PHONY: lint test install

lint:
    ruff check .

test:
    pytest

install:
    pip install -r requirements.txt
```

```json
// package.json example (Node projects)
{
  "scripts": {
    "lint": "eslint .",
    "test": "vitest run",
    "install": "npm install"
  }
}
```

Ensure CLAUDE.md Key Commands table matches whatever is configured here.

**tasks/lessons.md — Create If Missing**:
```markdown
# Lessons Learned

Patterns and anti-patterns discovered during development. Review before starting new tasks.

## Patterns (Do This)

<!-- Add patterns as you discover them -->

## Anti-Patterns (Avoid This)

<!-- Add anti-patterns as you discover them -->

## Common Gotchas

<!-- Add gotchas specific to this project -->
```

### 4.3 Task Creation

If implementation work is needed:

```bash
# Missing infrastructure
bd create "Create tasks/lessons.md with initial structure" -p 0
bd create "Add lint target to Makefile" -p 0
bd create "Add test target to Makefile" -p 0
bd create "Create PR template with task ID format" -p 2

# Documentation fixes (do immediately, no task needed)
# - Update CLAUDE.md workflow section
# - Fix commit format in coding-standards.md
```

---

## Phase 5: Present Findings

### Summary Report

```
## Workflow Audit Summary

### Documents Reviewed
- CLAUDE.md: [Complete / Incomplete / Missing workflow]
- docs/coding-standards.md: [Aligned / Contradictions / Missing]
- docs/dev-setup.md: [Aligned / Contradictions / Missing]
- docs/git-workflow.md: [Aligned / Contradictions / Missing]
- Makefile: [Has required targets / Missing targets]
- tasks/lessons.md: [Exists / Missing]

### Workflow Coverage in CLAUDE.md
- Step 1 (Task selection): [✓ Complete / ⚠️ Partial / ✗ Missing]
- Step 2 (Branch creation): [✓ / ⚠️ / ✗]
- Step 3 (TDD implementation): [✓ / ⚠️ / ✗]
- Step 4 (Push + PR): [✓ / ⚠️ / ✗]
- Step 5 (Merge + close): [✓ / ⚠️ / ✗]
- Step 6 (Next task): [✓ / ⚠️ / ✗]
- Worktree variant: [✓ / ⚠️ / ✗]
- Key constraints: [✓ / ⚠️ / ✗]

### Consistency Issues
[List any contradictions between documents]

### Gap Summary
- Critical: X issues
- High: X issues
- Medium: X issues
- Low: X issues

### Recommended Actions
1. [Highest priority fix]
2. [Second priority]
3. [etc.]

### Questions for You
- [Any decisions needed]
```

Wait for approval before making changes.

---

## Phase 6: Execute Updates

After approval:

1. **Update CLAUDE.md** — Add or fix workflow section
2. **Fix contradictions** — Update other docs to align
3. **Create missing files** — tasks/lessons.md, Makefile targets
4. **Create tasks** — For any implementation work needed

### Verification Checklist

After updates, verify:

- [ ] CLAUDE.md has complete 6-step Feature Workflow
- [ ] All commands are copy-pasteable
- [ ] Commit format `[BD-<id>] type(scope): description` is consistent everywhere
- [ ] Branch naming `bd-<task-id>/<short-desc>` from `origin/main` is consistent everywhere
- [ ] `gh pr merge --squash --delete-branch` present on merge command
- [ ] Task closure uses `bd close` (not `bd update --status completed`)
- [ ] Makefile/package.json has lint, test, and install commands
- [ ] CLAUDE.md Key Commands table has correct lint, test, and install commands matching actual scripts
- [ ] No document contradicts the canonical workflow
- [ ] Key constraints section exists in CLAUDE.md
- [ ] Worktree variant documented — no `git checkout main` in worktree context
- [ ] Agent crash recovery is documented (in git-workflow.md)

---

## Process Rules

1. **Canonical workflow is source of truth** — Documents align to it, not vice versa
2. **CLAUDE.md is highest priority** — AI agents read this; it must be complete
3. **Contradictions are critical** — Fix immediately, don't leave ambiguity
4. **Commands must be exact** — No pseudo-code, no "something like this"
5. **Present before changing** — Get approval on findings first
6. **Document updates happen now** — Don't create tasks for doc fixes; just fix them
7. Add a tracking comment as the last line of `CLAUDE.md` (after any existing scaffold comments): `<!-- scaffold:workflow-audit v1 YYYY-MM-DD -->` (use actual date)

---

## Quick Reference: What Each Step Must Include

| Step | Required Elements |
|------|-------------------|
| 1 | `bd ready`, `bd update --status in_progress --claim` |
| 2 | Branch format `bd-<id>/<desc>`, branch from `origin/main` |
| 3 | Red/Green/Refactor, verify (project's lint+test), commit format `[BD-<id>]`, `make check` before push |
| 4 | Rebase onto `origin/main`, push, `gh pr create` with `[BD-<id>]` title and `Closes BD-<id>` body |
| 5 | `gh pr merge --squash --delete-branch`, `bd close <id>`, `bd sync` |
| 6 | `bd ready`, continue or stop; worktree: branch from `origin/main` for next task |
| Constraints | No push to main, `[BD-<id>]` required, lint+test before commit, force-with-lease only |

## After This Step

When this step is complete, tell the user:

---
**Phase 6 complete** — Workflow verified and aligned across all documents.

**Next:** Run `/scaffold:implementation-plan` — Create task graph from stories and standards (starts Phase 7).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
