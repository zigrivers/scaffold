# Prompt Pipeline — Setup Order

Run these prompts in order. Each builds on what the previous ones created. Prompts marked **(optional)** are only needed if the condition applies.

---

## Phase 0 — Prerequisites (one-time setup)

Complete these before running any prompts:

| Action | Command | Notes |
|--------|---------|-------|
| Install Beads | `npm install -g @beads/bd` or `brew install beads` | Required for task tracking |
| Install Playwright MCP | `claude mcp add playwright npx @playwright/mcp@latest` | **(optional)** Only for web apps. Run outside Claude Code. |

---

## Phase 1 — Product Definition

These produce documentation only. Beads is not yet initialized.

| # | Prompt | Produces | Notes |
|---|--------|----------|-------|
| 1 | **PRD Creation** | `docs/plan.md` | Interactive — requires your input |
| 2 | **PRD Gap Analysis & Innovation** | Updates `docs/plan.md` | Last chance to strengthen PRD before it drives everything else |

---

## Phase 2 — Project Foundation

These configure tooling and create standards documents. Run in this order because each references the previous ones.

| # | Prompt | Produces | Notes |
|---|--------|----------|-------|
| 3 | **Beads Setup** | `.beads/`, `tasks/lessons.md`, initial `CLAUDE.md` | Creates CLAUDE.md — must run before other setup prompts |
| 4 | **Tech Stack** | `docs/tech-stack.md` | Drives all subsequent technical decisions |
| 5 | **Claude Code Permissions** | `.claude/settings.json`, `~/.claude/settings.json` | Enables agents to work without permission prompts. References tech-stack.md for stack-specific rules |
| 6 | **Coding Standards** | `docs/coding-standards.md`, linter/formatter configs | References tech-stack.md |
| 7 | **TDD Standards** | `docs/tdd-standards.md` | References tech-stack.md and coding-standards.md |
| 8 | **Project Structure** | `docs/project-structure.md`, scaffolded directories | References all Phase 2 docs above |

---

## Phase 3 — Development Environment

These set up the working environment. Dev Setup creates the commands that everything else references.

| # | Prompt | Produces | Notes |
|---|--------|----------|-------|
| 9 | **Dev Environment Setup** | `docs/dev-setup.md`, Makefile/scripts, `.env.example` | Creates lint/test/install commands used by workflow |
| 10 | **Design System** | `docs/design-system.md`, theme config | **(optional)** Only for projects with a frontend |
| 11 | **Git Workflow** | `docs/git-workflow.md`, `scripts/setup-agent-worktree.sh`, CI config | References dev-setup.md for lint/test commands |
| 11.5 | **Multi-Model Code Review** | `AGENTS.md`, `.github/workflows/code-review-trigger.yml`, `.github/workflows/code-review-handler.yml`, `.github/workflows/post-merge-followup.yml`, `.github/review-prompts/`, `docs/review-standards.md` | **(optional)** Adds Codex Cloud review loop on PRs. Requires ChatGPT subscription (credits) + `ANTHROPIC_API_KEY` for fixes |

---

## Phase 4 — Testing Integration

These add E2E testing on top of the TDD standards already configured.

| # | Prompt | Produces | Notes |
|---|--------|----------|-------|
| 12 | **Playwright Integration** | Playwright config, test patterns | **(optional)** For web apps — updates tdd-standards.md |
| 13 | **Maestro Setup** | Maestro config, flow patterns | **(optional)** For Expo/mobile apps — updates tdd-standards.md |

---

## Phase 5 — Stories & Planning

These translate the PRD into implementable work.

| # | Prompt | Produces | Notes |
|---|--------|----------|-------|
| 14 | **User Stories** | `docs/user-stories.md` | Covers every PRD feature |
| 15 | **User Stories Gap Analysis & Innovation** | Updates `docs/user-stories.md` | UX-level improvements, not new features |
| 15.5 | **User Stories Multi-Model Review** | `docs/reviews/user-stories/`, updates `docs/user-stories.md` | **(optional)** Requires Codex CLI and/or Gemini CLI with subscription auth |
| 16 | **Platform Parity Review** | Updates multiple docs, creates tasks | **(optional)** For projects targeting both mobile and web |

---

## Phase 6 — Consolidation & Verification

These clean up the accumulated CLAUDE.md additions and verify consistency.

| # | Prompt | Produces | Notes |
|---|--------|----------|-------|
| 17 | **Claude.md Optimization** | Restructured `CLAUDE.md` | Must run BEFORE Workflow Audit |
| 18 | **Workflow Audit** | Fixes across all docs | Must run AFTER Claude.md Optimization |

---

## Phase 7 — Implementation

These create tasks and start building.

| # | Prompt | Produces | Notes |
|---|--------|----------|-------|
| 19 | **Implementation Plan** | `docs/implementation-plan.md`, Beads tasks | Creates the full task graph |
| 20 | **Implementation Plan Review** | Updated tasks, dependencies | Second pass for quality |
| 20.5 | **Implementation Plan Multi-Model Review** | `docs/reviews/implementation-plan/`, updated tasks | **(optional)** Requires Codex/Gemini CLI |
| 21 | **Execution** | Working software | Agent prompts — paste into Claude Code sessions |

---

## Ongoing — After Initial Setup

| Prompt | When to Use |
|--------|-------------|
| **New Enhancement** | Adding features to an existing project |
| → **Implementation Plan Review** | After Enhancement creates 5+ tasks — verify sizing, dependencies, coverage |
| → **Platform Parity Review** | After Enhancement adds platform-specific features — check platform coverage |
| **Quick Task** | Bug fixes, refactors, performance improvements, and small refinements that don't need full discovery |
| **Release** | Create a versioned release with changelog and GitHub release — supports dry-run and rollback |
| **Implementation Plan Review** | After creating 5+ new tasks from any source |
| **Platform Parity Review** | After adding platform-specific features from any source |
| **Multi-Model Code Review** | Runs automatically on every PR — tune `AGENTS.md` and `docs/review-standards.md` as you learn which findings are valuable |
| **Any prompt (re-run)** | All document-creating prompts auto-detect update mode — re-run any prompt to bring its output up to date with the latest prompt version. See "Mode Detection" in each prompt. |

---

## Update Mode — Replaces Migration Prompts

All document-creating prompts now include **Mode Detection** — they automatically detect whether their output file already exists and switch between fresh (create from scratch) and update (preserve project-specific content, add missing sections) modes.

**To update a project to the latest prompt standards:** Re-run the relevant prompt. It will read your existing document, show you a diff summary (ADD/RESTRUCTURE/PRESERVE), wait for your approval, then update in-place without losing your project-specific decisions.

This replaces the previous Beads Migration, Workflow Migration, and Permissions Migration stubs. Every prompt is now its own migration.

---

## Key Dependencies Between Prompts

```
PRD → Tech Stack → Coding Standards → TDD Standards → Project Structure
                                                            ↓
PRD → User Stories → Implementation Plan → Execution
                                    ↓
Dev Setup → Git Workflow → Claude.md Optimization → Workflow Audit
                                                            ↓
                                              Implementation Plan Review
```

The most critical ordering constraints:
1. **Beads Setup before everything else in Phase 2** — creates CLAUDE.md
2. **Tech Stack before Permissions, Coding Standards, and TDD** — they reference it
3. **Dev Setup before Git Workflow** — Git Workflow references lint/test commands
4. **Claude.md Optimization before Workflow Audit** — optimize first, verify second
5. **Implementation Plan before Implementation Plan Review** — can't review what doesn't exist


__________________________________
# PRD Creation (Prompt)
I have an idea for an application and I want you to help me create a thorough and detailed product requirements document that AI will use to build user stories, define the tech stack, and create an implementation plan.

## Mode Detection

Before starting, check if `docs/plan.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:prd v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tech-stack.md`, `docs/user-stories.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:prd v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/plan.md`
- **Preserve**: Feature list (all IDs and descriptions), user personas, scope decisions, enhancement markers added by later prompts
- **Related docs**: `docs/tech-stack.md`, `docs/user-stories.md`, `docs/implementation-plan.md`
- **Special rules**: Never remove features without user approval. Preserve any `<!-- enhancement: ... -->` markers added by the New Enhancement prompt.

## Here's my idea:
[idea information and explanations]

## Phase 1: Discovery

Use AskUserQuestionTool throughout this phase. Batch related questions together — don't ask one at a time.

### Understand the Vision
- What problem does this solve and for whom? Push me to be specific about the target user.
- What does success look like? How will we know this is working?
- What's the single most important thing this app must do well?

### Challenge and Innovate
- Challenge my assumptions — if something doesn't make sense or is overengineered, say so
- Identify areas I haven't considered (edge cases, user flows I'm overlooking, operational concerns)
- Research the competitive landscape: what exists today? What do they do well? Where do they fall short?
- Propose innovations — features or approaches I haven't thought of that would make this significantly better. Focus on ideas that are high-impact and realistic for v1, not sci-fi.

### Define the Boundaries
- What is explicitly OUT of scope for v1? Force this decision early.
- What are the riskiest assumptions we're making? Call them out.
- Are there any regulatory, legal, or compliance considerations?

## Phase 2: Planning

### Scope v1
- Propose exactly what we'll build in version 1 — ruthlessly prioritize
- For anything I want that you'd recommend deferring, explain why and what version it belongs in
- Identify the core loop: what is the user doing repeatedly? This must be frictionless.

### Technical Approach (Plain Language)
- Explain the high-level technical approach without jargon
- Identify any tradeoffs and let me make the call
- List anything I'll need to provide or set up (accounts, services, API keys, design assets, decisions)

### User Personas
- Define each distinct user type (even if there's only one, make it explicit)
- What are their goals, pain points, and context of use?
- These personas will carry through to user stories — get them right here

## Phase 3: Documentation

Create `docs/plan.md` (create the `docs/` directory if it doesn't already exist) covering:

### Required Sections
1. **Product Overview** — One-paragraph elevator pitch. What it is, who it's for, why it matters.
2. **User Personas** — Each persona with goals, pain points, and context
3. **Core User Flows** — Step-by-step walkthrough of the primary user journeys (happy path AND key error/edge cases)
4. **Feature Requirements** — Every feature grouped by area, with:
   - Clear description of what it does
   - Why it exists (tied to user need)
   - Priority: Must-have (v1) / Should-have (v1 if time) / Future
   - Any business rules or logic that aren't obvious
5. **Data Model Overview** — What are the key entities and their relationships? (Plain language, not schema — that comes later)
6. **External Integrations** — Every third-party service or API the app needs to interact with
7. **Non-Functional Requirements** — Performance expectations, security requirements, accessibility needs, supported platforms/browsers
8. **Open Questions & Risks** — Anything unresolved that could affect implementation
9. **Out of Scope** — Explicit list of what we're NOT building in v1
10. **Success Metrics** — How we'll measure if this is working

### Documentation Quality Standards
- Every feature must be described thoroughly enough that an AI agent can build it without asking follow-up questions
- Avoid ambiguity: "the app should handle errors gracefully" is useless. Specify what errors can occur and what the user sees for each.
- Include concrete examples where behavior might be misinterpreted (e.g., "when a user has zero sessions, the dashboard shows X, not an empty state")
- Use consistent terminology throughout — define key terms once and reuse them

## How to Work With Me
- Treat me as the product owner. I make the decisions, you make them happen.
- Don't overwhelm me with technical jargon. Translate everything.
- Push back if I'm overcomplicating things or going down a bad path.
- Be honest about limitations. I'd rather adjust my expectations than be disappointed.
- Batch your questions using AskUserQuestionTool — don't pepper me one at a time.

## Note on Tooling

Beads task tracking is not yet initialized at this stage — that happens later (Beads Setup prompt). This prompt produces documentation only. Do not attempt to create Beads tasks.

## What This Document Should NOT Be
- A technical specification — that comes later in the tech stack and implementation plan
- Vague — "user-friendly interface" means nothing. Be specific about what the user sees and does.
- A wishlist — everything in v1 scope must be justified and achievable

I don't just want something that works. I want something I'm proud to show people.


_________________________________________
# PRD Gap Analysis & Innovation (Prompt)

Deeply research docs/plan.md and perform a systematic gap analysis, then identify innovation opportunities. This is our last chance to strengthen the PRD before it drives every downstream document (tech stack, coding standards, user stories, implementation plan).

## Phase 1: Gap Analysis

### Completeness
- Every user persona has clearly defined goals, pain points, and context
- Every core user flow is documented end-to-end — not just the happy path but error states, edge cases, and empty states
- Every feature has a clear description, priority, and business rules
- Non-functional requirements are specific and measurable (not "fast" — how fast?)
- External integrations are identified with enough detail to evaluate tech stack options
- Out of scope is explicitly defined — not just absent

### Clarity & Precision
- Flag any vague language that an AI agent could misinterpret: "intuitive," "user-friendly," "seamless," "handles gracefully," "appropriate error message" — these must be replaced with specific, testable descriptions
- Identify features where two reasonable engineers could read the same requirement and build different things — that's a gap
- Check that terminology is consistent throughout (e.g., don't call the same thing "session" in one place and "activity" in another)
- Verify that business rules and conditional logic are explicit, not implied

### Structural Integrity
- Features don't contradict each other
- Data model relationships are consistent with the described user flows
- Priority assignments make sense — are any "must-have" features actually dependent on "should-have" features?
- Success metrics are measurable and tied to actual features being built

### Feasibility Red Flags
- Any feature that sounds simple but hides significant technical complexity — call it out
- Any requirement that assumes a capability without specifying it (e.g., "users receive notifications" — push? email? in-app? all three?)
- Any integration with a third-party service that may have API limitations, costs, or rate limits worth noting

Summarize all findings, then apply fixes directly to plan.md. Don't just list problems — resolve them.

## Phase 2: Innovation

Shift to product thinking. Research the competitive landscape, current UX trends, and best practices relevant to this application domain.

### User Experience Gaps
- Are there friction points in the core user flows that could be eliminated?
- What would the "delightful" version of each flow look like versus the "functional" version?
- Are there onboarding or first-time user experience gaps? The first 60 seconds determines if someone keeps using the app.

### Missing Features That Users Will Expect
- Based on competitive research: what do similar apps offer that we haven't addressed?
- What would a user search for in the app and be surprised it's missing?
- Are there obvious quality-of-life features not mentioned (search, filtering, sorting, undo, keyboard shortcuts)?

### AI-Native Opportunities
- Features that would be impractical to build traditionally but are easy with AI
- Smart defaults, auto-categorization, natural language interfaces, predictive behavior
- Where could AI make the experience feel magic rather than manual?

### Defensive Product Thinking
- What would a 1-star review say about this v1? Address the most likely complaints now.
- What's the most common reason a user would abandon this app after trying it?
- Are there accessibility, performance, or mobile gaps that would alienate users?

### For Each Innovation Idea, Present:
- **What**: The feature or enhancement
- **Why**: User benefit and strategic rationale
- **Impact**: How much better the product gets (high / medium / low)
- **Cost**: Implementation effort (trivial / moderate / significant)
- **Recommendation**: Must-have for v1, or backlog

Use AskUserQuestionTool to present innovation ideas grouped by theme for my approval BEFORE modifying plan.md. Let me make the calls on what goes in v1 versus later.

## Phase 3: Final Validation

After all changes are applied:
- Read the entire PRD fresh and verify it tells a coherent, complete story
- Confirm every feature could be turned into user stories without ambiguity
- Confirm the data model supports every described user flow
- Provide a concise changelog of what was added, modified, or removed
- Add a tracking comment to `docs/plan.md` after the PRD tracking comment (line 2 or after the existing `<!-- scaffold:prd -->` comment): `<!-- scaffold:prd-gap-analysis v1 YYYY-MM-DD -->` (use actual date)

## Process
- Use subagents to research the competitive landscape and UX best practices in parallel with the gap analysis
- Use AskUserQuestionTool for all innovation approvals — batch related ideas together
- Do NOT modify feature priorities without my approval
- Do NOT add approved innovations as vague one-liners — document them to the same standard as existing features (description, priority, business rules)
- Do NOT create Beads tasks — Beads is not yet initialized at this stage. If this analysis surfaces implementation work, note it in a "## Implementation Notes" section at the bottom of plan.md. These will be picked up when the Implementation Plan prompt runs later.


______________________________________________________
# Beads Setup (Prompt)

Set up **Beads** (https://github.com/steveyegge/beads) in this project for AI-friendly task tracking. Beads is already installed on the system (the `bd` CLI should be available).

## Mode Detection

Before starting, check if `.beads/` directory already exists:

**If `.beads/` does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If `.beads/` exists → UPDATE MODE**:
1. **Read & analyze**: Read `CLAUDE.md` completely. Check for Beads-related sections (Task Management, Core Principles, Self-Improvement, Autonomous Behavior). Check `tasks/lessons.md` for existing entries.
2. **Diff against current structure**: Compare the existing CLAUDE.md Beads sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing CLAUDE.md
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read `docs/git-workflow.md` and `docs/coding-standards.md` and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `.beads/` directory, `CLAUDE.md` Beads sections, `tasks/lessons.md`
- **Preserve**: All `tasks/lessons.md` entries, existing Beads task data, project-specific CLAUDE.md customizations
- **Related docs**: `docs/git-workflow.md`, `docs/coding-standards.md`
- **Special rules**: **Never re-initialize `.beads/`** — existing task data is irreplaceable. Never overwrite `tasks/lessons.md` — only add missing sections. Update CLAUDE.md Beads sections in-place.

## Why Beads

This project can use parallel Claude Code sessions. Beads provides:
- Persistent memory across sessions (git-backed)
- Dependency-aware task tracking (know what's blocked vs ready)
- Merge-safe IDs (no conflicts between agents)
- Fast queries (`bd ready` shows unblocked work)

## Setup Steps

1. **Initialize Beads** in the project root:
   ```bash
   bd init --quiet
   ```

2. **Install git hooks** for automatic sync:
   ```bash
   bd hooks install
   ```
   Note: These are Beads data-sync hooks only (not code quality hooks). They ensure task data is committed alongside code changes. This is separate from CI checks which handle linting and tests.

3. **Verify setup**:
   ```bash
   bd ready        # Should return empty (no tasks yet)
   ls .beads/      # Should show Beads data directory
   ```

4. **Create tasks/lessons.md** for capturing patterns and anti-patterns:
   ```bash
   mkdir -p tasks
   cat > tasks/lessons.md << 'EOF'
   # Lessons Learned

   Patterns and anti-patterns discovered during development. Review before starting new tasks.

   ## Patterns (Do This)

   <!-- Add patterns as you discover them -->

   ## Anti-Patterns (Avoid This)

   <!-- Add anti-patterns as you discover them -->

   ## Common Gotchas

   <!-- Add gotchas specific to this project -->
   EOF
   ```

5. **Create or update CLAUDE.md** with the sections below.

   If CLAUDE.md does not exist, create it first. This is the initial skeleton — subsequent setup prompts (Git Workflow, Dev Setup, Playwright/Maestro, etc.) will add their own sections:

   ```markdown
   # CLAUDE.md

   <!-- Core Principles and Task Management added by Beads Setup -->
   <!-- Git workflow, dev commands, and testing sections will be added by later setup prompts -->
   ```

   Then add the sections below to it.

6. **Commit the setup**:
   ```bash
   git add .beads/ tasks/lessons.md CLAUDE.md
   git commit -m "[BD-0] chore: initialize Beads task tracking"
   ```
   Note: `[BD-0]` is a bootstrap convention for setup commits made before any real tasks exist. The first real task created via `bd create` will receive an auto-generated ID.

## CLAUDE.md Sections to Add

### Core Principles

Add at the very top of CLAUDE.md:

```markdown
## Core Principles

- **Simplicity First**: Make every change as simple as possible. Minimal code, minimal impact. Don't over-engineer.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **TDD Always**: Write failing tests first, then make them pass, then refactor. No exceptions.
- **Prove It Works**: Never mark a task complete without demonstrating correctness — tests pass, logs clean, behavior verified.
```

### Task Management (Beads)

```markdown
## Task Management (Beads)

All task tracking lives in Beads — no separate todo files.

### Creating Tasks
```bash
bd create "Imperative, specific title" -p <0-3>
bd update <id> --claim                   # Always claim after creating
bd dep add <child> <parent>              # Child blocked by parent
```

Priority levels:
- 0 = blocking release
- 1 = must-have v1
- 2 = should-have
- 3 = nice-to-have

Good titles: `"Fix streak calculation for timezone edge case"`
Bad titles: `"Backend stuff"`

### Closing Tasks
```bash
bd close <id>                            # Marks complete — use this, not bd update --status completed
bd sync                                  # Force sync to git
```

### Beads Commands
| Command | Purpose |
|---------|---------|
| `bd ready` | Show unblocked tasks ready for work |
| `bd create "Title" -p N` | Create task with priority |
| `bd update <id> --status S` | Update status (in_progress, blocked, etc.) |
| `bd update <id> --claim` | Claim task (uses BD_ACTOR for attribution) |
| `bd close <id>` | Close completed task |
| `bd dep add <child> <parent>` | Add dependency |
| `bd dep tree <id>` | View dependency graph |
| `bd show <id>` | Full task details |
| `bd sync` | Force sync to git |
| `bd list` | List all tasks |
| `bd dep cycles` | Debug stuck/circular dependencies |

**NEVER** use `bd edit` — it opens an interactive editor and breaks AI agents.

### Every Commit Needs a Task

All commits require a Beads task ID in the message: `[BD-<id>] type(scope): description`

If you encounter a bug or need to make an ad-hoc fix:
```bash
bd create "fix: <description>" -p 1
bd update <id> --claim
# implement fix, then close when done
bd close <id>
```
This keeps Beads as the single source of truth for all changes.
```

### Self-Improvement

```markdown
## Self-Improvement

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake recurring
- Review `tasks/lessons.md` at session start before picking up work
```

### Autonomous Behavior

```markdown
## Autonomous Behavior

- **Fix bugs on sight**: When encountering bugs, errors, or failing tests — create a Beads task and fix them. Zero hand-holding required.
- **Use subagents**: Offload research, exploration, and parallel analysis to subagents. Keeps main context clean.
- **Keep working**: Continue until `bd ready` returns no available tasks.
- **Re-plan when stuck**: If implementation goes sideways, stop and rethink your approach rather than pushing through. (Do NOT enter interactive `/plan` mode — just think through the problem and adjust.)
```

## What This Prompt Does NOT Set Up

The following are handled by separate prompts that run later:
- **Git workflow** (branching, PRs, merge strategy) → Git Workflow prompt
- **Full development workflow** (session start → implementation → PR → task closure → next task) → CLAUDE.md Optimization + Workflow Audit prompts
- **Parallel agent worktrees** → Git Workflow prompt
- **CI/CD pipeline** → Git Workflow prompt
- **TDD standards** → TDD prompt
- **Coding standards** → Coding Standards prompt

This prompt establishes Beads as the task tracking system and adds the Beads reference to CLAUDE.md. The full workflow that ties Beads into git, PRs, and CI is composed by later prompts.

## After Setup

Tell me:
1. That Beads is initialized
2. What files were created in .beads/
3. That tasks/lessons.md was created
4. That CLAUDE.md has been updated with Beads sections
5. Any issues encountered



___________________________________________
# Tech Stack (Prompt)
Thoroughly review and analyze docs/plan.md to understand every feature, integration, and technical requirement of this project. Then deeply research tech stack options and create docs/tech-stack.md as the definitive technology reference for this project.

## Mode Detection

Before starting, check if `docs/tech-stack.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:tech-stack v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/plan.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:tech-stack v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/tech-stack.md`
- **Preserve**: All technology choices and their rationale, version pins, AI compatibility notes, user-confirmed preferences
- **Related docs**: `docs/plan.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/project-structure.md`
- **Special rules**: Never change a technology choice without user approval. Preserve version pins exactly. Update the Quick Reference section to match any structural changes.

## Step 1: Gather User Preferences

Before researching options, use AskUserQuestion to ask the user about their preferences. Ask up to 4 questions based on what the PRD implies (e.g., skip frontend questions if the PRD describes a CLI tool). Tailor the options to what's realistic for this project.

Example questions (adapt based on PRD):
- **Backend language** — "Which backend language do you prefer?" with options like "TypeScript", "Python", "Go", "No preference — recommend the best fit"
- **Frontend framework** (if PRD has a UI) — "Which frontend framework do you prefer?" with options like "React", "Vue", "Svelte", "No preference"
- **Deployment target** — "Where do you plan to deploy?" with options like "Vercel/Netlify", "AWS", "Self-hosted", "No preference"
- **Constraints** — "Any hard constraints on the stack?" with options like "Must be TypeScript full-stack", "Must use specific database", "Must stay free-tier", "No constraints"

Use the answers to guide your research. "No preference" means recommend the best fit based on PRD requirements and the guiding principles below.

## Guiding Principles for Stack Selection

This project will be built and maintained entirely by AI agents. Every technology choice must optimize for:

1. **AI familiarity** — Choose libraries and frameworks with massive training data representation. Obscure or bleeding-edge tools mean more hallucination and more bugs.
2. **Convention over configuration** — Prefer opinionated frameworks with clear "one right way" patterns. AI thrives on convention, struggles with ambiguous choices.
3. **Minimal dependency surface** — Fewer dependencies = fewer version conflicts, fewer breaking changes, fewer security vulnerabilities. Only add a dependency if building it ourselves would be unreasonable.
4. **Strong typing and validation** — Static types catch AI mistakes at build time instead of runtime. Prioritize type safety across every layer.
5. **Mature ecosystem** — Stable, well-documented libraries with active maintenance. Check that critical dependencies haven't been abandoned.

## What the Document Must Cover

### 1. Architecture Overview
- High-level architecture diagram (described in text/mermaid)
- Monolith vs. microservices decision with rationale
- Key architectural patterns chosen (MVC, clean architecture, etc.) and why

### 2. Backend
- Framework selection with rationale (compare top 2-3 options, explain the winner)
- ORM / database access layer
- API approach (REST, GraphQL, etc.) with rationale
- Authentication/authorization library
- Background jobs / task queue (if needed per PRD)
- File storage (if needed per PRD)

### 3. Database
- Database engine selection with rationale (compare options given our data model needs)
- Migration tooling
- Caching layer (if needed per PRD — don't add one speculatively)

### 4. Frontend (if applicable per PRD)
- Framework selection with rationale
- State management approach
- UI component library (if applicable)
- Styling approach
- Build tooling

### 5. Infrastructure & DevOps
- Hosting / deployment target recommendation
- CI/CD approach
- Environment management (local, staging, production)
- Environment variable / secrets management

### 6. Developer Tooling
- Linter and formatter for each language
- Type checking configuration
- Pre-commit hooks
- Test runner and assertion library (this feeds into TDD standards later)

### 7. Third-Party Services & APIs
- Identify every external integration implied by the PRD
- Recommended service/provider for each with rationale
- Fallback options if a primary choice has issues

### For Every Technology Choice, Document:
- **What**: The specific library/framework and version
- **Why**: Rationale tied to our project requirements (not generic praise)
- **Why not alternatives**: Brief note on what was considered and rejected
- **AI compatibility note**: How well-represented this is in AI training data, any known AI pitfalls with this tool

## What This Document Should NOT Include
- Technologies we don't need yet — no speculative "we might need Kafka someday"
- Multiple options without a decision — make a recommendation, don't present a menu
- Boilerplate descriptions of what a framework is — assume the reader knows, just explain why we chose it

## Process
- **First**, gather user preferences using AskUserQuestion as described in Step 1 above — do this before creating the Beads task or starting any research
- Create a Beads task for this work: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- Use subagents to research and compare tech stack options in parallel
- Cross-reference every PRD feature against the proposed stack — verify nothing requires a capability the stack doesn't support
- Use AskUserQuestion to present key decisions (especially framework choices and hosting) with your recommendation and rationale before finalizing
- After creating tech-stack.md, review plan.md and update it with any technical clarifications or additions that emerged from the analysis
- At the end of the document, include a **Quick Reference** section listing every dependency with its version — this becomes the source of truth for package.json / requirements.txt / pyproject.toml


_________________________________________
# Claude Code Permissions Setup (Prompt)

Set up Claude Code permissions for this project so agents can work without "Do you want to proceed?" prompts. The permissions use two layers that merge at runtime.

Review `docs/tech-stack.md` for stack-specific tools that need permissions, and `CLAUDE.md` for the current project configuration.

## Architecture

| Layer | File | Checked into git? | Purpose |
|-------|------|-------------------|---------|
| Project | `.claude/settings.json` | Yes | Project-specific deny rules (destructive operations) |
| User | `~/.claude/settings.json` | No | Standard tool permissions for your dev environment |

Both layers merge at runtime:
- Allow lists combine (union)
- Deny lists combine (union) — **deny always wins over allow**
- Commands matching an allow pattern (and no deny pattern) run without prompting

### How Permission Matching Works

Claude Code's permission matcher is **shell-operator-aware**. A specific pattern like `Bash(git *)` matches `git status` but does NOT match commands containing shell operators:

| Operator | Example | Why `Bash(git *)` fails |
|----------|---------|------------------------|
| `&&` | `git fetch && git rebase` | Two commands chained |
| `\|\|` | `git checkout main \|\| true` | Fallback operator |
| `\|` | `git log \| head -5` | Pipe |
| `2>/dev/null` | `git status 2>/dev/null` | Redirect |
| `$(...)` | `echo $(git rev-parse HEAD)` | Command substitution |
| `&` | `npx next dev &` | Background execution |
| `;` | `cd dir; make test` | Sequential execution |

**Specific patterns alone cannot cover compound commands. The bare `Bash` entry is the only way to auto-approve them. Safety comes from deny rules, not from enumerating allowed commands.**

### 1. Project-level settings (`.claude/settings.json`)

This gets checked into git. It defines **deny rules only** — the things agents must never do in this project. Allow rules live at the user level (your standard tools, shared across all projects).

```json
{
  "permissions": {
    "allow": [],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(rm -rf /)",
      "Bash(rm -r *)",
      "Bash(sudo *)",
      "Bash(git push --force *)",
      "Bash(git push origin main)",
      "Bash(git push -f origin main)",
      "Bash(git push --force origin main)",
      "Bash(git reset --hard *)",
      "Bash(git worktree remove *)",
      "Bash(bd edit *)"
    ]
  }
}
```

Create the directory if needed: `mkdir -p .claude`

**Why deny-only at project level:**
- `git push origin main` — agents must never push directly to main (all changes via PR)
- `git push --force` — only `--force-with-lease` is allowed, only on feature branches
- `git reset --hard` — too destructive, agents should use `git checkout` or `git clean`
- `git worktree remove` — worktree lifecycle is a human decision, not an agent decision
- `rm -rf` / `rm -r` — recursive deletion should be explicit and human-approved
- `bd edit` — opens interactive editor, breaks AI agents
- `sudo` — agents should never need elevated privileges

**Project-specific deny rules:** Review `docs/tech-stack.md` and add deny rules for destructive operations in your stack. Examples:

```json
"Bash(npx prisma migrate reset *)",
"Bash(DROP TABLE *)",
"Bash(kubectl delete *)",
"Bash(docker rm -f *)",
"Bash(docker system prune *)"
```

### 2. User-level settings (`~/.claude/settings.json`)

This is personal to your machine and shared across all projects. It defines what tools agents are allowed to use without prompting.

If the file already exists, **MERGE** these entries into the existing allow/deny arrays without duplicating or removing existing entries. If it doesn't exist, create it.

```json
{
  "permissions": {
    "allow": [
      "Bash",
      "Read",
      "Write",
      "Edit",
      "Read(~/**)",
      "Edit(~/**)",
      "Write(~/**)",
      "Glob(~/**)",
      "Grep(~/**)",
      "WebFetch(*)",
      "WebSearch",
      "mcp__*",
      "mcp__plugin_playwright_playwright",
      "mcp__plugin_context7_context7"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(rm -rf /)",
      "Bash(rm -r *)",
      "Bash(sudo *)",
      "Bash(git push --force *)",
      "Bash(git reset --hard *)"
    ]
  }
}
```

**The bare `Bash` entry is the most important line.** It auto-approves all bash commands including compound commands with shell operators (`&&`, `||`, pipes, redirects, `$(...)`, backgrounding). Deny rules still block destructive operations — deny always wins over allow. Without the bare `Bash` entry, agents will be prompted for every compound command and autonomous workflows become impractical.

**The `mcp__*` entry is a broad MCP wildcard.** Due to known matching issues, also add bare server-name entries for each installed MCP plugin. Check `~/.claude/settings.json` for `enabledPlugins` — each plugin that provides MCP tools needs a bare server-name entry. The format is `mcp__plugin_<slug>_<server>` where `<slug>` is the plugin identifier and `<server>` is the MCP server name from the plugin's `.mcp.json`.

Common entries:
- `mcp__plugin_playwright_playwright` — all Playwright browser tools
- `mcp__plugin_context7_context7` — all Context7 documentation tools

The bare server-name format (without `__*` suffix) matches ALL tools from that server. This is more reliable than the `mcp__*` wildcard.

**Important**: Expand `~/**` to your actual home directory path (e.g., `/Users/username/**`).

**Why broad `Bash` lives at user level:** Your standard dev tools are the same across all projects. Putting them in user-level means you don't copy the same allow list into every project. Project-level only needs deny rules for project-specific destructive operations. The deny rules at both levels combine — deny always wins.

### Reference: What These Entries Cover

The bare `Bash` entry covers all of the following (and their compound combinations). This is provided for documentation — you do NOT need to add these as individual patterns:

- **Git**: status, diff, log, branch, show, add, commit, push, checkout, pull, stash, fetch, rebase, merge, worktree, rev-parse, clean
- **GitHub CLI**: gh pr, gh issue, gh auth, gh api
- **Task tracking**: bd, bd *
- **Build tools**: make, npm, npx, node, python, pytest, uv, pip
- **Containers**: docker compose, docker ps, docker logs
- **Shell utilities**: curl, ls, cat, find, grep, head, tail, sort, wc, pwd, echo, which, tree, mkdir, cp, mv, rm, touch, chmod, diff, sed, awk, tee, xargs

**MCP (`mcp__*` + bare server names)**: All tools from all installed MCP servers (plugins). The `mcp__*` wildcard is kept as a fallback, but bare server-name entries (e.g., `mcp__plugin_playwright_playwright`) are more reliable due to known wildcard matching issues. Common servers include Context7 (documentation lookup), Playwright (browser automation), and any custom MCP servers configured in your environment.

### Cautious Mode (alternative)

If you cannot use the bare `Bash` entry (org policy, shared machines, etc.), you can instead enumerate specific patterns. Create your user-level settings with individual `Bash(command *)` entries for each tool category listed in the reference above.

> **Trade-off:** With specific patterns only, you WILL still be prompted for compound commands (anything with `&&`, `||`, pipes, redirects, `$(...)`, backgrounding, `;`). There is no workaround — this is how Claude Code's permission matcher works. Autonomous agent workflows will be impractical in cautious mode.

<details>
<summary>Full cautious-mode allow list (click to expand)</summary>

```json
"Bash(git status)",
"Bash(git diff *)",
"Bash(git log *)",
"Bash(git branch *)",
"Bash(git show *)",
"Bash(git add *)",
"Bash(git commit *)",
"Bash(git push *)",
"Bash(git checkout *)",
"Bash(git pull *)",
"Bash(git stash *)",
"Bash(git fetch *)",
"Bash(git rebase *)",
"Bash(git merge *)",
"Bash(git worktree *)",
"Bash(git rev-parse *)",
"Bash(git clean *)",
"Bash(git -C *)",
"Bash(gh pr *)",
"Bash(gh issue *)",
"Bash(gh auth *)",
"Bash(gh api *)",
"Bash(bd)",
"Bash(bd *)",
"Bash(make)",
"Bash(make *)",
"Bash(npm run *)",
"Bash(npm test *)",
"Bash(npm install *)",
"Bash(npx *)",
"Bash(node *)",
"Bash(python *)",
"Bash(pytest *)",
"Bash(uv *)",
"Bash(pip *)",
"Bash(docker compose *)",
"Bash(docker ps *)",
"Bash(docker logs *)",
"Bash(curl *)",
"Bash(ls)",
"Bash(ls *)",
"Bash(cat *)",
"Bash(find *)",
"Bash(grep *)",
"Bash(head *)",
"Bash(tail *)",
"Bash(sort *)",
"Bash(wc *)",
"Bash(pwd)",
"Bash(echo *)",
"Bash(which *)",
"Bash(tree *)",
"Bash(mkdir *)",
"Bash(cp *)",
"Bash(mv *)",
"Bash(rm *)",
"Bash(touch *)",
"Bash(chmod *)",
"Bash(diff *)",
"Bash(sed *)",
"Bash(awk *)",
"Bash(tee *)",
"Bash(xargs *)",
"Bash(export *)",
"Bash(env *)",
"Bash(printenv *)",
"Bash(cd *)",
"Bash(./scripts/*)",
"mcp__plugin_context7_context7",
"mcp__plugin_playwright_playwright"
```

</details>

### 3. Stack-Specific Additions

> **Note:** If you're using bare `Bash` (recommended), stack-specific additions are unnecessary — all commands are already covered. This section only applies if you chose cautious mode.

Review `docs/tech-stack.md` for this project's tools. Add any additional tool permissions to your **user-level** settings (since you'll use the same tools across projects).

Common additions by stack:

**Mobile (Expo / React Native):**
```
"Bash(npx expo *)",
"Bash(maestro *)",
"Bash(xcodebuild *)",
"Bash(pod *)",
"Bash(eas *)"
```

**Ruby / Rails:**
```
"Bash(bundle *)",
"Bash(rails *)",
"Bash(rake *)",
"Bash(rspec *)"
```

**Go:**
```
"Bash(go *)",
"Bash(golangci-lint *)"
```

**Rust:**
```
"Bash(cargo *)",
"Bash(rustc *)"
```

**Java / Kotlin:**
```
"Bash(./gradlew *)",
"Bash(mvn *)"
```

### 4. Verify the Setup

After creating both files:

```bash
# Show project settings
cat .claude/settings.json

# Confirm user settings
cat ~/.claude/settings.json
```

#### Tier 1 — Compound Command Tests

These are the litmus test for bare `Bash`. **If any Tier 1 command prompts, the bare `Bash` entry is missing — fix it before continuing.**

| Test Command | Validates |
|--------------|-----------|
| `git fetch origin && echo "done"` | `&&` passes |
| `git rev-parse --show-toplevel \|\| echo "not a repo"` | `\|\|` passes |
| `ls -la 2>/dev/null` | Redirect passes |
| `echo $(pwd)` | Command substitution passes |

#### Tier 2 — Standard Workflow Commands

Test that these commands (used in the canonical workflow) don't prompt:

| Command | Used In |
|---------|---------|
| `git status` | General |
| `git fetch origin` | Branch creation, between tasks |
| `git checkout -b test-branch origin/main` | Branch creation |
| `git clean -fd` | Worktree cleanup between tasks |
| `git push -u origin HEAD` | PR workflow |
| `git branch -d test-branch` | Task closure cleanup |
| `git fetch origin --prune` | Task closure cleanup |
| `gh pr create --title "test" --body "test"` | PR workflow |
| `gh pr merge --squash --auto --delete-branch` | PR workflow |
| `gh pr checks --watch --fail-fast` | CI watch (long-running) |
| `gh pr view --json state -q .state` | Merge confirmation |
| `bd ready` | Task selection |
| `bd create "test" -p 3` | Task creation |
| `bd close <id>` | Task closure |
| `bd sync` | Task sync |
| `make lint` | Verification |
| `make test` | Verification |

If MCP plugins are installed, run a quick smoke test for each:
- Playwright: Use `browser_navigate` to open a `file:///tmp/test.html` page, then `browser_close`
- Context7: Use `resolve-library-id` for any library

If these prompt for approval, the MCP entries are missing or incorrect.

Clean up after testing:
```bash
git checkout main
git branch -D test-branch
```

### 5. Still Getting Prompted?

Six common causes:

1. **Missing bare `Bash`** — open `~/.claude/settings.json` and check for a standalone `"Bash"` entry (not `"Bash(something)"`). It must be present in the allow array.
2. **Conflicting deny rule** — deny always wins over allow. Check both user-level and project-level deny arrays for rules that match the command being prompted.
3. **Unexpanded `~/**` paths** — Claude Code may not expand `~`. Replace `~` with your actual home directory path (e.g., `/Users/username/**`).
4. **Session not restarted** — permission changes require restarting Claude Code (`/exit` and relaunch, or start a new session).
5. **Missing `mcp__*`** — the bare `Bash` entry does NOT cover MCP tools. MCP tools need their own allow entry. Check for `"mcp__*"` in the user-level allow array.
6. **`mcp__*` wildcard bug** — `mcp__*` doesn't reliably match all MCP tools. Add explicit bare server-name entries alongside it: `mcp__plugin_playwright_playwright`, `mcp__plugin_context7_context7`, etc. The bare server-name format (no `__*` suffix) matches all tools from that server.

### 6. Commit Project Settings

```bash
git add .claude/settings.json
git commit -m "[BD-0] chore: configure Claude Code permissions"
```

## Process
- Create a Beads task: `bd create "chore: configure Claude Code permissions" -p 0`
  and `bd update <id> --claim`
- Read the user's existing `~/.claude/settings.json` before making changes — if it
  exists, MERGE entries; do not replace the file
- The bare `"Bash"` entry in the user-level allow array is CRITICAL — verify it is
  present after writing the file
- Do NOT include specific `Bash(...)` patterns alongside the bare `"Bash"` — they
  are redundant and create confusion about what's actually needed
- **MCP detection**: Read `~/.claude/settings.json` `enabledPlugins` to discover
  installed MCP-providing plugins. For each plugin, check
  `~/.claude/plugins/cache/<org>/<name>/<version>/.mcp.json` for server names.
  Add `mcp__plugin_<slug>_<server>` entries for each discovered server. Keep
  `mcp__*` as a fallback (in case the bug is fixed).
- Run the verification checklist (Tier 1 first). If any compound command prompts,
  the bare `"Bash"` entry is missing — fix before continuing
- When both files are created, verified, and committed: `bd close <id>`


_____________________________________
# Coding Standards (Prompt)
Deeply research best practices for coding standards for our tech stack — review docs/tech-stack.md — then create docs/coding-standards.md as the definitive code quality reference for this project.

This document will be referenced by AI agents during every implementation task. It needs to be prescriptive with concrete examples, not abstract principles.

## Mode Detection

Before starting, check if `docs/coding-standards.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:coding-standards v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tech-stack.md`, `docs/tdd-standards.md`, `docs/project-structure.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:coding-standards v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/coding-standards.md`
- **Secondary output**: Linter/formatter config files (`.eslintrc`, `.prettierrc`, etc.)
- **Preserve**: Naming conventions, lint rule customizations, commit message format, project-specific patterns and examples
- **Related docs**: `docs/tech-stack.md`, `docs/tdd-standards.md`, `docs/project-structure.md`, `docs/git-workflow.md`
- **Special rules**: Never change the commit message format without checking `docs/git-workflow.md` and CI config for references. Preserve all linter/formatter config customizations.

## What the Document Must Cover

### 1. Project Structure & Organization
- Directory structure conventions — where each type of file lives
- Module/component organization pattern (feature-based? layer-based? — decide based on our stack's best practices)
- File naming conventions with explicit examples
- Import ordering rules
- Index/barrel file policy (use them or don't — be explicit)

### 2. Code Patterns & Conventions
- Naming conventions for variables, functions, classes, types, constants, database fields — with examples of good and bad for each
- Function/method guidelines: max length, single responsibility, parameter limits
- Error handling strategy: how to throw, catch, propagate, and log errors consistently across the codebase. Include the specific error patterns for our stack.
- Async patterns: preferred approach for our stack (async/await, promises, callbacks — pick one and ban the rest)
- State management patterns (if applicable)
- API response format: standardized success/error response shapes
- Environment variable and configuration management

### 3. Type Safety & Data Validation
- Type strictness level (e.g., TypeScript strict mode, Python type hints)
- Input validation strategy: where validation happens (API boundary? service layer? both?) and what library to use
- Null/undefined handling policy
- Type definition conventions: where types live, how they're shared between layers

### 4. Security Standards
- Input sanitization requirements
- Authentication/authorization patterns for our stack
- Secrets management: how to handle API keys, credentials, connection strings
- Common vulnerabilities to prevent for our stack (SQL injection, XSS, CSRF, etc.) with the specific defensive pattern to use for each
- Dependency security: policy on adding new packages, audit requirements

### 5. Database & Data Access
- ORM/query patterns: preferred approach for our stack
- Migration conventions: naming, structure, reversibility
- Query performance guidelines: N+1 prevention, indexing expectations
- Transaction handling patterns
- Seed data conventions

### 6. API Design (if applicable)
- RESTful conventions or GraphQL patterns for our stack
- Endpoint naming and versioning
- Request/response validation and serialization
- Pagination, filtering, sorting standards
- Rate limiting and error code conventions

### 7. Logging & Observability
- What to log: requests, errors, key business events
- What NEVER to log: PII, secrets, tokens, passwords
- Log levels and when to use each (debug, info, warn, error)
- Structured logging format for our stack

### 8. AI-Specific Coding Rules
These prevent the most common AI coding mistakes:
- No dead code, no commented-out code, no TODO comments without a Beads task ID
- No copy-paste duplication — extract shared logic immediately
- No magic numbers or strings — use named constants
- No overly clever code — optimize for readability over cleverness
- Don't import entire libraries when you need one function
- Don't create abstractions until you have 2+ concrete uses (no premature abstraction)
- Don't add features, utilities, or helpers that aren't required by the current task
- Every function must have a clear, single reason to exist — if you can't name it well, the abstraction is wrong
- Prefer explicit over implicit — no hidden side effects, no surprising default behavior

### 9. Commit Messages

Define the project's commit message format:

Format: `[BD-<id>] type(scope): description`

Examples:
- `[BD-42] feat(auth): add login endpoint`
- `[BD-42] fix(auth): handle expired tokens`
- `[BD-42] test(auth): add login validation tests`
- `[BD-42] refactor(auth): extract token validation`
- `[BD-42] docs(api): add endpoint documentation`
- `[BD-42] chore(deps): update dependencies`

Rules:
- Types: feat, fix, test, refactor, docs, chore
- The `[BD-<id>]` prefix is required — every commit must trace to a Beads task
- Special case: `[BD-0]` is used for project setup commits before real tasks exist (bootstrapping)
- Scope should be the feature or module being changed
- Description should be imperative ("add", "fix", "update" — not "added", "fixed", "updated")

This format is referenced by the git workflow, CLAUDE.md, and CI pipeline. It must be consistent everywhere.

### 10. Code Review Checklist

A quick-reference checklist AI agents should self-apply before marking a task complete:
- [ ] No linting or type errors
- [ ] All tests pass
- [ ] No hardcoded values that should be configuration
- [ ] Error cases handled, not just happy path
- [ ] No sensitive data exposed in logs or responses
- [ ] Function and variable names are descriptive and consistent
- [ ] No unnecessary dependencies added
- [ ] Changes are minimal — only what the task requires

## What This Document Should NOT Be
- A style guide for tabs vs. spaces — use a formatter/linter config file for that and reference it
- Generic advice — every standard should reference our specific stack, libraries, and tools
- Aspirational — only include standards we enforce from day one. If it's a nice-to-have, leave it out.

## Process
- Use subagents to research coding standards for each part of our stack in parallel
- If our stack includes a linter or formatter, create the config file(s) alongside the standards doc and reference them
- Review docs/plan.md to understand the application domain — this informs which patterns matter most (e.g., a real-time app needs different standards than a CRUD app)
- Use AskUserQuestionTool for architectural decisions like error handling strategy, validation approach, and strictness levels
- Include runnable example snippets showing the RIGHT way to do things in our stack — AI follows patterns better than prose
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now

_______________________________
# TDD (Prompt)
Deeply research test-driven development (TDD) best practices for our tech stack — review docs/tech-stack.md and docs/coding-standards.md — then create docs/tdd-standards.md as the definitive testing reference for this project.

This document will be referenced by AI agents during every implementation task. It needs to be prescriptive and concrete, not theoretical.

## Mode Detection

Before starting, check if `docs/tdd-standards.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:tdd-standards v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tech-stack.md`, `docs/coding-standards.md`, `docs/project-structure.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:tdd-standards v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/tdd-standards.md`
- **Preserve**: Coverage thresholds, test runner configuration, E2E sections added by Playwright/Maestro prompts, project-specific mocking strategies
- **Related docs**: `docs/tech-stack.md`, `docs/coding-standards.md`, `docs/project-structure.md`
- **Special rules**: Never remove E2E sections added by the Playwright or Maestro prompts. Preserve coverage threshold decisions. Keep existing reference test examples alongside any new ones.

## What the Document Must Cover

### 1. TDD Workflow (the non-negotiable process)
- Define the exact Red → Green → Refactor cycle as it applies to our stack
- When to write unit tests vs integration tests vs e2e tests for a given change
- The rule: no implementation code exists without a failing test written first
- How to handle TDD when working with external APIs, databases, or third-party services

### 2. Test Architecture
- Directory structure and file naming conventions (mirror source structure? co-locate? — decide based on our stack's conventions)
- Test categorization: unit / integration / e2e — define the boundary for each
- What belongs in each category for our specific stack (e.g., "API route handlers get integration tests, utility functions get unit tests, critical user flows get e2e tests")
- Shared test utilities, factories, fixtures, and helpers — where they live and how to use them

### 3. Concrete Patterns for Our Stack
- Mocking strategy: what to mock, what NOT to mock, preferred mocking libraries
- Database testing: test database setup/teardown, seeding, transaction rollback patterns
- API testing: request/response testing patterns, authentication in tests
- Frontend testing (if applicable): component testing, user interaction simulation
- Async testing patterns specific to our stack
- Provide a **reference test example** for each test category showing the exact pattern to follow

### 4. AI-Specific Testing Rules
These are critical because AI agents make predictable testing mistakes:
- Never write tests that test the framework or library itself — only test OUR logic
- Never write trivial tests (e.g., testing that a constant equals itself)
- Tests must assert behavior, not implementation details — don't test that a specific internal method was called, test that the outcome is correct
- Every test must be able to fail meaningfully — if you can't describe a scenario where the test catches a real bug, delete it
- Test names must describe the behavior being tested: `should return 404 when session does not exist` not `test error case`
- No test should depend on another test's state or execution order
- When fixing a bug: write the failing test FIRST that reproduces the bug, then fix it

### 5. Coverage & Quality Standards
- Minimum coverage thresholds (suggest appropriate levels for our stack — 100% is usually wrong)
- What to measure: line coverage is table stakes, branch coverage matters more
- Areas that MUST have 100% branch coverage (e.g., authentication, payment, data validation)
- Areas where lower coverage is acceptable (e.g., configuration, generated code)
- How to run coverage reports with our stack's tooling

### 6. CI/Test Execution
- How tests should run (parallel? sequential? by category?)
- Expected test run time targets (fast feedback loop matters)
- What blocks a commit vs. what runs in CI only
- Flaky test policy: if a test fails intermittently, it's a bug — fix or delete it

### 7. E2E / Visual Testing

If this project uses browser testing (Playwright) or mobile testing (Maestro), those will be configured by separate setup prompts that will add E2E-specific sections to this document.

Placeholder — to be completed by:
- **Playwright Integration prompt** — for web apps (browser automation, visual verification)
- **Maestro Setup prompt** — for Expo/mobile apps (flow testing, screenshot verification)

Until those prompts run, E2E testing patterns are not yet defined. Focus TDD efforts on unit and integration tests.

## What This Document Should NOT Be
- A TDD textbook or history lesson — assume the reader knows what TDD is
- Generic advice that applies to any stack — everything should reference OUR specific tools and libraries
- Aspirational — only include standards we intend to enforce from day one

## Process
- Use subagents to research TDD best practices for our specific stack in parallel
- Review docs/user-stories.md to understand the types of features being built — this informs which testing patterns will be most relevant
- Use AskUserQuestionTool for decisions like coverage thresholds, test runner preferences, or e2e scope
- Include runnable example commands for running tests, checking coverage, and running specific test categories
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now

___________________________________
# Project Structure (Prompt)
Research best practices for project structure based on our tech stack and standards. Review docs/tech-stack.md, docs/coding-standards.md, docs/tdd-standards.md, and docs/plan.md, then create docs/project-structure.md and scaffold the actual directory structure.

## Mode Detection

Before starting, check if `docs/project-structure.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:project-structure v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tech-stack.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:project-structure v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/project-structure.md`
- **Secondary output**: Scaffolded directories, `.gitignore`, CLAUDE.md "Project Structure Quick Reference" section
- **Preserve**: Module organization decisions, file placement rules, import conventions, high-contention file lists
- **Related docs**: `docs/tech-stack.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`
- **Special rules**: **Never delete existing directories** — only add new ones. Preserve the module organization strategy choice (feature-based/layer-based/hybrid). Update the CLAUDE.md Quick Reference section in-place.

## Why This Matters for AI Development

With up to 10 Claude Code agents working in parallel, project structure directly impacts:
- **Merge conflict frequency** — Poor structure means agents constantly edit the same files
- **Context window efficiency** — Clear boundaries mean agents load only what they need
- **Task independence** — Good structure lets agents complete tasks without coordinating

## What the Document Must Cover

### 1. Directory Tree

Provide the complete directory structure with purpose annotations:

```
/
├── src/                    # Application source code
│   ├── [layer or feature folders with explanation]
│   └── ...
├── tests/                  # Test files (structure mirrors src/)
├── docs/                   # Project documentation
├── scripts/                # Build, deploy, and utility scripts
├── config/                 # Configuration files
└── ...
```

The structure should follow our tech stack's conventions (e.g., Next.js has specific expectations, FastAPI projects have different patterns).

### 2. Module Organization Strategy

Decide and document ONE of these approaches (based on what fits our stack and PRD best):

**Feature-based (vertical slices)**
```
src/
├── auth/
│   ├── routes.py
│   ├── services.py
│   ├── models.py
│   └── tests/
├── sessions/
│   ├── routes.py
│   ├── services.py
│   ├── models.py
│   └── tests/
```

**Layer-based (horizontal slices)**
```
src/
├── routes/
├── services/
├── models/
├── repositories/
```

**Hybrid (layers within features)**
```
src/
├── features/
│   ├── auth/
│   └── sessions/
├── shared/
│   ├── middleware/
│   └── utils/
```

Explain WHY the chosen approach fits our project. Feature-based typically causes fewer merge conflicts with parallel agents.

### 3. File Placement Rules

For each file type, specify exactly where it goes:

| File Type | Location | Naming Convention | Example |
|-----------|----------|-------------------|---------|
| API routes/controllers | | | |
| Business logic/services | | | |
| Database models | | | |
| Type definitions | | | |
| Utility functions | | | |
| Constants/config | | | |
| Middleware | | | |
| Unit tests | | | |
| Integration tests | | | |
| E2E tests | | | |
| Screenshots (Playwright) | | | |

### 4. Shared Code Strategy

This is critical for parallel agent work. Define:

**High-contention files** (multiple agents likely to touch):
- Main route index / app entry point
- Database schema / migrations
- Shared type definitions
- Environment config

**Mitigation approach for each:**
- How to structure these files to minimize conflicts
- When to split vs. keep together
- Merge resolution guidance if conflicts occur

**Shared utilities rules:**
- When to add to shared utils vs. keep in feature folder
- Required: utility must be used by 2+ features before promoting to shared
- Shared code must have tests before other features can depend on it

### 5. Import Conventions

Define import order and style (should align with coding-standards.md):
```
1. Standard library
2. Third-party packages
3. Internal shared modules
4. Feature-local modules
```

Define path alias conventions if applicable (e.g., `@/components`, `@shared/utils`).

### 6. Index/Barrel File Policy

Decide one of:
- **Use barrel files**: Every folder has an `index.ts` that re-exports public API
- **No barrel files**: Import directly from source files
- **Hybrid**: Barrel files only for shared modules

Document the reasoning and be consistent.

### 7. Test File Location

Decide one of:
- **Co-located**: `feature/component.ts` + `feature/component.test.ts`
- **Mirrored**: `src/feature/component.ts` → `tests/feature/component.test.ts`
- **Hybrid**: Unit tests co-located, integration/E2E tests separate

Must align with docs/tdd-standards.md.

### 8. Generated vs. Committed Files

Specify which files/folders:
- Must be committed (source code, config, migrations)
- Must NOT be committed (node_modules, __pycache__, .env, build output)
- Should be committed only as baselines (screenshot references)

Verify .gitignore covers all generated files.

## What to Actually Create

After documenting, scaffold the project:

1. **Create all directories** from the structure (empty directories can have `.gitkeep`)
2. **Create placeholder files** where appropriate:
   - `src/shared/utils/.gitkeep`
   - `tests/.gitkeep`
   - Empty `__init__.py` files for Python projects
3. **Create or update .gitignore** to match the structure
4. **Update CLAUDE.md** with a quick-reference section:

```markdown
## Project Structure Quick Reference

- Feature code: `src/features/{feature-name}/`
- Shared utilities: `src/shared/` (only after 2+ features use it)
- Tests: Co-located as `{filename}.test.{ext}`
- Screenshots: `tests/screenshots/{story-id}_{description}.png`
- New migrations: `src/db/migrations/` (coordinate via Beads to avoid conflicts)

Before creating a new file, check project-structure.md for the correct location.
```

## What This Document Should NOT Be

- An explanation of what directories are — assume the reader knows what `src/` means
- Flexible — the structure should be prescriptive so all agents follow it consistently
- Theoretical — every rule should be tied to our actual tech stack and project needs

## Process

- Use subagents to research project structure best practices for our specific tech stack
- Review docs/plan.md to understand the features being built — this informs whether feature-based or layer-based organization makes more sense
- Use AskUserQuestionTool for key decisions: organization strategy, test location, barrel file policy
- After documenting, actually create the directory structure and commit it
- Verify the structure works by checking that imports resolve correctly (if tooling is set up)
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now


_____________________________________
# Dev Environment Setup (Prompt)

Set up a complete local development environment for this project based on docs/tech-stack.md and docs/project-structure.md. The goal is a one-command dev experience with live reloading so I can see changes in real-time as work progresses.

I'm not a professional developer, so the setup should be beginner-friendly with clear instructions for common tasks.

## Mode Detection

Before starting, check if `docs/dev-setup.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:dev-setup v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tech-stack.md`, `docs/project-structure.md`, `docs/git-workflow.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:dev-setup v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/dev-setup.md`
- **Secondary output**: Makefile/scripts, `.env.example`, CLAUDE.md "Key Commands" section
- **Preserve**: Port assignments, custom scripts, `.env` variable names and values, database configuration, Makefile customizations
- **Related docs**: `docs/tech-stack.md`, `docs/project-structure.md`, `docs/git-workflow.md`
- **Special rules**: Never change port assignments without checking for references in other config files. Preserve all `.env.example` variables. Update CLAUDE.md Key Commands section in-place.

## Objectives

1. Configure a local dev server with live/hot reloading
2. Set up the local database (if applicable)
3. Configure environment variables for local development
4. Create simple commands for common tasks
5. Document everything clearly for a non-engineer
6. Verify the setup works end-to-end

## What to Configure

### 1. Dev Server with Live Reloading

Set up the appropriate dev server for our tech stack with:
- **Hot reloading / live reload**: Changes to code automatically refresh the browser or restart the server
- **Fast startup**: Dev server should start in seconds, not minutes
- **Error overlay**: Errors should display clearly in the browser (for frontend) or terminal (for backend)
- **Source maps**: For debugging in browser dev tools (if applicable)

Common setups by stack (configure what matches our tech-stack.md):
- **Frontend (React/Vue/Svelte)**: Vite, Next.js dev mode, or Create React App
- **Backend (Python)**: Uvicorn with `--reload`, Flask debug mode, or Django runserver
- **Backend (Node)**: Nodemon, ts-node-dev, or framework-specific (Next.js, Fastify)
- **Full-stack**: Concurrent processes for frontend + backend with a single command

### 2. Database Setup (if applicable)

Based on tech-stack.md, set up local database:
- **SQLite**: No setup needed, but configure the dev database path
- **PostgreSQL/MySQL**: Docker Compose setup OR instructions for local install
- **In-memory option**: For fast testing without persistence

Include:
- Database creation/initialization script
- Seed data script (sample data to work with during development)
- Database reset command (drop and recreate)
- Migration commands clearly documented

### 3. Environment Variables

Create environment configuration:
- `.env.example` — Template with all required variables (committed to git)
- `.env` — Actual local config (gitignored)
- Clear comments explaining each variable
- Sensible defaults for local development

Document which variables are required vs. optional for local dev.

### 4. Simple Commands (scripts or Makefile)

Create easy-to-remember commands for common tasks. Use whatever fits our stack:

**Option A: package.json scripts (Node projects)**
```json
{
  "scripts": {
    "dev": "starts everything needed for development",
    "test": "runs all tests",
    "test:watch": "runs tests in watch mode",
    "db:setup": "creates and seeds database",
    "db:reset": "drops and recreates database",
    "lint": "checks code style",
    "build": "creates production build"
  }
}
```

**Option B: Makefile (Python or polyglot projects)**
```makefile
dev:        # Start dev server with live reload
test:       # Run all tests
db-setup:   # Create and seed database
db-reset:   # Drop and recreate database
lint:       # Check code style
```

**Option C: Scripts directory**
```
scripts/
├── dev.sh          # Start dev server
├── test.sh         # Run tests
├── db-setup.sh     # Database setup
└── db-reset.sh     # Database reset
```

Whichever approach, the commands should be:
- Memorable (not cryptic flags)
- Documented (help text or comments)
- Idempotent where possible (safe to run twice)

### 5. Dependency Installation

Create a clear setup process for first-time installation:
```
1. Clone the repo
2. Copy .env.example to .env
3. Run [single install command]
4. Run [single setup command]
5. Run [dev command]
6. Open http://localhost:[port]
```

This should work on Mac, Linux, and Windows (WSL) if possible.

### 6. Documentation

Create `docs/dev-setup.md` covering:

**Getting Started**
- Prerequisites (Node version, Python version, Docker, etc.)
- Step-by-step first-time setup
- How to verify setup worked

**Daily Development**
- How to start the dev server
- How to run tests
- How to view the app in browser
- How to stop everything

**Common Tasks**
- Adding a new dependency
- Creating a database migration
- Resetting to a clean state
- Viewing logs

**Troubleshooting**
- Port already in use
- Database connection failed
- Dependencies out of sync
- "It works on my machine" issues

**For AI Agents**
- Commands to start dev server before Playwright testing
- How to verify the server is running
- How to check logs for errors

### 7. Update CLAUDE.md

Add a Dev Environment section AND populate the Key Commands table. The Key Commands table is the single source of truth for project-specific commands — the entire workflow references it instead of hardcoding commands.

**Add Key Commands table** to the Quick Reference section of CLAUDE.md. This is the single source of truth for project-specific commands — the entire workflow, CI pipeline, and worktree cleanup reference this table instead of hardcoding commands.

If a "Beads Commands" table exists (from Beads Setup), merge those commands into this table and remove the old table.
```markdown
### Key Commands

| Task | Command |
|------|---------|
| Start dev server | `<actual command>` |
| Run lint | `<actual command>` |
| Run tests | `<actual command>` |
| Run tests (watch) | `<actual command>` |
| Install dependencies | `<actual command>` |
| Reset database | `<actual command>` |
| View logs | `<actual command>` |
| Pick next task | `bd ready` |
| Claim task | `bd update <id> --status in_progress --claim` |
| Create task | `bd create "title" -p N` |
| Close task | `bd close <id>` |
| Sync tasks | `bd sync` |
```

Replace `<actual command>` with the real commands configured in this setup (e.g., `make lint`, `npm run lint`, `ruff check .`).


**Add Dev Environment section:**

## Verification

After setup, verify everything works:

1. [ ] Run the install command — completes without errors
2. [ ] Run the dev command — server starts successfully  
3. [ ] Open the app in browser — something renders (even if just "Hello World")
4. [ ] Make a small code change — browser updates automatically (live reload works)
5. [ ] Run the test command — tests execute (even if there are no tests yet)
6. [ ] Run database commands — database creates/resets successfully (if applicable)

If any step fails, fix it before considering this complete.

## What NOT to Do

- Don't require Docker unless the tech stack specifically needs it — adds complexity for beginners
- Don't set up production deployment — this is dev only
- Don't configure CI/CD here — that's in git-workflow.md
- Don't add optional tooling "nice-to-haves" — keep it minimal and working

## Process
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- Review docs/tech-stack.md to understand exactly what needs to be configured
- Review docs/project-structure.md to understand where config files should live
- Use AskUserQuestionTool to ask about:
  - Preferred ports (or use sensible defaults)
  - Docker vs. local database preference
  - Any services I already have installed
- After setup, walk me through the verification steps so I can confirm it works
- Commit all configuration files (except .env) to the repo



____________________________________
# Design System (Prompt)

Create a cohesive design system for this project that AI agents will use for all frontend work. The goal is a professional, polished UI without requiring design expertise from me.

Review docs/tech-stack.md to understand our frontend framework and any UI libraries already chosen. Review docs/plan.md to understand the application's purpose and target users.

I have no design experience, so I'm relying on you to make good choices and explain them simply.

## Mode Detection

Before starting, check if `docs/design-system.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:design-system v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tech-stack.md`, `docs/plan.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:design-system v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/design-system.md`
- **Secondary output**: Theme config files (tailwind.config.js, theme.ts, etc.)
- **Preserve**: All token values (colors, fonts, spacing), theme configuration, component pattern decisions, accessibility choices
- **Related docs**: `docs/tech-stack.md`, `docs/plan.md`
- **Special rules**: Never change color values, font families, or spacing scales without user approval — these define the visual identity. Preserve all theme config file customizations.

## Objectives

1. Define a complete visual language (colors, typography, spacing, etc.)
2. Configure our UI framework/library with these design tokens
3. Create reusable component patterns
4. Document everything so all AI agents build consistent UI
5. Show me examples so I can approve the direction

## What to Create

### 1. Design Foundation

Research modern design best practices and create a cohesive system:

**Color Palette**
- Primary color (main brand/action color)
- Secondary color (supporting color)
- Neutral colors (grays for text, backgrounds, borders)
- Semantic colors (success/green, warning/yellow, error/red, info/blue)
- Background colors (page, card, input)
- Text colors (primary, secondary, muted, inverse)

Provide specific hex/RGB values. Colors should:
- Have sufficient contrast for accessibility (WCAG AA minimum)
- Work well together (use color theory, not random picks)
- Feel appropriate for the application's purpose (per plan.md)

**Typography**
- Font family (use a professional, readable system font or Google Font)
- Font sizes scale (xs, sm, base, lg, xl, 2xl, 3xl, 4xl)
- Font weights (normal, medium, semibold, bold)
- Line heights
- Heading styles (h1-h6)
- Body text styles

**Spacing Scale**
- Consistent spacing units (e.g., 4px base: 4, 8, 12, 16, 24, 32, 48, 64)
- When to use each size (tight, normal, loose spacing contexts)

**Border Radius**
- Radius scale (none, sm, md, lg, full)
- Which radius to use where (buttons, cards, inputs, avatars)

**Shadows**
- Shadow scale (sm, md, lg, xl)
- When to use shadows (elevation, focus, hover)

### 2. Component Patterns

Define the standard appearance for common components. For each, specify exact styles:

**Buttons**
- Primary (main actions)
- Secondary (supporting actions)
- Outline/Ghost (subtle actions)
- Destructive (delete, remove)
- Sizes (sm, md, lg)
- States (default, hover, active, disabled, loading)

**Form Elements**
- Text inputs
- Textareas
- Selects/dropdowns
- Checkboxes and radios
- Labels
- Help text
- Error states and messages

**Cards**
- Default card container
- Interactive/clickable cards
- Card with header/footer

**Feedback**
- Toast notifications
- Alert banners
- Empty states
- Loading states (spinners, skeletons)
- Error pages (404, 500)

**Navigation**
- Header/navbar
- Sidebar (if applicable)
- Breadcrumbs
- Tabs
- Pagination

**Data Display**
- Tables
- Lists
- Badges/tags
- Avatars
- Stats/metrics

### 3. Layout System

Define standard layouts:
- Max content width
- Page padding/margins
- Grid system (if using)
- Responsive breakpoints (mobile, tablet, desktop)
- Standard page templates (dashboard, form page, detail page, list page)

### 4. Configuration Files

Based on our tech stack, create the actual configuration:

**If using Tailwind CSS:**
- `tailwind.config.js` with custom theme (colors, fonts, spacing)
- Any custom utility classes needed

**If using CSS-in-JS or CSS Modules:**
- Design tokens file (variables)
- Global styles

**If using a component library (shadcn/ui, Material UI, Chakra, etc.):**
- Theme configuration file
- Component customizations to match our design

**If using plain CSS:**
- CSS custom properties (variables) file
- Base/reset styles

### 5. Documentation

Create `docs/design-system.md` covering:

**Quick Reference**
| Element | Value |
|---------|-------|
| Primary color | #XXXX |
| Font family | [font] |
| Base spacing | Xpx |
| Border radius | Xpx |

**Color Palette**
- Visual swatches with hex values
- When to use each color

**Typography**
- Examples of each heading/text style
- When to use each

**Component Gallery**
- Visual example or description of each component pattern
- Code snippet showing how to implement

**Do's and Don'ts**
- Common mistakes to avoid
- Examples of good vs. bad usage

### 6. Example Implementation

Create a sample page or component that demonstrates the design system in action:
- Uses the color palette correctly
- Demonstrates typography scale
- Shows proper spacing
- Includes multiple component types (buttons, forms, cards)

This lets me see and approve the overall look before agents build real features.

### 7. Update Coding Standards

Add a "Styling / Design System" section to `docs/coding-standards.md`:
```markdown
## Styling / Design System

- **Use ONLY design token values** — no arbitrary hex colors, pixel values, or hardcoded spacing. All values must come from the design system configuration.
- **Reference component patterns** from `docs/design-system.md` before creating new component styles. Don't reinvent existing patterns.
- **Use the project's styling approach** (Tailwind classes, CSS modules, styled-components, etc.) as defined in the design system — don't mix approaches.
- **Test at minimum two viewports** — mobile (375px) and desktop (1280px) — for any UI work.
- **Design system config**: [path to tailwind.config.js / theme file / tokens file]

For the full design system reference including color palette, typography, spacing, and component patterns, see `docs/design-system.md`.
```

### 8. Update CLAUDE.md

Add a Design section:
```markdown
## Design System

Before building any UI, review docs/design-system.md.

### Key Rules
- Use ONLY colors from the defined palette — no arbitrary hex values
- Use ONLY spacing values from the scale — no arbitrary pixel values
- Follow component patterns exactly — don't invent new button styles
- Test at mobile (375px) and desktop (1280px) minimum

### Quick Reference
- Primary: [color]
- Background: [color]  
- Font: [font]
- Border radius: [value]
- Config: [path to tailwind.config.js or theme file]
```

## Design Direction Input

Use AskUserQuestionTool to ask me:

1. **Overall Feel**: What vibe fits the application?
   - Clean and minimal (lots of white space, subtle colors)
   - Bold and modern (strong colors, prominent elements)
   - Warm and friendly (soft colors, rounded corners)
   - Professional and serious (muted colors, sharp edges)

2. **Color Preference**: Any colors I specifically want or want to avoid?
   - Show me 2-3 palette options based on my answer

3. **Reference Apps**: Any applications whose design I admire?
   - This helps calibrate the direction

4. **Dark Mode**: Do I want to support dark mode in v1?
   - Adds complexity, can defer if not essential

## What NOT to Do

- Don't invent an overly complex design system — keep it practical for the features we're building
- Don't pick trendy fonts that sacrifice readability
- Don't use colors that fail accessibility contrast checks
- Don't create dozens of component variants we won't use
- Don't configure dark mode unless I explicitly want it

## Process
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- Research modern design systems (Tailwind defaults, shadcn/ui, Radix, Linear, Vercel) for inspiration
- Ask me design direction questions early, before making choices
- Present a sample visual (via the example implementation) for approval before documenting everything
- Configure the actual theme files — not just documentation
- Verify the configuration works by running the dev server and viewing the example page
- Commit all design system files to the repo



___________________________________________
# Git Workflow (Prompt)

Create `docs/git-workflow.md` and configure the repository to support parallel Claude Code sessions working simultaneously without conflicts.

Review CLAUDE.md, docs/tech-stack.md, and docs/coding-standards.md to understand the existing project conventions.

**Command placeholders:** This prompt uses `<install-deps>`, `<lint>`, and `<test>` as placeholders. When creating `docs/git-workflow.md`, replace these with the actual commands from the project's CLAUDE.md Key Commands table (e.g., `npm install`, `make lint`, `make test`). These are configured by the Dev Setup prompt.

## Mode Detection

Before starting, check if `docs/git-workflow.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:git-workflow v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`CLAUDE.md`, `docs/dev-setup.md`, `docs/coding-standards.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:git-workflow v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/git-workflow.md`
- **Secondary output**: `scripts/setup-agent-worktree.sh`, CI config files, CLAUDE.md workflow sections
- **Preserve**: CI job names (branch protection references these), worktree script customizations, branch naming conventions, PR template customizations
- **Related docs**: `CLAUDE.md`, `docs/dev-setup.md`, `docs/coding-standards.md`
- **Special rules**: Never rename CI jobs without checking branch protection rules. Preserve worktree directory naming conventions. Keep the setup-agent-worktree.sh script's customizations intact.

## The Core Problem

Multiple Claude Code agents will work in parallel, each pulling tasks from Beads (`bd ready`). They'll be working on separate feature branches, pushing, creating PRs, and merging into main concurrently. The workflow must prevent merge conflicts, a broken main branch, and agents stepping on each other's work.

## CRITICAL: Permanent Worktrees for Parallel Agents

Git only allows ONE branch checked out per working directory. Multiple Claude Code sessions in the same directory will fight over the git working tree — switching branches, stashing work, and corrupting changes.

**Solution: Each agent gets a permanent worktree created once. Agents use normal git branching inside their worktree.**

```
project/                  # Main repo (your orchestration point)
project-agent-1/          # Agent 1's permanent worktree
project-agent-2/          # Agent 2's permanent worktree
project-agent-3/          # Agent 3's permanent worktree
```

### Setup Script

Create `scripts/setup-agent-worktree.sh`:

```bash
#!/bin/bash
# Creates a permanent worktree for a Claude Code agent.
# Run once per agent. Agents use normal git branching inside their worktree.
# Usage: ./scripts/setup-agent-worktree.sh <agent-name>
# Example: ./scripts/setup-agent-worktree.sh Agent-1

set -e

AGENT_NAME="$1"

if [ -z "$AGENT_NAME" ]; then
    echo "Usage: $0 <agent-name>"
    echo "Example: $0 Agent-1"
    exit 1
fi

REPO_NAME=$(basename "$(pwd)")
# Normalize agent name for directory (lowercase, hyphens)
DIR_SUFFIX=$(echo "$AGENT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
WORKTREE_DIR="../${REPO_NAME}-${DIR_SUFFIX}"

if [ -d "$WORKTREE_DIR" ]; then
    echo "⚠️  Worktree already exists: $WORKTREE_DIR"
    echo "   To launch: cd $WORKTREE_DIR && BD_ACTOR=\"$AGENT_NAME\" claude"
    exit 0
fi

git fetch origin

# Can't checkout main in multiple worktrees, so each agent gets a workspace branch
WORKSPACE_BRANCH="${DIR_SUFFIX}-workspace"
git worktree add "$WORKTREE_DIR" -b "$WORKSPACE_BRANCH" origin/main

echo ""
echo "✅ Permanent worktree created: $WORKTREE_DIR"
echo ""
echo "To launch Claude Code in this worktree:"
echo "  cd $WORKTREE_DIR && BD_ACTOR=\"$AGENT_NAME\" claude"
echo ""
echo "This worktree is reusable across tasks. Do NOT remove it between tasks."
echo ""
echo "Agents create feature branches from origin/main:"
echo "  git fetch origin"
echo "  git checkout -b bd-<task-id>/<desc> origin/main"
```

Make executable: `chmod +x scripts/setup-agent-worktree.sh`

### Agent Identity with BD_ACTOR

Beads resolves task assignee from: `--actor flag` > `$BD_ACTOR env var` > `git config user.name` > `$USER`

Without BD_ACTOR, all agents show as your git username, making it impossible to tell which agent owns which task.

```bash
# Launch agents with distinct identities
cd ../project-agent-1 && BD_ACTOR="Agent-1" claude
cd ../project-agent-2 && BD_ACTOR="Agent-2" claude
```

### Full Parallel Launch Workflow

**One-time setup (run from main repo):**
```bash
./scripts/setup-agent-worktree.sh Agent-1
./scripts/setup-agent-worktree.sh Agent-2
./scripts/setup-agent-worktree.sh Agent-3
```

**Launch agents (each in its own terminal):**
```bash
cd ../project-agent-1 && BD_ACTOR="Agent-1" claude
cd ../project-agent-2 && BD_ACTOR="Agent-2" claude
cd ../project-agent-3 && BD_ACTOR="Agent-3" claude
```

**Inside their worktree, agents branch directly from origin/main:**
```bash
git fetch origin
git checkout -b bd-<task-id>/<description> origin/main
# work, commit, push, PR, watch CI, confirm merge...
bd close <task-id>
bd sync
git fetch origin --prune
git clean -fd
<install-deps>
bd ready  # continue to next task
# Create next feature branch directly from origin/main
git checkout -b bd-<next-task>/<description> origin/main
```

**Note:** Worktree agents cannot `git checkout main` (main is checked out in the main repo). They always branch from `origin/main` and never return to main between tasks. Merged feature branches accumulate locally and are batch-cleaned periodically (see Cleanup section).

### How Many Agents to Run

Match agent count to available parallel work, not some arbitrary max:
- Run `bd ready` to see how many unblocked tasks exist
- Only spin up as many agents as there are independent, non-overlapping tasks
- If two tasks touch the same files, don't run them in parallel — sequence them via Beads dependencies instead
- Running more agents than available parallel tasks wastes resources and invites conflicts

### Worktree Maintenance

Permanent worktrees accumulate stale build artifacts and dependencies between tasks. Agents should clean their workspace between tasks:

```bash
git fetch origin --prune
git clean -fd
<install-deps>
```

To batch-clean merged feature branches (run periodically):
```bash
git fetch origin --prune
git branch --merged origin/main | grep "bd-" | xargs -r git branch -d
```

### Worktree Management Commands

| Command | Purpose |
|---------|---------|
| `git worktree list` | Show all active worktrees |
| `git worktree add <path> <branch>` | Create new worktree |
| `git worktree remove <path>` | Remove worktree (only when reducing agent count) |
| `git worktree prune` | Clean up stale worktree references |

### Single-Agent Mode

If running only ONE Claude Code session at a time, worktrees are not needed. Standard branching in the main directory works fine.

## What the Document Must Cover

### 1. Branching Strategy
- Branch naming: `bd-<task-id>/<short-description>` (tied to Beads task IDs)
- Rule: one Beads task = one branch = one PR (no multi-task branches)
- Always branch from `origin/main`: `git checkout -b bd-<task-id>/<desc> origin/main`
- Branch lifecycle: create from origin/main → work → PR → squash merge → delete branch
- Stale branch policy: branches open longer than 2 days should be rebased or split into smaller tasks

### 2. Commit Standards
- Commit message format: `[BD-<id>] type(scope): description`
- Types: feat, fix, test, refactor, docs, chore
- Commit on each meaningful change — passing tests, completed function, etc.
- Never commit: secrets, .env files, large binaries, build artifacts
- Put the format in CLAUDE.md and trust agents to follow it (no validation hooks needed — they add friction and derail agents on formatting trivia)

### 3. Rebase Strategy for Parallel Agents

**Use rebase, not merge commits.** With squash-merge PRs, rebase keeps history clean and simple.

- Before creating a PR, always rebase onto latest main: `git fetch origin && git rebase origin/main`
- If rebase produces conflicts the agent cannot resolve confidently, it should: stop, push the branch as-is, note the conflict in the PR description, and move to the next task
- Only use `--force-with-lease` on feature branches, never force push to main

### 4. PR Workflow

**Main branch is protected. Agents NEVER push directly to main.** The complete workflow:

```bash
# 1. Commit changes
git add .
git commit -m "[BD-<id>] type(scope): description"

# 2. Self-review (catch issues before external review)
# Spawn a review subagent to check changes against project standards
claude -p "Review changes on this branch vs origin/main. Check against docs/review-standards.md for P0/P1/P2 issues. Fix any issues found. Run <lint> and <test> after fixes. Commit fixes with [BD-<id>] fix: address self-review findings"

# 3. Rebase onto latest main
git fetch origin && git rebase origin/main

# 4. Push feature branch
git push -u origin HEAD

# 5. Create PR
gh pr create --title "[BD-<id>] type(scope): description" --body "Closes BD-<id>"

# 6. Enable auto-merge (merges after CI passes, deletes remote branch)
gh pr merge --squash --auto --delete-branch

# 7. Watch CI (blocks until checks pass or fail)
gh pr checks --watch --fail-fast
# If a check fails: fix locally, commit, push, re-run watch

# 8. Confirm merge
gh pr view --json state -q .state   # Must show "MERGED"
# NEVER close the task until this shows MERGED
```

**Key PR commands:**

| Command | Purpose |
|---------|---------|
| `gh pr create --title "..." --body "..."` | Create PR from current branch |
| `gh pr merge --squash --auto --delete-branch` | Queue auto-merge after CI passes |
| `gh pr checks --watch --fail-fast` | Watch CI, block until pass or fail |
| `gh pr view --json state -q .state` | Confirm merge completed |
| `gh pr list` | List open PRs |

**Why `--squash --auto --delete-branch`:**
- `--squash`: All branch commits become one clean commit on main
- `--auto`: Queues merge for when CI passes
- `--delete-branch`: Removes remote branch after merge (local cleaned up in task closure)

**If merge is blocked:**
- Don't use `--admin` to bypass CI
- Watch with `gh pr checks --watch --fail-fast`, fix failures, push, re-watch

### 5. Task Closure and Cleanup

After merge is confirmed:

**Single agent (main repo):**
```bash
bd close <id>
bd sync
git checkout main && git pull --rebase origin main
git branch -d bd-<task-id>/<short-desc>    # Local only; remote deleted by --delete-branch
git fetch origin --prune                    # Clean up stale remote refs
```

**Worktree agent:**
```bash
bd close <id>
bd sync
git fetch origin --prune                    # Clean up stale remote refs
git clean -fd
<install-deps>
# Next task branches directly from origin/main:
git checkout -b bd-<next-task>/<desc> origin/main
```

Worktree agents cannot checkout main (it's checked out in the main repo). They always branch from `origin/main`. Merged local branches accumulate and are batch-cleaned periodically (see Worktree Maintenance).

### 6. Agent Crash / Stale Work Recovery

When an agent session dies mid-task:

1. **Check the worktree state:**
   ```bash
   cd ../project-agent-N
   git status                    # See uncommitted work
   git log --oneline -5          # See what was committed
   bd list --actor Agent-N       # See what task was claimed
   ```

2. **If work is salvageable:** Commit it, push the branch, create the PR (or resume work in a new session)

3. **If work should be discarded:**
   ```bash
   # Single agent (main repo):
   git checkout main && git pull --rebase origin main
   git branch -D <stale-branch>

   # Worktree agent (use the workspace branch created during setup):
   git checkout <agent-name>-workspace
   git branch -D <stale-branch>

   # Either way, unclaim the task:
   bd update <task-id> --status ready
   ```

4. **Reset the worktree to clean state:**
   ```bash
   git clean -fd
   <install-deps>
   ```

### 7. Main Branch Protection

Configure branch protection on main with **CI checks required, but no human review gate** (since you're the sole developer orchestrating agents):

```bash
# Configure via GitHub CLI (run once)
gh api repos/{owner}/{repo}/branches/main/protection -X PUT -f \
  required_status_checks='{"strict":true,"contexts":["check"]}' \
  enforce_admins=false \
  required_pull_request_reviews=null \
  restrictions=null
```

**Important:** The `contexts` value must match the CI job name. The CI template (above) uses job name `check`, so use `"contexts":["check"]`. If your CI uses a different job name, update the context to match. After the first PR triggers CI, verify the exact status check context name with:
```bash
gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs --jq '.check_runs[].name'
```

**If the `gh api` command fails**, configure branch protection via the GitHub web UI:
1. Go to Settings → Branches → Add branch protection rule
2. Branch name pattern: `main`
3. Check: "Require status checks to pass before merging"
4. Search and add status check: `check` (or your CI job name)
5. Uncheck: "Require a pull request before merging" (or set required reviewers to 0)

What this gives you:
- PRs must pass CI before merging
- No review approval required (you're the only human)
- `enforce_admins=false` lets you push directly in emergencies
- Agents cannot accidentally push to main

If main breaks: you fix it directly with a hotfix PR, or push directly if `enforce_admins` is false.

### 8. Conflict Prevention

Keep it simple with one core rule:

> **If two tasks touch the same files, don't run them in parallel.** Use Beads dependencies to sequence them.

Additional guardrails:
- Keep PRs small and focused (one task = one PR). Smaller changes merge faster and conflict less.
- Rebase before creating PRs to catch conflicts early
- High-conflict files (route indexes, DB schemas, shared types) should be modified by one agent at a time — enforce via Beads task dependencies, not tooling

### 9. .gitignore and Repository Hygiene
- Ensure .gitignore is comprehensive for the project's tech stack
- Files that must be tracked vs. generated
- No code quality git hooks (linting, type checking, test runs) — let CI be the gatekeeper
- **Exception:** Beads data-sync hooks (`bd hooks install`) are allowed — these sync task tracking data, not code quality checks

### 10. Update CLAUDE.md

Add the following sections to CLAUDE.md:

**In Session Start section, add parallel agent note:**
```markdown
**If running multiple agents in parallel**: Each agent MUST be in its own permanent worktree with BD_ACTOR set. See docs/git-workflow.md for setup.
```

**Add Committing and PR Workflow section:**
```markdown
### Committing and Creating PRs

**NEVER push directly to main** — it's protected. Always use feature branches and PRs:

1. Commit: `git add . && git commit -m "[BD-<id>] type(scope): description"`
2. Rebase: `git fetch origin && git rebase origin/main`
3. Push: `git push -u origin HEAD`
4. Create PR: `gh pr create --title "[BD-<id>] type(scope): description" --body "Closes BD-<id>"`
5. Auto-merge: `gh pr merge --squash --auto --delete-branch`
6. Watch CI: `gh pr checks --watch --fail-fast` (fix failures, push, re-watch)
7. Confirm: `gh pr view --json state -q .state` — must show "MERGED"
```

**Add Task Closure and Next Task section:**
```markdown
### Task Closure and Next Task

After merge is confirmed (step 7 above):

**Single agent (main repo):**
```bash
bd close <id>
bd sync
git checkout main && git pull --rebase origin main
git branch -d bd-<task-id>/<short-desc>
git fetch origin --prune
bd ready
```

**Worktree agent:**
```bash
bd close <id>
bd sync
git fetch origin --prune
git clean -fd
<install-deps>
bd ready
# Next task branches directly from origin/main:
git checkout -b bd-<next-task>/<desc> origin/main
```

- If tasks remain: pick the lowest-ID, create a feature branch, and implement it
- If none remain: session is complete
- **Keep working until `bd ready` returns no available tasks**

**Note:** Worktree agents cannot checkout main (it's checked out in the main repo). They always branch from `origin/main`. Merged branches are batch-cleaned periodically.
```

**Add Parallel Sessions section:**
```markdown
### Parallel Sessions (Worktrees)

When running **multiple Claude Code agents simultaneously**, each MUST have:
1. Its own permanent git worktree (agents sharing a directory will corrupt each other's work)
2. BD_ACTOR environment variable set (for Beads task attribution)

**One-Time Setup (run from main repo):**
```bash
./scripts/setup-agent-worktree.sh Agent-1
./scripts/setup-agent-worktree.sh Agent-2
./scripts/setup-agent-worktree.sh Agent-3
```

**Launching Agents:**
```bash
cd ../project-agent-1 && BD_ACTOR="Agent-1" claude
cd ../project-agent-2 && BD_ACTOR="Agent-2" claude
```

Inside their worktree, agents branch directly from `origin/main` (they cannot checkout main). Between tasks:
```bash
git fetch origin --prune
git clean -fd && <install-deps>
```
```

**Add Worktree Awareness section:**
```markdown
### Worktree Awareness

If you are in a permanent worktree:
- **Never run `git checkout main`** — main is checked out in the main repo; this will fail
- Always branch from remote: `git checkout -b bd-<id>/<desc> origin/main`
- Verify your identity: `echo $BD_ACTOR` should show your agent name
- Clean workspace between tasks: `git fetch origin --prune && git clean -fd && <install-deps>`
- To detect if in a worktree: `git rev-parse --git-dir` contains `/worktrees/`
- Merged branches accumulate — they're batch-cleaned periodically, not per-task
```

**Add to Quick Reference table:**
| Command | Purpose |
|---------|---------|
| `./scripts/setup-agent-worktree.sh <n>` | Create permanent worktree for agent |
| `git worktree list` | List all active worktrees |
| `BD_ACTOR="Agent-1" claude` | Launch agent with Beads identity |
| `gh pr create --title "..." --body "..."` | Create PR from current branch |
| `gh pr merge --squash --auto --delete-branch` | Queue auto-merge after CI passes |
| `gh pr checks --watch --fail-fast` | Watch CI until pass or fail |
| `gh pr view --json state -q .state` | Confirm merge completed |
| `bd close <id>` | Close completed task |

**Add row to "When to Consult Other Docs" table:**
| Situation | Document |
|-----------|----------|
| Running multiple agents in parallel | docs/git-workflow.md |

## What to Configure in the Repository

After creating the documentation, actually set up:
- [ ] `scripts/setup-agent-worktree.sh` for permanent agent worktrees
- [ ] Branch protection on main: CI required, no review required (use `gh api` command from Section 7)
- [ ] PR template (`.github/pull_request_template.md`)
- [ ] .gitignore appropriate for the project's tech stack
- [ ] CI workflow file for automated checks on PRs (see below)
- [ ] `tasks/lessons.md` — if it doesn't already exist, create it (Beads Setup should have created this, but verify)

### CI Workflow File

Create `.github/workflows/ci.yml` using the project's actual lint and test commands from CLAUDE.md Key Commands table. The template below uses placeholders — replace them with the real commands from `docs/dev-setup.md`:

```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup environment
        # Add language/runtime setup per docs/tech-stack.md
        # e.g., uses: actions/setup-node@v4 / actions/setup-python@v5

      - name: Install dependencies
        run: <install-deps>

      - name: Lint
        run: <lint>

      - name: Test
        run: <test>
```

The `check` job name must match what's referenced in branch protection rules (Section 7). If the status check context name is different (e.g., `check / check`), update the branch protection accordingly.

### PR Template

Create `.github/pull_request_template.md`:

```markdown
## [BD-<id>] type(scope): description

### What
<!-- Brief description of changes -->

### User Story
<!-- Reference: US-XXX -->

### Testing
- [ ] All tests pass
- [ ] New tests added for new behavior
- [ ] Lint passes
- [ ] Manually verified (if UI change)

### Screenshots
<!-- If UI change, include before/after or key states -->
```

## What This Document Should NOT Be
- A git tutorial — assume agents know git commands
- Theoretical — every rule should be actionable
- Separate from CLAUDE.md — update CLAUDE.md to reference the git workflow doc

## Process
- After creating docs and configuration, commit everything to the repo
- Test the workflow by verifying branch protection and CI checks are active


____________________________________________________
# Multi-Model Code Review Loop (Prompt)

Set up a two-tier automated code review system: a local self-review before every PR (required for all projects), and an optional external Codex Cloud review loop that auto-fixes findings and auto-merges.

For background research, tool comparisons, and design decisions, see `Multi Model Review Research.md`. For cost analysis, see `Multi Model Review Cost Analysis.md`.

## Mode Detection

Before starting, check if `AGENTS.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read `AGENTS.md`, all workflow files in `.github/workflows/code-review-*.yml`, `.github/workflows/post-merge-followup.yml`, `docs/review-standards.md`, `.github/review-prompts/fix-prompt.md`, and `.github/review-prompts/followup-fix-prompt.md` completely. Check for a tracking comment on line 1 of `AGENTS.md`: `<!-- scaffold:multi-model-review v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing files against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing files
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/git-workflow.md`, `CLAUDE.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1 of `AGENTS.md`: `<!-- scaffold:multi-model-review v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `AGENTS.md`
- **Secondary output**: `.github/workflows/code-review-trigger.yml`, `.github/workflows/code-review-handler.yml`, `.github/workflows/codex-timeout.yml`, `.github/workflows/post-merge-followup.yml`, `docs/review-standards.md`, `.github/review-prompts/fix-prompt.md`, `.github/review-prompts/followup-fix-prompt.md`, `scripts/await-pr-review.sh`, `docs/git-workflow.md`
- **Preserve**: Custom review rules in `AGENTS.md`, `CODEX_BOT_NAME` env var, `MAX_REVIEW_ROUNDS` setting, `FOLLOWUP_ON_CAP` env var setting, repository-specific secrets configuration, custom severity rules in `docs/review-standards.md`
- **Related docs**: `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/git-workflow.md`, `CLAUDE.md`
- **Special rules**: Never change `CODEX_BOT_NAME` without verifying the actual bot username. Preserve all "What NOT to flag" customizations in `AGENTS.md`. Each secondary file should be checked independently for existence (update vs. create).

---

## Architecture

### Two-Tier Review

```
TIER 1: LOCAL SELF-REVIEW (before push — required, no extra cost)
  Agent runs review subagent → checks against docs/review-standards.md
       ↓
  Fixes P0/P1/P2 issues locally → runs lint + test → pushes

TIER 2: EXTERNAL CODEX CLOUD REVIEW (after PR — optional, credit-based)
  Codex Cloud auto-reviews via GitHub App (reads AGENTS.md)
       ↓
  Convergence check (GitHub Actions — event-driven, no polling)
  • No P0/P1 → auto-merge
  • Round >= 3 → auto-merge anyway (label: ai-review-capped)
  • Otherwise → Claude Code Action fixes (needs ANTHROPIC_API_KEY)
       ↓
  Push fixes → re-triggers Codex Cloud review

TIER 3: POST-MERGE FOLLOW-UP (after merge — catches escaped findings)
  PR merges with unresolved P0/P1 (capped, timed out, or late review)
       ↓
  post-merge-followup.yml detects unresolved findings
  • Creates Beads task (P1) + GitHub Issue for tracking
  • Claude Code auto-fixes on a follow-up branch
  • Follow-up PR created targeting main
```

**Tier 1 (self-review)** is built into the Git Workflow prompt and applies to ALL projects. It is inserted as a step in the PR workflow — see the Git Workflow prompt for the exact command.

**Tier 2 (Codex Cloud + CI fix loop)** is optional and per-project. The rest of this prompt sets up Tier 2.

### What Triggers What (Tier 2)

The loop is fully event-driven via two GitHub Actions workflows — no polling, no external orchestrator:

1. **PR opened or pushed** → `code-review-trigger.yml` runs gate check, labels round, adds `awaiting-codex-review` label
2. **Codex Cloud posts PR review** (event-driven — no polling, no wait job)
3. **`pull_request_review` event** → `code-review-handler.yml` fires, filters to Codex bot only
4. Handler checks review freshness (SHA match), runs convergence, labels result
5. **Approved or round cap** → auto-merge (tries `--auto`, falls back to direct merge if auto-merge is not enabled on the repo)
6. **Findings remain and rounds < cap** → Claude Code Action reads P0/P1 findings, fixes, pushes
7. **New push on PR branch** → re-triggers step 1
8. *(Optional)* `codex-timeout.yml` runs on a cron schedule — finds PRs with stale `awaiting-codex-review` label (>15 min) and auto-approves them
9. **PR merged with unresolved findings** → `post-merge-followup.yml` fires on `pull_request: [closed]`
10. **Late Codex review on already-merged PR** → `post-merge-followup.yml` fires on `pull_request_review: [submitted]`
11. Follow-up workflow creates Beads task, GitHub Issue, fix branch, and follow-up PR

### Safety Rails

- **Round cap**: Maximum 3 review rounds. After that, the PR auto-merges with the `ai-review-capped` label — no human gate.
- **Bot-loop prevention**: Review workflow skips if the latest commit author is the fix bot AND the round cap is hit. The fix job only fires when the convergence job says "fix," not on raw push events.
- **Cost cap**: Claude Code Action fix gets `--max-turns 10`. Round 1 uses Sonnet (~$0.84/round); round 2+ escalates to Opus (~$1.40/round). Codex Cloud reviews are credit-based (weekly limits apply, ~25 credits per review).
- **Read-only reviewer**: Codex Cloud has no write access. Only Claude Code Action (the engineer) has `contents: write`.
- **Fork protection**: Gate job blocks fork PRs and draft PRs from triggering the review loop (prevents secret exfiltration via malicious PRs).
- **Human override**: Any repo member comment with `/lgtm` or `/skip-review` bypasses the loop and allows merge (verified via `author_association`).
- **File filter**: Gate job uses the GitHub API to check changed files and skips review if only docs/config files changed (markdown, yaml, json, toml, lock files).
- **Usage-limit detection**: If Codex Cloud hits its credit limit and posts a usage-limit message instead of a review, the handler adds an `ai-review-blocked` label and requires human merge (does NOT auto-approve).
- **Follow-up dedup**: `followup-created` label on original PR prevents duplicate follow-ups
- **Recursion prevention**: `followup-fix` label on follow-up PRs prevents follow-ups-of-follow-ups
- **Code-change gate**: Follow-up PR is only created if Claude Code produces actual non-`.beads/` file changes
- **Graceful degradation**: If Claude Code can't fix the findings, the Beads task + GitHub Issue still exist for manual pickup
- **Follow-up cost**: Each follow-up uses Opus (~$1.40) with 15 max turns. Follow-ups are rare — expect 0-2 per week
- **Agent merge gate**: `scripts/await-pr-review.sh` forces agents to wait for the Codex review before merging. Without this, agents race the review when `--auto` is unavailable. The script polls for the review and returns distinct exit codes for approved/findings/timeout/skipped/error.
- **No `--admin`**: Agents are explicitly prohibited from using `gh pr merge --admin` in the CLAUDE.md workflow. The `--admin` flag bypasses all protections including Codex Cloud review.

---

## Prerequisites

| Requirement | How to Get It |
|-------------|--------------|
| **ChatGPT subscription (Plus/Pro/Team)** | For Codex Cloud auto-reviews — subscribe at chatgpt.com. Reviews use credits (~25 credits per review); weekly limits vary by plan. |
| **Codex Cloud GitHub App** | Install "ChatGPT Codex Connector" on your repo at github.com, then enable "Code review" in Codex settings. The default bot username `chatgpt-codex-connector[bot]` is pre-configured in the workflow. |
| **Anthropic API key** | Create at console.anthropic.com → run `gh secret set ANTHROPIC_API_KEY` and paste when prompted (for Claude Code Action fixes, ~$5-7/month) |
| **GitHub App (Claude)** | Run `claude /install-github-app` in Claude Code terminal, or install from github.com/apps/claude |
| **Codex Cloud credits** | Codex Cloud has usage limits for code reviews. Check your limits at chatgpt.com/codex/settings/usage. You may need to add credits or upgrade your plan. |
| **Repo permissions** | Actions must have Read/Write permissions: Settings → Actions → General → Workflow permissions |

---

## What to Create

### 1. Review Standards Document (`docs/review-standards.md`)

Create a document that ALL reviewers (self-review, Codex Cloud, and human) reference. This is the single source of truth for what "good code" means in this project. Pull content from your existing docs:

```markdown
# Code Review Standards

## Source Documents
Reviewers should check code against these project standards:
- `CLAUDE.md` — Workflow rules, commit format, Key Commands
- `docs/coding-standards.md` — Naming, patterns, styling rules
- `docs/tdd-standards.md` — Test categories, coverage requirements
- `docs/project-structure.md` — File organization, module boundaries

## Review Priorities (in order)
1. **Correctness** — Does the code do what the task/story requires?
2. **Security** — Input validation, auth checks, no hardcoded secrets
3. **Test coverage** — Failing test written first? Edge cases covered?
4. **Standards compliance** — Matches project conventions from docs above?
5. **Performance** — No obvious N+1 queries, memory leaks, blocking calls
6. **Maintainability** — Clear naming, reasonable complexity, no magic numbers

## What NOT to Flag
- Style/formatting issues (linter handles these)
- Import ordering (linter handles this)
- Minor naming preferences that don't violate documented conventions
- "I would have done it differently" without a concrete improvement

## Severity Definitions
- **P0 (critical)**: Will cause data loss, security vulnerability, or crash in production
- **P1 (high)**: Bug that will manifest in normal usage, or violates a MUST rule from standards
- **P2 (medium)**: Code smell, missing edge case, or SHOULD-level standards violation
- **P3 (low)**: Suggestion for improvement, not a defect — do NOT fix in review loop
```

### 2. AGENTS.md (repo root)

Codex Cloud reads `AGENTS.md` at the repo root for custom review instructions. Create this file:

```markdown
# AGENTS.md

## Review guidelines

You are reviewing a pull request as an independent code reviewer. You did NOT write this code.

NOTE: Codex GitHub reviews flag only P0/P1. P2/P3 are handled by local self-review.

### What to Check
Read `docs/review-standards.md` for the full review criteria, priorities, and severity definitions.

Also read these project standards:
- `docs/coding-standards.md` — Code conventions
- `docs/tdd-standards.md` — Testing requirements
- `CLAUDE.md` — Workflow and commit rules

### Severity Levels
Use these severity levels in your review:
- **P0 (critical)**: Data loss, security vulnerability, production crash
- **P1 (high)**: Bug in normal usage, MUST-rule violation

### Approval Signal
If there are NO P0 or P1 issues, your review MUST include this exact line:
```
APPROVED: No P0/P1 issues found.
```

If there ARE findings, list each one with its severity, file, line, and a concrete suggestion.

### Rules
- Only flag P0 and P1 issues. Skip P2 (medium) and P3 (low) — those are handled by local self-review and humans.
- Be specific: include exact file paths and line numbers.
- For each finding, include a concrete suggestion for how to fix it.
- Do not push commits or modify the PR; review only.
- Do NOT flag style/formatting issues — the linter handles those.
- Do NOT suggest alternative approaches unless the current one has a defect.
- Do NOT rewrite working code just because you'd do it differently.
```

### 3. Fix Prompt (`.github/review-prompts/fix-prompt.md`)

```markdown
You are the engineer who wrote this PR. Codex Cloud has posted review findings.

## Your Task
1. Read ALL review findings from Codex Cloud for the CURRENT commit. Findings are posted as inline PR review comments. Use:
   `gh api repos/OWNER/REPO/pulls/NUMBER/comments --jq '.[] | select(.user.login == "chatgpt-codex-connector[bot]" and .commit_id == "COMMIT_SHA") | {path, line, start_line, body, diff_hunk}'`
   (Replace OWNER/REPO, NUMBER, and COMMIT_SHA with the values passed via the workflow.)
2. For each **P0** or **P1** finding:
   - If the finding is valid: fix the code.
   - If the finding is a false positive: note why in a reply comment.
3. Run the project's lint and test commands (see CLAUDE.md Key Commands) to verify fixes.
4. Commit your fixes with message: `[BD-<task-id>] fix: address review feedback (round N)`
5. Push to the PR branch.

## Rules
- Fix P0 and P1 issues — Codex Cloud only flags these two severity levels.
- Do NOT fix P3 (low) issues — those are suggestions, not defects.
- Do NOT refactor unrelated code.
- Keep changes minimal and surgical.
- If a reviewer finding contradicts project standards (in docs/coding-standards.md or docs/tdd-standards.md), follow the project standards and explain why in a comment.
- After fixing, post a summary comment listing what you fixed and what you declined (with reasons).

## Project Standards
- `CLAUDE.md` — Workflow rules, Key Commands for lint/test
- `docs/coding-standards.md` — Conventions to follow
- `docs/tdd-standards.md` — Test requirements
- `docs/review-standards.md` — Severity definitions
```

### 3b. Follow-Up Fix Prompt (`.github/review-prompts/followup-fix-prompt.md`)

```markdown
You are fixing unresolved P0/P1 findings from a PR that has already merged to main.

## Context
- The original PR (#ORIGINAL_PR) merged with unresolved findings (capped, timed out, or late review)
- You are working on a follow-up branch checked out from main
- Line numbers from the original review may have shifted — use `diff_hunk` context to locate code
- A Beads task (BEADS_TASK) and GitHub Issue (ISSUE_URL) track this work

## Available Variables
These are passed by the workflow:
- `REPO` — The repository (owner/name)
- `ORIGINAL_PR` — The PR number that merged with unresolved findings
- `BEADS_TASK` — The Beads task ID for this follow-up
- `ISSUE_URL` — The GitHub Issue URL tracking this follow-up

## Your Task
1. Read the findings from `/tmp/followup-findings.json` (pre-collected by the workflow). Each finding has `path`, `line`, `start_line`, `body`, and `diff_hunk`.
2. For each **P0** or **P1** finding:
   - Locate the code using `diff_hunk` context (line numbers may have shifted since merge)
   - If the code still exists and the finding is valid: fix it
   - If the code no longer exists (refactored/removed since merge): skip it and note why
   - If the finding is a false positive: skip it and note why
3. Run the project's lint and test commands (see CLAUDE.md Key Commands) to verify fixes.
4. Commit your fixes with message: `[BD-BEADS_TASK] fix: address unresolved findings from #ORIGINAL_PR`
5. Do NOT push — the workflow handles pushing.
6. Do NOT create a PR — the workflow handles PR creation.
7. Do NOT run `bd close` — the workflow handles task closure.

## Rules
- Fix P0 and P1 issues only.
- Do NOT refactor unrelated code.
- Keep changes minimal and surgical.
- If a finding contradicts project standards (in docs/coding-standards.md or docs/tdd-standards.md), follow the project standards and note why.

## Project Standards
- `CLAUDE.md` — Workflow rules, Key Commands for lint/test
- `docs/coding-standards.md` — Conventions to follow
- `docs/tdd-standards.md` — Test requirements
- `docs/review-standards.md` — Severity definitions
```

### 4. GitHub Actions Workflows

The review loop uses two event-driven workflows (no polling) plus an optional timeout workflow:

#### 4a. Trigger Workflow (`.github/workflows/code-review-trigger.yml`)

Runs on PR open/push. Checks the gate, labels the round, and adds `awaiting-codex-review`. No checkout needed — uses API calls only.

```yaml
name: "Code Review: Trigger"

on:
  pull_request:
    types: [opened, synchronize]

concurrency:
  group: review-trigger-${{ github.event.pull_request.number }}
  cancel-in-progress: true

env:
  MAX_REVIEW_ROUNDS: 3

jobs:
  check-gate:
    runs-on: ubuntu-latest
    outputs:
      should_review: ${{ steps.gate.outputs.should_review }}
      current_round: ${{ steps.gate.outputs.current_round }}
    steps:
      - name: Check review gate
        id: gate
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}

          # Block fork PRs (security — prevents secret exfiltration)
          if [ "${{ github.event.pull_request.head.repo.full_name }}" != "${{ github.repository }}" ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Fork PR — skipping automation"
            exit 0
          fi

          # Skip draft PRs
          if [ "${{ github.event.pull_request.draft }}" = "true" ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Draft PR — skipping review"
            exit 0
          fi

          # Check if any code files changed (skip for docs/config-only PRs)
          CODE_CHANGED=$(gh api "repos/$REPO/pulls/$PR/files" --paginate \
            --jq '[.[].filename | select(test("\\.(md|ya?ml|jsonl?|toml|lock)$") | not)] | length')

          if [ "$CODE_CHANGED" -eq 0 ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "No code files changed — skipping review"
            exit 0
          fi

          # Count existing review-round labels
          ROUND_LABELS=$(gh api "repos/$REPO/issues/$PR/labels" \
            --jq '[.[].name | select(startswith("review-round-"))] | length')
          CURRENT_ROUND=$((ROUND_LABELS + 1))
          echo "current_round=$CURRENT_ROUND" >> $GITHUB_OUTPUT

          # Check for human override (only from repo members)
          OVERRIDE=$(gh api "repos/$REPO/issues/$PR/comments" \
            --jq '[.[] | select(
              (.author_association | IN("OWNER","MEMBER","COLLABORATOR"))
              and (.body | test("(^|\\s)/(skip-review|lgtm)(\\s|$)"; "i"))
            )] | length')

          if [ "$OVERRIDE" -gt 0 ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Human override detected — skipping review"
          elif [ "$CURRENT_ROUND" -gt "$MAX_REVIEW_ROUNDS" ]; then
            echo "should_review=false" >> $GITHUB_OUTPUT
            echo "Max rounds reached — skipping review"
          else
            echo "should_review=true" >> $GITHUB_OUTPUT
          fi

  label-and-signal:
    needs: check-gate
    if: needs.check-gate.outputs.should_review == 'true'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Label round and add awaiting-codex-review
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          ROUND=${{ needs.check-gate.outputs.current_round }}

          # Label the round
          gh api "repos/$REPO/issues/$PR/labels" \
            -X POST -f "labels[]=review-round-$ROUND" || true

          # Add awaiting-codex-review label (removed by handler when review arrives)
          gh api "repos/$REPO/issues/$PR/labels" \
            -X POST -f "labels[]=awaiting-codex-review" || true
```

#### 4b. Handler Workflow (`.github/workflows/code-review-handler.yml`)

Fires when Codex Cloud posts a PR review or comment. Checks freshness, runs convergence, auto-merges or triggers fix.

```yaml
name: "Code Review: Handler"

on:
  pull_request_review:
    types: [submitted]
  issue_comment:
    types: [created]

env:
  MAX_REVIEW_ROUNDS: 3
  CODEX_BOT_NAME: "chatgpt-codex-connector[bot]"
  FOLLOWUP_ON_CAP: "auto-merge-followup"  # or "block-merge"

jobs:
  # ─── Handle Codex usage-limit comments ─────────────────
  check-usage-limit:
    if: >-
      github.event_name == 'issue_comment'
      && github.event.issue.pull_request
      && github.event.comment.user.login == 'chatgpt-codex-connector[bot]'
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Check for usage-limit message
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          BODY="${{ github.event.comment.body }}"
          PR=${{ github.event.issue.number }}
          REPO=${{ github.repository }}

          if echo "$BODY" | grep -qi "usage limit"; then
            # Remove awaiting label, add blocked label
            gh api "repos/$REPO/issues/$PR/labels/awaiting-codex-review" -X DELETE || true
            gh api "repos/$REPO/issues/$PR/labels" \
              -X POST -f "labels[]=ai-review-blocked" || true

            gh pr comment "$PR" --repo "$REPO" --body "## Code Review: BLOCKED (usage limit)

          Codex Cloud hit its credit limit and cannot review this PR.
          A human must review and merge this PR manually.

          _Remove the \`ai-review-blocked\` label and push a new commit to retry._"
          fi

  # ─── Handle Codex PR review ────────────────────────────
  handle-review:
    if: >-
      github.event_name == 'pull_request_review'
      && github.event.review.user.login == 'chatgpt-codex-connector[bot]'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    outputs:
      verdict: ${{ steps.converge.outputs.verdict }}
      current_round: ${{ steps.round.outputs.current_round }}
    steps:
      - name: Check review freshness
        id: fresh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          REVIEW_SHA="${{ github.event.review.commit_id }}"
          HEAD_SHA="${{ github.event.pull_request.head.sha }}"

          if [ "$REVIEW_SHA" != "$HEAD_SHA" ]; then
            echo "is_fresh=false" >> $GITHUB_OUTPUT
            echo "Stale review (commit $REVIEW_SHA vs HEAD $HEAD_SHA) — skipping"
          else
            echo "is_fresh=true" >> $GITHUB_OUTPUT
          fi

      - name: Get current round
        id: round
        if: steps.fresh.outputs.is_fresh == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          ROUND_LABELS=$(gh api "repos/$REPO/issues/$PR/labels" \
            --jq '[.[].name | select(startswith("review-round-"))] | length')
          echo "current_round=$ROUND_LABELS" >> $GITHUB_OUTPUT

      - name: Remove awaiting label
        if: steps.fresh.outputs.is_fresh == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh api "repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/labels/awaiting-codex-review" \
            -X DELETE || true

      - name: Convergence check
        id: converge
        if: steps.fresh.outputs.is_fresh == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REVIEW_BODY: ${{ github.event.review.body }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          HEAD_SHA="${{ github.event.pull_request.head.sha }}"
          ROUND=${{ steps.round.outputs.current_round }}
          BOT="${{ env.CODEX_BOT_NAME }}"

          echo "Round: $ROUND"

          # 1. Check for explicit approval signal
          if echo "$REVIEW_BODY" | grep -q "APPROVED: No P0/P1 issues found"; then
            echo "verdict=approved" >> $GITHUB_OUTPUT
            echo "Codex Cloud explicitly approved"
            exit 0
          fi

          # 2. Check for zero inline findings on current commit
          FINDINGS=$(gh api "repos/$REPO/pulls/$PR/comments" \
            --jq "[.[] | select(.user.login == \"$BOT\" and .commit_id == \"$HEAD_SHA\")] | length")

          if [ "$FINDINGS" -eq 0 ]; then
            echo "verdict=approved" >> $GITHUB_OUTPUT
            echo "Codex Cloud reviewed with no inline findings — approved"
            exit 0
          fi

          # 3. Check round cap
          if [ "$ROUND" -ge "$MAX_REVIEW_ROUNDS" ]; then
            if [ "$FOLLOWUP_ON_CAP" = "block-merge" ]; then
              echo "verdict=capped-blocked" >> $GITHUB_OUTPUT
              echo "Max rounds reached — blocking merge (FOLLOWUP_ON_CAP=block-merge)"
            else
              echo "verdict=capped" >> $GITHUB_OUTPUT
              echo "Max rounds reached — auto-merging with follow-up"
            fi
            exit 0
          fi

          # 4. Findings remain, rounds left — fix
          echo "verdict=fix" >> $GITHUB_OUTPUT
          echo "$FINDINGS finding(s) present — triggering fix cycle"

      - name: Handle verdict
        if: steps.fresh.outputs.is_fresh == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          VERDICT="${{ steps.converge.outputs.verdict }}"
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}
          ROUND=${{ steps.round.outputs.current_round }}

          if [ "$VERDICT" = "approved" ]; then
            gh pr comment "$PR" --repo "$REPO" --body "## Code Review: APPROVED

          Codex Cloud found no P0/P1 issues. This PR is ready to merge.

          _Round $ROUND of $MAX_REVIEW_ROUNDS_"

            gh api "repos/$REPO/issues/$PR/labels" \
              -X POST -f "labels[]=ai-review-approved" || true

          elif [ "$VERDICT" = "capped" ]; then
            gh pr comment "$PR" --repo "$REPO" --body "## Code Review: AUTO-MERGING (round cap)

          After $MAX_REVIEW_ROUNDS rounds, some findings may remain.
          Auto-merging — a follow-up PR will address remaining findings.

          _Reached maximum review rounds._"

            gh api "repos/$REPO/issues/$PR/labels" \
              -X POST -f "labels[]=ai-review-capped" || true

          elif [ "$VERDICT" = "capped-blocked" ]; then
            gh pr comment "$PR" --repo "$REPO" --body "## Code Review: NEEDS HUMAN REVIEW (round cap)

          After $MAX_REVIEW_ROUNDS rounds, P0/P1 findings remain.
          \`FOLLOWUP_ON_CAP\` is set to \`block-merge\` — a human must review and merge.

          _Reached maximum review rounds._"

            gh api "repos/$REPO/issues/$PR/labels" \
              -X POST -f "labels[]=ai-review-capped" || true
            gh api "repos/$REPO/issues/$PR/labels" \
              -X POST -f "labels[]=needs-human-review" || true
          fi

  # ─── Auto-merge (approved or capped) ────────────────────
  auto-merge:
    needs: [handle-review]
    if: >-
      needs.handle-review.outputs.verdict == 'approved'
      || needs.handle-review.outputs.verdict == 'capped'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Auto-merge PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}

          # Try --auto first (works if allow_auto_merge is enabled on repo)
          if gh pr merge "$PR" --repo "$REPO" --squash --auto --delete-branch 2>/dev/null; then
            echo "Auto-merge queued — will merge when CI passes"
          else
            echo "Auto-merge not available — merging directly"
            gh pr merge "$PR" --repo "$REPO" --squash --delete-branch
          fi

  # ─── Claude Code Fix (only if findings remain) ──────────
  claude-fix:
    needs: [handle-review]
    if: needs.handle-review.outputs.verdict == 'fix'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.ref }}
          fetch-depth: 0

      - name: Select fix model
        id: model
        run: |
          ROUND=${{ needs.handle-review.outputs.current_round }}
          # Round 1: Sonnet handles straightforward fixes at lower cost
          # Round 2+: Escalate to Opus if prior fix attempt didn't satisfy reviewer
          if [ "${ROUND:-1}" -gt 1 ]; then
            echo "selected=claude-opus-4-6" >> $GITHUB_OUTPUT
            echo "Using Opus (round ${ROUND} — escalating after prior fix attempt)"
          else
            echo "selected=claude-sonnet-4-5-20250929" >> $GITHUB_OUTPUT
            echo "Using Sonnet (round ${ROUND} — first fix attempt)"
          fi

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          allowed_bots: 'claude[bot]'
          prompt: |
            REPO: ${{ github.repository }}
            PR_NUMBER: ${{ github.event.pull_request.number }}
            REVIEW_ROUND: ${{ needs.handle-review.outputs.current_round }}
            HEAD_SHA: ${{ github.event.pull_request.head.sha }}

            Read .github/review-prompts/fix-prompt.md for your full instructions.

            Codex Cloud has posted review findings as PR review comments (inline on files).
            To read them, run: gh api repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/comments --jq '.[] | select(.user.login == "${{ env.CODEX_BOT_NAME }}" and .commit_id == "${{ github.event.pull_request.head.sha }}") | {path, line, start_line, body, diff_hunk}'
            Fix the P0 and P1 issues identified.
            Run lint and test commands from CLAUDE.md Key Commands to verify.
            Commit and push your fixes.
          claude_args: |
            --model ${{ steps.model.outputs.selected }}
            --allowedTools "Bash(git:*),Bash(gh:*),Bash(make:*),Bash(npm:*),Read,Write,Edit,Bash(pip:*),Bash(cd:*),Bash(uv:*),Bash(pnpm:*)"
            --max-turns 10
```

#### 4c. Timeout Workflow (`.github/workflows/codex-timeout.yml`) — Optional

If Codex Cloud doesn't respond within 15 minutes, this cron job auto-approves the PR. Only create this if you want a fallback for unresponsive Codex Cloud reviews.

```yaml
name: "Code Review: Codex Timeout"

on:
  schedule:
    - cron: '*/30 * * * *'

jobs:
  check-stale:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Find stale awaiting-codex-review PRs
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          REPO=${{ github.repository }}

          # Find open PRs with the awaiting-codex-review label
          PRS=$(gh api "repos/$REPO/issues?labels=awaiting-codex-review&state=open" \
            --jq '[.[] | select(.pull_request)] | .[].number')

          for PR in $PRS; do
            # Check when the label was added (use PR updated_at as proxy)
            UPDATED=$(gh api "repos/$REPO/pulls/$PR" --jq '.updated_at')
            UPDATED_TS=$(date -d "$UPDATED" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$UPDATED" +%s 2>/dev/null || echo "0")
            NOW_TS=$(date +%s)
            AGE_MIN=$(( (NOW_TS - UPDATED_TS) / 60 ))

            if [ "$AGE_MIN" -gt 15 ]; then
              echo "PR #$PR has been awaiting Codex review for ${AGE_MIN}m — auto-approving"

              # Remove awaiting label
              gh api "repos/$REPO/issues/$PR/labels/awaiting-codex-review" -X DELETE || true

              # Add timeout label
              gh api "repos/$REPO/issues/$PR/labels" \
                -X POST -f "labels[]=codex-review-timeout" || true

              # Comment and auto-merge
              gh pr comment "$PR" --repo "$REPO" --body "## Code Review: TIMEOUT

          Codex Cloud did not respond within 15 minutes. Auto-approving.

          _Self-review (Tier 1) already ran before this PR was created._"

              if ! gh pr merge "$PR" --repo "$REPO" --squash --auto --delete-branch 2>/dev/null; then
                gh pr merge "$PR" --repo "$REPO" --squash --delete-branch || true
              fi
            fi
          done
```

#### 4d. Post-Merge Follow-Up Workflow (`.github/workflows/post-merge-followup.yml`)

When a PR merges with unresolved P0/P1 findings (round cap, timeout, or late Codex review), this workflow creates a Beads task, GitHub Issue, and follow-up PR to address the escaped findings.

```yaml
name: "Code Review: Post-Merge Follow-Up"

on:
  pull_request:
    types: [closed]
  pull_request_review:
    types: [submitted]

concurrency:
  group: followup-${{ github.event.pull_request.number }}
  cancel-in-progress: false

jobs:
  # ─── Check if follow-up is needed ─────────────────────
  check-followup-needed:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    outputs:
      should_followup: ${{ steps.gate.outputs.should_followup }}
      trigger_reason: ${{ steps.gate.outputs.trigger_reason }}
      original_pr: ${{ steps.gate.outputs.original_pr }}
      review_commit: ${{ steps.gate.outputs.review_commit }}
    steps:
      - name: Check follow-up gates
        id: gate
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CODEX_BOT_NAME: "chatgpt-codex-connector[bot]"
        run: |
          # Defensive default
          should_followup=false

          PR=${{ github.event.pull_request.number }}
          REPO=${{ github.repository }}

          # Gate 1: PR must be merged (not just closed)
          MERGED=${{ github.event.pull_request.merged }}
          if [ "$MERGED" != "true" ]; then
            echo "should_followup=false" >> $GITHUB_OUTPUT
            echo "PR not merged — skipping"
            exit 0
          fi

          # Gate 2: Not a follow-up PR (recursion prevention)
          LABELS=$(gh api "repos/$REPO/issues/$PR/labels" --jq '.[].name')
          if echo "$LABELS" | grep -q "followup-fix"; then
            echo "should_followup=false" >> $GITHUB_OUTPUT
            echo "Follow-up PR — skipping to prevent recursion"
            exit 0
          fi

          # Gate 3: No duplicate follow-up
          if echo "$LABELS" | grep -q "followup-created"; then
            echo "should_followup=false" >> $GITHUB_OUTPUT
            echo "Follow-up already created — skipping"
            exit 0
          fi

          # Gate 4: Not a fork PR
          if [ "${{ github.event.pull_request.head.repo.full_name }}" != "${{ github.repository }}" ]; then
            echo "should_followup=false" >> $GITHUB_OUTPUT
            echo "Fork PR — skipping"
            exit 0
          fi

          # Gate 5: Trigger-specific checks
          EVENT="${{ github.event_name }}"
          if [ "$EVENT" = "pull_request" ]; then
            # Fired on merge — check for capped or timeout labels
            if echo "$LABELS" | grep -qE "ai-review-capped|codex-review-timeout"; then
              TRIGGER_REASON="capped-or-timeout"
            else
              echo "should_followup=false" >> $GITHUB_OUTPUT
              echo "Merged without cap/timeout — no follow-up needed"
              exit 0
            fi
          elif [ "$EVENT" = "pull_request_review" ]; then
            # Late Codex review on already-merged PR
            REVIEWER="${{ github.event.review.user.login }}"
            if [ "$REVIEWER" != "$CODEX_BOT_NAME" ]; then
              echo "should_followup=false" >> $GITHUB_OUTPUT
              echo "Review not from Codex — skipping"
              exit 0
            fi
            TRIGGER_REASON="late-review"
          fi

          # Gate 6: Check for P0/P1 findings
          MERGE_SHA="${{ github.event.pull_request.merge_commit_sha }}"
          HEAD_SHA="${{ github.event.pull_request.head.sha }}"
          BOT="$CODEX_BOT_NAME"

          # Check for findings on the last PR commit (before merge)
          FINDING_COUNT=$(gh api "repos/$REPO/pulls/$PR/comments" \
            --jq "[.[] | select(.user.login == \"$BOT\" and .commit_id == \"$HEAD_SHA\")] | length")

          if [ "$FINDING_COUNT" -eq 0 ]; then
            echo "should_followup=false" >> $GITHUB_OUTPUT
            echo "No P0/P1 findings on last commit — no follow-up needed"
            exit 0
          fi

          # All gates passed
          should_followup=true
          echo "should_followup=true" >> $GITHUB_OUTPUT
          echo "trigger_reason=$TRIGGER_REASON" >> $GITHUB_OUTPUT
          echo "original_pr=$PR" >> $GITHUB_OUTPUT
          echo "review_commit=$HEAD_SHA" >> $GITHUB_OUTPUT
          echo "Follow-up needed: $FINDING_COUNT finding(s), trigger=$TRIGGER_REASON"

  # ─── Create follow-up ─────────────────────────────────
  create-followup:
    needs: [check-followup-needed]
    if: needs.check-followup-needed.outputs.should_followup == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          fetch-depth: 0

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Install Beads
        run: |
          npm install -g @beads/bd
          bd --version

      - name: Collect findings
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CODEX_BOT_NAME: "chatgpt-codex-connector[bot]"
        run: |
          PR=${{ needs.check-followup-needed.outputs.original_pr }}
          REPO=${{ github.repository }}
          COMMIT=${{ needs.check-followup-needed.outputs.review_commit }}
          BOT="$CODEX_BOT_NAME"

          gh api "repos/$REPO/pulls/$PR/comments" \
            --jq "[.[] | select(.user.login == \"$BOT\" and .commit_id == \"$COMMIT\") | {path, line, start_line, body, diff_hunk}]" \
            > /tmp/followup-findings.json

          FINDING_COUNT=$(jq length /tmp/followup-findings.json)
          echo "Collected $FINDING_COUNT findings"

          if [ "$FINDING_COUNT" -eq 0 ]; then
            echo "No findings to follow up on"
            exit 1
          fi

      - name: Create Beads task
        id: beads
        run: |
          PR=${{ needs.check-followup-needed.outputs.original_pr }}
          TASK_OUTPUT=$(bd --no-db --no-daemon create "fix: unresolved P0/P1 from #$PR" -p 1 2>&1)
          TASK_ID=$(echo "$TASK_OUTPUT" | grep -oE '[a-z]+-[a-z0-9]+' | head -1)
          echo "task_id=$TASK_ID" >> $GITHUB_OUTPUT
          echo "Created Beads task: $TASK_ID"

      - name: Create branch and commit Beads state
        id: branch
        run: |
          PR=${{ needs.check-followup-needed.outputs.original_pr }}
          TASK_ID=${{ steps.beads.outputs.task_id }}
          BRANCH="bd-${TASK_ID}/followup-pr-${PR}"
          echo "branch=$BRANCH" >> $GITHUB_OUTPUT

          git checkout -b "$BRANCH"
          git add .beads/ || true
          git commit -m "[BD-${TASK_ID}] chore: create follow-up task for #${PR}" --allow-empty || true
          git push -u origin "$BRANCH"

      - name: Create GitHub Issue
        id: issue
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ needs.check-followup-needed.outputs.original_pr }}
          REPO=${{ github.repository }}
          TASK_ID=${{ steps.beads.outputs.task_id }}
          TRIGGER=${{ needs.check-followup-needed.outputs.trigger_reason }}
          FINDING_COUNT=$(jq length /tmp/followup-findings.json)

          cat > /tmp/issue-body.md << 'ISSUE_EOF'
          ## Unresolved P0/P1 Findings

          **Original PR**: #PRNUM
          **Trigger**: TRIGGER_REASON
          **Findings**: FCOUNT unresolved P0/P1 finding(s)
          **Beads task**: TASK

          ### Findings

          ISSUE_EOF

          sed -i.bak "s/PRNUM/$PR/g; s/TRIGGER_REASON/$TRIGGER/g; s/FCOUNT/$FINDING_COUNT/g; s/TASK/$TASK_ID/g" /tmp/issue-body.md

          jq -r '.[] | "- **\(.path)** (line \(.line // "N/A")): \(.body | split("\n")[0])"' /tmp/followup-findings.json >> /tmp/issue-body.md

          ISSUE_URL=$(gh issue create \
            --repo "$REPO" \
            --title "[BD-${TASK_ID}] fix: unresolved P0/P1 from #${PR}" \
            --body-file /tmp/issue-body.md \
            --label "followup-fix" 2>&1 | tail -1)

          echo "issue_url=$ISSUE_URL" >> $GITHUB_OUTPUT
          echo "Created issue: $ISSUE_URL"

      - name: Label original PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ needs.check-followup-needed.outputs.original_pr }}
          REPO=${{ github.repository }}

          gh api "repos/$REPO/issues/$PR/labels" \
            -X POST -f "labels[]=followup-created" || true

      - name: Comment on original PR
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ needs.check-followup-needed.outputs.original_pr }}
          REPO=${{ github.repository }}
          TASK_ID=${{ steps.beads.outputs.task_id }}
          ISSUE_URL=${{ steps.issue.outputs.issue_url }}
          BRANCH=${{ steps.branch.outputs.branch }}

          gh pr comment "$PR" --repo "$REPO" --body "## Post-Merge Follow-Up

          This PR merged with unresolved P0/P1 findings. A follow-up has been created:
          - **Beads task**: $TASK_ID
          - **Issue**: $ISSUE_URL
          - **Branch**: \`$BRANCH\`

          Claude Code will attempt to fix the findings automatically."

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          allowed_bots: 'claude[bot]'
          prompt: |
            REPO: ${{ github.repository }}
            ORIGINAL_PR: ${{ needs.check-followup-needed.outputs.original_pr }}
            BEADS_TASK: ${{ steps.beads.outputs.task_id }}
            ISSUE_URL: ${{ steps.issue.outputs.issue_url }}

            Read .github/review-prompts/followup-fix-prompt.md for your full instructions.

            Findings are in /tmp/followup-findings.json. Fix the P0/P1 issues.
            Run lint and test commands from CLAUDE.md Key Commands to verify.
            Commit your fixes but do NOT push and do NOT create a PR.
          claude_args: |
            --model claude-opus-4-6
            --allowedTools "Bash(git:*),Bash(gh:*),Bash(make:*),Bash(npm:*),Read,Write,Edit,Bash(pip:*),Bash(cd:*),Bash(uv:*),Bash(pnpm:*),Bash(bd:*)"
            --max-turns 15

      - name: Check for code changes
        id: changes
        run: |
          # Check for actual code changes (not just .beads/ files)
          CHANGED=$(git diff --name-only origin/main..HEAD | grep -v '^\\.beads/' || true)
          if [ -z "$CHANGED" ]; then
            echo "has_code_changes=false" >> $GITHUB_OUTPUT
            echo "No code changes — Claude Code could not fix the findings"
          else
            echo "has_code_changes=true" >> $GITHUB_OUTPUT
            echo "Code changes detected:"
            echo "$CHANGED"
          fi

      - name: Push changes
        if: steps.changes.outputs.has_code_changes == 'true'
        run: |
          git push origin ${{ steps.branch.outputs.branch }}

      - name: Create follow-up PR
        if: steps.changes.outputs.has_code_changes == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          PR=${{ needs.check-followup-needed.outputs.original_pr }}
          REPO=${{ github.repository }}
          TASK_ID=${{ steps.beads.outputs.task_id }}
          ISSUE_URL=${{ steps.issue.outputs.issue_url }}
          FINDING_COUNT=$(jq length /tmp/followup-findings.json)

          cat > /tmp/pr-body.md << 'PR_EOF'
          ## Follow-Up: Unresolved P0/P1 Findings

          Fixes findings from #PRNUM that merged with unresolved P0/P1 issues.

          **Beads task**: TASK
          **Issue**: ISSUE
          **Findings addressed**: FCOUNT

          _Auto-generated by post-merge follow-up workflow._
          PR_EOF

          sed -i.bak "s/PRNUM/$PR/g; s|TASK|$TASK_ID|g; s|ISSUE|$ISSUE_URL|g; s/FCOUNT/$FINDING_COUNT/g" /tmp/pr-body.md

          gh pr create \
            --repo "$REPO" \
            --title "[BD-${TASK_ID}] fix: address unresolved findings from #${PR}" \
            --body-file /tmp/pr-body.md \
            --label "followup-fix" \
            --base main

      - name: Close Beads task if no changes
        if: steps.changes.outputs.has_code_changes == 'false'
        run: |
          TASK_ID=${{ steps.beads.outputs.task_id }}
          bd close "$TASK_ID" 2>/dev/null || true
          echo "Closed Beads task $TASK_ID — no code changes needed"
```

### 5. Await PR Review Script (`scripts/await-pr-review.sh`)

Create a polling script agents call to wait for Codex Cloud review before merging. This bridges the gap between CI passing and merge — without it, agents race the review when auto-merge is unavailable.

```bash
#!/usr/bin/env bash
# Polls for Codex Cloud PR review matching HEAD SHA.
# Called by agents after CI passes, before merging.
#
# Usage: scripts/await-pr-review.sh <pr-number> [--timeout <minutes>] [--interval <seconds>]
#
# Exit codes:
#   0 — Approved (no P0/P1 findings)
#   1 — Findings (P0/P1 issues found — do NOT merge)
#   2 — Timeout (no review within timeout window)
#   3 — Skipped (/skip-review or /lgtm comment found)
#   4 — Error (API failure, missing arguments)
#
# Defaults: 15-minute timeout, 30-second poll interval.
# Status output goes to stderr; stdout stays clean for scripting.

set -euo pipefail

# ─── Arguments ──────────────────────────────────────────
PR_NUMBER="${1:-}"
TIMEOUT_MINUTES=15
POLL_INTERVAL=30

if [ -z "$PR_NUMBER" ]; then
  echo "Usage: $0 <pr-number> [--timeout <minutes>] [--interval <seconds>]" >&2
  exit 4
fi
shift

while [ $# -gt 0 ]; do
  case "$1" in
    --timeout)  TIMEOUT_MINUTES="$2"; shift 2 ;;
    --interval) POLL_INTERVAL="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 4 ;;
  esac
done

# ─── Derive repo ───────────────────────────────────────
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || {
  echo "error: could not determine repository (is gh authenticated?)" >&2
  exit 4
}

# ─── Get HEAD SHA ──────────────────────────────────────
HEAD_SHA=$(gh api "repos/$REPO/pulls/$PR_NUMBER" --jq '.head.sha' 2>/dev/null) || {
  echo "error: could not fetch PR #$PR_NUMBER" >&2
  exit 4
}

echo "Awaiting Codex review for PR #$PR_NUMBER (SHA: ${HEAD_SHA:0:7})..." >&2
echo "Timeout: ${TIMEOUT_MINUTES}m | Poll interval: ${POLL_INTERVAL}s" >&2

CODEX_BOT="chatgpt-codex-connector[bot]"
DEADLINE=$((SECONDS + TIMEOUT_MINUTES * 60))

while [ $SECONDS -lt $DEADLINE ]; do
  # Check for human override (/skip-review or /lgtm)
  OVERRIDE=$(gh api "repos/$REPO/issues/$PR_NUMBER/comments" \
    --jq '[.[] | select(
      (.author_association | IN("OWNER","MEMBER","COLLABORATOR"))
      and (.body | test("(^|\\s)/(skip-review|lgtm)(\\s|$)"; "i"))
    )] | length' 2>/dev/null) || OVERRIDE=0

  if [ "$OVERRIDE" -gt 0 ]; then
    echo "Human override detected — skipping review wait" >&2
    exit 3
  fi

  # Check for Codex Cloud PR reviews on HEAD SHA
  REVIEW_BODY=$(gh api "repos/$REPO/pulls/$PR_NUMBER/reviews" \
    --jq "[.[] | select(.user.login == \"$CODEX_BOT\" and .commit_id == \"$HEAD_SHA\")] | last | .body // \"\"" \
    2>/dev/null) || {
    echo "warning: API call failed, retrying..." >&2
    sleep "$POLL_INTERVAL"
    continue
  }

  # No review yet
  if [ -z "$REVIEW_BODY" ] || [ "$REVIEW_BODY" = "null" ]; then
    REMAINING=$(( (DEADLINE - SECONDS) / 60 ))
    echo "No review yet (${REMAINING}m remaining)..." >&2
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Review exists — check for approval
  if echo "$REVIEW_BODY" | grep -q "APPROVED: No P0/P1 issues found"; then
    echo "Codex Cloud approved — no P0/P1 issues" >&2
    exit 0
  fi

  # Review exists with findings
  echo "Codex Cloud posted findings — do NOT merge" >&2
  exit 1
done

echo "Codex review did not arrive within ${TIMEOUT_MINUTES}m" >&2
echo "Options: comment /skip-review on the PR, or wait longer" >&2
exit 2
```

Make executable: `chmod +x scripts/await-pr-review.sh`

### 6. Update CLAUDE.md

Add (or replace) the Code Review section in CLAUDE.md. This section **replaces** the PR workflow from the Git Workflow prompt since multi-model-review runs after git-workflow and adds the Codex review waiting step. The Workflow Audit and Claude.md Optimization prompts will pick it up.

```markdown
## Code Review

### Self-Review (before every PR)
Before pushing, run a review subagent to check changes against `docs/review-standards.md`. Fix any P0/P1/P2 issues found. This is built into the PR workflow (step 3 below).

### PR Workflow (with Codex Cloud review)

This replaces the basic PR workflow from the Git Workflow section above. If Codex Cloud is NOT configured, skip steps 7-8 and merge directly after CI passes.

1. Run `make check` to verify all quality gates pass
2. Rebase on latest main: `git fetch origin && git rebase origin/main`
3. Run self-review subagent: check changes against `docs/review-standards.md`, fix any P0/P1/P2 issues
4. Push branch: `git push -u origin HEAD`
5. Create PR: `gh pr create --title "[BD-<id>] type(scope): description"`
6. Wait for CI: `gh pr checks --watch`
7. Wait for Codex review (only if `awaiting-codex-review` label is present):
   ```bash
   scripts/await-pr-review.sh <pr-number>
   # Exit 0 = approved, 1 = findings (do NOT merge), 2 = timeout, 3 = skipped
   ```
   - If exit 1 (findings): The CI fix loop handles this automatically. Do NOT merge.
   - If exit 2 (timeout): The timeout workflow will handle it, or comment `/skip-review` on the PR.
   - If exit 3 (skipped): A human approved — proceed to merge.
8. Merge (check if handler already merged first):
   ```bash
   STATE=$(gh pr view <pr-number> --json state -q .state)
   if [ "$STATE" = "MERGED" ]; then
     echo "Already merged by handler"
   else
     gh pr merge <pr-number> --squash --delete-branch
   fi
   ```
9. Close Beads task: `bd close <id> && bd sync`

**NEVER use `gh pr merge --admin`** — it bypasses all protections including Codex Cloud review, branch protection rules, and CI checks. If merge is blocked, check the error and use one of the recovery options below.

### Error Recovery

| Problem | Solution |
|---------|----------|
| `--auto` fails ("auto-merge not allowed") | This is expected if repo has `allow_auto_merge: false`. The CI workflows already handle this with a direct merge fallback. Agents should use direct merge (step 8 above), not `--auto`. |
| Merge blocked by branch protection | Check `gh pr checks` — wait for failing checks to pass. If a required review is missing, wait for Codex review (step 7). |
| Codex review times out | The `codex-timeout.yml` workflow handles this automatically. Alternatively, comment `/skip-review` on the PR. |
| Merge blocked by `needs-human-review` label | `FOLLOWUP_ON_CAP=block-merge` is configured — a human must review. Do NOT force merge. |
| `gh pr merge` returns "not mergeable" | Rebase on main (`git fetch origin && git rebase origin/main && git push --force-with-lease`) and retry. |

### Human Controls
- Comment `/skip-review` to bypass Codex review entirely
- Comment `/lgtm` to approve and allow merge
- The `ai-review-approved` label means Codex Cloud approved
- The `ai-review-capped` label means the loop hit its round cap and auto-merged
- The `ai-review-blocked` label means Codex Cloud hit its usage limit — human merge required
- The `followup-created` label means a follow-up PR was created for unresolved findings
- The `followup-fix` label marks follow-up PRs and issues
- The `needs-human-review` label means FOLLOWUP_ON_CAP=block-merge blocked auto-merge

### Post-Merge Follow-Up
When a PR merges with unresolved P0/P1 findings (round cap, timeout, or late review):
1. A Beads task (P1) and GitHub Issue are created automatically
2. Claude Code fixes the findings on a follow-up branch
3. A follow-up PR is created targeting main

Configure with `FOLLOWUP_ON_CAP` in `code-review-handler.yml`:
- `"auto-merge-followup"` (default) — merge capped PRs, follow up later
- `"block-merge"` — block merge, add `needs-human-review` label

### What Reviewers Check
See `docs/review-standards.md` for the full review criteria. Reviewers check against your project's documented standards, not generic best practices.
```

Also update `docs/git-workflow.md` Section 4 (PR Workflow) to mirror the 9-step workflow above. Add a note that when Codex Cloud review is configured, steps 7-8 replace the simpler merge step.

---

## Customization Options

### Adding Gemini Code Assist as a Second Reviewer

Install the Gemini Code Assist GitHub App for an independent second perspective at no API cost. Update the convergence check in `code-review-handler.yml` to also check for a Gemini review and require both reviewers to approve before auto-merging.

### Disabling Auto-Merge

To require human approval instead of auto-merging:
1. Remove the `auto-merge` job from `code-review-handler.yml`
2. Change the `capped` verdict to add `needs-human-review` label instead of `ai-review-capped`
3. The PR will wait for a human to merge manually

### Adjusting the Round Cap

Change the `MAX_REVIEW_ROUNDS` env var in both `code-review-trigger.yml` and `code-review-handler.yml`. Higher caps catch more issues but increase fix costs (~$0.43 per round). Most PRs converge in 1-2 rounds.

### Tuning Review Behavior

Edit `AGENTS.md` to change what Codex Cloud looks for. Add "What NOT to flag" examples from real reviews to reduce false positives. Adjust severity definitions in `docs/review-standards.md` to calibrate what gets caught.

### Configuring Cap Behavior (FOLLOWUP_ON_CAP)

The `FOLLOWUP_ON_CAP` env var in `code-review-handler.yml` controls what happens when the review loop hits its round cap with unresolved findings:

- **`"auto-merge-followup"` (default)**: Auto-merges the PR, then the follow-up workflow creates a Beads task, GitHub Issue, and fix PR. Best for fast-moving projects.
- **`"block-merge"`**: Adds `needs-human-review` label and does NOT auto-merge. A human must review remaining findings. Best for projects where every finding must be resolved before merge.

---

## Process

1. **Create the review standards document** (`docs/review-standards.md`) by pulling review criteria from your existing coding-standards.md, tdd-standards.md, and project-structure.md. Use the severity definitions above (P0/P1/P2/P3).

2. **Create `AGENTS.md`** at the repo root with the content above. This is what Codex Cloud reads for review instructions.

3. **Create the fix prompts**:
   - `.github/review-prompts/fix-prompt.md`
   - `.github/review-prompts/followup-fix-prompt.md`

4. **Create the GitHub Actions workflows** — create all four files from the workflow sections above:
   - `.github/workflows/code-review-trigger.yml` (runs on PR open/push)
   - `.github/workflows/code-review-handler.yml` (runs on Codex review/comment)
   - `.github/workflows/post-merge-followup.yml` (post-merge follow-up for escaped findings)
   - `.github/workflows/codex-timeout.yml` (optional — cron-based timeout fallback)

5. **Create the await script** (`scripts/await-pr-review.sh`) from the artifact above and make it executable (`chmod +x`).

6. **Configure repository secret**: Run `gh secret set ANTHROPIC_API_KEY` in your terminal and paste the key when prompted (the only API key needed — Codex Cloud uses credits from your ChatGPT subscription).

7. **Configure repository settings**:
   - Settings → Actions → General → Workflow permissions → Read and write
   - Settings → Actions → General → Allow GitHub Actions to create and approve pull requests

8. **Update CLAUDE.md** with the Code Review section (Section 6 above). This replaces the basic PR workflow from git-workflow with the full 9-step workflow that includes Codex review waiting and `--admin` prohibition.

9. **Update `docs/git-workflow.md`** Section 4 (PR Workflow) to mirror the 9-step workflow from the CLAUDE.md section. Add a note that when Codex Cloud review is configured, steps 7-8 replace the simpler merge step.

10. **Test with a small PR** that has intentional issues (unused variable, missing error handling, hardcoded secret). Verify:
    - The trigger workflow labels the round and adds `awaiting-codex-review`
    - Codex Cloud posts a PR review with findings (check the bot username — the default `chatgpt-codex-connector[bot]` is correct for the standard Codex Cloud GitHub App; update `CODEX_BOT_NAME` in the handler workflow if it differs)
    - The handler workflow fires on the review event, checks freshness, and runs convergence
    - Claude Code Action fixes the P0/P1 issues
    - Second review round approves
    - The PR auto-merges with the `ai-review-approved` label
    - Test `scripts/await-pr-review.sh` exits correctly for each scenario (approved, findings, timeout, skipped)
    - Test `--auto` fallback: on a repo with `allow_auto_merge: false`, verify the handler falls back to direct merge
    - Test follow-up: merge a capped PR with findings, verify Beads task + Issue + follow-up PR created
    - Verify `followup-fix` label prevents recursion on follow-up PRs
    - Verify `followup-created` label prevents duplicate follow-ups

11. **Commit everything** to the repo:
    ```bash
    git add docs/review-standards.md AGENTS.md .github/review-prompts/ .github/workflows/code-review-trigger.yml .github/workflows/code-review-handler.yml .github/workflows/post-merge-followup.yml .github/workflows/codex-timeout.yml scripts/await-pr-review.sh docs/git-workflow.md CLAUDE.md
    git commit -m "[BD-<id>] feat: add code review loop (Codex Cloud + Claude fix)"
    ```


__________________________________________________________
# Integrate Playwright (if building a web app) (Prompt)
Configure Playwright MCP for browser automation and visual testing in this project if applicable, otherwise tell me we don't need this. The Playwright MCP server has already been added to Claude Code.

Review docs/tech-stack.md, docs/tdd-standards.md, and CLAUDE.md to understand the existing project conventions.

## Mode Detection

Before starting, check if Playwright config files already exist (e.g., `playwright.config.ts`, `playwright.config.js`, or `tests/screenshots/`):

**If no Playwright config exists → FRESH MODE**: Skip to the next section and create from scratch.

**If Playwright config exists → UPDATE MODE**:
1. **Read & analyze**: Read existing Playwright config, the E2E section of `docs/tdd-standards.md`, and the browser testing section of `CLAUDE.md`. Check for a tracking comment on line 1 of the Playwright config: `// scaffold:playwright v<ver> <date>`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing configuration against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing config
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tdd-standards.md`, `docs/dev-setup.md`, `CLAUDE.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1 of Playwright config: `// scaffold:playwright v<ver> <date>`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: Playwright config file (`playwright.config.ts` or `.js`)
- **Secondary output**: `docs/tdd-standards.md` E2E section, `CLAUDE.md` browser testing section, `tests/screenshots/` directory
- **Preserve**: Baseline screenshots, custom viewport configurations, project-specific test patterns, existing E2E test files
- **Related docs**: `docs/tdd-standards.md`, `docs/dev-setup.md`, `CLAUDE.md`
- **Special rules**: **Never delete baseline screenshots** — they represent verified visual states. Preserve custom viewport sizes. Update `docs/tdd-standards.md` E2E section in-place rather than appending duplicates.

## Objectives

1. Configure Playwright for the project's frontend testing needs
2. Establish patterns for visual verification of frontend features
3. Integrate browser testing into the existing TDD workflow
4. Update CLAUDE.md with browser testing procedures

## Available MCP Commands

You have access to these Playwright MCP tools:

### Navigation & Page Management
- `browser_navigate` — Navigate to a URL
- `browser_navigate_back` — Go back to the previous page in history
- `browser_wait_for` — Wait for text to appear/disappear or a specified time to pass
- `browser_close` — Close the browser session
- `browser_tabs` — List, create, close, or select browser tabs
- `browser_install` — Install the browser if not already installed

### Interaction
- `browser_click` — Click an element (left, right, or middle button; supports double-click)
- `browser_type` — Type text into an editable element (supports slow typing and submit)
- `browser_fill_form` — Fill multiple form fields (textbox, checkbox, radio, combobox, slider)
- `browser_select_option` — Select an option in a dropdown
- `browser_hover` — Hover over an element
- `browser_drag` — Drag and drop between two elements
- `browser_press_key` — Press a keyboard key (e.g., `ArrowLeft`, `Enter`)
- `browser_file_upload` — Upload one or multiple files
- `browser_handle_dialog` — Accept or dismiss browser dialogs (alert, confirm, prompt)

### Inspection & Verification
- `browser_take_screenshot` — Capture a screenshot (viewport, full page, or element)
- `browser_snapshot` — Capture accessibility snapshot (better than screenshot for actions)
- `browser_evaluate` — Execute JavaScript in the browser context
- `browser_resize` — Resize the browser window
- `browser_run_code` — Run a Playwright code snippet directly
- `browser_console_messages` — Return all console messages (filterable by level)
- `browser_network_requests` — Return all network requests since page load

## What to Configure

### 1. Project Configuration

Create or update configuration files for Playwright in the project:
- Base URL configuration (local dev server, staging)
- Default viewport sizes (desktop, tablet, mobile)
- Screenshot directory structure
- Timeout defaults appropriate for our app

### 2. Screenshot Organization

Set up a systematic screenshot storage approach:
```
/tests/screenshots/
  /baseline/          # Known-good reference screenshots
  /current/           # Screenshots from current test run
  /diff/              # Visual diff outputs (if using comparison)
```

Define naming conventions for screenshots that include:
- Feature or user story ID
- Viewport size
- State being captured (e.g., `US-012_checkout_mobile_empty-cart.png`)

### 3. Visual Testing Patterns

Document reusable patterns for common scenarios:

**Page Load Verification**
```
1. browser_navigate to URL
2. browser_wait_for critical element or network idle
3. browser_take_screenshot for visual verification
```

**User Flow Verification**
```
1. browser_navigate to starting point
2. browser_fill_form / browser_click through the flow
3. browser_wait_for expected outcome
4. browser_take_screenshot at key states
5. browser_evaluate to assert DOM state if needed
```

**Responsive Verification**
```
For each viewport (desktop, tablet, mobile):
  1. Set viewport size
  2. browser_navigate
  3. browser_take_screenshot
```

**Error State Verification**
```
1. browser_navigate
2. Trigger error condition (invalid input, failed request)
3. browser_wait_for error UI
4. browser_take_screenshot
5. browser_evaluate to verify error message content
```

### 4. Integration with TDD Workflow

Define how browser testing fits with existing TDD standards:
- When to use Playwright vs. unit/integration tests (Playwright for visual verification and E2E flows, not for logic testing)
- Screenshot review as part of the verification step before marking Beads tasks complete
- How to handle visual regression (baseline comparison strategy)

### 5. Update CLAUDE.md

Add a section to CLAUDE.md covering:

```markdown
## Browser Testing with Playwright MCP

When implementing frontend features, use Playwright MCP for visual verification:

### When to Use
- Verifying UI renders correctly after implementing a feature
- Testing user flows end-to-end
- Checking responsive layouts
- Capturing error states and edge cases

### Verification Process
1. Start the dev server if not running
2. Use `browser_navigate` to load the relevant page
3. Use `browser_wait_for` to ensure content is loaded
4. Use `browser_take_screenshot` to capture the current state
5. Review screenshot to verify correctness
6. For interactive flows: use `browser_click`, `browser_fill_form`, etc. to simulate user actions
7. Capture screenshots at key states throughout the flow

### Screenshot Naming
`{story-id}_{feature}_{viewport}_{state}.png`
Example: `US-012_checkout_desktop_success.png`

### Common Patterns
[Include the patterns defined above]

### Rules
- Always `browser_wait_for` before taking screenshots — don't capture loading states accidentally
- Always `browser_close` when done to clean up resources
- Capture both success AND error states
- Test at minimum desktop (1280px) and mobile (375px) viewports for any UI work
```

### 6. Update TDD Standards

Fill in the E2E placeholder section in `docs/tdd-standards.md` (the TDD prompt created a "### 7. E2E / Visual Testing" placeholder for this):
```markdown
### 7. E2E / Visual Testing (Playwright)

**When to write Playwright tests:**
- Verifying UI renders correctly after implementing a feature
- Testing complete user flows end-to-end (login → action → result)
- Checking responsive layouts at multiple viewports
- Capturing error states and visual regressions

**When NOT to use Playwright:**
- Testing business logic (use unit tests)
- Testing API endpoints (use integration tests)
- Testing utility functions (use unit tests)

**Playwright tests are written AFTER the feature works**, as verification. They are NOT part of the Red→Green→Refactor TDD cycle — they verify the integrated result.

**Required tests per UI story:**
- Happy path screenshot at desktop (1280px) and mobile (375px)
- Primary error state screenshot
- Key interactive states (loading, empty, populated)

**Screenshot naming:** `{story-id}_{feature}_{viewport}_{state}.png`
Example: `US-012_checkout_desktop_success.png`

**Baseline management:**
- Baseline screenshots committed to `tests/screenshots/baseline/`
- Current run screenshots in `tests/screenshots/current/` (gitignored)
```

### 7. Playwright Permissions

Ensure Playwright MCP tools run without prompting. Add the bare server-name entry to `~/.claude/settings.json` allow array:

```json
"mcp__plugin_playwright_playwright"
```

This single entry covers ALL Playwright tools (navigate, click, screenshot, evaluate, etc.).

For reference, create/update `.claude/settings.local.json` with the complete individual tool list as a fallback:

```json
{
  "permissions": {
    "allow": [
      "mcp__plugin_playwright_playwright__browser_click",
      "mcp__plugin_playwright_playwright__browser_close",
      "mcp__plugin_playwright_playwright__browser_console_messages",
      "mcp__plugin_playwright_playwright__browser_drag",
      "mcp__plugin_playwright_playwright__browser_evaluate",
      "mcp__plugin_playwright_playwright__browser_file_upload",
      "mcp__plugin_playwright_playwright__browser_fill_form",
      "mcp__plugin_playwright_playwright__browser_handle_dialog",
      "mcp__plugin_playwright_playwright__browser_hover",
      "mcp__plugin_playwright_playwright__browser_install",
      "mcp__plugin_playwright_playwright__browser_navigate",
      "mcp__plugin_playwright_playwright__browser_navigate_back",
      "mcp__plugin_playwright_playwright__browser_network_requests",
      "mcp__plugin_playwright_playwright__browser_press_key",
      "mcp__plugin_playwright_playwright__browser_resize",
      "mcp__plugin_playwright_playwright__browser_run_code",
      "mcp__plugin_playwright_playwright__browser_select_option",
      "mcp__plugin_playwright_playwright__browser_snapshot",
      "mcp__plugin_playwright_playwright__browser_tabs",
      "mcp__plugin_playwright_playwright__browser_take_screenshot",
      "mcp__plugin_playwright_playwright__browser_type",
      "mcp__plugin_playwright_playwright__browser_wait_for"
    ]
  }
}
```

## What NOT to Do

- Don't use Playwright for testing business logic — that's what unit tests are for
- Don't store screenshots in git unless they're intentional baselines
- Don't skip the wait step — flaky screenshots waste time
- Don't leave browser sessions open — always close when done

## Process

- Review the frontend tech stack to understand what's being rendered and how
- Review existing user stories to understand the key user flows that need visual verification
- Create the configuration files and directory structure
- Update CLAUDE.md with the browser testing section
- Run a quick smoke test: navigate to the app, take a screenshot, and close — verify the setup works
- Use AskUserQuestionTool to confirm viewport sizes, baseline storage strategy, and any project-specific conventions


_______________________________________________
# Maestro Setup (Prompt) (for Expo/Mobile Apps)

Install and configure Maestro for mobile UI testing in this Expo project. Maestro will be used for automated testing and visual verification of mobile app features.

Review docs/tech-stack.md, docs/tdd-standards.md, and CLAUDE.md to understand the existing project conventions.

## Mode Detection

Before starting, check if `maestro/` directory already exists:

**If `maestro/` does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If `maestro/` exists → UPDATE MODE**:
1. **Read & analyze**: Read `maestro/config.yaml`, existing flow files, the E2E section of `docs/tdd-standards.md`, and the mobile testing section of `CLAUDE.md`. Check for a tracking comment on line 1 of `maestro/config.yaml`: `# scaffold:maestro v<ver> <date>`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing configuration against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing config
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tdd-standards.md`, `docs/dev-setup.md`, `CLAUDE.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1 of `maestro/config.yaml`: `# scaffold:maestro v<ver> <date>`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `maestro/config.yaml`
- **Secondary output**: `maestro/flows/`, `maestro/shared/`, `maestro/screenshots/`, `docs/tdd-standards.md` E2E section, `CLAUDE.md` mobile testing section
- **Preserve**: All existing flow files, sub-flows, baseline screenshots, custom `testID` conventions, environment variables in config
- **Related docs**: `docs/tdd-standards.md`, `docs/dev-setup.md`, `CLAUDE.md`
- **Special rules**: **Never delete existing flow files or sub-flows** — they represent tested user journeys. **Never delete baseline screenshots**. Preserve custom environment variables in `maestro/config.yaml`. Update `docs/tdd-standards.md` E2E section in-place rather than appending duplicates.

## What is Maestro

Maestro is a mobile UI testing framework that's ideal for Expo/React Native apps. It uses simple YAML flow files to define user interactions and assertions. It's more reliable than alternatives because it waits for the UI to settle automatically.

## Installation & Configuration

### 1. Install Maestro CLI

```bash
# macOS
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version
```

Document any additional setup needed for:
- iOS Simulator requirements
- Android Emulator requirements  
- Expo-specific configuration

### 2. Project Configuration

Create the Maestro directory structure:
```
maestro/
├── flows/                    # Test flow files
│   ├── auth/                 # Flows by feature
│   ├── onboarding/
│   └── ...
├── shared/                   # Reusable sub-flows
│   ├── login.yaml           
│   └── logout.yaml
├── screenshots/              # Captured screenshots
│   ├── baseline/            # Known-good references
│   └── current/             # Current test run
└── config.yaml              # Maestro configuration
```

Create `maestro/config.yaml`:
```yaml
# App configuration
appId: ${APP_BUNDLE_ID}  # From app.json

# Default settings
flows:
  - flows/**/*.yaml

# Environment variables available in flows
env:
  TEST_USER_EMAIL: test@example.com
  TEST_USER_PASSWORD: testpassword123
```

### 3. Environment Setup

Add to `.env.example` and document:
```
# Maestro Testing
MAESTRO_APP_ID=your.app.bundle.id
MAESTRO_TEST_USER_EMAIL=test@example.com
MAESTRO_TEST_USER_PASSWORD=testpassword123
```

## Maestro Commands Reference

### App Lifecycle
```yaml
- launchApp                          # Start the app fresh
- launchApp:
    clearState: true                 # Clear app data first
- stopApp                            # Stop the app
```

### Navigation & Interaction
```yaml
- tapOn: "Button Text"               # Tap by text
- tapOn:
    id: "button-submit"              # Tap by testID
- tapOn:
    point: "50%,50%"                 # Tap by coordinates

- longPressOn: "Element"             # Long press

- inputText: "Hello world"           # Type into focused field
- eraseText: 10                      # Delete characters

- scroll                             # Scroll down
- scrollUntilVisible:
    element: "Target Element"
    direction: DOWN

- swipe:
    direction: LEFT
    duration: 500

- back                               # Android back / iOS swipe back
- hideKeyboard
```

### Assertions
```yaml
- assertVisible: "Welcome"           # Text is visible
- assertVisible:
    id: "home-screen"                # testID is visible
    
- assertNotVisible: "Error"          # Text is not visible

- assertTrue: ${SOME_CONDITION}      # Boolean check
```

### Waiting
```yaml
- waitForAnimationToEnd              # Wait for UI to settle
- extendedWaitUntil:
    visible: "Loaded Content"
    timeout: 10000                   # ms
```

### Screenshots
```yaml
- takeScreenshot: "screenshots/current/home-screen"
```

### Flow Control
```yaml
# Run a shared sub-flow
- runFlow: shared/login.yaml

# Run with parameters
- runFlow:
    file: shared/login.yaml
    env:
      EMAIL: custom@example.com

# Conditional execution
- runFlow:
    when:
      visible: "Login Button"
    file: shared/login.yaml

# Repeat actions
- repeat:
    times: 3
    commands:
      - tapOn: "Increment"
```

## Testing Patterns

### Pattern 1: Screen Verification
```yaml
# flows/home/verify-home-screen.yaml
appId: ${MAESTRO_APP_ID}
---
- launchApp:
    clearState: true
- runFlow: ../shared/login.yaml
- assertVisible: "Home"
- assertVisible:
    id: "dashboard-stats"
- takeScreenshot: "screenshots/current/home_authenticated"
```

### Pattern 2: User Flow
```yaml
# flows/sessions/create-session.yaml
appId: ${MAESTRO_APP_ID}
---
- launchApp
- runFlow: ../shared/login.yaml

# Navigate to create
- tapOn: "New Session"
- assertVisible: "Create Session"

# Fill form
- tapOn:
    id: "session-name-input"
- inputText: "Test Session"
- tapOn:
    id: "session-duration"
- tapOn: "30 minutes"

# Submit
- tapOn: "Create"
- waitForAnimationToEnd

# Verify success
- assertVisible: "Session Created"
- takeScreenshot: "screenshots/current/session_created_success"
```

### Pattern 3: Error State Verification
```yaml
# flows/auth/login-error.yaml
appId: ${MAESTRO_APP_ID}
---
- launchApp:
    clearState: true
- tapOn: "Login"
- tapOn:
    id: "email-input"
- inputText: "invalid@example.com"
- tapOn:
    id: "password-input"
- inputText: "wrongpassword"
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible: "Invalid credentials"
- takeScreenshot: "screenshots/current/login_error_invalid_credentials"
```

### Pattern 4: Reusable Sub-flow
```yaml
# maestro/shared/login.yaml
appId: ${MAESTRO_APP_ID}
---
- assertVisible: "Login"
- tapOn:
    id: "email-input"
- inputText: ${TEST_USER_EMAIL}
- tapOn:
    id: "password-input"
- inputText: ${TEST_USER_PASSWORD}
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible:
    id: "home-screen"
```

### Pattern 5: Responsive/Device Testing
```yaml
# Run same flow on multiple devices
# maestro test flows/home/verify-home-screen.yaml --device "iPhone 14"
# maestro test flows/home/verify-home-screen.yaml --device "Pixel 6"
```

## Expo-Specific Setup

### 1. Configure testID Props

Ensure components use testID for reliable selection:
```tsx
// Good - uses testID
<Button testID="submit-button" title="Submit" />

// Avoid - relies on text matching which can be fragile
<Button title="Submit" />
```

Add to docs/coding-standards.md:
- All interactive elements MUST have a testID prop
- testID naming convention: `{feature}-{element}-{descriptor}`
- Examples: `auth-email-input`, `session-create-button`, `nav-home-tab`

### 2. Running with Expo

```bash
# Start Expo dev server (in one terminal)
npx expo start

# Run on iOS Simulator (in another terminal)
npx expo run:ios

# Or Android Emulator
npx expo run:android

# Then run Maestro tests
maestro test maestro/flows/
```

### 3. Development Build Requirement

Maestro requires a development build (not Expo Go) for reliable testID access:
```bash
# Create development build
npx expo prebuild
npx expo run:ios  # or run:android
```

Document this requirement clearly for the team.

## Scripts/Commands

Add to package.json:
```json
{
  "scripts": {
    "test:e2e": "maestro test maestro/flows/",
    "test:e2e:ios": "maestro test maestro/flows/ --device 'iPhone 15'",
    "test:e2e:android": "maestro test maestro/flows/ --device 'emulator'",
    "test:e2e:flow": "maestro test",
    "maestro:studio": "maestro studio"
  }
}
```

| Command | Purpose |
|---------|---------|
| `npm run test:e2e` | Run all Maestro flows |
| `npm run test:e2e:ios` | Run on iOS Simulator |
| `npm run test:e2e:android` | Run on Android Emulator |
| `npm run test:e2e:flow maestro/flows/auth/login.yaml` | Run specific flow |
| `npm run maestro:studio` | Open Maestro Studio (interactive mode) |

## Screenshot Organization

```
maestro/screenshots/
├── baseline/
│   ├── auth/
│   │   ├── login_screen.png
│   │   └── login_error.png
│   ├── home/
│   │   └── dashboard.png
│   └── ...
└── current/
    └── [generated during test runs]
```

Naming convention: `{feature}_{screen}_{state}.png`
- `auth_login_default.png`
- `auth_login_error_invalid.png`
- `session_create_success.png`

## Update CLAUDE.md

Add a Mobile Testing section:

```markdown
## Mobile Testing with Maestro

When implementing mobile features, use Maestro for UI verification.

### When to Use
- Verifying screens render correctly after implementing a feature
- Testing user flows end-to-end on mobile
- Capturing error states and edge cases
- Visual regression checks

### Prerequisites
- Development build running: `npx expo run:ios` or `npx expo run:android`
- Simulator/emulator is open and app is installed

### Verification Process
1. Ensure dev build is running on simulator/emulator
2. Write or run Maestro flow for the feature
3. Use `takeScreenshot` to capture key states
4. Review screenshots to verify correctness

### Creating a Test Flow
1. Create YAML file in `maestro/flows/{feature}/`
2. Start with `launchApp` or use shared login flow
3. Navigate to the feature being tested
4. Add assertions for expected UI state
5. Capture screenshots at key states

### TestID Requirements
All interactive elements MUST have testID props:
- Buttons: `{feature}-{action}-button`
- Inputs: `{feature}-{field}-input`
- Screens: `{feature}-screen`

### Key Commands
| Task | Command |
|------|---------|
| Run all tests | `npm run test:e2e` |
| Run specific flow | `npm run test:e2e:flow maestro/flows/auth/login.yaml` |
| Interactive mode | `npm run maestro:studio` |

### Rules
- Always include `waitForAnimationToEnd` after navigation or actions
- Always use testID selectors over text matching when possible
- Always capture both success AND error states
- Test on both iOS and Android before marking mobile tasks complete
```

## Update TDD Standards

Add to docs/tdd-standards.md a section on mobile E2E testing:
- When to write Maestro flows (E2E user journeys, visual verification)
- When NOT to use Maestro (unit logic, API testing)
- Maestro flows are written AFTER the feature works, as verification
- Required flows: happy path + primary error states for each user story

## Verification

After setup, verify everything works:

1. [ ] Maestro CLI installed and accessible
2. [ ] Development build created and running on simulator
3. [ ] Sample flow executes successfully
4. [ ] Screenshot is captured to correct directory
5. [ ] testID props are accessible in the app

Create a simple verification flow:
```yaml
# maestro/flows/verify-setup.yaml
appId: ${MAESTRO_APP_ID}
---
- launchApp
- waitForAnimationToEnd
- takeScreenshot: "screenshots/current/setup_verification"
```

Run it: `maestro test maestro/flows/verify-setup.yaml`

## Process

- Review docs/tech-stack.md to confirm Expo configuration
- Install Maestro CLI and verify it works
- Create directory structure and config files
- Add testID conventions to coding standards
- Create sample flows demonstrating each pattern
- Update CLAUDE.md with mobile testing section
- Run verification to confirm setup works
- Use AskUserQuestionTool to ask about:
  - Primary test devices (iPhone model, Android device)
  - Any existing test users/accounts
  - Priority features that need E2E coverage first


__________________________________
# User Stories (Prompt)
First, deeply research best practices for creating user stories, with emphasis on stories that will be consumed by AI agents (not human developers) for implementation. Focus on what makes a user story unambiguous and implementable without further clarification.

Then thoroughly review and analyze the PRD (docs/plan.md) and create all user stories needed to cover every feature, flow, and requirement identified in the PRD.

## Mode Detection

Before starting, check if `docs/user-stories.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:user-stories v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/plan.md`, `docs/tech-stack.md`, `docs/implementation-plan.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:user-stories v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/user-stories.md`
- **Preserve**: All story IDs (US-xxx), enhancement markers (`<!-- enhancement: ... -->`), epic groupings, acceptance criteria refinements, priority decisions
- **Related docs**: `docs/plan.md`, `docs/tech-stack.md`, `docs/implementation-plan.md`
- **Special rules**: **Never renumber story IDs** — Beads tasks and implementation plan reference them. **Never remove stories** without user approval. Preserve all `<!-- enhancement: ... -->` markers. New stories get the next available ID in sequence.

## Output: `docs/user-stories.md`

### Document Structure
1. **Best Practices Summary** — concise reference at the top (not a textbook, just the rules you followed)
2. **User Personas** — define each distinct user type before writing stories (reference the PRD for these)
3. **Epics** — group related stories under epics that map to major PRD sections
4. **User Stories** — every story under its epic

### Each User Story MUST Include
- **ID**: Unique identifier (e.g., US-001) for traceability to future Beads tasks
- **Title**: Short, scannable summary
- **Story**: "As a [persona], I want [action], so that [outcome]"
- **Acceptance Criteria**: Written as testable Given/When/Then scenarios — these become TDD test cases later. Be explicit about edge cases.
- **Scope Boundary**: What this story does NOT include (prevents scope creep during implementation)
- **Data/State Requirements**: What data models, state, or dependencies are implied
- **UI/UX Notes**: If applicable — what the user sees, key interactions, error states
- **Priority**: MoSCoW (Must/Should/Could/Won't for v1)

### Quality Checks Before Finishing
- Every PRD feature maps to at least one user story — nothing is missed
- Stories follow INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- No story is so large it couldn't be implemented in 1-3 focused Claude Code sessions
- Acceptance criteria are specific enough that pass/fail is unambiguous
- Cross-reference back to the PRD: call out anything in the PRD that is ambiguous or contradictory

## Process
- Review `docs/tech-stack.md` to understand technical constraints — don't write stories that require capabilities the tech stack doesn't support
- Review `docs/project-structure.md` (if it exists) to understand module boundaries — stories should align with the architecture
- Review `docs/design-system.md` (if it exists) — reference established component patterns in UI/UX notes rather than describing custom UI from scratch
- Use subagents to research best practices while analyzing the PRD in parallel
- Use AskUserQuestionTool for any questions, ambiguities in the PRD, or priority decisions
- After drafting, do a final pass to verify full PRD coverage and story quality against INVEST
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now


__________________________________________________
# User Stories Gap Analysis & Innovation (Prompt)

## Phase 1: Gap Analysis

Deeply research docs/plan.md and docs/user-stories.md and perform a systematic gap analysis. Specifically check for:

### Coverage Gaps
- Every PRD feature, requirement, and flow has at least one user story
- Every user persona in the PRD is represented in the stories
- Happy paths AND error/edge cases are covered (e.g., what happens when a network request fails, a user enters invalid data, a session times out?)
- Onboarding / first-time user experience is addressed
- Data migration, seeding, or initial state setup if applicable

### Quality Weaknesses
- Acceptance criteria that are vague or untestable — rewrite as specific Given/When/Then
- Stories that are too large to implement in 1-3 Claude Code sessions — split them
- Stories missing scope boundaries, data requirements, or UI/UX notes per our template
- Dependencies between stories that aren't obvious — call these out (they become Beads dependencies later)
- Contradictions between the PRD and user stories

### Structural Issues
- Stories that overlap significantly — consolidate or clarify boundaries
- Missing epics or stories that are miscategorized
- Priority assignments that seem off based on PRD emphasis

Create a summary of all findings, then apply the fixes directly to user-stories.md. Don't just list problems — resolve them.

## Phase 2: Innovation (UX-Level Only)

After the gap analysis is complete, shift to a product thinking mindset. Research current best practices and competitive landscape relevant to this application.

**Scope boundary:** Feature-level innovation (new capabilities, new user flows) should have been done during the PRD Gap Analysis prompt. This innovation pass focuses on **UX quality and implementation-level improvements** to features already approved in the PRD. Don't propose new features here — propose better ways to deliver existing ones.

Identify opportunities in these categories:

### High-Value, Low-Effort Enhancements
- Small additions that would significantly improve UX (e.g., smart defaults, inline validation, keyboard shortcuts)
- Data we're already collecting that could power useful features (e.g., if we track sessions, we can show streaks or trends for free)

### Differentiators
- What would make a user choose THIS over alternatives? What's the "wow" moment?
- AI-native features that wouldn't exist in a traditionally-built app

### Defensive Gaps
- What would a user complain about in a v1 review? Address the obvious ones now.
- Accessibility, mobile responsiveness, or performance concerns not yet covered

For each innovation idea, present it with:
- **What**: The feature or enhancement
- **Why**: The user benefit and strategic rationale
- **Cost**: Rough sense of effort (trivial / moderate / significant)
- **Recommendation**: Must-have for v1, or backlog for later

Use AskUserQuestionTool to present innovation ideas for my approval BEFORE adding them to user-stories.md. Group related ideas together so we can make decisions efficiently rather than one at a time.

## Process
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- Use subagents to research the competitive landscape and best practices in parallel with the gap analysis
- After all approved changes, do a final INVEST criteria pass on any new or modified stories
- At the end, provide a concise changelog of what was added, modified, or removed
- After all changes are applied, add a tracking comment to `docs/user-stories.md` after any existing scaffold tracking comment: `<!-- scaffold:user-stories-gaps v1 YYYY-MM-DD -->` (use actual date)


_________________________________________________________________
# User Stories Multi-Model Review (Prompt)

Run independent Codex and Gemini reviews of `docs/user-stories.md` against the PRD to eliminate single-model blind spots. This is a quality gate that enforces 100% PRD coverage with hard traceability — every atomic PRD requirement must map to at least one user story.

## Mode Detection

Before starting, check if `docs/reviews/user-stories/review-summary.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing review artifacts (`docs/reviews/user-stories/requirements-index.md`, `docs/reviews/user-stories/coverage.json`, `docs/reviews/user-stories/review-summary.md`). Check for a tracking comment on line 1 of `review-summary.md`: `<!-- scaffold:user-stories-mmr v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing artifacts against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing artifacts
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure
   - **PRESERVE** — Project-specific decisions and prior review findings
3. **Cross-doc consistency**: Read `docs/user-stories.md` and `docs/plan.md` and verify updates won't contradict them.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   Wait for user approval before proceeding.
5. **Execute update**: Re-run the full review pipeline. Preserve prior findings that are still valid.
6. **Update tracking comment**: Add/update on line 1 of `review-summary.md`: `<!-- scaffold:user-stories-mmr v<ver> <date> -->`
7. **Post-update summary**: Report what changed since the last review.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/reviews/user-stories/review-summary.md`
- **Secondary output**: `docs/reviews/user-stories/requirements-index.md`, `docs/reviews/user-stories/coverage.json`, `docs/reviews/user-stories/codex-review.json`, `docs/reviews/user-stories/gemini-review.json`
- **Preserve**: Prior review findings still valid, requirement IDs (REQ-xxx), custom coverage mappings
- **Related docs**: `docs/plan.md`, `docs/user-stories.md`
- **Special rules**: **Never renumber requirement IDs** — coverage.json references them. New requirements get the next available ID in sequence.

---

## Goals
- **100% PRD coverage** — every atomic requirement in the PRD maps to at least one user story
- **AI-implementation readiness** — stories are unambiguous enough for AI agents to implement without clarification
- **Multi-model validation** — independent reviewers catch blind spots that a single model misses

## Hard Scope Boundary
- **No new features** — reviewers critique existing stories, they don't invent new product capabilities
- **Preserve all story IDs** — US-xxx IDs are referenced by Beads tasks and implementation plans
- **Single-writer rule** — only Claude edits `docs/user-stories.md`. Codex and Gemini only critique.

## Prerequisites

Before starting, verify:

1. **Required files exist**:
   - `docs/plan.md` — the PRD
   - `docs/user-stories.md` — user stories from Steps 14-15
2. **At least one review CLI is available** (check with `command -v`):
   - `codex` — Codex CLI (install: `npm install -g @openai/codex`)
   - `gemini` — Gemini CLI (install: `npm install -g @google/gemini-cli`)
3. **CLI authentication**:
   - Codex: ChatGPT subscription login (`codex` uses subscription credits, not API billing)
   - Gemini: Google account login (`gemini` uses subscription quota, not API billing)

If neither CLI is available, tell the user and stop — this prompt requires at least one external reviewer.

## Outputs

All review artifacts go under `docs/reviews/user-stories/`:

| File | Description |
|------|-------------|
| `requirements-index.md` | Atomic PRD requirements with IDs (REQ-001, REQ-002, ...) |
| `coverage.json` | Requirement → story mapping |
| `codex-review.json` | Raw Codex review findings (if available) |
| `gemini-review.json` | Raw Gemini review findings (if available) |
| `review-summary.md` | Reconciled findings, actions taken, final coverage status |

Additionally updates: `docs/user-stories.md` (fixes applied by Claude)

---

## Step 0: Create Beads Task

```
bd create "review: user stories multi-model review" -p 0
bd update <id> --claim
```

## Step 1: Build Atomic PRD Requirements Index

Read `docs/plan.md` thoroughly. Extract every distinct, testable requirement into an atomic list.

Create `docs/reviews/user-stories/requirements-index.md`:

```markdown
<!-- scaffold:user-stories-mmr v1.0 YYYY-MM-DD -->
# PRD Requirements Index

Atomic requirements extracted from docs/plan.md for traceability.

| ID | Requirement | PRD Section | Priority |
|----|-------------|-------------|----------|
| REQ-001 | Users can create an account with email and password | User Authentication | Must |
| REQ-002 | Users can reset their password via email link | User Authentication | Must |
| ... | ... | ... | ... |
```

Rules:
- One requirement per row — split compound requirements ("X and Y") into separate rows
- Each requirement must be testable (a developer could write a pass/fail test for it)
- Include implicit requirements (error handling, validation, accessibility) if the PRD implies them
- Priority comes from PRD emphasis (Must/Should/Could/Won't)

## Step 2: Create Coverage Map

Map each requirement to the user story (or stories) that cover it.

Create `docs/reviews/user-stories/coverage.json`:

```json
{
  "generated": "YYYY-MM-DD",
  "total_requirements": 47,
  "covered": 45,
  "uncovered": 2,
  "requirements": {
    "REQ-001": {
      "text": "Users can create an account with email and password",
      "stories": ["US-001", "US-002"],
      "status": "covered"
    },
    "REQ-042": {
      "text": "App sends push notification on task reminder",
      "stories": [],
      "status": "uncovered"
    }
  }
}
```

If any requirements are uncovered at this point, note them but continue — the external reviews will independently verify coverage.

## Step 3: Run External Reviews

Run `scripts/user-stories-mmr.sh` to execute Codex and Gemini reviews in parallel:

```bash
./scripts/user-stories-mmr.sh
```

The script:
- Bundles PRD + requirements index + coverage map + user stories into a review package
- Runs Codex CLI with schema-enforced output → `codex-review.json`
- Runs Gemini CLI with prompt-engineered JSON → `gemini-review.json`
- Validates both outputs against the JSON schema
- Reports results

If the script fails for one tool, it continues with the other. If both fail, proceed to Step 4 with whatever partial results exist.

**Do NOT edit the review JSON files** — they are raw evidence from independent reviewers.

## Step 4: Reconcile Reviews & Apply Fixes

Read both review JSONs (whichever are available). For each finding:

### 4a. Triage findings

Create a reconciliation table:

| Finding | Source | Severity | Action |
|---------|--------|----------|--------|
| REQ-014 uncovered | Both | high | Add story |
| US-007 vague AC | Codex only | medium | Rewrite AC |
| US-003/US-017 overlap | Gemini only | low | Clarify boundaries |

Rules:
- **Both models agree** → high confidence, apply fix
- **One model only, severity critical/high** → apply fix
- **One model only, severity medium/low** → use judgment; present to user if uncertain
- **Contradictory findings** → present both to user, let them decide

### 4b. Apply fixes to user-stories.md

For each accepted finding:
- **Missing requirements**: Add new user stories with the next available US-xxx ID
- **Story issues**: Fix acceptance criteria, scope boundaries, data requirements in-place
- **Contradictions**: Resolve by aligning story with PRD (PRD is source of truth)
- **Overlaps**: Clarify boundaries or consolidate (preserve IDs of consolidated stories)

Use AskUserQuestionTool for any findings where the right action isn't clear.

## Step 5: Quality Gate — Verify Coverage

Update `docs/reviews/user-stories/coverage.json` with the post-fix state.

**The quality gate**: `coverage.json` must show zero uncovered requirements.

If any requirements remain uncovered after applying fixes:
1. List the uncovered requirements
2. Ask the user whether to add stories for them or mark them as intentionally deferred
3. If deferred, add a `"status": "deferred"` with a `"reason"` field in coverage.json

## Step 6: Write Review Summary

Create `docs/reviews/user-stories/review-summary.md`:

```markdown
<!-- scaffold:user-stories-mmr v1.0 YYYY-MM-DD -->
# User Stories Multi-Model Review Summary

## Review Metadata
- **Date**: YYYY-MM-DD
- **Reviewers**: Codex CLI, Gemini CLI (or whichever were available)
- **Stories reviewed**: N
- **PRD requirements**: N
- **Pre-review coverage**: X/Y (Z%)
- **Post-review coverage**: Y/Y (100%)

## Findings Summary

| Category | Codex | Gemini | Agreed | Applied |
|----------|-------|--------|--------|---------|
| Missing requirements | N | N | N | N |
| Story issues | N | N | N | N |
| Contradictions | N | N | N | N |
| Overlaps | N | N | N | N |

## Actions Taken

### Stories Added
- US-xxx: [title] — covers REQ-xxx

### Stories Modified
- US-xxx: [what changed and why]

### Findings Deferred
- [any findings not actioned, with rationale]

## Coverage Verification
- Total PRD requirements: N
- Covered by user stories: N
- Uncovered: 0 (or list deferred items)
- Confidence: X%
```

## Step 7: Close Beads Task

```
bd close <id>
```

## Process
- Create a Beads task for this work before starting (Step 0)
- When complete and committed, close it (Step 7)
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- The single-writer rule is absolute: Codex and Gemini produce JSON critiques, only Claude modifies `docs/user-stories.md`
- Present reconciliation decisions to the user when findings conflict or severity is ambiguous
- All review artifacts are committed to the repo for auditability


_________________________________________________________________
# Platform Parity Review (Prompt)

This app targets multiple platforms as first-class citizens. Review `docs/tech-stack.md` and `docs/plan.md` to identify the specific target platforms (iOS, Android, web browsers, desktop) and their version requirements.

Key personas may use desktop/laptop as their primary device. If the PRD specifies web support, **the web version is a first-class citizen, not an afterthought.** The same applies in reverse — if mobile is listed, it's not just a responsive website.

Review all project documentation to ensure every target platform is thoroughly addressed. Identify gaps where one platform was assumed but another wasn't considered.

---

## Phase 1: Establish Platform Context

Before auditing, read `docs/tech-stack.md` and `docs/plan.md` to answer:

1. **What are the target platforms?** (iOS, Android, web, desktop — list exactly)
2. **What framework handles cross-platform?** (React Native + Expo, Flutter, separate codebases, responsive web app, etc.)
3. **How does the framework serve each platform?** (shared codebase with platform exports, separate builds, responsive CSS, etc.)
4. **Which personas use which platforms?** (e.g., admins on desktop, players on mobile)
5. **What are the browser/OS version requirements?**

This context determines which checklist items apply. Skip items that don't apply to the project's tech stack.

---

## Phase 2: Document Review

Read these documents thoroughly:
- `docs/plan.md` (PRD)
- `docs/user-stories.md`
- `docs/tech-stack.md`
- `docs/coding-standards.md`
- `docs/project-structure.md`
- `docs/tdd-standards.md`
- `docs/design-system.md` (if exists) — responsive breakpoints, platform-specific component patterns
- `docs/implementation-plan.md` (if exists)
- `docs/dev-setup.md` (if exists)
- `CLAUDE.md`

For each document, note:
- Platform-specific mentions (iOS, Android, web, mobile, browser, desktop)
- Assumptions that seem single-platform (e.g., only mobile APIs, only browser APIs)
- Missing platform considerations

---

## Phase 3: Platform Parity Checklist

Check each item against the project's tech stack. Skip items that don't apply.

### 3.1 Tech Stack (`docs/tech-stack.md`)

**Framework & Rendering**:
- [ ] Framework supports all target platforms (verify, don't assume)
- [ ] Build/export strategy defined for each platform
- [ ] Web rendering strategy defined if applicable (CSR, SSR, SSG, hybrid)
- [ ] Web bundler/build tool specified if separate from mobile
- [ ] Code splitting or lazy loading strategy for web

**Responsive & Adaptive**:
- [ ] Responsive breakpoints defined (mobile, tablet, desktop)
- [ ] Adaptive component strategy documented (shared components that scale vs. platform-specific components)
- [ ] Navigation pattern differences addressed per platform (bottom tabs, sidebar, top nav, drawer)

**Platform APIs** (check each API the app uses):
- [ ] Camera/media: approach for each platform
- [ ] Push notifications: approach for each platform (APNs, FCM, Web Push, etc.)
- [ ] Offline/caching: approach for each platform
- [ ] Local storage: approach for each platform (and abstraction strategy if different per platform)
- [ ] Deep linking / URL routing: approach for each platform
- [ ] Geolocation, sensors, biometrics, etc.: approach per platform where used

**Authentication**:
- [ ] Auth flow defined for each platform (redirect vs. popup for web, native flows for mobile)
- [ ] Session/token management per platform
- [ ] Persistent login strategy per platform

**Browser Compatibility** (if web is a target):
- [ ] Target browsers and minimum versions explicitly listed
- [ ] Polyfill or compatibility strategy for older browsers
- [ ] CSS compatibility approach documented
- [ ] Browser testing matrix defined

### 3.2 Coding Standards (`docs/coding-standards.md`)

**Input Handling**:
- [ ] Touch interaction patterns (tap, swipe, long press — if mobile is a target)
- [ ] Mouse interaction patterns (hover states, right-click — if web is a target)
- [ ] Keyboard navigation requirements (Tab, Enter, Escape, arrow keys — if web/desktop is a target)
- [ ] Focus management documented (focus traps for modals, skip links, focus indicators)
- [ ] Unified event handling approach (how the framework handles touch vs. click)

**Accessibility**:
- [ ] Web accessibility standards specified (WCAG level — if web is a target)
- [ ] Mobile accessibility (VoiceOver, TalkBack — if mobile is a target)
- [ ] Screen reader support approach per platform
- [ ] Reduced motion / high contrast preferences

**Responsive Patterns**:
- [ ] Component patterns for responsive behavior documented
- [ ] When to use platform detection vs. responsive breakpoints
- [ ] Platform-specific file conventions documented (e.g., `.web.tsx`, `.native.tsx`, `.ios.tsx`)

**Forms**:
- [ ] Form validation approach (shared across platforms?)
- [ ] Platform-specific form behaviors (Enter to submit on web, keyboard dismiss on mobile)
- [ ] Autofill/autocomplete support (if web is a target)
- [ ] Date/time picker strategy per platform

### 3.3 Project Structure (`docs/project-structure.md`)

**Code Organization**:
- [ ] Platform-specific file conventions defined and documented
- [ ] Shared code vs. platform-specific code locations clear
- [ ] Platform-specific asset directories (web public folder, mobile asset bundles, etc.)

**Build & Deploy**:
- [ ] Build pipeline defined for each target platform
- [ ] Deployment/distribution strategy per platform (app stores, web hosting, etc.)
- [ ] Environment configuration per platform

**Assets**:
- [ ] Web assets (favicon, manifest, og:image — if web is a target)
- [ ] Mobile assets (app icons, splash screens — if mobile is a target)
- [ ] Image optimization strategy per platform
- [ ] Font loading strategy per platform

### 3.4 User Stories (`docs/user-stories.md`)

**Platform Coverage**:
- [ ] Stories mention platform when behavior differs between platforms
- [ ] Platform-specific stories exist where needed (keyboard shortcuts for web, gestures for mobile, etc.)
- [ ] Acceptance criteria include platform-specific requirements where applicable
- [ ] Personas with a primary platform have stories that address that platform's conventions

**Common Gaps** (check if applicable to target platforms):
- [ ] Keyboard navigation story (if web is a target)
- [ ] Shareable URLs / deep links (if web is a target)
- [ ] Desktop-optimized layout story (if web/desktop personas exist)
- [ ] Gesture-based interaction stories (if mobile is a target)
- [ ] Offline usage story (if either platform needs offline support)

### 3.5 PRD (`docs/plan.md`)

**Platform Requirements**:
- [ ] Target platforms explicitly listed with version requirements
- [ ] Platform-specific usage patterns acknowledged (which personas use which platforms)
- [ ] Responsive/adaptive design requirements specified

**Feature Parity**:
- [ ] Features that differ by platform are marked as such
- [ ] No features implicitly assume a single platform (e.g., "swipe to delete" without keyboard alternative, or "hover to preview" without touch alternative)
- [ ] Platform-specific features called out (SEO for web, push notifications for mobile, etc.)

### 3.6 Dev Environment (`docs/dev-setup.md`)

**Platform-Specific Dev Commands**:
- [ ] Command to run each target platform documented (with expected output)
- [ ] How to run multiple platforms simultaneously
- [ ] Dev server URLs/ports documented for web

**Testing Setup Per Platform**:
- [ ] E2E testing tool specified for each platform (Playwright/Cypress for web, Maestro/Detox for mobile, etc.)
- [ ] Command to run tests for each platform (separate, not combined)
- [ ] Headed vs. headless mode instructions for browser tests
- [ ] Simulator/emulator setup for mobile tests
- [ ] Cross-browser testing workflow (if web is a target)

**Cross-Platform Development Workflow**:
- [ ] How to develop a feature that touches multiple platforms
- [ ] How to test the same feature on all target platforms
- [ ] Platform-specific debugging tools documented
- [ ] When to use simulator/emulator vs. physical device vs. browser

**CLAUDE.md Integration**:
- [ ] Platform-specific dev commands in CLAUDE.md quick reference
- [ ] Testing commands per platform in CLAUDE.md
- [ ] "Before testing" checklist per platform (e.g., start correct dev server, verify simulator running)

---

## Phase 4: Gap Analysis

### 4.1 Identify Gaps

Create a table:

| Document | Section | Gap Type | Issue | Severity | Recommendation |
|----------|---------|----------|-------|----------|----------------|
| tech-stack.md | Storage | Platform gap | Only documents mobile storage, not web | High | Add web storage strategy |
| coding-standards.md | Input | Platform gap | No keyboard nav standards | Critical | Add keyboard interaction patterns |
| user-stories.md | US-012 | Platform bias | "Swipe to archive" with no keyboard alt | High | Add keyboard alternative |
| dev-setup.md | Commands | Platform gap | No web dev server command | Critical | Add platform-specific commands |

### 4.2 Categorize by Severity

**Critical** (blocks a target platform from launching):
- No build/deploy pipeline for a target platform
- No responsive/adaptive strategy
- Authentication doesn't work on a target platform
- Core features require APIs unavailable on a target platform
- No dev server command for a target platform
- No E2E testing setup for a target platform

**High** (poor UX on a target platform):
- Missing input method support (keyboard for web, gestures for mobile)
- Single-platform navigation patterns used everywhere
- No platform-optimized layouts
- Missing browser/OS compatibility handling
- Dev setup doesn't explain cross-platform workflow

**Medium** (missing polish):
- No PWA / offline support for web
- No platform-specific optimizations (code splitting, lazy loading)
- Missing accessibility features for a platform
- Testing commands not separated by platform

**Low** (nice to have):
- No social sharing / OG tags for web
- No platform-specific animations or transitions
- Missing print stylesheets

---

## Phase 5: Recommendations

### 5.1 Documentation Updates

For each gap, specify:
- Which document to update
- What section to add or modify
- Draft content or key points

Structure recommendations by document, not by gap, so updates are batched.

### 5.2 User Story Additions

If user stories are missing platform coverage, draft the stories with:
- Story text referencing the specific platform and persona
- Acceptance criteria with platform-specific behavior
- Scope boundary (what's NOT included)
- Priority based on persona importance

### 5.3 Task Additions

If Beads tasks are missing platform work, group by:

**Platform infrastructure** (priority 0-1):
- Build/deploy setup for each platform
- Platform-specific dev commands and scripts
- Testing setup per platform (E2E tool, commands, configuration)

**Platform-specific features** (priority 1-2):
- Responsive/adaptive layouts
- Input method support (keyboard nav, gestures)
- Platform API adapters (storage, notifications, etc.)

**Dev environment** (priority 0-1):
- Platform-specific dev server commands
- Testing commands per platform
- Cross-platform development documentation
- CLAUDE.md updates for platform-specific commands

---

## Phase 6: Present Findings

### Summary Report

```
## Platform Parity Review Summary

### Target Platforms
[List from tech-stack.md/plan.md with version requirements]

### Documents Reviewed
[List with ✓/✗ status]

### Overall Assessment
[Good / Needs Work / Significant Gaps]

### Gap Summary
- Critical: X issues
- High: X issues
- Medium: X issues
- Low: X issues

### Key Findings
1. [Most important gap]
2. [Second most important]
3. [Third most important]

### Recommended Actions
1. [Highest priority — grouped by document]
2. [Second priority]
3. [etc.]

### Questions for You
- [Platform-specific decisions needed]
```

Wait for approval before making changes.

---

## Phase 7: Execute Updates

After approval:

1. **Update documentation** — batch by document
2. **Create missing user stories** in docs/user-stories.md
3. **Create Beads tasks** for missing platform work
4. **Update CLAUDE.md** with platform-specific commands and patterns

### Verification

After updates:
- [ ] Every target platform has a build/deploy strategy documented
- [ ] Every platform API the app uses has an approach documented per platform
- [ ] User stories cover platform-specific behavior where it differs
- [ ] Beads tasks exist for all platform infrastructure and features
- [ ] Coding standards include input patterns for every target platform's primary input method
- [ ] Dev setup has separate commands for each target platform
- [ ] E2E testing is set up for each target platform with clear commands
- [ ] CLAUDE.md has platform-specific dev and test commands
- [ ] No feature assumes a single platform without offering an alternative for other targets

---

## Common Platform Gaps

### Web gaps (when mobile was the primary focus):
1. Keyboard navigation — everything must be keyboard accessible
2. Desktop layouts — not just "mobile but wider"; genuinely different layouts
3. Navigation patterns — bottom tabs feel wrong on desktop
4. URL routing — web users expect shareable, bookmarkable URLs
5. Browser back button — must work correctly with navigation state
6. Form autofill — browsers expect proper autocomplete attributes
7. Text selection — web users expect to select and copy text
8. Link behavior — Cmd/Ctrl+click to open in new tab
9. No web dev server command — only mobile start commands documented
10. No browser testing — only mobile E2E tools set up

### Mobile gaps (when web was the primary focus):
1. Touch targets — minimum 44x44pt tap targets
2. Gesture support — swipe, long press, pull to refresh
3. Keyboard dismiss — tapping outside input fields should dismiss keyboard
4. Safe areas — notch, home indicator, status bar insets
5. Offline behavior — mobile loses connectivity more often
6. App state — backgrounding, foregrounding, memory pressure
7. Platform navigation — system back button on Android, swipe back on iOS
8. Native feel — platform-appropriate animations, haptics, transitions
9. No simulator/emulator commands — only browser dev setup documented
10. No mobile E2E testing — only Playwright/Cypress for web

### Dev environment gaps (commonly missed for both):
1. Platform-specific start commands not separated
2. Test commands not separated by platform
3. Dev server ports/URLs not documented
4. Cross-platform development workflow not explained
5. CLAUDE.md missing platform-specific commands for AI agents

---

## Process Rules

1. **Read tech-stack.md first** — Understand the actual framework and platforms before auditing
2. **Skip what doesn't apply** — Not every checklist item is relevant to every project
3. **Be specific** — "Add web support" is not actionable; name the exact file, section, and content
4. **Prioritize by persona impact** — If the primary persona uses desktop, keyboard nav is critical
5. **Present before changing** — Get approval on the gap list before updating docs
6. **Create tasks for implementation** — Documentation updates happen now; code work goes to Beads
7. **Don't prescribe tech choices** — If a platform API adapter is needed, describe what it must do, not which library to use (that's in tech-stack.md)
8. After all changes are applied, add a tracking comment to `docs/user-stories.md` after any existing scaffold tracking comments: `<!-- scaffold:platform-parity v1 YYYY-MM-DD -->` (use actual date)



__________________________________
# Claude.md Optimization (Prompt)

Review all project documentation and consolidate CLAUDE.md into the definitive, optimized reference for AI agents working on this project.

## Context

Throughout project setup, multiple prompts have added sections to CLAUDE.md:
- Core workflow and TDD process
- Beads task management
- Git workflow procedures (branching, PRs, protected main)
- Parallel agent coordination (worktrees, BD_ACTOR)
- Browser testing with Playwright or Maestro
- Project structure quick reference

These incremental additions may have created redundancy, inconsistency, or gaps. This prompt consolidates everything into a single, tight document.

**Ordering note:** This prompt should run BEFORE the Workflow Audit prompt. This prompt consolidates; the Workflow Audit verifies alignment with the canonical workflow.

## Documents to Review

Read and cross-reference ALL of these:
- `CLAUDE.md` (current state)
- `docs/plan.md` (PRD)
- `docs/tech-stack.md`
- `docs/coding-standards.md`
- `docs/tdd-standards.md`
- `docs/git-workflow.md`
- `docs/project-structure.md`
- `docs/user-stories.md`

## Analysis Phase

### 1. Redundancy Audit
- Identify instructions that appear in multiple places within CLAUDE.md
- Identify CLAUDE.md content that duplicates what's in other docs verbatim
- Principle: CLAUDE.md should reference other docs, not repeat them

### 2. Consistency Audit
- Terminology: Are we consistent? (task vs. ticket, feature vs. story, etc.)
- Commands: Are Beads commands, git commands, and test commands shown consistently?
- Workflow steps: Does the session-start and session-end sequence appear once, clearly?
- Branching pattern: Use `git checkout -b bd-<id>/<desc> origin/main` consistently (branch from origin/main, not checkout-pull-branch)
- Commit format: Use `[BD-<id>] type(scope): description` consistently (task ID prefix in brackets)

### 3. Gap Audit
- Is every doc referenced appropriately? (Agent should know when to consult each)
- Are there workflow scenarios not covered? (What if tests fail? What if there's a merge conflict? What if `bd ready` returns nothing? What if push to main is rejected? What if an agent session crashes mid-task?)
- Are the most common agent mistakes addressed with explicit rules?
- Is the parallel agent workflow clear? (Permanent worktrees with workspace branches, BD_ACTOR, agents cannot checkout main, always branch from origin/main)
- Is the PR workflow explicit and complete? (Rebase, push, create PR, auto-merge with --delete-branch, watch CI, confirm merge)
- Is task closure documented with both variants? (Single agent: checkout main, delete branch, prune. Worktree: fetch, prune, clean. Both: `bd close`, `bd sync`)
- Is the continuous work loop clear? (Keep working until `bd ready` returns nothing)
- Is it clear that every commit requires a Beads task? (All fixes and enhancements need a task for the commit message)
- Does the Key Commands table include all project-specific commands? (lint, test, install, dev server — these must match what's in Makefile/package.json/pyproject.toml, and the workflow references this table instead of hardcoding commands)
- Does the planning guidance explicitly warn against Claude Code's interactive `/plan` mode? (Agents should think through their approach, NOT enter `/plan` which blocks autonomous execution)

### 4. Priority Audit
- What are the 6 most important things an agent must do correctly?
  - TDD (failing test first)
  - Never push to main (always PR with squash)
  - Keep working until no tasks remain
  - Verify before committing (tests pass, lint clean)
  - Use worktrees for parallel agents
  - Every commit needs a Beads task (for commit message ID)
- Are these prominent and unambiguous, or buried in prose?
- Could an agent skim CLAUDE.md in 30 seconds and get the critical points?

## CLAUDE.md Structure

After analysis, restructure CLAUDE.md to follow this format:

```markdown
# CLAUDE.md

## Core Principles
[3-5 non-negotiable rules - the things that matter most]

## Git Workflow (CRITICAL)
[Never commit to main, full PR workflow: rebase → push → create PR → auto-merge with --delete-branch → watch CI → confirm merge, key commands]

## Workflow

### Session Start
[Exact steps - Beads, lessons review, etc.]

### Plan Before Building
[Think through approach for non-trivial work. Write specs upfront. CRITICAL: Do NOT enter Claude Code's interactive `/plan` mode — it blocks autonomous execution. Just think through the problem internally.]

### Implementation Loop
[TDD cycle repeating per piece of functionality, verification using Key Commands lint+test, commits with [BD-<id>] format. Multiple commits per task are normal — they squash-merge. Self-review before push (claude -p subagent checks against docs/review-standards.md for P0/P1/P2). Rebase onto origin/main before push. One clear flow.]

### Task Closure and Next Task
[Confirm merge, bd close, bd sync. Single agent: checkout main, delete branch, prune. Worktree agent: fetch, prune, clean, branch from origin/main (cannot checkout main). Keep working until no tasks remain]

### Session End
[Exact steps - mandatory, in order]

## Parallel Sessions (Worktrees)
[For multiple simultaneous agents - permanent worktrees with workspace branches, BD_ACTOR, agents cannot checkout main (it's checked out in main repo), always branch from origin/main, workspace cleanup between tasks, batch branch cleanup]

## Quick Reference

### Project Structure
[Where things go - table or brief list, link to full doc]

### Key Commands
[Beads, git, PR commands — these are universal]
[Lint, test, install, dev server commands — these are project-specific, populated by the Dev Setup prompt. The workflow references this table instead of hardcoding commands.]

### When to Consult Other Docs
| Situation | Document |
|-----------|----------|
| Need to understand a feature | docs/user-stories.md |
| Architecture decision questions | docs/tech-stack.md |
| Code style question | docs/coding-standards.md |
| Testing approach question | docs/tdd-standards.md |
| Git/branching question | docs/git-workflow.md |
| Where to put a file | docs/project-structure.md |
| Running multiple agents in parallel | docs/git-workflow.md |
| Review criteria / severity definitions | docs/review-standards.md |
| Codex Cloud review instructions | AGENTS.md |

## Rules

### Git Rules
[Branch format, commit format with [BD-<id>] prefix, forbidden actions like push to main, --force-with-lease only]

### Code Rules
[AI-Specific pitfalls to avoid - consolidated from all docs]

### Coordination
[High-conflict files and how to handle them]

### Error Recovery
[What to do when things go wrong - test failures, merge conflicts, blocked tasks, CI failures, crashed agent sessions, orphaned worktree work]

## Browser/E2E Testing
[Playwright MCP or Maestro usage - keep brief, patterns only]

## Self-Improvement
[Lessons file location, when to update it]

## Autonomous Behavior
[Fix bugs on sight, keep working until no tasks, use subagents]
[Every fix/enhancement needs a Beads task — commit messages require task ID]
```

## Optimization Principles

### Brevity Over Completeness
CLAUDE.md is read at the start of every task. Every unnecessary sentence costs attention. If something is in another doc and can be referenced, reference it — don't repeat it.

### Scannability
- Use tables for lookups
- Use numbered steps for sequences
- Use bullet points sparingly and only for truly parallel items
- Bold the most critical words in any rule

### Front-Load the Important Stuff
The first thing an agent reads should be the most important. Core principles and session-start workflow should be at the top, not buried after background context.

### Actionable Over Aspirational
Every sentence should either be:
- A specific action to take
- A specific thing to avoid
- A pointer to where to find more detail

Remove any "philosophy" or "background" that doesn't directly change agent behavior.

### Key Commands Is Source of Truth
The Key Commands table in Quick Reference is the single source of truth for project-specific commands (lint, test, install, dev server). The canonical workflow, git workflow, CI pipeline, and worktree cleanup all reference this table instead of hardcoding commands. Do NOT remove, rename, or split this table. Ensure all project commands are present and match the actual Makefile/package.json/pyproject.toml.

## What to Deliver

1. **Analysis summary**: Brief list of redundancies, inconsistencies, and gaps found
2. **Optimized CLAUDE.md**: The restructured, consolidated document
3. **Changelog**: What was removed, what was added, what was reorganized
4. **Verification checklist**: Confirm the critical patterns are explicit and prominent

## Process

- Do NOT use AskUserQuestionTool unless you find a genuine conflict between docs that requires a decision
- Do NOT add new workflow steps or rules — only consolidate and clarify what already exists
- Do NOT remove anything that was intentionally added by previous prompts — consolidate it
- After rewriting, read CLAUDE.md fresh and verify an agent could follow it without consulting other docs for the basic workflow
- Add a tracking comment as the last line of `CLAUDE.md`: `<!-- scaffold:claude-md-optimization v1 YYYY-MM-DD -->` (use actual date)

### Critical Patterns to Verify Are Present

Before finalizing, verify CLAUDE.md explicitly covers:

1. **Never push to main** — main is protected, all changes via PR
2. **PR workflow** — rebase onto origin/main, then `gh pr create`, then `gh pr merge --squash --auto --delete-branch`, then `gh pr checks --watch --fail-fast`, then `gh pr view --json state -q .state` must show "MERGED"
3. **Self-review before push** — `claude -p` subagent checks against `docs/review-standards.md` for P0/P1/P2 issues, fixes them, runs lint+test
4. **Task closure** — two variants: single agent (checkout main, delete branch, prune) and worktree agent (fetch, prune, clean — cannot checkout main). Both use `bd close`, `bd sync`
5. **Continuous work loop** — clean workspace between tasks, keep working until `bd ready` returns nothing
6. **Parallel agent setup** — permanent worktrees with workspace branches, BD_ACTOR, agents always branch from `origin/main`, never `git checkout main`
7. **TDD always** — failing test before implementation, loop repeats per piece of functionality, multiple commits per task squash-merge
8. **Every commit needs a Beads task** — commit messages require `[BD-<id>]` format
9. **Error recovery** — test failures, merge conflicts, CI failures, crashed sessions, orphaned worktree work




______________________________
# Workflow Audit (Prompt)

Review all project documentation to ensure the standard feature workflow is clearly documented, consistent across all files, and provides unambiguous guidance for AI agents and human developers.

The workflow below is the canonical source of truth. Your job is to ensure every document that touches workflow is aligned with it.

**Ordering note:** This prompt should run AFTER the Claude.md Optimization prompt. That prompt consolidates; this one verifies alignment with the canonical workflow and fixes any remaining gaps.

---

## Canonical Workflow

### Step-by-step Feature Workflow

**1a. Pick a task (for existing tasks)**
```bash
bd ready                    # See what's available
bd update <id> --status in_progress --claim
```
Always pick the lowest-ID unblocked task.

**1b. Create a task (for ad-hoc requests)**
```bash
bd create "<task type>: <desc>" -p 1
bd update <id> --claim
```

**2. Create a feature branch**
```bash
git fetch origin
git checkout -b bd-<task-id>/<short-desc> origin/main
```
Review `tasks/lessons.md` for patterns learned from past mistakes.

**3. Plan before building**
Think through your approach for anything non-trivial (3+ steps or architectural decisions). Write specs upfront. **Do NOT enter Claude Code's interactive plan mode** (`/plan`) — it blocks autonomous execution. If things go sideways mid-implementation, stop and re-plan rather than pushing through.

**4. TDD loop (Red → Green → Refactor)**
Repeat for each piece of functionality in the task:
1. **Red** — Write a failing test that defines expected behavior
2. **Green** — Write the minimum code to make it pass
3. **Refactor** — Clean up while tests stay green
4. **Verify** — Run the project's lint and test commands (see CLAUDE.md Key Commands table)
5. **Commit** — `git commit -m "[BD-<id>] type(scope): description"`

Continue until all acceptance criteria for the task are met. Multiple commits per task are normal — they'll be squash-merged into one commit on main.

**4.5. Self-review (before push)**
```bash
claude -p "Review changes on this branch vs origin/main. Check against docs/review-standards.md for P0/P1/P2 issues. Fix any issues found. Run <lint> and <test> after fixes. Commit fixes with [BD-<id>] fix: address self-review findings"
```
Catches issues before external review. Runs once before push — cheaper and more targeted than a hook.

**5. Rebase, push, and open a PR**
```bash
git fetch origin && git rebase origin/main    # Rebase onto latest main
git push -u origin HEAD
gh pr create --title "[BD-<id>] type(scope): description" --body "Closes BD-<id>"
gh pr merge --squash --auto --delete-branch
```
Auto-merge is set immediately — the PR merges itself once CI passes. The `--delete-branch` flag automatically removes the remote branch after merge (local branch is cleaned up in step 9).

**6. Watch CI**
```bash
gh pr checks --watch --fail-fast
```
This blocks until all checks pass or one fails. If a check fails: fix locally, commit, push, re-run the watch command.

**7. Confirm merge**
```bash
gh pr view --json state -q .state   # Must show "MERGED"
```
Never close the task until this shows MERGED.

**8. Close task and clean up**

*Single agent (main repo):*
```bash
bd close <id>
bd sync
git checkout main && git pull --rebase origin main
git branch -d bd-<task-id>/<short-desc>              # Local branch (remote already deleted by --delete-branch)
git fetch origin --prune                              # Clean up stale remote refs
```

*Worktree agent (cannot checkout main):*
```bash
bd close <id>
bd sync
git fetch origin --prune
git clean -fd
<install-deps>  # Use project's install command from CLAUDE.md Key Commands
```
Worktree agents cannot `git checkout main` — it's checked out in the main repo. They branch directly from `origin/main`. Merged local branches are batch-cleaned periodically.

**9. Next task or done**
```bash
bd ready
```
If tasks remain, go back to step 1. If none remain, the session is complete.

*Worktree agents:* Create the next feature branch directly from `origin/main`:
```bash
git checkout -b bd-<next-task>/<desc> origin/main
```

### Key Constraints (Always Apply)
- Never push directly to main — everything goes through squash-merge PRs
- Every commit carries a Beads task ID in format `[BD-<id>]`
- Lint and test must pass before any commit (use the project's lint and test commands from CLAUDE.md Key Commands)
- Only `--force-with-lease` on feature branches, never force push to main
- Use subagents for research/exploration to keep the main context clean
- Review `tasks/lessons.md` before starting work
- If a task requires human action or is outside your capability, skip it: `bd update <id> --status blocked` with a note, then pick the next task

---

## Phase 1: Document Inventory

Read these documents and note any workflow-related content:

| Document | What to Look For |
|----------|------------------|
| `CLAUDE.md` | Workflow section, git rules, Beads commands, commit format |
| `docs/dev-setup.md` | Development workflow, common commands |
| `docs/coding-standards.md` | Commit message format, TDD requirements, linting |
| `docs/git-workflow.md` | Branch naming, PR process, merge strategy, worktree workflow |
| `docs/implementation-plan.md` (if exists) | Task workflow references |
| `Makefile` or `package.json` or `pyproject.toml` | Available commands (lint, test, install, dev) |
| `.github/` | PR templates, CI workflows |
| `tasks/lessons.md` | Referenced in workflow? Contains useful patterns? |

For each document, extract:
- Current workflow instructions (verbatim quotes)
- Commands mentioned
- Constraints stated
- Anything that contradicts or partially covers the canonical workflow

---

## Phase 2: Completeness Check

### 2.1 CLAUDE.md Audit (Critical — AI Agents Read This)

CLAUDE.md must contain the complete workflow. Check for:

**Workflow Section Exists**:
- [ ] Dedicated section for feature workflow (e.g., "## Feature Workflow" or "## Development Workflow")
- [ ] Steps are numbered and in correct order
- [ ] All 9 steps are present (pick task → next task), plus step 4.5 (self-review)
- [ ] Commands are copy-pasteable (not pseudo-code)

**Step 1: Task Selection**:
- [ ] `bd ready` documented
- [ ] `bd update <id> --status in_progress --claim` documented
- [ ] "Pick lowest-ID unblocked task" rule stated
- [ ] Ad-hoc task creation documented (`bd create`)

**Step 2: Branch Creation**:
- [ ] `git fetch origin` before branching
- [ ] Branch naming format: `bd-<task-id>/<short-desc>`
- [ ] Branch from `origin/main` (not checkout main, pull, then branch)
- [ ] Reference to `tasks/lessons.md` review

**Step 3: Planning**:
- [ ] Planning approach mentioned for non-trivial work (think through, write specs — NOT interactive `/plan` mode)
- [ ] Explicit warning not to enter Claude Code's interactive plan mode (`/plan`)
- [ ] "3+ steps or architectural decisions" trigger documented
- [ ] Re-plan guidance if implementation goes sideways

**Step 4: TDD Loop**:
- [ ] Red → Green → Refactor cycle documented
- [ ] Each phase explained (not just "do TDD")
- [ ] Clear that loop repeats per piece of functionality until all acceptance criteria are met
- [ ] Multiple commits per task acknowledged (squash-merged later)
- [ ] Lint and test verification step (using project's commands from CLAUDE.md Key Commands table)
- [ ] Commit message format: `[BD-<id>] type(scope): description`

**Step 4.5: Self-Review**:
- [ ] `claude -p` subagent command documented
- [ ] Reviews against `docs/review-standards.md` for P0/P1/P2 issues
- [ ] Runs lint and test after fixes
- [ ] Commits fixes with `[BD-<id>] fix: address self-review findings`
- [ ] Runs once before push (not a hook)

**Step 5: Rebase, Push, PR Creation**:
- [ ] `git fetch origin && git rebase origin/main` before push
- [ ] `git push -u origin HEAD`
- [ ] `gh pr create` with title format matching `[BD-<id>] type(scope): description`
- [ ] `gh pr merge --squash --auto --delete-branch` immediately after create
- [ ] `--delete-branch` explained (removes remote branch after merge)
- [ ] Explanation that auto-merge triggers after CI passes

**Step 6: CI Watch**:
- [ ] `gh pr checks --watch --fail-fast` documented
- [ ] Failure handling: fix → commit → push → re-watch

**Step 7: Confirm Merge**:
- [ ] `gh pr view --json state -q .state` documented
- [ ] "Must show MERGED" requirement
- [ ] "Never close task until MERGED" rule

**Step 8: Cleanup**:
- [ ] `bd close <id>` (not `bd update --status completed`)
- [ ] `bd sync`
- [ ] Single agent: return to main and pull with rebase, delete local feature branch
- [ ] Worktree agent: `git fetch origin --prune`, `git clean -fd`, reinstall deps using project's install command (no checkout main — it's checked out in main repo)
- [ ] `git fetch origin --prune` to clean up stale remote refs
- [ ] Worktree variant explicitly documented (agents cannot checkout main)

**Step 9: Continue or Stop**:
- [ ] `bd ready` to check for more work
- [ ] "Keep working until no tasks remain" stated
- [ ] Worktree agents: branch directly from `origin/main` for next task
- [ ] Batch branch cleanup documented for worktree agents

**Key Constraints Section**:
- [ ] Never push directly to main
- [ ] Every commit has Beads task ID in `[BD-<id>]` format
- [ ] Lint and test before commit (references Key Commands table, not hardcoded commands)
- [ ] Only `--force-with-lease` on feature branches
- [ ] Subagents for research

### 2.2 Supporting Documents Audit

**docs/coding-standards.md**:
- [ ] Commit message format matches: `[BD-<id>] type(scope): description`
- [ ] TDD requirements documented
- [ ] Linting requirements documented
- [ ] No contradictory commit format (e.g., doesn't say `feat: description` without task ID)
- [ ] Styling / Design System section exists (if project has frontend) — references docs/design-system.md, prohibits arbitrary hex/px values

**docs/dev-setup.md**:
- [ ] Lint and test commands documented and match CLAUDE.md Key Commands table
- [ ] How to run tests in watch mode
- [ ] No workflow steps that contradict CLAUDE.md

**Makefile / package.json / pyproject.toml**:
- [ ] Lint command exists and matches CLAUDE.md
- [ ] Test command exists and matches CLAUDE.md
- [ ] Install command exists and matches CLAUDE.md

**docs/git-workflow.md** (if exists):
- [ ] Branch naming matches: `bd-<task-id>/<short-desc>`
- [ ] Branching from `origin/main` (not checkout-pull-branch)
- [ ] Self-review step documented (step 4.5 — `claude -p` subagent before push)
- [ ] Rebase onto origin/main before push documented
- [ ] Commit format matches: `[BD-<id>] type(scope): description`
- [ ] Squash merge with `--delete-branch` documented
- [ ] CI watch step documented
- [ ] Merge confirmation step documented
- [ ] Task closure with `bd close` documented
- [ ] Protected main documented
- [ ] Worktree workflow variant documented (workspace cleanup between tasks)
- [ ] Agent crash recovery documented
- [ ] No contradictory merge strategy or commit format

**.github/PULL_REQUEST_TEMPLATE.md** (if exists):
- [ ] References task ID format
- [ ] Matches documented PR title format

**tasks/lessons.md**:
- [ ] File exists
- [ ] Contains actual lessons (not empty placeholder)
- [ ] Referenced in CLAUDE.md workflow

### 2.3 Consistency Check

Cross-reference all documents for contradictions:

| Element | Check For Consistency |
|---------|----------------------|
| Commit format | `[BD-<id>] type(scope): description` everywhere |
| Branch naming | `bd-<task-id>/<short-desc>` from `origin/main` everywhere |
| Merge strategy | `--squash --auto --delete-branch` stated consistently |
| Required checks | Lint and test commands consistent across CLAUDE.md Key Commands, dev-setup.md, and Makefile/package.json |
| Task ID format | `[BD-<id>]` consistent (not `BD-<id>` without brackets, not `(bd-<id>)` suffix) |
| Close command | `bd close` consistently (not `bd update --status completed`) |
| Pull strategy | `git pull --rebase origin main` consistently |
| PR workflow | All 7 sub-steps (commit, rebase, push, create, auto-merge, watch, confirm) |

---

## Phase 3: Gap Analysis

### 3.1 Identify Gaps

Create a table of findings:

| Document | Issue Type | Problem | Fix |
|----------|------------|---------|-----|
| CLAUDE.md | Missing step | No CI watch step (step 6) | Add `gh pr checks --watch` section |
| CLAUDE.md | Incomplete | Says "create PR" but no auto-merge | Add `gh pr merge --squash --auto --delete-branch` |
| CLAUDE.md | Missing | No merge confirmation step | Add `gh pr view --json state` check |
| CLAUDE.md | Missing | No task closure commands | Add `bd close`, `bd sync`, branch cleanup |
| CLAUDE.md | Missing | No reference to tasks/lessons.md | Add to step 2 |
| CLAUDE.md | Wrong format | Commit uses `feat(scope): desc (bd-<id>)` | Update to `[BD-<id>] type(scope): description` |
| coding-standards.md | Contradiction | Says `feat: description` | Update to `[BD-<id>] type(scope): description` |
| git-workflow.md | Missing | No worktree cleanup between tasks | Add `git clean -fd && <install-deps>` step |
| Makefile | Missing | No `lint` target | Create lint target |
| tasks/lessons.md | Missing | File doesn't exist | Create with initial structure |

### 3.2 Categorize by Severity

**Critical** (agents will do the wrong thing):
- Wrong or missing git workflow (push to main, wrong branch naming)
- Missing task ID requirement (commits without `[BD-<id>]`)
- Wrong merge strategy (merge instead of squash, missing --delete-branch)
- Missing verification steps (no CI watch, no merge confirmation)
- Wrong commit format (task ID at end instead of prefix, missing brackets)
- Missing task closure (`bd close` not documented)

**High** (workflow friction, inconsistency):
- Incomplete steps (missing cleanup commands, missing --prune)
- Contradictions between documents
- Missing Makefile targets that are referenced
- Branching from local main instead of origin/main

**Medium** (missing context):
- No tasks/lessons.md reference
- Incomplete TDD documentation
- Missing planning guidance (think through approach, NOT interactive `/plan` mode)
- No worktree cleanup between tasks
- No crash recovery documentation

**Low** (polish):
- Formatting inconsistencies
- Redundant documentation
- Could be clearer

---

## Phase 4: Recommendations

This phase provides fixes for gaps found. If CLAUDE.md was already consolidated by the Claude.md Optimization prompt, most issues should be minor alignment fixes. If CLAUDE.md is missing the workflow entirely, use the complete section below as a fallback.

### 4.1 CLAUDE.md Updates

If CLAUDE.md is missing the workflow or has gaps, provide the complete section:

```markdown
## Feature Workflow

### 1. Pick or Create a Task

**Existing task:**
```bash
bd ready                                          # See available tasks
bd update <id> --status in_progress --claim       # Claim lowest-ID task
```

**Ad-hoc request (no existing task):**
```bash
bd create "<type>: <description>" -p 1
bd update <id> --claim
```

### 2. Create Feature Branch
```bash
git fetch origin
git checkout -b bd-<task-id>/<short-desc> origin/main
```
Review `tasks/lessons.md` for patterns from past mistakes.

### 3. Plan Before Building
For non-trivial work (3+ steps or architectural decisions):
- Think through your approach before coding
- **Do NOT enter interactive plan mode** (`/plan`) — it blocks autonomous execution
- Write specs upfront
- If implementation goes sideways, stop and re-plan

### 4. TDD Loop
Repeat for each piece of functionality in the task:
1. **Red**: Write a failing test that defines expected behavior
2. **Green**: Write minimum code to make it pass
3. **Refactor**: Clean up while tests stay green
4. **Verify**: Run lint and test commands (see Key Commands below)
5. **Commit**: `git commit -m "[BD-<id>] type(scope): description"`

Continue until all acceptance criteria are met. Multiple commits are normal — they squash-merge.

### 4.5. Self-Review
```bash
claude -p "Review changes on this branch vs origin/main. Check against docs/review-standards.md for P0/P1/P2 issues. Fix any issues found. Run <lint> and <test> after fixes. Commit fixes with [BD-<id>] fix: address self-review findings"
```
Catches issues before external review. Runs once before push — not a hook.

### 5. Rebase, Push, and Open PR
```bash
git fetch origin && git rebase origin/main    # Rebase onto latest main
git push -u origin HEAD
gh pr create --title "[BD-<id>] type(scope): description" --body "Closes BD-<id>"
gh pr merge --squash --auto --delete-branch
```
Auto-merge triggers once CI passes. `--delete-branch` removes the remote branch automatically.

### 6. Watch CI
```bash
gh pr checks --watch --fail-fast
```
If a check fails: fix locally, commit, push, re-run watch.

### 7. Confirm Merge
```bash
gh pr view --json state -q .state   # Must show "MERGED"
```
**Never close task until this shows MERGED.**

### 8. Close Task and Clean Up

**Single agent (main repo):**
```bash
bd close <id>
bd sync
git checkout main && git pull --rebase origin main
git branch -d bd-<task-id>/<short-desc>    # Local only; remote deleted by --delete-branch
git fetch origin --prune                    # Clean up stale remote refs
```

**Worktree agent (cannot checkout main):**
```bash
bd close <id>
bd sync
git fetch origin --prune
git clean -fd
<install-deps>  # Use project's install command from Key Commands
```

### 9. Next Task or Done
```bash
bd ready
```
If tasks remain, return to step 1. If none, session is complete.

**Worktree agents:** Create the next feature branch directly from `origin/main`:
```bash
git checkout -b bd-<next-task>/<desc> origin/main
```

Merged local branches in worktrees are batch-cleaned periodically.

---

## Git Rules (CRITICAL)

- **Never push directly to main** — all changes through squash-merge PRs
- **Every commit has task ID** — format: `[BD-<id>] type(scope): description`
- **Verify before commit** — lint and test must pass (see Key Commands)
- **Force push safely** — only `--force-with-lease`, only on feature branches
- **Branch from origin** — always `git checkout -b <branch> origin/main`

## Working Practices

- **Subagents for research** — keeps main context clean
- **Review lessons learned** — check `tasks/lessons.md` before starting
- **Re-plan when stuck** — if implementation goes sideways, pause and rethink your approach (do NOT use `/plan`)
- **Keep working** — continue until `bd ready` returns nothing
```

### 4.2 Other Document Updates

For each document with issues, provide specific fixes:

**docs/coding-standards.md — Commit Format**:
```markdown
## Commit Messages

Format: `[BD-<id>] type(scope): description`

Examples:
- `[BD-42] feat(auth): add login endpoint`
- `[BD-42] fix(auth): handle expired tokens`
- `[BD-42] test(auth): add login validation tests`
- `[BD-42] refactor(auth): extract token validation`

Types: feat, fix, test, refactor, docs, chore

The task ID is required — every commit must trace to a Beads task.
```

**Makefile / package.json — Missing Commands**:

If lint or test commands don't exist, create them. The Dev Setup prompt should have configured these — if they're missing, add them now. The specific commands depend on the tech stack (check `docs/tech-stack.md`):

```makefile
# Makefile example (Python projects)
.PHONY: lint test install

lint:
	ruff check .

test:
	pytest

install:
	pip install -r requirements.txt
```

```json
// package.json example (Node projects)
{
  "scripts": {
    "lint": "eslint .",
    "test": "vitest run",
    "install": "npm install"
  }
}
```

Ensure CLAUDE.md Key Commands table matches whatever is configured here.

**tasks/lessons.md — Create If Missing**:
```markdown
# Lessons Learned

Patterns and anti-patterns discovered during development. Review before starting new tasks.

## Patterns (Do This)

<!-- Add patterns as you discover them -->

## Anti-Patterns (Avoid This)

<!-- Add anti-patterns as you discover them -->

## Common Gotchas

<!-- Add gotchas specific to this project -->
```

### 4.3 Task Creation

If implementation work is needed:

```bash
# Missing infrastructure
bd create "Create tasks/lessons.md with initial structure" -p 0
bd create "Add lint target to Makefile" -p 0
bd create "Add test target to Makefile" -p 0
bd create "Create PR template with task ID format" -p 2

# Documentation fixes (do immediately, no task needed)
# - Update CLAUDE.md workflow section
# - Fix commit format in coding-standards.md
```

---

## Phase 5: Present Findings

### Summary Report

```
## Workflow Audit Summary

### Documents Reviewed
- CLAUDE.md: [Complete / Incomplete / Missing workflow]
- docs/coding-standards.md: [Aligned / Contradictions / Missing]
- docs/dev-setup.md: [Aligned / Contradictions / Missing]
- docs/git-workflow.md: [Aligned / Contradictions / Missing]
- Makefile: [Has required targets / Missing targets]
- tasks/lessons.md: [Exists / Missing]

### Workflow Coverage in CLAUDE.md
- Step 1 (Task selection): [✓ Complete / ⚠️ Partial / ✗ Missing]
- Step 2 (Branch creation): [✓ / ⚠️ / ✗]
- Step 3 (Planning): [✓ / ⚠️ / ✗]
- Step 4 (TDD loop): [✓ / ⚠️ / ✗]
- Step 4.5 (Self-review): [✓ / ⚠️ / ✗]
- Step 5 (PR creation): [✓ / ⚠️ / ✗]
- Step 6 (CI watch): [✓ / ⚠️ / ✗]
- Step 7 (Confirm merge): [✓ / ⚠️ / ✗]
- Step 8 (Cleanup): [✓ / ⚠️ / ✗]
- Step 9 (Next task): [✓ / ⚠️ / ✗]
- Key constraints: [✓ / ⚠️ / ✗]

### Consistency Issues
[List any contradictions between documents]

### Gap Summary
- Critical: X issues
- High: X issues
- Medium: X issues
- Low: X issues

### Recommended Actions
1. [Highest priority fix]
2. [Second priority]
3. [etc.]

### Questions for You
- [Any decisions needed]
```

Wait for approval before making changes.

---

## Phase 6: Execute Updates

After approval:

1. **Update CLAUDE.md** — Add or fix workflow section
2. **Fix contradictions** — Update other docs to align
3. **Create missing files** — tasks/lessons.md, Makefile targets
4. **Create tasks** — For any implementation work needed

### Verification Checklist

After updates, verify:

- [ ] CLAUDE.md has complete workflow (9 steps + step 4.5 self-review)
- [ ] All commands are copy-pasteable
- [ ] Commit format `[BD-<id>] type(scope): description` is consistent everywhere
- [ ] Branch naming `bd-<task-id>/<short-desc>` from `origin/main` is consistent everywhere
- [ ] PR workflow includes all 7 sub-steps (commit, rebase, push, create, auto-merge, watch, confirm)
- [ ] `--delete-branch` flag present on merge command
- [ ] Task closure uses `bd close` (not `bd update --status completed`)
- [ ] Makefile/package.json has lint, test, and install commands
- [ ] CLAUDE.md Key Commands table has correct lint, test, and install commands matching actual scripts
- [ ] tasks/lessons.md exists and is referenced
- [ ] No document contradicts the canonical workflow
- [ ] Key constraints section exists in CLAUDE.md
- [ ] Worktree cleanup between tasks is documented
- [ ] Worktree variant of task closure documented (cannot checkout main, batch branch cleanup)
- [ ] Agent crash recovery is documented (in git-workflow.md)

---

## Process Rules

1. **Canonical workflow is source of truth** — Documents align to it, not vice versa
2. **CLAUDE.md is highest priority** — AI agents read this; it must be complete
3. **Contradictions are critical** — Fix immediately, don't leave ambiguity
4. **Commands must be exact** — No pseudo-code, no "something like this"
5. **Present before changing** — Get approval on findings first
6. **Document updates happen now** — Don't create tasks for doc fixes; just fix them
7. Add a tracking comment as the last line of `CLAUDE.md` (after any existing scaffold comments): `<!-- scaffold:workflow-audit v1 YYYY-MM-DD -->` (use actual date)

---

## Quick Reference: What Each Step Must Include

| Step | Required Elements |
|------|-------------------|
| 1 | `bd ready`, `bd update --claim`, lowest-ID rule, ad-hoc creation |
| 2 | `git fetch`, branch format, `origin/main`, lessons.md reference |
| 3 | Think through approach (3+ steps), write specs, do NOT use `/plan`, re-plan if stuck |
| 4 | Red/Green/Refactor, verify command (project's lint+test from Key Commands), commit format `[BD-<id>]` |
| 4.5 | Self-review: `claude -p` subagent checks against `docs/review-standards.md` for P0/P1/P2, fixes issues, runs lint+test |
| 5 | Rebase onto origin/main, push, PR create with title, auto-merge with `--delete-branch` |
| 6 | `gh pr checks --watch`, failure handling |
| 7 | Merge confirmation command, "never close until MERGED" |
| 8 | `bd close`, `bd sync`. Single: return to main, delete branch, `--prune`. Worktree: fetch, prune, clean (no checkout main) |
| 9 | `bd ready`, continue or stop. Worktree: branch from `origin/main`, batch-clean merged branches |
| Constraints | No push to main, `[BD-<id>]` required, lint+test before commit, force-with-lease, subagents |



_______________________________
# Implementation Plan (Prompt)

Review the PRD (`docs/plan.md`), user stories (`docs/user-stories.md`), and all project standards, then create an implementation plan and Beads task graph for this project.

## Mode Detection

Before starting, check if `docs/implementation-plan.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:implementation-plan v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative. Also run `bd list` to see all existing Beads tasks.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/plan.md`, `docs/user-stories.md`, `docs/project-structure.md`, `docs/tdd-standards.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:implementation-plan v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/implementation-plan.md`
- **Secondary output**: Beads tasks (via `bd create`)
- **Preserve**: Architecture decisions, component boundaries, existing task descriptions
- **Related docs**: `docs/plan.md`, `docs/user-stories.md`, `docs/project-structure.md`, `docs/tdd-standards.md`, `docs/coding-standards.md`
- **Special rules**: **Never duplicate Beads tasks** — run `bd list` first and cross-reference before creating any tasks. **Never re-create tasks that already exist** (even if their description differs from what this prompt would produce). Only create tasks for genuinely new work not covered by existing tasks.

## Required Reading Before Creating Tasks

Read ALL of these before creating any tasks or documentation:

| Document | What to Extract |
|----------|----------------|
| `docs/plan.md` | Features to build, technical requirements, constraints |
| `docs/user-stories.md` | Acceptance criteria, user flows, priority |
| `docs/project-structure.md` | File locations, module organization strategy, high-contention files, shared code rules |
| `docs/tdd-standards.md` | Test categories (unit/integration/e2e), which code gets which test type, mocking strategy, test file locations, reference patterns |
| `docs/coding-standards.md` | Naming conventions, code style, patterns to follow |
| `docs/tech-stack.md` | Libraries, frameworks, tooling |
| `docs/dev-setup.md` | Available dev commands, environment setup, Key Commands |
| `docs/git-workflow.md` | CI configuration, branch protection, worktree setup |
| `CLAUDE.md` | Workflow, priority definitions, commit format |

## What to Produce

### 1. Architecture Overview (`docs/implementation-plan.md`)

Create a concise document covering ONLY decisions specific to this implementation that aren't already in the standards docs:

- Technical architecture decisions and rationale
- Component/service boundaries and how they map to the module organization in project-structure.md
- Shared infrastructure that must exist before feature work begins (respect the shared code rules from project-structure.md — don't pre-build shared utils; only create shared infrastructure that is genuinely foundational like DB setup, auth middleware, etc.)
- Data flow between components
- Any open questions or risks

**Do NOT restate** testing strategy, coding conventions, or project structure — reference the existing docs instead:
```markdown
## References
- Testing approach: docs/tdd-standards.md
- Code conventions: docs/coding-standards.md
- File locations: docs/project-structure.md
```

### 2. Beads Task Graph (the actual plan)

Create every implementation task as a Beads task using `bd create "Title" -p <priority>`.

#### Task Descriptions Must Include:

For each task, include everything an AI agent needs to complete it in isolation:

- **Acceptance criteria** tied to specific user stories
- **Files to create or modify** with correct paths per `docs/project-structure.md` (e.g., `src/features/auth/services/login.ts`, not just "auth service")
- **Test requirements** specifying:
  - Which test category per `docs/tdd-standards.md` (unit, integration, or e2e)
  - Test file location per the project's test file convention
  - Which reference pattern from tdd-standards.md to follow
  - What to mock and what NOT to mock per the project's mocking strategy
- **Key interfaces or contracts** to conform to
- **Any gotchas or decisions** already made

#### Task Titles

Titles should be imperative, specific, and map cleanly to commit messages:
- Good: `feat(auth): implement POST /api/sessions with validation`
- Good: `feat(dashboard): add session list component with pagination`
- Bad: `Set up auth` (too vague)
- Bad: `Models and routes for sessions` (horizontal, not vertical)

These become the basis for commit messages in format `[BD-<id>] title`.

#### Task Sizing

- Each task should be completable in a single Claude Code session
- Prefer small, focused tasks over large ones — keeps context windows small
- Infrastructure/shared tasks come first as dependencies to unblock parallel work
- Follow the module organization strategy in `docs/project-structure.md` when grouping tasks (vertical slices if feature-based, etc.)

#### Dependency Graph — File Contention Awareness

When setting dependencies with `bd dep add <child> <parent>`, consider TWO types of dependencies:

1. **Logical dependencies** — Task B needs Task A's output (e.g., API endpoint needs DB schema)
2. **File contention dependencies** — Tasks that modify the same high-contention files must be sequenced

Review the high-contention files identified in `docs/project-structure.md` (route indexes, DB schemas, shared type definitions, app entry points, etc.). If two tasks both modify a high-contention file:
- Add a Beads dependency between them so they don't run in parallel
- Note in the task description which shared file is being modified and why

Tasks that only touch files within their own feature directory can safely run in parallel with no dependency.

#### Shared Code Rules

Follow the shared code strategy from `docs/project-structure.md`:
- Don't create "build shared utilities" tasks upfront
- Only create shared infrastructure tasks for genuinely foundational work (DB setup, auth middleware, app configuration, CI pipeline)
- Feature-specific helpers stay in the feature folder until 2+ features need them
- If a task creates shared code, its description must include tests for that shared code

## What NOT to Do

- Do NOT start implementing anything
- Do NOT create a flat ordered list in markdown — that's what `bd ready` is for
- Do NOT manually tag tasks as "parallel" or "sequential" — the Beads dependency graph handles this
- Do NOT restate testing strategy or coding conventions in implementation-plan.md — reference the existing docs
- Do NOT create tasks with vague file locations like "create the auth service" — use exact paths

## Process

- Use subagents to research implementation best practices for the project's specific tech stack in parallel
- Use AskUserQuestionTool for any questions or important decisions
- After creating all tasks, run `bd dep tree` on root tasks so I can review the dependency graph
- Run `bd ready` at the end to show me what the first wave of parallelizable work looks like
- Verify: no two tasks in the first `bd ready` wave modify the same high-contention file



________________________________
# Implementation Plan Review (Prompt)

Review the implementation plan by cross-referencing `docs/plan.md`, `docs/user-stories.md`, project standards, and all Beads tasks. Identify gaps, oversized tasks, missing coverage, and dependency issues. Then fix them.

## Required Reading

Read ALL of these before starting the review:

| Document | What to Check Against |
|----------|----------------------|
| `docs/plan.md` | Every feature and requirement has corresponding tasks |
| `docs/user-stories.md` | Every acceptance criterion maps to at least one task |
| `docs/implementation-plan.md` | Architecture decisions are reflected in task structure |
| `docs/project-structure.md` | File paths in tasks are correct, high-contention files have dependencies |
| `docs/tdd-standards.md` | Test requirements in tasks specify correct categories and patterns |
| `docs/coding-standards.md` | Tasks reference correct conventions |
| `docs/dev-setup.md` | Available dev commands, environment setup |
| `docs/design-system.md` (if exists) | Design tokens, component patterns for frontend tasks |
| `docs/git-workflow.md` | CI configuration, high-contention file awareness |
| `CLAUDE.md` | Workflow, priority definitions |

Then load ALL existing Beads tasks:
```bash
bd list
bd dep tree
```

---

## Phase 1: Coverage Audit

### 1.1 User Story → Task Mapping

For EVERY user story in `docs/user-stories.md`:

1. List each acceptance criterion
2. Identify which Beads task(s) cover it
3. Flag any acceptance criterion with no corresponding task

**Be thorough.** The most common gaps are:
- Error handling and edge cases (user story says "show error when X" but no task handles it)
- Validation rules mentioned in acceptance criteria but not in any task description
- Secondary flows (e.g., "user can also access via Y" buried in a story)
- Non-functional requirements (performance, accessibility, security mentioned in stories)

Produce a table:

| User Story | Acceptance Criterion | Covered By Task(s) | Status |
|------------|---------------------|---------------------|--------|
| US-1 | User can log in with email/password | BD-12 | ✓ Covered |
| US-1 | Show error for invalid credentials | — | ✗ MISSING |
| US-2 | Dashboard loads in under 2 seconds | — | ✗ MISSING |

### 1.2 Plan.md → Task Mapping

For every feature or requirement in `docs/plan.md` that isn't already captured by user stories:

- Technical requirements (API rate limits, data retention, etc.)
- Infrastructure requirements (deployment, monitoring, etc.)
- Integration requirements (third-party services, webhooks, etc.)

Flag anything with no corresponding task.

### 1.3 Orphan Task Check

List any Beads tasks that don't trace back to a user story or plan.md requirement. These are either:
- Legitimate infrastructure tasks (DB setup, CI pipeline) — verify they're necessary
- Scope creep — flag for removal

---

## Phase 2: Task Quality Audit

### 2.1 Task Sizing

For each task, assess whether it's completable in a single Claude Code session. Warning signs of oversized tasks:

- Description mentions 3+ files being created
- Description includes both backend and frontend work
- Description covers multiple user stories
- Description includes "and also" or "additionally" sections
- Test requirements span multiple test categories (unit AND integration AND e2e)

Flag oversized tasks with a recommended split.

### 2.2 Task Description Completeness

Each task description must include (per the implementation plan prompt):

- [ ] Acceptance criteria tied to specific user stories
- [ ] File paths per `docs/project-structure.md` (not vague locations)
- [ ] Test category (unit/integration/e2e) per `docs/tdd-standards.md`
- [ ] Test file location per the project's convention
- [ ] What to mock and what not to mock
- [ ] Key interfaces or contracts

Flag tasks missing any of these.

### 2.3 Task Title Quality

Titles should be imperative, specific, and map to commit messages (`[BD-<id>] title`):

- Flag vague titles: "Set up auth", "Handle errors", "Add tests"
- Flag horizontal titles: "Create all models", "Add routes for everything"
- Flag titles that don't indicate scope: "Update dashboard" (update what?)

---

## Phase 3: Dependency Audit

### 3.1 File Contention Check

For every pair of tasks that `bd ready` would surface simultaneously (no dependency between them):

1. Compare the files each task will create or modify
2. If two independent tasks modify the same file, flag it

Pay special attention to high-contention files from `docs/project-structure.md`:
- Route indexes / app entry points
- Database schema / migrations
- Shared type definitions
- Configuration files
- Package manifests (package.json, requirements.txt)

### 3.2 Missing Logical Dependencies

Check for tasks that depend on something another task produces but have no Beads dependency:

- Task uses a database table that another task creates
- Task imports a component/service that another task builds
- Task tests an endpoint that another task implements
- Task modifies a file that another task creates

### 3.3 Over-Constrained Dependencies

Check for unnecessary dependencies that limit parallelism:

- Task B depends on Task A, but they touch completely different files and features
- Long dependency chains where intermediate tasks could run in parallel
- Tasks that depend on a large "setup" task that could be split

### 3.4 Dependency Graph Health

```bash
bd dep tree
```

Check for:
- Circular dependencies (should be impossible but verify)
- Bottleneck tasks that block many downstream tasks (candidates for splitting)
- Orphan tasks with no dependencies that should have them
- Very deep chains (5+ levels) that could be parallelized more

---

## Phase 4: Standards Alignment

### 4.1 Project Structure Check

For every file path mentioned in a task description:
- Verify it follows the module organization strategy in `docs/project-structure.md`
- Verify test files are in the correct location per the project's convention
- Flag any paths that don't match the documented structure

### 4.2 Shared Code Check

- Flag any task that creates shared/common code without specifying tests for it
- Flag any task that pre-builds shared utilities before 2+ features need them (per shared code rules in project-structure.md)
- Verify infrastructure tasks are genuinely foundational, not premature abstractions

### 4.3 TDD Alignment

For each task's test requirements:
- Verify the test category matches what `docs/tdd-standards.md` prescribes for that type of code
- Verify the mocking strategy aligns with the project's mocking rules
- Flag tasks with no test requirements at all
- Flag tasks where test requirements are vague ("add tests" without specifying what kind)

---

## Phase 5: Present Findings and Fix

### 5.1 Summary Report

```
## Implementation Plan Review Summary

### Coverage
- User stories reviewed: X
- Acceptance criteria reviewed: X
- Criteria with task coverage: X (Y%)
- Criteria with NO coverage: X — GAPS FOUND

### Task Quality
- Total tasks: X
- Oversized (recommend split): X
- Incomplete descriptions: X
- Vague titles: X

### Dependencies
- File contention conflicts: X
- Missing logical dependencies: X
- Over-constrained dependencies: X
- Bottleneck tasks: X

### Standards Alignment
- Incorrect file paths: X
- Shared code violations: X
- TDD alignment issues: X
```

### 5.2 Proposed Changes

Organize changes by category. For each change, specify the exact action:

**Tasks to Add (coverage gaps):**
```
bd create "feat(auth): show validation error for invalid email format" -p 1
  → Covers: US-1 acceptance criterion "Show error for invalid credentials"
  → Depends on: BD-12 (login endpoint)
```

**Tasks to Split (oversized):**
```
BD-15 "feat(dashboard): build complete dashboard page"
  → Split into:
    1. "feat(dashboard): add session list component with pagination"
    2. "feat(dashboard): add session detail panel"
    3. "feat(dashboard): add dashboard filtering and search"
```

**Dependencies to Add (contention/logic):**
```
bd dep add BD-18 BD-14
  → Reason: Both modify src/features/shared/types.ts
```

**Dependencies to Remove (over-constrained):**
```
bd dep remove BD-22 BD-19
  → Reason: No shared files or logical dependency; can run in parallel
```

**Descriptions to Update (incomplete/incorrect):**
```
BD-14: Add test requirements — integration test for API endpoint per tdd-standards.md
BD-17: Fix file path — should be src/features/auth/services/login.ts not src/auth/login.ts
```

**Tasks to Remove (orphans/scope creep):**
```
BD-25: "Add dark mode support" — not in any user story or plan.md requirement
```

### 5.3 Get Approval

Present the summary and proposed changes. Wait for approval before executing.

---

## Phase 6: Execute Changes

After approval:

1. Create new tasks for coverage gaps
2. Split oversized tasks (create new tasks, update dependencies, close the oversized original)
3. Add/remove dependencies
4. Update task descriptions
5. Remove orphan tasks

After all changes:
```bash
bd dep tree        # Verify dependency graph looks correct
bd ready           # Show the updated first wave of parallel work
```

### Final Verification

- [ ] Every user story acceptance criterion maps to at least one task
- [ ] No two tasks in `bd ready` output modify the same high-contention file
- [ ] All task descriptions include file paths, test requirements, and acceptance criteria
- [ ] No oversized tasks remain (each completable in one session)
- [ ] No orphan tasks without traceability to plan.md or user-stories.md
- [ ] Dependency graph has no bottleneck tasks blocking 4+ downstream tasks

---

## Process Rules

1. **Be exhaustive in Phase 1** — every acceptance criterion must be checked, not just the obvious ones
2. **Propose, don't execute** — present findings and get approval before making changes
3. **Err toward splitting** — if you're unsure whether a task is too large, it probably is
4. **Don't add scope** — if something isn't in plan.md or user-stories.md, don't create a task for it
5. **Fix descriptions in place** — use `bd update` to fix task descriptions rather than recreating tasks (preserves IDs and existing dependencies)
6. After all changes are applied, add a tracking comment to `docs/implementation-plan.md` after any existing scaffold tracking comment: `<!-- scaffold:implementation-plan-review v1 YYYY-MM-DD -->` (use actual date)



# Implementation Plan Multi-Model Review (Prompt)

Run independent Codex and Gemini reviews of the implementation plan task graph to catch coverage gaps, description issues, dependency problems, sizing mismatches, and architecture inconsistencies. This is a quality gate that enforces agent-implementable tasks with full acceptance criteria coverage.

## Mode Detection

Before starting, check if `docs/reviews/implementation-plan/review-summary.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing review artifacts (`docs/reviews/implementation-plan/task-coverage.json`, `docs/reviews/implementation-plan/review-summary.md`). Check for a tracking comment on line 1 of `review-summary.md`: `<!-- scaffold:implementation-plan-mmr v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing artifacts against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing artifacts
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure
   - **PRESERVE** — Project-specific decisions and prior review findings
3. **Cross-doc consistency**: Read `docs/implementation-plan.md`, `docs/user-stories.md`, and `docs/plan.md` and verify updates won't contradict them.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   Wait for user approval before proceeding.
5. **Execute update**: Re-run the full review pipeline. Preserve prior findings that are still valid.
6. **Update tracking comment**: Add/update on line 1 of `review-summary.md`: `<!-- scaffold:implementation-plan-mmr v<ver> <date> -->`
7. **Post-update summary**: Report what changed since the last review.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/reviews/implementation-plan/review-summary.md`
- **Secondary output**: `docs/reviews/implementation-plan/task-coverage.json`, `docs/reviews/implementation-plan/codex-review.json`, `docs/reviews/implementation-plan/gemini-review.json`
- **Preserve**: Prior review findings still valid, BD-xxx task IDs, custom dependency decisions
- **Related docs**: `docs/plan.md`, `docs/user-stories.md`, `docs/implementation-plan.md`
- **Special rules**: **Never renumber or rename Beads task IDs** — dependencies and commit messages reference them.

---

## Goals
- **100% AC coverage** — every acceptance criterion in user stories maps to at least one task
- **Agent-implementable descriptions** — tasks are unambiguous enough for AI agents to implement without clarification
- **Dependency correctness** — no missing deps, no file contention between parallel tasks, no over-constraining
- **Single-session sizing** — every task is completable in one Claude Code session
- **Architecture coherence** — tasks are consistent with documented project structure and standards

## Hard Scope Boundary
- **No new features** — reviewers critique existing tasks, they don't invent new product capabilities
- **Preserve task IDs** — BD-xxx IDs are referenced by dependency graphs and commit messages
- **Single-writer rule** — only Claude modifies Beads tasks. Codex and Gemini only critique.

## Prerequisites

Before starting, verify:

1. **Required files exist**:
   - `docs/plan.md` — the PRD
   - `docs/user-stories.md` — user stories from Steps 14-15
   - `docs/implementation-plan.md` — implementation plan from Step 19
   - `docs/project-structure.md` — project structure
   - `docs/tdd-standards.md` — TDD standards
2. **Beads tasks exist**: `bd list` returns tasks
3. **At least one review CLI is available** (check with `command -v`):
   - `codex` — Codex CLI (install: `npm install -g @openai/codex`)
   - `gemini` — Gemini CLI (install: `npm install -g @google/gemini-cli`)
4. **CLI authentication**:
   - Codex: ChatGPT subscription login (`codex` uses subscription credits, not API billing)
   - Gemini: Google account login (`gemini` uses subscription quota, not API billing)

If neither CLI is available, tell the user and stop — this prompt requires at least one external reviewer.

## Outputs

All review artifacts go under `docs/reviews/implementation-plan/`:

| File | Description |
|------|-------------|
| `task-coverage.json` | Acceptance criterion → task mapping |
| `codex-review.json` | Raw Codex review findings (if available) |
| `gemini-review.json` | Raw Gemini review findings (if available) |
| `review-summary.md` | Reconciled findings, actions taken, final status |

Additionally updates: Beads tasks (descriptions, dependencies, splits) via `bd` commands.

---

## Step 0: Create Beads Task

```
bd create "review: implementation plan multi-model review" -p 0
bd update <id> --claim
```

## Step 1: Build Task Coverage Map

Read `docs/user-stories.md` and `bd list` output. For every acceptance criterion in every user story, identify which Beads task(s) cover it.

Create `docs/reviews/implementation-plan/task-coverage.json`:

```json
{
  "generated": "YYYY-MM-DD",
  "total_criteria": 47,
  "covered": 45,
  "uncovered": 2,
  "criteria": {
    "US-001:AC-1": {
      "story_id": "US-001",
      "criterion_text": "User can log in with email and password",
      "tasks": ["BD-scaffold-abc"],
      "status": "covered"
    },
    "US-001:AC-3": {
      "story_id": "US-001",
      "criterion_text": "Show error for invalid credentials",
      "tasks": [],
      "status": "uncovered"
    }
  }
}
```

If any criteria are uncovered at this point, note them but continue — the external reviews will independently verify coverage.

## Step 2: Export Task Data

Capture the current Beads state for the review script:

```bash
bd list > /tmp/bd-list-output.txt
bd dep tree > /tmp/bd-dep-tree-output.txt
```

The review script also captures this data automatically, but having it available helps with the reconciliation step.

## Step 3: Run External Reviews

Run `scripts/implementation-plan-mmr.sh` to execute Codex and Gemini reviews in parallel:

```bash
./scripts/implementation-plan-mmr.sh
```

The script:
- Bundles PRD + user stories + implementation plan + project structure + TDD standards + task coverage JSON + bd list output + bd dep tree output into a review package
- Runs Codex CLI with schema-enforced output → `codex-review.json`
- Runs Gemini CLI with prompt-engineered JSON → `gemini-review.json`
- Validates both outputs against the JSON schema
- Reports results

If the script fails for one tool, it continues with the other. If both fail, proceed to Step 4 with whatever partial results exist.

**Do NOT edit the review JSON files** — they are raw evidence from independent reviewers.

## Step 4: Reconcile Reviews & Apply Fixes

Read both review JSONs (whichever are available). For each finding:

### 4a. Triage findings

Create a reconciliation table:

| Finding | Source | Severity | Action |
|---------|--------|----------|--------|
| US-001:AC-3 uncovered | Both | high | Add task |
| BD-xxx vague description | Codex only | medium | Update description |
| BD-xxx/BD-yyy file contention | Gemini only | high | Add dependency |

Rules:
- **Both models agree** → high confidence, apply fix
- **One model only, severity critical/high** → apply fix
- **One model only, severity medium/low** → use judgment; present to user if uncertain
- **Contradictory findings** → present both to user, let them decide

### 4b. Apply fixes

For each accepted finding, apply the appropriate action:

**Dependencies added:**
```bash
bd dep add <child> <parent>   # File contention or logical dependency
```

**Dependencies removed:**
```bash
bd dep remove <child> <parent>   # Over-constrained
```

**Descriptions updated:**
```bash
bd update <id> --description "Updated description with file paths, test requirements, and acceptance criteria"
```

**Tasks split (oversized):**
```bash
# Create replacement tasks
bd create "first split task title" -p <priority>
bd create "second split task title" -p <priority>
# Transfer dependencies to new tasks
bd dep add <new-child> <new-parent>
# Close the oversized original
bd close <original-id>
```

**Tasks added (coverage gaps):**
```bash
bd create "task title covering the gap" -p <priority>
bd update <id> --claim
bd dep add <new-task> <dependency>
```

Use AskUserQuestionTool for any findings where the right action isn't clear.

## Step 5: Quality Gate — Verify Coverage

Update `docs/reviews/implementation-plan/task-coverage.json` with the post-fix state.

**The quality gate**: task-coverage.json must show zero uncovered acceptance criteria.

If any criteria remain uncovered after applying fixes:
1. List the uncovered criteria
2. Ask the user whether to add tasks for them or mark them as intentionally deferred
3. If deferred, add a `"status": "deferred"` with a `"reason"` field in task-coverage.json

## Step 6: Write Review Summary

Create `docs/reviews/implementation-plan/review-summary.md`:

```markdown
<!-- scaffold:implementation-plan-mmr v1.0 YYYY-MM-DD -->
# Implementation Plan Multi-Model Review Summary

## Review Metadata
- **Date**: YYYY-MM-DD
- **Reviewers**: Codex CLI, Gemini CLI (or whichever were available)
- **Tasks reviewed**: N
- **Acceptance criteria**: N
- **Pre-review coverage**: X/Y (Z%)
- **Post-review coverage**: Y/Y (100%)

## Findings Summary

| Category | Codex | Gemini | Agreed | Applied |
|----------|-------|--------|--------|---------|
| Coverage gaps | N | N | N | N |
| Description issues | N | N | N | N |
| Dependency issues | N | N | N | N |
| Sizing issues | N | N | N | N |
| Architecture issues | N | N | N | N |

## Actions Taken

### Tasks Added
- BD-xxx: [title] — covers US-xxx:AC-N

### Tasks Split
- BD-xxx → BD-yyy, BD-zzz — [reason]

### Dependencies Added
- bd dep add BD-xxx BD-yyy — [reason]

### Dependencies Removed
- bd dep remove BD-xxx BD-yyy — [reason]

### Descriptions Updated
- BD-xxx: [what changed and why]

### Findings Deferred
- [any findings not actioned, with rationale]

## Coverage Verification
- Total acceptance criteria: N
- Covered by tasks: N
- Uncovered: 0 (or list deferred items)
- Confidence: X%
```

## Step 7: Close Beads Task

```
bd close <id>
```

## Process
- Create a Beads task for this work before starting (Step 0)
- When complete and committed, close it (Step 7)
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- The single-writer rule is absolute: Codex and Gemini produce JSON critiques, only Claude modifies Beads tasks
- Present reconciliation decisions to the user when findings conflict or severity is ambiguous
- All review artifacts are committed to the repo for auditability


__________________________________
# Execution (Prompts)

These are the prompts you give to Claude Code agents to start working. The workflow, git rules, and PR process are all in CLAUDE.md — agent prompts should be minimal.

---

## Single Agent (one Claude Code session)

No worktree needed. Launch Claude Code from the main repo directory:

```
Follow the workflow in CLAUDE.md. Run `bd ready`, pick the lowest-ID unblocked task, and implement it. Keep working until `bd ready` shows no available tasks.
```

---

## Multiple Parallel Agents

Each agent needs a **permanent worktree** — a dedicated workspace so agents don't conflict with each other or the main repo.

### One-Time Setup (run from main repo)

```bash
./scripts/setup-agent-worktree.sh Agent-1
./scripts/setup-agent-worktree.sh Agent-2
./scripts/setup-agent-worktree.sh Agent-3

# Creates:
# ../project-agent-1/  (with agent-1-workspace branch)
# ../project-agent-2/  (with agent-2-workspace branch)
# ../project-agent-3/  (with agent-3-workspace branch)
```

Each worktree gets its own workspace branch because git doesn't allow the same branch checked out in multiple worktrees. Agents create feature branches from `origin/main` inside their worktree.

### How Many Agents

Match agent count to available parallel work:
- Run `bd ready` to see how many unblocked tasks exist
- Only spin up as many agents as there are independent, non-overlapping tasks
- If tasks touch the same files, sequence them via Beads dependencies instead

### Launching Agents

Open separate terminals:

```bash
# Terminal 1
cd ../project-agent-1 && BD_ACTOR="Agent-1" claude

# Terminal 2
cd ../project-agent-2 && BD_ACTOR="Agent-2" claude

# Terminal 3
cd ../project-agent-3 && BD_ACTOR="Agent-3" claude
```

### Agent Prompt — multi-agent-start (same for all, just change the name)

```
You are Agent-1. Verify your setup:
- `echo $BD_ACTOR` should show "Agent-1"
- `git rev-parse --git-dir` should contain "/worktrees/" (confirms you're in a worktree)

Follow the workflow in CLAUDE.md. Key differences for worktree agents:
- Never run `git checkout main` — it will fail (main is checked out in the main repo)
- Always branch from remote: `git fetch origin && git checkout -b bd-<id>/<desc> origin/main`
- Between tasks: `git fetch origin --prune && git clean -fd` then run the install command from CLAUDE.md Key Commands

Run `bd ready`, pick the lowest-ID unblocked task, and implement it. Keep working until `bd ready` shows no available tasks.
```

---

## Resuming After a Break

### Single Agent

```
Follow the workflow in CLAUDE.md.

Check your current state:
- `git branch --show-current` — if on a feature branch, you may have in-progress work
- `bd list` — check if any tasks are in_progress
- `gh pr list --author="@me"` — check for open PRs that may have merged while you were away

If a PR shows as merged, close the corresponding task (`bd close <id> && bd sync`) and clean up before starting new work.
If there's in-progress work, finish it. Otherwise, start fresh with `bd ready`.
Keep working until `bd ready` shows no available tasks.
```

### Worktree Agent Resume — multi-agent-resume

```
You are Agent-N. Verify your setup:
- `echo $BD_ACTOR` should show your agent name
- `git rev-parse --git-dir` should contain "/worktrees/"

Check your current state:
- `git branch --show-current` — if on a feature branch (not <name>-workspace), you may have in-progress work
- `bd list --actor Agent-N` — check if any tasks are in_progress
- `gh pr list --author="@me"` — check for open PRs that may have merged while you were away

If a PR shows as merged, close the corresponding task (`bd close <id> && bd sync`) and clean up.
If there's in-progress work, finish it. Otherwise:
- `git fetch origin --prune && git clean -fd` then run the install command from CLAUDE.md Key Commands
- `bd ready` to find the next task

Keep working until `bd ready` shows no available tasks.
```

---

## Cleanup

### Batch-Clean Merged Feature Branches (run periodically)

Worktree agents can't delete feature branches inline (they can't checkout main). Merged branches accumulate. Clean them periodically from any agent worktree:

```bash
git fetch origin --prune
git branch --merged origin/main | grep "bd-" | xargs -r git branch -d
```

### Worktree Management

```bash
# List all worktrees
git worktree list

# Agent worktrees are permanent — don't delete them between tasks
# Only remove if permanently reducing the number of parallel agents:
git worktree remove ../project-agent-3

# Clean up stale references
git worktree prune
```


_______________________________
# New Enhancement (Prompt)

I want to add an enhancement to this project. Help me evaluate it, document it properly, and create tasks for implementation.

## Here's the enhancement:

[Describe your enhancement idea here]

---

## Phase 1: Discovery & Impact Analysis

### Review Existing Context
Before asking questions, thoroughly review:
- `docs/plan.md` — Current PRD: vision, personas, features, data model
- `docs/user-stories.md` — Existing stories and epics (note the last story ID used)
- `docs/tech-stack.md` — Technical constraints and patterns
- `docs/coding-standards.md` — Code conventions, styling rules, commit format
- `docs/project-structure.md` — Where new files should go
- `docs/tdd-standards.md` — Test categories and patterns for task descriptions
- `docs/design-system.md` — Design tokens, component patterns, styling approach (if frontend changes)
- `CLAUDE.md` — Project conventions, Key Commands, workflow
- Relevant source code if needed to understand current implementation

### Understand the Enhancement
Use AskUserQuestionTool to batch these questions:
- What problem does this solve? Who benefits? (Which persona?)
- What's the user flow? Walk me through it step by step.
- What triggers this feature? (User action, system event, time-based?)
- What does success look like? How will we measure it?

### Challenge and Refine
Push back where appropriate:
- Is this the simplest solution? Propose alternatives if you see a better way.
- Should the scope be smaller for a v1 of this enhancement?
- Are there edge cases or error states not mentioned?
- Does this conflict with or duplicate existing functionality?
- What are the riskiest assumptions?

### Innovation Pass

Before finalizing the enhancement scope, research and consider:

**Competitive Analysis** (use subagents for research):
- How do similar apps handle this feature?
- What do they do well? Where do they fall short?
- Is there a standard UX pattern users will expect?

**Enhancement Opportunities**:
- What would make this feature "delightful" vs just "functional"?
- Are there adjacent features that would multiply the value? (e.g., if adding notifications, should we add notification preferences too?)
- What would a user complain about if we ship the minimal version?

**AI-Native Possibilities**:
- Could AI make this smarter? (smart defaults, predictions, natural language)
- Is there manual work we could automate?

**Present innovation ideas with**:
- **What**: The enhancement to the enhancement
- **Why**: User benefit
- **Cost**: Trivial / Moderate / Significant effort
- **Recommendation**: Include in this enhancement, or backlog for later

Use AskUserQuestionTool to present innovation ideas for approval BEFORE proceeding.

### Impact Analysis
Report what this enhancement affects:

1. **Fit Check**
   - Does this align with the product vision in the PRD?
   - Which persona(s) does this serve?
   - Does it conflict with any existing features or design decisions?

2. **Scope Assessment**
   - Is this a v1 feature or should it be deferred?
   - Complexity estimate: Small (1-2 tasks), Medium (3-5 tasks), Large (6+ tasks)
   - Dependencies on existing features or new infrastructure?

3. **Technical Impact**
   - **Data Model**: New entities? Changes to existing ones? Migrations needed?
   - **UI Changes**: New screens? Modifications to existing ones?
   - **API Changes**: New endpoints? Changes to existing ones?
   - **External Integrations**: New third-party services?

4. **Recommendation**
   - Proceed as described
   - Proceed with modifications (explain)
   - Defer to a future version (explain why)
   - Reconsider (if it conflicts with product vision)

**Wait for user approval before proceeding to Phase 2.**

---

## Phase 2: Documentation Updates

After approval, update the relevant documentation.

### Update `docs/plan.md`

Add the enhancement to the PRD (do NOT remove or significantly alter existing content):

1. **Feature Requirements section** — Add the new feature with:
   - Clear description of what it does
   - Why it exists (tied to user need/persona)
   - Priority: Must-have / Should-have / Future
   - Business rules or logic that aren't obvious
   - Concrete examples where behavior might be misinterpreted
   - Mark with: `[Enhancement added YYYY-MM-DD]` for traceability

2. **Data Model Overview** (if applicable):
   - New entities with their key attributes
   - Changes to existing entities
   - New relationships between entities

3. **Core User Flows** (if applicable):
   - New flow, or modifications to existing flows
   - Include happy path AND error/edge cases
   - Be specific: "when X happens, the user sees Y" not "handle errors gracefully"

4. **External Integrations** (if applicable):
   - New third-party services or APIs
   - What data flows in/out

5. **Non-Functional Requirements** (if applicable):
   - Performance implications
   - Security considerations
   - Accessibility needs

### Update `docs/user-stories.md`

Add new user stories following the existing document structure and the User Stories prompt format:

1. **Determine Epic Placement**
   - Does this fit under an existing epic?
   - Or does it need a new epic? (Only if it's a significant new area — match existing naming patterns)

2. **Create User Stories** — Each story MUST include ALL of these fields:

   - **ID**: Continue the existing numbering sequence (check the last ID in the file)
   - **Title**: Short, scannable summary
   - **Story**: "As a [persona], I want [action], so that [outcome]"
   - **Acceptance Criteria**: Written as testable Given/When/Then scenarios
     - These become TDD test cases — be explicit
     - Cover happy path AND edge cases
     - Include error states
   - **Scope Boundary**: What this story does NOT include (prevents scope creep)
   - **Data/State Requirements**: What data models, state, or dependencies are implied
   - **UI/UX Notes**: What the user sees, key interactions, error states, loading states
   - **Priority**: MoSCoW (Must/Should/Could/Won't)
   - **Enhancement Reference**: `[Enhancement added YYYY-MM-DD]`

3. **Story Quality Checks** — Before finalizing, verify:
   - Stories follow INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
   - No story is so large it couldn't be implemented in 1-3 focused Claude Code sessions
   - Acceptance criteria are specific enough that pass/fail is unambiguous
   - Edge cases and error states are covered explicitly

### Cross-Reference Check

After updating both documents:
- Verify every new PRD feature maps to at least one user story
- Verify terminology is consistent with existing documentation
- Verify no contradictions were introduced with existing features
- Check that personas referenced exist in the PRD

---

## Phase 3: Task Creation

Create Beads tasks for implementation.

### Task Creation Guidelines

For each user story (or logical grouping of small stories):

```bash
bd create "US-XXX: <imperative title>" -p <priority>
# Priority: 0=blocking release, 1=must-have, 2=should-have, 3=nice-to-have
```

### Task Titles and Descriptions

- **Title format**: `US-XXX: <imperative action>` (e.g., "US-048: Add streak notification settings")
- **Description should include**:
  - Reference to user story: `Implements US-XXX`
  - Key acceptance criteria summary
  - Technical notes or gotchas from analysis
  - Migration notes if data model changes

### Task Sizing

- **One task per story** for small/medium stories
- **Multiple tasks per story** for large stories — break down by:
  - Data model/migrations first
  - Backend API second
  - Frontend/UI third
  - Edge cases and polish last

### Dependency Management

```bash
# Set up dependencies (child is blocked by parent)
bd dep add <child-task-id> <parent-task-id>

# Common dependency patterns:
# - Migrations before features that use new models
# - Backend before frontend
# - Core functionality before edge cases
# - Shared components before features that use them

# Verify the dependency graph
bd dep tree <task-id>
```

### Migration Considerations

If the enhancement requires data model changes:
- Create a dedicated migration task as the first dependency
- Note if existing data needs transformation
- Consider: can this be deployed incrementally or does it require coordination?
- Document rollback strategy if the migration is risky

---

## Phase 4: Summary & Approval

After completing all updates, provide a clear summary:

### 1. Enhancement Summary
One paragraph: what this adds and why it matters.

### 2. Documentation Changes
- **docs/plan.md**: What sections were added/modified
- **docs/user-stories.md**: List new story IDs with titles

### 3. Tasks Created
```
| Task ID | Title | Priority | Depends On |
|---------|-------|----------|------------|
| xxx-abc | US-048: Add notification settings | 1 | - |
| xxx-def | US-049: Send streak reminders | 1 | xxx-abc |
```

### 4. Implementation Order
Recommended sequence based on dependencies:
1. First: [task(s)]
2. Then: [task(s)] (can be parallelized)
3. Finally: [task(s)]

### 5. Ready to Implement
```bash
bd ready  # Show what's available to work on now
```

### 6. Open Questions (if any)
- Decisions deferred to implementation time
- Areas that may need refinement during development
- Risks to monitor

### 7. Consider Follow-Up Reviews

Depending on the enhancement scope, you may want to re-run these prompts:
- **Implementation Plan Review**: If you created 5+ tasks, run it to verify sizing, dependencies, and coverage
- **Platform Parity Review**: If the enhancement has platform-specific behavior (web vs. mobile differences), re-run to check platform coverage
- **Workflow Audit**: Only if the enhancement changed project infrastructure or conventions (rare)

---

## Process Rules

- **Don't skip discovery**: Even if the enhancement seems simple, do the impact analysis
- **Use subagents for research**: Competitive analysis and UX best practices can run in parallel with other work
- **Batch questions**: Use AskUserQuestionTool to group related questions — don't ask one at a time
- **Present innovations before documenting**: Get approval on scope expansions before writing them up
- **Challenge assumptions**: If something seems overengineered or could be simpler, say so
- **Maintain consistency**: Match terminology, format, and style of existing docs exactly
- **Add traceability**: Mark enhancements with dates so we know when features were added
- **Right-size the scope**: Push back if the enhancement is too large — suggest phasing
- **Check for conflicts**: Review `bd list` for in-progress work that might be affected

---

## When to Use This Prompt

- Adding a new feature to an existing product
- Expanding an existing feature with new capabilities  
- Adding a new user flow or journey
- Any change that requires updating the PRD or user stories

## When NOT to Use This Prompt

- **Bug fixes**: Use the Quick Task prompt instead — it creates focused, well-defined Beads tasks
- **Refactoring**: Use the Quick Task prompt instead — no doc updates needed, just a task with clear acceptance criteria
- **Performance improvements**: Use the Quick Task prompt instead — targeted fixes don't need full discovery
- **Initial product creation**: Use the PRD prompt instead
- **Major pivots**: If this changes the core product direction, revisit the full PRD first
- **Exploratory ideas**: If you're not sure you want this, discuss before documenting

## Optional: Skip Innovation Pass

If you just want to document a well-defined enhancement without competitive research and innovation brainstorming, add this to your request:

> Skip the innovation pass — just document and create tasks for what I described.

This is appropriate when:
- The enhancement is already well-researched
- You're porting a feature from a competitor you've already analyzed
- Time pressure requires moving fast
- The enhancement is truly trivial (but consider: does it even need this prompt?)

---

## Quality Standards

### From the PRD prompt — apply these to enhancement documentation:
- Every feature must be described thoroughly enough that an AI agent can build it without asking follow-up questions
- Avoid ambiguity: specify what errors can occur and what the user sees for each
- Include concrete examples where behavior might be misinterpreted
- Use consistent terminology throughout
- Non-functional requirements are specific and measurable (not "fast" — how fast?)

### From the User Stories prompt — apply these to new stories:
- Stories follow INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Acceptance criteria are specific enough that pass/fail is unambiguous
- No story is so large it couldn't be implemented in 1-3 focused sessions
- Every story has scope boundaries to prevent creep during implementation

### From the Gap Analysis prompts — verify before finishing:
- Every new PRD feature maps to at least one user story
- Happy paths AND error/edge cases are covered in acceptance criteria
- No vague language that could be misinterpreted ("intuitive," "user-friendly," "seamless," "handles gracefully")
- Dependencies between stories are identified (they become Beads dependencies)
- Priority assignments make sense relative to existing features


# Quick Task (Prompt)

Create a focused Beads task for a small, well-defined piece of work — a bug fix, refactor, performance improvement, or minor refinement. This prompt produces a single, implementation-ready task with clear acceptance criteria and a TDD test plan, without the full discovery process of the Enhancement prompt.

## The Request

[Describe the task here]

---

## Phase 0: Complexity Gate

Before proceeding, evaluate whether this task is actually small enough for Quick Task. If **any** of these are true, **stop and redirect**:

1. The change requires updating `docs/plan.md` or `docs/user-stories.md`
2. The change introduces a new user-facing feature (not a fix or improvement to an existing one)
3. The change affects 3+ unrelated modules or features
4. The change requires new data model entities or schema migrations
5. The change requires competitive analysis or UX research
6. You estimate 4+ Beads tasks will be needed

**If any criteria match**, tell the user:

> This looks like an enhancement, not a quick task. Redirecting to the Enhancement prompt which handles PRD updates, user stories, and multi-task planning.
>
> Run: `/scaffold:new-enhancement <description>`

**Hard stop** — do not continue with the Quick Task flow.

---

## Phase 1: Understand & Contextualize

### Review Project Context
Before asking questions, review:
- `CLAUDE.md` — Project conventions, Key Commands, workflow
- `docs/coding-standards.md` — Code conventions, naming, patterns
- `docs/tdd-standards.md` — Test categories, mocking strategy, test file locations
- `docs/project-structure.md` — Where files live, module organization
- `tasks/lessons.md` — Previous lessons learned (extract any relevant to this task)
- Relevant source code — Read the files that will be modified

### Check for Duplicates
Run `bd list` and check for existing tasks that overlap with this request. If a matching or overlapping task exists:
- Tell the user which task(s) already cover this work
- Ask whether to proceed (create a new task) or use the existing one
- If proceeding, note the relationship in the new task's description

### Extract Relevant Lessons
Review `tasks/lessons.md` for anti-patterns, gotchas, or conventions related to:
- The area of code being modified
- The type of change (fix, refactor, perf, etc.)
- Similar past mistakes to avoid

### Clarify Ambiguities
If anything is unclear about the request, use AskUserQuestionTool to batch all questions in a single call. Common clarifications:
- What is the expected behavior vs. current behavior? (for bugs)
- What metric or outcome defines success? (for performance)
- What should NOT change? (for refactors)

---

## Phase 2: Define the Task

### Categorize
Determine the task type using conventional commit prefixes:
- `fix` — Bug fix (something is broken)
- `feat` — Small feature addition within an existing feature area
- `perf` — Performance improvement
- `a11y` — Accessibility fix
- `refactor` — Code restructuring with no behavior change
- `chore` — Tooling, dependencies, config
- `test` — Adding or fixing tests only
- `style` — Code style, formatting (no logic change)

### Priority
Assign priority using Beads conventions:
- **P0** — Blocking release or breaking production
- **P1** — Must-have for current milestone
- **P2** — Should-have (default for most quick tasks)
- **P3** — Nice-to-have, backlog

### Acceptance Criteria
Write 2–5 testable acceptance criteria in Given/When/Then format:

```
Given <precondition>
When <action>
Then <expected result>
```

Each criterion must be unambiguous — pass/fail should be obvious. Cover:
- The primary fix or change (happy path)
- At least one edge case or error state
- Any regression guard (behavior that must NOT change)

### Files to Modify
List exact file paths from `docs/project-structure.md`:
```
Files:
- src/features/auth/services/session.ts (modify)
- src/features/auth/services/__tests__/session.test.ts (modify)
```

### Test Plan
Reference `docs/tdd-standards.md` for the project's test conventions:
- **Test category**: unit / integration / e2e (per tdd-standards.md rules for this code area)
- **Test cases**: Map each acceptance criterion to at least one test case
- **Mocking**: What to mock and what NOT to mock (per the project's mocking strategy)
- **Test file location**: Per the project's test file convention

### Implementation Notes
- Patterns to follow (reference specific conventions from coding-standards.md)
- Known gotchas or pitfalls (from lessons.md or code review)
- What is explicitly out of scope

---

## Phase 3: Create the Beads Task

Create the task:

```bash
bd create "type(scope): description" -p <priority>
# Example: bd create "fix(auth): prevent duplicate session creation on rapid re-login" -p 2
```

Then set the task description with the full context from Phase 2. Include all of:

```
## Acceptance Criteria

- Given <precondition>, when <action>, then <expected result>
- ...

## Files to Modify

- path/to/file.ts (modify — reason)
- path/to/test.ts (modify — add test cases)

## Test Plan

**Category**: unit
**Cases**:
1. Test description → validates AC #1
2. Test description → validates AC #2
**Mocking**: Mock X, do not mock Y
**Location**: path/to/__tests__/file.test.ts

## Implementation Notes

- Follow pattern from [reference]
- Watch out for [gotcha from lessons.md]
- Out of scope: [what NOT to do]
```

---

## Phase 4: Output Summary

Present the task summary:

```
┌─────────────────────────────────────────────────┐
│ Quick Task Created                              │
├──────────┬──────────────────────────────────────┤
│ ID       │ <task-id>                            │
│ Title    │ type(scope): description             │
│ Priority │ P<n>                                 │
│ Status   │ open                                 │
├──────────┴──────────────────────────────────────┤
│ Acceptance Criteria                             │
│ • Given... When... Then...                      │
│ • Given... When... Then...                      │
├─────────────────────────────────────────────────┤
│ Files                                           │
│ • path/to/file.ts                               │
│ • path/to/test.ts                               │
├─────────────────────────────────────────────────┤
│ Test Plan                                       │
│ • Category: unit                                │
│ • Cases: N test cases                           │
├─────────────────────────────────────────────────┤
│ Implementation Notes                            │
│ • Key note 1                                    │
│ • Key note 2                                    │
└─────────────────────────────────────────────────┘
```

Then tell the user:

> **Ready to implement.** Start with:
> - `/scaffold:single-agent-start` or `/scaffold:single-agent-resume` — for single-agent execution
> - `/scaffold:multi-agent-start <agent-name>` or `/scaffold:multi-agent-resume <agent-name>` — for worktree agents

---

## Process Rules

1. **Respect the complexity gate** — If it's bigger than a quick task, redirect immediately. Don't try to squeeze a feature into the quick task format.
2. **One task only** — Quick Task creates exactly one Beads task. If you need multiple, use the Enhancement prompt.
3. **Check for duplicates first** — Run `bd list` before creating. Don't create tasks that already exist.
4. **Lessons.md is required reading** — Always check `tasks/lessons.md` for relevant anti-patterns before defining the task.
5. **Acceptance criteria drive tests** — Every criterion must map to at least one test case. If you can't test it, rewrite the criterion.
6. **Conventional commit titles** — Always use `type(scope): description` format. This feeds directly into commit messages.

---

## When to Use This Prompt

- Bug fixes — something is broken and needs fixing
- Refactoring — restructuring code without changing behavior
- Performance improvements — targeted optimizations
- Accessibility fixes — a11y improvements to existing features
- Test gaps — adding missing test coverage
- Chores — dependency updates, config changes, tooling fixes
- Small refinements — polish within an existing feature

## When NOT to Use This Prompt

- **New features**: Use `/scaffold:new-enhancement` — new features need PRD updates and user stories
- **Multi-task work**: Use `/scaffold:new-enhancement` — if you need 4+ tasks, it's an enhancement
- **Initial project setup**: Use the pipeline from `/scaffold:create-prd` forward
- **Major refactors**: If the refactor touches 3+ unrelated modules, use `/scaffold:new-enhancement` for proper impact analysis

---

## Quality Standards

### From `docs/tdd-standards.md`:
- Every acceptance criterion maps to at least one test case
- Test category (unit/integration/e2e) follows the project's rules for this code area
- Mocking strategy matches the project's conventions — don't over-mock or under-mock

### From `docs/coding-standards.md`:
- File paths match `docs/project-structure.md` conventions
- Naming follows project patterns
- Implementation notes reference specific standards, not generic advice

---

## Example

Here's what the output looks like for a typical quick task:

**Request**: "The save button shows a success toast even when the API returns a 409 conflict"

```
┌─────────────────────────────────────────────────┐
│ Quick Task Created                              │
├──────────┬──────────────────────────────────────┤
│ ID       │ abc-123                              │
│ Title    │ fix(editor): show error toast on     │
│          │ 409 conflict during save             │
│ Priority │ P1                                   │
│ Status   │ open                                 │
├──────────┴──────────────────────────────────────┤
│ Acceptance Criteria                             │
│ 1. Given the user saves a document,             │
│    when the API returns 409 Conflict,           │
│    then an error toast "Save conflict —         │
│    someone else edited this document"           │
│    is shown instead of the success toast        │
│ 2. Given the user saves a document,             │
│    when the API returns 200 OK,                 │
│    then the success toast still appears          │
│    (regression guard)                           │
│ 3. Given the user sees a 409 error toast,       │
│    when they click "Refresh",                   │
│    then the latest version is fetched           │
├─────────────────────────────────────────────────┤
│ Files                                           │
│ • src/features/editor/services/save.ts          │
│ • src/features/editor/services/__tests__/       │
│   save.test.ts                                  │
├─────────────────────────────────────────────────┤
│ Test Plan                                       │
│ • Category: unit                                │
│ • Cases: 3 (one per AC)                         │
│ • Mock: HTTP client. Don't mock toast service.  │
├─────────────────────────────────────────────────┤
│ Implementation Notes                            │
│ • save.ts catches errors but doesn't check      │
│   status codes — add 409 handling in catch      │
│ • Follow error handling pattern from            │
│   src/features/auth/services/login.ts           │
│ • Out of scope: auto-merge or diff view         │
└─────────────────────────────────────────────────┘
```

---

# Release (Prompt)

Create a versioned release with changelog and GitHub release. Analyzes conventional commits to suggest version bumps, generates changelogs from commit history and Beads tasks, runs quality gates, and publishes a GitHub release. Supports dry-run mode and rollback.

## The Request

$ARGUMENTS

---

## Phase 0: Project Detection

Gather project context before proceeding. Check each item and record findings:

### 0.1 Git State

1. Confirm the working tree is clean (`git status --porcelain`). If there are uncommitted changes, **stop** and tell the user: "Working tree has uncommitted changes. Commit or stash them before releasing."
2. Record the current branch name (`git branch --show-current`).
3. Check if `gh` CLI is available (`which gh`). If not available, warn: "GitHub CLI (`gh`) not found. Will create tag only — no GitHub release. Install with `brew install gh` for full functionality."
4. Fetch tags: `git fetch --tags`.

### 0.2 Version File Detection

Scan the project root for version files. For each found file, record the current version:

| File | How to Read Version |
|------|-------------------|
| `package.json` | `.version` field |
| `pyproject.toml` | `[project].version` or `[tool.poetry].version` |
| `Cargo.toml` | `[package].version` |
| `.claude-plugin/plugin.json` | `.version` field |
| `pubspec.yaml` | `version:` field |
| `setup.cfg` | `[metadata].version` |
| `version.txt` | Entire file contents (trimmed) |

If **no** version files are found, note this — a tag-only release will be created.

### 0.3 Project Context

- Check for `.beads/` directory → enables Beads integration in release notes.
- Check for existing `CHANGELOG.md`.
- List existing `v*` tags: `git tag -l 'v*' --sort=-v:refname | head -5`.

### 0.4 Mode Selection

Parse `$ARGUMENTS` to determine the mode:

| Argument | Mode |
|----------|------|
| _(empty)_ | **Standard** — auto-suggest bump, confirm, execute |
| `major`, `minor`, or `patch` | **Explicit** — use specified bump, skip suggestion |
| `--dry-run` | **Dry Run** — all analysis, zero mutations |
| `rollback` | **Rollback** — jump directly to the Rollback section |

If `--dry-run` is combined with a bump type (e.g., `minor --dry-run`), use both: explicit bump + dry-run mode.

If the mode is **Rollback**, skip to the **Rollback** section below.

### 0.5 First-Release Detection

If **no** `v*` tags exist:

1. Tell the user: "No previous releases found. This will be your first release."
2. Ask: "What should the initial version be?" Suggest `0.1.0` (pre-release) or `1.0.0` (stable).
3. Record the chosen version. Skip Phase 1 (version analysis) — go directly to Phase 2.

---

## Phase 1: Version Analysis

**Skip this phase if:** First-release mode (Phase 0.5) or Explicit mode.

### 1.1 Collect Commits

Get commits since the last tag:

```
git log <last-tag>..HEAD --oneline --no-merges
```

### 1.2 Parse Conventional Commits

Categorize each commit:

| Pattern | Bump |
|---------|------|
| `feat:` or `feat(scope):` | minor |
| `fix:` or `fix(scope):` | patch |
| `BREAKING CHANGE:` in body or `!:` suffix | major |
| `perf:`, `refactor:`, `docs:`, `chore:`, `style:`, `test:`, `build:`, `ci:` | patch (non-feature change) |

Apply the **highest-wins** rule: if any commit triggers major, the suggestion is major; otherwise if any triggers minor, the suggestion is minor; otherwise patch.

### 1.3 Present Analysis

Show the user:

```
Commits since <last-tag>: <count>
  feat:  <count> commits
  fix:   <count> commits
  other: <count> commits
  BREAKING: <yes/no>

Suggested bump: <major|minor|patch>
  <current-version> → <new-version>
```

Ask: "Confirm this bump, or override? (major / minor / patch / confirm)"

If **no conventional commits** were found, fall back: "No conventional commits found. What type of bump? (major / minor / patch)"

Record the confirmed version.

---

## Phase 2: Pre-Release Validation

### 2.1 Detect Quality Gates

Look for quality gate commands in this order (use the first match):

1. `Makefile` with `check` target → `make check`
2. `Makefile` with `test` target → `make test`
3. `package.json` with `test` script → `npm test`
4. `Cargo.toml` exists → `cargo test`
5. `pyproject.toml` or `setup.cfg` → `pytest`
6. None found → warn and skip

### 2.2 Run Quality Gates

**In dry-run mode:** Show which command would run but do not execute. Skip to Phase 3.

Run the detected quality gate command. Report the result.

- **If it passes:** "Quality gates passed. Proceeding."
- **If it fails:** "Quality gates failed. Fix the issues and re-run `/scaffold:release`. To force release despite failures, re-run with the `--force` flag." **Stop here** unless `--force` was passed.

---

## Phase 3: Changelog & Release Notes

### 3.1 Group Commits

Group commits since the last tag (or all commits for first release) by type:

```markdown
## [vX.Y.Z] - YYYY-MM-DD

### Added
- feat: description (commit-hash)

### Fixed
- fix: description (commit-hash)

### Changed
- refactor: description (commit-hash)
- perf: description (commit-hash)

### Other
- chore: description (commit-hash)
```

Omit empty sections. Use the commit's first line (without the type prefix) as the description.

### 3.2 Beads Integration (conditional)

If `.beads/` exists:

1. Run `bd list --status closed` (or parse `.beads/issues.jsonl` for closed issues).
2. Cross-reference closed tasks with the commit range (match task IDs like `BD-xxx` or `scaffold-xxx` in commit messages).
3. If matches found, append a section:

```markdown
### Completed Tasks
- [BD-xxx] Task title
- [BD-yyy] Task title
```

If `.beads/` does not exist or no tasks match, silently skip this section.

### 3.3 Write Changelog

**In dry-run mode:** Display the changelog preview but do not write to disk. Skip to Phase 6.

- If `CHANGELOG.md` exists: prepend the new entry after the `# Changelog` heading (or after any header block).
- If `CHANGELOG.md` does not exist: create it with:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [vX.Y.Z] - YYYY-MM-DD
...
```

### 3.4 Save Release Notes

Store the generated changelog entry (without the file header) for use as the GitHub release body in Phase 5.

---

## Phase 4: Version Bump & Commit

**In dry-run mode:** Show which files would change and the commit message. Skip to Phase 6.

### 4.1 Update Version Files

For each version file detected in Phase 0.2, update the version to the new value.

### 4.2 Sync Lock Files

If applicable:
- `package-lock.json` exists → run `npm install --package-lock-only`
- `Cargo.lock` exists → run `cargo update -w`

### 4.3 Commit

Stage all changed files and commit:

```
git add <changed-files>
git commit -m "chore(release): vX.Y.Z"
```

If a Beads task is active (e.g., the user created one for the release), include the task ID: `[BD-xxx] chore(release): vX.Y.Z`.

---

## Phase 5: Tag & Publish

**In dry-run mode:** Show what would happen. Skip to Phase 6.

### 5.1 Determine Flow

Check the current branch:

- **`main` or `master`**: Direct flow (tag → push → release).
- **Any other branch**: PR flow (push → create PR → instructions).

### 5.2 Direct Flow (main/master)

1. Create annotated tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
2. Push commit and tag: `git push origin HEAD --follow-tags`
3. If push fails (e.g., branch protection), fall back to PR flow (5.3).
4. If `gh` is available: create GitHub release:
   ```
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "<release-notes-from-3.4>"
   ```

### 5.3 PR Flow (feature branch)

1. Push branch: `git push -u origin HEAD`
2. If `gh` is available: create PR:
   ```
   gh pr create --title "chore(release): vX.Y.Z" --body "<release-notes-from-3.4>"
   ```
3. Tell the user: "Release PR created. After merging to main, run these commands to create the tag and GitHub release:"
   ```
   git checkout main && git pull
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md
   ```

---

## Phase 6: Post-Release Summary

Show the final summary:

```
Release vX.Y.Z complete!

  Version files updated: <list>
  Changelog: CHANGELOG.md updated
  Tag: vX.Y.Z created
  GitHub Release: <URL> (or "PR created: <URL>")

  To undo this release: /scaffold:release rollback
```

In dry-run mode:

```
Dry-run complete — no changes were made.

  Would bump: <current> → <new>
  Would update: <version-files>
  Would create: CHANGELOG.md entry
  Would tag: vX.Y.Z
  Would create: GitHub release

Run /scaffold:release to execute.
```

---

## Rollback

Undo the most recent release. This is a **destructive operation** with safety guards.

### R.1 Identify Latest Release

1. Find the most recent tag: `git tag -l 'v*' --sort=-v:refname | head -1`
2. If no tags exist: "No releases found. Nothing to roll back." **Stop.**

### R.2 Safety Confirmation

Tell the user: "To confirm rollback of `<tag>`, type the exact tag name (e.g., `v1.3.0`):"

- If the user types the correct tag name → proceed.
- If the user types anything else → "Tag name does not match. Rollback cancelled." **Stop.**

### R.3 Execute Rollback

Perform each step. If any step fails, continue with remaining steps and report all results at the end.

1. **Delete GitHub release** (if `gh` is available):
   ```
   gh release delete <tag> --yes
   ```

2. **Delete remote tag:**
   ```
   git push origin :refs/tags/<tag>
   ```

3. **Delete local tag:**
   ```
   git tag -d <tag>
   ```

4. **Revert version bump commit** (if the most recent commit message matches `chore(release): <tag>`):
   ```
   git revert HEAD --no-edit
   git push origin HEAD
   ```

### R.4 Report Results

Show what succeeded and what failed:

```
Rollback of <tag>:
  GitHub release: deleted ✓ (or failed: <error>)
  Remote tag: deleted ✓
  Local tag: deleted ✓
  Version bump commit: reverted ✓

Rollback complete.
```

If any step failed, include manual cleanup instructions for that step.

---

## Process Rules

1. **Never skip quality gates** without explicit user `--force`.
2. **Dry-run: zero mutations** — no file writes, no git operations, no GitHub API calls.
3. **Beads integration is optional** — silently skip if `.beads/` doesn't exist.
4. **Tag format is always `vX.Y.Z`** — no other formats.
5. **Every confirmation must be explicit** — don't assume "yes" from silence.
6. **Rollback requires exact tag name** — not just "yes" or "confirm".

