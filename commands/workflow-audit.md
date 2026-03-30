---
description: "Verify workflow consistency across all documentation files"
long-description: "Audits every document that mentions workflow (CLAUDE.md, git-workflow, coding-standards, dev-setup) and fixes any inconsistencies in commit format, branch naming, PR steps, or key commands."
---

## Purpose
Cross-reference all documentation to ensure the canonical feature workflow is
consistently documented. Check every document that touches workflow (CLAUDE.md,
git-workflow.md, coding-standards.md, dev-setup.md, operations-runbook.md,
Makefile/package.json) for contradictions, stale references, missing steps, and
inconsistent command formats. Fix all issues found.

## Inputs
- CLAUDE.md (required) — primary workflow document to audit
- docs/git-workflow.md (required) — git workflow to verify alignment
- docs/coding-standards.md (required) — commit format to verify
- docs/dev-setup.md (required) — commands to verify match Key Commands
- Makefile or package.json (required) — actual commands to match against
- .github/ (optional) — PR templates and CI workflows to verify
- docs/operations-runbook.md (optional) — deployment pipeline to verify doesn't contradict CI or dev-setup
- tasks/lessons.md (optional) — verify it exists and is referenced

## Expected Outputs
- CLAUDE.md — corrected workflow section with all 9 steps + step 4.5
- docs/git-workflow.md — any contradictions fixed
- docs/coding-standards.md — commit format aligned
- Makefile/package.json — missing targets added (if needed)
- tasks/lessons.md — created if missing

## Quality Criteria
- (mvp) CLAUDE.md contains complete workflow (9 steps + AI review step 4.5)
- (mvp) Commit format is consistent everywhere (If Beads: [BD-<id>] type(scope): description. Without Beads: type(scope): description)
- (mvp) Branch naming is consistent everywhere (If Beads: bd-<task-id>/<short-desc>. Without Beads: <type>/<short-desc>)
- (mvp) PR workflow includes all 8 sub-steps with --delete-branch flag
- (mvp) If Beads: task closure uses bd close (not bd update --status completed)
- (mvp) Key Commands table matches actual Makefile/package.json commands
- (deep) Worktree cleanup between tasks documented (cannot checkout main)
- (deep) Agent crash recovery documented
- (deep) No document contradicts the canonical workflow
- (mvp) CLAUDE.md is the source of truth for workflow. All other documents must align with CLAUDE.md, not override it.
- (mvp) Tracking comment matches format: `<!-- scaffold:workflow-audit v1 YYYY-MM-DD -->`

## Methodology Scaling
- **deep**: Full six-phase audit (inventory, completeness check with all
  sub-checklists, consistency check, gap analysis, recommendations, execution).
  Every workflow step verified in every document.
- **mvp**: Quick consistency check of commit format, branch naming, and PR
  workflow across CLAUDE.md and git-workflow.md. Fix obvious contradictions.
- **custom:depth(1-5)**:
  - Depth 1: CLAUDE.md workflow section completeness check only.
  - Depth 2: CLAUDE.md workflow check plus commit format and branch naming verification.
  - Depth 3: add cross-doc consistency (git-workflow.md, coding-standards.md alignment).
  - Depth 4: add gap analysis (missing steps, stale references, Makefile target verification).
  - Depth 5: full six-phase audit (inventory, completeness, consistency, gap analysis, recommendations, execution).

## Mode Detection
Always operates in update mode (all documents exist by this point). Check for
tracking comment `<!-- scaffold:workflow-audit v1 YYYY-MM-DD -->` to detect
prior audit. If present, focus on changes since that date — new docs added,
existing docs modified, Makefile targets changed. The canonical workflow is
the source of truth — documents align to it, not vice versa. Preserve any
manually-added workflow steps or custom CI configurations.

## Update Mode Specifics
- **Detect prior artifact**: tracking comment in CLAUDE.md with audit version
  and date
- **Preserve**: custom CI jobs, user-added workflow steps, project-specific
  branch protection rules, custom PR template fields
- **Triggers for update**: CI configuration changed, git-workflow.md updated,
  new scripts added to Makefile, Makefile targets added or renamed, new setup
  prompts modified workflow docs
- **Conflict resolution**: if two docs disagree on workflow, the canonical
  workflow in CLAUDE.md wins; update the conflicting doc to match

---

## Domain Knowledge

### cross-phase-consistency

*Auditing consistency across pipeline phases — naming, assumptions, data flows, interface contracts*

# Cross-Phase Consistency

Cross-phase consistency validation ensures that artifacts produced across different pipeline phases agree with each other. Inconsistencies compound: a renamed entity in one phase propagates confusion into every downstream artifact. This document covers what to check, how to check it, and what findings look like.

## Summary

- **Naming consistency**: Trace every named concept through all artifacts; flag spelling variations, abbreviations, or synonyms for the same concept.
- **Shared assumptions**: Verify that assumptions made in later phases (cardinality, optionality, ordering, uniqueness) are explicitly stated in earlier artifacts.
- **Data shape consistency**: Trace entity shapes field-by-field from domain model through schema, API, and UX; verify types, naming, and format alignment.
- **Interface contract matching**: Architecture component interfaces must match their concrete definitions in API contracts; parameter names, types, and error cases aligned.
- **Data flow completeness**: Walk each architecture data flow step-by-step verifying source/target APIs exist and data shapes match at every boundary.
- **Constraint propagation**: ADR constraints (technology choices, patterns, NFRs) must be reflected in all downstream artifacts.
- **Common patterns to watch**: Enum drift, optionality mismatch, orphaned events, ghost requirements, format divergence, soft-delete vs hard-delete differences, and pagination assumption conflicts.

## Deep Guidance

## Why Inconsistencies Happen

Each pipeline phase is authored at a different time, possibly by different agents, with evolving understanding of the project. Common causes:

- An entity gets renamed during architecture but the domain model still uses the old name.
- A field is added to an API contract that does not exist in the database schema.
- An ADR constrains behavior that is contradicted by a later UX specification.
- A domain event defined in modeling is never consumed by any component in architecture.
- Units or formats differ (e.g., timestamps as ISO strings in the API but Unix integers in the schema).

## What to Check

### 1. Naming Consistency

Trace every named concept through all artifacts where it appears.

**Process:**
1. Extract all named entities from the domain model (aggregates, entities, value objects, events, invariants).
2. For each name, search every downstream artifact: ADRs, architecture, schema, API contracts, UX spec, implementation tasks.
3. Flag any spelling variations, abbreviations, or synonyms (e.g., "User" vs "Account" vs "Member" referring to the same concept).
4. Flag any name that appears in a downstream artifact but not in the domain model (potential undocumented concept).

**What findings look like:**
- "Domain model uses `PaymentTransaction` but API contracts call it `Payment` and database schema calls it `payment_txn`."
- "The entity `SubscriptionPlan` appears in the implementation tasks but is not in the domain model."

**Resolution:** Establish one canonical name per concept. Update all artifacts to use it.

### 2. Shared Assumptions

Later phases often assume properties that earlier phases did not explicitly specify.

**Process:**
1. For each phase from architecture onward, identify every assumption about earlier artifacts.
2. Verify each assumption is actually stated in the referenced artifact.
3. Pay special attention to: cardinality (one-to-many vs many-to-many), optionality (required vs optional), ordering (ordered vs unordered), uniqueness constraints, temporal assumptions (real-time vs eventual consistency).

**What findings look like:**
- "Architecture assumes `Order` has a `status` field with enum values, but the domain model defines `Order` without specifying lifecycle states."
- "API contracts assume paginated results, but architecture data flow diagrams show unbounded queries."

**Resolution:** Either add the assumption to the source artifact or update the downstream artifact to not depend on it.

### 3. Data Shape Consistency

Trace a data shape from domain model through schema through API through UI.

**Process:**
1. Pick a core entity (e.g., `User`).
2. Extract its shape from each layer:
   - Domain model: attributes, relationships, invariants
   - Database schema: columns, types, constraints, indexes
   - API contract: request/response fields, types, validation rules
   - UX spec: displayed fields, form inputs, validation messages
3. Verify field-by-field alignment:
   - Every domain attribute should map to a schema column (or have a documented reason for omission).
   - Every schema column exposed externally should appear in an API contract field.
   - Every API response field displayed to users should appear in UX spec.
   - Types should be compatible (e.g., domain `Money` value object maps to `DECIMAL(10,2)` in schema, `string` formatted as currency in API, formatted display in UX).

**What findings look like:**
- "Domain model `Product.price` is a `Money` value object (amount + currency), but schema has only `price_cents INTEGER` — currency is missing."
- "API returns `created_at` as ISO 8601 string but UX spec references `createdAt` as a Unix timestamp."

### 4. Interface Contract Matching

Verify that component interfaces defined in architecture match their implementations in API contracts and database schema.

**Process:**
1. Extract every component interface from the architecture document (method signatures, event subscriptions, data flows).
2. For each interface, find its concrete definition in API contracts or internal service contracts.
3. Verify:
   - All interface methods have corresponding endpoints or functions.
   - Parameter names and types match.
   - Return types match.
   - Error cases defined at the interface level are handled at the implementation level.

**What findings look like:**
- "Architecture defines `NotificationService.sendBatch(notifications[])` but API contracts only define `POST /notifications` for single notifications."
- "Architecture component `PaymentGateway` has an `onPaymentFailed` event handler, but no component publishes `PaymentFailed` events."

### 5. Data Flow Completeness

Verify that data flows described in architecture are implementable with the defined APIs and schemas.

**Process:**
1. For each data flow diagram in architecture, walk through step by step.
2. At each step, verify:
   - The source component has an API or interface that provides the data.
   - The target component has an API or interface that accepts the data.
   - The data shape at the source matches the data shape at the target.
   - Any transformation between source and target is documented.
3. Check for orphaned components — components that appear in data flows but have no API endpoints or database tables.

**What findings look like:**
- "Data flow shows `OrderService -> InventoryService: reserve items`, but InventoryService API has no reservation endpoint."
- "Data flow shows `AnalyticsCollector` receiving events from `UserService`, but the architecture has no event bus or pub/sub mechanism defined."

### 6. Constraint Propagation

ADR constraints should be respected in all downstream artifacts.

**Process:**
1. Extract all constraints from ADRs (technology choices, architectural patterns, non-functional requirements).
2. For each constraint, verify it is reflected in relevant downstream artifacts:
   - Technology choice ADRs should align with architecture component technology annotations.
   - Pattern ADRs (e.g., "use event sourcing for Order aggregate") should be reflected in schema design and API contracts.
   - NFR ADRs should have corresponding test criteria in testing strategy.

**What findings look like:**
- "ADR-007 mandates PostgreSQL, but database schema uses MongoDB-style document references."
- "ADR-012 requires CQRS for order processing, but architecture shows a single read/write path."

## How to Structure the Audit

### Pass 1: Build an Entity Registry

Create a table of every named concept with its appearance in each artifact:

| Concept | Domain Model | ADRs | Architecture | Schema | API | UX | Tasks |
|---------|-------------|------|-------------|--------|-----|-----|-------|
| User | `User` entity | — | `UserService` | `users` table | `/users` resource | User Profile screen | Task #12-#15 |
| Order | `Order` aggregate | ADR-012 CQRS | `OrderService` | `orders` table | `/orders` resource | Order History screen | Task #20-#28 |

Flag any row with missing cells or naming inconsistencies.

### Pass 2: Data Shape Tracing

For each entity in the registry, trace its shape layer by layer. Build a field-level comparison table:

| Field | Domain | Schema | API | UX |
|-------|--------|--------|-----|-----|
| id | UUID | `id UUID PK` | `id: string (uuid)` | hidden |
| email | Email (value object) | `email VARCHAR(255) UNIQUE` | `email: string (email)` | text input, validated |
| role | UserRole enum | `role VARCHAR(20) CHECK(...)` | `role: "admin" | "user"` | dropdown |

Flag mismatches in type, optionality, naming, or format.

### Pass 3: Flow Walking

Walk each data flow end-to-end, verifying every step has concrete API/schema support.

### Pass 4: Constraint Verification

Cross-reference every ADR constraint against downstream artifacts.

## Output Format

Findings should be structured as:

```
## Finding: [Short Description]

**Severity:** Critical | Major | Minor
**Phases Involved:** [list of phases]
**Description:** [What the inconsistency is]
**Evidence:**
- In [artifact]: [what it says]
- In [artifact]: [what it says differently]
**Recommended Fix:** [Which artifact to update and how]
```

## Common Patterns Worth Special Attention

1. **Enum drift** — Enum values defined in domain model, schema, API, and UX often diverge. One phase adds a new status value without updating others.
2. **Optionality mismatch** — Domain model says a field is required, but API contract makes it optional, or vice versa.
3. **Orphaned events** — Domain events defined but never consumed (or consumed but never published).
4. **Ghost requirements** — Features appear in UX spec or implementation tasks that trace to no PRD requirement.
5. **Format divergence** — Dates, money, identifiers represented differently across layers without documented transformation rules.
6. **Soft-delete vs hard-delete** — One phase assumes records are soft-deleted, another assumes they are gone.
7. **Pagination assumptions** — API paginates but UX assumes all data is available; or API returns all but architecture assumed streaming.

---

### claude-md-patterns

*Patterns for structuring CLAUDE.md files including section organization, rule authoring, pointer patterns, and merge strategies*

# CLAUDE.md Patterns

CLAUDE.md is the primary instruction file for AI coding agents. It is loaded at the start of every session and defines how the agent should behave within a project. A well-structured CLAUDE.md dramatically improves agent adherence; a poorly structured one gets ignored or causes conflicts. This knowledge covers structure, authoring, the pointer pattern, and the merge strategy for multi-step pipeline updates.

## Summary

### Purpose

CLAUDE.md is a project-level instruction file that AI agents (Claude Code, Codex, etc.) read at session start. It answers three questions:
1. **What are the rules?** — Coding conventions, git workflow, testing requirements
2. **How do I do common tasks?** — Key commands, PR workflow, deployment
3. **What should I avoid?** — Anti-patterns, forbidden operations, common pitfalls

### Section Organization

A well-structured CLAUDE.md follows this order, from most-referenced to least:

| Section | Purpose | Example Content |
|---------|---------|-----------------|
| **Core Principles** | 3-5 non-negotiable tenets | TDD, simplicity, no laziness |
| **Project Overview** | What this project is (1-2 sentences) | "Prompt pipeline for scaffolding projects" |
| **Key Commands** | Commands the agent runs constantly | `make check`, `make test`, `npm run dev` |
| **Workflow** | How to do common operations | Branch, commit, PR, merge flow |
| **Structure Quick Reference** | Where files go | Directory table with purpose |
| **Environment** | Dev setup specifics | Build tool, test runner, linter |
| **Rules** | Specific do/don't instructions | "Never push to main directly" |
| **Self-Improvement** | Learning feedback loop | Lessons file, correction capture |
| **Autonomous Behavior** | What the agent should do proactively | Fix bugs on sight, use subagents |
| **Doc Lookup Table** | Where to find detailed docs | Question-to-document mapping |

### Rule Authoring Best Practices

Rules must be specific, actionable, and testable:

**Good rules:**
- "Run `make check` before every commit"
- "Never push directly to main — always use branch + PR"
- "Every commit message starts with `[BD-xxx]` task ID"

**Bad rules:**
- "Write clean code" — what does clean mean?
- "Be careful with git" — what specific actions to take/avoid?
- "Follow best practices" — which ones?

### The Pointer Pattern

Reference external docs instead of duplicating content inline:

```markdown
## Coding Conventions
See `docs/coding-standards.md` for full reference. Key rules in `.claude/rules/code-style.md`.
```

This keeps CLAUDE.md under 200 lines (the empirically-validated adherence threshold) while preserving access to detailed docs. The agent reads referenced docs on demand rather than processing everything at session start.

## Deep Guidance

### Section Organization — Extended

#### Front-Loading Critical Information

Agents skim CLAUDE.md. The first 50 lines get the most attention. Place the most violated rules and most-used commands at the top. Core Principles and Key Commands should appear before any detailed documentation.

#### The 200-Line Threshold

Research and practical experience show that agent adherence drops sharply when CLAUDE.md exceeds ~200 lines. Beyond that length, agents start selectively ignoring instructions — particularly those in the middle or bottom of the file.

Strategies to stay under 200 lines:
- Use the pointer pattern for anything longer than 5 lines
- Move path-scoped conventions to `.claude/rules/` files
- Keep tables compact (no verbose descriptions)
- Eliminate redundancy (same rule stated multiple ways)

#### Section Templates

**Core Principles** — 3-5 tenets, each a single sentence with a bold label:
```markdown
## Core Principles
- **Simplicity First**: Make every change as simple as possible.
- **TDD Always**: Write failing tests first, then make them pass.
- **Prove It Works**: Never mark a task complete without demonstrating correctness.
```

**Key Commands** — Table format, sorted by frequency of use:
```markdown
## Key Commands
| Command | Purpose |
|---------|---------|
| `make check` | Run all quality gates |
| `make test` | Run test suite |
| `make lint` | Run linters |
```

**Doc Lookup Table** — Question-to-document mapping:
```markdown
## When to Consult Other Docs
| Question | Document |
|----------|----------|
| How do I branch and commit? | `docs/git-workflow.md` |
| What are the coding conventions? | `docs/coding-standards.md` |
```

### Rule Authoring — Extended

#### The Testability Criterion

Every rule should be verifiable. If you cannot check whether the rule was followed, the rule is too vague.

| Rule | Testable? | Fix |
|------|-----------|-----|
| "Write good tests" | No | "Every new function has at least one unit test" |
| "Use proper naming" | No | "Use camelCase for variables, PascalCase for types" |
| "Run `make check` before commits" | Yes | — |
| "Never commit `.env` files" | Yes | — |

#### Conflict Resolution

Rules can conflict. When they do, the resolution order is:
1. CLAUDE.md rules override general conventions
2. More specific rules override more general rules
3. Later rules override earlier rules (if truly contradictory)
4. Project-specific rules override ecosystem defaults

Document known conflicts explicitly: "This project uses tabs despite the TypeScript convention of spaces — see `.editorconfig`."

#### Negative Rules vs. Positive Rules

Prefer positive rules ("always do X") over negative rules ("never do Y") when possible. Positive rules tell the agent what to do; negative rules only eliminate one option from an infinite set.

Exception: safety-critical negative rules are valuable. "Never push to main directly" and "Never commit secrets" are clearer as negatives.

### Pointer Pattern — Extended

#### When to Inline vs. Point

| Content Type | Inline in CLAUDE.md | Point to External Doc |
|-------------|--------------------|-----------------------|
| Core principles | Yes | No |
| Key commands table | Yes | No |
| Workflow summary (5-10 lines) | Yes | Detailed version elsewhere |
| Coding conventions (full) | No | `docs/coding-standards.md` |
| Git workflow (full) | No | `docs/git-workflow.md` |
| Project structure (full) | No | `docs/project-structure.md` |
| Design system rules | No | `docs/design-system.md` |

The rule: if the content is referenced multiple times per session, inline a summary. If it is referenced occasionally, point to it.

#### Cross-Reference Format

Use consistent pointer format throughout:
```markdown
See `docs/coding-standards.md` for full reference.
```

Not:
```markdown
Refer to the coding standards document for more details.
```

The first format gives the agent an exact file path to read. The second requires the agent to search for the file.

### Merge Strategy for Multi-Step Pipeline Updates

Seven pipeline steps modify CLAUDE.md during project scaffolding. Each step owns specific sections and must not overwrite sections owned by other steps. This section ownership model prevents destructive overwrites when steps execute sequentially.

#### Section Ownership Map

| Pipeline Step | CLAUDE.md Sections Owned | Operation |
|--------------|-------------------------|-----------|
| **beads** | Core Principles, Task Management (Beads commands), Self-Improvement, Autonomous Behavior | Creates initial skeleton |
| **project-structure** | Project Structure Quick Reference | Adds/updates directory table |
| **dev-env-setup** | Key Commands, Dev Environment | Adds/updates command table and env section |
| **git-workflow** | Committing and Creating PRs, Parallel Sessions (Worktrees) | Adds/updates workflow sections |
| **design-system** | Design System, Browser Testing | Adds/updates design system section |
| **ai-memory-setup** | Pointer restructuring (cross-cutting) | Replaces inline content with pointers to `.claude/rules/` |
| **automated-pr-review** | Code Review workflow | Adds/updates review workflow section |

#### Merge Rules

1. **Additive by default.** Each step adds its sections without modifying sections owned by other steps. If a section does not exist, create it. If it exists and belongs to this step, update it in-place.

2. **Never delete unrecognized sections.** If CLAUDE.md contains sections not in the ownership map (user customizations, project-specific sections), preserve them. Move them to the end if they conflict with the expected layout, but never remove them.

3. **Beads goes first.** The `beads` step creates the initial CLAUDE.md skeleton. All subsequent steps add to this skeleton. If `beads` was skipped (project does not use Beads), subsequent steps must still create their sections — they just skip the Beads-specific content.

4. **ai-memory-setup is cross-cutting.** Unlike other steps that add sections, `ai-memory-setup` restructures existing sections by replacing inline content blocks with pointer references to `.claude/rules/` files. It operates across sections owned by other steps but only changes the representation (inline → pointer), not the substance.

5. **claude-md-optimization consolidates.** The final consolidation step (`claude-md-optimization`) reviews the accumulated CLAUDE.md, removes redundancy introduced by incremental additions, fixes inconsistencies in terminology, and reorders for scannability. It operates on all sections but does not add new workflow steps or rules — only consolidates and clarifies what exists.

6. **Preserve tracking comments.** Steps that add tracking comments (`<!-- scaffold:step-name v1 YYYY-MM-DD -->`) must preserve comments from other steps. These comments enable update detection.

7. **Update mode is the norm.** After initial creation by `beads`, all subsequent steps operate in update mode. They check for existing content, preserve customizations, and update in-place rather than replacing.

#### Conflict Scenarios

**Two steps reference the same command.** Example: `dev-env-setup` adds `make check` to Key Commands and `git-workflow` references `make check` in the PR workflow. Resolution: the Key Commands table (owned by `dev-env-setup`) is the single source of truth for command definitions. Other sections reference commands but do not redefine them.

**ai-memory-setup restructures a section another step just added.** This is expected and by design. The `ai-memory-setup` step runs after environment steps and converts verbose inline blocks to compact pointer references. The referenced docs must exist before the pointer is valid.

**User adds custom sections between pipeline runs.** Subsequent pipeline steps must detect and preserve custom sections. Use the tracking comment (`<!-- scaffold:step-name -->`) to identify pipeline-managed sections vs. user-added sections.

### Update Mode Handling

#### Detecting Existing Content

Every pipeline step that modifies CLAUDE.md implements mode detection:
- If the file does not exist → create mode (write full skeleton)
- If the file exists → update mode (modify owned sections in-place)

Update mode is the common case. After the first `beads` run, every subsequent step encounters an existing CLAUDE.md.

#### Preserving Custom Sections

Users customize CLAUDE.md between pipeline runs. Common customizations:
- Adding project-specific rules
- Adding custom command aliases
- Adding team-specific workflow notes
- Adding integration-specific sections (deployment, monitoring)

Pipeline steps must preserve all content they do not own. The safest pattern is:
1. Read the existing CLAUDE.md
2. Identify sections owned by this step (by heading or tracking comment)
3. Replace only those sections with updated content
4. Leave everything else untouched

#### Additive Updates

When updating a section, prefer additive changes over destructive ones:
- Add new table rows rather than replacing the entire table
- Add new subsections rather than rewriting the section
- Append to lists rather than replacing them
- Only remove content if it is demonstrably wrong or duplicated

### Common Anti-Patterns

**Inline everything.** CLAUDE.md becomes 500+ lines with full coding standards, complete git workflow, entire project structure. Agent adherence drops, load time increases, signal drowns in noise. Fix: use the pointer pattern. Keep CLAUDE.md under 200 lines.

**Stale commands.** Key Commands table references `npm test` but the project switched to `bun test` two months ago. The agent runs the wrong command and wastes a cycle. Fix: keep Key Commands in sync with actual build tool configuration. The `claude-md-optimization` step verifies this.

**Conflicting rules.** CLAUDE.md says "always use conventional commits" in one section and "use `[BD-xxx]` prefix" in another, with no guidance on which takes precedence. Fix: consolidate commit message rules in one place. If both apply, show the combined format: `[BD-42] feat(api): implement endpoint`.

**Redundant instructions.** The same rule appears in Core Principles, Workflow, and Rules sections with slightly different wording. The agent may follow one version and violate another. Fix: state each rule once in its canonical section. Other sections reference it.

**Missing doc lookup.** CLAUDE.md references "the git workflow" but does not specify the file path. The agent searches, guesses, or ignores the reference. Fix: always include exact file paths in references.

**No update mode.** A pipeline step blindly writes a complete CLAUDE.md, overwriting sections added by earlier steps. Fix: every step that modifies CLAUDE.md must read it first, identify its owned sections, and update only those sections.

**Over-specifying autonomous behavior.** CLAUDE.md micro-manages every agent decision: "If you see a typo, fix it. If you see a missing import, add it. If you see..." This wastes lines on things the agent would do anyway. Fix: autonomous behavior should cover non-obvious expectations — "fix bugs on sight," "use subagents for research," "re-plan when stuck." Skip obvious behaviors.

---

### git-workflow-patterns

*Git branching strategies, commit conventions, PR workflows, merge policies, and CI integration patterns for AI-agent-driven development*

# Git Workflow Patterns

Structured git workflows for AI-agent-driven projects ensure consistent branching, meaningful commit history, automated quality gates, and smooth multi-agent collaboration via worktrees.

## Summary

### Branching Strategy

The trunk-based development model works best for AI-agent workflows:

- **Main branch** (`main`) — always deployable, protected by CI
- **Feature branches** — short-lived, created per task or story (`feat/US-xxx-slug`, `fix/bug-description`)
- **Worktree branches** — parallel agent execution using git worktrees (`agent/<name>/<task>`)

Branch naming conventions:
```
feat/US-001-user-registration    # Feature work tied to a story
fix/login-timeout-handling       # Bug fix
chore/update-dependencies        # Maintenance
docs/api-contract-updates        # Documentation only
```

### Commit Conventions

Use Conventional Commits format for machine-parseable history:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`

AI agent commits should include the Co-Authored-By trailer for attribution and auditability.

### Pull Request Workflow

Standard PR lifecycle:
1. Create branch from `main`
2. Implement changes with passing tests
3. Push branch, create PR with structured description
4. CI runs all quality gates (`make check` or equivalent)
5. Review (automated or manual)
6. Squash-merge to maintain clean history
7. Delete branch after merge

## Deep Guidance

### Merge Policies

- **Squash merge** for feature branches — keeps main history clean
- **Merge commit** for release branches — preserves the merge point
- **Never force-push** to main or shared branches
- **Delete branches** after merge to prevent clutter

### CI Integration

Minimum CI pipeline for scaffold projects:
1. **Lint** — ShellCheck, ESLint, or language-appropriate linter
2. **Test** — Full test suite including evals
3. **Build** — Verify compilation/bundling succeeds
4. **Type check** — For typed languages (TypeScript, etc.)

### Worktree Patterns for Multi-Agent Work

Git worktrees enable parallel agent execution on the same repository:

```bash
# Create a worktree for an agent
scripts/setup-agent-worktree.sh agent-name

# Each worktree gets its own branch and working directory
# Agents can work simultaneously without conflicts
```

Key rules:
- Each agent works in its own worktree with its own branch
- Agents coordinate via the implementation plan task assignments
- Merge conflicts are resolved by the agent whose branch is behind
- The main worktree is the coordination point

### Branch Protection Rules

Configure branch protection for `main`:
- Require status checks to pass before merge
- Require branches to be up to date before merge
- Do not allow direct pushes
- Require squash merging for feature branches

### Commit Message Quality

Good commit messages for AI agents:
```
feat(auth): add JWT token refresh endpoint

Implements automatic token refresh when the access token expires
within 5 minutes. Refresh tokens are rotated on each use.

Closes US-015
```

Bad commit messages to avoid:
- `fix stuff` — no context
- `WIP` — should never be pushed
- `update` — what was updated?

### PR Description Template

```
### What changed
- [1-3 bullet points describing the change]

### Files modified
- [Specific files/components modified]

### How to test
- [How to verify the changes work]

### Related
- [Story ID, issue link, or ADR reference]
```

### Conflict Resolution Strategy

When multiple agents work in parallel:
1. Agent finishing first merges normally
2. Agent finishing second rebases onto updated main
3. If conflicts arise, the second agent resolves them
4. Never force-push over another agent's work

Conflict resolution checklist:
- Pull latest main before starting any task
- Rebase frequently on long-running branches (every few commits)
- If a rebase produces conflicts in files you didn't modify, investigate — another agent may have refactored the same area
- After resolving conflicts, re-run the full test suite before pushing
- Document unusual conflict resolutions in the commit message body

### Release Workflow

For version-tagged releases:
1. Ensure all PRs are merged to main
2. Run full quality gates on main
3. Create a version tag (`v1.2.3`)
4. Generate changelog from conventional commits
5. Push tag to trigger release pipeline

### Semantic Versioning

Follow semver for version tags:
- **MAJOR** (`X.0.0`) — breaking API changes, incompatible migrations
- **MINOR** (`0.X.0`) — new features, backward-compatible additions
- **PATCH** (`0.0.X`) — bug fixes, documentation, internal refactors

Pre-release versions for staging: `v1.2.3-rc.1`, `v1.2.3-beta.1`

### Git Hooks

Pre-commit hooks for quality enforcement:
```bash
# .husky/pre-commit or .git/hooks/pre-commit
#!/usr/bin/env bash
set -euo pipefail

# Run linter on staged files
make lint

# Validate frontmatter on changed command files
./scripts/validate-frontmatter.sh $(git diff --cached --name-only -- 'commands/*.md')
```

Pre-push hooks for broader validation:
```bash
# .husky/pre-push or .git/hooks/pre-push
#!/usr/bin/env bash
set -euo pipefail

# Run full test suite before pushing
make test
```

### Common Anti-Patterns

Patterns to avoid in AI-agent git workflows:

1. **Long-lived branches** — branches older than 1 day risk merge conflicts. Keep branches short-lived.
2. **Giant PRs** — PRs with 500+ lines changed are hard to review. Split into smaller, focused PRs.
3. **Skipping hooks** — `--no-verify` hides real issues. Fix the root cause instead.
4. **Rebasing shared branches** — only rebase branches that only you use. Shared branches use merge commits.
5. **Committing generated files** — lock files yes, build output no. Use `.gitignore` aggressively.
6. **Force-pushing to main** — this is never acceptable. Even if CI is broken, create a fix branch.
7. **Mixing concerns in one commit** — each commit should be atomic and focused on one change.
