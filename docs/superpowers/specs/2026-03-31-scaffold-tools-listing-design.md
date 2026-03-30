# Design: Scaffold Tools Listing

**Date:** 2026-03-31
**Status:** Approved

## Problem

When a user asks "what scaffold tools are available?", the scaffold-runner skill routes to `scaffold list --tools` — but the CLI does not support that flag. The user gets an error. Additionally, even if the flag worked, a static list in the skill would drift over time, causing tools to go missing (as confirmed in production use).

## Goal

Users can ask "what tools are available?" and get a complete, accurate, grouped listing of all scaffold tools — both build phase steps and utility tools — with enough context to know when to use each one.

## Approach: CLI-first + skill with enriched presentation

The CLI owns completeness (reads both source directories from the filesystem). The skill owns presentation quality (adds "when to use" context and renders a two-section grouped display).

## Design

### 1. CLI: `scaffold list --section tools`

**File:** `src/cli/commands/list.ts`

Add `tools` to the `--section` enum choices: `['methodologies', 'platforms', 'tools']`.

When `--section tools` is requested, the handler scans two directories:

| Source | What it contains |
|--------|-----------------|
| `pipeline/build/` | All `.md` files with `stateless: true` — the 6 build phase steps |
| `tools/` | All `.md` files with `category: tool` — the 9 utility tools |

For each file, parse the YAML frontmatter to extract:
- `name` — tool identifier (used in `scaffold run <name>`)
- `description` — one-line summary
- `argument-hint` — optional; shown in verbose mode only

**Default output (compact table):**
```
Build Tools:
  single-agent-start       Start the autonomous TDD implementation loop
  single-agent-resume      Resume single-agent work after a break
  multi-agent-start        Start multi-agent execution in a worktree
  multi-agent-resume       Resume multi-agent work after a break
  quick-task               Focused bug fix, refactor, or small improvement
  new-enhancement          Add a new feature to an existing project

Utility Tools:
  version-bump             Bump version and update changelog without releasing
  release                  Create a versioned release with changelog and GitHub release
  version                  Show the current scaffold version
  update                   Check for and display scaffold CLI updates
  dashboard                Open pipeline dashboard in browser
  prompt-pipeline          Print the full pipeline reference table
  review-pr                Run all 3 code review channels on a PR
  post-implementation-review  Full 3-channel codebase review after agent completes tasks
  session-analyzer         Analyze Claude Code session logs for patterns and insights
```

**Verbose output** (`--verbose`): adds an `Arguments` column showing `argument-hint` values where present.

**JSON output** (`--format json`):
```json
{
  "tools": {
    "build": [
      { "name": "single-agent-start", "description": "...", "argumentHint": null },
      ...
    ],
    "utility": [
      { "name": "version-bump", "description": "...", "argumentHint": "<major|minor|patch or --dry-run>" },
      ...
    ]
  }
}
```

**Fallback for out-of-project use:** Use `getPackageMethodologyDir` to find the scaffold package root, then resolve `pipeline/build/` and `tools/` relative to that root (sibling directories to `methodologies/`). Tool listing works anywhere, not just inside scaffold projects.

### 2. Skill: scaffold-runner enriched presentation

**File:** `skills/scaffold-runner/SKILL.md`

#### 2a. Fix navigation table

Change the existing row:

| Before | After |
|--------|-------|
| `"What tools are available?"` → `scaffold list --tools` | `"What tools are available?"` → `scaffold list --section tools --format json` |

#### 2b. Add Tool Listing behavior block

When the "What tools are available?" trigger fires:

1. Call `scaffold list --section tools --format json`
2. Render the JSON as two grouped sections:

**Build Phase (Phase 15)**
> These are stateless pipeline steps — they appear in `scaffold next` once Phase 14 is complete and can be run repeatedly.

Table: Command | When to Use

**Utility Tools**
> These are orthogonal to the pipeline — usable at any time, not tied to pipeline state.

Table: Command | When to Use

3. The "When to Use" column is enriched by the skill with usage guidance (not from CLI output). The CLI provides name/description/argument-hint; the skill adds the actionable "when" context from its own static knowledge.

4. If a tool exists in CLI output but has no "when to use" entry in the skill, it still appears in the listing using the CLI's `description` field. Graceful degradation, not a failure.

#### 2c. Verbose mode

When the user asks for more detail ("show me the tools with arguments", "what arguments does X take"):
- Call `scaffold list --section tools --verbose --format json`
- Add an Arguments column to the table using `argumentHint` values

### 3. Completeness guarantee

Tools are discovered by filesystem scan, not a hardcoded list. Adding a new file to `tools/` or `pipeline/build/` automatically appears in `scaffold list --section tools` — no skill or CLI changes needed. The skill never maintains a tool registry; it only holds "when to use" context, which is stable prose that doesn't cause completeness bugs.

## Out of Scope

- No new `scaffold tools` subcommand — `--section tools` fits the existing `--section` pattern cleanly
- No changes to how tools are executed — this is listing only
- No changes to `scaffold next` or `scaffold status` — tools are stateless and don't belong there

## Files Changed

| File | Change |
|------|--------|
| `src/cli/commands/list.ts` | Add `tools` section: scan both dirs, parse frontmatter, render grouped output |
| `src/cli/commands/list.test.ts` | Tests for tools section: compact, verbose, JSON, empty dirs, out-of-project |
| `skills/scaffold-runner/SKILL.md` | Fix nav table entry, add Tool Listing behavior block |
