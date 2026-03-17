# Design: `scaffold knowledge` Subcommand Namespace

**Date:** 2026-03-17
**Status:** Approved
**Author:** Ken Allred

---

## Overview

Add a `scaffold knowledge` subcommand namespace that lets users create and manage project-local knowledge base overrides. The primary use case is `/scaffold:knowledge update <target> [instructions]` — a command that assembles a prompt for Claude to research and write a `.scaffold/knowledge/<name>.md` file tailored to the current project, layering on top of scaffold's global knowledge entries.

---

## Motivation

Scaffold's assembly engine loads knowledge entries from the global `knowledge/` directory (distributed with the CLI). These entries contain general best practices, but they have no awareness of a project's specific tech stack, constraints, or conventions. A project building a GraphQL API has different `api-design` needs than one building a REST service. A project using Postgres + Jest has different `testing-strategy` context than one using DynamoDB + pytest.

Project-local overrides give teams a way to enrich knowledge entries for their specific context — committable to git so the whole team shares them — without modifying the global scaffold install.

---

## Command Surface

Four subcommands registered under the `scaffold knowledge` namespace via a single yargs CommandModule (`src/cli/commands/knowledge.ts`) with nested subcommands. This is a new namespace — it does not conflict with the existing top-level `scaffold reset` command.

| Subcommand | Description |
|---|---|
| `scaffold knowledge update <target> [instructions...]` | Generate a prompt to create or update a local knowledge override |
| `scaffold knowledge list` | Show all entries — global and local overrides |
| `scaffold knowledge show <name>` | Print the effective content for an entry (local override wins if present) |
| `scaffold knowledge reset <name>` | Remove a local override, reverting to global |

### Claude Code slash command

`commands/knowledge.md` registers `/scaffold:knowledge` as a slash command with full argument passthrough, following the same frontmatter schema and "After This Step" structure as other `commands/*.md` files:

```
/scaffold:knowledge update api-design research GraphQL federation patterns
/scaffold:knowledge update create-prd focus on B2B SaaS with enterprise SSO
/scaffold:knowledge list
/scaffold:knowledge show testing-strategy
/scaffold:knowledge reset api-design
```

`instructions` is variadic — everything after `<target>` is treated as the instruction string, no quoting required.

---

## Target Resolution

Target resolution logic lives in the `knowledge update` subcommand handler in `knowledge.ts`. It calls `discoverMetaPrompts(path.join(projectRoot, 'pipeline'))` (consistent with `run.ts`) to build the step name index.

When the user provides `<target>`, the command auto-detects the type:

1. **Entry name** (e.g. `api-design`) — targets that entry directly. Takes precedence when ambiguous.
2. **Step name** (e.g. `create-prd`) — looks up the meta-prompt's `knowledge-base` frontmatter field and resolves to all referenced entry names. Generates one prompt per entry.
3. **Ambiguous** — matches both a step name and an entry name: prefers entry name, prints a note. Pass `--step` to force step resolution.
4. **Not found** — lists close matches (fuzzy against both entry names and step names) and exits with code 1.

When a step resolves to multiple entries, the command generates one prompt per entry sequentially. Pass `--entry <name>` to target a single entry from a step's set.

**Step resolution edge cases:**

| Condition | Behavior | Exit code |
|---|---|---|
| Step has no `knowledge-base` entries | Error: `"Step '<name>' has no knowledge-base entries. Nothing to update."` | 1 |
| `--entry` not in step's entry set | Error listing the step's actual entries | 1 |
| Target matches nothing | Error with fuzzy suggestions | 1 |
| Entry not found in global knowledge dir | Error listing valid entry names | 1 |

---

## Prompt Assembly (`update` subcommand)

The `update` subcommand uses a dedicated `KnowledgeUpdateAssembler` (`src/core/knowledge/knowledge-update-assembler.ts`) — a lightweight template interpolator separate from `AssemblyEngine`. `AssemblyEngine` requires `state`, `config`, `depth`, `depthProvenance`, and a `MetaPromptFile` — none of which apply to knowledge generation. `KnowledgeUpdateAssembler` has no dependency on pipeline concepts.

**Global knowledge dir resolution:** The global knowledge dir is `path.join(projectRoot, 'knowledge')` — the same resolution used by `run.ts` today. This is consistent with the existing codebase. Package-root resolution for the bundled `knowledge/` dir in installed deployments is a pre-existing open issue shared by `run`, `build`, `status`, and other commands; it is out of scope for this feature.

**Assembly steps:**

1. **Load global entry** — reads from `path.join(projectRoot, 'knowledge')` via `buildIndex()`; strips frontmatter; uses body as seed context. Exits with code 1 and lists valid entry names if the entry is not found.
2. **Detect mode** — if `.scaffold/knowledge/**/<name>.md` exists: **update mode** (load existing content). Otherwise: **create mode**.
3. **Load project context** — reads `.scaffold/config.yml` (methodology setting); scans `docs/` in the project root for files whose filename contains the entry name as a substring (e.g. `docs/api-spec.md` when updating `api-design`). Only `.md` files in `docs/` are scanned. Context inclusion is best-effort — missing files and missing `docs/` dir are silently skipped.
4. **Apply user instructions** — appended as a "Focus" section if provided; omitted if none.
5. **Deliver** — writes assembled prompt to stdout. The user pastes it into a Claude Code session; Claude writes `.scaffold/knowledge/<name>.md` directly.

**Prompt template structure** (`src/core/knowledge/knowledge-update-template.md`):

```
## Task
You are updating the knowledge base for this project. Write the file
`.scaffold/knowledge/<name>.md` with valid frontmatter (name, description, topics)
and a markdown body tailored to this project's context.

## Global Knowledge Entry (seed)
<global entry body>

## Existing Local Override (update mode only — omitted in create mode)
<existing .scaffold/knowledge/<name>.md content>

## Project Context
Methodology: <methodology from config>
<relevant docs/ artifact content, if found>

## Focus
<user instructions — omitted if none provided>

## Output Instructions
- In create mode: seed structure from the global entry, tailor to project context and Focus
- In update mode: preserve what's accurate, revise what Focus changes, add what's missing
- Write the complete file including frontmatter — do not summarize or abbreviate
- Output path: `.scaffold/knowledge/<name>.md`
```

---

## File Layout and Storage

Local overrides live in `.scaffold/knowledge/`:

```
.scaffold/
  knowledge/
    core/
      api-design.md        # overrides knowledge/core/api-design.md
    product/
      prd-craft.md         # overrides knowledge/product/prd-craft.md
  config.yml
  state.json
  instructions/
```

**Lookup precedence** in `buildIndexWithOverrides()`:

1. `<projectRoot>/.scaffold/knowledge/**/<name>.md` — project-local override (wins if present)
2. `<globalKnowledgeDir>/**/<name>.md` — global entry (fallback)

Resolution is by the `name` frontmatter field, not the filename or subdirectory. Local overrides do not need to mirror the global category structure. Local overrides use the same frontmatter schema (`name`, `description`, `topics`) as global entries.

If two local override files declare the same `name`, `buildIndexWithOverrides()` emits a warning to stderr and uses last-write-wins (file system walk order). This is a new behavior — the current `buildIndex()` silently uses last-write-wins without warning.

`.scaffold/knowledge/` is committed to git (like `state.json` and `instructions/`) so the whole team shares enriched knowledge.

---

## Subcommand Behavior

### `scaffold knowledge list`

Prints all entries with source indicator. `--format json` is supported; other subcommands do not support `--format json`.

Global entries scanned from `path.join(projectRoot, 'knowledge')`. Local overrides scanned from `<projectRoot>/.scaffold/knowledge/`. Both use `buildIndex()`.

Text output:
```
NAME                 SOURCE          DESCRIPTION
api-design           local override  API design principles (project-customized)
prd-craft            global          How to write a great PRD
testing-strategy     local override  Testing strategy (tailored for Jest + Postgres)
```

JSON output shape:
```json
[
  { "name": "api-design", "source": "local", "description": "..." },
  { "name": "prd-craft",  "source": "global", "description": "..." }
]
```

Exit code: 0 (even if no entries found — prints empty table or `[]`).

### `scaffold knowledge show <name>`

Prints the effective content — local override if present, otherwise global. Includes a header comment indicating source. Exit code 1 if entry not found in either location.

### `scaffold knowledge reset <name>`

Deletes `.scaffold/knowledge/**/<name>.md` if it exists. Uses `--yes` flag (not `--force`, which is a global flag with a different meaning) to bypass the uncommitted-changes confirmation.

Behavior:
- No local override found → prints "Nothing to reset for '<name>'" and exits 0
- Local override found, no uncommitted changes → deletes and prints confirmation, exits 0
- Local override found, uncommitted changes detected → prints warning and prompts for `--yes` to proceed; exits 1 without `--yes`
- Project is not a git repo → skips git check, deletes without `--yes`, exits 0

Git change detection: `child_process.execSync('git status --porcelain <filepath>', { stdio: 'pipe' })`. Non-zero exit from `git rev-parse --git-dir` indicates not a git repo — treat as no git check needed.

---

## Knowledge Loader Changes

New exported function `buildIndexWithOverrides(projectRoot: string, globalKnowledgeDir: string): Map<string, string>` added to `knowledge-loader.ts`:

```typescript
// Lookup order:
// 1. <projectRoot>/.scaffold/knowledge/**/<name>.md  (local override — wins if present)
// 2. <globalKnowledgeDir>/**/<name>.md              (global fallback)
// Duplicate names in local override dir: emit warning to stderr, use last-write-wins
```

Callers of `buildIndex()` in `run.ts` are updated to call `buildIndexWithOverrides()`. `build.ts` does not call `buildIndex()` and requires no changes.

Existing behavior is preserved when `.scaffold/knowledge/` does not exist.

---

## Exit Codes

All `scaffold knowledge` subcommands use the existing codebase exit code conventions:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | User error (target not found, no entries, etc.) |

---

## Future Extension (Out of Scope)

`scaffold run --refresh-knowledge` — runs `knowledge update` for all entries referenced by the step before assembling the step prompt. Not in scope for initial implementation; noted here as a natural follow-on.

---

## Implementation Scope

### New files
- `src/cli/commands/knowledge.ts` — yargs CommandModule with nested subcommands (`update`, `list`, `show`, `reset`)
- `src/cli/commands/knowledge.test.ts` — unit tests for all four subcommands
- `src/core/knowledge/knowledge-update-assembler.ts` — `KnowledgeUpdateAssembler` class
- `src/core/knowledge/knowledge-update-template.md` — prompt template for knowledge generation
- `commands/knowledge.md` — Claude Code slash command (frontmatter + "After This Step" per CLAUDE.md conventions)

### Modified files
- `src/core/assembly/knowledge-loader.ts` — add `buildIndexWithOverrides()` export
- `src/cli/commands/run.ts` — call `buildIndexWithOverrides()` instead of `buildIndex()`
- `src/cli/index.ts` — register `knowledge` command

### Tests
- Unit (`knowledge.test.ts`): target resolution (step → entries, entry direct, ambiguous, not found, step with no entries, `--entry` mismatch)
- Unit (`knowledge.test.ts`): `KnowledgeUpdateAssembler` in create mode and update mode
- Unit (`knowledge-loader.test.ts`): `buildIndexWithOverrides` override precedence, duplicate name warning
- E2E (`tests/e2e/knowledge.test.ts`): `scaffold knowledge update`, `list`, `show`, `reset` in a temp project directory with real file system
