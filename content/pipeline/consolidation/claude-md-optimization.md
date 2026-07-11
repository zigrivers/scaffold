---
name: claude-md-optimization
description: Consolidate and optimize CLAUDE.md for maximum signal density
summary: "Restructures the instruction-file layout so AGENTS.md holds the binding operations core (ship loop, standing authorization, parallel-safety rules, Beads rules, /work-beads routing) that every agent CLI must follow, while CLAUDE.md keeps Core Principles, navigation, Key Commands, and an error-recovery table and points to AGENTS.md for the rest — keeping CLAUDE.md under 200 lines so agents actually read and follow it."
phase: "consolidation"
order: 1110
dependencies: [git-workflow]
outputs: [CLAUDE.md, AGENTS.md]
reads: [create-prd, tdd, user-stories, beads, automated-pr-review]
conditional: null
knowledge-base: [claude-md-patterns]
---

## Purpose
Review all project documentation and restructure the instruction-file layout
into its final, optimized form: AGENTS.md becomes the single binding source
for the operations core (the ship-loop summary, standing authorization,
parallel-safety hard rules, Beads rules, and `/work-beads` routing) that
every agent CLI — including Claude Code — must follow, while CLAUDE.md is
consolidated down to Core Principles, project navigation, Key Commands, and
an error-recovery table, with a one-line pointer back to AGENTS.md for the
rest. Eliminate redundancy from incremental additions by multiple setup
prompts, fix inconsistencies in terminology and commands, fill gaps in
workflow coverage, and front-load the most critical information for agent
scannability.

## Inputs
- CLAUDE.md (required) — current state with incremental additions
- AGENTS.md (optional) — current state if `bd setup codex` or
  automated-pr-review already created it; this step creates it fresh if it
  doesn't exist yet
- docs/plan.md (required) — PRD for context, and the source for any
  project-declared cross-cutting invariants
- docs/tech-stack.md (required) — technology choices, and the source for any
  project-declared cross-cutting invariants
- docs/coding-standards.md (required) — code conventions
- docs/tdd-standards.md (required) — testing approach
- docs/git-workflow.md (required) — branching and PR workflow, and the
  8-step + 5.5 enumeration the ship-loop summary must not contradict
- docs/beads-workflow.md (optional) — defer-immediately rule, bootstrap-trap
  warning, and day-to-day commands for the Beads rules subsection
- docs/project-structure.md (required) — file placement rules
- docs/user-stories.md (optional) — feature context

## Expected Outputs
- AGENTS.md — gains (or already has) a section titled exactly "Operations
  core (binding for every agent)" containing: the 8-step ship-loop summary
  ending in the batch report, the standing authorization, the
  parallel-safety hard rules, the Beads rules, an optional "Project
  invariants" subsection (omitted entirely when the project declares none),
  and `/work-beads` routing. Content this step relocates here from
  CLAUDE.md's Committing/PR Workflow, Task Closure, Parallel Sessions,
  Worktree Awareness, and Code Review sections is removed from CLAUDE.md.
  The `bd setup claude` / `bd setup codex` marker block is left untouched.
- CLAUDE.md — restructured and consolidated to Core Principles, project
  navigation table, Key Commands (Agent-safe/Ask-first markers preserved),
  an error-recovery table (test failure, Docker contention, pre-commit
  failure, merge conflict, crashed mid-task, detached primary, review-channel
  auth failure), and the one-line pointer "The binding operations core lives
  in AGENTS.md and applies to Claude Code sessions too."
- Other harness files present in the project root (e.g. GEMINI.md) —
  rewritten to a two-line pointer at AGENTS.md; no ops-core content
  duplicated into them

## Quality Criteria
- (mvp) No duplicated instructions within CLAUDE.md or AGENTS.md
- (mvp) No verbatim repetition of content from other docs (reference instead)
- (mvp) Consistent terminology throughout (task vs. ticket, etc.)
- (mvp) Key Commands table matches actual Makefile/package.json commands,
  with every row's Agent-safe/Ask-first marker preserved
- (mvp) AGENTS.md contains a section titled "Operations core (binding for
  every agent)" with the 8-step ship-loop summary ending in the batch
  report, the standing authorization ("Run this whole loop without asking
  permission; do not end your turn after opening a draft PR."), and the
  parallel-safety hard rules (primary checkout shared/read-only; one agent
  per module/migration-sequence/shared surface; one open PR per agent;
  staging-up from worktrees only)
- (mvp) AGENTS.md's Operations core section contains the Beads rules (start
  from the ready queue, defer = bead immediately, never bootstrap on a
  populated DB — ending with the docs/beads-workflow.md reference when that
  file exists) and, when `.agents/skills/work-beads/SKILL.md` exists in the
  project, the `/work-beads` routing line
- (mvp) CLAUDE.md contains the one-line pointer "The binding operations core
  lives in AGENTS.md and applies to Claude Code sessions too."
- (mvp) CLAUDE.md contains an error-recovery table with all seven required
  rows (test failure, Docker contention, pre-commit failure, merge conflict,
  crashed mid-task, detached primary, review-channel auth failure)
- (mvp) The `bd setup claude` / `bd setup codex` marker block
  (`<!-- BEGIN BEADS INTEGRATION ... -->` … `<!-- END BEADS INTEGRATION -->`)
  is never rewritten by this step
- (deep) Other harness files present in the project root defer to AGENTS.md
  with a two-line pointer — no duplicated ops-core content
- (deep) A "Project invariants" subsection appears in AGENTS.md only when
  docs/plan.md or docs/tech-stack.md declares a cross-cutting invariant;
  omitted entirely otherwise
- (deep) CLAUDE.md is <= 200 lines or critical patterns appear in the first
  50 lines
- (deep) Every situation in the error-recovery table names the exact
  first-command(s) to run and the follow-up decision, cross-referenced to
  docs/git-workflow.md or docs/beads-workflow.md rather than restated in full
- (mvp) Tracking comment added to CLAUDE.md and AGENTS.md:
  `<!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->`

## Methodology Scaling
- **deep**: Full four-phase analysis (redundancy, consistency, gap, priority
  audits) with detailed changelog. AGENTS.md gets the complete Operations
  core section, including the Project invariants subsection when the
  project declares any. CLAUDE.md gets the full seven-row error-recovery
  table. All nine critical patterns verified present and prominent.
- **mvp**: Quick pass to remove obvious duplicates, relocate the ops-core
  rules into AGENTS.md's Operations core section (ship-loop summary,
  standing authorization, parallel-safety rules, Beads rules, `/work-beads`
  routing), add the CLAUDE.md pointer, and add the seven-row error-recovery
  table. Fix any command inconsistencies. Skip the Project invariants
  subsection and the detailed four-phase audit.
- **custom:depth(1-5)**:
  - Depth 1: remove duplicated instructions within CLAUDE.md.
  - Depth 2: dedup plus workflow section completeness check.
  - Depth 3: add terminology consistency pass across all sections; relocate
    ops-core rules into AGENTS.md's Operations core section with the
    CLAUDE.md pointer.
  - Depth 4: add gap analysis (missing patterns, stale command references)
    and the full seven-row error-recovery table.
  - Depth 5: full four-phase audit (redundancy, consistency, gap, priority)
    plus the Project invariants subsection and other-harness-file pointers.

## Mode Detection
Always operates in update mode (CLAUDE.md always exists by this point).
Check for the tracking comment
`<!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->` in CLAUDE.md and
AGENTS.md to detect prior optimization. If present, compare the current
files against the prior version date to identify sections added or changed
since last optimization. Preserve manually-added sections (user
customizations not from setup prompts). Only consolidate sections that
originated from setup prompts — do not restructure user-authored content.
Relocating existing ops-core rules from CLAUDE.md into AGENTS.md's
Operations core section is the structural move this step owns, not a new
rule — do not add workflow steps or rules that don't already exist
somewhere in the project's documentation. Never rewrite inside the
`bd setup claude` / `bd setup codex` marker block
(`<!-- BEGIN BEADS INTEGRATION ... -->` … `<!-- END BEADS INTEGRATION -->`);
that block is owned by `bd` (see content/pipeline/foundation/beads.md).

## Update Mode Specifics
- **Detect prior artifact**: tracking comment in CLAUDE.md and AGENTS.md
  with version and date
- **Preserve**: manually-added sections, user-customized rules,
  project-specific command aliases, any content not traceable to a pipeline
  setup prompt, and the `bd setup claude` / `bd setup codex` marker block in
  whichever file(s) it appears
- **Triggers for update**: new setup prompts completed, coding-standards
  updated, tdd-standards updated, git-workflow updated, terminology
  inconsistencies introduced by incremental additions, or AGENTS.md still
  carries the pre-restructure layout (ops-core rules still living only in
  CLAUDE.md's Committing/PR Workflow, Task Closure, Parallel Sessions,
  Worktree Awareness, or Code Review sections instead of AGENTS.md's
  Operations core section)
- **Conflict resolution**: if a user-customized section conflicts with a
  setup prompt's output, keep the user version and flag the conflict in a
  comment

## Instructions

### Restructure the operations core into AGENTS.md
Create AGENTS.md if it doesn't already exist (some projects only get it from
`bd setup codex` or automated-pr-review). Add or update a section titled
exactly `## Operations core (binding for every agent)` containing, in this
order:

1. **The ship-loop summary** — an 8-step condensation of the work-beads
   skill's loop (`content/agent-skills/work-beads/SKILL.md`), ending in the
   batch report. Point to the skill for full detail rather than restating
   it. Use this shape (fill in the project's actual command names from
   docs/dev-setup.md and docs/git-workflow.md):

   ```markdown
   1. Orient (read-only, primary checkout): `bd ready`, `bd stats`,
      `gh pr list --state open`, `git worktree list`, `make doctor`.
   2. Select bead(s): priority, then project-critical labels, then work
      that unblocks others; never a bead already in progress or covered by
      an open/draft PR.
   3. Claim from the primary checkout: `bd ready --claim` (or
      `bd update <id> --status in_progress`).
   4. Worktree + build: `scripts/setup-agent-worktree.sh <name> --task
      "<title>"`; draft PR on the first push — the draft is the visible
      claim.
   5. Verify: `make check` green on branch HEAD, personally watched.
   6. Review + merge: `mmr review --pr <N> --sync --format json` (3-round
      cap, degraded-pass self-merge past the cap); `gh pr merge --squash
      --delete-branch`; `make main-sync && make prune-merged`.
   7. Close: `bd close <id>` only after the merge is verified.
   8. Batch report: the required slots (Beads / Docs updated in-PR / Beads
      filed) — say "none" out loud when there's nothing to report.
   ```

   This must not contradict docs/git-workflow.md's 8-step PR workflow (step
   5.5 = `mmr review`) — step 6 above is that workflow's later steps
   condensed, not a competing enumeration.

2. **Standing authorization** — verbatim: "Run this whole loop without
   asking permission; do not end your turn after opening a draft PR." Name
   the one exception: a verified, still-reproducing P0, or a blocker you can
   name.

3. **Parallel-safety hard rules** — the primary checkout is shared and
   read-only (agents work in worktrees, never commit there); one agent per
   module, migration sequence, or other shared surface at a time; one open
   PR per agent; `make staging-up` only from a worktree, never the primary.

4. **Beads rules** — start from `bd ready` (the ready queue); anything you
   decide not to do now becomes a bead immediately (a TODO comment, PR note,
   or mental note is not tracking); never run `bd bootstrap` or
   `bd init --force` on a checkout with a populated local Beads DB. End the
   Beads rules with: see docs/beads-workflow.md for the `bd create`
   template, day-to-day commands, and the bootstrap trap (when that file
   exists).

5. **Project invariants (optional)** — scan docs/plan.md and
   docs/tech-stack.md for cross-cutting invariants the project declares
   (e.g. "every capability must work across all N engines/platforms"). When
   at least one exists, add a `### Project invariants` subsection listing
   each as a one-line rule. When the project declares none, omit the
   subsection entirely — do not add an empty heading.

6. **`/work-beads` routing** — when `.agents/skills/work-beads/SKILL.md`
   exists in the project, add: "open `.agents/skills/work-beads/SKILL.md`
   and follow it exactly."

Relocate the content that git-workflow.md and automated-pr-review.md
previously wrote into CLAUDE.md's Committing/PR Workflow, Task Closure,
Parallel Sessions, Worktree Awareness, and Code Review sections into this
AGENTS.md section, then remove those sections from CLAUDE.md. Never touch
the `<!-- BEGIN BEADS INTEGRATION ... -->` / `<!-- END BEADS INTEGRATION -->`
marker block — it is owned by `bd setup claude` / `bd setup codex` (see
content/pipeline/foundation/beads.md); add the new section adjacent to it,
not inside it.

### Rebuild CLAUDE.md's error-recovery table
Replace the relocated sections in CLAUDE.md with:

```markdown
## Error Recovery
| Situation | First commands | Then |
|---|---|---|
| Test failure | Re-run the failing test in isolation; read the diff | Fix the root cause — never skip or comment out the test |
| Docker contention (testcontainer timeouts, DockerException) | `make docker-doctor` | `make tc-reap && make staging-prune`, then re-run |
| Pre-commit failure | Read the hook output; fix the flagged file | Re-stage and re-commit — never `--no-verify` |
| Merge conflict | `git fetch origin && git rebase origin/main` | Resolve conflicts, `git rebase --continue`, re-run `make check`, `git push --force-with-lease` |
| Crashed mid-task | `git status`, `git log -3 --oneline`, `gh pr list --state open` | Continue, abort, or restart per docs/git-workflow.md's decision table; recover lost commits with `git reflog` |
| Detached primary | `make doctor` | `make doctor-fix` (unattended-safe); ambiguous cases (dirty tree, mid-conflict, diverged main) need a human decision |
| Review-channel auth failure | `mmr review` reports a degraded channel | Run that channel's login command (`codex login` / `grok login` / `agy -p "hello"`) and retry — never silently skip the channel |

The binding operations core lives in AGENTS.md and applies to Claude Code
sessions too.
```

Keep Core Principles, the project navigation table, and the Key Commands
table (with Agent-safe/Ask-first markers, per dev-env-setup's taxonomy)
above this table. Keep CLAUDE.md at or under 200 lines — if the combined
content overflows, point to docs/git-workflow.md and docs/beads-workflow.md
rather than inlining more detail, and when the Key Commands table grows past
~20 rows, keep the agent-ops and daily-driver rows and point to
docs/dev-setup.md for the rest.

### Point other harness files at AGENTS.md
For any other agent-harness file already present in the project root (e.g.
GEMINI.md), replace its content with exactly:

```markdown
See AGENTS.md for the binding operations core (ship loop, standing
authorization, parallel-safety rules, Beads rules, `/work-beads` routing).
```

Do not create a harness file that doesn't already exist — only projects
that already have one (from prior tooling or a user-added file) get this
treatment.

### Preserve the tracking comment
Add or refresh `<!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->` in
both CLAUDE.md and AGENTS.md.
