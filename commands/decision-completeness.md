---
description: "Verify all decisions are recorded, justified, non-contradictory"
long-description: "Checks that every technology choice and architectural pattern has a recorded decision with rationale, and that no two decisions contradict each other."
---

## Purpose
Verify all decisions are recorded, justified, non-contradictory. Ensure every
significant architectural and technology decision has a corresponding ADR,
that no two ADRs contradict each other, and that all decisions have clear
rationale.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent decision audit — different models surface different implicit
decisions.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/decision-completeness.md — findings report
- docs/validation/decision-completeness/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/decision-completeness/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/decision-completeness/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Every technology choice in `docs/tech-stack.md` has a corresponding ADR
- (mvp) No two ADRs contradict each other
- (deep) Every ADR has alternatives-considered section with pros/cons
- (deep) Every ADR referenced in `docs/system-architecture.md` exists in `docs/adrs/`
- Findings categorized P0-P3 with specific file, section, and issue for each
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
- **custom:depth(1-5)**: Depth 1: verify each major tech choice has an ADR. Depth 2: add alternatives-considered check. Depth 3: full ADR completeness audit (rationale, consequences, status). Depth 4: add external model review of decision quality. Depth 5: multi-model reconciliation of decision coverage.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/decision-completeness/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/decision-completeness/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding

---

## Domain Knowledge

### decision-completeness

*Verifying all architectural decisions are recorded, justified, and non-contradictory*

# Decision Completeness

Decision completeness validation ensures that every architectural and design decision made during the pipeline has been explicitly recorded in an ADR, that no decisions contradict each other, and that no deferred decisions remain unresolved before implementation begins.

## Summary

- **Explicit decision extraction**: Walk every artifact and extract every technology choice, pattern selection, and constraint trade-off as a decision requiring an ADR.
- **Implied decision mining**: Find undocumented decisions via absence-based, convention-based, technology-stack, pattern-based, and assumption-based detection techniques.
- **ADR coverage verification**: Every decision needs an ADR with context, rationale, alternatives, consequences, and current status.
- **Contradiction detection**: Check cross-ADR, ADR-vs-artifact, and cross-artifact contradictions; group decisions by topic and compare for consistency.
- **Deferred decision resolution**: Search for TBD/TODO/pending markers; all must be resolved or documented as moot before implementation.
- **Categories checklist**: Infrastructure/platform, data, API/communication, frontend, quality, operations, and process decisions all need coverage.
- Prioritize missing ADRs by impact: critical (architecture, data, security), major (workflow, tooling), minor (conventions, formatting).

## Deep Guidance

## Why Decision Completeness Matters

Unrecorded decisions become tribal knowledge. When AI agents implement the system, they have no tribal knowledge — only documented decisions. Every implicit "we agreed that..." or "obviously we'd use..." that is not in an ADR is a gap that will cause agents to guess, and guesses introduce inconsistency.

## What to Check

### 1. Explicit Decision Extraction

Walk through every artifact and extract every explicit decision.

**Where explicit decisions live:**
- **ADRs** — The primary home. Each ADR records a decision, its context, and consequences.
- **Architecture document** — Technology choices, pattern selections, component organization.
- **Database schema** — Choice of database type, normalization level, indexing strategy.
- **API contracts** — Choice of API style (REST/GraphQL), versioning strategy, auth mechanism.
- **UX spec** — Framework choice, design system decisions, accessibility level target.
- **Task breakdown** — Sequencing decisions, parallelization choices.
- **Testing strategy** — Test framework, coverage targets, test environment setup.
- **Operations runbook** — Deployment strategy, CI/CD tool choice, monitoring approach.

**Process:**
1. Read each artifact sequentially.
2. For every statement that represents a choice between alternatives, extract it:
   - "We use PostgreSQL" — this is a decision.
   - "Authentication is handled via JWT tokens" — this is a decision.
   - "The frontend uses React" — this is a decision.
   - "We follow trunk-based development" — this is a decision.
3. Record the decision, the artifact it appears in, and whether it has a corresponding ADR.

### 2. Implied Decision Mining

Many decisions are implied rather than stated. These are harder to find but equally important.

**Techniques for finding implied decisions:**

**Absence-based detection** — Ask "what was NOT chosen?" If the architecture uses REST, there is an implied decision not to use GraphQL. If the schema uses PostgreSQL, there is an implied decision not to use MongoDB. Each such absence is a decision that may need an ADR.

**Convention-based detection** — When an artifact follows a specific pattern without justification, that is an implied decision. "All endpoints return JSON" — decided but not documented. "Errors follow RFC 7807" — decided but not documented.

**Technology-stack detection** — Extract the full technology stack from all artifacts. Each technology is a decision. Common technologies that often lack ADRs:
- Package manager (npm vs yarn vs pnpm)
- ORM or query builder
- Logging library
- Date/time library
- Validation library
- State management approach
- Test runner and assertion library
- CSS approach (modules, Tailwind, styled-components)
- Linter and formatter configuration

**Pattern-based detection** — Scan for phrases that indicate undocumented decisions:
- "We decided to..." (but no ADR exists)
- "The approach is..." (implies alternatives were considered)
- "For simplicity..." (implies a trade-off was made)
- "Following best practices..." (implies a specific practice was chosen)
- "Using the standard..." (implies a standard was selected)

**Assumption-based detection** — When one artifact assumes something about another, there may be an undocumented decision behind the assumption. "The API assumes eventual consistency for order status updates" — was that decided? By whom? What are the consequences?

### 3. ADR Coverage Verification

For every extracted decision (explicit and implied), verify:

1. **An ADR exists** — The decision is recorded in a numbered ADR document.
2. **The ADR has context** — Why was this decision needed? What problem was being solved?
3. **The ADR has rationale** — Why was this option chosen over alternatives?
4. **Alternatives were considered** — At least for significant decisions, alternatives should be listed.
5. **Consequences are documented** — What are the positive and negative consequences?
6. **Status is current** — The ADR status is "accepted" (not "proposed" or "deprecated" without a replacement).

### 4. Contradiction Detection

Contradictions occur when two decisions conflict. They are especially dangerous because each may be internally consistent — the conflict only appears when both are considered together.

**Where contradictions hide:**

**Cross-ADR contradictions** — Two ADRs make conflicting choices. Example: ADR-005 mandates "all inter-service communication via REST" and ADR-012 mandates "order events are published to a message queue." These may or may not contradict depending on whether the message queue counts as inter-service communication.

**ADR-vs-artifact contradictions** — An ADR mandates one approach, but an artifact implements a different one. Example: ADR-003 says "use bcrypt for password hashing" but the auth service implementation task references "argon2."

**Cross-artifact contradictions** — Two artifacts make different assumptions about the same thing. Example: API contracts define pagination with `page` and `pageSize` parameters, but the UX spec assumes cursor-based pagination with `after` tokens.

**Detection process:**
1. Group decisions by topic (database, authentication, API style, deployment, etc.).
2. Within each topic, compare all decisions for consistency.
3. For each pair of potentially conflicting decisions, determine:
   - Are they actually about the same thing?
   - Can both be true simultaneously?
   - If not, which takes precedence and why?

### 5. Deferred Decision Resolution

During earlier pipeline phases, some decisions may have been explicitly deferred with "we'll decide later" or "TBD" annotations. By validation time, these should be resolved.

**Process:**
1. Search all artifacts for deferred-decision indicators:
   - "TBD", "TODO", "to be decided", "to be determined"
   - "deferred", "will decide later", "pending decision"
   - "open question", "needs investigation", "spike needed"
   - Question marks in decision contexts ("PostgreSQL or MongoDB?")
2. For each deferred item, determine:
   - Has it been silently resolved in a later artifact? (If so, add the ADR.)
   - Is it still genuinely unresolved? (If so, it must be resolved before implementation.)
   - Was it rendered moot by another decision? (If so, document why.)

## Decision Categories Checklist

Use this checklist to verify that all common decision categories have been addressed:

### Infrastructure & Platform
- [ ] Cloud provider / hosting platform
- [ ] Programming language(s) and version(s)
- [ ] Runtime environment (Node.js version, Python version, etc.)
- [ ] Package manager
- [ ] Containerization approach (Docker, etc.)
- [ ] CI/CD pipeline tool

### Data
- [ ] Primary database type and product
- [ ] Caching strategy and product (if applicable)
- [ ] Search engine (if applicable)
- [ ] Message queue / event bus (if applicable)
- [ ] File/blob storage (if applicable)
- [ ] Data migration strategy

### API & Communication
- [ ] API style (REST, GraphQL, gRPC)
- [ ] API versioning strategy
- [ ] Authentication mechanism
- [ ] Authorization model
- [ ] Real-time communication (WebSockets, SSE, polling)

### Frontend (if applicable)
- [ ] Frontend framework
- [ ] State management approach
- [ ] CSS / styling approach
- [ ] Component library (build vs buy)
- [ ] Routing approach (client-side, server-side, hybrid)
- [ ] Build tool

### Quality
- [ ] Test framework(s) and runner(s)
- [ ] Coverage targets
- [ ] Linting and formatting tools
- [ ] Code review process
- [ ] Error tracking / monitoring tool

### Operations
- [ ] Deployment strategy (rolling, blue-green, canary)
- [ ] Environment management (staging, production)
- [ ] Logging approach and tool
- [ ] Monitoring and alerting tool
- [ ] Secret management approach
- [ ] Backup and disaster recovery

### Process
- [ ] Branching strategy (trunk-based, GitFlow, feature branches)
- [ ] Commit message format
- [ ] PR and merge strategy
- [ ] Release versioning scheme

## Output Format

### Decision Inventory

```markdown
| # | Decision | Source | ADR? | Status |
|---|----------|--------|------|--------|
| 1 | Use PostgreSQL 16 | Architecture doc §4.2 | ADR-007 | Covered |
| 2 | JWT for auth | API contracts §2.1 | ADR-003 | Covered |
| 3 | React 19 for frontend | UX spec §1.1 | MISSING | Needs ADR |
| 4 | Use pnpm | Task breakdown §setup | MISSING | Needs ADR |
| 5 | TBD: caching strategy | Architecture doc §5.3 | — | Unresolved |
| 6 | REST for all APIs | ADR-005 | ADR-005 | Contradicted by ADR-012 |
```

### Contradiction Report

```markdown
## Contradiction: API Communication Style

**Decision A:** ADR-005 — "All inter-service communication uses REST endpoints"
**Decision B:** ADR-012 — "Order state changes are published to a message queue for downstream consumers"

**Analysis:** These decisions conflict if message queue communication is considered inter-service communication. If ADR-005 intends only synchronous request-response, the contradiction is real.

**Recommended Resolution:** Amend ADR-005 to clarify scope: "Synchronous inter-service communication uses REST. Asynchronous event distribution uses the message queue per ADR-012."
```

### Deferred Decision Report

```markdown
## Unresolved: Caching Strategy

**Source:** Architecture document §5.3 — "Caching strategy TBD based on load testing results"
**Impact:** Without a caching decision, the operations runbook cannot define cache invalidation procedures, and the architecture cannot specify cache layers.
**Recommendation:** Make a provisional decision (e.g., Redis with read-through caching for frequently accessed entities) and record as an ADR. Note that it may be revisited after load testing.
```

## Prioritizing Findings

Not all missing ADRs are equally important. Prioritize by impact:

- **Critical** — Decisions that affect system architecture, data model, or security. Missing these leads to incompatible implementations.
- **Major** — Decisions that affect developer workflow, tooling, or operational procedures. Missing these leads to inconsistent practices.
- **Minor** — Decisions about conventions, formatting, or low-impact library choices. Missing these is annoying but not dangerous.

Focus resolution on critical and major findings. Minor findings can be resolved during implementation as they arise, as long as they are documented when made.

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
