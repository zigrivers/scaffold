---
description: "Verify workflow consistency across all docs"
long-description: "Cross-references all documentation files to detect contradictions, stale references, and workflow inconsistencies, then fixes any found issues."
---

Review all project documentation to ensure the standard feature workflow is clearly documented, consistent across all files, and provides unambiguous guidance for AI agents and human developers.

The workflow below is the canonical source of truth. Your job is to ensure every document that touches workflow is aligned with it.

**Ordering note:** This prompt should run AFTER the Claude.md Optimization prompt. That prompt consolidates; this one verifies alignment with the canonical workflow and fixes any remaining gaps.

---

## Canonical Workflow

### Step-by-step Feature Workflow

**1a. Pick a task (for existing tasks)**
```bash
bd ready                    # See what's available
bd update <id> --status in_progress --claim
```
Always pick the lowest-ID unblocked task.

**1b. Create a task (for ad-hoc requests)**
```bash
bd create "<task type>: <desc>" -p 1
bd update <id> --claim
```

**2. Create a feature branch**
```bash
git fetch origin
git checkout -b bd-<task-id>/<short-desc> origin/main
```
Review `tasks/lessons.md` for patterns learned from past mistakes.

**3. Plan before building**
Think through your approach for anything non-trivial (3+ steps or architectural decisions). Write specs upfront. **Do NOT enter Claude Code's interactive plan mode** (`/plan`) — it blocks autonomous execution. If things go sideways mid-implementation, stop and re-plan rather than pushing through.

**4. TDD loop (Red → Green → Refactor)**
Repeat for each piece of functionality in the task:
1. **Red** — Write a failing test that defines expected behavior
2. **Green** — Write the minimum code to make it pass
3. **Refactor** — Clean up while tests stay green
4. **Verify** — Run the project's lint and test commands (see CLAUDE.md Key Commands table)
5. **Commit** — `git commit -m "[BD-<id>] type(scope): description"`

Continue until all acceptance criteria for the task are met. Multiple commits per task are normal — they'll be squash-merged into one commit on main.

**4.5. Self-review (before push)**
```bash
claude -p "Review changes on this branch vs origin/main. Check against docs/review-standards.md for P0/P1/P2 issues. Fix any issues found. Run <lint> and <test> after fixes. Commit fixes with [BD-<id>] fix: address self-review findings"
```
Catches issues before external review. Runs once before push — cheaper and more targeted than a hook.

**5. Rebase, push, and open a PR**
```bash
git fetch origin && git rebase origin/main    # Rebase onto latest main
git push -u origin HEAD
gh pr create --title "[BD-<id>] type(scope): description" --body "Closes BD-<id>"
```

**6. Self-review diff**
```bash
gh pr diff
```

**7. Merge**
```bash
gh pr merge --squash --delete-branch
```
The `--delete-branch` flag automatically removes the remote branch after merge (local branch is cleaned up in step 9).

**8. Confirm merge**
```bash
gh pr view --json state -q .state   # Must show "MERGED"
```
Never close the task until this shows MERGED.

**9. Close task and clean up**

*Single agent (main repo):*
```bash
bd close <id>
bd sync
git checkout main && git pull --rebase origin main
git branch -d bd-<task-id>/<short-desc>              # Local branch (remote already deleted by --delete-branch)
git fetch origin --prune                              # Clean up stale remote refs
```

*Worktree agent (cannot checkout main):*
```bash
bd close <id>
bd sync
git fetch origin --prune
git clean -fd
<install-deps>  # Use project's install command from CLAUDE.md Key Commands
```
Worktree agents cannot `git checkout main` — it's checked out in the main repo. They branch directly from `origin/main`. Merged local branches are batch-cleaned periodically.

**9. Next task or done**
```bash
bd ready
```
If tasks remain, go back to step 1. If none remain, the session is complete.

*Worktree agents:* Create the next feature branch directly from `origin/main`:
```bash
git checkout -b bd-<next-task>/<desc> origin/main
```

### Key Constraints (Always Apply)
- Never push directly to main — everything goes through squash-merge PRs
- Every commit carries a Beads task ID in format `[BD-<id>]`
- Lint and test must pass before any commit (use the project's lint and test commands from CLAUDE.md Key Commands)
- Only `--force-with-lease` on feature branches, never force push to main
- Use subagents for research/exploration to keep the main context clean
- Review `tasks/lessons.md` before starting work
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
- [ ] Dedicated section for feature workflow (e.g., "## Feature Workflow" or "## Development Workflow")
- [ ] Steps are numbered and in correct order
- [ ] All 9 steps are present (pick task → next task), plus step 4.5 (self-review)
- [ ] Commands are copy-pasteable (not pseudo-code)

**Step 1: Task Selection**:
- [ ] `bd ready` documented
- [ ] `bd update <id> --status in_progress --claim` documented
- [ ] "Pick lowest-ID unblocked task" rule stated
- [ ] Ad-hoc task creation documented (`bd create`)

**Step 2: Branch Creation**:
- [ ] `git fetch origin` before branching
- [ ] Branch naming format: `bd-<task-id>/<short-desc>`
- [ ] Branch from `origin/main` (not checkout main, pull, then branch)
- [ ] Reference to `tasks/lessons.md` review

**Step 3: Planning**:
- [ ] Planning approach mentioned for non-trivial work (think through, write specs — NOT interactive `/plan` mode)
- [ ] Explicit warning not to enter Claude Code's interactive plan mode (`/plan`)
- [ ] "3+ steps or architectural decisions" trigger documented
- [ ] Re-plan guidance if implementation goes sideways

**Step 4: TDD Loop**:
- [ ] Red → Green → Refactor cycle documented
- [ ] Each phase explained (not just "do TDD")
- [ ] Clear that loop repeats per piece of functionality until all acceptance criteria are met
- [ ] Multiple commits per task acknowledged (squash-merged later)
- [ ] Lint and test verification step (using project's commands from CLAUDE.md Key Commands table)
- [ ] Commit message format: `[BD-<id>] type(scope): description`

**Step 4.5: Self-Review**:
- [ ] `claude -p` subagent command documented
- [ ] Reviews against `docs/review-standards.md` for P0/P1/P2 issues
- [ ] Runs lint and test after fixes
- [ ] Commits fixes with `[BD-<id>] fix: address self-review findings`
- [ ] Runs once before push (not a hook)

**Step 5: Rebase, Push, PR Creation**:
- [ ] `git fetch origin && git rebase origin/main` before push
- [ ] `git push -u origin HEAD`
- [ ] `gh pr create` with title format matching `[BD-<id>] type(scope): description`
- [ ] `gh pr diff` self-review step documented
- [ ] `gh pr merge --squash --delete-branch` documented
- [ ] `--delete-branch` explained (removes remote branch after merge)

**Step 6: Self-Review**:
- [ ] `gh pr diff` documented

**Step 7: Merge**:
- [ ] `gh pr merge --squash --delete-branch` documented

**Step 8: Confirm Merge**:
- [ ] `gh pr view --json state -q .state` documented
- [ ] "Must show MERGED" requirement
- [ ] "Never close task until MERGED" rule

**Step 8: Cleanup**:
- [ ] `bd close <id>` (not `bd update --status completed`)
- [ ] `bd sync`
- [ ] Single agent: return to main and pull with rebase, delete local feature branch
- [ ] Worktree agent: `git fetch origin --prune`, `git clean -fd`, reinstall deps using project's install command (no checkout main — it's checked out in main repo)
- [ ] `git fetch origin --prune` to clean up stale remote refs
- [ ] Worktree variant explicitly documented (agents cannot checkout main)

**Step 9: Continue or Stop**:
- [ ] `bd ready` to check for more work
- [ ] "Keep working until no tasks remain" stated
- [ ] Worktree agents: branch directly from `origin/main` for next task
- [ ] Batch branch cleanup documented for worktree agents

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
- [ ] Self-review step documented (step 4.5 — `claude -p` subagent before push)
- [ ] Rebase onto origin/main before push documented
- [ ] Commit format matches: `[BD-<id>] type(scope): description`
- [ ] Squash merge with `--delete-branch` documented
- [ ] Self-review step (`gh pr diff`) documented
- [ ] Merge step (`gh pr merge --squash --delete-branch`) documented
- [ ] Merge confirmation step documented
- [ ] Task closure with `bd close` documented
- [ ] Protected main documented
- [ ] Worktree workflow variant documented (workspace cleanup between tasks)
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
| Pull strategy | `git pull --rebase origin main` consistently |
| PR workflow | All 7 sub-steps (commit, rebase, push, create, auto-merge, watch, confirm) |

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

### 1. Pick or Create a Task

**Existing task:**
```bash
bd ready                                          # See available tasks
bd update <id> --status in_progress --claim       # Claim lowest-ID task
```

**Ad-hoc request (no existing task):**
```bash
bd create "<type>: <description>" -p 1
bd update <id> --claim
```

### 2. Create Feature Branch
```bash
git fetch origin
git checkout -b bd-<task-id>/<short-desc> origin/main
```
Review `tasks/lessons.md` for patterns from past mistakes.

### 3. Plan Before Building
For non-trivial work (3+ steps or architectural decisions):
- Think through your approach before coding
- **Do NOT enter interactive plan mode** (`/plan`) — it blocks autonomous execution
- Write specs upfront
- If implementation goes sideways, stop and re-plan

### 4. TDD Loop
Repeat for each piece of functionality in the task:
1. **Red**: Write a failing test that defines expected behavior
2. **Green**: Write minimum code to make it pass
3. **Refactor**: Clean up while tests stay green
4. **Verify**: Run lint and test commands (see Key Commands below)
5. **Commit**: `git commit -m "[BD-<id>] type(scope): description"`

Continue until all acceptance criteria are met. Multiple commits are normal — they squash-merge.

### 4.5. Self-Review
```bash
claude -p "Review changes on this branch vs origin/main. Check against docs/review-standards.md for P0/P1/P2 issues. Fix any issues found. Run <lint> and <test> after fixes. Commit fixes with [BD-<id>] fix: address self-review findings"
```
Catches issues before external review. Runs once before push — not a hook.

### 5. Rebase, Push, and Open PR
```bash
git fetch origin && git rebase origin/main    # Rebase onto latest main
git push -u origin HEAD
gh pr create --title "[BD-<id>] type(scope): description" --body "Closes BD-<id>"
```

### 6. Self-review Diff
```bash
gh pr diff
```

### 7. Merge
```bash
gh pr merge --squash --delete-branch
```
`--delete-branch` removes the remote branch automatically.

### 8. Confirm Merge
```bash
gh pr view --json state -q .state   # Must show "MERGED"
```
**Never close task until this shows MERGED.**

### 9. Close Task and Clean Up

**Single agent (main repo):**
```bash
bd close <id>
bd sync
git checkout main && git pull --rebase origin main
git branch -d bd-<task-id>/<short-desc>    # Local only; remote deleted by --delete-branch
git fetch origin --prune                    # Clean up stale remote refs
```

**Worktree agent (cannot checkout main):**
```bash
bd close <id>
bd sync
git fetch origin --prune
git clean -fd
<install-deps>  # Use project's install command from Key Commands
```

### 9. Next Task or Done
```bash
bd ready
```
If tasks remain, return to step 1. If none, session is complete.

**Worktree agents:** Create the next feature branch directly from `origin/main`:
```bash
git checkout -b bd-<next-task>/<desc> origin/main
```

Merged local branches in worktrees are batch-cleaned periodically.

---

## Git Rules (CRITICAL)

- **Never push directly to main** — all changes through squash-merge PRs
- **Every commit has task ID** — format: `[BD-<id>] type(scope): description`
- **Verify before commit** — lint and test must pass (see Key Commands)
- **Force push safely** — only `--force-with-lease`, only on feature branches
- **Branch from origin** — always `git checkout -b <branch> origin/main`

## Working Practices

- **Subagents for research** — keeps main context clean
- **Review lessons learned** — check `tasks/lessons.md` before starting
- **Re-plan when stuck** — if implementation goes sideways, pause and rethink your approach (do NOT use `/plan`)
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
- Step 3 (Planning): [✓ / ⚠️ / ✗]
- Step 4 (TDD loop): [✓ / ⚠️ / ✗]
- Step 4.5 (Self-review): [✓ / ⚠️ / ✗]
- Step 5 (PR creation): [✓ / ⚠️ / ✗]
- Step 6 (Self-review diff): [✓ / ⚠️ / ✗]
- Step 7 (Merge): [✓ / ⚠️ / ✗]
- Step 8 (Confirm merge): [✓ / ⚠️ / ✗]
- Step 9 (Cleanup): [✓ / ⚠️ / ✗]
- Step 10 (Next task): [✓ / ⚠️ / ✗]
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

- [ ] CLAUDE.md has complete workflow (9 steps + step 4.5 self-review)
- [ ] All commands are copy-pasteable
- [ ] Commit format `[BD-<id>] type(scope): description` is consistent everywhere
- [ ] Branch naming `bd-<task-id>/<short-desc>` from `origin/main` is consistent everywhere
- [ ] PR workflow includes all 7 sub-steps (commit, rebase, push, create, auto-merge, watch, confirm)
- [ ] `--delete-branch` flag present on merge command
- [ ] Task closure uses `bd close` (not `bd update --status completed`)
- [ ] Makefile/package.json has lint, test, and install commands
- [ ] CLAUDE.md Key Commands table has correct lint, test, and install commands matching actual scripts
- [ ] tasks/lessons.md exists and is referenced
- [ ] No document contradicts the canonical workflow
- [ ] Key constraints section exists in CLAUDE.md
- [ ] Worktree cleanup between tasks is documented
- [ ] Worktree variant of task closure documented (cannot checkout main, batch branch cleanup)
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
| 1 | `bd ready`, `bd update --claim`, lowest-ID rule, ad-hoc creation |
| 2 | `git fetch`, branch format, `origin/main`, lessons.md reference |
| 3 | Think through approach (3+ steps), write specs, do NOT use `/plan`, re-plan if stuck |
| 4 | Red/Green/Refactor, verify command (project's lint+test from Key Commands), commit format `[BD-<id>]` |
| 4.5 | Self-review: `claude -p` subagent checks against `docs/review-standards.md` for P0/P1/P2, fixes issues, runs lint+test |
| 5 | Rebase onto origin/main, push, PR create with title |
| 6 | `gh pr diff` self-review |
| 7 | `gh pr merge --squash --delete-branch` |
| 8 | Merge confirmation command, "never close until MERGED" |
| 9 | `bd close`, `bd sync`. Single: return to main, delete branch, `--prune`. Worktree: fetch, prune, clean (no checkout main) |
| 10 | `bd ready`, continue or stop. Worktree: branch from `origin/main`, batch-clean merged branches |
| Constraints | No push to main, `[BD-<id>]` required, lint+test before commit, force-with-lease, subagents |

## After This Step

When this step is complete, tell the user:

---
**Phase 6 complete** — Workflow verified and aligned across all documents.

**Next:** Run `/scaffold:implementation-plan` — Create task graph from stories and standards (starts Phase 7).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
