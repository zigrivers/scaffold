---
name: ai-memory-setup
description: Configure AI memory and context management with modular rules, optional MCP memory server, lifecycle hooks, and external context integration
phase: "environment"
order: 350
dependencies: [git-workflow]
outputs: [.claude/rules/, docs/ai-memory-setup.md]
reads: [coding-standards, tech-stack]
conditional: null
knowledge-base: [ai-memory-management]
---

## Purpose
Set up a tiered AI memory stack that improves agent effectiveness across sessions.
Tier 1 (modular rules) extracts conventions from existing project docs into
path-scoped `.claude/rules/` files, keeping CLAUDE.md lean. Tier 2 (persistent
memory) configures an MCP memory server and lifecycle hooks for cross-session
decision capture. Tier 3 (external context) adds library documentation servers
to prevent API hallucination. Users choose which tiers to enable.

## Inputs
- docs/coding-standards.md (required) — source for code convention rules
- docs/tech-stack.md (required) — source for technology-specific rules
- docs/git-workflow.md (required) — source for workflow rules
- CLAUDE.md (required) — will be optimized after rules extraction
- package.json or equivalent (optional) — dependency list for Tier 3 assessment

## Expected Outputs
- .claude/rules/ directory with path-scoped rule files extracted from project docs
- docs/ai-memory-setup.md — documentation of configured memory stack
- CLAUDE.md updated with pointer pattern (references rules instead of inline content)
- (Tier 2) .claude/settings.json with MCP memory server and hook configuration
- (Tier 2) docs/decisions/ directory for structured decision logging
- (Tier 3) .claude/settings.json with external context MCP server

## Quality Criteria
- .claude/rules/ files use valid YAML frontmatter with description and globs fields
- Each rule file targets a specific concern (no catch-all files)
- Total rule content stays under 500 lines across all files
- CLAUDE.md references rules via pointer pattern, stays under 200 lines
- Rules accurately reflect the conventions in source documents (no drift)
- (Tier 2) MCP memory server responds to basic queries
- (Tier 2) At least PreCompact hook is configured and functional
- (Tier 3) Library doc server returns results for project dependencies

## Methodology Scaling
- **deep**: All three tiers offered. Tier 1 generates comprehensive rules from
  all project docs. Tier 2 recommends hmem or Claude-Mem for thorough capture.
  Tier 3 configured with appropriate library doc server.
- **mvp**: Tier 1 only (modular rules). Quick extraction of essential conventions
  into 2-3 rule files. Skip Tier 2 and 3. Minimal CLAUDE.md optimization.
- **custom:depth(1-5)**: Depth 1-2: Tier 1 basics (2-3 rule files). Depth 3:
  full Tier 1 + offer Tier 2. Depth 4-5: all tiers with comprehensive setup.

## Mode Detection
Update mode if .claude/rules/ directory exists. In update mode: preserve existing
rule files and their customizations, add missing rules for new conventions,
update rules where source docs have changed. Never delete user-customized rules.
If MCP server already configured, verify and update rather than replace.

## Update Mode Specifics
- **Detect prior artifact**: .claude/rules/ directory exists with rule files
- **Preserve**: existing rule files and their YAML frontmatter, user-customized
  rules, MCP server configurations, hook settings, CLAUDE.md pointer patterns
- **Triggers for update**: source docs changed (coding-standards.md, tech-stack.md,
  git-workflow.md), new conventions added that need rule extraction, new
  dependencies added that need Tier 3 doc servers
- **Conflict resolution**: if a source doc changed a convention, update the
  corresponding rule file but preserve any user-added rules in that file;
  never exceed 500-line total rule budget without consolidating
