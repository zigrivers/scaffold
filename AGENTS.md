# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress --claim  # Claim work (--claim sets BD_ACTOR attribution)
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until the PR is merged and the task is closed.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** — Create Beads tasks for anything that needs follow-up
2. **Run quality gates** (if code changed) — `make check` (tests + lint)
3. **Push, PR, and merge** (if on a feature branch with unmerged work):
   ```bash
   git fetch origin && git rebase origin/main
   git push -u origin HEAD
   gh pr create --title "[BD-<id>] type(scope): description" --body "Closes BD-<id>"
   gh pr merge --squash --delete-branch
   ```
4. **Close tasks and sync**:
   ```bash
   bd close <id>
   bd sync
   ```
5. **Hand off** — Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until the PR is merged and the task is closed
- NEVER push directly to main — always use `gh pr merge --squash --delete-branch`
- NEVER say "ready to push when you are" — YOU must create and merge the PR

