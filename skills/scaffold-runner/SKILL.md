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
| Skip optional steps | "Skip design system, I don't have a frontend" | Batch skip with `scaffold skip <step1> <step2> --reason "..."` |
| Methodology | "I'm using MVP" | Informs default recommendations |
| Batch mode | "Run the next 3 steps" | Execute sequentially, surface decisions for each |
| Compact status | User is mid-pipeline, only cares about remaining work | Default to `scaffold status --compact` |

When the user sets a preference, acknowledge it and apply it to subsequent steps. Don't ask about it again unless the context changes.

## Pipeline Navigation Commands

Respond to these natural language requests:

| User Says | Action |
|---|---|
| "What's next?" / "Next step" | Run `scaffold next`, present eligible steps |
| "Where am I?" / "Pipeline status" | Run `scaffold status`, present progress summary |
| "What does X do?" | Run `scaffold info <step>`, present purpose and dependencies |
| "Is X applicable?" / "Do I need X?" | Run `scaffold check <step>` to detect platform and brownfield status |
| "Set up memory" / "Configure AI memory" / "Add memory" | Run `scaffold run ai-memory-setup` — sets up modular rules, optional MCP memory server, and external context |
| "Set up testing" / "Add Playwright" / "Add Maestro" | Run `scaffold run add-e2e-testing` — auto-detects web/mobile and configures the right framework(s) |
| "Run multi-model review" / "Review stories with other models" | Run `scaffold run review-user-stories` at depth 5 (multi-model capabilities are now built into review-user-stories) |
| "Skip X" | Run `scaffold skip <step> --reason "<user's reason>"` |
| "Skip X, Y, and Z" | Run `scaffold skip <step1> <step2> <step3> --reason "<reason>"` |
| "What's left?" / "Show remaining" | Run `scaffold status --compact`, show only pending/in-progress steps |
| "Re-run X" / "Redo X" / "Go back to X" | Reset then re-run: `scaffold reset <step> --force && scaffold run <step>` |
| "Reset X" / "Reset X to pending" | Run `scaffold reset <step>`, confirm if completed |
| "Show the full pipeline" | Run `scaffold list`, present with status indicators |
| "Open the dashboard" | Run `scaffold dashboard` |
| "Switch to MVP" / "Change depth" | Run `scaffold init --methodology <preset>` |

### Re-running Steps

When the user wants to re-run a completed step (e.g., "re-run the PRD", "redo create-prd", "I want to update my user stories"):

1. **Reset the step to pending**: Run `scaffold reset <step> --force`
2. **Then run it**: Follow the normal Smart Scaffold Execution workflow (preview → extract decisions → ask user → execute)
3. The step will run in **update mode** — it detects the existing artifact and updates it rather than starting from scratch

This is useful when:
- The user wants to incorporate new requirements into an existing artifact
- A prior step was run at a shallow depth and the user wants to re-run at deeper depth
- The user modified upstream documents and wants downstream steps to reflect changes

### Skipping Steps

**Single skip:** `scaffold skip <step> --reason "reason"`

**Batch skip:** `scaffold skip <step1> <step2> <step3> --reason "reason"`

Use batch skip when the user wants to skip multiple related steps at once (e.g., "skip all the optional testing steps", "I don't have a frontend — skip design-system and add-e2e-testing"). This avoids running the command multiple times and gives a single summary of newly eligible steps.

When the user says "skip" without a reason, still pass `--reason` with a brief reason inferred from context (e.g., `--reason "no frontend"`, `--reason "using external CI"`). This aids team visibility in state.json.

If a batch skip partially fails (e.g., one step not found), the CLI skips the valid steps and reports errors for the rest. Exit code 2 indicates partial failure.

### Compact Status

When the user asks "what's left?", "show remaining steps", or is deep into the pipeline, use `scaffold status --compact` instead of the full status view. This:

- Shows a summary line with counts (completed, skipped, pending, in progress)
- Lists only pending and in-progress steps (hides completed/skipped)
- Keeps the output focused on what's actionable

Use the full `scaffold status` (without `--compact`) when the user asks for a complete overview or wants to see what was skipped.

### Depth-Aware Steps

Some steps behave significantly differently at higher depths. When running these steps, surface the depth choice as a decision point:

**`review-user-stories`** — The review step scales with depth:
- Depth 1-3: Claude-only multi-pass review (6 review passes)
- Depth 4: Adds requirements index (REQ-xxx IDs) and coverage matrix (coverage.json) for formal PRD traceability
- Depth 5: Adds multi-model dispatch to Codex/Gemini CLI for independent validation, with graceful fallback to Claude-only enhanced review if CLIs aren't available

When running `review-user-stories` at depth 5, check if `codex` or `gemini` CLI is available (`command -v codex`, `command -v gemini`). If neither is available, inform the user that the step will fall back to a Claude-only adversarial self-review — still valuable but less thorough than multi-model review.

**`ai-memory-setup`** — Three-tier AI memory configuration:
- Tier 1 (Modular Rules): Extracts conventions from coding-standards.md, tech-stack.md, git-workflow.md into path-scoped `.claude/rules/` files. Always recommended.
- Tier 2 (Persistent Memory): Configures MCP memory server (Engram/hmem/Claude-Mem), lifecycle hooks (PreCompact, Stop), and decision logging in `docs/decisions/`.
- Tier 3 (External Context): Adds library documentation server (Context7/Nia/Docfork) to prevent API hallucination. Only relevant for projects with external dependencies.

The step auto-detects installed MCP servers and presents tier choices as decision points. Brownfield detection: if `.claude/rules/` exists, enters update mode preserving user customizations.

**`add-e2e-testing`** — Unified E2E testing step that auto-detects the platform:
- Reads `docs/tech-stack.md` and `package.json` to determine web (Playwright), mobile (Maestro), or both
- Self-skips for backend-only projects with no frontend
- Detects brownfield (existing Playwright config or Maestro flows) and auto-enters update mode

Before running this step, you can use `scaffold check add-e2e-testing` to preview what it will detect without executing.

### Applicability Checking

Use `scaffold check <step>` to check if a conditional step applies to the current project:

```bash
scaffold check add-e2e-testing
# → Applicable: yes | Platform: web | Brownfield: no | Mode: fresh
```

This is useful when the user asks "Do I need this step?" or when previewing which optional steps apply before running them.

### Multi-Model Review at Depth 4-5

All review and validation steps now support independent multi-model validation at depth 4-5 using Codex and/or Gemini CLIs. The `multi-model-dispatch` skill documents the correct invocation patterns:

- **Codex**: `codex exec -s read-only --ephemeral "prompt" 2>/dev/null` (NOT bare `codex`)
- **Gemini**: `gemini -p "prompt" --output-format json --approval-mode yolo 2>/dev/null`

When running a review step at depth 4-5:
1. Check CLI availability before dispatching
2. If both available, run dual-model review for highest quality
3. If one available, run single-model external review
4. If neither available, fall back to Claude-only adversarial self-review

The runner should surface the depth choice as a decision point for review steps, noting that depth 4-5 enables multi-model validation if CLIs are available.

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
