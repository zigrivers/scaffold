# Autonomous MMR Implementation Prompt

Saved from the user request on 2026-05-23.

Execute the four MMR implementation plans end-to-end, in order, from
`/Users/kenallred/Developer/scaffold`:

1. `docs/superpowers/plans/2026-05-22-mmr-t2j-wrapper-stopgap.md`
2. `docs/superpowers/plans/2026-05-22-mmr-v3.28-config-foundations.md`
3. `docs/superpowers/plans/2026-05-22-mmr-v3.29-oss-ready.md`
4. `docs/superpowers/plans/2026-05-22-mmr-v3.30-http-and-loop-control.md`

Read first:

- `CLAUDE.md`
- `docs/git-workflow.md`
- `docs/coding-standards.md`
- `docs/tdd-standards.md`
- `docs/superpowers/specs/2026-05-22-mmr-config-ux-and-round-bounding-design.md`

Progress logs:

- `docs/superpowers/execution-log/mmr-rollout.md`
- `docs/superpowers/execution-log/mmr-deferred-findings.md`

Per task:

1. Start from clean, synced `main`.
2. Create `feat/mmr-<plan-short>-task-<N>-<slug>` branch.
3. Execute task checkboxes in numeric order, following TDD red/green requirements.
4. Commit using the task-specified message.
5. Push branch and create PR against `main`.
6. Wait for CI with `gh pr checks --watch`; fix failures up to the configured stop limit.
7. Run `scaffold run review-pr <PR#>` in foreground.
8. Iterate MMR findings: rounds 1-5 fix P2+; rounds 6+ fix P0/P1 only and defer P2/P3.
9. Squash-merge, delete branch, pull `main`, log result, continue immediately.

Stop only for:

- CI failing after three fix attempts on the same task.
- P0/P1 MMR finding surviving three fix attempts with no progress.
- Unresolvable merge conflict.
- Auth failure requiring interactive recovery.
- True plan/spec gap.
- All 87 tasks complete and final `make check-all` passes.

Bootstrap:

1. Check conventions and plan context.
2. Verify `git fetch origin && git status`.
3. Handle pre-existing dirty state conservatively without committing unrelated files.
4. Verify `gh auth status`.
5. Verify `scaffold run review-pr --help`.
6. Create the two execution-log files and commit/push them to `main` before Task 1.

Important repository instruction: do not use Beads CLI for Scaffold itself.
