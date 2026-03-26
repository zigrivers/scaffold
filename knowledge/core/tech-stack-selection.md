---
name: tech-stack-selection
description: Framework evaluation methodology, decision matrices, and technology tradeoff analysis
topics: [tech-stack, framework-selection, decision-matrix, tradeoffs, scalability, ecosystem]
---

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
