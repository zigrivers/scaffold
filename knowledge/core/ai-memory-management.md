---
name: ai-memory-management
description: AI memory and context management patterns for Claude Code projects including modular rules, MCP memory servers, lifecycle hooks, decision logging, and external context integration
topics: [ai-memory, claude-code, claude-rules, mcp-servers, lifecycle-hooks, context-management, session-handoff, decision-logging, mcp-knowledge-graph, context7]
---

# AI Memory Management

AI coding agents forget everything between sessions. Memory management is the practice of making that forgetting graceful — ensuring the right context is available at the right time without drowning the agent in irrelevant information. This knowledge covers the full spectrum from lightweight rule files to persistent memory servers.

## Summary

### The Memory Hierarchy

AI memory operates in layers, each with different persistence and token cost:

| Layer | Persistence | Token Cost | Examples |
|-------|------------|------------|----------|
| **Context window** | Current session only | High (1:1) | Files read, conversation history |
| **CLAUDE.md / rules** | Permanent (git-tracked) | Medium (loaded at start) | Conventions, commands, workflow |
| **Auto-memory** | Cross-session (local) | Low (loaded on demand) | User preferences, project patterns |
| **MCP memory server** | Cross-session (structured) | Low (queried on demand) | Decisions, lessons, error patterns |
| **External docs** | Always current | Zero until queried | Library APIs, framework docs |

### Core Principle: Signal Over Volume

ETH Zurich research (2026) found that dumping context into AI sessions hurts more than it helps — 3% performance decrease with 20% cost increase for LLM-generated context files. The key insight: **only store what cannot be derived from the code itself.** Custom build commands, project-specific conventions, decision rationale, and team agreements are high-signal. Code patterns, file structure, and API shapes are low-signal (the agent can read the code).

### The Three-Tier Memory Stack

**Tier 1 — Modular Rules** (`.claude/rules/`): Path-scoped convention files loaded automatically based on what files the agent is working with. Zero manual effort after setup. Keeps CLAUDE.md lean.

**Tier 2 — Persistent Memory** (MCP server + hooks): Structured cross-session memory that captures decisions, lessons, and error patterns automatically via lifecycle hooks. Survives session boundaries.

**Tier 3 — External Context** (library doc servers): Version-specific documentation for project dependencies, queried on demand. Prevents API hallucination.

## Deep Guidance

### Tier 1: Modular Rules

#### `.claude/rules/` Architecture

Claude Code loads rule files from `.claude/rules/` based on path-scoping defined in YAML frontmatter. This replaces the pattern of stuffing everything into CLAUDE.md.

**File structure:**
```
.claude/
  rules/
    code-style.md          # Always active — naming, formatting, imports
    testing.md             # Active when working in test files
    api-endpoints.md       # Active when working in API route files
    database.md            # Active when working with schema/migration files
    frontend.md            # Active when working in UI component files
    memory-hygiene.md      # Always active — what to save/not save in memory
```

**Rule file format:**
```markdown
---
description: TypeScript naming and import conventions
globs: ["src/**/*.ts", "src/**/*.tsx"]
---

- Use camelCase for variables/functions, PascalCase for types/classes
- Import order: external packages, then internal modules, then relative imports
- Prefer named exports over default exports
```

**Key principles:**
- Each rule file targets a specific concern and file pattern
- Rules activate only when the agent works on matching files — no wasted tokens
- Total rule content across all files should stay under 500 lines
- Rules state what to do differently from defaults — don't restate obvious conventions
- Extract rules from existing docs (coding-standards.md, tech-stack.md, git-workflow.md) rather than writing from scratch

#### CLAUDE.md Optimization

After creating rules, CLAUDE.md should use the pointer pattern:

```markdown
## Coding Conventions
See `docs/coding-standards.md` for full reference. Key rules in `.claude/rules/code-style.md`.
```

This replaces inline convention blocks, keeping CLAUDE.md under 200 lines (the empirically-validated adherence threshold).

### Tier 2: Persistent Memory

#### MCP Memory Servers

**Recommended: MCP Knowledge Graph** (`@modelcontextprotocol/server-memory`)
- Official MCP server from the Model Context Protocol project
- Stores entities, relations, and observations in a local JSON file
- Zero setup: `npx -y @modelcontextprotocol/server-memory`
- Entities persist across sessions — decisions, patterns, project facts
- Best for: All projects (stable, official, zero dependencies beyond Node)

**Alternative: Custom MCP server**
- If the user has a preferred MCP memory server already installed, use it
- The key requirement is that it exposes MCP tools for storing and retrieving structured memory
- Examples from the ecosystem: Engram (if installed), hmem (if installed), ContextVault

**Configuration pattern** (`.claude/settings.json`):
```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": ".claude/memory-graph.json"
      }
    }
  }
}
```

#### Lifecycle Hooks

Hooks automate memory capture at key session events:

**PreCompact** (highest value) — Triggers before context compression. Logs when compaction occurs for debugging context loss.

```json
{
  "hooks": {
    "PreCompact": [{
      "type": "command",
      "command": "echo \"$(date '+%Y-%m-%d %H:%M:%S') — Context compacting\" >> .claude/compaction-log.txt",
      "timeout": 5000
    }]
  }
}
```

File-logging for compaction events:
```json
{
  "hooks": {
    "PreCompact": [{
      "type": "command",
      "command": "date '+%Y-%m-%d %H:%M' >> .claude/compaction-log.txt && echo 'Context compacted' >> .claude/compaction-log.txt",
      "timeout": 5000
    }]
  }
}
```

**Stop** — Triggers when a session ends. Good for capturing session-level summaries.

**PreToolUse** — Triggers before tool calls. Can log decisions about file modifications. Use sparingly — high frequency means high overhead.

**Hook selection guidance:**
- Start with PreCompact only — it captures the most value with least noise
- Hook commands must produce a side effect (write to MCP server, append to file) — echoing to `/dev/null` provides zero value
- Add Stop if sessions frequently end with unrecorded decisions
- Avoid PreToolUse unless you have a specific logging need — it fires constantly

#### Decision Logging

Decisions are the highest-value memory type because they cannot be derived from code. A decision log captures what was chosen, what was rejected, and why.

**Structure:**
```
docs/decisions/
  DECISIONS.md          # Index of all decisions
  001-auth-strategy.md  # Individual decision records
  002-database-choice.md
```

**Decision entry format:**
```markdown
## DEC-001: JWT over session cookies for auth

**Date:** 2026-03-27
**Context:** Need stateless auth for API-first architecture
**Decision:** Use JWT with short-lived access tokens + refresh tokens
**Rejected:** Session cookies (requires sticky sessions), OAuth-only (too complex for MVP)
**Consequences:** Need token refresh logic in frontend, need secure token storage
```

This complements ADRs (which cover architecture-level decisions) by capturing day-to-day implementation decisions that would otherwise be lost between sessions.

#### Session Handoff Patterns

When context hits limits, structured handoff preserves continuity:

1. **Before compaction**: Save current task state, open questions, and recent decisions
2. **After compaction**: Claude Code auto-reloads CLAUDE.md and auto-memory, but loses working context
3. **Recovery**: Agent reads decision log and memory server to reconstruct working state

The `/compact` command is the natural handoff point. A PreCompact hook that saves session state ensures nothing critical is lost.

### Tier 3: External Context

#### Library Documentation Servers

AI agents hallucinate APIs — they generate plausible but incorrect function signatures, especially for rapidly-evolving libraries. External doc servers solve this by providing current, version-specific documentation on demand.

**Context7** (by Upstash) — Most popular, fetches current library docs via MCP
- Covers major frameworks (React, Next.js, Vue, Angular, etc.)
- Free tier: 1,000 requests/month
- Caution: had a security vulnerability (patched) — review before enabling

**Nia** (by Nozomio) — Indexes codebases + 3,000+ pre-indexed packages
- Cross-session context persistence
- Deep research agent for complex questions
- Y Combinator backed, more comprehensive than Context7

**Docfork** — 9,000+ libraries, MIT license
- "Cabinets" for project-specific documentation isolation
- Self-hostable

**Configuration pattern:**
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"]
    }
  }
}
```

**When to enable:** Projects with 3+ external dependencies, especially rapidly-evolving frameworks (React, Next.js, Svelte). Skip for standard library-only projects or well-established stable APIs.

### Anti-Patterns

| Anti-Pattern | Why It Fails | Instead |
|-------------|-------------|---------|
| Dumping entire codebase into context | Drowns signal in noise, costs tokens | Let the agent read files on demand |
| Storing code patterns in memory | Duplicates what's in the code; goes stale | Store decisions and rationale only |
| Huge CLAUDE.md (500+ lines) | Adherence drops sharply above 200 lines | Use .claude/rules/ for specifics |
| Memory without structure | Unstructured notes become unsearchable noise | Use categories (decision, lesson, error) |
| Capturing everything | Token cost with diminishing returns | Capture what can't be derived from code |
| Multiple overlapping memory tools | Conflicting context, duplicated entries | Pick one MCP server, use it consistently |

### Integration with Beads

When Beads is configured, memory complements task tracking:
- **Beads** tracks what work to do (tasks, dependencies, status)
- **Memory** tracks how to do work better (patterns, decisions, lessons)
- Decision log entries can reference Beads task IDs for traceability
- `tasks/lessons.md` remains the cross-session learning file; MCP memory adds structured queryability
- Don't duplicate: if a pattern is in `tasks/lessons.md`, don't also store it in the MCP server
