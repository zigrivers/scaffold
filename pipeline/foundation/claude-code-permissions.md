---
name: claude-code-permissions
description: Configure Claude Code permissions for autonomous agent execution
phase: "foundation"
order: 42
dependencies: [tech-stack]
outputs: [.claude/settings.json]
conditional: null
knowledge-base: []
---

## Purpose
Configure Claude Code's two-layer permission system so agents can work
autonomously without approval prompts for safe operations while blocking
destructive commands. Project-level settings define deny rules (checked into git);
user-level settings define broad allow rules (personal, shared across projects).

## Inputs
- docs/tech-stack.md (required) — stack-specific tools needing permissions
- CLAUDE.md (required) — current project configuration
- ~/.claude/settings.json (optional) — existing user-level permissions to merge with

## Expected Outputs
- .claude/settings.json — project-level deny rules for destructive operations
  (rm -rf, sudo, git push --force, git push to main, git reset --hard, bd edit)
- ~/.claude/settings.json — user-level allow rules with bare Bash entry, Read,
  Write, Edit, Glob, Grep, WebFetch, WebSearch, and MCP server entries

## Quality Criteria
- Project-level settings contain deny-only rules (no allow rules at project level)
- User-level settings contain bare `Bash` entry for compound command support
- User-level settings include MCP server entries for installed plugins
- Stack-specific destructive operations added to project-level deny list
- Tier 1 verification passes (compound commands with &&, ||, pipes, redirects, $())
- Tier 2 verification passes (standard workflow commands run without prompting)
- MCP tools run without prompting (if plugins installed)

## Methodology Scaling
- **deep**: Full permission setup with both tiers verified, stack-specific deny
  rules from tech-stack.md, MCP plugin detection and server-name entries, complete
  Tier 1 and Tier 2 verification checklists.
- **mvp**: Project-level deny rules and user-level bare Bash + MCP entries.
  Verify one compound command works. Skip stack-specific deny rules.
- **custom:depth(1-5)**: Depth 1-2: core deny/allow only. Depth 3: add MCP
  entries. Depth 4: add stack-specific rules. Depth 5: full verification suite.

## Mode Detection
Update mode if .claude/settings.json exists. In update mode: merge new deny
rules without removing existing ones. For user-level settings, merge entries
into existing allow/deny arrays without duplicating or removing existing entries.
