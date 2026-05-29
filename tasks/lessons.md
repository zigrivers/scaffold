# Lessons Learned

Patterns and anti-patterns discovered during development. Review before starting new tasks.

## Patterns (Do This)

<!-- Add patterns as you discover them -->

## Anti-Patterns (Avoid This)

<!-- Add anti-patterns as you discover them -->

- After a refactor that swaps out a helper (e.g. `os.homedir()` → `resolveSessionRoot()`),
  re-run the FULL package gate (`npm run check`), not just the targeted test. A removed last-use
  leaves a dead import that the focused test won't catch but ESLint (and CI) will. Caught on
  PR #413 / Task 17: dropping `os.homedir()` from `review.ts` orphaned `import os from 'node:os'`.

- Do not try to use Beads or `bd` commands in this repository's day-to-day workflow. Legacy `.beads/` artifacts and old docs may still exist, but current work should not assume Beads is an active dependency.

## Common Gotchas

<!-- Add gotchas specific to this project -->

- Historical docs may still mention Beads. Treat those references as stale unless the user explicitly asks to restore Beads support.
