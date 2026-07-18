---
name: dev-env-setup
description: Configure local dev environment with live reload and simple commands
summary: "Configures your project so a single command starts everything — dev server with live reload, local database, environment variables — and documents the setup in a getting-started guide."
phase: "environment"
order: 310
dependencies: [project-structure]
outputs: [docs/dev-setup.md]
conditional: null
reads: [tdd]
knowledge-base: [dev-environment, test-impact-analysis]
---

## Purpose
Set up a complete local development environment with a one-command dev experience,
live/hot reloading, local database configuration, environment variable management,
and beginner-friendly documentation. Populates the CLAUDE.md Key Commands table
which becomes the single source of truth for project-specific commands referenced
by the entire workflow.

## Inputs
- docs/tech-stack.md (required) — determines dev server, database, and tooling
- docs/project-structure.md (required) — where config files live
- docs/coding-standards.md (optional) — linter/formatter already configured
- docs/tdd-standards.md (optional) — test runner, flags, coverage thresholds, quality gates

## Expected Outputs
- docs/dev-setup.md — getting started guide, daily development, common tasks,
  troubleshooting, and AI agent instructions
- Makefile or package.json scripts (dev, test, test:watch, lint, db-setup, db-reset)
- .env.example with all required variables and sensible local defaults
- CLAUDE.md updated with Key Commands table (every row marked **Agent-safe** or
  **Ask-first**) and Dev Environment section

## Quality Criteria
- (mvp) Dev server starts with a single command and supports live/hot reloading
- (deep) Local database setup is scripted (if applicable)
- (deep) .env.example documents all variables with comments
- (mvp) Key Commands table in CLAUDE.md matches actual Makefile/package.json commands
- (mvp) Every Key Commands table row carries an Agent-safe or Ask-first marker
- (mvp) Lint and test commands exist and are runnable
- (deep) Verification checklist passes (install, dev server, browser, live reload, tests, db)
- (mvp) Setup process works for first-time clone (max 5 steps)
- (mvp) Makefile/package.json includes at minimum: dev, test, lint, check,
  check-affected targets
- (mvp) `check-affected` selects tests affected relative to
  `${MQ_AFFECTED_BASE:-origin/main}` and falls back to full `make check` when it
  cannot classify the change (recipes per stack: test-impact-analysis knowledge
  entry) — this cheap gate is the baseline for every project
- (deep) When the merge-queue component is installed, `check-affected` also
  honors the full queue contract: excludes ids listed in `.mq/quarantine.txt`;
  on failure MAY write failing test ids to `.mq-failed-tests.txt` and SHOULD
  honor `MQ_RETRY_TESTS` on reruns
- (deep) Every agent-ops target present in the Makefile (via `agent-ops.mk`)
  has a matching Key Commands row using that target's own `## [agent-safe]`
  doc-comment as its marker

## Methodology Scaling
- **deep**: Full environment with database setup, seed data, Docker Compose (if
  needed), watch mode tests, multi-platform instructions (Mac, Linux, WSL),
  troubleshooting section. Complete Key Commands table, every row marked
  Agent-safe/Ask-first, including installed agent-ops targets once present.
- **mvp**: Dev server with live reload, basic lint and test commands, .env.example.
  Minimal docs. Key Commands table with essentials only, still marked
  Agent-safe/Ask-first.
- **custom:depth(1-5)**:
  - Depth 1: dev server with live reload and a single test command.
  - Depth 2: dev server, test command, and basic lint command.
  - Depth 3: add database setup, .env.example, and environment variable management.
  - Depth 4: add troubleshooting section and watch mode tests.
  - Depth 5: full docs with multi-platform support (Mac, Linux, WSL), Docker Compose, and seed data strategy.

## Mode Detection
Update mode if docs/dev-setup.md exists. In update mode: preserve port assignments,
custom scripts, .env variable names, database configuration, and Makefile
customizations. Update CLAUDE.md Key Commands section in-place.

## Update Mode Specifics
- **Detect prior artifact**: docs/dev-setup.md exists
- **Preserve**: port assignments, .env variable names and defaults, database
  connection strings, custom Makefile targets, troubleshooting entries,
  existing Agent-safe/Ask-first markers on rows this step didn't just add
- **Triggers for update**: tech stack changed (new dev server or database),
  project structure changed (new config file locations), new dependencies
  require setup steps, tdd-standards.md changed test commands, the
  agent-ops Makefile fragment (`agent-ops.mk`) was newly installed or
  updated since this step last ran (git-workflow's or staging-environments'
  `scaffold agent-ops install` added Makefile targets that don't yet have a
  Key Commands row)
- **Conflict resolution**: if a new dependency conflicts with an existing port
  or env var, propose a non-breaking alternative; always update CLAUDE.md Key
  Commands table to match actual Makefile/package.json after changes,
  re-deriving the marker for any row whose underlying command changed

## Instructions

### Populate the Key Commands table
Every row in CLAUDE.md's Key Commands table carries a third column,
**Marker**, set to `Agent-safe` or `Ask-first`:
- **Agent-safe** — runs unattended with no destructive effect (dev server,
  test, lint --check, install, doctor/diagnostic commands, snapshot/export
  commands).
- **Ask-first** — formatting sweeps that rewrite files in place, database
  resets, or any other destructive command; an agent running the standing
  autonomous loop must still confirm with the user before running one of
  these.

When a source marker carries a qualifier beyond the two-value taxonomy
(e.g. `agent-ops.mk` tags `staging-up` as `## [agent-safe, worktree-only]`),
preserve the qualifier as a parenthetical after the marker —
`Agent-safe (worktree-only)` — never drop it: the qualifier is a safety
caveat that must survive into the generated table.

Table format:
```markdown
| Command | Purpose | Marker |
|---------|---------|--------|
| `make dev` | Start dev server with live reload | Agent-safe |
| `make test` | Run test suite | Agent-safe |
| `make check-affected` | Fast merge gate: tests affected vs origin/main (falls back to full check) | Agent-safe |
| `make check` | Full authoritative gate (post-merge / nightly / when unsure) | Agent-safe |
| `make db-reset` | Drop and recreate the local database | Ask-first |
```

Classify every command this step adds (dev, test, test:watch, lint,
db-setup, db-reset, and any other Makefile/package.json script) using the
definitions above. `db-reset` and any formatting sweep that rewrites files
in place are always Ask-first; everything else this step generates is
Agent-safe.

### Add the agent-ops targets
The `agent-ops.mk` Makefile fragment (installed by `scaffold agent-ops
install`, wired into the project Makefile via a managed `-include
agent-ops.mk` line) defines ten targets, each carrying its own `##
[agent-safe]` doc-comment. When that fragment is present in the Makefile,
add one Key Commands row per target it defines, copying the marker straight
from its `##` comment rather than re-deriving it:

| Command | Purpose | Marker |
|---------|---------|--------|
| `make main-sync` | Fetch + fast-forward main from anywhere | Agent-safe |
| `make prune-merged` | Sweep merged branches/worktrees, reclaim staging | Agent-safe |
| `make doctor` | Diagnose the primary-checkout invariant (read-only) | Agent-safe |
| `make doctor-fix` | Repair unattended-safe primary-checkout problems | Agent-safe |
| `make beads-snapshot` | Export the Beads DB to a local restore copy | Agent-safe |
| `make staging-up` | Start this worktree's staging stack | Agent-safe (worktree-only) |
| `make staging-down` | Stop this worktree's staging stack | Agent-safe (worktree-only) |
| `make staging-shared-down` | Destroy the shared QA stack (volumes included) | Ask-first |
| `make staging-prune` | Reap orphaned per-worktree staging stacks | Agent-safe |
| `make docker-doctor` | Show engine placement, warn on split-brain | Agent-safe |
| `make tc-reap` | Remove leaked testcontainers from dead sessions | Agent-safe |

`main-sync`, `prune-merged`, `doctor`, `doctor-fix`, and `beads-snapshot`
come from the agent-ops **git** component, installed by the git-workflow
step at most depths (its custom depth 1-2 does not install it) — add these
five rows only once `agent-ops.mk` is included in the Makefile and
`scripts/setup-agent-worktree.sh` exists. `staging-up`, `staging-down`,
`staging-shared-down`, `staging-prune`, `docker-doctor`, and `tc-reap` come
from the agent-ops **staging** component, installed only when the
staging-environments step ran (conditional on containerized services). The
staging targets guard themselves (`staging component not installed`) when
`scripts/ops/` is absent, so only add those rows once `ops/compose/staging.yml`
or `scripts/ops/staging-env.sh` actually exists. `staging-shared-down` is the
one **ask-first** target — it destroys the shared QA stack and its volumes and
runs only from the primary checkout. In both cases the rule is
the same: never add a row for a target that isn't installed yet.

**Sequencing note.** This step runs at phase order 310 — before both
staging-environments (order 315) and git-workflow (order 330), the two
steps that actually install `agent-ops.mk` and the scripts it wires up. On
a fresh build this step's first pass therefore finds neither: populate the
table with this project's own commands only, using the Marker column above.
The agent-ops rows are added the next time this step's Key Commands
reconciliation runs — a later Update Mode pass (see "Triggers for update"
above) or the workflow-audit step's cross-doc consistency check
(`content/pipeline/consolidation/workflow-audit.md`), which verifies
agent-ops targets stay in sync across CLAUDE.md, git-workflow, and
dev-setup. Do not hand-write the agent-ops rows speculatively before
`agent-ops.mk` is actually included in the Makefile — a row documenting a
target that doesn't exist yet is worse than a temporarily missing row.
