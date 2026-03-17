---
description: "Manage project-local knowledge base overrides"
long-description: "Create, view, and reset project-specific knowledge entries that override scaffold's global knowledge base during prompt assembly."
argument-hint: "<subcommand> [target] [instructions...]"
---

Manage project-local knowledge base overrides in `.scaffold/knowledge/`.

## Usage

Run the scaffold CLI knowledge subcommand with the arguments you provide:

```
scaffold knowledge $ARGUMENTS
```

**Subcommands:**

- `update <target> [instructions...]` — Generate a prompt for Claude to write a project-specific knowledge override. `<target>` can be an entry name (e.g. `api-design`) or a step name (e.g. `create-prd`). Everything after the target is treated as instructions to Claude.
- `list` — Show all entries with source (global or local override).
- `show <name>` — Print the effective content for an entry.
- `reset <name>` — Remove a local override (use `--auto` to bypass uncommitted-changes check).

**Examples:**

```
scaffold knowledge update api-design research GraphQL federation patterns
scaffold knowledge update create-prd focus on B2B SaaS with enterprise SSO
scaffold knowledge list
scaffold knowledge show testing-strategy
scaffold knowledge reset api-design --auto
```

## After This Step

When `update` is used:
1. The assembled prompt is written to stdout — paste it into a Claude Code session
2. Claude writes `.scaffold/knowledge/<name>.md` — review the output
3. Run `scaffold knowledge show <name>` to verify the effective content
4. Commit `.scaffold/knowledge/<name>.md` so your team shares it
5. Re-run the affected pipeline step with `scaffold run <step>` to see the enriched output

**Pipeline reference:** `/scaffold:prompt-pipeline`
