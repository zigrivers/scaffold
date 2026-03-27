# AI Agent Ergonomics Audit — Scaffold v2

**Date:** 2026-03-12
**Auditor:** Claude (AI agent system design expert)
**Input:** v2 spec (`docs/superpowers/specs/2026-03-12-scaffold-v2-modular-cross-platform-design.md`), v1 PRD (`docs/prd-v1.md`), scaffold overview, project structure, representative v1 prompts

---

## Dimension 1: Machine-Parseability of State & Config

### Current Design Assessment

The v2 spec defines three state files (`config.yml`, `state.json`, `decisions.json`) with clear schemas and explicit resolution rules for ambiguous states (artifact-exists-but-not-in-completed). The dual completion detection mechanism (artifact-based primary, state-recorded secondary) is a strong design that handles crash recovery gracefully. Enum values (`completed`, `skipped`) are used in the state file.

### Findings

| # | Finding | Severity | Affected Component | Recommendation |
|---|---------|----------|-------------------|----------------|
| 1.1 | `state.json` lacks a schema version field | High | `.scaffold/state.json` | Add `"schema-version": 1` at the top level. Without this, a v2.1 CLI reading a v2.0 state file cannot know whether fields were omitted intentionally or are missing due to an older schema. |
| 1.2 | `state.json` uses `"prompts"` array with just names, losing resolution source | Medium | `.scaffold/state.json` | Change `"prompts"` to include resolution source: `[{"name": "create-prd", "source": "base"}, {"name": "implementation-plan", "source": "override"}]`. An agent resuming mid-pipeline cannot otherwise determine which prompt file to load. |
| 1.3 | No explicit `"status"` enum for individual prompts in state | High | `.scaffold/state.json` | The state file only has `completed` and `skipped` arrays — there's no representation for `in_progress`, `failed`, or `blocked`. An agent must compute status by process of elimination (not in completed, not in skipped → pending). Add a unified `"prompts"` map: `{"create-prd": {"status": "completed", "at": "...", "artifacts": [...]}}`. |
| 1.4 | `completed` array entries lack artifact verification metadata | Medium | `.scaffold/state.json` | Add `"artifacts_verified": true/false` and `"artifacts": ["docs/plan.md"]` to each completed entry. Currently, if the resolution rule (artifact takes precedence) kicks in, the agent must know which artifacts to check — this requires loading the prompt frontmatter to find the `produces` field. |
| 1.5 | `decisions.json` entries lack a decision ID or category | Low | `.scaffold/decisions.json` | Add `"id": "D-001"` and `"category": "tech-choice" | "architecture" | "scope" | "process"`. This allows downstream prompts to query specific decisions without reading every entry. |
| 1.6 | `config.yml` `project` key semantics are underspecified | Medium | `.scaffold/config.yml` | The spec shows `project: { platforms: [web], multi-model-cli: true }` but doesn't define the full list of valid keys, their types, or defaults. Add a JSON Schema file (`.scaffold/config.schema.json`) shipped with the CLI that agents can reference. |
| 1.7 | Ambiguous "mode" field — `config.yml` vs `state.json` | High | Both files | `config.yml` can have `mode: brownfield` and `state.json` has `"mode": "greenfield"`. Two files with the same field name, potentially different values, and no documented precedence rule. Rename the state field to `"init-mode"` or consolidate into one file. |
| 1.8 | No machine-readable summary of "what's next" | Medium | `.scaffold/state.json` | An agent must implement Kahn's algorithm itself to determine the next eligible prompt. Add a `"next_eligible": ["dev-env-setup", "design-system"]` field that the CLI updates on each state write. This trades storage for agent simplicity. |

### Specific Improvements

**Proposed `state.json` v2 schema:**

```json
{
  "schema-version": 1,
  "scaffold-version": "2.0.0",
  "methodology": "classic",
  "init-mode": "greenfield",
  "created": "2026-03-12T10:30:00Z",
  "prompts": {
    "create-prd": {
      "status": "completed",
      "source": "base",
      "at": "2026-03-12T10:35:00Z",
      "produces": ["docs/plan.md"],
      "artifacts_verified": true
    },
    "design-system": {
      "status": "skipped",
      "at": "2026-03-12T11:00:00Z",
      "reason": "No frontend"
    },
    "dev-env-setup": {
      "status": "pending",
      "source": "base"
    }
  },
  "next_eligible": ["dev-env-setup"],
  "extra-prompts": []
}
```

This eliminates:
- Separate `completed`/`skipped` arrays (unified into per-prompt status)
- The need for agents to load frontmatter to find `produces` fields
- The need for agents to recompute dependency resolution to find "what's next"

---

## Dimension 2: Prompt Clarity for Executing Agents

### Current Design Assessment

The v1 prompts are well-structured with clear section hierarchies, explicit "What to Produce" / "What NOT to Do" sections, and consistent "After This Step" navigation. The Mode Detection blocks follow a repeatable pattern across all document-creating prompts. The v2 spec's abstract task verb convention (`{task:create}`) and mixin injection system are sound concepts.

### Findings

| # | Finding | Severity | Affected Component | Recommendation |
|---|---------|----------|-------------------|----------------|
| 2.1 | Mode Detection block is 15+ lines of boilerplate before the actual task instructions | High | All document-creating prompts | An agent loads the full prompt into context. The Mode Detection block consumes ~300-400 tokens per prompt, and its logic is identical across all prompts. Extract it to a shared preamble injected by the build system, or move it to the end. Front-load the "What to Produce" section. |
| 2.2 | "Process" section is at the bottom of prompts, after detailed specifications | Medium | All prompts | The Process section contains critical execution rules (e.g., "create a Beads task first", "use subagents to research in parallel") but appears last. An agent that runs out of context or starts executing before reading the full prompt will miss these. Move Process to immediately after Mode Detection, before detailed section specs. |
| 2.3 | Prompts reference documents by path without quoting which sections matter | High | `implementation-plan.md` and others | The implementation plan prompt says "Read ALL of these before creating any tasks" and lists 9 documents. Loading all 9 documents into context before starting is extremely expensive (~15,000+ tokens). The `reads` frontmatter field should support section targeting: `reads: ["docs/tech-stack.md#quick-reference", "docs/project-structure.md#high-contention-files"]`. |
| 2.4 | Abstract task verbs (`{task:create "Title" priority=N}`) look like executable syntax | Critical | Base prompts | An agent encountering `{task:create "Title" priority=N}` in a resolved prompt (where mixin injection failed or was misconfigured) may attempt to execute it as a shell command, function call, or template expression. Change the marker syntax to something no agent would attempt to execute: `<!-- task:create "Title" priority=N -->` (HTML comment) or use a clearly non-executable prefix like `[PLACEHOLDER: task:create ...]`. |
| 2.5 | No explicit "you are done when" completion criteria in prompts | High | All prompts | Prompts say "After This Step" but don't define a machine-checkable completion test. Add a `## Completion Criteria` section to each prompt: `- [ ] docs/plan.md exists and contains sections: Product Overview, User Personas, ... - [ ] Tracking comment present on line 1`. This also feeds the `produces` field validation. |
| 2.6 | Mixin injection seams may produce incoherent reading flow | Medium | Base prompts + mixins | Consider a base prompt with `<!-- mixin:task-tracking -->` between two paragraphs. If the beads mixin injects 20 lines of `bd` commands with Beads-specific context, the surrounding text may no longer flow. Require each mixin to start with a topic sentence that bridges to the surrounding context, and end with a blank line separator. |
| 2.7 | Decision points lack decision frameworks | Medium | `tech-stack.md`, `coding-standards.md` | When `tech-stack.md` asks the agent to "recommend the best fit," the guiding principles are listed but there's no weighted rubric. Two different agents may make opposite choices. Add a scoring template: "Rate each option 1-5 on: AI familiarity, convention-over-config, dependency surface, type safety, ecosystem maturity. Pick the highest total." |
| 2.8 | "Use AskUserQuestionTool" is Claude Code-specific | High | Multiple prompts | Codex doesn't have `AskUserQuestionTool`. The tool-mapping table in the v2 spec doesn't include this mapping. Either add it to the tool map (`AskUserQuestionTool → "ask the user"`) or use abstract language in prompts: "Ask the user" instead of "Use AskUserQuestionTool." |
| 2.9 | Update Mode Specifics are nearly identical across prompts — ~200 tokens of repetition each | Medium | All document-creating prompts | The 7-step update mode procedure is copy-pasted into every prompt with only the file paths and "Special rules" changing. Extract the shared procedure into a build-time injection and only embed the per-prompt specifics. Saves ~150 tokens x 16 prompts = ~2,400 tokens across a full pipeline load. |

### Specific Improvements

**Front-loaded prompt structure convention:**

```markdown
---
description: "..."
produces: ["docs/plan.md"]
reads: ["docs/tech-stack.md#quick-reference"]
depends-on: [create-prd]
---

## What to Produce
[The deliverable — 2-3 sentences max]

## Completion Criteria
- [ ] `docs/plan.md` exists with sections: ...
- [ ] Tracking comment on line 1
- [ ] No contradictions with docs/tech-stack.md

## Process
[Execution rules — what to do first, how to handle decisions]

## Detailed Specifications
[The full spec — sections, formatting, examples]

## Mode Detection
[At the bottom — only relevant if updating, and the agent already knows
from state.json whether the file exists]
```

**Abstract task verb syntax change:**

Replace `{task:create "Title" priority=N}` with `<!-- scaffold:task-create "Title" priority=N -->`. The `scaffold:` prefix makes it clear this is a scaffold system marker. HTML comments are universally ignored by execution engines.

---

## Dimension 3: Error Messages & Recovery Guidance

### Current Design Assessment

The v2 spec's error handling section covers config validation, manifest validation, mixin validation, and incompatible combination warnings with reasonable specificity. The distinction between errors (blocking) and warnings (advisory) is sound. The artifact-based completion fallback for corrupted state is well-designed.

### Findings

| # | Finding | Severity | Affected Component | Recommendation |
|---|---------|----------|-------------------|----------------|
| 3.1 | No fuzzy-matching or suggestion in validation errors | High | `scaffold build` | The spec says errors include "the specific invalid value and the list of valid options" but doesn't mention edit-distance suggestions. An agent seeing `methodology 'clasic' not found. Valid: classic, classic-lite, ddd` can fix it, but `did you mean 'classic'?` is even better. Implement Levenshtein suggestions for all enum-type fields. |
| 3.2 | Predecessor artifact verification presents interactive choices that agents can't parse | Critical | `scaffold resume` | The spec shows: `[Run tech-stack first / Proceed anyway / Cancel]`. This is a human-oriented interactive prompt. An agent interacting via CLI cannot select options unless the CLI accepts `--auto-resolve=run-dependency` or similar flags. Add `--auto` flag: missing dependencies are automatically run in order. Add `--skip-missing` flag: proceed despite missing artifacts. |
| 3.3 | No structured error output format | High | All CLI commands | The spec describes error messages as prose ("Error: methodology 'clasic' not found"). Agents parse prose unreliably. Add `--format json` flag to all commands. Errors become: `{"error": "invalid_methodology", "field": "methodology", "value": "clasic", "valid": ["classic", "classic-lite"], "suggestion": "classic"}`. |
| 3.4 | Silent bad state: mixin marker left unresolved | Critical | `scaffold build` | If a base prompt contains `<!-- mixin:task-tracking -->` but no `task-tracking` mixin is configured, the spec says "Warn (not error)." This means the resolved prompt contains a raw marker that an executing agent may ignore or misinterpret. Change to error by default, with `--allow-unresolved-markers` flag to suppress. |
| 3.5 | No validation for `extra-prompts` in config | Medium | `scaffold build` | Config can include `extra-prompts: [security-audit]` but validation doesn't verify that `.scaffold/prompts/security-audit.md` exists, has valid frontmatter, or declares valid dependencies. Add file existence + frontmatter validation for all extra-prompts entries. |
| 3.6 | `scaffold resume` doesn't report WHY a prompt is next | Medium | `scaffold resume` | It shows "Next: `dev-env-setup`. Run it now?" but doesn't explain which dependencies are now satisfied. An agent or user resuming after a break needs context: "Next: `dev-env-setup` (dependencies satisfied: `project-structure` completed at 10:42, `coding-standards` completed at 10:38)." |
| 3.7 | No machine-readable exit codes | High | All CLI commands | The spec doesn't define exit codes. Agents depend on exit codes to determine success/failure programmatically. Define: 0=success, 1=validation error, 2=missing dependency, 3=state corruption, 4=user cancellation. |

### Specific Improvements

**Structured CLI output for agents:**

```bash
# Human mode (default)
$ scaffold build
Error: methodology 'clasic' not found.
Did you mean 'classic'? Valid options: classic, classic-lite
Fix: Edit .scaffold/config.yml line 2

# Agent mode
$ scaffold build --format json
{
  "success": false,
  "errors": [{
    "code": "INVALID_METHODOLOGY",
    "field": "methodology",
    "value": "clasic",
    "valid_options": ["classic", "classic-lite"],
    "suggestion": "classic",
    "file": ".scaffold/config.yml",
    "line": 2
  }],
  "exit_code": 1
}
```

**Agent-friendly `scaffold resume`:**

```bash
# Non-interactive mode for agents
$ scaffold resume --auto --format json
{
  "action": "run_prompt",
  "prompt": "dev-env-setup",
  "source": "base",
  "dependencies_satisfied": [
    {"prompt": "project-structure", "completed_at": "2026-03-12T10:42:00Z"}
  ],
  "produces": ["docs/dev-setup.md", "Makefile"],
  "reads": ["docs/project-structure.md"]
}
```

---

## Dimension 4: Context Window Efficiency

### Current Design Assessment

The v2 spec's layered prompt system (base + methodology overrides + mixin injections) is inherently more token-efficient than v1's monolithic `prompts.md` because only resolved prompts are loaded. The `reads` frontmatter field is a good start for declaring input dependencies. The decision log is appropriately compact (1-3 decisions per prompt).

### Findings

| # | Finding | Severity | Affected Component | Recommendation |
|---|---------|----------|-------------------|----------------|
| 4.1 | Mode Detection block is ~300-400 tokens of identical boilerplate per prompt | High | All 16+ document-creating prompts | The 7-step update mode procedure is nearly identical across all prompts. Extract it into a CLI-level behavior: `scaffold resume` checks for existing artifacts and tells the agent whether it's in fresh or update mode. The prompt itself needs only the "Update Mode Specifics" section (~50 tokens). Saves ~250 tokens per prompt, ~4,000 tokens across a full pipeline. |
| 4.2 | Implementation plan prompt loads 9 documents into context (~15,000+ tokens) | Critical | `implementation-plan.md` | The prompt says "Read ALL of these before creating any tasks." Most agents will comply by reading all 9 files. Many of these documents are only needed for specific sections (e.g., `docs/git-workflow.md` is only needed for CI config references). Support section-level `reads`: `reads: ["docs/project-structure.md#high-contention-files", "docs/tdd-standards.md#test-architecture"]`. Implementation: prompt frontmatter specifies heading paths; the CLI extracts only those sections. |
| 4.3 | CLAUDE.md grows unboundedly as prompts add sections | High | CLAUDE.md in target project | Every Phase 2-5 prompt appends sections to CLAUDE.md. After 15+ prompts, CLAUDE.md may exceed 3,000+ tokens. The Phase 6 `claude-md-optimization` prompt consolidates it, but between Phase 2 and Phase 6, agents load a bloated CLAUDE.md into every session. Add a CLAUDE.md size budget (e.g., 2,000 tokens) and a "see docs/X.md for details" convention that keeps CLAUDE.md as a pointer file. |
| 4.4 | Pipeline ordering info duplicated in 4+ locations | Medium | Manifest, state.json, CLAUDE.md, skill file | Pipeline phase ordering appears in the methodology manifest, `state.json`, CLAUDE.md's "Pipeline reference" section, and the `scaffold-pipeline` skill. All are loaded into context at various points. Consolidate: manifest is authoritative, state.json caches the resolved order, CLAUDE.md points to `scaffold status`, skill reads state.json. |
| 4.5 | `decisions.json` loaded into every subsequent prompt's context | Medium | `.scaffold/decisions.json` | The spec says "Read by subsequent prompts for cross-session context continuity." If every prompt reads the full decision log, and 20+ prompts each log 1-3 decisions, that's 60+ decision entries loaded into every prompt. Add a `reads-decisions-from: [tech-stack, coding-standards]` frontmatter field so prompts only load decisions from their relevant predecessors. |
| 4.6 | Prompt frontmatter duplicates manifest dependency info | Low | All prompts + manifest | Both the manifest `dependencies` section and prompt frontmatter `depends-on` field can declare dependencies, and they're merged. This creates two sources of truth. Declare dependencies in exactly one place — the manifest — and remove `depends-on` from prompt frontmatter entirely. The manifest is the pipeline's single source of truth for ordering. |
| 4.7 | "After This Step" sections are hard-coded navigation redundant with state | Low | All prompts | Each prompt ends with "Next: Run /scaffold:X" which is static text. In v2, `scaffold next` computes this dynamically. Remove static navigation from prompts; the CLI provides it post-execution. Saves ~50 tokens per prompt. |

### Specific Improvements

**Section-level `reads` implementation:**

```yaml
---
reads:
  - path: "docs/project-structure.md"
    sections: ["High-Contention Files", "Module Organization Strategy"]
  - path: "docs/tdd-standards.md"
    sections: ["Test Architecture", "Mocking Strategy"]
  - path: "docs/tech-stack.md"
    sections: ["Quick Reference"]
  - path: "CLAUDE.md"
    sections: ["Key Commands"]
---
```

The CLI extracts only the specified sections (by heading match) and presents them as context before the prompt content. Estimated savings for `implementation-plan`: ~10,000 tokens (full docs ~15,000, relevant sections ~5,000).

**CLAUDE.md size budget:**

```markdown
# CLAUDE.md (~2,000 token budget)

## Quick Reference
[Inline: only the most critical rules — commit format, key commands, priority definitions]

## Detailed Standards
- Coding standards: see docs/coding-standards.md
- TDD: see docs/tdd-standards.md
- Git workflow: see docs/git-workflow.md
- Project structure: see docs/project-structure.md
```

Each prompt adds its critical rules inline (budget-managed) and its detailed specifications to the dedicated doc. The `claude-md-optimization` prompt enforces the budget.

---

## Dimension 5: Session Continuity & Crash Recovery

### Current Design Assessment

The v2 spec's crash recovery design is strong: atomic `state.json` writes (write-to-temp-then-rename), artifact-based completion detection as fallback, and `scaffold resume` that reads state to determine next steps. The dual detection mechanism (artifact + state) handles the most common crash scenario (prompt succeeded but state wasn't updated).

### Findings

| # | Finding | Severity | Affected Component | Recommendation |
|---|---------|----------|-------------------|----------------|
| 5.1 | No documented "session bootstrap" file list for new agent sessions | High | `scaffold resume` | When a new agent session starts mid-pipeline, it needs to know which files to read for context. This isn't documented. `scaffold resume` should output a structured context-loading instruction: "Read these files for context: [CLAUDE.md, .scaffold/state.json, .scaffold/decisions.json, docs/tech-stack.md#quick-reference]." |
| 5.2 | Prompts that modify multiple files have no partial-completion detection | High | Multi-file prompts | The `coding-standards` prompt produces `docs/coding-standards.md` AND linter config files. If the agent writes the doc but crashes before creating `.eslintrc`, the prompt is not in `completed` (crash), but its primary artifact exists. `scaffold resume` would see the artifact and mark it complete, missing the config files. Use the full `produces` array, not just the primary artifact, for verification. |
| 5.3 | No "in-progress" marker for crash detection | Medium | `.scaffold/state.json` | There's no way to distinguish "prompt hasn't been started" from "prompt was started but crashed mid-execution." Add an `"in_progress": "create-prd"` field to state.json, set when a prompt begins, cleared when it completes. If present on resume, the CLI knows exactly which prompt crashed. |
| 5.4 | Decision log entries from crashed sessions may be incomplete | Medium | `.scaffold/decisions.json` | If a prompt logs a decision mid-execution and then crashes, the decision is recorded but the prompt isn't completed. Subsequent prompts may read a decision that was made in the context of an incomplete execution. Add a `"prompt_completed": true/false` field to decision entries, or only write decisions after prompt completion. |
| 5.5 | Long prompts (implementation-plan) have no checkpointing | Medium | `implementation-plan.md` | The implementation plan prompt reads 9 docs, creates a plan document, and then creates 20+ Beads tasks with dependencies. If it crashes after creating 15 tasks, the resume must detect which tasks were already created. The v1 prompt already handles this ("run `bd list` first and cross-reference"), but v2 should formalize it: checkpoint after document creation, checkpoint after task batch. |
| 5.6 | `scaffold resume --from X` doesn't preserve decisions from the re-run prompt | Low | `scaffold resume` | When re-running a prompt, its previous decisions in `decisions.json` are not removed or superseded. Add a `"superseded_by": "D-015"` field, or remove decisions from the re-run prompt before re-execution. |

### Specific Improvements

**Session bootstrap protocol (output of `scaffold resume`):**

```
=== Session Context ===
Pipeline: classic (8/18 complete, 2 skipped)
Last completed: project-structure (2026-03-12T10:42:00Z)
Next eligible: dev-env-setup

Load these files for context:
  1. CLAUDE.md (project rules)
  2. .scaffold/decisions.json (prior decisions)
  3. docs/project-structure.md (prerequisite output)

Key decisions from prior sessions:
  - [tech-stack] Chose Vitest over Jest for speed
  - [coding-standards] Using Biome instead of ESLint+Prettier

Ready to run dev-env-setup? [Y/n]
```

**In-progress marker:**

```json
{
  "in_progress": {
    "prompt": "coding-standards",
    "started_at": "2026-03-12T10:55:00Z",
    "partial_artifacts": ["docs/coding-standards.md"]
  }
}
```

---

## Dimension 6: Multi-Agent Coordination

### Current Design Assessment

The v2 spec correctly states that scaffold prompts run sequentially (pipeline setup is not parallel), and parallelism applies to implementation agents, not the scaffold pipeline itself. The v1 infrastructure for parallel implementation (worktrees, BD_ACTOR, task claiming via Beads) is mature. However, the v2 spec introduces new coordination surfaces that weren't present in v1.

### Findings

| # | Finding | Severity | Affected Component | Recommendation |
|---|---------|----------|-------------------|----------------|
| 6.1 | `state.json` is not safe for concurrent writes | High | `.scaffold/state.json` | While scaffold prompts run sequentially, the spec says state.json is committed to git and shared across machines. If two team members run different prompts on different machines and both push, state.json will have merge conflicts. Make state.json a CRDT-friendly format: use a map keyed by prompt name (as proposed in 1.3) instead of arrays. Map merges are straightforward in git. |
| 6.2 | `decisions.json` append-only format conflicts on concurrent writes | Medium | `.scaffold/decisions.json` | Append-only JSON arrays are the worst format for concurrent git merges — every append modifies the last line (closing bracket). Switch to JSONL (one JSON object per line) for merge-friendly appends. |
| 6.3 | Implementation agents may modify scaffold artifacts | Medium | CLAUDE.md, docs/*.md | An implementation agent working on a task might update CLAUDE.md (e.g., adding a Key Commands entry) while a scaffold prompt is also modifying it. The spec doesn't define ownership boundaries between scaffold pipeline and implementation work. Add a `<!-- scaffold:managed -->` marker to sections that scaffold owns, and instruct implementation agents to only modify unmarked sections. |
| 6.4 | BD_ACTOR integration with v2 state system is undefined | Medium | State tracking | v1 uses `BD_ACTOR` for Beads task attribution, but v2's `state.json` doesn't record which agent/actor completed each prompt. If two team members run prompts concurrently, the state file doesn't attribute completions. Add `"completed_by": "agent-1"` or `"completed_by": "ken"` to completion entries. |
| 6.5 | No locking mechanism for scaffold pipeline execution | Medium | `scaffold resume` | Two team members could simultaneously run `scaffold resume`, both get "next: dev-env-setup," and both execute it. The results would conflict. Add a lightweight advisory lock: `scaffold resume` writes `.scaffold/lock.json` with `{"holder": "ken", "prompt": "dev-env-setup", "started": "..."}`. Check on entry, warn on conflict. |
| 6.6 | Pipeline prompts that produce shared artifacts need merge awareness | Low | `coding-standards.md`, CLAUDE.md | If Agent A completes `coding-standards` and Agent B completes `tdd` (which can run in parallel per the dependency graph), both may update CLAUDE.md. The dependency graph should enforce serialization for prompts that modify the same file, or the prompts should be designed to write to disjoint sections. |

### Specific Improvements

**JSONL format for `decisions.json`:**

```
{"id":"D-001","prompt":"tech-stack","decision":"Chose Vitest over Jest for speed","at":"2026-03-12T10:40:00Z","actor":"ken"}
{"id":"D-002","prompt":"coding-standards","decision":"Using Biome instead of ESLint+Prettier","at":"2026-03-12T10:55:00Z","actor":"ken"}
```

Benefits: git merges are trivial (append-only lines), no closing bracket conflicts, `grep` and `jq -s` work naturally.

**Advisory lock protocol:**

```json
// .scaffold/lock.json (gitignored — local only)
{
  "holder": "ken-macbook",
  "prompt": "dev-env-setup",
  "started": "2026-03-12T11:00:00Z",
  "pid": 12345
}
```

`scaffold resume` checks for lock on entry. If lock exists and process is still running: "Pipeline is currently being used by ken-macbook (running dev-env-setup). Wait or use --force to override." If process is dead: clear lock automatically.

---

## Dimension 7: Cross-Platform Agent Behavioral Differences

### Current Design Assessment

The v2 spec's adapter architecture is well-conceived — the Claude Code adapter, Codex adapter, and universal adapter produce platform-appropriate outputs from the same resolved prompt set. The tool-mapping table is a reasonable approach for translating tool references. The universal adapter as an escape hatch is a strong design decision.

### Findings

| # | Finding | Severity | Affected Component | Recommendation |
|---|---------|----------|-------------------|----------------|
| 7.1 | `AskUserQuestionTool` has no Codex mapping | Critical | Tool mapping, all interactive prompts | 12+ prompts reference `AskUserQuestionTool` for interactive decisions. The tool-mapping table in the spec doesn't include this tool. Codex operates differently — it may not support mid-execution user interaction. Add mapping: `AskUserQuestionTool → "present options to the user and ask them to choose"`. Also add a `<!-- mixin:interaction-style -->` axis: Claude Code gets tool-based interaction, Codex gets batch-style "make your best judgment or document the decision for user review." |
| 7.2 | Subagent usage assumes Claude Code's Agent tool | High | `implementation-plan.md`, `tech-stack.md`, others | Multiple prompts say "Use subagents to research in parallel." Codex may not have an equivalent subagent concept. Add to tool map: `Agent → "perform the research inline"`. Or better: abstract to "research the following topics (in parallel if possible)." |
| 7.3 | Prompts assume conversational context persistence | Medium | All multi-phase prompts | Claude Code prompts like `create-prd` have multi-phase workflows (Discovery → Planning → Documentation) that assume the agent remembers Phase 1 results when executing Phase 3. Codex may process the prompt as a single batch instruction without conversational memory. Add explicit "carry forward" instructions: "Using the decisions from Phase 1 (documented above), now create..." |
| 7.4 | MCP tool references are Claude Code-only | Medium | `add-e2e-testing.md`, `claude-code-permissions.md` | Prompts reference MCP (Model Context Protocol) tools and Playwright MCP configuration. Codex has no MCP concept. The adapter should either strip MCP sections for Codex or replace them with equivalent Codex-native instructions. |
| 7.5 | Codex adapter's AGENTS.md integration is underspecified | High | Codex adapter | The spec says the Codex adapter "Generates/updates `AGENTS.md` with prompt content and phase ordering" but doesn't specify the AGENTS.md format, section structure, or how prompt content is embedded. Without this, the adapter implementation will be ad-hoc. Define the AGENTS.md schema: one section per prompt, with heading format, content truncation rules, and cross-reference format. |
| 7.6 | Tool-mapping is string replacement — fragile for natural language | Medium | Codex adapter | The spec says "Mapping is applied as string replacement." If a prompt says "Use the Read tool to examine the configuration file," string replacement produces "Use the read the file to examine the configuration file." The mapping should be context-aware: replace "the Read tool" → "file reading", not just "Read" → "read the file." Use whole-phrase patterns, not single-word replacements. |
| 7.7 | No platform capability detection in prompts | Medium | Optional prompts | Some prompts require capabilities that vary by platform (e.g., MCP tools, filesystem write access, user interaction). Prompts should declare required capabilities in frontmatter: `requires-capabilities: [user-interaction, filesystem-write, subagent]`. The adapter can warn or adapt when a capability isn't available. |

### Specific Improvements

**Interaction style mixin:**

```markdown
<!-- mixins/interaction-style/claude-code.md -->
Use AskUserQuestionTool to present the following options to the user.
Wait for their response before proceeding.

<!-- mixins/interaction-style/codex.md -->
Make your best judgment based on the project context and PRD requirements.
Document each decision in .scaffold/decisions.json with your rationale.
If a decision is high-stakes (database choice, authentication approach),
add a "NEEDS_USER_REVIEW" tag so the user can verify after execution.

<!-- mixins/interaction-style/universal.md -->
Present the options below. Ask the user to choose before proceeding.
If running in an automated context, choose the option marked (recommended)
and document the decision.
```

**Whole-phrase tool mapping:**

```yaml
# adapters/codex/tool-map.yml — use phrase-level patterns
patterns:
  - match: "Use AskUserQuestionTool to"
    replace: "Present to the user and"
  - match: "use the Read tool"
    replace: "read"
  - match: "Use the Edit tool"
    replace: "Edit"
  - match: "use subagents to"
    replace: "research the following topics (sequentially if needed) to"
  - match: "spawn a review subagent"
    replace: "perform a review"
```

---

## Dimension 8: Artifact Schema Stability for Downstream Agents

### Current Design Assessment

The v1 prompts define detailed section structures for each artifact (e.g., `docs/tech-stack.md` must have Architecture Overview, Backend, Database, Frontend, Infrastructure & DevOps, Developer Tooling, Third-Party Services). The Mode Detection + tracking comment system preserves structure across updates. The "Quick Reference" convention in tech-stack.md is an excellent example of an agent-queryable section.

### Findings

| # | Finding | Severity | Affected Component | Recommendation |
|---|---------|----------|-------------------|----------------|
| 8.1 | No formal artifact schemas — only prose section lists | High | All document-creating prompts | Prompts describe required sections in prose ("include a Quick Reference section") but don't enforce heading names, levels, or ordering. Two runs of the same prompt may produce `## Quick Reference` and `## Quick-Reference` or `### Quick Reference`. Define exact heading strings in frontmatter: `schema: { sections: ["## Architecture Overview", "## Backend", ...] }`. |
| 8.2 | Feature IDs in PRD have no enforced format | Medium | `docs/plan.md` | The PRD prompt says features should be "grouped by area" with IDs, but doesn't specify the ID format (FR-01? F-1? Feature-001?). The user-stories prompt references "every PRD feature" — it needs to find them reliably. Define: `FR-NNN` format, one per `###` heading within the Feature Requirements section. |
| 8.3 | User story ID format is specified but not machine-extractable | Medium | `docs/user-stories.md` | The prompt specifies `US-xxx` IDs, but they're embedded in prose sections, not in a parseable index. An implementation agent scanning for "which story does this acceptance criterion belong to?" must parse the full document. Add a summary table at the top: `| US-001 | Login | Must-have | Epic: Auth |`. |
| 8.4 | `docs/implementation-plan.md` structure varies by methodology | High | Methodology overrides | The classic methodology overrides `implementation-plan.md` entirely. If a downstream agent expects `## Architecture Overview` in the implementation plan, a different methodology's override might use `## Technical Architecture` or omit it. Define a minimum schema that all methodology overrides must include: `## Architecture Overview`, `## References`, `## Task Summary`. |
| 8.5 | CLAUDE.md section structure drifts across prompts | Medium | CLAUDE.md in target project | Each prompt adds its own sections to CLAUDE.md with ad-hoc heading names. After 15+ prompts, CLAUDE.md has accumulated sections that may conflict or overlap. The `claude-md-optimization` prompt fixes this, but between prompts 3-17, CLAUDE.md is unstable. Define the CLAUDE.md template with reserved section headings up front (in the Beads setup prompt). Later prompts fill in their sections rather than appending new ones. |
| 8.6 | Tracking comments are not validated | Low | All artifacts with `<!-- scaffold:X -->` | Tracking comments (`<!-- scaffold:prd v1 2026-03-12 -->`) enable Mode Detection, but there's no validation that the version and date are well-formed. A malformed tracking comment silently falls into "legacy/manual" mode. Add a regex check during Mode Detection: `<!-- scaffold:<id> v\d+ \d{4}-\d{2}-\d{2} -->`. |
| 8.7 | Mixin content may change artifact structure unpredictably | Medium | Base prompts + mixins | If a base prompt produces an artifact with a stable section structure, but a mixin injects content that adds sub-sections or changes heading levels, downstream agents can't predict the final structure. Require mixins to inject only within existing sections (no new `##` headings). Mixins add content, not structure. |
| 8.8 | No artifact versioning beyond tracking comments | Low | All artifacts | The tracking comment has a version number (`v1`, `v2`) but no semantic meaning — it's just incremented on update. Downstream agents can't know "this tech-stack.md was produced by scaffold v2.0 using the classic methodology with strict TDD." Add methodology and mixin context to the tracking comment: `<!-- scaffold:tech-stack v1 2026-03-12 classic/strict-tdd/beads -->`. |

### Specific Improvements

**Artifact schema definition (in prompt frontmatter):**

```yaml
---
produces: ["docs/tech-stack.md"]
artifact-schema:
  required-sections:
    - "## Architecture Overview"
    - "## Backend"
    - "## Database"
    - "## Frontend"
    - "## Infrastructure & DevOps"
    - "## Developer Tooling"
    - "## Third-Party Services"
    - "## Quick Reference"
  id-format: null  # No IDs in this artifact
---
```

```yaml
---
produces: ["docs/user-stories.md"]
artifact-schema:
  required-sections:
    - "## Best Practices Summary"
    - "## User Personas"
    - "## Story Index"
  id-format: "US-\\d{3}"
  index-table: true  # Requires summary table at top
---
```

`scaffold validate` checks produced artifacts against their schemas. Implementation agents can read the schema from the prompt frontmatter to know exactly how to parse the artifact.

**CLAUDE.md reserved structure (created by Beads setup, filled by later prompts):**

```markdown
# CLAUDE.md

## Core Principles
<!-- Filled by: beads-setup -->

## Task Management
<!-- Filled by: beads-setup -->

## Key Commands
<!-- Filled by: dev-env-setup -->

## Project Structure Quick Reference
<!-- Filled by: project-structure -->

## Coding Standards Summary
<!-- Filled by: coding-standards — brief, see docs/coding-standards.md for full -->

## Git Workflow
<!-- Filled by: git-workflow — brief, see docs/git-workflow.md for full -->

## Testing
<!-- Filled by: tdd — brief, see docs/tdd-standards.md for full -->

## Self-Improvement
<!-- Filled by: beads-setup -->
```

Later prompts fill their reserved sections rather than appending new ones. Prevents drift and keeps CLAUDE.md predictable.

---

## Cross-Cutting Recommendations

### CCR-1: Unified structured CLI output mode

**Pattern across:** Dimensions 1, 3, 5, 6

Every CLI command should support `--format json` for machine consumption. This single change addresses: state file parseability (agents read JSON output instead of parsing prose), error recovery (structured errors with codes and suggestions), session bootstrap (JSON context-loading instructions), and multi-agent coordination (structured lock and status information). Define a common output envelope:

```json
{
  "success": true|false,
  "command": "resume",
  "data": { ... },
  "errors": [ ... ],
  "warnings": [ ... ],
  "exit_code": 0
}
```

### CCR-2: Extract common prompt boilerplate into build-time injection

**Pattern across:** Dimensions 2, 4

Mode Detection (~300 tokens), Update Mode Specifics (~100 tokens), and "After This Step" (~50 tokens) are repeated across 16+ prompts with minimal variation. Total: ~7,200 tokens of boilerplate across the full prompt set. Extract these into build-time injections:
- Mode Detection becomes a CLI behavior (the CLI tells the agent which mode to use)
- "After This Step" is replaced by `scaffold next` output
- Only per-prompt Update Mode Specifics remain in the prompt

### CCR-3: Declare all schemas formally

**Pattern across:** Dimensions 1, 8

Every data structure that agents read (config.yml, state.json, decisions.json, artifact sections, prompt frontmatter) should have a formal schema — either JSON Schema for data files or documented heading conventions for markdown. Ship schemas as part of the npm package. `scaffold validate` checks everything against schemas. This enables agents to self-verify their own outputs.

### CCR-4: Abstract all platform-specific tool references

**Pattern across:** Dimensions 2, 7

Replace every direct tool reference (`AskUserQuestionTool`, `Read tool`, `subagents`) in base prompts with abstract language or mixin-injected content. The interaction style should be an explicit mixin axis (not just tool-name string replacement), because the behavioral differences between platforms go beyond naming — they affect workflow structure (conversational vs. batch, interactive vs. autonomous).

### CCR-5: Design all file formats for git merge safety

**Pattern across:** Dimensions 5, 6

Every file that multiple agents or team members may write concurrently must be designed for merge-friendly git operations:
- `state.json`: map-based (not array-based) for conflict-free per-key merges
- `decisions.json`: JSONL format (one line per entry, append-only)
- CLAUDE.md: reserved sections with markers, each owned by one prompt
- Lock files: gitignored, local-only advisory locks

---

## Agent-Friendliness Scorecard

| Dimension | Score (1-5) | Key Gap |
|-----------|-------------|---------|
| Machine-Parseability | 3 | No schema version in state; status must be computed by elimination; ambiguous `mode` field |
| Prompt Clarity | 3 | Abstract task verbs look executable; no completion criteria; boilerplate before instructions |
| Error Messages & Recovery | 2 | Interactive prompts unparseable by agents; no structured output; no exit codes |
| Context Window Efficiency | 2 | Mode Detection boilerplate; implementation plan loads 9 full docs; CLAUDE.md unbounded growth |
| Session Continuity | 3 | Good crash recovery via dual detection; lacks in-progress markers and session bootstrap docs |
| Multi-Agent Coordination | 2 | Array-based state conflicts on git merge; no locking; no actor attribution |
| Cross-Platform Behavior | 2 | AskUserQuestionTool unmapped; subagents unmapped; string-level tool mapping is fragile |
| Artifact Schema Stability | 3 | Good section conventions but not enforced; no formal schemas; mixin injection can alter structure |

**Overall: 2.5/5** — Strong conceptual architecture with significant gaps in machine-level ergonomics.

---

## Priority Actions

### 1. Add `--format json` and `--auto` flags to all CLI commands
**Impact:** Unblocks agent-driven pipeline execution entirely
**Files:** `lib/cli.js` (new), all CLI command handlers
**Addresses:** Dimensions 3, 1, 5, 6

Without structured output and non-interactive modes, AI agents cannot reliably drive the scaffold CLI. This is the single highest-impact change — every other improvement is less valuable if agents can't parse CLI output or get stuck on interactive prompts.

### 2. Redesign `state.json` as a prompt-keyed map with computed `next_eligible`
**Impact:** Eliminates agent-side dependency resolution; enables merge-safe concurrent use
**Files:** `.scaffold/state.json` schema, `lib/state.js` (new)
**Addresses:** Dimensions 1, 5, 6

The current array-based schema requires agents to implement Kahn's algorithm to determine next steps and produces git merge conflicts when shared. A map-based schema with pre-computed `next_eligible` makes state self-describing and merge-friendly.

### 3. Extract Mode Detection into CLI behavior; front-load "What to Produce" in prompts
**Impact:** Saves ~4,000 tokens across full pipeline; makes prompts agent-scannable
**Files:** All 16+ document-creating prompts in `base/`, CLI resume handler
**Addresses:** Dimensions 2, 4

Mode Detection is identical across prompts and should be a CLI responsibility. Prompts should lead with their deliverable and completion criteria, not with conditional branching logic the agent must parse.

### 4. Add interaction-style mixin axis for cross-platform user interaction
**Impact:** Unblocks Codex platform support for all interactive prompts
**Files:** `mixins/interaction-style/claude-code.md`, `codex.md`, `universal.md`; all prompts referencing `AskUserQuestionTool`
**Addresses:** Dimension 7

12+ prompts reference `AskUserQuestionTool` which has no Codex equivalent. Without this mixin axis, the entire prompt set is Claude Code-only regardless of the adapter layer.

### 5. Define artifact schemas in prompt frontmatter and validate with `scaffold validate`
**Impact:** Makes downstream artifact consumption reliable and predictable
**Files:** All prompt frontmatter, `lib/validate.js` (new), `scaffold validate` command
**Addresses:** Dimension 8

Without enforced schemas, implementation agents cannot reliably parse scaffold artifacts. The gap between "the prompt says to produce these sections" and "the artifact actually has these sections with these exact headings" causes agent failures when parsing predecessor documents.
