---
name: multi-agent-start
description: Start multi-agent execution loop in a worktree
summary: "Sets up a named agent in an isolated git worktree so multiple agents can implement tasks simultaneously without file conflicts, each following the same TDD loop."
phase: "build"
order: 1530
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [tdd-execution-loop, task-claiming-strategy, worktree-management]
reads: [coding-standards, tdd, git-workflow]
argument-hint: "<agent-name>"
---

## Purpose
Start a named agent in a git worktree for parallel multi-agent execution.
Each agent operates in its own worktree, claims tasks independently, and
creates PRs that are merged back to main. This enables multiple agents to
work on different tasks simultaneously without stepping on each other.

## Inputs
- $ARGUMENTS (required) — the agent name (e.g., "alpha", "beta", "agent-1")
- CLAUDE.md (required) — project conventions, key commands, workflow
- docs/implementation-playbook.md (required if exists) — primary task execution reference
- docs/implementation-plan.md (fallback) — task list when no playbook exists
- docs/onboarding-guide.md (optional) — project context for orientation
- docs/coding-standards.md (required) — code conventions, naming, patterns
- docs/tdd-standards.md (required) — test categories, mocking strategy
- docs/project-structure.md (required) — where files live
- tests/acceptance/ (optional) — TDD test skeletons
- tests/evals/ (optional) — project eval checks for quality gates
- tasks/lessons.md (optional) — previous lessons learned
- .beads/ (conditional) — Beads task tracking if configured

## Expected Outputs
- Implemented features with passing tests from this agent's worktree
- Pull requests for each completed task
- Updated task status in playbook/plan or Beads

## Quality Criteria
- (mvp) Agent identity is established and verified (worktree environment confirmed)
- (mvp) Each task follows red-green-refactor TDD cycle
- (mvp) All quality gates pass before PR creation
- (mvp) Task claiming avoids conflicts with other agents
- (deep) Pre-flight verification confirms worktree isolation
- (deep) Between-task cleanup ensures no state leakage across tasks
- (deep) Beads actor identity is set correctly for task ownership tracking

## Methodology Scaling
- **deep**: Full pre-flight verification including worktree check, Beads actor
  identity, onboarding guide review, lessons.md per task, eval gates, detailed
  PR descriptions, between-task cleanup with dependency reinstall.
- **mvp**: Verify worktree, pick next task, TDD loop, make check, create PR.
  Skip onboarding review and between-task reinstalls if not needed.
- **custom:depth(1-5)**:
  - Depth 1: verify worktree environment, TDD loop, make check.
  - Depth 2: add dependency check and Beads identity verification.
  - Depth 3: add lessons.md review and test skeleton usage.
  - Depth 4: add onboarding guide, eval gates, between-task cleanup.
  - Depth 5: full pre-flight suite, all quality gates, actor verification.

## Mode Detection
This is a stateless execution command. No document is created or updated.
- Always operates in EXECUTE MODE.
- If this agent already has in-progress work (feature branch with changes),
  redirect to `/scaffold:multi-agent-resume $ARGUMENTS` instead.

## Update Mode Specifics
Not applicable — this is a stateless execution command that does not produce
a persistent document.

## Instructions

You are **$ARGUMENTS**.

### Pre-Flight Verification

Before writing any code, verify the worktree environment:

1. **Worktree confirmation**
   - `git rev-parse --git-dir` — output should contain `/worktrees/` (confirms you are in a worktree, not the main repo)
   - If NOT in a worktree, stop and instruct the user to set one up:
     > Run `scripts/setup-agent-worktree.sh $ARGUMENTS` from the main repo to create a worktree for this agent.

2. **Git state check**
   - `git status` — working tree should be clean
   - `git branch --show-current` — note the current branch
   - If on a feature branch with changes, redirect to `/scaffold:multi-agent-resume $ARGUMENTS`

3. **Beads identity** (if `.beads/` exists)
   - `echo $BD_ACTOR` — should show `$ARGUMENTS`
   - If not set, the worktree setup may be incomplete

4. **Dependency check**
   - Run the install command from CLAUDE.md Key Commands
   - Confirm dependencies are current in this worktree

5. **Test suite health**
   - Run the project's check command from CLAUDE.md Key Commands
   - If tests fail before you start, fix them or flag to the user

6. **Project orientation**
   - Read `CLAUDE.md` for project conventions and key commands
   - Read `docs/onboarding-guide.md` if it exists
   - Read `tasks/lessons.md` for relevant anti-patterns

### Worktree-Specific Rules

These rules are critical for multi-agent operation:

- **Never run `git checkout main`** — it will fail because main is checked out in the main repo
- **Always branch from remote**: `git fetch origin && git checkout -b <branch-name> origin/main`
- **Between tasks, clean up**: `git fetch origin --prune && git clean -fd` then run the install command from CLAUDE.md Key Commands
- **Use unique branch names** — include the agent name or task ID to avoid conflicts with other agents

### Beads Detection

**If Beads is configured** (`.beads/` exists):
- Branch naming: `bd-<id>/<desc>`
- Run `bd ready` to see available tasks
- Pick the lowest-ID unblocked task
- Implement following the TDD workflow below
- After PR is merged: `bd close <id> && bd sync`
- Repeat with `bd ready` until no tasks remain

**Without Beads:**
- Branch naming: `<type>/<desc>` (e.g., `feat/add-auth`)
1. Read `docs/implementation-playbook.md` as the primary task execution reference.
   Fall back to `docs/implementation-plan.md` when no playbook is present.
2. Pick the first uncompleted task that has no unfinished dependencies and is not being
   worked on by another agent (check for open PRs or in-progress markers).
3. Implement following the TDD workflow below.
4. Mark the task complete in the plan/playbook.
5. Repeat in dependency order until all tasks are done.

### TDD Execution Loop

For each task:

1. **Claim the task**
   - Create a feature branch from remote main:
     `git fetch origin && git checkout -b <branch-name> origin/main`
   - If Beads: use `bd-<id>/<desc>` naming

2. **Red phase — write failing tests**
   - Check `docs/story-tests-map.md` (if it exists) to find test skeletons that correspond to this task's user stories
   - Check `tests/acceptance/` for existing test skeletons that correspond to the task
   - If skeletons exist, use them as your starting point
   - Otherwise, write test cases from the task's acceptance criteria
   - Run the test suite — confirm the new tests FAIL (red)

3. **Green phase — implement**
   - Write the minimum code to make the failing tests pass
   - Follow conventions from `docs/coding-standards.md`
   - Follow file placement from `docs/project-structure.md`
   - Run tests after each meaningful change — stop when green

4. **Refactor phase — clean up**
   - Refactor for clarity, DRY, and convention compliance
   - Run the full test suite — confirm everything still passes

5. **Quality gates**
   - Run `make check` (or equivalent from CLAUDE.md Key Commands)
   - If `tests/evals/` exists, run `make eval` (or equivalent eval command)
   - Fix any failures before proceeding

6. **Pre-push local code review (when requested or required)**
   - If the user says to review before committing or pushing, or the project's workflow requires a local multi-model gate before `git push`, run `scaffold run review-code`
   - This reviews the local delivery candidate without requiring a PR
   - Surface auth failures immediately and retry after recovery
   - If recovery is not possible, document reduced review coverage and continue with the available channels
   - Fix any P0/P1/P2 findings before proceeding

7. **Create PR**
   - Push the branch: `git push -u origin HEAD`
   - Create a pull request: `gh pr create`
   - Include in the PR description: what was implemented, key decisions, files changed, agent name
   - Follow the PR workflow from `docs/git-workflow.md` or CLAUDE.md

8. **Run code reviews (MANDATORY)**
   - Run the review-pr tool: `scaffold run review-pr` (CLI) or `/scaffold:review-pr` (plugin)
   - This runs the three MMR CLI channels on the PR diff plus the Superpowers code-reviewer agent as a complementary 4th channel reconciled through `mmr reconcile`:
     1. **Codex CLI**: `codex exec --skip-git-repo-check -s read-only --ephemeral "REVIEW_PROMPT" 2>/dev/null`
     2. **Gemini CLI**: `NO_BROWSER=true gemini -p "REVIEW_PROMPT" --output-format json --approval-mode yolo 2>/dev/null`
     3. **Claude CLI**: `claude -p "REVIEW_PROMPT" --output-format json 2>/dev/null`
     4. **Superpowers code-reviewer** (4th channel): dispatch `superpowers:code-reviewer` subagent with BASE_SHA and HEAD_SHA
   - Verify auth before each CLI (`mmr config test` pre-flights all three at once)
   - All four channels should execute. Missing Codex or Gemini → MMR runs a compensating Claude pass in its place (degraded-pass verdict). Missing Claude CLI → review proceeds without compensation.
   - Fix any P0/P1/P2 findings before proceeding
   - Do NOT move to the next task until the review completes

9. **Between-task cleanup**
   - `git fetch origin --prune && git clean -fd`
   - Run the install command from CLAUDE.md Key Commands
   - This ensures a clean state before the next task

### Recovery Procedures

**Worktree not set up:**
- Instruct the user to run: `scripts/setup-agent-worktree.sh $ARGUMENTS`
- Or reference `docs/git-workflow.md` section 7 for manual worktree setup

**`git checkout main` fails:**
- This is expected in a worktree. Use `git fetch origin && git checkout -b <branch> origin/main` instead.

**Merge conflicts on PR:**
- `git fetch origin && git rebase origin/main`
- Resolve conflicts, re-run tests, force-push the branch

**Another agent claimed the same task:**
- If Beads: `bd sync` will reveal the conflict — pick a different task
- Without Beads: check open PRs (`gh pr list`) for overlapping work
- Move to the next available unblocked task

**Dependency install fails after cleanup:**
- `git clean -fd` may have removed generated files — re-run the full install sequence
- If persistent, check if another agent's merge changed the dependency file

**Tests fail after fetching latest origin:**
- Determine if failure is from your changes or recently merged work
- If from merged work: fix or flag before continuing
- If from your changes: debug and fix

### Process Rules

1. **Verify worktree first** — Never start implementation without confirming you are in a worktree.
2. **Branch from remote, not local** — Always use `origin/main` as the branch point.
3. **Clean between tasks** — Run cleanup after each task to prevent state leakage.
4. **TDD is not optional** — Write failing tests before implementation. No exceptions.
5. **Quality gates before PR** — Never create a PR with failing checks.
6. **Honor pre-push review when requested** — If the user or project workflow asks for pre-push multi-model review, run `scaffold run review-code` after quality gates and before `git push`.
7. **Code review before next task** — After creating a PR, run `scaffold run review-pr`: three CLI channels (Codex CLI, Gemini CLI, Claude CLI) via MMR plus the Superpowers code-reviewer agent as a complementary 4th channel. Fix all P0/P1/P2 findings before moving on.
8. **Avoid task conflicts** — Check what other agents are working on before claiming.
9. **Follow CLAUDE.md** — It is the authority on project conventions and commands.

---

## After This Step

When this step is complete (all tasks done or session ending), tell the user:

---
**Agent $ARGUMENTS execution session complete.**

**Session summary:**
- Tasks completed: [list task IDs/titles]
- PRs created: [list PR numbers]
- Remaining tasks: [count or "none"]

**If resuming later:** Run `/scaffold:multi-agent-resume $ARGUMENTS` to pick up where this agent left off.

**If all tasks are done:**
- Review `tasks/lessons.md` and add any patterns learned during implementation.
- Consider running `/scaffold:version-bump` for a release.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
