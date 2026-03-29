---
description: "Research and document tech stack decisions with rationale for each choice"
long-description: "Researches technology options for your project — language, framework, database, hosting, auth — evaluates each against your requirements, and documents every choice with rationale and alternatives considered."
---

## Purpose
Research frameworks, languages, databases, and tools that fit the PRD requirements,
then document every technology choice with rationale, alternatives considered, and
AI compatibility notes. This becomes the definitive technology reference that all
subsequent phases depend on for framework-specific decisions.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent technology research — different models have different knowledge
about ecosystem maturity, alternatives, and gotchas.

## Inputs
- docs/plan.md (required) — PRD features, integrations, and technical requirements
- User preferences (gathered via questions) — language, framework, deployment target, constraints

## Expected Outputs
- docs/tech-stack.md — complete technology reference with architecture overview,
  backend, database, frontend (if applicable), infrastructure, developer tooling,
  and third-party services sections, plus a Quick Reference dependency list
- docs/reviews/tech-stack/review-summary.md (depth 4+) — multi-model research synthesis
- docs/reviews/tech-stack/codex-review.json (depth 4+, if available) — raw Codex recommendations
- docs/reviews/tech-stack/gemini-review.json (depth 4+, if available) — raw Gemini recommendations

## Quality Criteria
- (mvp) Every PRD feature cross-referenced against the proposed stack (no capability gaps)
- (mvp) Each technology choice documents what, why, why not alternatives, and AI compatibility
- (mvp) Architecture pattern chosen and justified (monolith vs. microservices, MVC vs. clean, etc.)
- (mvp) No speculative technologies ("might need someday")
- (mvp) Every choice is a decision, not a menu of options
- (mvp) Quick Reference section lists every dependency with version
- (deep) Each technology choice documents AI compatibility assessment (training data availability, convention strength); total direct dependencies counted and justified
- (depth 4+) Multi-model recommendations synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Comprehensive research with competitive analysis for each category.
  Detailed AI compatibility notes per library. Version pinning with upgrade
  strategy. Infrastructure and DevOps recommendations. 10-15 pages. Multi-model
  research dispatched to Codex and Gemini if available, with graceful fallback
  to Claude-only enhanced research.
- **mvp**: Core stack decisions only (language, framework, database, test runner).
  Brief rationale. Quick Reference with versions. 2-3 pages.
- **custom:depth(1-5)**:
  - Depth 1: Core stack decisions only (language, framework, database). Brief rationale. 1 page.
  - Depth 2: Depth 1 + test runner choice and Quick Reference with versions. 2-3 pages.
  - Depth 3: Add infrastructure, tooling, and developer experience recommendations.
  - Depth 4: Add AI compatibility analysis + one external model research (if CLI available).
  - Depth 5: Full competitive analysis per category, upgrade strategy, + multi-model with cross-referencing.

## Mode Detection
Update mode if docs/tech-stack.md exists. In update mode: never change a
technology choice without user approval, preserve version pins exactly, update
Quick Reference to match any structural changes. If multi-model artifacts exist
under docs/reviews/tech-stack/, preserve prior recommendation dispositions.

## Update Mode Specifics
- **Detect prior artifact**: docs/tech-stack.md exists
- **Preserve**: all technology choices and their rationale, version pins,
  Quick Reference dependency list, multi-model review artifacts and dispositions
- **Triggers for update**: PRD requirements changed (new integrations needed),
  user requests technology swap, security vulnerability in a dependency,
  new PRD features require capabilities not covered by current stack
- **Conflict resolution**: if a new requirement conflicts with an existing
  technology choice, document the conflict and propose alternatives with
  migration cost — never silently swap a technology

---

## Domain Knowledge

### tech-stack-selection

*Framework evaluation methodology, decision matrices, and technology tradeoff analysis*

# Tech Stack Selection

Choosing a technology stack is one of the highest-leverage decisions in a project. A poor choice compounds into years of friction; a good choice becomes invisible. This knowledge covers systematic evaluation frameworks, decision matrices, and the discipline to separate signal from hype.

## Summary

### Selection Criteria Categories

Every technology choice should be evaluated across six dimensions:

1. **Ecosystem Maturity** — Package ecosystem breadth, stability of core libraries, frequency of breaking changes, quality of documentation, Stack Overflow answer density.
2. **Team Expertise** — Current team proficiency, hiring pool depth in your market, ramp-up time for new developers, availability of training resources.
3. **Performance Characteristics** — Throughput, latency, memory footprint, startup time, concurrency model. Match to your workload profile, not benchmarks.
4. **Community & Support** — GitHub activity, release cadence, corporate backing stability, conference presence, number of active maintainers.
5. **Licensing & Cost** — License type (MIT, Apache, BSL, SSPL), commercial support costs, cloud provider pricing, vendor lock-in implications.
6. **Integration Fit** — Compatibility with existing systems, deployment target constraints, team tooling preferences, CI/CD compatibility.

### Decision Matrix Concept

A decision matrix scores each candidate technology against weighted criteria. Weights reflect project priorities — a startup prototype weights "time to first feature" heavily; an enterprise migration weights "long-term support" heavily. The matrix does not make the decision — it structures the conversation and forces explicit tradeoff acknowledgment. Set weights before scoring begins to prevent post-hoc rationalization of a predetermined choice.

### When to Revisit

Stack decisions should be revisited when: the team composition changes significantly, a dependency reaches end-of-life, performance requirements shift by an order of magnitude, or the licensing model changes. Do not revisit because a new framework is trending.

### The Anti-Pattern Shortlist

The most common selection failures: **Resume-Driven Development** (choosing tech the team wants to learn, not what fits), **Hype-Driven Development** (choosing what is trending, not what is proven), **Ignoring Team Skills** (a 20% perf gain is not worth a 200% productivity loss during ramp-up), and **Premature Vendor Lock-In** (building on proprietary services without abstraction layers).

### Documentation Requirement

Every stack decision must produce a written record: what was chosen, what was rejected, why, and under what conditions the decision should be revisited. This lives in `docs/tech-stack.md` or as an Architecture Decision Record (ADR). Undocumented decisions get relitigated every quarter.

## Deep Guidance

### The Evaluation Framework

#### Step 1: Define Non-Negotiable Constraints

Before evaluating options, enumerate hard constraints that eliminate candidates outright:

- **Runtime environment**: Browser, Node, Deno, Bun, JVM, native binary, embedded
- **Deployment target**: Serverless, containers, bare metal, edge, mobile device
- **Compliance requirements**: HIPAA, SOC2, FedRAMP — some libraries/services are pre-approved
- **Existing commitments**: Must integrate with an existing PostgreSQL database, must deploy to AWS, must support IE11
- **Team size and tenure**: A 2-person team cannot maintain a microservices architecture in 4 languages

Hard constraints are binary. If a technology fails any constraint, it is eliminated regardless of how well it scores on other dimensions.

#### Step 2: Weight the Criteria

Assign weights (1-5) to each criterion based on project context:

| Criterion | Startup MVP | Enterprise Migration | Performance-Critical | Open Source Tool |
|-----------|-------------|---------------------|---------------------|-----------------|
| Ecosystem Maturity | 3 | 5 | 3 | 4 |
| Team Expertise | 5 | 4 | 3 | 2 |
| Performance | 2 | 3 | 5 | 3 |
| Community | 4 | 3 | 2 | 5 |
| Licensing | 2 | 5 | 2 | 5 |
| Integration Fit | 3 | 5 | 4 | 3 |

These weights are examples. The team must set them for their specific context before scoring begins — otherwise weights get adjusted post-hoc to justify a predetermined choice.

#### Step 3: Score and Compare

Score each candidate 1-5 per criterion. Multiply by weight. Sum. The highest score is not automatically the winner — it is the starting point for discussion.

```
| Criterion (weight)       | React (score) | Vue (score) | Svelte (score) |
|--------------------------|---------------|-------------|----------------|
| Ecosystem Maturity (5)   | 5 (25)        | 4 (20)      | 3 (15)         |
| Team Expertise (4)       | 5 (20)        | 2 (8)       | 1 (4)          |
| Performance (3)          | 3 (9)         | 3 (9)       | 5 (15)         |
| Community (3)            | 5 (15)        | 4 (12)      | 3 (9)          |
| Licensing (2)            | 5 (10)        | 5 (10)      | 5 (10)         |
| Integration Fit (4)      | 4 (16)        | 4 (16)      | 3 (12)         |
| **Total**                | **95**        | **75**       | **65**         |
```

The matrix reveals where tradeoffs concentrate. In this example, Svelte wins on performance but loses on ecosystem and team expertise. The conversation is now: "Is the performance gain worth the ramp-up cost and ecosystem risk?"

### Category-Specific Evaluation

#### Frontend Frameworks

Key discriminators: bundle size, SSR support, routing model, state management ecosystem, TypeScript support quality, component library availability, build tooling maturity.

**React**: Largest ecosystem, most hiring options, most third-party libraries. Risk: meta-framework churn (Next.js vs Remix vs others). Best when: team knows React, project needs rich component library ecosystem.

**Vue**: Batteries-included official ecosystem (Vue Router, Pinia, Vite). Gentler learning curve. Smaller hiring pool in US/UK, larger in Asia-Pacific. Best when: team is learning frontend, project benefits from cohesive tooling.

**Svelte/SvelteKit**: Best runtime performance, smallest bundles, compiler-based approach. Smaller ecosystem, fewer battle-tested libraries. Best when: performance is critical, team is small and adaptable.

#### Backend Frameworks

Key discriminators: request throughput, cold start time, ORM/database tooling, middleware ecosystem, deployment model compatibility, type safety.

**Node.js (Express/Fastify/Hono)**: Same language as frontend, huge npm ecosystem, excellent serverless support. Risk: callback/async complexity at scale, single-threaded CPU bottlenecks. Best when: team is JavaScript-native, workload is I/O-bound.

**Python (FastAPI/Django)**: Strong ML/data ecosystem, excellent type hints (FastAPI), batteries-included admin (Django). Risk: GIL for CPU-bound work, slower raw throughput. Best when: project involves data processing/ML, team is Python-native.

**Go**: Excellent concurrency, fast compilation, small binaries, low memory footprint. Risk: verbose error handling, less expressive type system, smaller web framework ecosystem. Best when: high-concurrency services, CLI tools, infrastructure software.

#### Database Selection

Key discriminators: data model fit, query patterns, scalability model, operational complexity, backup/restore tooling, managed service availability.

**PostgreSQL**: Default choice for relational data. JSON support bridges document needs. Extensions ecosystem (PostGIS, pgvector, TimescaleDB). Risk: horizontal scaling requires careful planning. Best when: data is relational, you need ACID guarantees, you want one database.

**SQLite**: Zero-ops, embedded, surprisingly capable for read-heavy workloads. Litestream for replication. Risk: single-writer limitation, no built-in network access. Best when: single-server deployment, edge/embedded, development/testing.

**MongoDB**: True document model, flexible schema, built-in horizontal scaling. Risk: no joins (denormalization complexity), eventual consistency by default. Best when: data is genuinely document-shaped, schema evolves rapidly, write-heavy workload.

#### Infrastructure & Deployment

Key discriminators: operational burden, cost model, scaling characteristics, vendor lock-in degree, team DevOps expertise.

**Serverless (Lambda/Cloud Functions)**: Zero idle cost, automatic scaling, no server management. Risk: cold starts, vendor lock-in, debugging complexity, execution time limits. Best when: unpredictable traffic, many small functions, cost-sensitive.

**Containers (ECS/Cloud Run/Fly.io)**: Portable, predictable performance, good local development parity. Risk: orchestration complexity (if self-managed), persistent storage challenges. Best when: consistent workloads, need local dev parity, multi-cloud possible.

**PaaS (Railway/Render/Vercel)**: Fastest time to deploy, managed everything. Risk: cost at scale, limited customization, vendor-specific features. Best when: small team, prototype/MVP, standard web application architecture.

### Common Anti-Patterns

#### Resume-Driven Development

**Pattern**: Choosing technologies because the team wants to learn them, not because they fit the project.
**Signal**: "Let's use Kubernetes" for a single-server app. "Let's rewrite in Rust" for a CRUD API.
**Mitigation**: The decision matrix forces explicit scoring. If a technology wins only on "fun to learn," the matrix will show it.

#### Hype-Driven Development

**Pattern**: Choosing technologies because they are trending on Hacker News or have impressive benchmarks.
**Signal**: Citing benchmarks without mapping them to actual workload characteristics. "X is 10x faster than Y" without asking "do we need that speed?"
**Mitigation**: Require a concrete performance requirement before performance can be weighted heavily.

#### Ignoring Team Skills

**Pattern**: Choosing the "best" technology without accounting for team proficiency.
**Signal**: Picking Go for a team of Python developers because "Go is faster." The 6-month ramp-up and initial low-quality Go code will cost more than Python's slower runtime.
**Mitigation**: Weight team expertise appropriately. A 20% performance gain is rarely worth a 200% productivity loss during ramp-up.

#### Premature Vendor Lock-In

**Pattern**: Building on vendor-specific services without an abstraction layer, making migration prohibitively expensive.
**Signal**: Direct use of DynamoDB-specific APIs throughout business logic. Lambda-specific handler signatures in core code.
**Mitigation**: Score "portability" as part of integration fit. Use repository/adapter patterns for external services.

### Migration Cost Assessment

When evaluating a technology change mid-project, assess migration cost across five dimensions:

1. **Code rewrite volume** — What percentage of the codebase must change? API boundaries, data models, business logic, or just infrastructure wrappers?
2. **Data migration complexity** — Schema changes, data transformation, downtime requirements, rollback capability.
3. **Team retraining** — How long until the team is productive in the new technology? Count weeks, not days.
4. **Integration surface** — How many external systems connect to the component being replaced? Each integration point is a migration risk.
5. **Rollback plan** — Can you run old and new in parallel? Can you revert if the migration fails? If not, the risk multiplier is high.

A migration is justified when: the current technology is end-of-life, the current technology cannot meet a hard requirement, or the migration cost is less than the ongoing maintenance cost of staying.

### Vendor Lock-In Evaluation

Rate lock-in risk on a scale:

| Level | Description | Example | Exit Cost |
|-------|-------------|---------|-----------|
| **None** | Standard interface, multiple providers | PostgreSQL, S3-compatible storage | Low |
| **Low** | Portable with adapter work | Redis (managed vs self-hosted) | Medium |
| **Medium** | Significant API surface to abstract | Firebase Auth, Stripe Billing | High |
| **High** | Deep integration, no portable equivalent | DynamoDB single-table design, Vercel Edge Config | Very High |
| **Total** | No alternative exists | Apple Push Notifications, platform-specific APIs | Impossible |

For each dependency, document the lock-in level in `docs/tech-stack.md`. When lock-in is Medium or higher, require an abstraction layer (repository pattern, adapter interface) that isolates vendor-specific code.

### Decision Record Template

Every technology decision should produce a record:

```markdown
## Decision: [Technology Choice]

**Date**: YYYY-MM-DD
**Status**: Accepted | Superseded by [link]
**Deciders**: [Names]

### Context
What problem are we solving? What constraints exist?

### Options Considered
1. **[Option A]** — Brief description. Pros: ... Cons: ...
2. **[Option B]** — Brief description. Pros: ... Cons: ...
3. **[Option C]** — Brief description. Pros: ... Cons: ...

### Decision
We chose [Option X] because [primary reasons].

### Consequences
- Positive: [what we gain]
- Negative: [what we accept as tradeoffs]
- Neutral: [what doesn't change]

### Revisit Conditions
Revisit this decision if: [specific, measurable conditions]
```

This record prevents "nobody remembers why we chose X" six months later. It also prevents relitigating decisions without new information — if the conditions for revisiting haven't changed, the decision stands.

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

Continue with: `/scaffold:coding-standards`, `/scaffold:project-structure`
