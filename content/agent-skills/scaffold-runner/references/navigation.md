## Tool Listing

When the user asks "what tools are available?", "what can I build?", or "show me the tools":

1. Run `scaffold list --section tools --format json`
2. Parse the JSON: `data.tools.build` (build phase steps) and `data.tools.utility` (utility tools)
3. Render as two grouped sections:

**Build Phase (Phase 15)**
> These are stateless pipeline steps — they appear in `scaffold next` once Phase 14 is complete and can be run repeatedly.

| Command | When to Use |
|---------|-------------|
| `scaffold run single-agent-start` | Start the autonomous TDD implementation loop — the agent picks up tasks and builds |
| `scaffold run single-agent-resume` | Resume where you left off after closing your agent session |
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
| `scaffold dashboard` | Open a visual progress dashboard in your browser |
| `scaffold run prompt-pipeline` | Print the full pipeline reference table |
| `scaffold run review-code` | Run all 3 CLI review channels (Codex CLI, Antigravity CLI, Claude CLI) on tracked local code (committed branch diff + staged + unstaged — no untracked files) before commit or push, plus Superpowers code-reviewer as a complementary 4th channel |
| `scaffold run review-pr` | Run all 3 code review channels (Codex CLI, Antigravity CLI, Claude CLI) on a PR, plus Superpowers code-reviewer as a complementary 4th channel |
| `scaffold run post-implementation-review` | Full codebase review (Codex CLI, Antigravity CLI, Superpowers code-reviewer) after an AI agent completes all tasks |
| `scaffold run session-analyzer` | Analyze Claude Code session logs for patterns and insights |

**Display rules:**
- The tool list comes from CLI output (always complete and up-to-date)
- The "When to Use" column comes from the table above (stable prose)
- If the CLI returns a tool not in the table above, display it using its `description` field from the CLI output — graceful degradation
- For verbose detail (`--verbose`), call `scaffold list --section tools --verbose --format json` and add an Arguments column using the `argumentHint` values

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
2. **Then run it**: Follow the normal Smart Scaffold Execution workflow (preview → resolve decisions → ask only if needed → execute)
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
- Depth 5: Adds multi-model dispatch to Codex/Antigravity CLI for independent validation, with graceful fallback to Claude-only enhanced review if CLIs aren't available

When running `review-user-stories` at depth 5, check if `codex` or `agy` (Antigravity) CLI is available (`command -v codex`, `command -v agy`). If neither is available, inform the user that the step will fall back to a Claude-only adversarial self-review — still valuable but less thorough than multi-model review.

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
