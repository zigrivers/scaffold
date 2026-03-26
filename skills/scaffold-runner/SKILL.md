---
name: scaffold-runner
description: Interactive wrapper for the scaffold CLI that surfaces decision points, manages pipeline execution, and provides a seamless scaffold workflow inside Claude Code.
---

# Scaffold Runner

This skill provides an intelligent interactive layer between the user and the `scaffold` CLI. It ensures that decision points embedded in scaffold prompts are surfaced to the user before execution, and manages the full step lifecycle.

## When This Skill Activates

- User says "run scaffold <step>", "scaffold <step>", or "run the next scaffold step"
- User asks "what's next?", "where am I in the pipeline?", or "scaffold status"
- User asks to run any pipeline step by name (e.g., "create the PRD", "set up testing")
- Working in a project with a `.scaffold/` directory

## Core Workflow: Smart Scaffold Execution

When the user wants to run a scaffold step, follow this exact process:

### Step 1: Check Eligibility

Run `scaffold next` to see what's eligible. If the user named a specific step, verify it appears in the eligible list. If it's not eligible, explain which dependencies are blocking it and suggest the eligible steps instead.

```bash
scaffold next
```

### Step 2: Preview the Assembled Prompt

Capture the assembled prompt WITHOUT executing it yet:

```bash
scaffold run <step> --auto 2>&1
```

Save the output. This is the full 7-section prompt that includes step instructions, knowledge base content, project context, and methodology guidance. **Do not execute the prompt content yet.**

### Step 3: Extract Decision Points

Scan the assembled prompt for user-facing questions. Look for these patterns:

**Explicit question markers:**
- Lines containing `AskUserQuestionTool` or `AskUserQuestion`
- Lines containing "ask the user" or "ask me"
- Lines containing "Use AskUserQuestionTool for these decisions:"

**Common decision categories:**
- **Depth/thoroughness**: "depth level", "how thorough", "exhaustive vs focused"
- **Strictness**: "strict", "moderate", "lenient", "strictness level"
- **Optional sections**: "include [X]?", "optional", "skip if not needed"
- **Architecture choices**: "which pattern", "choose between", "select"
- **Technology preferences**: "framework", "library", "tool choice"
- **Scope decisions**: "MVP or full", "include [feature]?", "defer or include"

**Decision extraction rules:**
- Group related questions together (don't ask one at a time)
- Provide the options mentioned in the prompt text
- Include your recommendation based on the project context
- If the prompt says "use AskUserQuestionTool for these decisions:" followed by a bulleted list, extract each bullet as a separate question

### Step 4: Surface Decisions to the User

Present all extracted decision points to the user using AskUserQuestion. Group them into a single call with up to 4 questions. If there are more than 4, batch them into multiple calls.

For each decision:
- Frame it as a clear choice with concrete options
- Include the default/recommended option based on the project's methodology preset
- Add brief context about the impact of each choice

**Example presentation:**
```
Before running this step, I need a few decisions:

1. Architecture depth: Full specification with detailed data flows, or high-level
   component overview? [Full spec (recommended for depth 5) / High-level overview]

2. Include performance benchmarks section? [Yes / No — skip for MVP]

3. Error handling strategy: Custom error classes with codes, or standard
   try/catch with logging? [Custom classes (recommended) / Standard try/catch]
```

If the assembled prompt has NO decision points (the step is fully automated), skip this step and proceed directly to execution.

### Step 5: Execute the Prompt

Now execute the assembled prompt as your working instructions. This means:

1. Read the assembled prompt output from Step 2
2. Follow its instructions section by section
3. Where the prompt says "ask the user about X", substitute the answer from Step 4
4. Where the prompt says "use AskUserQuestionTool", use the pre-collected answer instead
5. Perform all file operations, artifact creation, and validation the prompt describes

**Critical: Execute the FULL prompt faithfully.** Don't skip sections, don't summarize, don't take shortcuts. The assembled prompt was carefully constructed with knowledge base content and project context — every section matters.

### Step 6: Post-Execution

After the step completes:

1. **Mark completion** — The scaffold CLI tracks this. Run:
   ```bash
   scaffold status
   ```

2. **Show what's next** — Run:
   ```bash
   scaffold next
   ```

3. **Offer continuation** — Tell the user:
   ```
   Step complete. Next eligible: scaffold run <next-step>
   Want me to continue with the next step?
   ```

## Session Preferences

Track these preferences within the current session to avoid re-asking:

| Preference | Example | How to Track |
|---|---|---|
| Default depth | "Use depth 3 for everything" | Remember and apply to all steps |
| Skip optional steps | "Skip design system, I don't have a frontend" | Remember and auto-skip |
| Methodology | "I'm using MVP" | Informs default recommendations |
| Batch mode | "Run the next 3 steps" | Execute sequentially, surface decisions for each |

When the user sets a preference, acknowledge it and apply it to subsequent steps. Don't ask about it again unless the context changes.

## Pipeline Navigation Commands

Respond to these natural language requests:

| User Says | Action |
|---|---|
| "What's next?" / "Next step" | Run `scaffold next`, present eligible steps |
| "Where am I?" / "Pipeline status" | Run `scaffold status`, present progress summary |
| "What does X do?" | Run `scaffold info <step>`, present purpose and dependencies |
| "Skip X" | Run `scaffold skip <step> --reason "<user's reason>"` |
| "Go back to X" | Run `scaffold reset <step>`, explain implications |
| "Show the full pipeline" | Run `scaffold list`, present with status indicators |
| "Open the dashboard" | Run `scaffold dashboard` |
| "Switch to MVP" / "Change depth" | Run `scaffold init --methodology <preset>` |

## Error Handling

| Situation | Response |
|---|---|
| Step not eligible | Show blocking dependencies. Suggest running them first or skipping with `scaffold skip`. |
| scaffold CLI not installed | Tell user: "Install with `npm install -g @zigrivers/scaffold`" |
| No .scaffold/ directory | Tell user: "Run `scaffold init` to initialize this project" |
| Step fails during execution | Show the error, suggest checking docs/prerequisites, offer to retry |
| Assembled prompt is empty | The step may not have knowledge entries. Fall back to running the command file directly via `/scaffold:<step>` |

## What This Skill Does NOT Do

- **Does not bypass the CLI** — always runs `scaffold run`, `scaffold next`, `scaffold status`
- **Does not modify .scaffold/config.json** — reads only (unless user explicitly asks to change methodology)
- **Does not invent pipeline steps** — the pipeline defines what runs; this skill executes it
- **Does not suppress questions** — every decision point gets surfaced. Silent defaults defeat the purpose.
- **Does not cache preferences across sessions** — each Claude Code session starts fresh
