---
description: "Configure AI memory and context management"
long-description: "Sets up a tiered AI memory stack: modular .claude/rules/ extracted from project docs (Tier 1), optional MCP memory server with lifecycle hooks and decision logging (Tier 2), and optional external library documentation server (Tier 3). Improves agent effectiveness across sessions while keeping context lean."
---

Configure AI memory and context management for this project. The goal is to make AI agents more effective across sessions by ensuring the right context is available at the right time without drowning the agent in irrelevant information.

Read CLAUDE.md, docs/coding-standards.md, docs/tech-stack.md, and docs/git-workflow.md to understand existing project conventions.

## Mode Detection

Before starting, check if `.claude/rules/` directory exists:

**If the directory does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the directory exists → UPDATE MODE**:
1. **Read & analyze**: Read all existing rule files in `.claude/rules/`. List each file with its description and globs.
2. **Diff against current sources**: Compare rule content against current project docs (coding-standards.md, tech-stack.md, git-workflow.md). Categorize:
   - **ADD** — Conventions in docs not yet captured in rules
   - **UPDATE** — Rules that have drifted from current doc content
   - **PRESERVE** — User-customized rules not derived from scaffold docs
3. **Check MCP configuration**: Read `.claude/settings.json` if it exists. Note any existing MCP servers and hooks.
4. **Preview changes**: Present the user a summary:
   | Action | Target | Detail |
   |--------|--------|--------|
   | ADD | ... | ... |
   | UPDATE | ... | ... |
   | PRESERVE | ... | ... |
   Wait for user approval before proceeding.
5. **Execute update**: Add missing rules, update drifted rules, preserve user customizations. Never delete user-created rule files.
6. **Post-update summary**: Report rules added, rules updated, rules preserved, and any MCP configuration changes.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `.claude/rules/` directory
- **Secondary output**: `docs/ai-memory-setup.md`, `.claude/settings.json`, CLAUDE.md updates
- **Preserve**: All user-created rule files, existing MCP server configurations, custom hooks, `docs/decisions/` content
- **Related docs**: `docs/coding-standards.md`, `docs/tech-stack.md`, `docs/git-workflow.md`, `CLAUDE.md`
- **Special rules**: Never remove a rule file the user created manually. Never replace an MCP server configuration without asking. Never modify `docs/decisions/` entries.

## Decision Points

Use AskUserQuestionTool for these decisions:

1. **Which memory tiers to enable?** Present all three tiers with descriptions. Tier 1 (Modular Rules) is always recommended. Tier 2 (Persistent Memory) and Tier 3 (External Context) are optional.
2. **(Tier 2) Which MCP memory server?** Options: Engram (lightweight, zero dependencies — recommended for most projects), hmem (hierarchical, cross-tool — recommended for teams and complex projects), Claude-Mem (comprehensive auto-capture — recommended for users who want maximum capture). Auto-detect: check if any of these are already installed (`command -v engram`, `command -v hmem`, check for Claude-Mem in existing MCP config).
3. **(Tier 2) Which lifecycle hooks?** Options: PreCompact only (recommended — highest value, lowest noise), PreCompact + Stop (captures session summaries too), All three (PreCompact + Stop + PreToolUse — verbose, for complex projects).
4. **(Tier 3) Which library doc server?** Options: Context7 (most popular, 1K free requests/month), Nia (comprehensive, 3K+ indexed packages), Docfork (9K+ libraries, MIT, self-hostable). Only offer if the project has external dependencies.

## Tier 1: Modular Rules

This tier is always applicable. Extract conventions from existing project documents into path-scoped `.claude/rules/` files.

### Step 1.1: Audit Existing Docs

Read these files completely and extract every actionable convention:

| Source Document | What to Extract |
|----------------|-----------------|
| `docs/coding-standards.md` | Naming conventions, import ordering, formatting rules, error handling patterns, type annotation rules |
| `docs/tech-stack.md` | Technology-specific patterns, framework conventions, library usage patterns |
| `docs/git-workflow.md` | Commit message format, branch naming, PR workflow steps |
| `docs/tdd-standards.md` | Test naming, test structure, mocking rules, coverage requirements |
| `docs/dev-setup.md` | Build commands, environment variables, tool usage |

Skip any docs that don't exist yet.

### Step 1.2: Plan Rule Files

Group extracted conventions by file scope. Each rule file should target a specific concern and set of file patterns.

**Standard rule file plan:**

| Rule File | Globs | Source |
|-----------|-------|--------|
| `code-style.md` | `src/**/*.{ts,tsx,js,jsx,py,go,rs}` | coding-standards.md — naming, formatting, imports |
| `testing.md` | `**/*.{test,spec}.{ts,tsx,js,jsx}`, `tests/**/*` | tdd-standards.md — test patterns, mocking rules |
| `git-conventions.md` | (always active — no globs) | git-workflow.md — commit format, branch naming, PR steps |
| `api-routes.md` | `src/api/**/*`, `src/routes/**/*`, `app/api/**/*` | coding-standards.md + tech-stack.md — API patterns |
| `database.md` | `**/schema.*`, `**/migrations/**/*`, `**/models/**/*` | coding-standards.md — ORM patterns, migration rules |
| `frontend.md` | `src/components/**/*`, `src/pages/**/*`, `app/**/*.tsx` | coding-standards.md + tech-stack.md — component patterns |
| `memory-hygiene.md` | (always active — no globs) | New — rules for what agents should/shouldn't save to memory |

**Only create rule files relevant to this project.** If the project has no database, skip `database.md`. If it's backend-only, skip `frontend.md`. Read `docs/tech-stack.md` to determine which files apply.

### Step 1.3: Create Rule Files

For each planned rule file, create it in `.claude/rules/` with this format:

```markdown
---
description: [One-line description of what these rules cover]
globs: ["glob/pattern/**/*.ts"]
---

- [Actionable rule extracted from docs]
- [Another actionable rule]
```

**Rule writing guidelines:**
- Each rule must be a single, actionable instruction
- State what to do differently from defaults — don't restate obvious conventions
- Use specific examples: "Use `camelCase` for variables" not "Use consistent naming"
- Keep each rule file under 50 lines — if longer, split into two files
- Total across all rule files should stay under 500 lines
- Never include rules that duplicate what's already in CLAUDE.md

**Always create `memory-hygiene.md`** regardless of project type:

```markdown
---
description: Rules for what AI agents should and should not save to memory
---

- Save decisions and their rationale — these cannot be derived from code
- Save corrections from the user — patterns to avoid repeating mistakes
- Save team conventions not captured in docs — implicit knowledge
- Do NOT save code patterns — read the code instead
- Do NOT save file structure — use glob/grep instead
- Do NOT save git history — use git log/blame instead
- Do NOT save debugging solutions — the fix is in the code, context in the commit
- When saving, include WHY not just WHAT — rationale enables judgment in edge cases
- Review tasks/lessons.md before saving to avoid duplicates
```

### Step 1.4: Optimize CLAUDE.md

After creating rule files, update CLAUDE.md to use the pointer pattern:

1. Read current CLAUDE.md completely
2. Identify sections that duplicate content now covered by `.claude/rules/` files
3. Replace inline convention blocks with pointers:
   ```markdown
   ## Coding Conventions
   See `docs/coding-standards.md` for full reference. Path-scoped rules in `.claude/rules/`.
   ```
4. Verify CLAUDE.md stays under 200 lines after optimization
5. Do NOT remove sections that contain project-specific information not in rules

### Step 1.5: Validate Rules

For each created rule file:
1. Verify the globs match actual files in the project (`ls` or `find` the patterns)
2. Verify no two rule files have identical globs (avoid double-loading)
3. Verify rules accurately reflect the source document (re-read the source and compare)
4. Run `wc -l .claude/rules/*.md` — total should be under 500 lines

## Tier 2: Persistent Memory

Skip this tier if the user did not opt in.

### Step 2.1: Detect Existing Memory Tools

```bash
# Check for installed MCP memory servers
command -v engram && echo "engram available" || echo "engram not found"
command -v hmem && echo "hmem available" || echo "hmem not found"
# Check for Claude-Mem in existing MCP config
cat .claude/settings.json 2>/dev/null | grep -q "claude-mem" && echo "claude-mem configured" || echo "claude-mem not configured"
```

If a memory server is already installed, recommend using it rather than installing a new one.

### Step 2.2: MCP Memory Server Setup

Based on the user's choice (or auto-detected installation), configure the MCP memory server in `.claude/settings.json`.

**Engram configuration:**
```json
{
  "mcpServers": {
    "memory": {
      "command": "engram",
      "args": ["mcp"],
      "env": {
        "ENGRAM_DB": ".engram/memory.db"
      }
    }
  }
}
```

Add `.engram/` to `.gitignore` (memory is local, not shared via git).

**hmem configuration:**
```json
{
  "mcpServers": {
    "memory": {
      "command": "hmem",
      "args": ["serve", "--mcp"],
      "env": {
        "HMEM_DB": ".hmem/memory.db"
      }
    }
  }
}
```

Add `.hmem/` to `.gitignore`.

**Claude-Mem configuration:**
```json
{
  "mcpServers": {
    "claude-mem": {
      "command": "npx",
      "args": ["-y", "claude-mem", "mcp"]
    }
  }
}
```

**Important**: Merge into existing `.claude/settings.json` — do not overwrite. Read the file first, add the `mcpServers` entry, write back.

### Step 2.3: Lifecycle Hooks

Based on the user's hook choices, add hook configuration to `.claude/settings.json`:

**PreCompact hook** (always recommended):
```json
{
  "hooks": {
    "PreCompact": [{
      "type": "command",
      "command": "echo 'Session context compacting. Key decisions and patterns from this session should be saved to memory before compaction.' >> /dev/null",
      "timeout": 5000
    }]
  }
}
```

Note: The PreCompact hook's primary value is as a signal to Claude Code's auto-memory system. The command itself is minimal — the act of the hook firing triggers Claude to evaluate what should be preserved.

**Stop hook** (optional):
```json
{
  "hooks": {
    "Stop": [{
      "type": "command",
      "command": "echo 'Session ending. Save any unsaved decisions or lessons.' >> /dev/null",
      "timeout": 5000
    }]
  }
}
```

**Merge hooks into existing configuration** — do not overwrite existing hooks.

### Step 2.4: Decision Logging Structure

Create the decision logging structure:

```bash
mkdir -p docs/decisions
```

Create `docs/decisions/README.md`:

```markdown
# Decision Log

This directory captures implementation decisions made during development.
Decisions are the highest-value memory type — they cannot be derived from code.

## Format

Each decision file follows this structure:

```
## DEC-NNN: [Short title]

**Date:** YYYY-MM-DD
**Context:** [What situation prompted this decision]
**Decision:** [What was chosen]
**Rejected:** [What alternatives were considered and why they were rejected]
**Consequences:** [What this decision means for future work]
```

## When to Log a Decision

- Choosing between two viable approaches
- Rejecting a library, tool, or pattern
- Making a trade-off (performance vs. readability, etc.)
- User explicitly asks to "remember" a decision
- A correction reveals a non-obvious convention

## When NOT to Log

- Obvious choices with no viable alternative
- Decisions already captured in ADRs (docs/adrs/)
- Temporary debugging choices
- Decisions already in tasks/lessons.md
```

### Step 2.5: Update CLAUDE.md for Memory

Add a "Memory & Context" section to CLAUDE.md:

```markdown
## Memory & Context
- Path-scoped rules in `.claude/rules/` — loaded automatically per file type
- Decision log in `docs/decisions/` — log non-obvious implementation decisions
- MCP memory server configured — use for cross-session pattern recall
- See `docs/ai-memory-setup.md` for full memory stack documentation
```

## Tier 3: External Context

Skip this tier if the user did not opt in.

### Step 3.1: Assess Dependencies

Read `package.json` (or equivalent dependency file). Count external dependencies and identify rapidly-evolving frameworks.

**High-value targets for external docs:**
- React, Next.js, Remix, Vue, Nuxt, Svelte, SvelteKit, Angular
- Prisma, Drizzle, TypeORM, Sequelize
- tRPC, GraphQL, gRPC
- Tailwind CSS, Radix UI, shadcn/ui
- Expo, React Native

If the project has 0 external dependencies or only uses stable standard libraries, recommend skipping this tier.

### Step 3.2: Configure Library Doc Server

Based on the user's choice:

**Context7 configuration:**
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

**Nia configuration:**
```json
{
  "mcpServers": {
    "nia": {
      "command": "npx",
      "args": ["-y", "@nozomio/nia-mcp@latest"]
    }
  }
}
```

**Docfork configuration:**
```json
{
  "mcpServers": {
    "docfork": {
      "command": "npx",
      "args": ["-y", "docfork-mcp@latest"]
    }
  }
}
```

**Merge into existing `.claude/settings.json`** — do not overwrite.

### Step 3.3: Verify External Context

After configuration, verify the server responds:
1. Restart Claude Code (or reload MCP servers) for the new configuration to take effect
2. Test by querying documentation for one of the project's key dependencies
3. If the server fails to start, check the error and suggest troubleshooting steps

## Documentation

Create `docs/ai-memory-setup.md` documenting the configured memory stack:

```markdown
<!-- scaffold:ai-memory-setup v1.0 YYYY-MM-DD -->
# AI Memory & Context Management

## Memory Stack

| Tier | Status | Components |
|------|--------|------------|
| Tier 1: Modular Rules | ✅ Enabled | .claude/rules/ (N files, N lines total) |
| Tier 2: Persistent Memory | ✅/⬜ | [MCP server name], [hooks enabled] |
| Tier 3: External Context | ✅/⬜ | [Library doc server name] |

## Rule Files

| File | Scope | Lines | Source |
|------|-------|-------|--------|
| code-style.md | src/**/*.ts | N | coding-standards.md |
| ... | ... | ... | ... |

## MCP Servers

[List configured MCP servers with their purpose]

## Lifecycle Hooks

[List configured hooks with their trigger and purpose]

## Maintenance

### Adding Rules
Create a new `.md` file in `.claude/rules/` with YAML frontmatter containing `description` and `globs` fields.

### Updating Rules
When coding conventions change, update both the source doc and the corresponding rule file.

### Decision Logging
Log non-obvious decisions to `docs/decisions/DEC-NNN-title.md`. See `docs/decisions/README.md` for format.

### Memory Hygiene
Review `.claude/rules/memory-hygiene.md` for what should and should not be saved to memory.
```

## Process

1. Read all source documents (coding-standards.md, tech-stack.md, git-workflow.md, tdd-standards.md, dev-setup.md)
2. Present tier choices to the user (AskUserQuestionTool)
3. Execute Tier 1: Extract conventions into `.claude/rules/` files
4. Optimize CLAUDE.md with pointer pattern
5. Validate rule files (globs match real files, no duplicates, under 500 lines total)
6. (Tier 2) Detect and configure MCP memory server
7. (Tier 2) Configure lifecycle hooks
8. (Tier 2) Create decision logging structure
9. (Tier 3) Assess dependencies and configure library doc server
10. Write `docs/ai-memory-setup.md` documentation
11. Verify the complete memory stack

## After This Step

When this step is complete, tell the user:

---
**Memory setup complete** — AI memory stack configured and documented in `docs/ai-memory-setup.md`.

**Configured:**
- `.claude/rules/` — [N] path-scoped rule files ([N] lines total)
- [Tier 2 summary if enabled]
- [Tier 3 summary if enabled]

**Next:** Run `/scaffold:add-e2e-testing` to configure end-to-end testing, or `/scaffold:create-prd` to begin product definition.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
