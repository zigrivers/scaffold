# Implementation Prompt: V1 Operational Commands → V2 Migration

**Give this entire prompt to Claude Code in a new session.**

---

## Task

Implement the approved design spec at `docs/superpowers/specs/2026-03-29-v1-operational-commands-v2-migration-design.md`. This migrates 13 v1 operational commands to the v2 architecture using a hybrid approach: Phase 15 "Build" for execution steps + `tools/` directory for utilities.

**Read the full design spec first.** It is the source of truth for all decisions made below.

## Branch

Create a feature branch from main:
```bash
git checkout -b feat/v1-commands-v2-migration origin/main
```

## Implementation Order

Execute these phases in order. Run `make check` after each phase to catch issues early. Use TDD — write/update tests first where applicable.

### Phase 1: Schema & Build System Changes

**1a. Update PHASES constant** (`src/types/frontmatter.ts`)
- Add `{ number: 15, slug: 'build', displayName: 'Build' }` to the PHASES array

**1b. Add new frontmatter fields** (`src/types/frontmatter.ts`)
- Add `stateless: boolean` (default: `false`) to MetaPromptFrontmatter
- Add `category: 'pipeline' | 'tool'` (default: `'pipeline'`) to MetaPromptFrontmatter

**1c. Update frontmatter validation** (`src/project/frontmatter.ts`)
- Make `phase` nullable when `category: 'tool'`
- Make `order` nullable when `category: 'tool'`
- Validate `stateless` as boolean
- Validate `category` as enum `['pipeline', 'tool']`
- When `category: 'pipeline'`, phase and order remain required

**1d. Update meta-prompt loader** (`src/core/assembly/meta-prompt-loader.ts`)
- Extend discovery to scan both `pipeline/**/*.md` and `tools/**/*.md`
- Set `category: 'tool'` for files found in `tools/`
- Set `category: 'pipeline'` for files found in `pipeline/`

**1e. Update dependency graph** (`src/core/dependency/graph.ts`)
- Exclude steps with `category: 'tool'` from topological sort (they have no phase/order)
- Include build phase steps normally

**1f. Update eligibility** (`src/core/dependency/eligibility.ts`)
- Steps with `stateless: true` excluded from standard `scaffold next` pending-step results
- Build phase steps (phase 15, stateless) shown as "available (on-demand)" once their dependencies are met (implementation-playbook completed)
- Resume steps (`single-agent-resume`, `multi-agent-resume`) conditionally shown only when evidence of prior agent activity exists
- `scaffold status` shows build phase as "N steps available (on-demand)" not "0/N completed"
- Tools never appear in `scaffold next` or `scaffold status`

**1g. Update state manager** (`src/state/state-manager.ts`)
- `setStepStatus()` becomes a no-op for steps with `stateless: true`
- `scaffold complete <stateless-step>` returns a friendly message

**1h. Update build command** (`src/cli/commands/build.ts`)
- Ensure both `pipeline/` and `tools/` directories are processed
- Both go through the same adapter output path → `commands/<slug>.md`

Run `make check` — all existing tests should still pass.

### Phase 2: Knowledge Entries

Create 7 new knowledge entries. Follow the exact frontmatter pattern used by existing entries in `knowledge/`. Read a few existing entries first to match the format precisely.

**2a. Create `knowledge/execution/` directory** with 4 entries:

**`tdd-execution-loop.md`** — Core TDD execution discipline for AI agents
- Topics: `[tdd, execution, testing, workflow]`
- Content: Red-green-refactor cycle, when to commit (after each green test, after each refactor), PR creation patterns (one PR per task, descriptive titles, test evidence in description), test-first discipline (never skip the failing test step), handling flaky tests, slow test suites, test isolation, when to stop and ask for help vs push through

**`task-claiming-strategy.md`** — How agents pick and manage work
- Topics: `[tasks, execution, agents, planning]`
- Content: Task selection algorithm (lowest-ID unblocked task for deterministic ordering), dependency awareness (check blockers before starting, re-check after completing), multi-agent conflict avoidance (claim before starting, detect file overlap, communicate via git), what to do when blocked (skip and document, don't wait), conditional Beads integration (`bd ready` if `.beads/` exists, markdown/implementation-plan task parsing otherwise)

**`worktree-management.md`** — Git worktree patterns for parallel agents
- Topics: `[git, worktrees, multi-agent, branching]`
- Content: Setup via `scripts/setup-agent-worktree.sh`, workspace branch conventions, branching always from `origin/main` (never local main — it's checked out in the main repo), naming convention `bd-<id>/<desc>`, between-task cleanup (`git fetch origin --prune && git clean -fd`, reinstall deps), rebase strategy (rebase on origin/main before PR), conflict resolution, worktree removal and pruning (`git worktree remove`, `git worktree prune`), batch cleanup of merged branches

**`enhancement-workflow.md`** — Adding features to existing projects
- Topics: `[enhancement, features, planning, discovery]`
- Content: 4-phase discovery flow (discovery → docs update → task creation → summary), impact analysis patterns (fit check against vision/PRD, scope assessment, technical impact), documentation update strategy (PRD addenda with traceability markers `[Enhancement added YYYY-MM-DD]`, new user stories following INVEST criteria), innovation pass (competitive analysis, enhancement opportunities, AI-native possibilities), task decomposition for enhancements (data model → backend → frontend → polish), complexity gate (redirect to enhancement from quick-task when scope exceeds threshold)

**2b. Create `knowledge/tools/` directory** with 3 entries:

**`release-management.md`** — Release engineering best practices
- Topics: `[release, versioning, changelog, git]`
- Content: Semantic versioning rules (major for breaking, minor for features, patch for fixes), conventional commit parsing (`feat:` → minor, `fix:` → patch, `BREAKING CHANGE:` or `!:` → major, highest-wins rule), changelog best practices (Keep a Changelog format, group by Added/Fixed/Changed/Other), quality gate requirements (must pass before release), GitHub release creation (`gh release create`, pre-release for 0.x), rollback procedures (revert tag, revert commits, update version files), conditional Beads integration (cross-reference closed tasks in changelog)

**`version-strategy.md`** — Version management patterns
- Topics: `[versioning, packages, ecosystems]`
- Content: Version file detection across ecosystems (`package.json`, `pyproject.toml`, `Cargo.toml`, `.claude-plugin/plugin.json`, `pubspec.yaml`, `setup.cfg`, `version.txt`), lock file synchronization after bumps (`npm install --package-lock-only`, `cargo update -w`), first-version bootstrapping (offer to create version file if none exists, suggest 0.1.0 or 1.0.0), version mismatch detection (version in files > last tag), dry-run mode (preview without mutations)

**`session-analysis.md`** — Analyzing Claude Code sessions for patterns
- Topics: `[analysis, automation, sessions]`
- Content: What to look for (repeated actions, common errors, automation opportunities, workflow bottlenecks), session history parsing patterns, recommendation generation (suggest scripts, aliases, hooks for repeated patterns), output format

Run `make check`.

### Phase 3: Build Phase Meta-Prompts (`pipeline/build/`)

Create the `pipeline/build/` directory with 6 meta-prompt files. Read 2-3 existing pipeline meta-prompts first (e.g., `pipeline/finalization/implementation-playbook.md`, `pipeline/planning/implementation-plan.md`) to match the exact format — frontmatter fields, section structure (`## Purpose`, `## Inputs`, `## Expected Outputs`, `## Quality Criteria`, `## Instructions`, etc.).

**Important**: Port the existing v1 command content from `commands/` as the base, then enrich with:
- Structured sections matching the pipeline meta-prompt pattern
- Knowledge-base references in frontmatter
- Pre-flight verification checklists
- Recovery procedures
- Conditional Beads support (detect `.beads/`, use if present)
- Mode Detection + Update Mode Specifics blocks (even though these are stateless, maintain the pattern for consistency)

**3a. `pipeline/build/single-agent-start.md`**
```yaml
name: single-agent-start
description: Start single-agent TDD execution loop
phase: "build"
order: 1510
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [tdd-execution-loop, task-claiming-strategy]
reads: [coding-standards, tdd, git-workflow]
```

**3b. `pipeline/build/single-agent-resume.md`**
```yaml
name: single-agent-resume
description: Resume single-agent work after a break
phase: "build"
order: 1520
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [tdd-execution-loop, task-claiming-strategy]
reads: [coding-standards, tdd, git-workflow]
```

**3c. `pipeline/build/multi-agent-start.md`**
```yaml
name: multi-agent-start
description: Start multi-agent execution loop in a worktree
phase: "build"
order: 1530
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [tdd-execution-loop, task-claiming-strategy, worktree-management]
reads: [coding-standards, tdd, git-workflow]
argument-hint: "<agent-name>"
```

**3d. `pipeline/build/multi-agent-resume.md`**
```yaml
name: multi-agent-resume
description: Resume multi-agent work after a break
phase: "build"
order: 1540
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [tdd-execution-loop, task-claiming-strategy, worktree-management]
reads: [coding-standards, tdd, git-workflow]
argument-hint: "<agent-name>"
```

**3e. `pipeline/build/quick-task.md`**
```yaml
name: quick-task
description: Create a focused task for a bug fix, refactor, or small improvement
phase: "build"
order: 1550
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [task-claiming-strategy]
reads: [create-prd, user-stories, coding-standards, tdd, project-structure]
argument-hint: "<task description>"
```

**3f. `pipeline/build/new-enhancement.md`**
```yaml
name: new-enhancement
description: Add a new feature to an existing project
phase: "build"
order: 1560
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [enhancement-workflow, task-claiming-strategy]
reads: [create-prd, user-stories, coding-standards, tdd, project-structure]
argument-hint: "<enhancement description>"
```

Run `make check`.

### Phase 4: Tool Meta-Prompts (`tools/`)

Create the `tools/` directory at repo root with 7 meta-prompt files. Same enrichment approach as Phase 3 — port v1 content, restructure into sections, add knowledge-base references.

**4a. `tools/version-bump.md`**
```yaml
name: version-bump
description: Bump version and update changelog without tagging or releasing
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: [version-strategy]
argument-hint: "<major|minor|patch or --dry-run>"
```

**4b. `tools/release.md`**
```yaml
name: release
description: Create a versioned release with changelog and GitHub release
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: [release-management, version-strategy]
argument-hint: "<version or --dry-run or rollback>"
```

**4c. `tools/version.md`**
```yaml
name: version
description: Show installed and latest scaffold version
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: []
```

**4d. `tools/update.md`**
```yaml
name: update
description: Check for and apply scaffold updates
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: []
```

**4e. `tools/dashboard.md`**
```yaml
name: dashboard
description: Open visual pipeline dashboard in browser
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: []
```

**4f. `tools/prompt-pipeline.md`**
```yaml
name: prompt-pipeline
description: Display full pipeline reference
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: []
```

**4g. `tools/session-analyzer.md`**
```yaml
name: session-analyzer
description: Analyze session history to find automation opportunities
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: [session-analysis]
```

Run `make check`.

### Phase 5: Delete Old V1 Command Files

After confirming the build system generates the new commands correctly:

```bash
scaffold build
```

Verify the 13 commands are now generated from the new sources (check they have the "Domain Knowledge" section injected for ones with knowledge-base entries). Then delete the old manually-maintained files — they'll be replaced by the build output:

- `commands/single-agent-start.md`
- `commands/single-agent-resume.md`
- `commands/multi-agent-start.md`
- `commands/multi-agent-resume.md`
- `commands/quick-task.md`
- `commands/new-enhancement.md`
- `commands/version-bump.md`
- `commands/release.md`
- `commands/version.md`
- `commands/update.md`
- `commands/dashboard.md`
- `commands/prompt-pipeline.md`
- `commands/session-analyzer.md`

Run `scaffold build` again to regenerate from the new sources, then `make check`.

### Phase 6: Skill Updates

**6a. Update `skills/scaffold-runner/SKILL.md`**

Add these sections/changes:

1. **Activation triggers** — add:
   - User says "start building", "begin implementation", "run agent", "start agent"
   - User asks about tools: "bump version", "create a release", "show version"
   - User says "what can I build?" or "what tools are available?"

2. **Phase reference table** — add build phase:
   ```
   | build | Build | single-agent-start, single-agent-resume, multi-agent-start,
   |       |       | multi-agent-resume, quick-task, new-enhancement |
   ```

3. **New section: "Stateless Step Execution"** — after "Core Workflow" section:
   - When executing a step with `stateless: true` (build phase or tool):
     - Skip `scaffold complete <step>` (no-op)
     - Skip "show what's next" flow
     - Instead: Show execution summary, offer to run another build step or tool
   - Agent resume steps: conditionally offered when evidence of prior activity (feature branches, in-progress tasks)

4. **New section: "Tool Execution"**:
   - Tools skip `scaffold next` eligibility check (always available)
   - Tools still go through preview → decision extraction → execution
   - Tools support argument passthrough: `scaffold run release --dry-run`

5. **Navigation table** — add entries:
   | User Says | Action |
   |---|---|
   | "Start building" / "Begin implementation" | `scaffold run single-agent-start` |
   | "Start multi-agent" / "Set up agents" | `scaffold run multi-agent-start <agent-name>` |
   | "Quick task" / "Bug fix" / "Small fix" | `scaffold run quick-task <description>` |
   | "New feature" / "Add enhancement" | `scaffold run new-enhancement <description>` |
   | "Bump version" / "Version bump" | `scaffold run version-bump` |
   | "Create release" / "Release" | `scaffold run release` |
   | "What tools are available?" | `scaffold list --tools` |
   | "Show version" | `scaffold run version` |

**6b. Update `skills/scaffold-pipeline/SKILL.md`**

Add Phase 15 (Build) to the pipeline reference with its 6 steps, noting they are stateless/on-demand.

### Phase 7: Update Tests

Write or update tests to cover:
- Frontmatter validation accepts `stateless: true` and `category: 'tool'`
- Frontmatter validation allows null phase/order for tools
- Frontmatter validation rejects null phase/order for pipeline category
- Build system discovers files in both `pipeline/` and `tools/`
- Dependency graph excludes tools from topological sort
- Eligibility excludes stateless steps from standard `scaffold next`
- Eligibility shows build phase steps as "available" once deps met
- State manager is no-op for stateless steps
- All 6 build phase meta-prompts have valid frontmatter
- All 7 tool meta-prompts have valid frontmatter
- All 7 knowledge entries have valid frontmatter
- `scaffold build` successfully generates all 13 commands

Run `make check` — everything must pass.

### Phase 8: Documentation Updates

**8a. Update CHANGELOG.md**

Add a new version entry at the top following the existing format:

```markdown
## [2.37.0] — YYYY-MM-DD

### Added

- **Phase 15: Build** — New pipeline phase with 6 stateless execution steps (`single-agent-start`, `single-agent-resume`, `multi-agent-start`, `multi-agent-resume`, `quick-task`, `new-enhancement`). Appears in `scaffold next` once phase 14 is complete, always available for repeated use.
- **Tools category** — 7 utility commands (`version-bump`, `release`, `version`, `update`, `dashboard`, `prompt-pipeline`, `session-analyzer`) in new `tools/` directory. Orthogonal to the pipeline, usable at any time.
- **`stateless` frontmatter field** — Steps that don't track completion state. Used by build phase steps and tools.
- **`category` frontmatter field** — Distinguishes pipeline steps (`category: pipeline`) from utility tools (`category: tool`).
- **4 execution knowledge entries** — `tdd-execution-loop`, `task-claiming-strategy`, `worktree-management`, `enhancement-workflow` in `knowledge/execution/`.
- **3 tool knowledge entries** — `release-management`, `version-strategy`, `session-analysis` in `knowledge/tools/`.
- **Scaffold-runner: stateless step support** — Runner handles build phase and tool execution without completion tracking; resume steps conditionally visible.
- **Scaffold-runner: tool execution** — Tools skip eligibility checks, support argument passthrough.

### Changed

- **Build system** scans both `pipeline/` and `tools/` directories for meta-prompts.
- **Dependency graph** excludes tools from topological sort.
- **Eligibility system** shows build phase steps as "available (on-demand)" once dependencies met.
- **13 operational commands** migrated from manually-maintained v1 files to v2 build-generated output with knowledge injection.
- **Agent execution commands** enriched with deep TDD, task claiming, and worktree management knowledge (previously ~10 lines each).

### Fixed

- **V1/V2 parity gap** — 13 commands that bypassed the build system now flow through `scaffold build` with full knowledge-base injection, adapter support, and frontmatter validation.
```

Use the actual date when you write this.

**8b. Update README.md**

Make these targeted updates:

1. **The Pipeline section** — Add Phase 15 (Build) to the phase table:
   ```
   | 15 | Build | 6 | Execute: single/multi-agent start/resume, quick-task, new-enhancement |
   ```
   Update the total step count accordingly.

2. **After Pipeline section** — Update to reference the new v2 commands and explain they're now part of the build system. Mention they get knowledge-base injection and are accessible via `scaffold run <command>`.

3. **CLI Commands section** — If `scaffold list --tools` is mentioned, ensure it's documented. If not, add it.

4. **Architecture section** (for contributors) — Add `tools/` to the content layout diagram. Mention the `stateless` and `category` fields.

5. **Knowledge System section** — Update the entry count and add the two new categories (`execution`, `tools`).

**8c. Update any other docs that reference the pipeline phase count or step count** — search for "14 phases" or "15 phases" or "54 steps" or similar and update to reflect the new totals (16 phases, 61 pipeline steps + 7 tools).

### Phase 9: Final Verification

```bash
make check          # All quality gates pass
scaffold build      # Regenerate all commands
make check          # Still passes after regeneration
```

Verify manually:
- `scaffold build` output mentions the new build phase steps and tools
- Generated `commands/single-agent-start.md` has a "Domain Knowledge" section
- Generated `commands/release.md` has a "Domain Knowledge" section
- Generated `commands/version.md` does NOT have a "Domain Knowledge" section (no knowledge entries)

### Phase 10: PR, Merge, and Release

**10a. Commit all changes**

Stage and commit with a descriptive message:
```bash
git add -A
git commit -m "feat: migrate 13 v1 operational commands to v2 architecture (#XXX)

- Add Phase 15 'Build' with 6 stateless execution steps
- Add tools/ directory with 7 utility commands
- Add stateless and category frontmatter fields
- Create 7 knowledge entries (4 execution, 3 tools)
- Update build system for dual-directory scanning
- Update scaffold-runner skill for stateless/tool execution
- Enrich agent commands with TDD, task claiming, worktree knowledge
- Delete 13 manually-maintained v1 command files"
```

**10b. Push and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: migrate v1 operational commands to v2 architecture" --body "$(cat <<'EOF'
## Summary

- Migrates 13 v1 operational commands to v2 architecture using hybrid approach
- Adds Phase 15 "Build" with 6 stateless execution steps in `pipeline/build/`
- Adds `tools/` directory with 7 utility commands
- Creates 7 new knowledge entries (4 execution, 3 tools)
- Updates schema with `stateless` and `category` frontmatter fields
- Updates build system, state system, eligibility, and scaffold-runner skill

## Design Spec

See `docs/superpowers/specs/2026-03-29-v1-operational-commands-v2-migration-design.md`

## Test plan

- [ ] `make check` passes (lint + validate + test)
- [ ] `scaffold build` generates all 13 commands from new sources
- [ ] Generated commands with knowledge-base entries have "Domain Knowledge" section
- [ ] Generated commands without knowledge-base entries don't have empty sections
- [ ] New frontmatter fields (`stateless`, `category`) validate correctly
- [ ] Tools excluded from topological sort
- [ ] Build phase steps appear in eligibility once dependencies met

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**10c. Wait for CI and merge**

```bash
gh pr checks --watch   # Wait for CI to pass
gh pr merge --squash --delete-branch
git checkout main && git pull origin main
```

**10d. Version bump and release**

After merge, on main:

1. Update version to 2.37.0:
   - `package.json`
   - `.claude-plugin/plugin.json` (bump to next minor, e.g., 2.5.0)
   - Any other version files

2. Commit the version bump:
   ```bash
   git commit -am "chore(version): v2.37.0"
   ```

3. Tag and push:
   ```bash
   git tag -a v2.37.0 -m "Release v2.37.0"
   git push origin main --tags
   ```

4. Create GitHub release:
   ```bash
   gh release create v2.37.0 --title "v2.37.0 — V1 Commands V2 Migration" --notes "$(cat <<'EOF'
   ## What's New

   ### Phase 15: Build
   New pipeline phase with 6 stateless execution steps that appear after completing the documentation pipeline. Agent start/resume, quick-task, and new-enhancement are now full v2 citizens with knowledge-base injection.

   ### Tools Category
   7 utility commands (version-bump, release, version, update, dashboard, prompt-pipeline, session-analyzer) now live in `tools/` and flow through the v2 build system.

   ### Knowledge Enrichment
   7 new knowledge entries covering TDD execution, task claiming, worktree management, enhancement workflows, release management, version strategy, and session analysis.

   ### Schema
   New `stateless` and `category` frontmatter fields enable on-demand steps and tool/pipeline distinction.

   See CHANGELOG.md for full details.
   EOF
   )"
   ```

## Key Constraints

- **TDD**: Write/update tests before implementation where applicable
- **`make check` after every phase**: Don't let issues accumulate
- **Port v1 content faithfully**: Don't lose functionality when migrating. The v1 commands have detailed, well-tested content — restructure and enrich, don't rewrite from scratch
- **Match existing patterns**: Read existing pipeline meta-prompts and knowledge entries before writing new ones. Format, section structure, and frontmatter patterns must be consistent
- **Conditional Beads**: All commands that reference Beads must detect `.beads/` and gracefully handle projects without it, matching the pattern used in existing pipeline steps
- **Don't modify unrelated code**: This migration touches specific files listed in the design spec. Don't refactor surrounding code
