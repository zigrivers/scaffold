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
- User asks to run multiple steps: "run all reviews", "run phases 5-8", "finish the pipeline", "run the next 5 steps"
- User asks to re-run groups: "re-run all reviews", "redo quality gates", "re-run from user-stories onward"
- User says "start building", "begin implementation", "run agent", "start agent"
- User asks about tools: "bump version", "create a release", "show version"
- User says "what can I build?" or "what tools are available?"
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

1. **Mark completion** — If the step was run via `scaffold run`, it's auto-tracked. If the prompt was captured with `scaffold run --auto` and executed manually, mark it complete:
   ```bash
   scaffold complete <step>
   ```
   Then verify with `scaffold status`.

2. **Show what's next** — Run:
   ```bash
   scaffold next
   ```

3. **Offer continuation** — Tell the user:
   ```
   Step complete. Next eligible: scaffold run <next-step>
   Want me to continue with the next step?
   ```

## Stateless Step Execution

Build phase steps (phase 15) and tools are **stateless** — they don't track completion state. When executing a stateless step, modify the Smart Scaffold Execution workflow:

### Modified Post-Execution (replaces Step 6 for stateless steps)

After executing a stateless step:

1. **Skip** `scaffold complete <step>` — stateless steps have no completion state
2. **Skip** "show what's next" — build steps are always available
3. **Instead**: Show a brief execution summary and offer to run another build step or tool:
   ```
   Step executed. Build phase steps are always available for re-use.
   Run another? single-agent-start | quick-task | new-enhancement | ...
   ```

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

## Tool Listing

When the user asks "what tools are available?", "what can I build?", or "show me the tools":

1. Run `scaffold list --section tools --format json`
2. Parse the JSON: `data.tools.build` (build phase steps) and `data.tools.utility` (utility tools)
3. Render as two grouped sections:

**Build Phase (Phase 15)**
> These are stateless pipeline steps — they appear in `scaffold next` once Phase 14 is complete and can be run repeatedly.

| Command | When to Use |
|---------|-------------|
| `scaffold run single-agent-start` | Start the autonomous TDD implementation loop — Claude picks up tasks and builds |
| `scaffold run single-agent-resume` | Resume where you left off after closing Claude Code |
| `scaffold run multi-agent-start` | Start parallel implementation with multiple agents in worktrees |
| `scaffold run multi-agent-resume` | Resume parallel agent work after a break |
| `scaffold run quick-task` | Create a focused task for a bug fix, refactor, or small improvement |
| `scaffold run new-enhancement` | Add a new feature to an already-scaffolded project |

**Utility Tools**
> These are orthogonal to the pipeline — usable at any time, not tied to pipeline state.

| Command | When to Use |
|---------|-------------|
| `scaffold run version-bump` | Mark a milestone with a version number without the full release ceremony |
| `scaffold run release` | Run the target project's release ceremony — changelog plus whatever release artifacts that project defines. Supports `--dry-run`, `current`, and `rollback` |
| `scaffold run version` | Show the current scaffold version |
| `scaffold run update` | Update scaffold to the latest version |
| `scaffold run dashboard` | Open a visual progress dashboard in your browser |
| `scaffold run prompt-pipeline` | Print the full pipeline reference table |
| `scaffold run review-code` | Run all 3 code review channels on local code before commit or push |
| `scaffold run review-pr` | Run all 3 code review channels (Codex CLI, Gemini CLI, Superpowers) on a PR |
| `scaffold run post-implementation-review` | Full 3-channel codebase review after an AI agent completes all tasks |
| `scaffold run session-analyzer` | Analyze Claude Code session logs for patterns and insights |

**Display rules:**
- The tool list comes from CLI output (always complete and up-to-date)
- The "When to Use" column comes from the table above (stable prose)
- If the CLI returns a tool not in the table above, display it using its `description` field from the CLI output — graceful degradation
- For verbose detail (`--verbose`), call `scaffold list --section tools --verbose --format json` and add an Arguments column using the `argumentHint` values

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

## Pipeline Navigation Commands

Respond to these natural language requests:

| User Says | Action |
|---|---|
| "What's next?" / "Next step" | Run `scaffold next`, present eligible steps |
| "Where am I?" / "Pipeline status" | Run `scaffold status`, present progress summary |
| "What does X do?" | Run `scaffold info <step>`, present purpose, summary, and dependencies |
| "Is X applicable?" / "Do I need X?" | Run `scaffold check <step>` to detect platform and brownfield status |
| "Set up memory" / "Configure AI memory" / "Add memory" | Run `scaffold run ai-memory-setup` — sets up modular rules, optional MCP memory server, and external context |
| "Set up testing" / "Add Playwright" / "Add Maestro" | Run `scaffold run add-e2e-testing` — auto-detects web/mobile and configures the right framework(s) |
| "Run multi-model review" / "Review X with all three models" | Route by target — see [Multi-Model Review Routing](#multi-model-review-routing) |
| "Review stories with other models" | Run `scaffold run review-user-stories` at depth 5 (multi-model capabilities are built into review-user-stories) |
| "Skip X" | Run `scaffold skip <step> --reason "<user's reason>"` |
| "Skip X, Y, and Z" | Run `scaffold skip <step1> <step2> <step3> --reason "<reason>"` |
| "What's left?" / "Show remaining" | Run `scaffold status --compact`, show only pending/in-progress steps |
| "Re-run X" / "Redo X" / "Go back to X" | Reset then re-run: `scaffold reset <step> --force && scaffold run <step>` |
| "Re-run all reviews" / "Redo quality gates" | Batch re-run — see [Batch Execution](#batch-execution) |
| "Rework phases 1-5" / "Rework through phase 5" | `scaffold rework --through 5` — see [Rework Mode](#rework-mode) |
| "Continue rework" / "Resume rework" | `scaffold rework --resume` — see [Rework Mode](#rework-mode) |
| "Run phases 5-8" / "Run modeling through specs" | Batch run by phase range — see [Batch Execution](#batch-execution) |
| "Run the next N steps" / "Finish the pipeline" | Batch forward run — see [Batch Execution](#batch-execution) |
| "Continue the batch" / "Resume" | Resume an interrupted batch from where it stopped |
| "Mark X as done" / "Complete X" | Run `scaffold complete <step>` — marks a step as completed when executed outside `scaffold run` |
| "Reset X" / "Reset X to pending" | Run `scaffold reset <step>`, confirm if completed |
| "Show the full pipeline" | Run `scaffold list`, present with status indicators |
| "Open the dashboard" | Run `scaffold dashboard` |
| "Switch to MVP" / "Change depth" | Run `scaffold init --methodology <preset>` |
| "Start building" / "Begin implementation" | `scaffold run single-agent-start` |
| "Start multi-agent" / "Set up agents" | `scaffold run multi-agent-start <agent-name>` |
| "Quick task" / "Bug fix" / "Small fix" | `scaffold run quick-task <description>` |
| "New feature" / "Add enhancement" | `scaffold run new-enhancement <description>` |
| "Bump version" / "Version bump" | `scaffold run version-bump` |
| "Create release" / "Release" | `scaffold run release` |
| "What tools are available?" | Run `scaffold list --section tools --format json`, render as two-section grouped display — see [Tool Listing](#tool-listing) |
| "Show version" | `scaffold run version` |
| "Review local code" / "Review before push" / "Review before committing and pushing" | `scaffold run review-code` |
| "Review PR" / "Run code review" | `scaffold run review-pr` |

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
- Tier 2 (Persistent Memory): Configures MCP Knowledge Graph server (`@modelcontextprotocol/server-memory`), lifecycle hooks (PreCompact, Stop), and decision logging in `docs/decisions/`.
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

### Multi-Model Review Routing

When the user asks for a "multi-model review", "review this with all three models",
"run MMR on X", or similar — **do not assume the target is a PR**. Route based on
what the user is pointing at:

| Target | Command |
|---|---|
| GitHub PR (explicit number or current branch's PR) | `scaffold run review-pr [<PR#>]` |
| Local uncommitted / staged code, before commit or push | `scaffold run review-code` |
| A specific file or document (e.g. `docs/foo.md`) | `mmr review --diff <path> --sync --format json` |
| A branch diff against main (or another ref) | `mmr review --base <ref> --head <ref> --sync --format json` |
| A diff piped from another command | `mmr review --diff - --sync --format json` (stdin) |
| A user-story review specifically at depth 5 | `scaffold run review-user-stories` |

If the user's target is ambiguous ("review this with MMR"), ask once which of
the above applies — don't default to `review-pr` just because it's the most
common entry point. Doc reviews and uncommitted-work reviews are equally
first-class.

Pass `--focus "..."` to MMR when the user describes what to evaluate (clarity,
completeness, security, performance, etc.). See the `mmr` skill for all input
modes and flags.

### Multi-Model Review at Depth 4-5

All review and validation steps now support independent multi-model validation at depth 4-5 using Codex and/or Gemini CLIs. The `multi-model-dispatch` skill documents the correct invocation patterns:

- **Codex**: `codex exec --skip-git-repo-check -s read-only --ephemeral "prompt" 2>/dev/null` (NOT bare `codex`)
- **Gemini**: `NO_BROWSER=true gemini -p "prompt" --output-format json --approval-mode yolo 2>/dev/null`

**`NO_BROWSER=true` is required for all Gemini invocations** from Claude Code's Bash tool. Without it, Gemini's child process relaunch shows a consent prompt that hangs in non-TTY shells.

**Auth verification is mandatory before dispatch.** CLI tokens expire mid-session. Before running any review at depth 4-5:
1. Check Codex auth: `codex login status`
2. Check Gemini auth: `NO_BROWSER=true gemini -p "respond with ok" -o json` (exit 41 = auth failure)
3. If auth fails, tell the user to re-authenticate: `! gemini -p "hello"` or `! codex login` (the `!` prefix runs it interactively with TTY access)
4. **Never silently skip a CLI due to auth failure** — surface it to the user

When running a review step at depth 4-5:
1. Check CLI availability before dispatching
2. If both available, run dual-model review for highest quality
3. If one available, run single-model external review
4. If neither available, fall back to Claude-only adversarial self-review

The runner should surface the depth choice as a decision point for review steps, noting that depth 4-5 enables multi-model validation if CLIs are available.

## Batch Execution

When the user asks to run multiple steps at once, the runner resolves the request into an ordered step list and executes them sequentially, continuing autonomously between steps. It only stops when a step produces a blocker that requires human intervention.

### Batch Intent Resolution

Map natural language requests to concrete step lists using `scaffold status` output and phase/name matching:

| User Says | Resolution Strategy |
|---|---|
| "Re-run all reviews" | All steps whose name starts with `review-` that are `completed` → reset + re-run each |
| "Run phases 5-8" / "Run modeling through specification" | All enabled steps in the named phases, in pipeline order |
| "Run remaining planning steps" | All `pending` steps in the `planning` phase |
| "Run everything from domain-modeling onward" | All enabled steps with pipeline order >= domain-modeling's order |
| "Run the next 5 steps" | Take the next 5 from `scaffold next`, execute in order |
| "Run all pending steps" | Loop: `scaffold next` → execute → repeat until nothing eligible |
| "Re-run all of phase 9" / "Redo quality gates" | All steps in the `quality` phase → reset + re-run each |
| "Run validation checks" | All steps in the `validation` phase |
| "Finish the pipeline" | All remaining pending steps, in dependency order |

**Phase name reference** (for resolving phase-based requests):

| Phase Name | Also Known As | Description | Steps |
|---|---|---|---|
| vision | Product Vision | Transforms your idea into a strategic vision document covering who it's for, what makes it different, and what success looks like. | create-vision, review-vision, innovate-vision |
| pre | Product Definition | Translates your vision into a PRD with features, personas, and success criteria, then breaks it into user stories with testable acceptance criteria. | create-prd, review-prd, innovate-prd, user-stories, review-user-stories, innovate-user-stories |
| foundation | Project Foundation | Researches and documents technology choices, creates coding standards with linter configs, defines testing strategy, and designs directory layout for parallel agent work. | beads, tech-stack, coding-standards, tdd, project-structure |
| environment | Dev Environment | Sets up local dev environment, design system (web only), git workflow with CI and worktree scripts, automated PR review, and AI memory persistence. | dev-env-setup, design-system, git-workflow, automated-pr-review, ai-memory-setup |
| integration | Testing Integration | Auto-detects platform and configures E2E testing — Playwright for web, Maestro for mobile. Skips for backend-only projects. | add-e2e-testing |
| modeling | Domain Modeling | Identifies core concepts (entities, relationships, invariants, events) and establishes a shared vocabulary across all docs and code. | domain-modeling, review-domain-modeling |
| decisions | Architecture Decisions | Documents every significant design decision with alternatives considered and consequences, so future contributors know why things are the way they are. | adrs, review-adrs |
| architecture | System Architecture | Designs the system blueprint — components, data flows, module structure, and extension points that implementation will follow. | system-architecture, review-architecture |
| specification | Specifications | Creates interface specs for each system layer: database schema with constraints, API contracts with endpoints and error codes, UX flows with accessibility. Each conditional. | database-schema, review-database, api-contracts, review-api, ux-spec, review-ux |
| quality | Quality Gates | Reviews testing strategy, generates test skeletons from acceptance criteria, creates eval checks, designs deployment pipeline, and conducts OWASP security review. | review-testing, story-tests, create-evals, operations, review-operations, security, review-security |
| parity | Platform Parity | Audits documentation for platform-specific gaps across target platforms. Skips for single-platform projects. | platform-parity-review |
| consolidation | Consolidation | Optimizes {{INSTRUCTIONS_FILE}} under 200 lines with critical patterns front-loaded, then audits all workflow docs for consistency. | claude-md-optimization, workflow-audit |
| planning | Planning | Decomposes stories and architecture into concrete tasks scoped to ~150 lines of code and 3 files max, with clear acceptance criteria. | implementation-plan, implementation-plan-review |
| validation | Validation | Seven cross-cutting audits catching scope creep, dependency cycles, implementability ambiguities, traceability gaps, naming drift, and broken handoffs. | cross-phase-consistency, traceability-matrix, decision-completeness, critical-path-walkthrough, implementability-dry-run, dependency-graph-validation, scope-creep-check |
| finalization | Finalization | Applies validation findings, freezes docs, creates developer onboarding guide, and writes the implementation playbook agents follow during every coding session. | apply-fixes-and-freeze, developer-onboarding-guide, implementation-playbook |
| build | Build | Stateless execution steps: TDD implementation loop (single/multi-agent), session resume, quick tasks, and new feature enhancements. | single-agent-start, single-agent-resume, multi-agent-start, multi-agent-resume, quick-task, new-enhancement |

### Resolution Process

1. **Get current state**: Run `scaffold status` to see all step statuses
2. **Identify target steps**: Based on the user's request, build the ordered list:
   - For phase-based: filter by phase name(s), keep pipeline order
   - For name-based: match step names (prefix matching for "all reviews" → `review-*`)
   - For re-runs: filter to `completed` steps, plan reset before each
   - For forward runs: filter to `pending` or eligible steps
3. **Check for disabled/skipped steps**: Exclude steps that are `skipped` or disabled by methodology unless the user explicitly names them
4. **Check eligibility**: For each step, verify dependencies are met. If a step has unmet dependencies AND those dependencies are in the batch list (earlier), it's fine — they'll be completed first. If dependencies are unmet and NOT in the batch, flag it.
5. **Present the plan**: Show the user what will be executed:

```
Batch plan: 7 steps to execute sequentially

  1. ○ review-testing (pending → run)
  2. ○ create-evals (pending → run)
  3. ○ operations (pending → run)
  4. ○ review-operations (pending → run)
  5. ○ security (pending → run)
  6. ○ review-security (pending → run)
  7. ✓ review-architecture (completed → reset + re-run)

Session preferences: depth 4, carry forward decisions
Estimated: autonomous execution, stops only on blockers

Proceed? [Yes / Yes, but ask me before each step / Modify list]
```

6. **Get confirmation**: Wait for the user to approve the plan before starting execution.

### Execution Protocol

For each step in the batch:

#### A. Pre-Step

1. **Report progress**: Use the step's summary from `scaffold info <step>` for context: `"Step 3/7: operations — Designs your deployment pipeline, defines monitoring metrics with alert thresholds, and writes incident response procedures."`
2. **If re-run**: Reset the step first: `scaffold reset <step> --force`
3. **Check eligibility**: Run `scaffold next` and verify the step is eligible. If not, report the blocker and either:
   - Wait for user input (if the blocker is external)
   - Skip this step and continue (if the user pre-approved skipping blockers)

#### B. Execution

4. **Capture prompt**: `scaffold run <step> --auto 2>&1`
5. **Extract decisions**: Scan for decision points (same as single-step workflow)
6. **Apply session preferences**: If the user already set depth, strictness, or other preferences earlier in the batch (or in session preferences), substitute those answers without re-asking
7. **Surface NEW decisions only**: If this step has decision points not covered by session preferences, ask the user. Group up to 4 questions per call.
8. **Execute the prompt**: Follow the assembled prompt faithfully

#### C. Post-Step

9. **Mark completion**: `scaffold complete <step>`
10. **Brief status report**: One-line summary of what was produced:
    ```
    ✓ operations complete — created docs/operations-runbook.md
    ```
11. **Check for issues**: If the step surfaced warnings, unresolved questions, or quality concerns — report them briefly but **continue to the next step** unless they are blockers.

#### D. Continue or Stop

**Continue automatically when:**
- Step completed successfully
- Step produced warnings or non-critical issues (report them, keep going)
- Step produced artifacts that downstream steps need (they're on disk now)

**Stop and ask the user when:**
- Step failed with an error (CLI error, missing file, broken prerequisite)
- Step requires a decision that can't be resolved from session preferences
- Step produced a critical finding that changes the batch plan (e.g., "the PRD is missing a key requirement that affects all downstream work")
- The user asked for "ask me before each step" mode

### Decision Carry-Forward

Within a batch, decisions made for early steps carry forward to later steps:

| Decision | Scope | How It Carries |
|---|---|---|
| Depth level | All steps | "Use depth 4" applies to every step in the batch |
| Strictness | All review steps | "Be strict" applies to all reviews |
| Optional sections | Per-step | "Include performance benchmarks" applies only to the step where asked |
| Technology choices | All steps | "Use PostgreSQL" remembered for all steps that ask about DB |
| Skip patterns | All steps | "Skip frontend sections" applied wherever relevant |

When a new step has a decision point that matches a carried-forward preference, substitute the answer silently. Only surface the decision if it's genuinely new or if context has changed (e.g., a previous step's output contradicts an earlier decision).

### Batch Summary

After all steps complete (or the batch is interrupted), present a summary:

```
Batch complete: 6/7 steps executed

  ✓ review-testing — reviewed TDD strategy (2 findings, both fixed)
  ✓ create-evals — generated 12 eval checks
  ✓ operations — created operations runbook
  ✓ review-operations — reviewed operations (1 P1 finding, fixed)
  ✓ security — created security review
  ✗ review-security — STOPPED: Codex CLI auth expired (needs: ! codex login)
  ○ review-architecture — not reached

Issues requiring attention:
  1. review-security blocked on Codex auth — run `! codex login` to fix, then "continue batch"

Next eligible after batch: cross-phase-consistency, traceability-matrix
```

### Resuming an Interrupted Batch

If the batch was interrupted (blocker, user stopped it, session ended), the user can resume:

| User Says | Action |
|---|---|
| "Continue the batch" / "Resume" | Pick up from where the batch stopped, re-check eligibility |
| "Skip that step and continue" | Skip the blocked step, continue with the next |
| "Stop the batch" | End batch execution, show summary of what completed |
| "Restart the batch" | Re-run the entire original batch plan from the beginning |

To resume, re-read the batch plan (kept in conversation context) and find the first incomplete step. Check eligibility and continue from there.

### Batch + Re-run Patterns

Common batch patterns for re-running groups of steps:

**"Re-run all reviews"** — Useful when upstream docs changed:
```
Steps: review-prd, review-user-stories, review-domain-modeling, review-adrs,
       review-architecture, review-database, review-api, review-ux,
       review-testing, review-operations, review-security,
       implementation-plan-review
Action: reset each → re-run in pipeline order
Note: Each runs in update mode (detects existing artifact)
```

**"Re-run from user-stories onward"** — Useful when PRD changed significantly:
```
Steps: All steps with order >= user-stories, filtered to completed/pending
Action: reset completed ones → run all in pipeline order
Warning: This is a large batch — confirm with user
```

**"Run all validation checks"** — Useful before implementation:
```
Steps: cross-phase-consistency, traceability-matrix, decision-completeness,
       critical-path-walkthrough, implementability-dry-run,
       dependency-graph-validation, scope-creep-check
Action: These are independent (no deps between them) — run sequentially
Note: These are quick, low-decision steps — usually fully autonomous
```

## Rework Mode

Rework mode enables systematic re-execution of entire phases for depth improvement or quality cleanup. It uses a persistent session file (`.scaffold/rework.json`) that survives context resets.

### Detection

On activation, check for an active rework session:

```bash
cat .scaffold/rework.json 2>/dev/null
```

If present, enter rework mode automatically and show status: "Active rework: 15/23 steps completed, currently in Phase 3".

### Natural Language Triggers

| User Says | Action |
|---|---|
| "rework phases 1-5" | `scaffold rework --through 5` → enter rework mode |
| "rework everything" | `scaffold rework` (requires --phases or --through flag) |
| "rework phases 1-3 excluding 2" | `scaffold rework --through 3 --exclude 2` |
| "continue rework" / "resume rework" | `scaffold rework --resume` → continue from where it stopped |
| "stop rework" / "cancel rework" | `scaffold rework --clear` |
| "rework status" | Read `.scaffold/rework.json`, show progress |

### Creating a Rework Session

When the user requests a rework:

1. Run `scaffold rework --phases <list> --auto --format json` (or `--through N`)
2. The CLI creates `.scaffold/rework.json` with the execution plan and resets selected steps in state.json
3. Show the plan summary: step count, phases, depth

### Executing Rework Steps

For each step in the rework session:

1. Read the current rework session: `scaffold rework --resume --format json`
2. Identify the next pending step from the session
3. **If config.fix is true and step name starts with `review-`**: Add auto-fix instruction
   ```bash
   scaffold run <step> --auto --instructions "Apply fixes directly to the reviewed artifact instead of just listing issues. Summarize what you changed." 2>&1
   ```
4. **Otherwise**: Run normally
   ```bash
   scaffold run <step> --auto 2>&1
   ```
5. Follow the normal Smart Scaffold Execution workflow (preview → extract decisions → execute)
6. After completion:
   ```bash
   scaffold rework --advance <step>    # Update rework session
   scaffold complete <step>             # Update pipeline state
   ```

### Fresh Mode

If the rework config has `fresh: true`, delete the existing artifact before running the step:
- Read the step's `produces` paths from the assembled prompt metadata
- Delete those files before executing the step
- The step will run in fresh mode (no existing artifact detected)

### Phase Boundary Pauses

When `config.auto` is false (the default):
- After completing the last step in a phase, pause execution
- Show a phase summary (use the phase description from the reference table for context):
  ```
  Phase 1 (Product Definition) complete: 3/3 steps
  Translates your vision into a PRD with features, personas, and success criteria,
  then breaks it into user stories with testable acceptance criteria.
    ✓ create-prd — updated docs/plan.md
    ✓ review-prd — 2 issues found and fixed
    ✓ innovate-prd — added competitive analysis

  Next: Phase 2 (Project Foundation) — Researches and documents technology choices,
  creates coding standards with linter configs, defines testing strategy, and designs
  directory layout for parallel agent work.

  Continue? [Yes / Stop here]
  ```
- Wait for user confirmation before proceeding to the next phase

When `config.auto` is true, skip pauses and continue through all steps.

### Completion

When `scaffold rework --advance` reports all steps done (returns `all_done: true` in JSON):
1. Show the full rework summary (similar to batch summary)
2. The session file is automatically cleaned up by the CLI
3. Show overall pipeline status via `scaffold status`

## Error Handling

| Situation | Response |
|---|---|
| Step not eligible | Show blocking dependencies. Suggest running them first or skipping with `scaffold skip`. |
| scaffold CLI not installed | Tell user: "Install with `npm install -g @zigrivers/scaffold`" |
| No .scaffold/ directory | Tell user: "Run `scaffold init` to initialize this project" |
| Step fails during execution | Show the error, suggest checking docs/prerequisites, offer to retry |
| Assembled prompt is empty | The step may not have knowledge entries. Fall back to running the command file directly via `/scaffold:<step>` |
| Batch step fails | Report the failure, ask whether to skip and continue or stop the batch |
| Batch blocker (auth, missing input) | Stop batch, report the issue, offer recovery path, allow "continue batch" after fix |

## What This Skill Does NOT Do

- **Does not bypass the CLI** — always runs `scaffold run`, `scaffold next`, `scaffold status`
- **Does not modify .scaffold/config.json** — reads only (unless user explicitly asks to change methodology)
- **Does not invent pipeline steps** — the pipeline defines what runs; this skill executes it
- **Does not suppress questions** — every decision point gets surfaced. Silent defaults defeat the purpose.
- **Does not cache preferences across sessions** — each Claude Code session starts fresh
- **Does not run steps in parallel** — batch execution is always sequential (one step at a time per ADR-021). Parallel execution is for the implementation phase via separate worktrees.
