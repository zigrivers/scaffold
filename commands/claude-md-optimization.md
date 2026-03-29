---
description: "Consolidate and optimize CLAUDE.md for maximum signal density"
long-description: "Removes redundancy from CLAUDE.md, fixes terminology inconsistencies, front-loads critical patterns (TDD, commit format, worktrees), and keeps it under 200 lines so agents actually read and follow it."
---

## Purpose
Review all project documentation and consolidate CLAUDE.md into the definitive,
optimized reference for AI agents. Eliminate redundancy from incremental additions
by multiple setup prompts, fix inconsistencies in terminology and commands, fill
gaps in workflow coverage, and front-load the most critical information for agent
scannability.

## Inputs
- CLAUDE.md (required) — current state with incremental additions
- docs/plan.md (required) — PRD for context
- docs/tech-stack.md (required) — technology choices
- docs/coding-standards.md (required) — code conventions
- docs/tdd-standards.md (required) — testing approach
- docs/git-workflow.md (required) — branching and PR workflow
- docs/project-structure.md (required) — file placement rules
- docs/user-stories.md (optional) — feature context

## Expected Outputs
- CLAUDE.md — restructured and consolidated with Core Principles, Git Workflow,
  Workflow (session start through next task), Parallel Sessions, Quick Reference
  (structure, Key Commands, doc lookup), Rules (git, code, coordination, error
  recovery), Browser/E2E Testing, Self-Improvement, Autonomous Behavior

## Quality Criteria
- (mvp) No duplicated instructions within CLAUDE.md
- (mvp) No verbatim repetition of content from other docs (reference instead)
- (mvp) Consistent terminology throughout (task vs. ticket, etc.)
- (mvp) Key Commands table matches actual Makefile/package.json commands
- (mvp) Critical patterns are prominent (TDD, never push to main, keep working,
  verify before commit, worktrees for parallel). If Beads: every commit needs task ID.
- (deep) CLAUDE.md is <= 200 lines or critical patterns appear in the first 50 lines
- (deep) Workflow scenarios cover error cases (test failures, merge conflicts, CI failures,
  crashed sessions, blocked tasks)
- (mvp) Tracking comment added: <!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->

## Methodology Scaling
- **deep**: Full four-phase analysis (redundancy, consistency, gap, priority audits)
  with detailed changelog. Comprehensive error recovery section. All nine critical
  patterns verified present and prominent.
- **mvp**: Quick pass to remove obvious duplicates and ensure workflow section is
  complete. Fix any command inconsistencies. Skip detailed audit.
- **custom:depth(1-5)**: Depth 1: remove duplicated instructions within CLAUDE.md. Depth 2: dedup plus workflow section completeness check. Depth 3: add terminology consistency pass across all sections. Depth 4: add gap analysis (missing patterns, stale command references). Depth 5: full four-phase audit (redundancy, consistency, gap, priority).

## Mode Detection
Always operates in update mode (CLAUDE.md always exists by this point). Check
for tracking comment `<!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->`
to detect prior optimization. If present, compare current CLAUDE.md against
the prior version date to identify sections added or changed since last
optimization. Preserve manually-added sections (user customizations not from
setup prompts). Only consolidate sections that originated from setup prompts —
do not restructure user-authored content. Do not add new workflow steps or
rules — only consolidate and clarify what already exists.

## Update Mode Specifics
- **Detect prior artifact**: tracking comment in CLAUDE.md with version and date
- **Preserve**: manually-added sections, user-customized rules, project-specific
  command aliases, any content not traceable to a pipeline setup prompt
- **Triggers for update**: new setup prompts completed, coding-standards updated,
  tdd-standards updated, git-workflow updated, terminology inconsistencies
  introduced by incremental additions
- **Conflict resolution**: if a user-customized section conflicts with a setup
  prompt's output, keep the user version and flag the conflict in a comment

---

## Domain Knowledge

### claude-md-patterns

*Patterns for structuring CLAUDE.md files including section organization, rule authoring, pointer patterns, and merge strategies*

# CLAUDE.md Patterns

CLAUDE.md is the primary instruction file for AI coding agents. It is loaded at the start of every session and defines how the agent should behave within a project. A well-structured CLAUDE.md dramatically improves agent adherence; a poorly structured one gets ignored or causes conflicts. This knowledge covers structure, authoring, the pointer pattern, and the merge strategy for multi-step pipeline updates.

## Summary

### Purpose

CLAUDE.md is a project-level instruction file that AI agents (Claude Code, Codex, etc.) read at session start. It answers three questions:
1. **What are the rules?** — Coding conventions, git workflow, testing requirements
2. **How do I do common tasks?** — Key commands, PR workflow, deployment
3. **What should I avoid?** — Anti-patterns, forbidden operations, common pitfalls

### Section Organization

A well-structured CLAUDE.md follows this order, from most-referenced to least:

| Section | Purpose | Example Content |
|---------|---------|-----------------|
| **Core Principles** | 3-5 non-negotiable tenets | TDD, simplicity, no laziness |
| **Project Overview** | What this project is (1-2 sentences) | "Prompt pipeline for scaffolding projects" |
| **Key Commands** | Commands the agent runs constantly | `make check`, `make test`, `npm run dev` |
| **Workflow** | How to do common operations | Branch, commit, PR, merge flow |
| **Structure Quick Reference** | Where files go | Directory table with purpose |
| **Environment** | Dev setup specifics | Build tool, test runner, linter |
| **Rules** | Specific do/don't instructions | "Never push to main directly" |
| **Self-Improvement** | Learning feedback loop | Lessons file, correction capture |
| **Autonomous Behavior** | What the agent should do proactively | Fix bugs on sight, use subagents |
| **Doc Lookup Table** | Where to find detailed docs | Question-to-document mapping |

### Rule Authoring Best Practices

Rules must be specific, actionable, and testable:

**Good rules:**
- "Run `make check` before every commit"
- "Never push directly to main — always use branch + PR"
- "Every commit message starts with `[BD-xxx]` task ID"

**Bad rules:**
- "Write clean code" — what does clean mean?
- "Be careful with git" — what specific actions to take/avoid?
- "Follow best practices" — which ones?

### The Pointer Pattern

Reference external docs instead of duplicating content inline:

```markdown
## Coding Conventions
See `docs/coding-standards.md` for full reference. Key rules in `.claude/rules/code-style.md`.
```

This keeps CLAUDE.md under 200 lines (the empirically-validated adherence threshold) while preserving access to detailed docs. The agent reads referenced docs on demand rather than processing everything at session start.

## Deep Guidance

### Section Organization — Extended

#### Front-Loading Critical Information

Agents skim CLAUDE.md. The first 50 lines get the most attention. Place the most violated rules and most-used commands at the top. Core Principles and Key Commands should appear before any detailed documentation.

#### The 200-Line Threshold

Research and practical experience show that agent adherence drops sharply when CLAUDE.md exceeds ~200 lines. Beyond that length, agents start selectively ignoring instructions — particularly those in the middle or bottom of the file.

Strategies to stay under 200 lines:
- Use the pointer pattern for anything longer than 5 lines
- Move path-scoped conventions to `.claude/rules/` files
- Keep tables compact (no verbose descriptions)
- Eliminate redundancy (same rule stated multiple ways)

#### Section Templates

**Core Principles** — 3-5 tenets, each a single sentence with a bold label:
```markdown
## Core Principles
- **Simplicity First**: Make every change as simple as possible.
- **TDD Always**: Write failing tests first, then make them pass.
- **Prove It Works**: Never mark a task complete without demonstrating correctness.
```

**Key Commands** — Table format, sorted by frequency of use:
```markdown
## Key Commands
| Command | Purpose |
|---------|---------|
| `make check` | Run all quality gates |
| `make test` | Run test suite |
| `make lint` | Run linters |
```

**Doc Lookup Table** — Question-to-document mapping:
```markdown
## When to Consult Other Docs
| Question | Document |
|----------|----------|
| How do I branch and commit? | `docs/git-workflow.md` |
| What are the coding conventions? | `docs/coding-standards.md` |
```

### Rule Authoring — Extended

#### The Testability Criterion

Every rule should be verifiable. If you cannot check whether the rule was followed, the rule is too vague.

| Rule | Testable? | Fix |
|------|-----------|-----|
| "Write good tests" | No | "Every new function has at least one unit test" |
| "Use proper naming" | No | "Use camelCase for variables, PascalCase for types" |
| "Run `make check` before commits" | Yes | — |
| "Never commit `.env` files" | Yes | — |

#### Conflict Resolution

Rules can conflict. When they do, the resolution order is:
1. CLAUDE.md rules override general conventions
2. More specific rules override more general rules
3. Later rules override earlier rules (if truly contradictory)
4. Project-specific rules override ecosystem defaults

Document known conflicts explicitly: "This project uses tabs despite the TypeScript convention of spaces — see `.editorconfig`."

#### Negative Rules vs. Positive Rules

Prefer positive rules ("always do X") over negative rules ("never do Y") when possible. Positive rules tell the agent what to do; negative rules only eliminate one option from an infinite set.

Exception: safety-critical negative rules are valuable. "Never push to main directly" and "Never commit secrets" are clearer as negatives.

### Pointer Pattern — Extended

#### When to Inline vs. Point

| Content Type | Inline in CLAUDE.md | Point to External Doc |
|-------------|--------------------|-----------------------|
| Core principles | Yes | No |
| Key commands table | Yes | No |
| Workflow summary (5-10 lines) | Yes | Detailed version elsewhere |
| Coding conventions (full) | No | `docs/coding-standards.md` |
| Git workflow (full) | No | `docs/git-workflow.md` |
| Project structure (full) | No | `docs/project-structure.md` |
| Design system rules | No | `docs/design-system.md` |

The rule: if the content is referenced multiple times per session, inline a summary. If it is referenced occasionally, point to it.

#### Cross-Reference Format

Use consistent pointer format throughout:
```markdown
See `docs/coding-standards.md` for full reference.
```

Not:
```markdown
Refer to the coding standards document for more details.
```

The first format gives the agent an exact file path to read. The second requires the agent to search for the file.

### Merge Strategy for Multi-Step Pipeline Updates

Seven pipeline steps modify CLAUDE.md during project scaffolding. Each step owns specific sections and must not overwrite sections owned by other steps. This section ownership model prevents destructive overwrites when steps execute sequentially.

#### Section Ownership Map

| Pipeline Step | CLAUDE.md Sections Owned | Operation |
|--------------|-------------------------|-----------|
| **beads** | Core Principles, Task Management (Beads commands), Self-Improvement, Autonomous Behavior | Creates initial skeleton |
| **project-structure** | Project Structure Quick Reference | Adds/updates directory table |
| **dev-env-setup** | Key Commands, Dev Environment | Adds/updates command table and env section |
| **git-workflow** | Committing and Creating PRs, Parallel Sessions (Worktrees) | Adds/updates workflow sections |
| **design-system** | Design System, Browser Testing | Adds/updates design system section |
| **ai-memory-setup** | Pointer restructuring (cross-cutting) | Replaces inline content with pointers to `.claude/rules/` |
| **automated-pr-review** | Code Review workflow | Adds/updates review workflow section |

#### Merge Rules

1. **Additive by default.** Each step adds its sections without modifying sections owned by other steps. If a section does not exist, create it. If it exists and belongs to this step, update it in-place.

2. **Never delete unrecognized sections.** If CLAUDE.md contains sections not in the ownership map (user customizations, project-specific sections), preserve them. Move them to the end if they conflict with the expected layout, but never remove them.

3. **Beads goes first.** The `beads` step creates the initial CLAUDE.md skeleton. All subsequent steps add to this skeleton. If `beads` was skipped (project does not use Beads), subsequent steps must still create their sections — they just skip the Beads-specific content.

4. **ai-memory-setup is cross-cutting.** Unlike other steps that add sections, `ai-memory-setup` restructures existing sections by replacing inline content blocks with pointer references to `.claude/rules/` files. It operates across sections owned by other steps but only changes the representation (inline → pointer), not the substance.

5. **claude-md-optimization consolidates.** The final consolidation step (`claude-md-optimization`) reviews the accumulated CLAUDE.md, removes redundancy introduced by incremental additions, fixes inconsistencies in terminology, and reorders for scannability. It operates on all sections but does not add new workflow steps or rules — only consolidates and clarifies what exists.

6. **Preserve tracking comments.** Steps that add tracking comments (`<!-- scaffold:step-name v1 YYYY-MM-DD -->`) must preserve comments from other steps. These comments enable update detection.

7. **Update mode is the norm.** After initial creation by `beads`, all subsequent steps operate in update mode. They check for existing content, preserve customizations, and update in-place rather than replacing.

#### Conflict Scenarios

**Two steps reference the same command.** Example: `dev-env-setup` adds `make check` to Key Commands and `git-workflow` references `make check` in the PR workflow. Resolution: the Key Commands table (owned by `dev-env-setup`) is the single source of truth for command definitions. Other sections reference commands but do not redefine them.

**ai-memory-setup restructures a section another step just added.** This is expected and by design. The `ai-memory-setup` step runs after environment steps and converts verbose inline blocks to compact pointer references. The referenced docs must exist before the pointer is valid.

**User adds custom sections between pipeline runs.** Subsequent pipeline steps must detect and preserve custom sections. Use the tracking comment (`<!-- scaffold:step-name -->`) to identify pipeline-managed sections vs. user-added sections.

### Update Mode Handling

#### Detecting Existing Content

Every pipeline step that modifies CLAUDE.md implements mode detection:
- If the file does not exist → create mode (write full skeleton)
- If the file exists → update mode (modify owned sections in-place)

Update mode is the common case. After the first `beads` run, every subsequent step encounters an existing CLAUDE.md.

#### Preserving Custom Sections

Users customize CLAUDE.md between pipeline runs. Common customizations:
- Adding project-specific rules
- Adding custom command aliases
- Adding team-specific workflow notes
- Adding integration-specific sections (deployment, monitoring)

Pipeline steps must preserve all content they do not own. The safest pattern is:
1. Read the existing CLAUDE.md
2. Identify sections owned by this step (by heading or tracking comment)
3. Replace only those sections with updated content
4. Leave everything else untouched

#### Additive Updates

When updating a section, prefer additive changes over destructive ones:
- Add new table rows rather than replacing the entire table
- Add new subsections rather than rewriting the section
- Append to lists rather than replacing them
- Only remove content if it is demonstrably wrong or duplicated

### Common Anti-Patterns

**Inline everything.** CLAUDE.md becomes 500+ lines with full coding standards, complete git workflow, entire project structure. Agent adherence drops, load time increases, signal drowns in noise. Fix: use the pointer pattern. Keep CLAUDE.md under 200 lines.

**Stale commands.** Key Commands table references `npm test` but the project switched to `bun test` two months ago. The agent runs the wrong command and wastes a cycle. Fix: keep Key Commands in sync with actual build tool configuration. The `claude-md-optimization` step verifies this.

**Conflicting rules.** CLAUDE.md says "always use conventional commits" in one section and "use `[BD-xxx]` prefix" in another, with no guidance on which takes precedence. Fix: consolidate commit message rules in one place. If both apply, show the combined format: `[BD-42] feat(api): implement endpoint`.

**Redundant instructions.** The same rule appears in Core Principles, Workflow, and Rules sections with slightly different wording. The agent may follow one version and violate another. Fix: state each rule once in its canonical section. Other sections reference it.

**Missing doc lookup.** CLAUDE.md references "the git workflow" but does not specify the file path. The agent searches, guesses, or ignores the reference. Fix: always include exact file paths in references.

**No update mode.** A pipeline step blindly writes a complete CLAUDE.md, overwriting sections added by earlier steps. Fix: every step that modifies CLAUDE.md must read it first, identify its owned sections, and update only those sections.

**Over-specifying autonomous behavior.** CLAUDE.md micro-manages every agent decision: "If you see a typo, fix it. If you see a missing import, add it. If you see..." This wastes lines on things the agent would do anyway. Fix: autonomous behavior should cover non-obvious expectations — "fix bugs on sight," "use subagents for research," "re-plan when stuck." Skip obvious behaviors.

---

## After This Step

Continue with: `/scaffold:workflow-audit`
