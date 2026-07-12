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

## Round budget

Round-bounding is enforced **natively** by MMR — the meta-prompts pass
`--session <id> --round <N> --max-rounds 3`, incrementing `--round` each fix
round. `--round` is required: MMR compares it against `--max-rounds`, so without
it every call is round 1 and the cap never fires. MMR tracks recurrence with its
stable
`finding_key` (normalized location + category + description + suggestion, with
severity excluded) and stops re-attempting a finding that survives the budget.
Because description and suggestion are part of the key, a *materially reworded*
report of the same defect can hash to a new key — so also stop when the same
underlying defect recurs across rounds even under new wording.

- **Rounds 1–3:** fix every real finding at or above the threshold, re-run the
  review, repeat.
- **Round 4+ / budget exhausted:** stop. Fix any remaining P0/P1 by hand and,
  where the project uses Beads, file remaining P2/P3 as follow-up beads rather
  than looping indefinitely.
- **Keep going** while each round surfaces *genuinely different* findings — that
  is healthy iteration, not a stuck loop. **Stop** when the same finding recurs
  past the budget, when channels contradict each other (verdict
  `needs-user-decision`), or when the user asks to stop.

## Verify, don't dismiss

Treat every finding as real until you have verified otherwise in the code. A
finding you cannot reproduce is a finding to investigate, not to wave away. When
you do dismiss one, say why in the review summary.

## Verdict handling

`mmr review --sync` returns one verdict and a matching exit code:

| Verdict | Exit | Meaning | Action |
|---|---|---|---|
| `pass` | 0 | all channels completed, gate passed | proceed (merge / commit / push) |
| `degraded-pass` | 0 | gate passed but a channel was skipped or compensated | proceed; note the degradation |
| `blocked` | 2 | an unresolved finding sits at or above the threshold | **stop** — fix or surface; do not merge |
| `needs-user-decision` | 3 | no channel completed, channels contradict, or human judgment needed | **stop** — surface to the user |

Never merge on `blocked` or `needs-user-decision`. Cross-check each finding's
`location` against the reviewed diff's file list (`gh pr diff <n> --name-only`
for PRs); out-of-diff findings are contamination noise.

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
