# Spike 3: pytest-testmon warm-DB seeding + rebase churn (spec §10)

**Date run (UTC):** 2026-07-18 01:09:58
**python3 version:** Python 3.14.6
**pytest version:** 9.1.1
**pytest-testmon version:** 2.2.0 (`./venv/bin/pip show pytest-testmon`)
**Script:** `scripts/spikes/testmon-seed-spike.sh`

## Question

pytest-testmon selects tests affected by changed files/methods using a
`.testmondata` SQLite DB built from coverage data on prior runs. Parallel
agent worktrees (per `docs/git-workflow.md` §7) start as fresh checkouts with
no such DB, which would force every worktree's first run to be a full,
un-narrowed run. Does copying a **warmed** `.testmondata` (built by a full run
in the source checkout) into a fresh worktree copy give **correct** affected-
test selection there — narrowing to only the tests touched by a real change,
not stale-passing or over/under-selecting? And separately: when a worktree's
history is rewritten (rebase-like churn — files replaced wholesale rather than
incrementally edited), does testmon **degrade gracefully** (fall back to
running more tests) rather than crash or silently skip affected tests?

## Method

The script built a throwaway two-module Python project (`mod_a.add`,
`mod_b.mul`) with one test file per module, then:

1. Ran `pytest --testmon -q` once in `proj/` to warm `.testmondata` (full run,
   both tests execute and get recorded).
2. Copied the whole `proj/` directory — including the warmed `.testmondata` —
   to `wt1/`, simulating a fresh worktree seeded with a warm DB. This mirrors
   the `WORKTREE_SETUP_COMMANDS` hook in
   `content/assets/agent-ops/git/setup-agent-worktree.sh.tmpl` (templated from
   `.scaffold/agent-ops.yaml`'s `worktree_setup_commands`, consumed via
   `src/core/agent-ops/install.ts`'s `WORKTREE_SETUP_COMMANDS` substitution) —
   the point in generated projects where a warm-DB copy step would run when a
   new worktree is created.
3. Edited only `wt1/src/mod_a.py` (changed `add`'s body) and re-ran
   `pytest --testmon -q` in `wt1/`. Asserted the output contains `1 passed`
   (only `test_add`, the affected test, ran — not both).
4. Simulated rebase-like history churn: overwrote `wt1/src/mod_a.py` wholesale
   with `proj/src/mod_a.py`'s original content (reverting it, as a rebase
   might land a file back to an earlier state) and overwrote
   `wt1/src/mod_b.py` wholesale with a changed body, then re-ran
   `pytest --testmon -q`. Asserted the output contains `1 passed` or
   `2 passed` (testmon is allowed to over-select here and re-run both — the
   requirement is only that it doesn't crash or leave a test unexamined).

## Result

```
2 passed in 0.04s
.                                                                        [100%]
1 passed in 0.03s
..                                                                       [100%]
2 passed in 0.03s
VERDICT: SEEDING WORKS — warm-DB copy narrows selection; churn degrades to re-running, never crashing
```

Exit code: `0`.

- Warm run in `proj/`: `2 passed` (both tests, expected for the initial full
  run that builds `.testmondata`).
- Post-copy, single-file-change run in `wt1/`: `.` (one test collected) /
  `1 passed` — testmon correctly narrowed selection to `test_add` only,
  using the DB copied from `proj/`, in a directory it had never itself run
  in before. `test_mul` was correctly skipped as unaffected.
- Post-churn run in `wt1/` (both files wholesale-replaced): `..` (two tests
  collected) / `2 passed` — after simulated history rewrite, testmon widened
  back to running both tests rather than crashing or under-selecting. No
  error, non-zero exit, or traceback anywhere in the run.

## Verdict

**SEEDING WORKS — copying a warmed `.testmondata` into a fresh checkout gives
correct affected-test selection, and rebase-like history churn degrades
gracefully to re-running more tests rather than crashing or silently
skipping affected tests.**

Consumed by Plan 3 Task 4 (knowledge entry): document the warm-DB copy
(`.testmondata`) as part of worktree setup — i.e. a `worktree_setup_commands`
entry (or equivalent step) that copies the primary checkout's `.testmondata`
into a newly created worktree — rather than accepting a cold-start full run
in every fresh worktree.

## Caveats

- Small, synthetic two-module/two-test project run once interactively on a
  single machine (macOS, APFS, Python 3.14.6, pytest 9.1.1,
  pytest-testmon 2.2.0). It demonstrates correct narrowing and graceful
  degradation for this shape of change, not an exhaustive proof across large
  codebases, deeply nested imports, or non-Python-source dependencies (data
  files, C extensions) that testmon's coverage-based tracking may handle
  differently.
- "Rebase churn" here is approximated as wholesale file-content replacement
  (reverting one file, changing another) rather than an actual `git rebase`
  invocation with `.testmondata` present in the working tree throughout.
  testmon keys off content, not git history, so this is expected to be
  representative, but a real rebase (with intermediate checkouts) is
  untested.
- The DB copy step itself (`cp -R proj wt1`) is a same-filesystem, same-
  machine copy. Cross-filesystem copies, or copying `.testmondata` alone
  (rather than the whole directory) into a worktree that git already
  populated via `git worktree add`, were not separately exercised — the
  `worktree_setup_commands` hook implementation should copy only
  `.testmondata` (not the whole tree, which git worktree already provides)
  and this spike's whole-directory copy is a stand-in for that narrower
  operation.
