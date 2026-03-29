---
description: "Document architecture decisions as ADRs"
long-description: "Identify and document all significant architecture decisions. Each decision gets"
---

## Purpose
Identify and document all significant architecture decisions. Each decision gets
its own ADR with context, options considered, decision made, and consequences.
Technology selection (language, framework, database, infrastructure) is a key
ADR category — tech stack decisions are documented here.

## Inputs
- docs/domain-models/ (required) — domain structure driving architecture choices
- docs/plan.md (required) — requirements and constraints

## Expected Outputs
- docs/adrs/ — one ADR file per decision (ADR-NNN-title.md format)
- docs/adrs/index.md — decision log overview

## Quality Criteria
- (mvp) ADRs exist for: language, framework, database, ORM, deployment target, API style, authentication, and any decision referenced in system-architecture.md
- (deep) Each ADR documents alternatives considered with pros/cons
- (mvp) Decisions trace to PRD requirements or domain model constraints
- (mvp) No ADR contradicts another without explicit acknowledgment
- (deep) Technology selections include team expertise and maintenance considerations
- (deep) Decision dependencies documented — if ADR-002 depends on ADR-001's outcome, the dependency is explicit

## Methodology Scaling
- **deep**: Comprehensive ADR set. 3+ alternatives per decision with detailed
  evaluation. Risk assessment for each decision. Cross-references between
  related ADRs. Supersession tracking.
- **mvp**: Core technology choices only (language, framework, database, hosting).
  Brief rationale. Single-paragraph ADRs.
- **custom:depth(1-5)**: Depth 1-2: core tech choices. Depth 3: add pattern
  and integration decisions. Depth 4-5: full evaluation with risk assessment.

## Mode Detection
If docs/adrs/ exists, operate in update mode: review existing ADRs against
current domain models and requirements. Add new ADRs for undocumented decisions.
Supersede ADRs whose context has changed.

## Update Mode Specifics
- **Detect prior artifact**: docs/adrs/ directory exists with ADR files
- **Preserve**: existing ADR numbers and titles, accepted decisions and their
  rationale, supersession chain integrity, index.md decision log
- **Triggers for update**: domain models changed (new architectural decisions
  needed), requirements changed (existing decisions may need revisiting),
  implementation revealed unforeseen trade-offs
- **Conflict resolution**: never modify an accepted ADR — instead create a new
  ADR that supersedes it, linking back to the original with explanation of
  what changed

---

## Domain Knowledge

### adr-craft

*Writing effective architecture decision records including technology selection*

## Summary

## What Warrants an ADR

An Architecture Decision Record captures a decision that is architecturally significant — one that affects the system's structure, non-functional characteristics, dependencies, interfaces, or construction techniques. Not every decision needs an ADR. The litmus test: would a new team member need to know why this choice was made to work effectively?

### Categories That Always Warrant ADRs

**Technology selection decisions:**

- Programming language and runtime (Node.js vs. Python, JVM version)
- Framework selection (Next.js vs. Remix, FastAPI vs. Django, Express vs. Fastify)
- Database engine (PostgreSQL vs. SQLite vs. MongoDB, and why)
- ORM or data access layer (Prisma vs. Drizzle vs. raw SQL)
- Infrastructure and hosting (Vercel vs. AWS vs. self-hosted)
- Authentication provider (Auth0 vs. Clerk vs. custom)
- CI/CD platform (GitHub Actions vs. CircleCI)
- Dev tooling choices (linter, formatter, test runner, build tool)

Each technology choice should compare the top 2-3 realistic options, state the selection criteria weighted for the project, and document the winner with honest trade-offs.

**Architectural pattern decisions:**

- Monolith vs. microservices vs. modular monolith
- Layered architecture vs. hexagonal vs. event-driven
- Server-side rendering vs. client-side rendering vs. hybrid
- Synchronous communication vs. event-driven vs. mixed
- Caching strategy (when, where, what eviction policy)

**Data architecture decisions:**

- Normalization level and deliberate denormalizations
- Event sourcing vs. state-based persistence
- Read/write model separation (CQRS)
- Data migration strategy (rolling vs. downtime)
- Multi-tenancy approach (database per tenant, schema per tenant, row-level)

**Integration decisions:**

- API style (REST vs. GraphQL vs. gRPC)
- Authentication mechanism (JWT vs. session vs. API key)
- Third-party service selections (payment processor, email provider, CDN)
- Message broker selection (when async is chosen)

**Development process decisions:**

- Branching strategy (trunk-based, GitFlow, simplified flow)
- Testing strategy (what gets unit tests vs. integration vs. e2e)
- Deployment strategy (blue-green, canary, rolling)
- Monitoring approach (what to instrument, which platform)

### What Does NOT Warrant an ADR

- Code style preferences (tabs vs. spaces, semicolons) — use linter configuration
- Library utility choices (lodash vs. ramda for a single function) — too granular
- Implementation details within a bounded context (which sorting algorithm) — unless performance-critical
- Temporary decisions (experiment with X for a spike) — not architectural
- Decisions that have no realistic alternatives — if there's only one viable option, just use it

## Deep Guidance

## ADR Structure

### Title

Format: `ADR-NNN: <decision statement>`

The title should be a concise decision statement, not a question. It states what was decided.

- Good: `ADR-003: Use PostgreSQL for persistent storage`
- Good: `ADR-007: Adopt hexagonal architecture for core services`
- Bad: `ADR-003: Database selection` (not a decision)
- Bad: `ADR-007: Architecture discussion` (no decision recorded)

### Status

Every ADR has exactly one status:

- **Proposed** — Under consideration, not yet accepted. Include in the document but flag that implementation should not proceed based on this decision.
- **Accepted** — Active and binding. The team follows this decision.
- **Deprecated** — No longer relevant due to changing requirements. The decision was correct when made but circumstances changed. Link to what replaced it.
- **Superseded** — Replaced by a newer ADR. Always link to the superseding ADR: "Superseded by ADR-015."

### Context

Describe the forces at play. What problem are we solving? What constraints exist? What options are available?

The context section answers: why is this decision necessary right now?

**Good context includes:**

- The specific requirement or constraint driving the decision (link to PRD section or user story)
- Technical constraints (performance needs, team expertise, existing infrastructure)
- Business constraints (budget, timeline, compliance requirements)
- Assumptions being made (and their risk of being wrong)

**Anti-pattern: missing context.** An ADR that says "We chose React" without explaining what drove the decision is useless. When requirements change, nobody can evaluate whether this ADR should be revisited because nobody knows what forces shaped it.

### Decision

State the decision clearly and directly. "We will use PostgreSQL for all persistent storage in this application."

The decision should be:
- Unambiguous — one reasonable interpretation
- Actionable — someone can implement based on this statement
- Scoped — clear what this decision applies to and what it doesn't

### Consequences

Every decision has trade-offs. Document both the benefits and the costs honestly.

**Benefits:**

- What does this decision enable?
- What risks does it mitigate?
- What becomes simpler?

**Costs and risks:**

- What becomes harder or more complex?
- What options does this decision foreclose?
- What new risks does it introduce?
- What operational burden does it add?

**Anti-pattern: consequence-free decisions.** If an ADR lists only benefits with no costs, the analysis is incomplete. Every technology and pattern choice involves trade-offs. Honest cost documentation builds trust and helps future decision-makers.

### Alternatives Considered

For each rejected alternative, document:

- What the alternative was
- Why it was considered (what made it a realistic option)
- Why it was rejected (specific reasons, not "we prefer X")

**Anti-pattern: straw-man alternatives.** Listing alternatives that were never seriously considered (or that are obviously wrong) undermines the ADR's credibility. Only include alternatives that were genuinely viable.

## Evaluation Framework

### For Technology Decisions

When evaluating technology options (language, framework, database, infrastructure), assess against these criteria:

**Team and AI expertise** — For AI-built projects, prioritize technologies with extensive representation in training data. Well-documented, widely-adopted tools produce fewer hallucinations and bugs. Niche or bleeding-edge tools increase error rates.

**Fit with requirements** — Does the technology naturally support the features described in the PRD? A real-time collaboration app needs WebSocket support. A data-heavy analytics dashboard needs efficient query capabilities. Don't force a technology into a use case it wasn't designed for.

**Community and ecosystem** — Active maintenance, frequent releases, responsive issue tracking, rich plugin/extension ecosystem. Check: when was the last release? How many open issues? Is there a single maintainer (bus factor risk)?

**Integration complexity** — How well does this technology compose with the other choices in the stack? Technologies that require elaborate glue code or adapter layers add maintenance burden.

**Operational complexity** — What does this technology require to run in production? PostgreSQL needs backups, monitoring, and tuning. SQLite needs none of that. Match operational complexity to team capacity.

**License compatibility** — Verify the license permits your intended use (commercial, SaaS, redistribution). Watch for "source available" licenses masquerading as open source (SSPL, BSL).

**Long-term maintenance** — Is this technology likely to be maintained in 3-5 years? Check: backing company/foundation, contributor diversity, adoption trajectory (growing, stable, declining).

### Evaluation Matrix

For significant decisions, use a weighted evaluation matrix:

| Criterion | Weight | Option A | Option B | Option C |
|-----------|--------|----------|----------|----------|
| AI familiarity | 25% | 9 | 7 | 4 |
| Fit with requirements | 25% | 8 | 9 | 7 |
| Community/ecosystem | 15% | 9 | 8 | 6 |
| Integration complexity | 15% | 7 | 8 | 5 |
| Operational complexity | 10% | 6 | 8 | 9 |
| Long-term maintenance | 10% | 8 | 7 | 5 |
| **Weighted total** | | **8.05** | **7.90** | **5.80** |

Weights should reflect project priorities. An AI-built project weights AI familiarity higher. A startup weights speed-to-market higher. An enterprise weights long-term maintenance higher.

### For Architectural Decisions

Evaluate architectural patterns against:

- **Complexity vs. value** — Does the added complexity deliver proportional value? Microservices for a CRUD app with one developer is over-engineering. A monolith for a system with clearly independent scaling needs is under-engineering.
- **Reversibility** — How expensive is it to change this decision later? Prefer reversible decisions (can switch ORMs in a week) over irreversible ones (entire system depends on event sourcing). Invest more analysis time in irreversible decisions.
- **Alignment with domain model** — Does the architecture naturally express the domain? A modular monolith with modules matching bounded contexts aligns well. A layered architecture that spreads domain concepts across layers does not.
- **Operational readiness** — Can the team (or AI agents) actually operate this in production? A Kubernetes-based microservices deployment requires expertise that a single-developer team may lack.

## ADR Lifecycle

### When to Create

- Create ADRs before implementation, not after. The ADR guides the implementation, not the other way around.
- For technology decisions: create during the tech stack selection phase, before any code is written.
- For architectural decisions: create during the architecture phase, after domain modeling and before implementation planning.
- For emergent decisions: when implementation reveals that an assumption was wrong, create an ADR documenting the pivot before changing course.

### When to Supersede

- When a decision is reversed (different technology chosen, different pattern adopted), create a new ADR and mark the old one as superseded.
- The superseding ADR must reference the original and explain what changed to invalidate the original decision.
- Never delete a superseded ADR. The history of decisions is valuable context for understanding why things are the way they are.

### When to Deprecate

- When a decision becomes irrelevant (the feature it relates to was removed, the technology it selected was swapped out as part of a broader change), mark it as deprecated.
- Link to the change that made it irrelevant.

### Cross-Referencing

- Related ADRs should reference each other. "See also ADR-005 for the database migration strategy that supports this caching decision."
- ADRs should reference the PRD sections or requirements that motivated them.
- Implementation tasks should reference the ADRs that guide them. "Implements ADR-003: PostgreSQL persistent storage."

### Recording Implicit Decisions

Many architectural decisions are made implicitly — someone starts using a library, a pattern emerges from code review, a deployment approach is chosen during a sprint. These are still architectural decisions.

Periodically audit the codebase for implicit decisions:
- Dependencies added to package.json/requirements.txt without documented rationale
- Architectural patterns used consistently without a recorded decision
- Infrastructure configurations that embody decisions (environment variables, Docker configurations)
- Test patterns that imply testing strategy decisions

Create retroactive ADRs for implicit decisions that meet the significance threshold.

## Technology Selection as ADRs

Technology selection is one of the most impactful categories of architectural decisions. The v1 scaffold pipeline treated tech stack as a separate document; in the current architecture, each technology choice is an ADR.

### Structure for Tech Stack ADRs

Each technology ADR should cover:

**What the document must capture:**
- The specific library/framework and version
- Rationale tied to project requirements (not generic praise for the technology)
- Why alternatives were rejected (specific technical reasons)
- AI compatibility assessment: how well-represented in training data, known AI pitfalls

**Guiding principles for AI-built projects:**
- Convention over configuration — opinionated frameworks with clear patterns reduce AI errors
- Minimal dependency surface — fewer dependencies mean fewer version conflicts and security risks
- Strong typing and validation — static types catch AI mistakes at build time
- Mature ecosystem — stable, well-documented libraries with active maintenance

### Grouping Related Decisions

Technology decisions often cluster. Rather than 20 individual ADRs for each package, group related decisions:

- "Backend technology stack" (language + framework + ORM + auth library)
- "Frontend technology stack" (framework + state management + styling + build tool)
- "Database and data access" (engine + migration tool + caching layer)
- "Infrastructure and deployment" (hosting + CI/CD + monitoring)
- "Developer tooling" (linter + formatter + test runner + pre-commit hooks)

Each group ADR can cover multiple decisions if they are tightly coupled and were evaluated together.

## Example ADR

The following shows a complete ADR following the structure and quality guidelines above:

```markdown
# ADR-003: Use PostgreSQL for Persistent Storage

## Status
Accepted

## Context
The application (per PRD Section 2) manages financial transaction data with strict
consistency requirements, flexible metadata per transaction type, and projected volume
of 500K transactions/month within the first year. The team has strong SQL experience
and the project is AI-built, favoring well-documented technologies.

## Decision
We will use PostgreSQL 16 for all persistent storage in this application.

## Alternatives Considered

### SQLite
- **Why considered:** Zero operational overhead, embedded, excellent for small-to-medium
  read-heavy workloads.
- **Why rejected:** Single-writer limitation is incompatible with concurrent transaction
  processing. No built-in network access for multi-instance deployment.

### MongoDB
- **Why considered:** Flexible schema matches variable transaction metadata. Strong
  horizontal scaling story.
- **Why rejected:** Weaker ACID guarantees for multi-document transactions. Team has
  limited MongoDB experience. Less well-represented in AI training data than PostgreSQL,
  increasing hallucination risk for query patterns.

## Consequences

### Benefits
- JSONB columns provide flexible metadata storage without sacrificing relational integrity
- Strong ACID compliance for financial transaction consistency
- Most widely adopted open-source RDBMS — extensive AI training data coverage
- Rich ecosystem: pg_stat_statements for monitoring, pg_dump for backups, mature ORMs

### Costs and Risks
- Operational overhead: requires backup configuration, connection pooling, and monitoring
- JSONB queries are less performant than MongoDB's native document queries for deeply
  nested structures
- Schema migrations require planning for zero-downtime deployments
```

## Common Pitfalls

**Recording decisions without alternatives.** An ADR that says "We'll use React" without mentioning Vue or Svelte provides no insight into the decision process. When a new team member asks "why not Vue?", there's no answer. Fix: always document at least one alternative and why it was rejected.

**Missing rationale.** "We chose PostgreSQL" is a fact, not a decision record. The rationale — "because we need JSONB for flexible metadata, strong ACID compliance for financial data, and it's the most AI-familiar relational database" — is the valuable part. Fix: the context and consequences sections should be longer than the decision section.

**Contradicting other ADRs without acknowledgment.** ADR-003 says "minimize dependencies" but ADR-008 adds a heavy utility library. This isn't necessarily wrong — trade-offs are legitimate — but the contradiction must be acknowledged in ADR-008. Fix: cross-reference related ADRs and explicitly address conflicts.

**Failing to record implicit decisions.** The codebase uses a specific error handling pattern everywhere, but no ADR documents why. When a new agent builds a feature, it invents a different error handling pattern. Fix: audit for implicit decisions periodically.

**Technology hype bias.** Choosing a technology because it's trending rather than because it fits the requirements. "Let's use Rust for the API because it's fast" when the bottleneck is database queries, not CPU-bound computation. Fix: evaluate against project-specific criteria, not general popularity.

**Premature decisions.** Recording a decision before gathering sufficient context. Choosing a database engine before understanding the data model leads to decisions that constrain the design unnecessarily. Fix: defer decisions until the last responsible moment — when further delay would reduce options.

**Stale ADRs.** Accepted ADRs that no longer reflect reality because the codebase has evolved. The ADR says "modular monolith" but the system has been split into services. Fix: review ADRs periodically and update status (supersede, deprecate) as needed.

## Quality Indicators

An ADR set is likely complete when:

- **Every technology in the dependency manifest has a corresponding ADR.** No mystery dependencies.
- **Every ADR is traceable to a requirement or constraint.** No decisions exist in a vacuum.
- **Alternatives are genuinely considered.** Rejected alternatives have specific, defensible rejection reasons — not "we prefer X."
- **Consequences are honest.** Every ADR lists at least one downside or risk. A consequence-free ADR is incomplete.
- **No contradictions between ADRs.** Or, if contradictions exist, they are acknowledged and explained.
- **The ADR set covers all layers.** Backend, frontend (if applicable), database, infrastructure, developer tooling, deployment, testing, and security all have decisions recorded.
- **Status is current.** No accepted ADRs that actually describe how things used to work. Superseded and deprecated ADRs are marked.
- **Cross-references are complete.** Related ADRs link to each other. ADRs link to the requirements they address.

## See Also

- [tech-stack-selection](../core/tech-stack-selection.md) — Technology selection as ADRs

---

## After This Step

Continue with: `/scaffold:review-adrs`
