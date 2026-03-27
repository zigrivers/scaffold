---
description: "Configure git workflow for parallel agents"
long-description: "Sets up docs/git-workflow.md with branching strategy, PR workflow, CI configuration, and worktree scripts for parallel agent execution."
---

Create `docs/git-workflow.md` and configure the repository to support parallel Claude Code sessions working simultaneously without conflicts.

Review CLAUDE.md, docs/tech-stack.md, and docs/coding-standards.md to understand the existing project conventions.

**Command placeholders:** This prompt uses `<install-deps>`, `<lint>`, and `<test>` as placeholders. When creating `docs/git-workflow.md`, replace these with the actual commands from the project's CLAUDE.md Key Commands table (e.g., `npm install`, `make lint`, `make test`). These are configured by the Dev Setup prompt.

## Beads Detection

Check if `.beads/` directory exists. This determines task management conventions throughout:
- **Beads project**: `.beads/` exists → use `bd` CLI for task tracking, `[BD-<id>]` commit prefixes, `bd-<id>/<desc>` branch naming, `BD_ACTOR` for parallel agents
- **Non-Beads project**: `.beads/` does not exist → use conventional commits (`type(scope): description`), standard branch naming (`<type>/<desc>`, e.g. `feat/add-auth`, `fix/login-bug`), skip all `bd` command references

Apply this detection throughout. Sections below use **"If Beads:"** / **"Without Beads:"** where conventions differ.

## Mode Detection

Before starting, check if `docs/git-workflow.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:git-workflow v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`CLAUDE.md`, `docs/dev-setup.md`, `docs/coding-standards.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:git-workflow v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/git-workflow.md`
- **Secondary output**: `scripts/setup-agent-worktree.sh`, CI config files, CLAUDE.md workflow sections
- **Preserve**: CI job names (branch protection references these), worktree script customizations, branch naming conventions, PR template customizations
- **Related docs**: `CLAUDE.md`, `docs/dev-setup.md`, `docs/coding-standards.md`
- **Special rules**: Never rename CI jobs without checking branch protection rules. Preserve worktree directory naming conventions. Keep the setup-agent-worktree.sh script's customizations intact.

## The Core Problem

Multiple Claude Code agents will work in parallel, each picking up tasks and working on separate feature branches, pushing, creating PRs, and merging into main concurrently. The workflow must prevent merge conflicts, a broken main branch, and agents stepping on each other's work.

## CRITICAL: Permanent Worktrees for Parallel Agents

Git only allows ONE branch checked out per working directory. Multiple Claude Code sessions in the same directory will fight over the git working tree — switching branches, stashing work, and corrupting changes.

**Solution: Each agent gets a permanent worktree created once. Agents use normal git branching inside their worktree.**

```
project/                  # Main repo (your orchestration point)
project-agent-1/          # Agent 1's permanent worktree
project-agent-2/          # Agent 2's permanent worktree
project-agent-3/          # Agent 3's permanent worktree
```

### Setup Script

Create `scripts/setup-agent-worktree.sh`:

```bash
#!/bin/bash
# Creates a permanent worktree for a Claude Code agent.
# Run once per agent. Agents use normal git branching inside their worktree.
# Usage: ./scripts/setup-agent-worktree.sh <agent-name>
# Example: ./scripts/setup-agent-worktree.sh Agent-1

set -e

AGENT_NAME="$1"

if [ -z "$AGENT_NAME" ]; then
    echo "Usage: $0 <agent-name>"
    echo "Example: $0 Agent-1"
    exit 1
fi

REPO_NAME=$(basename "$(pwd)")
# Normalize agent name for directory (lowercase, hyphens)
DIR_SUFFIX=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
WORKTREE_DIR="../${REPO_NAME}-${DIR_SUFFIX}"

if [ -d "$WORKTREE_DIR" ]; then
    echo "⚠️  Worktree already exists: $WORKTREE_DIR"
    echo "   To launch: cd $WORKTREE_DIR && claude"
    exit 0
fi

git fetch origin

# Can't checkout main in multiple worktrees, so each agent gets a workspace branch
WORKSPACE_BRANCH="${DIR_SUFFIX}-workspace"
git worktree add "$WORKTREE_DIR" -b "$WORKSPACE_BRANCH" origin/main

echo ""
echo "✅ Permanent worktree created: $WORKTREE_DIR"
echo ""
echo "To launch Claude Code in this worktree:"
echo "  cd $WORKTREE_DIR && claude"
echo ""
echo "This worktree is reusable across tasks. Do NOT remove it between tasks."
echo ""
echo "Agents create feature branches from origin/main:"
echo "  git fetch origin"
echo "  git checkout -b <type>/<desc> origin/main"
```

Make executable: `chmod +x scripts/setup-agent-worktree.sh`

### Agent Identity with BD_ACTOR (Beads only)

> **Skip this section if the project does not use Beads.**

Beads resolves task assignee from: `--actor flag` > `$BD_ACTOR env var` > `git config user.name` > `$USER`

Without BD_ACTOR, all agents show as your git username, making it impossible to tell which agent owns which task.

```bash
# Launch agents with distinct identities (Beads projects)
cd ../project-agent-1 && BD_ACTOR="Agent-1" claude
cd ../project-agent-2 && BD_ACTOR="Agent-2" claude
```

### Full Parallel Launch Workflow

**One-time setup (run from main repo):**
```bash
./scripts/setup-agent-worktree.sh Agent-1
./scripts/setup-agent-worktree.sh Agent-2
./scripts/setup-agent-worktree.sh Agent-3
```

**Launch agents (each in its own terminal):**
```bash
# Without Beads:
cd ../project-agent-1 && claude
cd ../project-agent-2 && claude

# With Beads (adds BD_ACTOR for task attribution):
cd ../project-agent-1 && BD_ACTOR="Agent-1" claude
cd ../project-agent-2 && BD_ACTOR="Agent-2" claude
```

**Inside their worktree, agents branch directly from origin/main:**
```bash
git fetch origin
git checkout -b <type>/<description> origin/main   # e.g., feat/add-auth
# work, commit, push, PR, watch CI, confirm merge...
git fetch origin --prune
git clean -fd
<install-deps>
# Continue to next task — create next feature branch from origin/main
git checkout -b <type>/<next-description> origin/main
```

**If Beads:** Use `bd-<task-id>/<desc>` branch naming, run `bd close <id> && bd sync` after merge, and `bd ready` to find next task.

**Note:** Worktree agents cannot `git checkout main` (main is checked out in the main repo). They always branch from `origin/main` and never return to main between tasks. Merged feature branches accumulate locally and are batch-cleaned periodically (see Cleanup section).

### How Many Agents to Run

Match agent count to available parallel work, not some arbitrary max:
- Only spin up as many agents as there are independent, non-overlapping tasks
- If two tasks touch the same files, don't run them in parallel — sequence them instead
- Running more agents than available parallel tasks wastes resources and invites conflicts
- **If Beads:** Run `bd ready` to see how many unblocked tasks exist. Use Beads dependencies to enforce sequencing.

### Worktree Maintenance

Permanent worktrees accumulate stale build artifacts and dependencies between tasks. Agents should clean their workspace between tasks:

```bash
git fetch origin --prune
git clean -fd
<install-deps>
```

To batch-clean merged feature branches (run periodically):
```bash
git fetch origin --prune
git branch --merged origin/main | grep -v "^\*\|workspace" | xargs -r git branch -d
```

### Worktree Management Commands

| Command | Purpose |
|---------|---------|
| `git worktree list` | Show all active worktrees |
| `git worktree add <path> <branch>` | Create new worktree |
| `git worktree remove <path>` | Remove worktree (only when reducing agent count) |
| `git worktree prune` | Clean up stale worktree references |

### Single-Agent Mode

If running only ONE Claude Code session at a time, worktrees are not needed. Standard branching in the main directory works fine.

## What the Document Must Cover

### 1. Branching Strategy

**If Beads:**
- Branch naming: `bd-<task-id>/<short-description>` (tied to Beads task IDs)
- Rule: one Beads task = one branch = one PR (no multi-task branches)
- Always branch from `origin/main`: `git checkout -b bd-<task-id>/<desc> origin/main`

**Without Beads:**
- Branch naming: `<type>/<short-description>` (e.g., `feat/add-auth`, `fix/login-bug`, `docs/update-readme`)
- Rule: one logical change = one branch = one PR
- Always branch from `origin/main`: `git checkout -b <type>/<desc> origin/main`

**Both:**
- Branch lifecycle: create from origin/main → work → PR → squash merge → delete branch
- Stale branch policy: branches open longer than 2 days should be rebased or split into smaller tasks

### 2. Commit Standards

**If Beads:** Commit message format: `[BD-<id>] type(scope): description`
**Without Beads:** Commit message format: `type(scope): description` (conventional commits)

- Types: feat, fix, test, refactor, docs, chore
- Commit on each meaningful change — passing tests, completed function, etc.
- Never commit: secrets, .env files, large binaries, build artifacts
- Put the format in CLAUDE.md and trust agents to follow it (no validation hooks needed — they add friction and derail agents on formatting trivia)

### 3. Rebase Strategy for Parallel Agents

**Use rebase, not merge commits.** With squash-merge PRs, rebase keeps history clean and simple.

- Before creating a PR, always rebase onto latest main: `git fetch origin && git rebase origin/main`
- If rebase produces conflicts the agent cannot resolve confidently, it should: stop, push the branch as-is, note the conflict in the PR description, and move to the next task
- Only use `--force-with-lease` on feature branches, never force push to main

### 4. PR Workflow

**Main branch is protected. Agents NEVER push directly to main.** The complete workflow:

```bash
# 1. Commit changes
git add .
git commit -m "type(scope): description"       # Without Beads
git commit -m "[BD-<id>] type(scope): description"  # With Beads

# 2. AI review (catch issues before external review)
# Spawn a review subagent with fresh context:
# - Read git diff origin/main...HEAD
# - Check against CLAUDE.md and docs/coding-standards.md
# - Report P0 (blocking), P1 (must fix), P2 (should fix), P3 (optional)
# Fix all P0/P1 findings, then re-run make check (or project lint+test)
# If a finding matches a recurring pattern, log it to tasks/lessons.md (if it exists)
# Commit fixes: git commit -m "fix: address review findings"

# 3. Rebase onto latest main
git fetch origin && git rebase origin/main

# 4. Push feature branch
git push -u origin HEAD

# 5. Create PR
gh pr create --title "type(scope): description" --body "Summary of changes"
# With Beads: --title "[BD-<id>] type(scope): description" --body "Closes BD-<id>"

# 6. Enable auto-merge (merges after CI passes, deletes remote branch)
gh pr merge --squash --auto --delete-branch

# 7. Watch CI (blocks until checks pass or fail)
gh pr checks --watch --fail-fast
# If a check fails: fix locally, commit, push, re-run watch

# 8. Confirm merge
gh pr view --json state -q .state   # Must show "MERGED"
# NEVER close the task until this shows MERGED
```

**Key PR commands:**

| Command | Purpose |
|---------|---------|
| `gh pr create --title "..." --body "..."` | Create PR from current branch |
| `gh pr merge --squash --auto --delete-branch` | Queue auto-merge after CI passes |
| `gh pr checks --watch --fail-fast` | Watch CI, block until pass or fail |
| `gh pr view --json state -q .state` | Confirm merge completed |
| `gh pr list` | List open PRs |

**Why `--squash --auto --delete-branch`:**
- `--squash`: All branch commits become one clean commit on main
- `--auto`: Queues merge for when CI passes
- `--delete-branch`: Removes remote branch after merge (local cleaned up in task closure)

**If merge is blocked:**
- Don't use `--admin` to bypass CI
- Watch with `gh pr checks --watch --fail-fast`, fix failures, push, re-watch

### 5. Branch Cleanup and Next Task

After merge is confirmed:

**Single agent (main repo):**
```bash
git checkout main && git pull --rebase origin main
git branch -d <branch-name>                # Local only; remote deleted by --delete-branch
git fetch origin --prune                    # Clean up stale remote refs
```

**Worktree agent:**
```bash
git fetch origin --prune                    # Clean up stale remote refs
git clean -fd
<install-deps>
# Next task branches directly from origin/main:
git checkout -b <type>/<desc> origin/main
```

**If Beads**, also run after merge: `bd close <id> && bd sync`. Then `bd ready` to find the next task.

Worktree agents cannot checkout main (it's checked out in the main repo). They always branch from `origin/main`. Merged local branches accumulate and are batch-cleaned periodically (see Worktree Maintenance).

### 6. Agent Crash / Stale Work Recovery

When an agent session dies mid-task:

1. **Check the worktree state:**
   ```bash
   cd ../project-agent-N
   git status                    # See uncommitted work
   git log --oneline -5          # See what was committed
   ```
   **If Beads:** `bd list --actor Agent-N` to see what task was claimed.

2. **If work is salvageable:** Commit it, push the branch, create the PR (or resume work in a new session)

3. **If work should be discarded:**
   ```bash
   # Single agent (main repo):
   git checkout main && git pull --rebase origin main
   git branch -D <stale-branch>

   # Worktree agent (use the workspace branch created during setup):
   git checkout <agent-name>-workspace
   git branch -D <stale-branch>

   # If Beads, unclaim the task:
   # bd update <task-id> --status ready
   ```

4. **Reset the worktree to clean state:**
   ```bash
   git clean -fd
   <install-deps>
   ```

### 7. Main Branch Protection

Configure branch protection on main with **CI checks required, but no human review gate** (since you're the sole developer orchestrating agents):

```bash
# Configure via GitHub CLI (run once)
gh api repos/{owner}/{repo}/branches/main/protection -X PUT -f \
  required_status_checks='{"strict":true,"contexts":["check"]}' \
  enforce_admins=false \
  required_pull_request_reviews=null \
  restrictions=null
```

**Important:** The `contexts` value must match the CI job name. The CI template (above) uses job name `check`, so use `"contexts":["check"]`. If your CI uses a different job name, update the context to match. After the first PR triggers CI, verify the exact status check context name with:
```bash
gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs --jq '.check_runs[].name'
```

**If the `gh api` command fails**, configure branch protection via the GitHub web UI:
1. Go to Settings → Branches → Add branch protection rule
2. Branch name pattern: `main`
3. Check: "Require status checks to pass before merging"
4. Search and add status check: `check` (or your CI job name)
5. Uncheck: "Require a pull request before merging" (or set required reviewers to 0)

What this gives you:
- PRs must pass CI before merging
- No review approval required (you're the only human)
- `enforce_admins=false` lets you push directly in emergencies
- Agents cannot accidentally push to main

If main breaks: you fix it directly with a hotfix PR, or push directly if `enforce_admins` is false.

### 8. Conflict Prevention

Keep it simple with one core rule:

> **If two tasks touch the same files, don't run them in parallel.** Sequence them instead.

Additional guardrails:
- Keep PRs small and focused (one logical change = one PR). Smaller changes merge faster and conflict less.
- Rebase before creating PRs to catch conflicts early
- High-conflict files (route indexes, DB schemas, shared types) should be modified by one agent at a time
- **If Beads:** enforce sequencing via `bd dep add <child> <parent>` dependencies

### 9. .gitignore and Repository Hygiene
- Ensure .gitignore is comprehensive for the project's tech stack
- Files that must be tracked vs. generated
- No code quality git hooks (linting, type checking, test runs) — let CI be the gatekeeper
- **If Beads:** Beads data-sync hooks (`bd hooks install`) are the one exception — these sync task tracking data, not code quality checks

### 10. Update CLAUDE.md

Add the following sections to CLAUDE.md:

**In Session Start section, add parallel agent note:**
```markdown
**If running multiple agents in parallel**: Each agent MUST be in its own permanent worktree. See docs/git-workflow.md for setup.
```

**Add Committing and PR Workflow section:**
```markdown
### Committing and Creating PRs

**NEVER push directly to main** — it's protected. Always use feature branches and PRs:

1. Commit: `git add . && git commit -m "type(scope): description"` (If Beads: prefix with `[BD-<id>]`)
2. AI review: spawn a review subagent to check `git diff origin/main...HEAD` against CLAUDE.md and docs/coding-standards.md — fix P0/P1 findings, re-run lint+test
3. Rebase: `git fetch origin && git rebase origin/main`
4. Push: `git push -u origin HEAD`
5. Create PR: `gh pr create --title "type(scope): description" --body "Summary"` (If Beads: include `[BD-<id>]` in title, `Closes BD-<id>` in body)
6. Auto-merge: `gh pr merge --squash --auto --delete-branch`
7. Watch CI: `gh pr checks --watch --fail-fast` (fix failures, push, re-watch)
8. Confirm: `gh pr view --json state -q .state` — must show "MERGED"
```

**Add Branch Cleanup and Next Task section:**
```markdown
### Branch Cleanup and Next Task

After merge is confirmed (step 8 above):

**Single agent (main repo):**
```bash
git checkout main && git pull --rebase origin main
git branch -d <branch-name>
git fetch origin --prune
```

**Worktree agent:**
```bash
git fetch origin --prune
git clean -fd
<install-deps>
# Next task branches directly from origin/main:
git checkout -b <type>/<desc> origin/main
```

If Beads: also run `bd close <id> && bd sync` after merge, and `bd ready` to find next task.

- If tasks remain: create a feature branch and implement the next one
- If none remain: session is complete
- **Keep working until no tasks remain**

**Note:** Worktree agents cannot checkout main (it's checked out in the main repo). They always branch from `origin/main`. Merged branches are batch-cleaned periodically.
```

**Add Parallel Sessions section:**
```markdown
### Parallel Sessions (Worktrees)

When running **multiple Claude Code agents simultaneously**, each MUST have its own permanent git worktree (agents sharing a directory will corrupt each other's work).

If Beads: also set BD_ACTOR environment variable for task attribution.

**One-Time Setup (run from main repo):**
```bash
./scripts/setup-agent-worktree.sh Agent-1
./scripts/setup-agent-worktree.sh Agent-2
./scripts/setup-agent-worktree.sh Agent-3
```

**Launching Agents:**
```bash
cd ../project-agent-1 && claude
cd ../project-agent-2 && claude
# If Beads: BD_ACTOR="Agent-1" claude (for task attribution)
```

Inside their worktree, agents branch directly from `origin/main` (they cannot checkout main). Between tasks:
```bash
git fetch origin --prune
git clean -fd && <install-deps>
```
```

**Add Worktree Awareness section:**
```markdown
### Worktree Awareness

If you are in a permanent worktree:
- **Never run `git checkout main`** — main is checked out in the main repo; this will fail
- Always branch from remote: `git checkout -b <type>/<desc> origin/main` (If Beads: `bd-<id>/<desc>`)
- Clean workspace between tasks: `git fetch origin --prune && git clean -fd && <install-deps>`
- **If Beads:** Verify your identity: `echo $BD_ACTOR` should show your agent name
- To detect if in a worktree: `git rev-parse --git-dir` contains `/worktrees/`
- Merged branches accumulate — they're batch-cleaned periodically, not per-task
```

**Add Code Review section:**
```markdown
### Code Review

Before pushing, spawn a review subagent to check `git diff origin/main...HEAD` against CLAUDE.md and docs/coding-standards.md:
- Look for: convention violations, missing tests, security issues, logic errors
- Fix P0/P1 findings, re-run lint+test
- Log recurring patterns to tasks/lessons.md
```

**Add to Quick Reference table:**
| Command | Purpose |
|---------|---------|
| `./scripts/setup-agent-worktree.sh <n>` | Create permanent worktree for agent |
| `git worktree list` | List all active worktrees |
| `gh pr create --title "..." --body "..."` | Create PR from current branch |
| `gh pr merge --squash --auto --delete-branch` | Queue auto-merge after CI passes |
| `gh pr checks --watch --fail-fast` | Watch CI until pass or fail |
| `gh pr view --json state -q .state` | Confirm merge completed |

If Beads, also include:
| `BD_ACTOR="Agent-1" claude` | Launch agent with Beads identity |
| `bd close <id>` | Close completed task |

**Add row to "When to Consult Other Docs" table:**
| Situation | Document |
|-----------|----------|
| Running multiple agents in parallel | docs/git-workflow.md |

## What to Configure in the Repository

After creating the documentation, actually set up:
- [ ] `scripts/setup-agent-worktree.sh` for permanent agent worktrees
- [ ] Branch protection on main: CI required, no review required (use `gh api` command from Section 7)
- [ ] PR template (`.github/pull_request_template.md`)
- [ ] .gitignore appropriate for the project's tech stack
- [ ] CI workflow file for automated checks on PRs (see below)
- [ ] `tasks/lessons.md` — if it doesn't already exist, create it for cross-session learning

### CI Workflow File

Create `.github/workflows/ci.yml` using the project's actual lint and test commands from CLAUDE.md Key Commands table. The template below uses placeholders — replace them with the real commands from `docs/dev-setup.md`:

```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup environment
        # Add language/runtime setup per docs/tech-stack.md
        # e.g., uses: actions/setup-node@v4 / actions/setup-python@v5

      - name: Install dependencies
        run: <install-deps>

      - name: Lint
        run: <lint>

      - name: Test
        run: <test>
```

The `check` job name must match what's referenced in branch protection rules (Section 7). If the status check context name is different (e.g., `check / check`), update the branch protection accordingly.

### PR Template

Create `.github/pull_request_template.md`:

```markdown
## type(scope): description

### What
<!-- Brief description of changes -->

### Testing
- [ ] All tests pass
- [ ] New tests added for new behavior
- [ ] Lint passes
- [ ] Manually verified (if UI change)

### Screenshots
<!-- If UI change, include before/after or key states -->
```

## What This Document Should NOT Be
- A git tutorial — assume agents know git commands
- Theoretical — every rule should be actionable
- Separate from CLAUDE.md — update CLAUDE.md to reference the git workflow doc

## Process
- After creating docs and configuration, commit everything to the repo
- Test the workflow by verifying branch protection and CI checks are active

## After This Step

When this step is complete, tell the user:

---
**Phase 3 in progress** — `docs/git-workflow.md` created, CI configured, worktree script ready.

**Next (choose one):**
- **(Optional)** Run `/scaffold:automated-pr-review` — Set up automated PR review with external reviewers.
- If your project has a **web frontend and/or mobile app**: Skip to `/scaffold:add-e2e-testing` — Configure E2E testing (starts Phase 4).
- If **neither**: Skip to `/scaffold:user-stories` — Create user stories (starts Phase 5).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
