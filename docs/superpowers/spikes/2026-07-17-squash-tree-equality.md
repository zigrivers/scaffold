# Spike 1: squash-tree equality (spec D9)

**Date:** 2026-07-17
**gh version:** gh version 2.96.0 (2026-07-02) — https://github.com/cli/cli/releases/tag/v2.96.0
**Script:** `scripts/spikes/squash-tree-spike.sh`

## Question

Does sequential `gh pr merge --squash` reproduce the tree that results from
locally squash-applying the same PRs, in the same order, onto the same base?
The batch-then-land design in the merge-queue daemon (`scaffold mq`) asserts
`origin/<base>^{tree}` equals the tested candidate tree after landing — this
spike verifies that invariant live against GitHub before the daemon is built
on top of it.

## Method

The script created a throwaway private repo (`mq-squash-spike-1784296054`)
under the authenticated user (`zigrivers`) and exercised three cases in one
run:

- **Case A** — two clean PRs (`pr-a`, `pr-b`) landed sequentially.
- **Case B** — a third PR (`pr-c`) containing a merge commit from `main`
  (main moved after `pr-c` branched, then `pr-c` merged `main` back in
  before being opened).
- **Case C** — all three PRs touch different files (`a.txt`, `b.txt`,
  `c.txt`, `moved.txt`) and are landed together as a batch.

It computed a local candidate tree by `git merge --squash` of `origin/pr-a`,
`origin/pr-b`, `origin/pr-c` in order onto `origin/main`, then landed the
same three PRs for real via `gh pr merge <n> --squash --delete-branch` in
the same order, and compared `candidate^{tree}` to the post-land
`origin/main^{tree}`.

## Result

```
local candidate tree:  0c587e19579cb35f83944a4d30aa1f60c0c01ce7
post-land origin tree: 0c587e19579cb35f83944a4d30aa1f60c0c01ce7
VERDICT: MATCH — D9 landing design confirmed
```

Both trees are identical. GitHub's sequential `gh pr merge --squash` landings
reproduced the exact tree that local sequential `git merge --squash` produced
for all three cases, including the PR containing a merge commit from a moved
`main` (Case B).

## Cleanup note

The script's own `gh repo delete` cleanup step failed — the authenticated
token lacks the `delete_repo` scope (`HTTP 403: Must have admin rights to
Repository … This API operation needs the "delete_repo" scope. To request
it, run: gh auth refresh -h github.com -s delete_repo`). This is the
documented, acceptable failure mode noted in the script's cleanup trap. The
throwaway repo **`zigrivers/mq-squash-spike-1784296054`** was left behind on
GitHub (private) and needs manual deletion, either via the GitHub UI or by
running `gh auth refresh -h github.com -s delete_repo` (interactive) and
re-running `gh repo delete zigrivers/mq-squash-spike-1784296054 --yes`.

## Verdict

**MATCH — D9 landing design confirmed.**

Consumed by Task 10 of `2026-07-17-merge-queue-engine.md`: landing uses
`gh pr merge --squash` + post-land tree assertion.
