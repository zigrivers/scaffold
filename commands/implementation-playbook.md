---
description: "Generate agent implementation playbook"
long-description: "Translates the implementation plan and all standards docs into a step-by-step playbook that AI agents follow during the build phase, with wave-by-wave execution, per-task context, and quality gates."
---

Read the implementation plan, architecture, and all standards documents, then generate the implementation playbook — the operational reference AI agents follow during the build phase. This translates the task graph into an executable sequence with agent context.

## Mode Detection

Before starting, check if `docs/implementation-playbook.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document. Check for tracking comment on line 1: `<!-- scaffold:implementation-playbook v<ver> <date> -->`. If absent, treat as legacy — be extra conservative.
2. **Diff against current structure**: Categorize content as **ADD** (missing), **RESTRUCTURE** (wrong structure), or **PRESERVE** (project-specific conventions, agent notes, learned patterns).
3. **Cross-doc consistency**: Verify the playbook reflects the current implementation plan (task IDs, dependencies, wave assignments). Check against architecture and standards docs for drift.
4. **Preview changes**: Present a summary table (Action / Section / Detail). If >60% is PRESERVE, note the doc has been significantly customized. Wait for approval.
5. **Execute update**: Restructure to match current layout. Preserve project-specific content. Add missing sections.
6. **Update tracking comment** on line 1. **Post-update summary**: Report sections added, restructured, preserved.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/implementation-playbook.md`
- **Preserve**: Agent-learned patterns, project-specific gotchas, custom quality gate thresholds
- **Related docs**: `docs/implementation-plan.md`, `docs/system-architecture.md`, `docs/tdd-standards.md`, `docs/coding-standards.md`, `docs/git-workflow.md`, `docs/project-structure.md`
- **Special rules**: Never remove agent notes or learned patterns — they capture real implementation experience. If task IDs changed, update references rather than deleting context blocks.

---

## Inputs

Read ALL of these before writing any content:

| Document | What to Extract |
|----------|----------------|
| `docs/implementation-plan.md` | Task graph, dependencies, architecture decisions, component boundaries |
| `docs/system-architecture.md` or equivalent | Component design, data flow, integration points |
| `docs/tdd-standards.md` | Test categories, file locations, mocking strategy, reference patterns |
| `docs/coding-standards.md` | Naming conventions, error handling, patterns |
| `docs/git-workflow.md` | Branching strategy, commit format, PR process, merge approach |
| `docs/project-structure.md` | Directory layout, module organization, high-contention files |
| `docs/tech-stack.md` | Frameworks, libraries, tooling |
| `docs/dev-setup.md` | Key commands, environment setup |
| `tests/acceptance/` | *(if exists)* Test skeleton files agents implement during TDD |
| `docs/story-tests-map.md` | *(if exists)* Story-to-test mapping for tracking implementation progress |
| `tests/evals/` | *(if exists)* Project eval checks to run as quality gates |
| `docs/eval-standards.md` | *(if exists)* What evals check and what they don't |
| `CLAUDE.md` | Workflow conventions, key commands |

Skip any document that does not exist — adapt the playbook to what is available.

---

## Playbook Structure

### 1. Wave-by-Wave Execution Plan

Organize tasks into waves based on the dependency graph from `docs/implementation-plan.md`:

- **Wave 0**: Foundation — infrastructure, project skeleton, CI pipeline, database setup. No feature code. Everything in this wave must merge before Wave 1 starts.
- **Wave 1-N**: Feature waves — group tasks that can run in parallel (no shared file contention, no dependency conflicts). Each wave lists its tasks and the merge criteria to advance.

For each wave, specify:
- Which tasks are included (by task ID and title)
- Which tasks can run in parallel vs. must be sequential
- What must be merged before this wave starts (dependencies from prior waves)
- Merge criteria to advance to the next wave

### 2. Per-Task Context Blocks

For each task in the implementation plan, generate a context block:

```markdown
### Task T-XXX: <title>

**Read before starting:**
- <doc> <section> (what to look for)
- <source file> (pattern to follow)

**Acceptance criteria:** <from user stories>

**Files to create/modify:** <exact paths from project-structure.md>

**Test requirements:** <category, location, what to mock per tdd-standards.md>

**Gotchas:** <anything non-obvious from the architecture or standards>
```

If a task does not have sufficient specification detail, flag it as needing clarification rather than guessing.

### 3. Shared Conventions

Consolidate the conventions every agent must follow, referencing (not duplicating) the standards docs:

- **Commit format**: Reference `docs/git-workflow.md` with a one-line summary and example
- **Branch naming**: Pattern and example from git workflow
- **Error handling**: Reference `docs/coding-standards.md` with the error response shape
- **Test patterns**: Reference `docs/tdd-standards.md` with the key rules (what to mock, test file location)
- **Import ordering**: Reference coding standards

### 4. Merge Strategy

Define how agents coordinate merges:

- Squash and merge as default (clean main history)
- Rebase on latest main before creating PR
- Never work on the same file simultaneously — file contention requires sequencing
- How to handle merge conflicts (read both sides, merge both changes, re-run tests)

### 5. Quality Gates Per Wave

Define the checks that must pass before a wave is considered complete:

- **Per-task gates**: Tests pass, lint clean, type check passes, build succeeds, manual verification
- **Per-wave gates**: All task PRs merged, no regressions in full test suite, integration points verified between tasks in the wave
- **Final gate**: Full test suite green, all acceptance criteria verified, no open P0 issues

### 6. Inter-Agent Handoff Format

Define the completion record format agents use when finishing a task:

- What was done (implementation approach summary)
- Assumptions made (decisions not in the spec)
- What is left (known limitations, follow-up items)
- What to watch out for (gotchas for downstream tasks)
- Files modified (list for next agent's review)

---

## Process

1. **Read all input documents** listed above — skip any that do not exist
2. **Build the wave plan** from the implementation plan's dependency graph
3. **Use subagents** to generate per-task context blocks in parallel
4. **Use AskUserQuestionTool** for:
   - Any tasks with insufficient specification detail
   - Whether the project needs custom quality gate thresholds beyond defaults
   - Any agent coordination concerns specific to the project
5. **Write `docs/implementation-playbook.md`** following the structure above
6. **Cross-verify**: Every task in `docs/implementation-plan.md` has a context block in the playbook. No task is missing. No phantom task appears in the playbook without a plan entry.
7. **Add tracking comment** on line 1: `<!-- scaffold:implementation-playbook v<ver> <date> -->`

## After This Step

When this step is complete, tell the user:

---
**Pipeline complete.** All documentation is frozen and implementation-ready.

- `docs/onboarding-guide.md` — Start here for project context
- `docs/implementation-playbook.md` — Agent execution reference
- `docs/implementation-plan.md` — Task graph and dependencies

Agents can now begin implementation by following the playbook wave-by-wave. Start with `/scaffold:single-agent-start` or `/scaffold:multi-agent-start` depending on your execution strategy.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
