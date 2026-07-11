---
name: claude-md-patterns
description: >-
  Patterns for structuring CLAUDE.md files including section organization, rule authoring, pointer patterns, and merge
  strategies
topics:
  - claude-md
  - ai-configuration
  - rule-files
  - memory-management
  - project-setup
volatility: fast-moving
last-reviewed: 2026-07-11
version-pin: null
sources:
  - url: https://docs.anthropic.com/en/docs/claude-code/memory
    anchor: '#claude-md-files'
    hash: sha256:b6d5f2ae444b33ae686abf63de54471dfad7ff6d1bd57a9c5a6d69cb1096fae0
    retrieved: 2026-06-07
  - url: https://docs.anthropic.com/en/docs/claude-code/settings
    anchor: '#configuration-precedence'
    hash: sha256:664220cfa75c2236b9fc6f2ae7a278019eda3807858463121641a8d470f6e0b7
    retrieved: 2026-06-07
---

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
- "Every commit message starts with `[bd-<id>]` task ID"

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

### The AGENTS.md Operations-Core Split

Once a project accumulates git-workflow, Beads, and PR-review setup content,
CLAUDE.md's Committing/PR Workflow, Task Closure, Parallel Sessions,
Worktree Awareness, and Code Review sections start competing with Core
Principles and Key Commands for the scarce first-50-lines budget. The
consolidation pattern splits them out: AGENTS.md becomes the single binding
source for the **operations core** — a section titled exactly
`## Operations core (binding for every agent)` containing, in order, the
ship-loop summary (an 8-step condensation of the project's task-working
skill, ending in a batch report), the standing authorization ("Run this
whole loop without asking permission; do not end your turn after opening a
draft PR," with the one named exception being a verified, still-reproducing
P0 or a blocker you can name), the parallel-safety hard rules (primary
checkout shared/read-only, one agent per module/migration-sequence/shared
surface, one open PR per agent, staging-up from worktrees only), the Beads
rules (start from the ready queue, defer = bead immediately, never bootstrap
on a populated DB), an optional Project invariants subsection (only when the
project's PRD or tech-stack doc declares a cross-cutting invariant — omitted
entirely otherwise), and `/work-beads` routing. CLAUDE.md is left with Core
Principles, navigation, Key Commands, and an error-recovery table, plus a
one-line pointer: "The binding operations core lives in AGENTS.md and
applies to Claude Code sessions too." Every other harness file already
present in the project root (GEMINI.md, etc.) collapses to a two-line
pointer at AGENTS.md — ops-core content is never duplicated into a third
file. This split is a *relocation*, not new rules: it moves content that
already existed somewhere in the project's docs, and it never rewrites
inside a `bd setup claude`/`bd setup codex` marker block
(`<!-- BEGIN BEADS INTEGRATION ... -->` … `<!-- END BEADS INTEGRATION -->`),
which stays owned by Beads' own setup recipe.

### Agent-Safe / Ask-First Command Marking

Every row in the Key Commands table carries a third column, the Marker,
valued `Agent-safe` or `Ask-first` — not free text. **Agent-safe** covers
anything that runs unattended with no destructive effect: dev server, test,
lint --check, install, doctor/diagnostic commands, snapshot/export commands.
**Ask-first** covers formatting sweeps that rewrite files in place, database
resets, or any other destructive command — an agent running the standing
autonomous loop must still confirm with the user before running one of
these, even though it otherwise has standing authorization to act without
asking. A marker can carry a qualifier beyond the two-value taxonomy (e.g.
`Agent-safe (worktree-only)` for a command that's only safe from inside a
worktree, never the primary checkout) — preserve the qualifier as a
parenthetical; it's a safety caveat, not decoration, and dropping it during
a later consolidation pass silently widens what the agent believes it may
run unattended.

### The Error-Recovery Table

The consolidation pass replaces CLAUDE.md's scattered "what do I do when X
breaks" advice with one table, seven required rows: test failure, Docker
contention, pre-commit failure, merge conflict, crashed mid-task, detached
primary, and review-channel auth failure. Each row names the exact
first-command(s) to run and the follow-up decision, cross-referenced to a
detailed doc rather than restated in full — e.g. "Detached primary" points
at `make doctor` first, `make doctor-fix` second, with "ambiguous cases need
a human decision" as the caveat, rather than re-explaining the
primary-checkout invariant inline. The table's job is triage speed: an agent
that hits a failure should find the row, run the first command, and know the
decision branch without re-reading the full git-workflow or
Beads-workflow doc.

### Common Anti-Patterns

**Inline everything.** CLAUDE.md becomes 500+ lines with full coding standards, complete git workflow, entire project structure. Agent adherence drops, load time increases, signal drowns in noise. Fix: use the pointer pattern. Keep CLAUDE.md under 200 lines.

**Stale commands.** Key Commands table references `npm test` but the project switched to `bun test` two months ago. The agent runs the wrong command and wastes a cycle. Fix: keep Key Commands in sync with actual build tool configuration. The `claude-md-optimization` step verifies this.

**Conflicting rules.** CLAUDE.md says "always use conventional commits" in one section and "use `[bd-<id>]` prefix" in another, with no guidance on which takes precedence. Fix: consolidate commit message rules in one place. If both apply, show the combined format: `[bd-a3f8] feat(api): implement endpoint`.

**Redundant instructions.** The same rule appears in Core Principles, Workflow, and Rules sections with slightly different wording. The agent may follow one version and violate another. Fix: state each rule once in its canonical section. Other sections reference it.

**Missing doc lookup.** CLAUDE.md references "the git workflow" but does not specify the file path. The agent searches, guesses, or ignores the reference. Fix: always include exact file paths in references.

**No update mode.** A pipeline step blindly writes a complete CLAUDE.md, overwriting sections added by earlier steps. Fix: every step that modifies CLAUDE.md must read it first, identify its owned sections, and update only those sections.

**Over-specifying autonomous behavior.** CLAUDE.md micro-manages every agent decision: "If you see a typo, fix it. If you see a missing import, add it. If you see..." This wastes lines on things the agent would do anyway. Fix: autonomous behavior should cover non-obvious expectations — "fix bugs on sight," "use subagents for research," "re-plan when stuck." Skip obvious behaviors.
