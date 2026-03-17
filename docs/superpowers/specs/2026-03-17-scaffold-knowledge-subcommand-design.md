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

---

## Prompt Assembly (`update` subcommand)

The `update` subcommand uses a new internal template — `knowledge-update` — processed by the existing assembly engine. It is not a pipeline meta-prompt.

**Assembly steps:**

1. **Load global entry** — reads `knowledge/<category>/<name>.md` from the installed package; strips frontmatter; uses body as seed context.
2. **Detect mode** — if `.scaffold/knowledge/**/<name>.md` exists: **update mode** (refine in-place). Otherwise: **create mode** (generate fresh from global seed).
3. **Load project context** — reads `.scaffold/config.yml` (methodology, depth) and any relevant existing artifact (e.g. `docs/api-spec.md` when updating `api-design`) to ground the output in the actual project.
4. **Apply user instructions** — appended as a "Focus" section at the end of the assembled prompt.
5. **Deliver** — outputs via the platform adapter (same path as `scaffold run`).

**Assembled prompt instructs Claude to:**

- Write a complete `.scaffold/knowledge/<name>.md` with valid frontmatter (`name`, `description`, `topics`)
- **Create mode:** seed structure from the global entry, then tailor content to the project context and user instructions
- **Update mode:** preserve what's still accurate, revise what the instructions change, add what's missing — diff over regeneration

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

```
NAME                 SOURCE          DESCRIPTION
api-design           local override  API design principles (project-customized)
prd-craft            global          How to write a great PRD
testing-strategy     local override  Testing strategy (tailored for Jest + Postgres)
```

### `scaffold knowledge show <name>`

Prints the effective content — local override if present, otherwise global. Includes a header line indicating the active source. Useful for reviewing what Claude will see before running a step.

### `scaffold knowledge reset <name>`

Deletes `.scaffold/knowledge/**/<name>.md` if it exists. Prints confirmation on success, "nothing to reset" if no local override exists. Requires `--force` when the local override has uncommitted git changes.

---

## Assembly Engine Changes

One change to `knowledge-loader.ts`: before falling back to the global `knowledge/` dir, check the project root's `.scaffold/knowledge/` directory for an override. If found, use it instead. No schema changes, no new file formats.

```typescript
// Lookup order in buildIndex():
// 1. <projectRoot>/.scaffold/knowledge/**/<name>.md
// 2. <packageRoot>/knowledge/**/<name>.md
```

---

## Future Extension (Out of Scope)

`scaffold run --refresh-knowledge` — runs `knowledge update` for all entries referenced by the step before assembling the step prompt. Not in scope for initial implementation; noted here as a natural follow-on.

---

## Implementation Scope

### New files
- `src/cli/commands/knowledge.ts` — yargs CommandModule with four subcommands
- `src/core/knowledge/knowledge-update-template.md` — internal template for prompt assembly
- `commands/knowledge.md` — Claude Code slash command

### Modified files
- `src/core/assembly/knowledge-loader.ts` — add project-local override lookup
- `src/cli/index.ts` — register `knowledge` command

### Tests
- Unit: target resolution (step → entries, entry direct, ambiguous, not found)
- Unit: assembly in create mode and update mode
- Unit: knowledge loader override precedence
- E2E: `scaffold knowledge update`, `list`, `show`, `reset` in a temp project directory
