## Step 0 — Orient (once per batch, read-only, from the primary checkout)

The primary checkout is the first entry of `git worktree list`. Run:

```bash
bd ready && bd stats
gh pr list --state open        # open + draft PRs = live registry of what others build
git worktree list
make doctor                    # wedged home base? make doctor-fix (unattended-safe)
```

**Identity — T1-ACTOR (a HARD, blocking prerequisite, not an enhancement):**
the atomic claim is a compare-and-set *keyed on the Beads actor*, and a
same-actor claim is idempotent (exit 0). Two agents sharing one identity (the
default `git user.name`) therefore BOTH "win" the same bead — the claim gives
**zero** collision protection. Establish a distinct actor BEFORE any claim:
- Already have `BEADS_ACTOR` exported in THIS shell (the multi-agent prompt set
  it, or you sourced a worktree `.agent-env` on resume)? Keep it.
- Otherwise, in THIS shell **now, before Step 1**:
  `export BEADS_ACTOR="$(scripts/agent-name.sh)"` — the generator draws a
  memorable `agent-<adjective>-<noun>-<NN>` name (e.g. `agent-turbo-walrus-07`)
  with real entropy and collision-checks it against live assignees, worktree
  actors, and `agent/*` branches. Prefer it over inventing a name yourself:
  self-picked "distinctive" names converge across concurrent agents, and two
  agents on one name get zero claim protection. No generator installed? Invent
  a distinctive name (e.g. `agent-cobalt-fox`) — or pass `--actor <name>` on
  every `bd` write. The first claim runs from the primary checkout, BEFORE any
  worktree exists, so the actor must live in your current shell; a
  not-yet-created worktree cannot supply it. The name is also your public
  ownership label — it shows up in `bd list` assignees, the reaper report,
  branch names, and git blame — so keep ONE name per session.
- Cannot get an actor distinct from the shared human identity? You MUST NOT trust
  `--claim` for safety: **fail loud** — refuse the claim path, or fall back to a
  plain non-atomic in-progress write AND record in the batch report that
  collision protection is DISABLED. Never degrade silently.

Unique across concurrent agents = mutual exclusion; stable within your session =
your resume path works. (Merge-slot commands are the exception — a separately
minted holder value; see 2.7.)

> **[HOST] `.agent-env` persists the actor for the worktree, not the first claim.**
> The generated `scripts/setup-agent-worktree.sh` writes `BEADS_ACTOR=agent-<name>`
> into a worktree-local `.agent-env` so `bd` writes made FROM that worktree (and a
> resumed session) are attributable — but a child script cannot export into your
> shell, so you must `source .agent-env` yourself, and it does NOT set the actor
> for the pre-worktree claim above (that is the in-shell `export` you just did).
> Any `bd` wrapper the project ships MUST preserve `BEADS_ACTOR` (env is inherited
> across `cd`, so a wrapper only has to avoid overriding it).

**Stale-claim orient (surface + self-resume):** run the reaper in **report
mode** and list your own live claims:

```bash
scripts/reap-stale-claims.sh                              # REPORT ONLY — never releases
scripts/reap-lapsed-defers.sh                             # REPORT ONLY — lapsed cooldowns rotting out of bd ready (skip if absent)
bd list --status in_progress --assignee "$BEADS_ACTOR"   # your own crashed-session claims to resume
```

The reaper report names beads whose claim looks abandoned (lease lapsed, or —
absent a lease — stale with no open/draft PR). It NEVER mutates in report mode;
its `--apply` release is gated (see the red flags). Resume your OWN stranded
claims; for another agent's, leave it in the report — releasing a claim is an
`--apply`/operator decision, not a manual `bd` edit. (Missing script? It ships
with `scaffold agent-ops install`; feature-detect and skip if absent.)

Version gate: `bd version` must be **≥ 1.1.0** (the `bd dolt` durability
commands below require it). Older? Stop and report: upgrade with
`brew upgrade beads` or the project's equivalent — never work around the gate.

**Database safety (binding for every step):** never run `bd bootstrap`,
destructive `bd init` (`--reinit-local`/`--discard-remote`/`--destroy-token`;
legacy `--force`), or any reset against a populated `.beads/` — bootstrap
replaces local state
with the often-stale remote and silently drops unpushed beads (fresh clones
only). Before any deliberate reset, and before deleting a checkout with local
beads: `bd stats && bd dolt commit && bd dolt push`, then `make beads-snapshot`.
Drive the database only through `bd` subcommands — never a standalone `dolt`
CLI. Full runbook: docs/beads-workflow.md ("Durability & the bootstrap trap").

If `bd` or the agent-ops scripts are missing, stop and instruct:
`scaffold agent-ops install` (scripts) / see docs/beads-workflow.md (tracker).

## Step 1 — Select ONE bead (repeat before every claim)

Selection happens per bead, at claim time — never pre-select a batch. The
queue moves while you work: at high parallelism (a 12-agent fleet is
normal), any bead you "reserved" in your head at batch start will be gone
by the time you reach it. Refresh the cheap view before each selection:

```bash
bd ready --unassigned           # the claimable queue as of NOW (-u trims
                                #   open-but-assigned beads that refuse claims)
gh pr list --state open         # what others are building NOW
```

Ranking, strict order over the WHOLE ready queue: (1) priority P0 > P1 > P2 >
P3; (2) beads labeled with a `critical_labels` entry from
`.scaffold/agent-ops.yaml`, if any; (3) work that unblocks other beads.
**Capability fit is a within-tier TIE-BREAKER only — applied AFTER the priority
sort to separate otherwise-equal candidates, NEVER a pre-filter.** Ranking always
sees the whole queue, so an out-of-slice P0 is always taken over an in-slice P2.
Do NOT run `bd ready -l <your-slice>` first with a fallback-when-empty: that is
exactly the pre-filter that wrongly picks an in-slice P2 over an out-of-slice P0
(§6.2). (The capability→label mapping is project-specific; a project may ship an
example in `.scaffold/agent-ops.yaml` — treat an empty/absent mapping as "no
tie-breaker.")

Maintain a per-pass SKIP-SET of bead IDs you have already lost-raced or
cooldown-released this invocation, and skip them when you re-rank.

**`Owner:` is NOT an assignment — never skip or park a bead because of it.** In
bd, `Owner` is the immutable identity of whoever CREATED the bead, so it goes on
naming a long-departed agent forever. Only `Assignee` + `in_progress` means
someone holds it, and the atomic claim at 2.1 is what detects that. Beware that
some bd builds have omitted the assignee field from `bd list --json` output —
if a listing shows no assignee, confirm with `bd show <id>` (which does print
it) before concluding a bead is unheld; `bd ready --unassigned` and
`bd list --assignee <name>` are the reliable holder queries.

Cheap pre-claim exclusions (knowable from the queue view — skip before claiming):
- the merge-slot infrastructure bead: the project's `<prefix>-merge-slot` bead
  (or anything labeled `gt:slot`) is the merge LOCK, not work — it sits open at
  P0 whenever the slot is free, and an unfiltered claim would hold the global
  merge lock and block every other agent. Exclude it (`--exclude-label gt:slot`).
- a bead already `in_progress` under another agent (`bd ready --unassigned`
  trims open-but-assigned beads; a lingering assigned one just refuses your claim
  at 2.1 — normal traffic, not an error).

The expensive gates — duplicate-work scan, open-PR-surface conflict, and
epic-sibling re-poll — are **validation gates that run AFTER the claim** (Step
2.1): claim first so the bead is invisible to peers while you evaluate it.

Queue drained (or no candidate survives) before the budget is spent? The batch
ends early — go to Step 3 and report `queue drained after <k> of N`.

For explicit-ID invocations: topologically sort the listed IDs by dependency
(blockers first); stop and report if they form a cycle. Before claiming each
ID at its turn (Step 2.1), re-verify its blockers are all closed
(`bd show <id>`): an ID already claimed by another agent is skipped and
reported with its holder, and every listed ID that depends on a skipped or
still-open blocker is skipped too (report as `blocked by <id>`) — never
start downstream work whose prerequisite isn't done.
