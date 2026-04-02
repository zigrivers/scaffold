# Agent Instructions

This repository does not use Beads for repo task tracking. Do not use the
Beads CLI when working on Scaffold itself.

## Quick Reference

```bash
make check            # Run bash quality gates (lint + validate + test + eval)
make check-all        # Run all quality gates (bash + TypeScript); full pre-push gate
git status -sb        # Inspect local state quickly
git pull --rebase     # Rebase onto latest remote state
git push              # Publish local commits
```

## Scaffold Releases

When releasing Scaffold itself, follow `docs/v2/operations-runbook.md` instead
of the generic `/scaffold:release` guidance.

- Update `CHANGELOG.md` and `README.md` when user-facing behavior, install or
  upgrade steps, migration instructions, or command semantics changed.
- Merge the release-prep commit/PR to `main` before tagging.
- Tag merged `main` as `vX.Y.Z` and push the tag.
- Create the GitHub release.
- `publish.yml` uses npm trusted publishing via GitHub OIDC; if npm publish
  fails with auth errors, verify the trusted-publisher config in npm package
  settings rather than looking for a repo `NPM_TOKEN` secret.
- Verify the `publish.yml` and `update-homebrew.yml` workflows succeeded so
  users can update via `npm update -g @zigrivers/scaffold` and
  `brew upgrade scaffold`.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File follow-up work** - Record anything still needing work in the current tracker or leave explicit handoff notes
2. **Run quality gates** (if code changed) - Run `make check-all` as the full gate before push/hand-off
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
