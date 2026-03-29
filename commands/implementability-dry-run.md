---
description: "Dry-run specs as implementing agent, catching ambiguity"
long-description: "Simulates picking up each task as an implementing agent and flags anything ambiguous — unclear acceptance criteria, missing input files, undefined error handling — that would force an agent to guess."
---

## Purpose
Dry-run specs as implementing agent, catching ambiguity. Simulate what an
AI agent would experience when picking up each implementation task: are the
inputs clear, are the acceptance criteria testable, are there ambiguities
that would force the agent to guess?

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent dry-runs — different models encounter different ambiguities
when simulating implementation.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/implementability-dry-run.md — findings report
- docs/validation/implementability-dry-run/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/implementability-dry-run/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/implementability-dry-run/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Every task specifies: input file paths, expected output artifacts, testable acceptance criteria, and references to upstream documents
- (deep) No task references undefined concepts, components, or APIs
- (deep) Every task's dependencies are present in the implementation plan
- (deep) Shared code patterns identified and documented (no duplication risk across tasks)
- (mvp) Findings categorized P0-P3 with specific file, section, and issue for each
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Finding Disposition
- **P0 (blocking)**: Must be resolved before proceeding to implementation. Create
  fix tasks and re-run affected upstream steps.
- **P1 (critical)**: Should be resolved; proceeding requires explicit risk acceptance
  documented in an ADR. Flag to project lead.
- **P2 (medium)**: Document in implementation plan as tech debt. May defer to
  post-launch with tracking issue.
- **P3 (minor)**: Log for future improvement. No action required before implementation.

Findings are reported in the validation output file with severity, affected artifact,
and recommended resolution. P0/P1 findings block the implementation-plan step from
proceeding without acknowledgment.

## Methodology Scaling
- **deep**: Exhaustive analysis with all sub-checks. Multi-model validation
  dispatched to Codex and Gemini if available, with graceful fallback to
  Claude-only enhanced validation.
- **mvp**: High-level scan for blocking issues only.
- **custom:depth(1-5)**: Depth 1: verify each task has enough context to start. Depth 2: add tool/dependency availability check. Depth 3: full dry-run simulation of first 3 tasks with quality gate verification. Depth 4: add external model dry-run. Depth 5: multi-model dry-run with implementation plan revision recommendations.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/implementability-dry-run/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/implementability-dry-run/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding

---

## Domain Knowledge

### implementability-review

*Dry-running specs as an implementing agent to catch ambiguity and missing detail*

# Implementability Review

An implementability review reads every specification as if you were an AI agent about to implement it. For each task, the question is: "Do I have everything I need to start coding right now?" Every question you would need to ask is a gap. Every ambiguity you would need to resolve is a defect. This is the most practical validation — it tests whether the specs actually work for their intended consumer.

## Summary

- **Core question per task**: "Do I have everything I need to start coding right now?" — every unanswered question is a gap, every ambiguity is a defect.
- **Agent constraints to account for**: no institutional memory, no ability to ask clarifying questions, literal interpretation of specs, context window limits, and no ability to infer patterns from existing code.
- **Five check dimensions**: task-level completeness (inputs, outputs, scope, dependencies), ambiguity detection, error case coverage, data shape precision, and pattern/convention specification.
- **Ambiguity patterns**: vague adjectives ("fast", "secure", "appropriate"), missing specifics (pagination, notification channels, log levels), and implicit behavior (auth redirects, i18n fallbacks, cache invalidation).
- **Error cases to verify**: input validation, business logic violations, infrastructure failures, and concurrency conflicts — each needing defined response format, retry behavior, user feedback, and logging level.
- **Data shape precision**: types beyond primitives (email vs. free text), optional vs. nullable distinction, exhaustive enum values, and format standards (dates, money, IDs).
- **Review method**: role-play as the implementing agent, read only what the task references, attempt pseudocode, and record every question or assumption.
- **Scoring**: 5/5 (fully implementable) to 1/5 (not implementable); target all tasks at 4/5+ before implementation begins.
- **Most frequently missing**: error response formats, logging conventions, edge-case validation rules, concurrency handling, and empty-state behavior.

## Deep Guidance

## The Implementing Agent Perspective

AI agents implementing tasks have specific constraints that make implementability review different from a human code review:

1. **No institutional memory.** The agent knows only what the specifications say. If a convention is "obvious" to the team but not documented, the agent will not follow it.
2. **No ability to ask clarifying questions in real-time.** The agent will either guess or stop. Both are bad.
3. **Literal interpretation.** If the spec says "handle errors appropriately," the agent has no shared understanding of what "appropriately" means for this project.
4. **Context window limits.** The agent may not have all specifications loaded simultaneously. Each task needs enough context to be self-contained or must explicitly reference what to read.
5. **No ability to "look at what others did."** Unless the codebase already has examples, the agent cannot infer patterns from existing code.

## What to Check

### 1. Task-Level Completeness

For each implementation task, verify:

**Inputs are specified:**
- What files or modules does this task modify or create?
- What existing code does it depend on?
- What specifications should the implementer read?

**Expected output is clear:**
- What is the concrete deliverable? (files created, functions implemented, tests passing)
- How will success be measured?

**Scope is bounded:**
- Is it clear where this task starts and stops?
- Are there ambiguous boundaries with adjacent tasks?

**Dependencies are explicit:**
- What tasks must be completed before this one can start?
- What will this task produce that other tasks need?

### 2. Ambiguity Detection

Ambiguity is any specification statement that a reasonable implementer could interpret in more than one way.

**Common ambiguity patterns:**

**Vague adjectives and adverbs:**
- "The system should be fast" — How fast? Specify latency targets.
- "Properly validate input" — What validation rules? Which inputs?
- "Handle errors gracefully" — What does graceful mean? Show error message? Retry? Log and continue?
- "Securely store passwords" — Which algorithm? What salt length? What cost factor?

**Missing specifics:**
- "Paginate the results" — Page size? Cursor-based or offset-based? Default sort order?
- "Send a notification" — Via what channel? Email? Push? In-app? What is the message content?
- "Log the event" — What log level? What fields? What format? Where does it go?

**Implicit behavior:**
- "When the user is not authenticated, redirect to login" — What about API calls? Return 401 or redirect?
- "Support multiple languages" — Which languages? How are translations managed? What is the fallback?
- "Cache the results" — For how long? What invalidates the cache? What cache store?

**Detection technique:** For each specification statement, ask:
1. Could two different developers implement this differently and both believe they followed the spec?
2. If yes, the statement is ambiguous.

### 3. Error Case Coverage

Error handling is where implementability most often breaks down. For each operation:

**Input validation errors:**
- What happens when required fields are missing?
- What happens when field values are out of range?
- What happens when field types are wrong (string instead of number)?
- What are the specific validation rules and error messages?

**Business logic errors:**
- What happens when a domain invariant would be violated?
- What happens when a referenced entity does not exist?
- What happens when the operation is not allowed in the current state?

**Infrastructure errors:**
- What happens when the database is unavailable?
- What happens when an external service times out?
- What happens when the disk is full?

**Concurrency errors:**
- What happens when two users modify the same entity simultaneously?
- What happens when a task is claimed by two agents at the same time?
- Is optimistic or pessimistic locking specified?

**For each error scenario, the spec should define:**
- The error response format (status code, error body structure)
- Whether the operation should be retried
- What the user sees (if user-facing)
- Whether the error should be logged and at what level
- Whether an alert should be triggered

### 4. Data Shape Precision

For every data structure that crosses a boundary (API request/response, database row, event payload, component props):

**Type precision:**
- Are types specified? (`string` is not enough — is it an email? A UUID? Free text with a max length?)
- Are optional fields marked? (What is the default when omitted?)
- Are nullable fields distinguished from optional fields?
- Are enum values listed exhaustively?

**Relationship precision:**
- Are foreign key relationships clear? (Does the task know which table to join?)
- Are nested objects or arrays specified? (What is the shape of items in the array?)
- Are circular references addressed? (How deep does serialization go?)

**Format precision:**
- Date format (ISO 8601? Unix timestamp? Local timezone?)
- Money format (cents as integer? Decimal string? Object with amount and currency?)
- ID format (auto-increment integer? UUID v4? ULID? CUID?)

### 5. Pattern and Convention Specification

For each task, the implementer needs to know what patterns to follow:

**Code organization:**
- Where do new files go? (Directory structure, naming conventions)
- What is the module/component pattern? (One class per file? Barrel exports? Index files?)

**Error handling pattern:**
- Do errors propagate as exceptions or as return values?
- Is there a custom error class hierarchy?
- Where is error mapping done (at the boundary or in the domain)?

**Testing pattern:**
- What test file naming convention? (`*.test.ts`, `*.spec.ts`, `__tests__/`)
- What test structure? (describe/it? test()? Separate unit and integration directories?)
- What mocking approach? (Jest mocks? Dependency injection? Test doubles?)

**Logging pattern:**
- What logger? (console, winston, pino, structured JSON?)
- What log levels for what events?
- What contextual fields to include?

If these patterns are not in the specification, each agent will invent their own, producing an inconsistent codebase.

## How to Perform the Review

### Role-Play Method

For each task in the implementation tasks document:

1. **Read only what the task says to read.** Do not bring in knowledge from other tasks or general experience. The agent will only have what it is told to read.
2. **Attempt to write pseudocode.** Try to outline the implementation based solely on the specification.
3. **Record every point where you would need to ask a question.** Each question is a gap.
4. **Record every point where you would need to make an assumption.** Each assumption should either be confirmed in the spec or documented as a finding.
5. **Record every point where you would need to look at existing code for reference.** If the existing code does not yet exist (greenfield), this is a gap.

### Checklist Per Task

```
Task: [Task ID and title]

Information Check:
- [ ] What to build is clear (not just what area to work in)
- [ ] Where to put the code is specified (directory, file naming)
- [ ] What patterns to follow are referenced or documented
- [ ] Dependencies on other tasks are listed
- [ ] What "done" looks like is defined (test criteria, acceptance criteria)

Ambiguity Check:
- [ ] No vague adjectives (fast, secure, robust, scalable, appropriate)
- [ ] No missing specifics (pagination details, error formats, cache TTL)
- [ ] No implicit behavior (authentication, authorization, logging)

Error Case Check:
- [ ] Input validation errors defined
- [ ] Business logic errors defined
- [ ] Infrastructure failure behavior defined
- [ ] Concurrency behavior defined

Data Shape Check:
- [ ] All data structures have explicit types
- [ ] Optional and nullable fields distinguished
- [ ] Enum values listed
- [ ] Formats specified (dates, money, IDs)
```

## Output Format

### Per-Task Findings

```markdown
## Task T-015: Implement Order Creation Endpoint

**Implementability Score:** 3/5 (Partially implementable — key gaps exist)

### Gaps Found

1. **AMBIGUITY** — Error response format not specified
   - Spec says "return appropriate error" but does not define the error response body structure.
   - Impact: Agent will invent an error format that may be inconsistent with other endpoints.
   - Fix: Add error response schema to API contracts.

2. **MISSING** — Inventory check behavior undefined
   - Spec says "validate inventory" but does not define what happens when inventory is insufficient.
   - Questions: Partial order allowed? Wait-list? Immediate rejection?
   - Fix: Add inventory insufficiency handling to the order creation flow in API contracts.

3. **VAGUE** — "Log the order creation event"
   - What logger? What log level? What fields? What format?
   - Fix: Reference logging conventions in the implementation playbook.
```

### Summary Table

```markdown
| Task | Score | Gaps | Critical | Assessment |
|------|-------|------|----------|------------|
| T-012 | 5/5 | 0 | 0 | Ready to implement |
| T-013 | 4/5 | 2 | 0 | Minor clarifications needed |
| T-015 | 3/5 | 4 | 1 | Error handling gaps |
| T-020 | 2/5 | 6 | 3 | Significant rework needed |
```

### Scoring Guide

- **5/5** — Task is fully implementable. No questions, no assumptions needed.
- **4/5** — Task is mostly implementable. Minor clarifications needed but an agent could make reasonable assumptions.
- **3/5** — Task is partially implementable. Some gaps that could lead to incorrect implementation.
- **2/5** — Task has significant gaps. Agent would need to guess about core behavior.
- **1/5** — Task is not implementable. Fundamental information is missing.

Target: All tasks should score 4/5 or higher before implementation begins.

## Common Findings by Category

### Most Frequently Missing

1. Error response formats (almost always under-specified)
2. Logging conventions (almost never specified)
3. Input validation rules (specified for happy path, missing for edge cases)
4. Concurrency handling (rarely addressed in specs)
5. Empty state behavior (what happens when there is no data)

### Most Impactful When Missing

1. Authentication/authorization boundaries (who can call what)
2. Data migration and seeding (how does initial data get in)
3. Environment configuration (what env vars, what defaults)
4. External service integration details (API keys, rate limits, retry policies)
5. State machine transitions (valid state changes and their guards)

---

### multi-model-review-dispatch

*Patterns for dispatching reviews to external AI models (Codex, Gemini) at depth 4+, including fallback strategies and finding reconciliation*

# Multi-Model Review Dispatch

At higher methodology depths (4+), reviews benefit from independent validation by external AI models. Different models have different blind spots — Codex excels at code-centric analysis while Gemini brings strength in design and architectural reasoning. Dispatching to multiple models and reconciling their findings produces higher-quality reviews than any single model alone. This knowledge covers when to dispatch, how to dispatch, how to handle failures, and how to reconcile disagreements.

## Summary

### When to Dispatch

Multi-model review activates at depth 4+ in the methodology scaling system:

| Depth | Review Approach |
|-------|----------------|
| 1-2 | Claude-only, reduced pass count |
| 3 | Claude-only, full pass count |
| 4 | Full passes + one external model (if available) |
| 5 | Full passes + multi-model with reconciliation |

Dispatch is always optional. If no external model CLI is available, the review proceeds as a Claude-only enhanced review with additional self-review passes to partially compensate.

### Model Selection

| Model | Strength | Best For |
|-------|----------|----------|
| **Codex** (OpenAI) | Code analysis, implementation correctness, API contract validation | Code reviews, security reviews, API reviews, database schema reviews |
| **Gemini** (Google) | Design reasoning, architectural patterns, broad context understanding | Architecture reviews, PRD reviews, UX reviews, domain model reviews |

When both models are available at depth 5, dispatch to both and reconcile. At depth 4, choose the model best suited to the artifact type.

### Graceful Fallback

External models are never required. The fallback chain:
1. Attempt dispatch to selected model(s)
2. If CLI unavailable → skip that model, note in report
3. If timeout → use partial results if any, note incompleteness
4. If all external models fail → Claude-only enhanced review (additional self-review passes)

The review never blocks on external model availability.

## Deep Guidance

### Dispatch Mechanics

#### CLI Availability Check

Before dispatching, verify the model CLI is installed and authenticated:

```bash
# Codex check
which codex && codex --version 2>/dev/null

# Gemini check (via Google Cloud CLI or dedicated tool)
which gemini 2>/dev/null || (which gcloud && gcloud ai models list 2>/dev/null)
```

If the CLI is not found, skip dispatch immediately. Do not prompt the user to install it — this is a review enhancement, not a requirement.

#### Prompt Formatting

External model prompts must be self-contained. The external model has no access to the pipeline context, CLAUDE.md, or prior conversation. Every dispatch includes:

1. **Artifact content** — The full text of the document being reviewed
2. **Review focus** — What specific aspects to evaluate (coverage, consistency, correctness)
3. **Upstream context** — Relevant upstream artifacts that the document should be consistent with
4. **Output format** — Structured JSON for machine-parseable findings

**Prompt template:**
```
You are reviewing the following [artifact type] for a software project.

## Document Under Review
[full artifact content]

## Upstream Context
[relevant upstream artifacts, summarized or in full]

## Review Instructions
Evaluate this document for:
1. Coverage — Are all expected topics addressed?
2. Consistency — Does it agree with the upstream context?
3. Correctness — Are technical claims accurate?
4. Completeness — Are there gaps that would block downstream work?

## Output Format
Respond with a JSON array of findings:
[
  {
    "id": "F-001",
    "severity": "P0|P1|P2|P3",
    "category": "coverage|consistency|correctness|completeness",
    "location": "section or line reference",
    "finding": "description of the issue",
    "suggestion": "recommended fix"
  }
]
```

#### Output Parsing

External model output is parsed as JSON. Handle common parsing issues:
- Strip markdown code fences (```json ... ```) if the model wraps output
- Handle trailing commas in JSON arrays
- Validate that each finding has the required fields (severity, category, finding)
- Discard malformed entries rather than failing the entire parse

Store raw output for audit:
```
docs/reviews/{artifact}/codex-review.json   — raw Codex findings
docs/reviews/{artifact}/gemini-review.json  — raw Gemini findings
docs/reviews/{artifact}/review-summary.md   — reconciled synthesis
```

### Timeout Handling

External model calls can hang or take unreasonably long. Set reasonable timeouts:

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| CLI availability check | 5 seconds | Should be instant |
| Small artifact review (<2000 words) | 60 seconds | Quick read and analysis |
| Medium artifact review (2000-10000 words) | 120 seconds | Needs more processing time |
| Large artifact review (>10000 words) | 180 seconds | Maximum reasonable wait |

#### Partial Result Handling

If a timeout occurs mid-response:
1. Check if the partial output contains valid JSON entries
2. If yes, use the valid entries and note "partial results" in the report
3. If no, treat as a model failure and fall back

Never wait indefinitely. A review that completes in 3 minutes with Claude-only findings is better than one that blocks for 10 minutes waiting for an external model.

### Finding Reconciliation

When multiple models produce findings, reconciliation synthesizes them into a unified report.

#### Consensus Analysis

Compare findings across models to identify agreement and disagreement:

**Consensus** — Multiple models flag the same issue (possibly with different wording). High confidence in the finding. Use the most specific description.

**Single-source finding** — Only one model flags an issue. Lower confidence but still valuable. Include in the report with a note about which model found it.

**Disagreement** — One model flags an issue that another model explicitly considers correct. Requires manual analysis.

#### Reconciliation Process

1. **Normalize findings.** Map each model's findings to a common schema (severity, category, location, description).

2. **Match findings across models.** Two findings match if they reference the same location and describe the same underlying issue (even with different wording). Use location + category as the matching key.

3. **Score by consensus.**
   - Found by all models → confidence: high
   - Found by majority → confidence: medium
   - Found by one model → confidence: low (but still reported)

4. **Resolve severity disagreements.** When models disagree on severity:
   - If one says P0 and another says P1 → use P0 (err on the side of caution)
   - If one says P1 and another says P3 → investigate the specific finding before deciding
   - Document the disagreement in the synthesis report

5. **Merge descriptions.** When multiple models describe the same finding differently, combine their perspectives. Model A might identify the symptom while Model B identifies the root cause.

#### Disagreement Resolution

When models actively disagree (one flags an issue, another says the same thing is correct):

1. **Read both arguments.** Each model explains its reasoning. One may have a factual error.
2. **Check against source material.** Read the actual artifact and upstream docs. The correct answer is in the documents, not in model opinions.
3. **Default to the stricter interpretation.** If genuinely ambiguous, the finding stands at reduced severity (P1 → P2).
4. **Document the disagreement.** The reconciliation report should note: "Models disagreed on [topic]. Resolution: [decision and rationale]."

### Consensus Classification

When synthesizing multi-model findings, classify each finding:
- **Consensus**: All participating models flagged the same issue at similar severity → report at the agreed severity
- **Majority**: 2+ models agree, 1 dissents → report at the lower of the agreeing severities; note the dissent
- **Divergent**: Models disagree on severity or one model found an issue others missed → present to user for decision, minimum P2 severity
- **Unique**: Only one model raised the finding → include with attribution, flag as "single-model finding" for user review

### Output Format

#### Review Summary (review-summary.md)

```markdown
# Multi-Model Review Summary: [Artifact Name]

## Models Used
- Claude (primary reviewer)
- Codex (external, depth 4+) — [available/unavailable/timeout]
- Gemini (external, depth 5) — [available/unavailable/timeout]

## Consensus Findings
| # | Severity | Finding | Models | Confidence |
|---|----------|---------|--------|------------|
| 1 | P0 | [description] | Claude, Codex | High |
| 2 | P1 | [description] | Claude, Codex, Gemini | High |

## Single-Source Findings
| # | Severity | Finding | Source | Confidence |
|---|----------|---------|--------|------------|
| 3 | P1 | [description] | Gemini | Low |

## Disagreements
| # | Topic | Claude | Codex | Resolution |
|---|-------|--------|-------|------------|
| 4 | [topic] | P1 issue | No issue | [resolution rationale] |

## Reconciliation Notes
[Any significant observations about model agreement patterns, recurring themes,
or areas where external models provided unique value]
```

#### Raw JSON Preservation

Always preserve the raw JSON output from external models, even after reconciliation. The raw findings serve as an audit trail and enable re-analysis if the reconciliation logic is later improved.

```
docs/reviews/{artifact}/
  codex-review.json     — raw output from Codex
  gemini-review.json    — raw output from Gemini
  review-summary.md     — reconciled synthesis
```

### Quality Gates

Minimum standards for a multi-model review to be considered complete:

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| Minimum finding count | At least 3 findings across all models | A review with zero findings likely missed something |
| Coverage threshold | Every review pass has at least one finding or explicit "no issues found" note | Ensures all passes were actually executed |
| Reconciliation completeness | All cross-model disagreements have documented resolutions | No unresolved conflicts |
| Raw output preserved | JSON files exist for all models that were dispatched | Audit trail |

If the primary Claude review produces zero findings and external models are unavailable, the review should explicitly note this as unusual and recommend a targeted re-review at a later stage.

### Common Anti-Patterns

**Blind trust of external findings.** An external model flags an issue and the reviewer includes it without verification. External models hallucinate — they may flag a "missing section" that actually exists, or cite a "contradiction" based on a misread. Fix: every external finding must be verified against the actual artifact before inclusion in the final report.

**Ignoring disagreements.** Two models disagree, and the reviewer picks one without analysis. Fix: disagreements are the most valuable signal in multi-model review. They identify areas of genuine ambiguity or complexity. Always investigate and document the resolution.

**Dispatching at low depth.** Running external model reviews at depth 1-2 where the review scope is intentionally minimal. The external model does a full analysis anyway, producing findings that are out of scope. Fix: only dispatch at depth 4+. Lower depths use Claude-only review with reduced pass count.

**No fallback plan.** The review pipeline assumes external models are always available. When Codex is down, the review fails entirely. Fix: external dispatch is always optional. The fallback to Claude-only enhanced review must be implemented and tested.

**Over-weighting consensus.** Two models agree on a finding, so it must be correct. But both models may share the same bias (e.g., both flag a pattern as an anti-pattern that is actually appropriate for this project's constraints). Fix: consensus increases confidence but does not guarantee correctness. All findings still require artifact-level verification.

**Dispatching the full pipeline context.** Sending the entire project context (all docs, all code) to the external model. This exceeds context limits and dilutes focus. Fix: send only the artifact under review and the minimal upstream context needed for that specific review.

**Ignoring partial results.** A model times out after producing 3 of 5 findings. The reviewer discards all results because the review is "incomplete." Fix: partial results are still valuable. Include them with a note about incompleteness. Three real findings are better than zero.

---

## After This Step

Continue with: `/scaffold:apply-fixes-and-freeze`
