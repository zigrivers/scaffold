## Core Workflow: Smart Scaffold Execution

When the user wants to run a scaffold step, use the lifecycle below:

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

### Step 3: Resolve Decisions From Context

Read explicit questions and approval requirements in the assembled prompt. Check
the user's current request, approved plan, session preferences, repository policy,
and recorded decisions before asking. Reuse answers that still apply.

An unresolved product, scope, or consequential architecture choice needs the
user's decision. Routine implementation choices within the approved scope can be
made from repository conventions and evidence. Words such as "framework",
"optional", or "choose" are cues to inspect context, not automatic questions.
Keep explicit repository or prompt approval requirements, including approval of
an adoption plan key and any requested per-step confirmation mode.

### Step 4: Ask Only for Missing Decisions

If a decision remains, present concrete options, a recommendation, and its impact.
Group related questions within the available question tool's limits, or ask in
plain text when no question tool is available. Do the independent work first;
pause only the action that depends on the answer. If the current request or an
existing approval already covers it, proceed without renewed permission.

### Step 5: Execute the Prompt

Now execute the assembled prompt as your working instructions. This means:

1. Read the assembled prompt output from Step 2
2. Follow its instructions section by section
3. Where the prompt says "ask the user about X", substitute the answer from Step 4
4. Where the prompt says "use AskUserQuestionTool", use the applicable answer from the request, prior approval, or Step 4 instead
5. Perform all file operations, artifact creation, and validation the prompt describes

**Critical: Execute the FULL prompt faithfully.** Don't skip sections, don't summarize, don't take shortcuts. The assembled prompt was carefully constructed with knowledge base content and project context — every section matters.

### Step 6: Post-Execution

After the step completes:

1. **Mark completion** — If the step was run via `scaffold run`, it's auto-tracked. If the prompt was captured with `scaffold run --auto` and executed manually, mark it complete:
   ```bash
   scaffold complete <step>
   ```
   Then verify with `scaffold status`.

2. **Show what's next** — Run:
   ```bash
   scaffold next
   ```

3. **Continue within the requested scope** — In an authorized batch, proceed to the next eligible step. For a single-step request, report completion and the next eligible step; do not expand the scope automatically.

## Stateless Step Execution

Build phase steps (phase 15) and tools are **stateless** — they don't track completion state. When executing a stateless step, modify the Smart Scaffold Execution workflow:

### Modified Post-Execution (replaces Step 6 for stateless steps)

After executing a stateless step:

1. **Skip** `scaffold complete <step>` — stateless steps have no completion state
2. **Skip** "show what's next" — build steps are always available
3. **Instead**: Show a brief execution summary. Continue only when another build step or tool is already in the requested scope.

### Resume Step Visibility

`single-agent-resume` and `multi-agent-resume` are conditionally shown — only offer them when evidence of prior agent activity exists:
- Feature branches (e.g., `bd-*` branches) in git
- In-progress tasks (Beads `bd list` shows in_progress, or implementation plan tasks marked started)
- Open PRs from previous agent work

If no prior activity is detected, suggest `single-agent-start` or `multi-agent-start` instead.

## Tool Execution

Tools (version-bump, release, version, update, dashboard, prompt-pipeline, session-analyzer, review-code, review-pr, post-implementation-review) are utility commands orthogonal to the pipeline.

### Differences from Pipeline Steps

- **No eligibility check** — tools are always available, regardless of pipeline progress
- **No state tracking** — tools don't appear in `scaffold next` or `scaffold status`
- **Argument passthrough** — tools support CLI arguments: `scaffold run release --dry-run`, `scaffold run version-bump patch`

### Tool Execution Flow

1. **Skip eligibility** — don't run `scaffold next` to check
2. **Preview** — `scaffold run <tool> --auto 2>&1` (same as pipeline steps)
3. **Extract decisions** — same process as pipeline steps
4. **Execute** — follow the assembled prompt faithfully
5. **No completion** — skip `scaffold complete`, skip "what's next"

### Accessing Tools

- `scaffold run <tool-name>` — run a specific tool
- `scaffold list --section tools` — show available tools (compact)
- `scaffold list --section tools --verbose` — show with argument hints
- `scaffold list --section tools --format json` — machine-readable output

## Session Preferences

Track these preferences within the current session to avoid re-asking:

| Preference | Example | How to Track |
|---|---|---|
| Default depth | "Use depth 3 for everything" | Remember and apply to all steps |
| Skip optional steps | "Skip design system, I don't have a frontend" | Batch skip with `scaffold skip <step1> <step2> --reason "..."` |
| Methodology | "I'm using MVP" | Informs default recommendations |
| Batch mode | "Run the next 3 steps" | Execute sequentially, surface decisions for each |
| Compact status | User is mid-pipeline, only cares about remaining work | Default to `scaffold status --compact` |
| Pre-push review | "Run review-code before committing and pushing" | Remember to insert `scaffold run review-code` before `git push` in build flows |

When the user sets a preference, acknowledge it and apply it to subsequent steps. Don't ask about it again unless the context changes.
