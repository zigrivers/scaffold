# Build a Claude Code Skill for the Scaffold CLI

Create a Claude Code skill that provides an intelligent interactive wrapper around the `scaffold` CLI, solving the problem where scaffold's assembled prompts contain decision points (depth level, strictness, optional sections) that don't get surfaced to the user when run via bash.

## Before You Start

Read these files to understand the systems involved:

**Scaffold CLI:**
- `README.md` — How the CLI works (scaffold run, scaffold next, scaffold status, methodology presets, depth 1-5)
- `src/core/assembly/engine.ts` — The 7-section prompt assembly (understand what the assembled output looks like)
- `src/cli/commands/run.ts` — How `scaffold run` works
- `src/cli/commands/next.ts` — How `scaffold next` works

**Existing skills:**
- `skills/scaffold-pipeline/SKILL.md` — The existing auto-activated skill (understand the pattern)
- Read Claude Code skill documentation: skills are SKILL.md files in a `skills/` directory that auto-activate based on trigger conditions

**Sample assembled prompts:**
- Run `scaffold run create-prd --auto 2>&1 | head -50` to see what an assembled prompt looks like
- Run `scaffold run tdd --auto 2>&1 | head -50` for another example
- Look for lines containing "AskUserQuestion", "depth", "strictness", "optional", "choose" — these are the decision points that need to be surfaced

**Decision points in scaffold prompts:**
- Read 3-4 command files in `commands/` that have `## Process` sections — look for numbered steps that say "ask the user" or "use AskUserQuestion"
- Common decision points: depth level (1-5), strictness level, optional sections to include/skip, custom patterns, methodology choices

---

## What the Skill Should Do

### Core Workflow: Smart Scaffold Execution

When the user says "run scaffold <step>" or "scaffold <step>" or "run the next scaffold step":

1. **Check pipeline status** — Run `scaffold next` to see what's eligible. If the user asked for a specific step, verify it's eligible.

2. **Preview the assembled prompt** — Run `scaffold run <step> --auto` and capture the output. DON'T execute it yet.

3. **Extract decision points** — Parse the assembled prompt for user-facing questions:
   - Lines mentioning "AskUserQuestion" or "ask the user"
   - Depth/strictness choices
   - Optional section toggles
   - Any "choose between" or "select" language
   - Custom pattern inputs

4. **Surface decisions to the user** — Present each decision point using AskUserQuestion with clear options. For common patterns:
   - **Depth**: "What depth level? (1=MVP, 3=balanced, 5=exhaustive)"
   - **Strictness**: "What eval strictness? (strict/moderate/lenient)"
   - **Optional sections**: "Include [section name]? (yes/no)"

5. **Execute with answers** — Run the assembled prompt as Claude's working instructions, with the user's decisions pre-filled. This means Claude executes the prompt content (reads files, generates artifacts, etc.) with the decision points already resolved.

6. **Post-execution** — After the step completes:
   - Run `scaffold status` to show updated progress
   - Run `scaffold next` to show what's now eligible
   - Offer to continue with the next step

### Secondary Features

**Pipeline overview**: When the user asks "where am I?" or "what's my pipeline status":
- Run `scaffold status` and present a clean summary
- Highlight the current phase, completed steps, and next eligible steps

**Step info**: When the user asks "what does <step> do?":
- Run `scaffold info <step>` and present the purpose, inputs, outputs, and dependencies

**Methodology switching**: When the user says "switch to MVP" or "change depth":
- Run `scaffold init --methodology <preset>` with appropriate flags

---

## Skill File Structure

Create the skill as: `skills/scaffold-runner/SKILL.md`

The SKILL.md file should have YAML frontmatter:
```yaml
---
name: scaffold-runner
description: Interactive scaffold CLI wrapper that surfaces decision points and manages pipeline execution
auto-activate:
  - when the user mentions "scaffold run" or "scaffold next" or "scaffold status"
  - when the user asks to run a pipeline step
  - when working in a project with a .scaffold/ directory
---
```

The body should contain:
1. **Context section** — Explain what scaffold is and how the CLI works (brief, for Claude's reference)
2. **Workflow instructions** — The step-by-step process described above (preview → extract decisions → ask user → execute → report)
3. **Decision point patterns** — Regex/patterns for identifying common decision points in assembled prompts
4. **Execution rules** — How to run the prompt content after decisions are resolved
5. **Error handling** — What to do when scaffold commands fail, when steps aren't eligible, when artifacts are missing

---

## Key Design Decisions

### Don't re-implement scaffold
The skill should USE the scaffold CLI, not replace it. Run `scaffold run`, `scaffold next`, `scaffold status` — don't try to parse pipeline steps or load knowledge directly.

### Preview before execute
Always preview the assembled prompt first (capture output without executing). This is what enables decision extraction. The assembled prompt is then executed as Claude's working instructions.

### Preserve the assembled prompt quality
The 7-section assembled prompt is carefully structured. The skill should execute it faithfully, with user decisions pre-filled. Don't summarize or truncate the prompt — Claude needs the full context.

### Handle the --auto flag
`scaffold run <step> --auto` outputs the prompt to stdout without interactive prompts. This is what the skill should capture. Without `--auto`, the CLI may prompt for input that Claude can't provide.

### Decision point caching
If the user has already specified preferences (e.g., "always use depth 3"), remember those for the session and don't re-ask. Use the methodology preset as the default.

---

## Testing the Skill

After creating the skill:

1. **Test decision surfacing** — In a project with `.scaffold/`, say "run scaffold create-prd" and verify the skill presents depth/methodology questions before executing.

2. **Test pipeline navigation** — Say "what's next?" and verify it runs `scaffold next` and presents results clearly.

3. **Test full lifecycle** — Run 2-3 steps in sequence and verify the skill tracks progress, shows status after each step, and suggests the next step.

4. **Test error handling** — Try to run a step that isn't eligible and verify the skill explains why and suggests alternatives.

5. **Test with existing preferences** — Set depth to 3 on the first step, verify it remembers for subsequent steps.

---

## What This Skill Should NOT Do

- **Don't bypass the CLI** — Always use `scaffold run`, never try to assemble prompts manually
- **Don't modify scaffold config** — The skill reads config, it doesn't write it (unless the user explicitly asks to change methodology)
- **Don't skip decision points** — Every user-facing question in the assembled prompt must be surfaced. Silently choosing defaults defeats the purpose.
- **Don't add extra steps** — The pipeline defines the steps. The skill executes them, it doesn't invent new ones.
- **Don't cache across sessions** — Decision preferences are per-session only. Each new Claude Code session starts fresh.

---

## Deliverables

1. `skills/scaffold-runner/SKILL.md` — The skill file
2. Update `README.md` — Add the skill to the installation instructions (optional skill users can enable)
3. Update `.claude-plugin/plugin.json` — Register the skill if needed for plugin distribution
4. Test the skill end-to-end in a real project

---

## Process

1. Read all referenced files before writing anything
2. Study the existing `skills/scaffold-pipeline/SKILL.md` to match the pattern
3. Create the skill file
4. Test by running `scaffold next` and `scaffold run <step>` in a project with `.scaffold/`
5. Iterate on decision point extraction — the patterns need to catch real questions from real assembled prompts
6. Update README and plugin manifest
7. Run `make check` to verify nothing is broken
