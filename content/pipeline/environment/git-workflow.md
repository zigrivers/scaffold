---
name: git-workflow
description: Configure git workflow with branching, PRs, local quality gates, and worktree tooling for parallel agents
summary: "Sets up your branching strategy, commit format, PR workflow with squash-merge, the agent-ops worktree scripts (setup, doctor, prune), and conflict-prevention rules so multiple AI agents work in parallel without conflicts. CI is deliberately deferred to launch; the quality gate is local (pre-commit + make check + MMR review)."
phase: "environment"
order: 330
dependencies: [dev-env-setup]
outputs: [docs/git-workflow.md, scripts/setup-agent-worktree.sh, .github/pull_request_template.md]
conditional: null
knowledge-base: [dev-environment, git-workflow-patterns]
---

## Purpose
Configure the repository for parallel Claude Code sessions working simultaneously.
Define the branching strategy (one task -> one branch -> one PR -> squash-merge ->
delete branch), Conventional Commits format (bead IDs, when Beads is configured,
referenced in commit/PR bodies via `Closes <id>` — never in branch names or commit
subjects), a rebase-never-merge strategy, the 8-step PR workflow with `mmr review`
as mandatory AI-review step 5.5, the agent-ops worktree scripts for parallel agents
(setup, doctor, prune), conflict-prevention rules, and the local quality gate
(pre-commit hooks + `make check` + agent self-review + `mmr review`) that stands in
for CI until a launch target is chosen and automated CI is deliberately wired up.

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
  standards, rebase-never-merge strategy, the "Quality gates (CI deferred)"
  section, the 8-step PR workflow (with `mmr review --pr` as step 5.5),
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
  entry (merged, never overwritten)
- .scaffold/agent-ops.yaml — written with the minimal form (`project_name` +
  `worktree_setup_commands`) if it doesn't already exist
- CLAUDE.md updated with Committing/PR Workflow, Task Closure, Parallel
  Sessions, Worktree Awareness, and Code Review sections

## Quality Criteria
- (mvp) Branch naming format is `<type>/<short-desc>` — `<type>` is a
  Conventional Commits type, `<short-desc>` is kebab-case and <= 40 chars;
  worktree workspace branches are `agent/<name>`; no bead IDs appear
  anywhere in a branch name
- (mvp) Commit format is `type(scope): subject` (Conventional Commits); a
  bead ID, when Beads is configured, appears only in the commit/PR body as
  `Closes <id>` — never in the branch name or the commit subject
- (mvp) The "Quality gates (CI deferred)" section states the gate
  explicitly (pre-commit hooks + `make check` + agent self-review + `mmr
  review`), states that `.github/workflows/` is deliberately absent until a
  launch target is chosen, and includes a short "adding CI later" pointer
- (deep) PR workflow documents all 8 steps plus step 5.5 — (1) commit,
  (2) local review, (3) rebase, (4) push, (5) create PR, (6) watch local
  gates (CI deferred), (7) merge, (8) sync main via `make main-sync &&
  make prune-merged` — with step 5.5 = `mmr review --pr <N> --sync
  --format json` between creating the PR and the gates/merge, including
  the 3-round cap and the degraded-pass self-merge path
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
  rule, branching, commits, rebase strategy, quality gates (CI deferred),
  the 8-step PR workflow with `mmr review` as step 5.5, conflict-prevention
  rules, worktree documentation, the primary-checkout invariant, task
  closure, agent crash recovery, and the cheat sheet. Agent-ops git
  component installed, PR template generated, PostToolUse hook configured,
  and comprehensive CLAUDE.md updates.
- **mvp**: The single rule, branching, commit format, quality gates (CI
  deferred), and the 8-step PR workflow (mmr review still mandatory as
  step 5.5). The agent-ops git component is installed for the mvp preset
  (as it is for deep) — it is a cheap, idempotent script install that
  `/work-beads` depends on. Custom depth follows its own ladder below (the
  component installs starting at depth 3). Skip the crash-recovery and
  conflict-prevention detail sections; keep CLAUDE.md updates minimal.
- **custom:depth(1-5)**:
  - Depth 1: the single rule, branching strategy, commit format, and the
    "Quality gates (CI deferred)" section.
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
  bundle version
- **Conflict resolution**: if the existing doc still documents an
  automated CI workflow from before CI was deferred, do not silently
  delete that section — flag the discrepancy to the user (a prior CI
  decision may be intentional) and only replace it with the "Quality
  gates (CI deferred)" section on explicit confirmation; verify the
  CLAUDE.md workflow section stays consistent after any changes

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

3. **Register the Beads destructive-command guard** (only when the project
   uses Beads — skip entirely when `.beads/` is absent). `scripts/bd-guard.sh`
   (installed by the git component above) is a Claude Code PreToolUse hook
   that refuses `bd bootstrap`, destructive `bd init`, and `.beads` deletion
   while a populated database exists. Merge it into `.claude/settings.json` —
   never overwrite the file; `bd setup claude` hooks and the PR-review
   reminder hook also own entries there:
   ```bash
   if [ -d .beads ] && [ -x scripts/bd-guard.sh ]; then
     mkdir -p .claude
     [ -f .claude/settings.json ] || printf '{}\n' > .claude/settings.json
     if ! grep -q 'bd-guard.sh' .claude/settings.json; then
       tmp=$(mktemp)
       jq '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher":"Bash","hooks":[{"type":"command","command":"scripts/bd-guard.sh"}]}])' \
         .claude/settings.json > "$tmp" && mv "$tmp" .claude/settings.json
     fi
   fi
   ```
   Codex, Cursor, and other harnesses have no PreToolUse hook: for them the
   guard is available as `scripts/bd-guard.sh --check "<command>"`, and the
   AGENTS.md Beads rules (see claude-md-optimization) carry the prose rule.

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
   chars; no bead IDs in the branch name. Worktree workspace branches are
   `agent/<name>` (per §8 below). A branch lives only as long as its PR is
   open — squash-merge with `--delete-branch` removes it automatically.
3. **Commits** — Conventional Commits format `type(scope): subject`; a bead
   ID, when Beads is configured, is referenced only in the body as
   `Closes <id>`, never in the branch name or subject line. Pre-commit
   hooks are mandatory — never `--no-verify`.
4. **Rebase strategy** — `git fetch origin && git rebase origin/main`
   before pushing and whenever `main` advances while the PR is open;
   `git push --force-with-lease` only, never plain `--force`. No merge
   commits land on `main` — squash-merge is the only merge mode.
5. **Quality gates (CI deferred)** — state explicitly: the gate is
   pre-commit hooks + `make check` + agent self-review + `mmr review`;
   `.github/workflows/` is deliberately absent until a launch/deploy
   target is chosen. Include a short "adding CI later" pointer: when a
   launch target is picked, wire the same `make check` and `mmr review`
   commands into a CI workflow and enable branch protection referencing
   that workflow's job name — until then, this document is the gate.
6. **The 8-step PR workflow** — (1) commit -> (2) local review
   (`make check`, re-read the diff) -> (3) rebase -> (4) push ->
   (5) `gh pr create` (auto-applies `.github/pull_request_template.md`) ->
   **step 5.5: `mmr review --pr <N> --sync --format json`** (mandatory;
   3-round cap — round 1 fixes every real finding, round 2+ fixes P0/P1
   only and files beads for P2/P3, hard cap 3 rounds then
   complete a degraded-pass self-merge; the one thing that still blocks
   the merge is a verified, still-reproducing P0) -> (6) watch local
   gates — CI is deferred, so this means confirming pre-commit hooks ran
   and `make check` is green on the branch HEAD -> (7) `gh pr merge
   --squash --delete-branch` — with 3+ concurrent agents, serialize the
   merge via `bd merge-slot acquire --wait` when the project's Beads has
   merge-slots, releasing after the merge -> (8) `make main-sync && make
   prune-merged` from the primary checkout. Cross-reference the
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
   `agent/<name>`, created via `scripts/setup-agent-worktree.sh <name>
   --install --task "..."` (`--install` runs the dependency-install setup
   commands — a plain invocation installs nothing); per-worktree agent
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
    commit, push, `gh pr create`, `mmr review --pr`, `gh pr merge
    --squash --delete-branch`, `make main-sync && make prune-merged`) and
    the parallel-agent worktree variant (`scripts/setup-agent-worktree.sh
    <name> --install`, `cd .worktrees/<name>`, work normally).

### Configure the PostToolUse review-reminder hook
Merge (never overwrite) the following into the target project's
`.claude/settings.json`. If the file doesn't exist, create it with just
this content. If it exists, deep-merge into the `hooks.PostToolUse` array —
append this hook object only if an equivalent `gh pr create` reminder isn't
already present (e.g. from the `automated-pr-review` step); never replace
or drop unrelated existing hooks.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.command // empty' | grep -q 'gh pr create' && echo 'MANDATORY: run mmr review --pr <PR#> --sync --format json before moving on (3-round cap; see docs/git-workflow.md).' || true"
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
