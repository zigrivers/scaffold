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

### Phase Name Reference

For resolving phase-based requests:

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

Execution mode: continue within the requested batch; pause for unresolved decisions
```

6. **Use existing authorization**: An explicit request such as "run phases 5–8" authorizes that resolved batch. Show the ordered list and start. Ask before starting only when scope is ambiguous, the proposed list changes the request, or a repository rule or selected mode requires approval. Preserve already-approved preferences and per-step confirmation mode.

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
5. **Resolve decisions**: Use the [execution decision rules](execution.md#step-3-resolve-decisions-from-context) to distinguish settled choices, routine details, and missing consequential decisions
6. **Apply session preferences**: If the user already set depth, strictness, or other preferences earlier in the batch (or in session preferences), substitute those answers without re-asking
7. **Resolve new decisions**: Apply the decision rules in [execution.md](execution.md). Ask only for missing consequential choices or explicit approval gates; choose routine implementation details from project context.
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
- A failure remains blocked after safe, in-scope recovery (see [recovery.md](recovery.md)), or needs unavailable credentials or authority
- Step requires a consequential decision that cannot be resolved from the request, approved plan, session preferences, or project policy
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

When a new step has a decision point that matches a carried-forward preference, substitute the answer silently. Re-evaluate when context changes (for example, a prior output contradicts an earlier decision); ask only for an unresolved consequential choice or explicit approval under the execution rules.

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
Note: Show the resolved scope; ask only if it differs from the request or an explicit gate requires it
```

**"Run all validation checks"** — Useful before implementation:
```
Steps: cross-phase-consistency, traceability-matrix, decision-completeness,
       critical-path-walkthrough, implementability-dry-run,
       dependency-graph-validation, scope-creep-check
Action: These are independent (no deps between them) — run sequentially
Note: These are quick, low-decision steps — usually fully autonomous
```
