# Review Standards

The policy the `review-pr` and `review-code` tools follow. The meta-prompts own
*dispatch* (they call `mmr review`); this doc owns *policy* (what to fix, when to
stop, how to read the verdict). MMR's per-channel mechanics live in the `mmr`
skill/guide and the `multi-model-review-dispatch` knowledge entry.

## Channels

A PR/code review runs the MMR built-in CLI channels **plus** the Superpowers
agent channel:

1. **Codex CLI** — implementation correctness, security, API contracts.
2. **Claude CLI** — code quality, tests, plan alignment.
3. **Grok CLI** — independent second opinion on correctness and code quality.
4. **Antigravity CLI** (`agy`) — architectural patterns, broad-context reasoning.
5. **Superpowers code-reviewer** — the only reviewer with the session's plan,
   acceptance criteria, and conversation context. Dispatched by the agent and
   reconciled into the same MMR job via `mmr reconcile --channel superpowers`.
   Mandatory on Claude Code; harnesses without the skill (e.g. the Codex
   executor path) run channels 1–4 only, by design.

Channels are **independent** — never share one channel's output with another.
CLI channels are **foreground only**: never background them (`&`, `nohup`,
`run_in_background`) — background execution produces empty output.

## Fix threshold

Fix every finding at or above the **fix threshold**. The project default is
`P2` (set in `.mmr.yaml` `defaults.fix_threshold`); override per-run with
`--fix-threshold P0|P1|P2|P3`. `P2` means: fix P0, P1, and P2 findings; P3 is
advisory.

## Bounded review cycles

MMR enforces a **maximum of three rounds per review cycle**. The meta-prompts
pass `--session <target>-cycle-<C> --round <N> --max-rounds 3`, incrementing
`--round` after each repair. `--round` is required: without it, every call looks
like round 1 and the cap never fires. A cycle never dispatches round 4.
On resume, recover the active cycle and round from the PR disposition ledger and
MMR session history; use cycle 1 only when neither records a prior review.

Every semantic finding receives exactly one finite, evidence-backed
disposition: `fix-now`, `block`, `reject:<reason>`, or an eligible follow-up.
Agents reproduce, refute, deduplicate, classify, and disposition findings from
the code and acceptance criteria. A model's severity label alone never controls
the decision.

MMR still gates on unacknowledged threshold findings. For a verified refutation,
duplicate, or stale finding, copy the evidence into the PR disposition ledger,
then run `mmr ack add <finding-key> --job <job-id> --scope job --reason
"reject: <evidence>"` and recompute with `mmr results <job-id>`. The finding stays
visible but no longer blocks that immutable review job. Use `--scope job`, never
the persistent project or user scopes, for an agent disposition. Never
acknowledge a verified `fix-now` or `block` item, and never use an acknowledgment
to hide a required-safeguard defect.

At round three, a reproducible defect within the original acceptance criteria
or a required safeguard may start a new bounded cycle on the same PR only after
the agent has made a concrete repair, added or updated focused regression proof,
and rerun the required gate. Increment the cycle, reset `ROUND` to 1, and review
the new exact head. The same rule applies to local review targets.

Duplicate, stale, hypothetical, speculative, cosmetic, or already-dispositioned
findings cannot start a new cycle. Do not run another round merely to obtain a
cleaner model response. MMR's `finding_key` helps identify recurrence, but the
agent must also collapse materially reworded reports of the same root cause.
A reworded recurrence without a materially new, reproducible defect is duplicate
suggestion churn and cannot restart a cycle.

Continue bounded remediation until every root cause has a disposition and no
verified fix-now or block item remains. No owner approval is required for
in-scope remediation. An unresolved required safeguard defect is not a plateau;
keep repairing it. Stop when the user asks to stop. Otherwise stop only for a
true external dependency, missing credentials or authority, a destructive
action, a material product decision outside the acceptance criteria, or a
demonstrated technical plateau after safe approaches are exhausted. Record exact
evidence for the stop. Required
safeguards include security, privacy, and data integrity, plus accessibility and
every repository or product safeguard named by project instructions.

An unchanged exact target gets at most one same-round retry after
`needs-user-decision`. If that retry also cannot meet the channel floor, record
the channel failures and stop on the external dependency or missing credentials.
Do not start a remediation cycle, change product code, or lower the floor merely
to retry identical content. A verified blocker still outranks the channel floor
and follows the repair rule above.

## Verify, don't dismiss

Treat every finding as real until you have verified otherwise in the code. A
finding you cannot reproduce is a finding to investigate, not to wave away. When
you do dismiss one, say why in the review summary.

## Verdict handling

`mmr review --sync` returns one verdict and a matching exit code:

| Verdict | Exit | Meaning | Action |
|---|---|---|---|
| `pass` | 0 | all channels completed, gate passed | proceed (merge / commit / push) |
| `degraded-pass` | 0 | gate passed, at least `min_completed_channels` reported, but a channel was skipped or compensated | proceed; note the degradation |
| `blocked` | 2 | an unresolved finding sits at or above the threshold | fix it in the current cycle; at round three apply the bounded-cycle rule above |
| `needs-user-decision` | 3 | no channel completed, **too few channels completed to corroborate**, the reviewed diff proposes an untrusted project configuration or persistent acknowledgment change, or an attempted review exceeds the cycle round cap | restore the floor, stop for missing authority until a human ratifies verified persistent trust changes, or apply the bounded-cycle and stopping rules above |

Never merge on `blocked` or `needs-user-decision`. Cross-check each finding's
`location` against the reviewed diff's file list (`gh pr diff <n> --name-only`
for PRs); out-of-diff findings are contamination noise. Merge only when the
final exact head has completed the configured MMR channel floor, required gates
are green, every finding is dispositioned, and no verified blocker remains.

## Completion floor

A passing gate is only as good as the number of channels that actually
reported. `defaults.min_completed_channels` (default **2**) is the floor: below
it, a passing gate returns `needs-user-decision` instead of a pass.

Before this floor existed, two shapes of thin evidence read as approval —
`degraded-pass 2/6`, where four channels were silent and the verdict was still
exit 0, and `pass 1/1`, which wasn't even *marked* degraded because a single
dispatched channel that completes satisfies `completed === dispatched`. A
ratio-based floor catches the first and misses the second, so the floor is an
absolute count.

The headline reflects it too: a degraded pass renders as
`PASSED (DEGRADED — 3/6 channels)` rather than a bare `PASSED`.

Projects that deliberately run one channel opt in explicitly:

```yaml
defaults:
  min_completed_channels: 1
```

## Degraded channels

MMR distinguishes **transient** degradation (auth expired, timeout, runtime
error) from **structural** absence (CLI not installed):

- **Transient** failures of an external channel (Codex, Grok, Antigravity) are
  auto-compensated by a focused `claude -p` pass, labeled
  `[compensating: <channel>-equivalent]` — single-source confidence. When any
  channel is compensated, the maximum achievable verdict is `degraded-pass`.
- **Structural** absence is skipped by default and surfaced with a remediation.
  Install the CLI, mark it `required: true`, pass `--compensate-missing`, or
  `mmr config disable <name>` to stop dispatching it. Run `mmr doctor` to
  classify channels and apply safe fixes.

Auth failures are **never silent** — surface the recovery command
(`codex login`, `grok login`, `agy -p "hello"`).
