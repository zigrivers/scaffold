---
name: beads
description: Initialize Beads task tracking with CLAUDE.md conventions and lessons file
summary: "Sets up Beads task tracking with a lessons-learned file for cross-session learning, and creates the initial CLAUDE.md skeleton with core principles and workflow conventions."
phase: "foundation"
order: 210
dependencies: []
outputs: [.beads/, tasks/lessons.md, CLAUDE.md]
conditional: "if-needed"
knowledge-base: [task-tracking]
---

## Purpose
Initialize the Beads issue tracker for AI-friendly task tracking, create the
lessons-learned file for cross-session memory, and establish the initial CLAUDE.md
skeleton with core principles, task management commands, self-improvement rules,
and autonomous behavior guidelines.

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

## Quality Criteria
- (mvp) `bd ready` executes without error (Beads is initialized)
- (mvp) .beads/ directory exists and contains Beads data files
- (mvp) Beads git hooks are installed; `bd doctor --fix` was run after `bd init` to
  ensure hooks/config are current (idempotent — also the canonical recovery path if
  `bd` is upgraded later)
- (mvp) tasks/lessons.md exists with Patterns, Anti-Patterns, and Common Gotchas sections
- (mvp) `bd setup claude` was run after `bd init` to install the upstream-managed
  Beads integration block in CLAUDE.md (marker-wrapped, hook-driven). For projects
  also targeting Codex CLI or Gemini CLI: `bd setup codex` and/or `bd setup gemini`
  were run. Verify with `bd setup claude --check`.
- (mvp) CLAUDE.md contains Core Principles with all four tenets (Simplicity, No Laziness, TDD, Prove It) — scaffold-owned content, ADJACENT to the Beads-managed block
- (mvp) CLAUDE.md contains commit-message convention requiring Beads task IDs — scaffold-owned content
- (mvp) CLAUDE.md contains an upgrade-remediation callout: "If `bd` was upgraded since
  last `bd init`, run `bd doctor --fix` to re-sync git hooks and project config. This
  fixes errors like `unknown command \"hook\" for \"bd\"` from stale post-checkout /
  post-merge hook shims."
- (mvp) Bootstrap commit uses `[bd-<id>]` convention (lowercase hash-style IDs per Beads v1.0.0+)
- (mvp) Auto-export to `.beads/issues.jsonl` is explicitly enabled after `bd init`:
  `bd config set export.auto true && bd config set export.git-add true`. As of
  Beads v1.0.4-Unreleased this is opt-in (previously default); explicit enable means
  release/version-bump tooling can rely on `.beads/issues.jsonl` being current.
- (mvp) Agents pick up Beads workflow context via `bd prime` (loaded automatically by
  the hooks `bd setup claude` installs). Scaffold does NOT hand-roll a Beads command
  reference table — that lives upstream in `bd prime` output. If a project wants
  custom prime content, write `.beads/PRIME.md`.
- (deep) `bd config set types.custom '["story","milestone","spike"]'` was run so
  downstream prompts can use `-t story` and `-t milestone`. Verify with `bd config get types.custom`.
- (deep) Cross-doc consistency verified against git-workflow.md and coding-standards.md

## Methodology Scaling
- **deep**: Full Beads setup — `bd init`, then `bd doctor --fix`, then `bd setup
  claude` (and/or `bd setup codex`, `bd setup gemini` for multi-platform projects).
  Enable custom issue types via `bd config set types.custom '["story","milestone","spike"]'`
  so downstream prompts can use `-t story` for user stories and `-t milestone` for
  releases. Scaffold-owned CLAUDE.md content (Core Principles + commit convention +
  upgrade-remediation callout) is composed ADJACENT to the recipe-managed integration
  block. Detailed priority level documentation. Cross-doc consistency checks against
  existing git-workflow.md and coding-standards.md.
- **mvp**: `bd init`, `bd doctor --fix`, `bd setup claude`, create tasks/lessons.md,
  add minimal scaffold-owned CLAUDE.md sections (Core Principles + commit convention +
  upgrade-remediation callout). Skip cross-doc checks. Custom types stay off — only
  built-in `bug|feature|task|epic|chore|decision` available.
- **custom:depth(1-5)**:
  - Depth 1: `bd init` + `bd doctor --fix` + `bd setup claude` + create tasks/lessons.md. Minimal scaffold CLAUDE.md content (Core Principles only).
  - Depth 2: Depth 1 + add commit convention + upgrade-remediation callout.
  - Depth 3: Add priority level documentation and autonomous behavior rules.
  - Depth 4: Full setup with cross-doc consistency checks against git-workflow.md and coding-standards.md. Enable `bd config set types.custom '["story","milestone","spike"]'`.
  - Depth 5: Full setup + detailed autonomous behavior rules + commit-message convention enforcement. Run `bd setup codex` and `bd setup gemini` if the project targets those CLIs.

## Instructions

Execute these steps in order. Each is idempotent — re-running this prompt on an
existing setup updates rather than re-initializes.

1. **Initialize Beads** (skip if `.beads/` already contains a Dolt DB):
   ```bash
   bd init
   ```

2. **Sync hooks and project config against the installed bd version** (idempotent; also
   the canonical recovery path if `bd` is upgraded later):
   ```bash
   bd doctor --fix
   ```

3. **Install the upstream-managed editor integration** for whichever AI agent CLI
   the project targets. The recipe writes a marker-managed block in CLAUDE.md /
   AGENTS.md / GEMINI.md and installs the SessionStart hooks that load
   `bd prime --hook-json`:
   ```bash
   bd setup claude     # Claude Code (always)
   bd setup codex      # Codex CLI (multi-platform projects only)
   bd setup gemini     # Gemini CLI (multi-platform projects only)
   ```
   Verify with `bd setup claude --check`.

4. **Enable JSONL auto-export** so release/version-bump tooling can rely on
   `.beads/issues.jsonl` being current (Beads v1.0.4-Unreleased flipped these
   to opt-in):
   ```bash
   bd config set export.auto true
   bd config set export.git-add true
   ```

5. **(deep methodology only) Enable custom issue types** so downstream prompts can
   use `-t story` for user stories and `-t milestone` for releases:
   ```bash
   bd config set types.custom '["story","milestone","spike"]'
   ```
   Verify with `bd config get types.custom`.

6. **Create the lessons-learned file** for cross-session memory (skip if it already exists — never overwrite accumulated lessons):
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

7. **Compose scaffold-owned CLAUDE.md sections** ADJACENT to (not replacing) the
   recipe-managed block from step 3. The scaffold-owned content includes Core
   Principles (Simplicity, No Laziness, TDD, Prove It), the commit-message
   convention (`[bd-<id>]` prefix, lowercase hash IDs), the upgrade-remediation
   callout ("If `bd` was upgraded since last `bd init`, run `bd doctor --fix`..."),
   and (deep) autonomous behavior rules.

8. **Bootstrap commit** with the lowercase hash-style ID convention:
   ```bash
   git add .beads tasks/lessons.md CLAUDE.md
   git commit -m "[bd-<id>] chore: initialize Beads task tracking"
   ```
   The bd-<id> here references whatever bootstrap task you created via
   `bd create "Initialize Beads"` (or the auto-generated bootstrap bead).

## Conditional Evaluation
Enable when: project uses Beads task tracking methodology (user selects Beads during
setup), or user explicitly enables structured task management. Skip when: user prefers
GitHub Issues, Linear, or another task tracker, or explicitly declines Beads setup.

## Mode Detection
Update mode if .beads/ contains a config.json or tasks directory (not just an
empty directory). In update mode: never re-initialize
.beads/ (existing task data is irreplaceable), never overwrite tasks/lessons.md
(only add missing sections), update CLAUDE.md Beads sections in-place preserving
project-specific customizations.

## Update Mode Specifics
- **Detect prior artifact**: .beads/ directory exists with data files
- **Preserve**: all existing task data in .beads/, tasks/lessons.md content
  (patterns, anti-patterns, gotchas), CLAUDE.md Beads command table
  customizations, git hook configurations
- **Triggers for update**: new CLAUDE.md sections need Beads references,
  Beads CLI version changed requiring command updates, git hooks need
  reconfiguration after workflow changes
- **Conflict resolution**: if CLAUDE.md Beads section was manually customized,
  merge new content around existing customizations rather than replacing
