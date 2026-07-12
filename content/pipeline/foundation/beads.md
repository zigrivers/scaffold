---
name: beads
description: Initialize Beads task tracking with CLAUDE.md conventions and lessons file
summary: "Sets up Beads task tracking with a lessons-learned file for cross-session learning, and creates the initial CLAUDE.md skeleton with core principles and workflow conventions."
phase: "foundation"
order: 210
dependencies: []
outputs: [.beads/, tasks/lessons.md, CLAUDE.md, docs/beads-workflow.md]
conditional: "if-needed"
knowledge-base: [task-tracking]
---

## Purpose
Initialize the Beads issue tracker for AI-friendly task tracking, create the
lessons-learned file for cross-session memory, establish the initial CLAUDE.md
skeleton with core principles, task management commands, self-improvement rules,
and autonomous behavior guidelines, and generate docs/beads-workflow.md as the
day-to-day Beads reference (defer-immediately rule, `bd create` template, the
Durability & the bootstrap trap runbook, the Upgrades & migration recipe, and
the D7 relationship between Beads IDs and git).

## Inputs
- Project root directory (required) — must be a git repository
- Existing CLAUDE.md (optional) — if present, operates in update mode

## Expected Outputs
- .beads/ directory — initialized Beads data store with git hooks (installed/repaired via `bd doctor --fix`)
- tasks/lessons.md — patterns and anti-patterns file for cross-session learning
- CLAUDE.md — marker-managed Beads integration block installed via `bd setup claude`
  (the recipe owns the section between `<!-- BEGIN BEADS INTEGRATION ... -->` and
  `<!-- END BEADS INTEGRATION -->`; survives re-runs). The recipe wires `bd prime
  --hook-json` into SessionStart/PreCompact hooks so agent context is loaded
  automatically. Scaffold adds its own Core Principles + commit convention sections
  AROUND that block but does NOT hand-roll the Beads command reference — `bd prime`
  is the single source of truth for agent context.
- docs/beads-workflow.md — scaffold-owned reference for day-to-day Beads usage:
  the defer-immediately rule, the `bd create` template (with the required
  `docs:` tail), day-to-day commands, the bootstrap-trap warning, epics & phase
  conventions, and Beads' relationship to git (D7: IDs referenced only in
  commit/PR bodies, never branch names or commit subjects). Not part of the
  `bd setup claude` marker block — safe to edit freely and unaffected by future
  `bd setup claude` re-runs.

## Quality Criteria
- (mvp) `bd ready` executes without error (Beads is initialized)
- (mvp) .beads/ directory exists and contains Beads data files
- (mvp) Beads git hooks are installed; `bd doctor --fix` was run after `bd init` to
  ensure hooks/config are current (idempotent — also the canonical recovery path if
  `bd` is upgraded later)
- (mvp) tasks/lessons.md exists with Patterns, Anti-Patterns, and Common Gotchas sections
- (mvp) `bd setup claude` was run after `bd init` to install the upstream-managed
  Beads integration block in CLAUDE.md (marker-wrapped, hook-driven). For projects
  also targeting Codex CLI or Antigravity CLI: `bd setup codex`
  were run. Verify with `bd setup claude --check`.
- (mvp) CLAUDE.md contains Core Principles with all four tenets (Simplicity, No Laziness, TDD, Prove It) — scaffold-owned content, ADJACENT to the Beads-managed block
- (mvp) CLAUDE.md contains commit-message convention documenting that a Beads
  task ID, when Beads is configured, is referenced only in the commit/PR body
  as `Closes <id>` — never as a subject-line prefix and never in the branch
  name (D7) — scaffold-owned content
- (mvp) CLAUDE.md contains an upgrade-remediation callout: "If `bd` was upgraded since
  last `bd init`, run `bd doctor --fix` to re-sync git hooks and project config. This
  fixes errors like `unknown command \"hook\" for \"bd\"` from stale post-checkout /
  post-merge hook shims."
- (mvp) Bootstrap commit uses Conventional Commits subject `chore: initialize
  Beads task tracking`; the bootstrap bead ID is referenced only in the commit
  body as `Closes <id>` — never as a subject-line prefix (D7)
- (mvp) docs/beads-workflow.md exists and documents: the defer-immediately
  rule verbatim ("If you decide not to do something now, it becomes a bead —
  immediately.") plus the tracking-exemptions note (a commit-body note, a PR
  comment, an in-code TODO or FIXME comment, or an agent's own memory is not
  tracking; a bare in-code TODO or FIXME with no issue reference attached is
  forbidden); the `bd create` template with a required `docs:` tail;
  day-to-day commands (`bd ready` / `bd list` /
  `bd show` / `bd update --status in_progress` / `bd close` / `bd stats`);
  the bootstrap-trap warning verbatim; epics & phases conventions (`-t epic`
  + `--parent`, phase epics `blocks:` each other); and Beads' relationship to
  git (D7: IDs out of branch names/commit subjects, `Closes <id>` in bodies,
  close only after the squash-merge is verified)
- (mvp) Auto-export to `.beads/issues.jsonl` is explicitly enabled after `bd init`:
  `bd config set export.auto true && bd config set export.git-add true`. Opt-in
  since Beads v1.0.4 (previously default); explicit enable means
  release/version-bump tooling can rely on `.beads/issues.jsonl` being current.
- (mvp) A `bd backup` target is configured (`bd backup status` reports a
  configured destination, not "No backup") and an initial `bd backup sync`
  completed — the full-history disaster-recovery path, kept outside the repo.
- (mvp) Agents pick up Beads workflow context via `bd prime` (loaded automatically by
  the hooks `bd setup claude` installs). Scaffold does NOT hand-roll a Beads command
  reference table — that lives upstream in `bd prime` output. If a project wants
  custom prime content, write `.beads/PRIME.md`.
- (deep) `bd config set types.custom '["story","milestone","spike"]'` was run so
  downstream prompts can use `-t story` and `-t milestone`. Verify with `bd config get types.custom`.
- (deep) Cross-doc consistency verified against git-workflow.md and coding-standards.md

## Methodology Scaling
- **deep**: Full Beads setup — `bd init`, then `bd doctor --fix`, then `bd setup
  claude` (and/or `bd setup codex`).
  Enable custom issue types via `bd config set types.custom '["story","milestone","spike"]'`
  so downstream prompts can use `-t story` for user stories and `-t milestone` for
  releases. Scaffold-owned CLAUDE.md content (Core Principles + commit convention +
  upgrade-remediation callout) is composed ADJACENT to the recipe-managed integration
  block. Detailed priority level documentation. Generates the full
  docs/beads-workflow.md reference (all seven sections, including "Durability &
  the bootstrap trap" and "Upgrades & migration") and cross-doc consistency
  checks against existing git-workflow.md and coding-standards.md (D7 branch/commit
  conventions must agree).
- **mvp**: `bd init`, `bd doctor --fix`, `bd setup claude`, create tasks/lessons.md,
  add minimal scaffold-owned CLAUDE.md sections (Core Principles + commit convention +
  upgrade-remediation callout), and generate docs/beads-workflow.md with its core seven
  sections. Skip cross-doc checks. Custom types stay off — only built-in
  `bug|feature|task|epic|chore|decision` available.
- **custom:depth(1-5)**:
  - Depth 1: `bd init` + `bd doctor --fix` + `bd setup claude` + create tasks/lessons.md. Minimal scaffold CLAUDE.md content (Core Principles only).
  - Depth 2: Depth 1 + add commit convention + upgrade-remediation callout + generate
    docs/beads-workflow.md (defer rule, `bd create` template, day-to-day commands,
    durability & the bootstrap trap, epics & phases, relationship to git,
    upgrades & migration).
  - Depth 3: Add priority level documentation and autonomous behavior rules.
  - Depth 4: Full setup with cross-doc consistency checks (docs/beads-workflow.md
    against git-workflow.md and coding-standards.md). Enable `bd config set types.custom '["story","milestone","spike"]'`.
  - Depth 5: Full setup + detailed autonomous behavior rules + commit-message convention enforcement. Run `bd setup codex`.

## Instructions

Execute these steps in order. Each is idempotent — re-running this prompt on an
existing setup updates rather than re-initializes.

1. **Initialize Beads** (skip if `.beads/` already contains a Dolt DB):
   ```bash
   bd init --init-if-missing   # idempotent (bd >= 1.1.0): no-op when a DB already exists
   ```
   bd ≥ 1.1.0 may ask a one-time usage-metrics consent question on first run
   (`bd metrics`) — answer per project policy; either answer is fine for
   Scaffold's purposes.

2. **Sync hooks and project config against the installed bd version** (idempotent; also
   the canonical recovery path if `bd` is upgraded later):
   ```bash
   bd doctor --fix
   ```

3. **Install the upstream-managed editor integration** for whichever AI agent CLI
   the project targets. The recipe writes a marker-managed block in CLAUDE.md /
   AGENTS.md and installs the SessionStart hooks that load
   `bd prime --hook-json`:
   ```bash
   bd setup claude     # Claude Code (always)
   bd setup codex      # Codex CLI (multi-platform projects only)
   ```
   Verify with `bd setup claude --check`.

4. **Create the project merge-slot** (one-time; idempotent — re-running on an
   existing slot is a no-op). This is required by the multi-agent flow's
   `bd merge-slot acquire --wait` later, and creating it now means downstream
   PR steps can rely on it being present:
   ```bash
   bd merge-slot create 2>/dev/null || true   # exit 0 even if slot already exists
   ```

5. **Enable JSONL auto-export** so release/version-bump tooling can rely on
   `.beads/issues.jsonl` being current:
   ```bash
   bd config set export.auto true
   bd config set export.git-add true
   ```
   Opt-in since Beads v1.0.4. Upstream treats the Dolt database as the source of
   truth and JSONL as an export/interchange copy; we enable auto-export + git-add
   so `.beads/issues.jsonl` stays current and **staged** (`export.git-add` runs
   `git add` only — commit it in your normal commits, and the work-beads skill's
   batch-end step commits any refresh, so an uncommitted copy is never stranded).
   It is the issue-level restore copy `make beads-snapshot` refreshes and the
   recovery source that survived a real database wipe.

6. **Configure a full-fidelity backup** (Dolt history included — `bd export`
   JSONL is issue-level only and NOT a substitute). The target lives outside
   the repository so a checkout deletion or reset cannot take the backup with
   it, and it is made **unique per repository** so two projects that share a
   directory name never collide on one backup path. Detect the "already
   configured" case via the stable machine contract `bd backup status --json`
   (`.dolt.configured`), NOT the exit code or prose: `bd backup status` exits 0
   even when unconfigured, so a bare `bd backup status >/dev/null 2>&1 ||` would
   wrongly skip init on every fresh project, and the human text is
   TTY/format-fragile.
   ```bash
   slug="$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")"
   uniq="$(printf '%s' "$(git config --get remote.origin.url 2>/dev/null || pwd -P)" | cksum | cut -d' ' -f1)"
   bstatus="$(bd backup status --json 2>/dev/null | tr -d '[:space:]' || true)"
   if ! printf '%s' "$bstatus" | grep -q '"configured":true'; then
     mkdir -p "$HOME/.beads-backups"
     bd backup init "$HOME/.beads-backups/${slug}-${uniq}"
   fi
   bd backup sync
   ```
   From now on `make beads-snapshot` (agent-ops git component) refreshes both
   the JSONL copy and this backup. Restore path after a disaster:
   `bd backup restore` (see docs/beads-workflow.md section 4).

7. **(deep methodology only) Enable custom issue types** so downstream prompts can
   use `-t story` for user stories and `-t milestone` for releases:
   ```bash
   bd config set types.custom '["story","milestone","spike"]'
   ```
   Verify with `bd config get types.custom`.

8. **Create the lessons-learned file** for cross-session memory (skip if it already exists — never overwrite accumulated lessons):
   ```bash
   mkdir -p tasks
   if [ ! -f tasks/lessons.md ]; then
     cat > tasks/lessons.md <<'EOF'
   # Lessons Learned

   ## Patterns

   (Add discovered patterns here.)

   ## Anti-Patterns

   (Add anti-patterns here.)

   ## Common Gotchas

   (Add gotchas here.)
   EOF
   else
     # Append any missing section headings; existing content stays.
     grep -q "^## Patterns" tasks/lessons.md || printf '\n## Patterns\n\n(Add discovered patterns here.)\n' >> tasks/lessons.md
     grep -q "^## Anti-Patterns" tasks/lessons.md || printf '\n## Anti-Patterns\n\n(Add anti-patterns here.)\n' >> tasks/lessons.md
     grep -q "^## Common Gotchas" tasks/lessons.md || printf '\n## Common Gotchas\n\n(Add gotchas here.)\n' >> tasks/lessons.md
   fi
   ```

9. **Compose scaffold-owned CLAUDE.md sections** ADJACENT to (not replacing) the
   recipe-managed block from step 3. The scaffold-owned content includes Core
   Principles (Simplicity, No Laziness, TDD, Prove It), the commit-message
   convention (Conventional Commits `type(scope): subject`; a Beads task ID,
   when configured, is referenced only in the commit/PR body as `Closes <id>`
   — never as a subject-line prefix and never in the branch name, per D7),
   the upgrade-remediation callout ("If `bd` was upgraded since last
   `bd init`, run `bd doctor --fix`..."), and (deep) autonomous behavior
   rules.

10. **Bootstrap commit** — Conventional Commits subject; the bootstrap bead ID
   is referenced only in the body (D7):
   ```bash
   git add .beads tasks/lessons.md CLAUDE.md
   git commit -m "$(cat <<'EOF'
   chore: initialize Beads task tracking

   Closes <id>
   EOF
   )"
   ```
   The `<id>` here references whatever bootstrap task you created via
   `bd create "Initialize Beads"` (or the auto-generated bootstrap bead).

### Generate docs/beads-workflow.md
Write docs/beads-workflow.md with the sections below. This is scaffold-owned
reference content — it does not touch (and is never overwritten by) the
`bd setup claude` marker block from step 3.

1. **The deferred-work rule** — verbatim: "If you decide not to do something
   now, it becomes a bead — immediately." Not tracking: a commit-body note, a
   PR comment, an in-code TODO or FIXME comment, or an agent's own memory. A
   bare in-code TODO or FIXME with no issue reference attached is forbidden.
2. **The `bd create` template** — the day-to-day pattern for filing a bead,
   with the `docs:` tail required so the resolving PR knows which docs to
   touch:
   ```bash
   bd create "<imperative title>" -t task -p 2 [-l <area>] [--parent <epic>] \
     --deps discovered-from:<id> \
     -d "<what, why, where (file/function)>; docs: <paths or none>"
   ```
   `-l <area>` and `--parent <epic>` are optional — add them when the bead
   belongs to a labeled area or an epic (see "Epics & phases" below); the
   `work-beads` skill's defer step (2.5) uses this same template without
   those two optional flags.
3. **Day-to-day commands** — `bd ready` (start here — surfaces unblocked
   work) / `bd list` / `bd show <id>` / `bd update <id> --status in_progress`
   / `bd close <id>` (only after the PR is merged and verified) / `bd stats`.
4. **Durability & the bootstrap trap** — verbatim rules:
   - Never run `bd bootstrap`, destructive `bd init`
     (`--reinit-local` / `--discard-remote` / `--destroy-token`; legacy
     `--force`), or any reset on a checkout with a populated local Beads DB —
     it silently replaces local (usually ahead) state with the stale remote.
     Bootstrap is for fresh clones only. Since bd v1.0.4, destructive init
     refuses without explicit flags plus a destroy token (exit codes
     10/11/12) — treat any such refusal as a stop sign, not a puzzle.
   - Push before any reset, and before deleting a checkout with local beads:
     `bd stats` (confirm counts) → `bd dolt commit` → `bd dolt push`. The
     push — not a local snapshot — is what makes beads survivable.
   - Before any reset also run `make beads-snapshot` (agent-ops git
     component): refreshes the committed `.beads/issues.jsonl` restore copy
     and syncs the full `bd backup` target. Bootstrap will NOT auto-use
     either — they are manual restore sources.
   - Drive embedded storage only through `bd` subcommands (`bd dolt …`),
     never a standalone `dolt` CLI — a mismatched engine on the same storage
     can corrupt it.
   - Recovery order if beads go missing: FIRST confirm the remote actually
     lost them (`bd dolt pull`, then `bd stats`) — if the remote still has
     them, pull, don't rebuild. Then `bd backup restore` (full history), then
     `bd import -i .beads/issues.jsonl` (issue-level), and only as a last
     resort reconstruct from committed docs. After any restore:
     `bd dolt commit && bd dolt push`.
   - `scripts/bd-guard.sh` (a PreToolUse hook, registered during git-workflow
     setup) blocks the destructive commands above while the DB is populated.
     A deliberate, human-approved reset sets `BEADS_DESTRUCTIVE_OK=1` for
     that one command — never set it to silence the guard routinely.
5. **Epics & phases** — `bd create "<title>" -t epic --parent <parent-epic>`
   for containers; phase epics `blocks:` each other so `bd ready` surfaces
   only the current phase's work.
6. **Relationship to git** — bead IDs stay out of branch names and commit
   subjects (D7); reference them only in commit/PR bodies as `Closes <id>`;
   close the bead only after the squash-merge is verified on `main`.
7. **Upgrades & migration** — upgrading the `bd` binary can trigger schema
   migrations; crossing a breaking migration un-coordinated can fork Dolt
   histories permanently. Rules: back up first (`make beads-snapshot`). A
   single-clone project just upgrades and runs `bd doctor --fix`. A
   multi-clone project (a second machine, or any fresh clone that pushes)
   follows the designated-migrator recipe: (1) every clone pushes with the
   OLD binary (`bd dolt commit && bd dolt push`); (2) exactly ONE clone runs
   `BD_ALLOW_REMOTE_MIGRATE=1 bd migrate`, then `bd dolt push`; (3) every
   other clone upgrades its binary and re-clones the tracker with
   `bd bootstrap` — safe here ONLY because step 1 pushed everything. Never
   migrate independently on two clones. bd's migrate gate (on by default
   since v1.1.0) refuses unsafe cases — a refusal is a stop sign.

## Conditional Evaluation
Enable when: project uses Beads task tracking methodology (user selects Beads during
setup), or user explicitly enables structured task management. Skip when: user prefers
GitHub Issues, Linear, or another task tracker, or explicitly declines Beads setup.

Note: this step only initializes the tracker — it does **not** create your
implementation tasks. Beads stays empty of plan tasks until the finalization step
`/scaffold:materialize-plan-to-beads` converts `docs/implementation-plan.md` into
Beads issues just before the build phase. An empty `bd ready` right after this
step is therefore expected, not a problem.

## Mode Detection
Update mode if `.beads/` contains a populated database (look for `.beads/embeddeddolt/`
in the default embedded-Dolt layout, `.beads/dolt/` in server mode, or any `.beads/*.db`
file). Legacy v0.x Beads used `.beads/config.json` and a `tasks` directory — recognize
those too for older projects. When unsure, run `bd info` from the project root: a
populated DB returns project metadata; an uninitialized one errors. In update mode:
never re-initialize `.beads/` (existing task data is irreplaceable), never overwrite
`tasks/lessons.md` (only add missing sections), update CLAUDE.md Beads sections
in-place preserving project-specific customizations.

## Update Mode Specifics
- **Detect prior artifact**: .beads/ directory exists with data files
- **Preserve**: all existing task data in .beads/, tasks/lessons.md content
  (patterns, anti-patterns, gotchas), CLAUDE.md Beads command table
  customizations, git hook configurations, and any project-specific
  customizations layered onto docs/beads-workflow.md
- **Triggers for update**: new CLAUDE.md sections need Beads references,
  Beads CLI version changed requiring command updates, git hooks need
  reconfiguration after workflow changes, docs/beads-workflow.md is
  missing or still documents the retired bead-ID commit-prefix convention
  instead of the D7 body-reference form, or docs/beads-workflow.md is missing
  the Durability & the bootstrap trap runbook or the Upgrades & migration section
- **Conflict resolution**: if CLAUDE.md Beads section was manually customized,
  merge new content around existing customizations rather than replacing;
  the same rule applies to docs/beads-workflow.md
