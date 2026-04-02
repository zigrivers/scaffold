# Agent Instructions

This repository does not use Beads for repo task tracking. Do not use the
Beads CLI when working on Scaffold itself.

## Quick Reference

```bash
make check            # Run bash quality gates (lint + validate + test + eval)
make check-all        # Run all quality gates (bash + TypeScript)
git status -sb        # Inspect local state quickly
git pull --rebase     # Rebase onto latest remote state
git push              # Publish local commits
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File follow-up work** - Record anything still needing work in the current tracker or leave explicit handoff notes
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update follow-up status** - Make sure remaining work is reflected in the current tracker or handoff
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
