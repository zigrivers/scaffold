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

Four subcommands under `scaffold knowledge`:

| Subcommand | Description |
|---|---|
| `scaffold knowledge update <target> [instructions...]` | Generate a prompt to create or update a local knowledge override |
| `scaffold knowledge list` | Show all entries — global and local overrides |
| `scaffold knowledge show <name>` | Print the effective content for an entry (local override wins if present) |
| `scaffold knowledge reset <name>` | Remove a local override, reverting to global |

### Claude Code slash command

`commands/knowledge.md` registers `/scaffold:knowledge` as a slash command with full argument passthrough:

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

When the user provides `<target>`, the command auto-detects the type:

1. **Entry name** (e.g. `api-design`) — targets that entry directly. Takes precedence when ambiguous.
2. **Step name** (e.g. `create-prd`) — looks up the meta-prompt's `knowledge-base` frontmatter field and resolves to all referenced entry names. Generates one prompt per entry.
3. **Ambiguous** — matches both a step name and an entry name: prefers entry name, prints a note. Pass `--step` to force step resolution.
4. **Not found** — lists close matches (fuzzy against both entry names and step names) and exits with a clear error.

When a step resolves to multiple entries, the command generates one prompt per entry sequentially. Pass `--entry <name>` to target a single entry from a step's set.

**Step resolution edge cases:**
- Step has no `knowledge-base` entries in frontmatter → exits with: `"Step '<name>' has no knowledge-base entries. Nothing to update."`
- `--entry <name>` passed but `<name>` is not in the step's resolved entries → exits with error listing the step's actual entries
- Meta-prompts are discovered from `path.join(projectRoot, 'pipeline')`, consistent with `run.ts`

---

## Prompt Assembly (`update` subcommand)

The `update` subcommand uses a dedicated `KnowledgeUpdateAssembler` — a new lightweight assembler separate from `AssemblyEngine`. `AssemblyEngine` is designed for pipeline steps and requires `state`, `config`, `depth`, `depthProvenance`, and a `MetaPromptFile`, none of which apply to knowledge generation. `KnowledgeUpdateAssembler` is a simple template interpolator with no dependency on pipeline concepts.

**Assembly steps:**

1. **Load global entry** — reads from `path.join(projectRoot, 'knowledge')` (same resolution as `run.ts`); strips frontmatter; uses body as seed context. If the entry name doesn't exist in the global dir, exits with a clear error listing valid entry names.
2. **Detect mode** — if `.scaffold/knowledge/**/<name>.md` exists: **update mode** (refine in-place, existing content loaded). Otherwise: **create mode** (generate fresh from global seed).
3. **Load project context** — reads `.scaffold/config.yml` (methodology setting); scans for any artifact whose path contains the entry name (e.g. `docs/api-spec.md` when updating `api-design`) using a simple filename-match heuristic. Context inclusion is best-effort — missing files are silently skipped.
4. **Apply user instructions** — appended as a "Focus" section at the end of the assembled prompt if provided.
5. **Deliver** — writes the assembled prompt to stdout (same as `scaffold run`). The user pastes it into a Claude Code session; Claude writes `.scaffold/knowledge/<name>.md` directly.

**Prompt template structure** (`src/core/knowledge/knowledge-update-template.md`):

```
## Task
You are updating the knowledge base for this project. Write the file
`.scaffold/knowledge/<name>.md` with valid frontmatter (name, description, topics)
and a markdown body tailored to this project's context.

## Global Knowledge Entry (seed)
<global entry body>

## Existing Local Override (update mode only)
<existing .scaffold/knowledge/<name>.md content, or "(none — create mode)">

## Project Context
Methodology: <methodology from config>
<relevant artifact content if found>

## Focus
<user instructions, or "(none provided)">

## Output Instructions
- In create mode: seed structure from the global entry, tailor to project context and Focus
- In update mode: preserve what's accurate, revise what Focus changes, add what's missing
- Write the complete file including frontmatter — do not summarize or abbreviate
- Output path: `.scaffold/knowledge/<name>.md`
```

---

## File Layout and Storage

Local overrides live in `.scaffold/knowledge/`, mirroring the global structure:

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

**Lookup precedence** in `knowledge-loader.ts`:

1. `.scaffold/knowledge/**/<name>.md` — project-local override (wins if present)
2. `knowledge/**/<name>.md` — global entry (fallback)

The knowledge loader resolves by entry name (not full path), so category subdirectory doesn't need to match between global and local. Local overrides use the same frontmatter schema as global entries.

`.scaffold/knowledge/` is committed to git (like `state.json` and `instructions/`) so the whole team shares enriched knowledge.

---

## Subcommand Behavior

### `scaffold knowledge list`

Prints all entries with source indicator. Respects `--format json`.

Global entries are scanned from `path.join(projectRoot, 'knowledge')`. Local overrides are scanned from `<projectRoot>/.scaffold/knowledge/`. Both use `buildIndex()`.

```
NAME                 SOURCE          DESCRIPTION
api-design           local override  API design principles (project-customized)
prd-craft            global          How to write a great PRD
testing-strategy     local override  Testing strategy (tailored for Jest + Postgres)
```

JSON shape for `--format json`:
```json
[
  { "name": "api-design", "source": "local", "description": "..." },
  { "name": "prd-craft",  "source": "global", "description": "..." }
]
```

### `scaffold knowledge show <name>`

Prints the effective content — local override if present, otherwise global. Includes a header line indicating the active source. Useful for reviewing what Claude will see before running a step.

### `scaffold knowledge reset <name>`

Deletes `.scaffold/knowledge/**/<name>.md` if it exists. Prints confirmation on success, "nothing to reset" if no local override exists.

Requires `--force` when the local override has uncommitted git changes. Git change detection uses `child_process.execSync('git status --porcelain <file>')`. If the project is not a git repo (non-zero exit from `git rev-parse --git-dir`), the check is skipped and deletion proceeds without requiring `--force`.

---

## Assembly Engine Changes

One change to `knowledge-loader.ts`: before falling back to the global `knowledge/` dir, check the project root's `.scaffold/knowledge/` directory for an override. If found, use it instead. No schema changes, no new file formats.

The global knowledge dir is `path.join(projectRoot, 'knowledge')` — consistent with how `run.ts` resolves it today (`projectRoot` is the user's project root, detected via `findProjectRoot(process.cwd())`). No `packageRoot` concept is introduced.

```typescript
// New exported function: buildIndexWithOverrides(projectRoot, globalKnowledgeDir)
// Lookup order:
// 1. <projectRoot>/.scaffold/knowledge/**/<name>.md  (local override — wins if present)
// 2. <globalKnowledgeDir>/**/<name>.md              (global fallback, same as today)
// Duplicate names within the local override dir: emit a warning and use last-write-wins
// (consistent with current buildIndex behavior for the global dir)
```

Callers of `buildIndex()` in `run.ts` and `build.ts` are updated to call `buildIndexWithOverrides()` instead, passing both `projectRoot` and `knowledgeDir`. Existing behavior is preserved when no `.scaffold/knowledge/` dir exists.

---

## Future Extension (Out of Scope)

`scaffold run --refresh-knowledge` — runs `knowledge update` for all entries referenced by the step before assembling the step prompt. Not in scope for initial implementation; noted here as a natural follow-on.

---

## Implementation Scope

### New files
- `src/cli/commands/knowledge.ts` — yargs CommandModule with four subcommands (`update`, `list`, `show`, `reset`)
- `src/cli/commands/knowledge.test.ts` — unit tests for all four subcommands
- `src/core/knowledge/knowledge-update-assembler.ts` — `KnowledgeUpdateAssembler` class
- `src/core/knowledge/knowledge-update-template.md` — prompt template for knowledge generation
- `commands/knowledge.md` — Claude Code slash command

### Modified files
- `src/core/assembly/knowledge-loader.ts` — add `buildIndexWithOverrides(projectRoot, globalKnowledgeDir)` export
- `src/cli/commands/run.ts` — call `buildIndexWithOverrides()` instead of `buildIndex()`
- `src/cli/commands/build.ts` — call `buildIndexWithOverrides()` instead of `buildIndex()` (if applicable)
- `src/cli/index.ts` — register `knowledge` command

### Tests
- Unit (`knowledge.test.ts`): target resolution (step → entries, entry direct, ambiguous, not found, step with no entries, `--entry` mismatch)
- Unit (`knowledge.test.ts`): `KnowledgeUpdateAssembler` in create mode and update mode
- Unit (`knowledge-loader.test.ts`): `buildIndexWithOverrides` override precedence, duplicate name warning
- E2E (`tests/e2e/knowledge.test.ts`): `scaffold knowledge update`, `list`, `show`, `reset` in a temp project directory with real file system
