---
name: implementability-review
description: Dry-running specs as an implementing agent to catch ambiguity and missing detail
topics: [validation, implementability, ambiguity, agent-readiness, dry-run]
---

# Implementability Review

An implementability review reads every specification as if you were an AI agent about to implement it. For each task, the question is: "Do I have everything I need to start coding right now?" Every question you would need to ask is a gap. Every ambiguity you would need to resolve is a defect. This is the most practical validation — it tests whether the specs actually work for their intended consumer.

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

For each task in the implementation plan:

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
