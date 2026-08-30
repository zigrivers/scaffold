---
name: git-workflow
description: Configure git workflow with branching, PRs, local quality gates, and worktree tooling for parallel agents
summary: "Sets up your branching strategy, commit format, PR workflow with squash-merge, the agent-ops worktree scripts (setup, doctor, prune), and conflict-prevention rules so multiple AI agents work in parallel without conflicts. The merge gate is local and fast (pre-commit + make check-affected + MMR review); merge-throughput projects serialize merges through the scaffold mq queue and add day-one post-merge/nightly CI on a $0 self-hosted runner, while smaller projects use a serialized merge slot."
phase: "environment"
order: 330
dependencies: [dev-env-setup]
outputs: [docs/git-workflow.md, scripts/setup-agent-worktree.sh, .github/pull_request_template.md]
detect:
  all:
    - path: docs/git-workflow.md
    - path: scripts/setup-agent-worktree.sh
conditional: null
knowledge-base: [dev-environment, git-workflow-patterns]
---

## Purpose
Configure the repository for parallel Claude Code sessions working simultaneously.
Define the branching strategy (one task -> one branch -> one PR -> squash-merge ->
delete branch), Conventional Commits format (when Beads is configured, the bead ID
is appended to the commit subject and PR title as a trailing `(<bead-id>)`, rides the
work branch as its final segment, and is referenced in the PR body via `Closes <id>` —
the body form is
the canonical machine mapping), a rebase-never-merge strategy, the 8-step PR workflow with `mmr review`
as mandatory AI-review step 5.5, the agent-ops worktree scripts for parallel agents
(setup, doctor, prune), conflict-prevention rules, and the two-layer quality
architecture: a fast local merge gate (pre-commit hooks + `make check-affected` +
agent self-review + `mmr review`). A project that adopts the merge-throughput
step (order 335, for 3+ concurrent agents) serializes and batch-tests those
merges through the scaffold mq merge queue and adds day-one post-merge/nightly
full-suite CI on a $0 self-hosted runner (D4′); a smaller project lands through a
single serialized merge slot with no server CI until launch. The steps below
mark which parts are queue-only.

## Inputs
- CLAUDE.md (required) — Key Commands table for lint/test/install commands
- docs/coding-standards.md (required) — commit message format reference
- docs/dev-setup.md (required) — install/setup commands to seed
  `worktree_setup_commands` when writing `.scaffold/agent-ops.yaml` for the
  first time
- .scaffold/agent-ops.yaml (optional) — read first to detect whether the
  agent-ops config already exists before writing the minimal form

## Expected Outputs
- docs/git-workflow.md — the single rule, branching strategy, commit
  standards, rebase-never-merge strategy, the "Quality gates (two layers,
  D4′)" section, the 8-step PR workflow (with `mmr review --pr` as step 5.5),
  conflict-prevention rules, worktree documentation, the primary-checkout
  invariant, task closure, agent crash recovery, and a cheat sheet — see
  "Generate docs/git-workflow.md" in Instructions for the full section list
- scripts/setup-agent-worktree.sh — installed (not hand-authored) by
  `scaffold agent-ops install --component git`; see "Install the agent-ops
  git component" in Instructions
- scripts/primary-checkout-guard.sh, scripts/check-regen-artifacts.sh —
  installed by the same git component; the write-guard and main-sync
  stray-artifact detector that keep generated files out of the primary
  checkout (see "Guardrail: keep generated files out of the primary
  checkout" in Instructions)
- .github/pull_request_template.md — PR template with Summary / Test plan /
  References sections
- .claude/settings.json — gains a PostToolUse reminder hook that fires after
  `gh pr create`, and, when the project uses Beads, a PreToolUse `bd-guard.sh`
  entry (merged, never overwritten); when the merge-queue component is
  installed, a PreToolUse `mq-guard.sh` entry as well (same merge discipline)
  — all registered via `scaffold hooks install`, never hand-merged
- .scaffold/agent-ops.yaml — written with the minimal form (`project_name` +
  `worktree_setup_commands`) if it doesn't already exist
- CLAUDE.md updated with Committing/PR Workflow, Task Closure, Parallel
  Sessions, Worktree Awareness, and Code Review sections

## Quality Criteria
- (mvp) Branch naming format is `<type>/<short-desc>` — `<type>` is a
  Conventional Commits type, `<short-desc>` is kebab-case and <= 40 chars;
  worktree workspace branches are `agent/<name>/<bead-id>` (via
  `setup-agent-worktree.sh --bead <id>`; bare `agent/<name>` without a bead),
  so open branches read as the roster of in-flight beads
- (mvp) Commit format is `type(scope): subject` (Conventional Commits); when
  Beads is configured the bead ID is APPENDED to the subject and the PR title
  as a trailing tag — `type(scope): subject (<bead-id>)` — and the PR body
  carries `Closes <id>`, which stays the canonical machine-readable bead↔PR
  mapping (the title and branch copies are human-first redundancy). The trailing
  `(<bead-id>)` on the PR title is what makes bead IDs visible in
  `git log --oneline` on main: the squash-merge subject comes from the PR title.
  Because the Conventional Commits `type` stays FIRST, commitlint,
  semantic-release, and changelog generators parse these commits unchanged — no
  parser config needed (the trailing `(<bead-id>)` is just part of the subject
  text)
- (mvp) The "Quality gates (two layers, D4′)" section states the merge
  gate explicitly (pre-commit hooks + `make check-affected` + agent
  self-review + `mmr review`) with the full `make check` as the safety net.
  A merge-throughput project ADDS: the gate runs against the batch by the
  merge-queue daemon, and full `make check` runs post-merge and nightly via
  `.github/workflows/post-merge.yml`/`nightly.yml` on a $0 self-hosted runner
  (or the local poller) from day one. A base project runs the gate locally
  with no server CI until launch.
- (deep) PR workflow documents all 8 steps plus step 5.5 — (1) commit,
  (2) local review, (3) rebase, (4) push, (5) create PR, (6) confirm the
  fast local gate (`make check-affected`), (7) land it — when the merge
  queue is installed, `scaffold mq enqueue --pr <N>` and move on (never
  `gh pr merge` directly — blocked by the mq-guard hook); otherwise
  serialize a merge-slot `gh pr merge --squash --delete-branch` —,
  (8) sync main via `make main-sync && make
  prune-merged` — with step 5.5 = `mmr review --pr <N> --sync
  --format json` between creating the PR and the gate/enqueue steps,
  including autonomous bounded remediation when round three exposes a verified
  in-scope or required-safeguard blocker
- (deep) `scripts/setup-agent-worktree.sh` is confirmed present via
  `scaffold agent-ops install --component git` + `scaffold agent-ops
  check` — not hand-authored; creates worktrees at the project-local
  `.worktrees/<agent-slug>` on branch `agent/<agent-slug>` and ensures
  `.worktrees/` is gitignored
- (deep) If Beads: `BEADS_ACTOR` environment variable documented for agent
  identity
- (mvp) Branch cleanup documented for both single-agent (`git branch -d`)
  and worktree-agent (`make prune-merged`) variants
- (mvp) When `.beads/` exists, `.claude/settings.json` registers
  `scripts/bd-guard.sh` under hooks.PreToolUse with matcher `Bash`
- (mvp) When the merge-queue component is installed (`scripts/mq-guard.sh`
  present), `.claude/settings.json` registers it under hooks.PreToolUse
  with matcher `Bash` as well, following the same merge discipline
- (deep) Agent crash recovery procedure documented: diagnose commands, a
  continue/abort/restart decision table, and `git reflog` recovery
- (mvp) Conflict-prevention rules documented: single-writer surfaces,
  migration-sequence ownership, high-contention files require coordination
  before a second writer touches them, one open PR per agent
- (deep) The primary-checkout invariant is documented (`main` stays checked
  out in the primary clone, never a feature branch, never detached) with
  `make doctor` (read-only diagnosis) and `make doctor-fix` (safe repair)
- (mvp) A cheat sheet is included covering the full loop and the
  parallel-agent worktree variant

## Methodology Scaling
- **deep**: Full docs/git-workflow.md with every section — the single
  rule, branching, commits, rebase strategy, quality gates (two layers,
  D4′), the 8-step PR workflow with `mmr review` as step 5.5, conflict-prevention
  rules, worktree documentation, the primary-checkout invariant, task
  closure, agent crash recovery, and the cheat sheet. Agent-ops git
  component installed, PR template generated, PostToolUse hook configured,
  and comprehensive CLAUDE.md updates.
- **mvp**: The single rule, branching, commit format, quality gates (two
  layers, D4′), and the 8-step PR workflow (mmr review still mandatory as
  step 5.5). The agent-ops git component is installed for the mvp preset
  (as it is for deep) — it is a cheap, idempotent script install that
  `/work-beads` depends on. Custom depth follows its own ladder below (the
  component installs starting at depth 3). Skip the crash-recovery and
  conflict-prevention detail sections; keep CLAUDE.md updates minimal.
- **custom:depth(1-5)**:
  - Depth 1: the single rule, branching strategy, commit format, and the
    "Quality gates (two layers, D4′)" section.
  - Depth 2: add the 8-step PR workflow (with `mmr review` as step 5.5)
    and the PR template.
  - Depth 3: install the agent-ops git component and document the
    worktree setup and cheat sheet.
  - Depth 4: add conflict-prevention rules, the primary-checkout
    invariant, and agent crash recovery.
  - Depth 5: full suite with the PostToolUse hook, batch branch cleanup
    detail, multi-agent coordination, and comprehensive CLAUDE.md updates.

## Mode Detection
Update mode if docs/git-workflow.md exists. In update mode: preserve the
project's branch-naming and commit-format conventions, preserve worktree
directory naming, and keep any local customizations to the agent-ops
scripts intact — the installer already refuses to overwrite locally
modified files without `--force`; never pass `--force` in generation mode.
Re-run `scaffold hooks install` in update mode too — it is idempotent and
repairs missing hook registrations without touching user entries.

## Update Mode Specifics
- **Detect prior artifact**: docs/git-workflow.md exists
- **Preserve**: branch naming convention, commit message format, worktree
  directory structure, PR template fields, and agent-ops script
  customizations under scripts/ (the installer already refuses to
  overwrite locally modified files without `--force` — do not pass it in
  generation mode) — including the primary-checkout write-guard
  (`scripts/primary-checkout-guard.sh` and `scripts/check-regen-artifacts.sh`),
  so re-running the step never clobbers a project's guard customizations
- **Triggers for update**: coding-standards.md changed commit format,
  Beads status changed (added or removed), new worktree patterns needed
  for parallel execution, `scaffold agent-ops check` reports a stale
  bundle version, hook registrations missing from `.claude/settings.json`
  (repair: `scaffold hooks install`)
- **Conflict resolution**: if the existing doc still carries the retired
  pre-D4′ quality-gates section (titled around a deferred CI rollout) or a
  merge-slot-serialized step 7, flag the discrepancy and replace them with
  the two-layer D4′ section and the enqueue flow only on explicit
  confirmation; verify the CLAUDE.md workflow section stays consistent
  after any changes

## Adoption Mode Specifics
- **Codify from repo evidence**: the collaboration patterns git history
  proves — branch naming from recent branches
  (`git branch -a --sort=-committerdate`), merge style from
  `git log --merges --oneline -30` (squash versus merge commits), the
  existing PR template, hooks already installed, and protected-branch
  rules. Document the incumbent workflow before layering the
  parallel-agent machinery on top of it.
- **Interview only for**: willingness to move to squash-merge and
  one-branch-per-task where history shows another style; how many parallel
  agents are expected (drives the worktree and queue decisions); and which
  incumbent hooks must be preserved.
- **Ingest with provenance**: an existing .github/pull_request_template.md
  is extended, not replaced, with provenance annotations on added sections.
- **Do not**: rewrite commit-format conventions retroactively or demand
  history cleanup; overwrite existing git hooks (scaffold hooks are merged
  alongside via `scaffold hooks install`); force any branch renames.

## Instructions

### Install the agent-ops git component
1. Check whether `.scaffold/agent-ops.yaml` already exists. If it does not,
   write the minimal form before installing — `project_name` (derive from
   the repo directory name, falling back to the git remote slug, then
   sanitize to the installer's required shape `^[a-z][a-z0-9_-]*$` —
   lowercase, no leading digit — or `scaffold agent-ops install` will
   reject it) and `worktree_setup_commands` (the dependency-install
   commands already documented in docs/dev-setup.md, e.g. `["npm ci"]` or
   `["uv sync"]`):
   ```yaml
   project_name: <slug>
   worktree_setup_commands: []   # e.g. ["npm ci"], pulled from docs/dev-setup.md
   ```
   If `.scaffold/agent-ops.yaml` already exists, leave it untouched — an
   earlier step (`staging-environments`, if enabled, runs first at order 315)
   may already have written the full docker config, and this step must not
   clobber prior customizations.
2. Install the git component and confirm it landed clean:
   ```bash
   scaffold agent-ops install --component git
   scaffold agent-ops check
   ```
   This installs `scripts/setup-agent-worktree.sh`,
   `scripts/cleanup-merged-branches.sh`, `scripts/main-sync.sh`,
   `scripts/doctor.sh`, `scripts/beads-snapshot.sh`, `scripts/bd-guard.sh`,
   `scripts/primary-checkout-guard.sh`, `scripts/check-regen-artifacts.sh`,
   and the `agent-ops.mk` Makefile fragment (wired into the project Makefile
   via a one-line managed `include`, appended if missing). The installer is
   idempotent and refuses to overwrite locally modified files without
   `--force` — never pass `--force` in generation mode.

3. **Register the agent hooks natively** — run the hook installer instead of
   hand-editing `.claude/settings.json`:
   ```bash
   scaffold hooks install
   ```
   One idempotent TypeScript deep-merge (atomic write, no jq dependency)
   registers every hook whose prerequisite exists, and prints an explicit
   report line for each one it skips:
   - SessionStart `bd prime --hook-json` — only when `.beads/` exists
   - PreToolUse `scripts/bd-guard.sh` (matcher `Bash`) — the Beads
     destructive-command guard that refuses `bd bootstrap`, destructive
     `bd init`, and `.beads` deletion while a populated database exists;
     only when `.beads/` exists AND the git component above installed the
     script
   - PreToolUse `scripts/mq-guard.sh` (matcher `Bash`) — the merge-queue
     routing guard; only when the merge-queue component is installed
   - PostToolUse `gh pr create` review reminder (see "Configure the
     PostToolUse review-reminder hook" below — the installer registers it
     and skips when an equivalent reminder is already present)
   It never overwrites the file and never drops existing entries
   (`bd setup claude` hooks and user hooks survive), so re-running is always
   safe. A missing prerequisite prints a report line instead of silently
   no-opping — install the prerequisite, then re-run `scaffold hooks
   install`.

4. **Wire the guards into non-Claude harnesses.** Codex, Cursor, and other
   AGENTS.md-based harnesses have no hook-registration surface: for them the
   guards run as pre-flight checks — `scripts/bd-guard.sh --check
   "<command>"` and `scripts/mq-guard.sh --check "<command>"` — and the
   AGENTS.md rules (see claude-md-optimization) carry the prose rules (the
   Beads durability rules; "enqueue, never `gh pr merge`").
   `scaffold hooks install` prints this wiring guidance too.

### Guardrail: keep generated files out of the primary checkout
The git component ships a **primary-checkout write-guard**
(`scripts/primary-checkout-guard.sh`) and a **main-sync stray-artifact detector**
(`scripts/check-regen-artifacts.sh`) — both installed by `scaffold agent-ops
install --component git` above. Together they close a gap git hooks cannot: an
agent (or a regen script an agent runs) writing a **tracked file into the
primary checkout** is not a git operation, so no commit/push hook fires — the
stray file then blocks the next agent's `make main-sync`. The guard is a
**no-op** for standalone clones and for any run from a worktree, so single-agent
projects are unaffected; multi-agent projects get real protection.

- **Prevention — the write-guard.** `scripts/primary-checkout-guard.sh` refuses
  (exit non-zero, with a "regenerate from a worktree" rescue message) when a
  write would land in a primary checkout that has linked worktrees (detection:
  `git rev-parse --git-dir` equals `--git-common-dir` **and** `git worktree
  list` shows more than one worktree); it fails open outside a git repo. **Every
  generator whose default output is a tracked repo path must call the guard
  immediately before writing**, enforced in the code that actually writes (not
  only a shell wrapper), so invoking the generator directly is still guarded:
  - **Bash generators** source it and call the function — on a block it aborts
    the generator before any write:
    ```bash
    . "$(dirname "$0")/primary-checkout-guard.sh"
    guard_primary_checkout "$OUTPUT" "the API docs"
    ```
  - **Other-language generators** (Python, TypeScript, …) run it as a subprocess
    and abort on a non-zero exit, or reimplement the same detection:
    ```bash
    scripts/primary-checkout-guard.sh "$OUTPUT" "the API docs"
    ```
  The single documented bypass is `AGENT_OPS_GIT_GUARD_BYPASS=1` (human
  emergency only, never agents) — reuse this one var for any other git guard so
  there is one override, not two.
- **Recovery — detect and report (never modify).** `scripts/main-sync.sh` calls
  `scripts/check-regen-artifacts.sh` best-effort before it fast-forwards the
  default branch. The detector **reports** (to stderr, never modifies) any tracked
  file whose only working-tree change is a `Generated <ISO-date> <HH:MM> UTC`
  footer — a likely stray regen artifact left in the primary checkout — and tells
  the operator to discard it (`git checkout -- <file>`) or regenerate it inside a
  worktree. It is deliberately detect-only: content alone cannot prove a file is a
  disposable generated artifact rather than a hand edit that merely contains a
  timestamp, so a person decides. The call lives in the installed `main-sync.sh`
  template, so it stays clean against `scaffold agent-ops check` (no drift).

### Generate docs/git-workflow.md
Write docs/git-workflow.md with the sections below, synthesized from the
`git-workflow-patterns` knowledge entry and the project's actual commands
(pull commands from CLAUDE.md's Key Commands table — never invent one).
Depth-gate per Methodology Scaling above.

1. **The single rule** — state it as the doc's operating model up front:
   "One task -> one branch -> one PR -> squash-merge -> delete branch."
2. **Branching** — base branch `main`. Branch naming is `<type>/<short-desc>`:
   `<type>` matches the Conventional Commits type set from
   docs/coding-standards.md (e.g. `feat`, `fix`, `refactor`, `perf`, `docs`,
   `test`, `build`, `ci`, `chore`); `<short-desc>` is kebab-case and <= 40
   chars. Worktree workspace branches are `agent/<name>/<bead-id>` (per §8
   below) — the bead id as the final segment turns `git branch -r` into a
   live roster of in-flight beads. A branch lives only as long as its PR is
   open — squash-merge with `--delete-branch` removes it automatically.
3. **Commits** — Conventional Commits format `type(scope): subject`; when
   Beads is configured the bead ID is appended to the subject and the PR title
   as a trailing tag (`type(scope): subject (<bead-id>)`), and the PR body
   carries `Closes <id>` — the canonical machine mapping tooling parses; title
   and branch copies are human-first redundancy. The `type` stays first, so
   Conventional-Commits tooling needs no special config. Pre-commit
   hooks are mandatory — never `--no-verify`.
4. **Rebase strategy** — `git fetch origin && git rebase origin/main`
   before pushing and whenever `main` advances while the PR is open;
   `git push --force-with-lease` only, never plain `--force`. No merge
   commits land on `main` — squash-merge is the only merge mode.
5. **Quality gates (two layers, D4′)** — the merge gate is local and fast:
   pre-commit hooks + `make check-affected` + agent self-review + `mmr review`.
   A merge-throughput project runs that gate against the batch via the
   merge-queue daemon (below) AND adds a full-suite net: `make check` runs
   post-merge on every landing and nightly — uncached — via
   `.github/workflows/post-merge.yml`/`nightly.yml` on a self-hosted runner ($0
   Actions minutes; register with `scripts/ops/setup-gh-runner.sh`), or via the
   local poller (`make post-merge-watch`, scheduled by `scaffold sched
   install post-merge-poller`) when
   `merge_queue.gate_executor: local-poller`. A base project has NO post-merge
   net, so its merge gate is the full `make check` (there, `check-affected` is a
   local speed aid, not the bar). When post-merge goes red the queue
   HOLDS — but the mechanism differs by executor: with the default
   `gha-selfhosted`, the daemon sees the red `post-merge.yml` run (via `gh run
   list`) and stops landing until a green run supersedes it (no `.mq/PAUSED`
   file); with `local-poller`, the poller writes `.mq/PAUSED`. Either way, fix
   forward or revert per docs/merge-queue.md (and, for local-poller, remove the
   pause file). Note: on free-plan private repos GitHub offers
   no branch protection — the queue is enforced by convention + the mq-guard
   hook; GitHub Pro adds server-side protection if ever wanted.
6. **The 8-step PR workflow** — (1) commit -> (2) local review (re-read the
   diff against the coding standards; the gate itself is step 6's
   `make check-affected`, not a full run here) -> (3) rebase -> (4) push ->
   (5) `gh pr create` (auto-applies `.github/pull_request_template.md`) ->
   **step 5.5: `mmr review --pr <N> --sync --format json`** (mandatory;
   group duplicate findings by root cause and give each one a finite
   disposition. The original bead and its acceptance criteria bound the PR's
   required scope. Severity alone never creates a bead. A follow-up must be
   reproducible, actionable, non-duplicate, worth scheduling, and outside
   scope. Mandatory guardrails include at minimum security, privacy, and data
   integrity (including preventing data loss or corruption), plus every
   repository or product safeguard required by project instructions. Use a
   maximum of three rounds per review cycle. If round three finds a reproducible
   acceptance-criteria or required-safeguard defect, make a concrete repair,
   add focused regression proof, rerun the required gate, and review the new
   exact head from round one in a new bounded cycle. Duplicate, stale,
   hypothetical, speculative, cosmetic, or already-dispositioned findings
   cannot restart review. No owner approval is required for in-scope
   remediation. Continue until every root cause has a disposition and no
   verified fix-now or block item remains. Stop only for an external dependency,
   missing credentials or authority, a destructive action, an out-of-scope
   material product decision, or a demonstrated technical plateau after safe
   approaches are exhausted. An unresolved required-safeguard defect is not a plateau.
   Merge only when the final exact head meets the configured MMR channel floor,
   required gates are green, every finding is dispositioned, and no verified
   blocker remains) ->
   (6) confirm the fast
   gate green on the branch HEAD (`make check-affected`; run full `make
   check` instead when you touched gate config, shared test utils, or
   anything in the force-full list) -> (7) **enqueue, never merge
   directly**: `make mq-enqueue PR=<N>` (or `scaffold mq enqueue --pr
   <N>`) and MOVE ON to the next task — the merge-queue daemon
   batch-tests the PR against latest `main` with peers, lands it on green
   (closing the bead), or ejects it with the failing log as a PR comment
   and reopens the bead for any agent to fix. Direct `gh pr merge` is
   blocked by the mq-guard hook; queue state: `scaffold mq status`.
   Fallback when the merge-queue component is not installed: serialize
   via `bd merge-slot` per the multi-agent-coordination knowledge entry
   -> (8) `make main-sync && make prune-merged` from the primary
   checkout. Cross-reference the
   work-beads skill's Step 2.7 for the exact review contract this mirrors
   (`content/agent-skills/work-beads/SKILL.md` in the Scaffold repo;
   installed at `.claude/skills/work-beads/SKILL.md` or
   `.agents/skills/work-beads/SKILL.md` in the target project).
7. **Conflict-prevention rules** — single-writer surfaces (one agent at a
   time on a given module or domain directory), migration-sequence
   ownership (never two agents in the same migration directory), high-
   contention files require coordination before a second writer touches
   them, and one open PR per agent at a time.
8. **Parallel agents and worktrees** — `.worktrees/<name>` on branch
   `agent/<name>/<bead-id>`, created via `scripts/setup-agent-worktree.sh <name>
   --install --task "..." --bead <id>` (`--install` runs the dependency-install
   setup commands — a plain invocation installs nothing; omit `--bead` for
   non-bead work and the branch is `agent/<name>`); agent names come from
   `scripts/agent-name.sh` (unique, collision-checked); per-worktree agent
   identity via git config; cleanup via `make prune-merged` (squash-aware —
   detects merged branches even when ancestry alone would miss a squash merge).
9. **The primary-checkout invariant** — the top-level clone stays on
   `main`, never a feature branch, never detached; agents work in
   worktrees, not the primary checkout. `make doctor` diagnoses the
   invariant read-only; `make doctor-fix` performs the safe, unattended
   repair (hostage worktree holding `main`, detached primary) and refuses
   ambiguous cases (primary on a feature branch, mid-conflict, diverged
   `main`, dirty tree) — those need a human decision. Include the
   write-guard rule as a one-liner under this invariant: "Any script that
   regenerates a tracked file must call the primary-checkout write-guard
   (`scripts/primary-checkout-guard.sh`); regenerate from a worktree, never
   the primary checkout." — cross-referencing this invariant (see the
   "Guardrail: keep generated files out of the primary checkout"
   instruction above).
10. **Task closure** — sync `main` (`make main-sync`), mark scaffold steps
    complete if the PR finished one (`scaffold complete <step>`), update
    memory/lessons with anything surprising, move to the next task.
11. **Agent crash recovery** — diagnose with `git status`, `git log -3
    --oneline`, `git diff origin/main...HEAD`, `gh pr list --state open`;
    a continue/abort/restart decision table keyed on branch/commit/PR
    state; never run destructive operations (`git reset --hard`, `git
    push --force`, `git branch -D`) without confirming with the user;
    recover missing commits via `git reflog`.
12. **Cheat sheet** — a fenced code block with the full loop (branch,
    commit, push, `gh pr create`, `mmr review --pr`, `make mq-enqueue
    PR=<N>`, `make main-sync && make prune-merged`) and
    the parallel-agent worktree variant (`scripts/setup-agent-worktree.sh
    <name> --install`, `cd .worktrees/<name>`, work normally).

### Configure the PostToolUse review-reminder hook
`scaffold hooks install` (instruction 3 above) registers this hook: it
deep-merges into the `hooks.PostToolUse` array of the target project's
`.claude/settings.json`, creates the file when missing, appends the hook
object only if an equivalent `gh pr create` reminder isn't already present
(e.g. from the `automated-pr-review` step), and never replaces or drops
unrelated existing hooks. The registered hook, for reference (equivalence
is detected on the `gh pr create` trigger string):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.command // empty' | grep -q 'gh pr create' && echo 'MANDATORY: run mmr review --pr <PR#> --sync --format json before moving on (maximum 3 rounds per bounded cycle; after a concrete repair, review the new exact head from round 1; see docs/git-workflow.md).' || true"
          }
        ]
      }
    ]
  }
}
```

### Update CLAUDE.md
Update these sections (create if missing) with the D7 branch/commit
conventions and the local-quality-gate framing above. Cross-reference
docs/git-workflow.md rather than restating its full content:
- **Committing/PR Workflow** — branch naming, commit format, and the
  8-step flow with `mmr review --pr` as mandatory step 5.5
- **Task Closure** — sync main, mark scaffold steps complete, close beads
  only after the merge is verified
- **Parallel Sessions** — one open PR per agent, the agent-ops worktree
  commands (`scripts/setup-agent-worktree.sh`, `make prune-merged`)
- **Worktree Awareness** — the primary-checkout invariant, `make doctor` /
  `make doctor-fix`
- **Code Review** — mandatory `mmr review --pr` after `gh pr create`,
  referencing the PostToolUse hook configured above
