---
description: "Review operations runbook for completeness and safety"
long-description: "Verifies the full deployment lifecycle is documented, monitoring covers latency/errors/saturation, alert thresholds have rationale, and common failure scenarios have runbook entries."
---

## Purpose
Review operations runbook targeting operations-specific failure modes: deployment
strategy gaps, missing rollback procedures, monitoring blind spots, unjustified
alerting thresholds, missing runbook scenarios, and DR coverage gaps.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent review validation.

## Inputs
- docs/operations-runbook.md (required) — runbook to review
- docs/system-architecture.md (required) — for deployment coverage

## Expected Outputs
- docs/reviews/review-operations.md — findings and resolution log
- docs/operations-runbook.md — updated with fixes
- docs/reviews/operations/review-summary.md (depth 4+) — multi-model review synthesis
- docs/reviews/operations/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/reviews/operations/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Deployment lifecycle fully documented (deploy, verify, rollback)
- (mvp) Monitoring verified against minimum set: latency, error rate, and saturation
- (deep) Alert thresholds have rationale
- (deep) Common failure scenarios have runbook entries
- (mvp) At least production environment operations documented
- (deep) Dev/staging/production environment differences documented in operations runbook
- (deep) Each health check endpoint specifies expected status code, response time SLA, failure thresholds
- (mvp) Every finding categorized P0-P3 (P0 = Breaks downstream work. P1 = Prevents quality milestone. P2 = Known tech debt. P3 = Polish.) with specific runbook section, metric, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to operations-runbook.md and re-validated
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain before security step proceeds
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Full multi-pass review. Multi-model review dispatched to Codex and
  Gemini if available, with graceful fallback to Claude-only enhanced review.
- **mvp**: Deployment coverage only.
- **custom:depth(1-5)**:
  - Depth 1: Monitoring and logging pass only (1 review pass)
  - Depth 2: Add deployment and rollback pass (2 review passes)
  - Depth 3: Add incident response and scaling passes (4 review passes)
  - Depth 4: Add external model review (4 review passes + external dispatch)
  - Depth 5: Multi-model review with reconciliation (4 review passes + multi-model synthesis)

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/operations/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-operations.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate

---

## Domain Knowledge

### review-methodology

*Shared process for conducting multi-pass reviews of documentation artifacts*

# Review Methodology

This document defines the shared process for reviewing pipeline artifacts. It covers HOW to review, not WHAT to check — each artifact type has its own review knowledge base document with domain-specific passes and failure modes. Every review phase (1a through 10a) follows this process.

## Summary

- **Multi-pass review**: Each pass has a single focus (coverage, consistency, structure, downstream readiness). Passes are ordered broadest-to-most-specific.
- **Finding severity**: P0 blocks next phase (must fix), P1 is a significant gap (should fix), P2 is an improvement opportunity (fix if time permits), P3 is nice-to-have (skip).
- **Fix planning**: Group findings by root cause, same section, and same severity. Fix all P0s first, then P1s. Never fix ad hoc.
- **Re-validation**: After applying fixes, re-run the specific passes that produced the findings. Stop when no new P0/P1 findings appear.
- **Downstream readiness gate**: Final check verifies the next phase can proceed with these artifacts. Outcomes: pass, conditional pass, or fail.
- **Review report**: Structured output with executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Deep Guidance

## Multi-Pass Review Structure

### Why Multiple Passes

A single read-through catches surface errors but misses structural problems. The human tendency (and the AI tendency) is to get anchored on the first issue found and lose track of the broader picture. Multi-pass review forces systematic coverage by constraining each pass to one failure mode category.

Each pass has a single focus: coverage, consistency, structural integrity, or downstream readiness. The reviewer re-reads the artifact with fresh eyes each time, looking for one thing. This is slower than a single pass but catches 3-5x more issues in practice.

### Pass Ordering

Order passes from broadest to most specific:

1. **Coverage passes first** — Is everything present that should be? Missing content is the highest-impact failure mode because it means entire aspects of the system are unspecified. Coverage gaps compound downstream: a missing domain in the domain modeling step means missing ADRs in the decisions step, missing components in the architecture step, missing tables in the specification step, and so on.

2. **Consistency passes second** — Does everything agree with itself and with upstream artifacts? Inconsistencies are the second-highest-impact failure because they create ambiguity for implementing agents. When two documents disagree, the agent guesses — and guesses wrong.

3. **Structural integrity passes third** — Is the artifact well-formed? Are relationships explicit? Are boundaries clean? Structural issues cause implementation friction: circular dependencies, unclear ownership, ambiguous boundaries.

4. **Downstream readiness last** — Can the next phase proceed? This pass validates that the artifact provides everything its consumers need. It is the gate that determines whether to proceed or iterate.

### Pass Execution

For each pass:

1. State the pass name and what you are looking for
2. Re-read the entire artifact (or the relevant sections) with only that lens
3. Record every finding, even if minor — categorize later
4. Do not fix anything during a pass — record only
5. After completing all findings for this pass, move to the next pass

Do not combine passes. The discipline of single-focus reading is the mechanism that catches issues a general-purpose review misses.

## Finding Categorization

Every finding gets a severity level. Severity determines whether the finding blocks progress or gets deferred.

### P0: Blocks Next Phase

The artifact cannot be consumed by the next pipeline phase in its current state. The next phase would produce incorrect output or be unable to proceed.

**Examples:**
- A domain entity referenced by three other models is completely undefined
- An ADR contradicts another ADR with no acknowledgment, and the architecture depends on both
- A database schema is missing tables for an entire bounded context
- An API endpoint references a data type that does not exist in any domain model

**Action:** Must fix before proceeding. No exceptions.

### P1: Significant Gap

The artifact is usable but has a meaningful gap that will cause rework downstream. The next phase can proceed but will need to make assumptions that may be wrong.

**Examples:**
- An aggregate is missing one invariant that affects validation logic
- An ADR lists alternatives but does not evaluate them
- A data flow diagram omits error paths
- An API endpoint is missing error response definitions

**Action:** Should fix before proceeding. Fix unless the cost of fixing now significantly exceeds the cost of fixing during the downstream phase (rare).

### P2: Improvement Opportunity

The artifact is correct and usable but could be clearer, more precise, or better organized. The next phase can proceed without issue.

**Examples:**
- A domain model uses informal language where a precise definition would help
- An ADR's consequences section is vague but the decision is clear
- A diagram uses inconsistent notation but the meaning is unambiguous
- An API contract could benefit from more examples

**Action:** Fix if time permits. Log for future improvement.

### P3: Nice-to-Have

Stylistic, formatting, or polish issues. No impact on correctness or downstream consumption.

**Examples:**
- Inconsistent heading capitalization
- A diagram could be reformatted for readability
- A section could be reordered for flow
- Minor wording improvements

**Action:** Fix during finalization phase if at all. Do not spend review time on these.

## Fix Planning

After all passes are complete and findings are categorized, create a fix plan before making any changes. Ad hoc fixing (fixing issues as you find them) risks:

- Introducing new issues while fixing old ones
- Fixing a symptom instead of a root cause (two findings may share one fix)
- Spending time on P2/P3 issues before P0/P1 are resolved

### Grouping Findings

Group related findings into fix batches:

1. **Same root cause** — Multiple findings that stem from a single missing concept, incorrect assumption, or structural issue. Fix the root cause once.
2. **Same section** — Findings in the same part of the artifact that can be addressed in a single editing pass.
3. **Same severity** — Process all P0s first, then P1s. Do not interleave.

### Prioritizing by Downstream Impact

Within the same severity level, prioritize fixes that have the most downstream impact:

- Fixes that affect multiple downstream phases rank higher than single-phase impacts
- Fixes that change structure (adding entities, changing boundaries) rank higher than fixes that change details (clarifying descriptions, adding examples)
- Fixes to artifacts consumed by many later phases rank higher (domain models affect everything; API contracts affect fewer phases)

### Fix Plan Format

```markdown
## Fix Plan

### Batch 1: [Root cause or theme] (P0)
- Finding 1.1: [description]
- Finding 1.3: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 2: [Root cause or theme] (P0)
- Finding 2.1: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 3: [Root cause or theme] (P1)
...
```

## Re-Validation

After applying all fixes in a batch, re-run the specific passes that produced the findings in that batch. This is not optional — fixes routinely introduce new issues.

### What to Check

1. The original findings are resolved (the specific issues no longer exist)
2. The fix did not break anything checked by the same pass (re-read the full pass scope, not just the fixed section)
3. The fix did not introduce inconsistencies with other parts of the artifact (quick consistency check)

### When to Stop

Re-validation is complete when:
- All P0 and P1 findings are resolved
- Re-validation produced no new P0 or P1 findings
- Any new P2/P3 findings are logged but do not block progress

If re-validation produces new P0/P1 findings, create a new fix batch and repeat. If this cycle repeats more than twice, the artifact likely has a structural problem that requires rethinking a section rather than patching individual issues.

## Downstream Readiness Gate

The final check in every review: can the next phase proceed with these artifacts?

### How to Evaluate

1. Read the meta-prompt for the next phase — what inputs does it require?
2. For each required input, verify the current artifact provides it with sufficient detail and clarity
3. For each quality criterion in the next phase's meta-prompt, verify the current artifact supports it
4. Identify any questions the next phase's author would need to ask — each question is a gap

### Gate Outcomes

- **Pass** — The next phase can proceed. All required information is present and unambiguous.
- **Conditional pass** — The next phase can proceed but should be aware of specific limitations or assumptions. Document these as handoff notes.
- **Fail** — The next phase cannot produce correct output. Specific gaps must be addressed first.

A conditional pass is the most common outcome. Document the conditions clearly so the next phase knows what assumptions it is inheriting.

## Review Report Format

Every review produces a structured report. This format ensures consistency across all review phases and makes it possible to track review quality over time.

```markdown
# Review Report: [Artifact Name]

## Executive Summary
[2-3 sentences: overall artifact quality, number of findings by severity,
whether downstream gate passed]

## Findings by Pass

### Pass N: [Pass Name]
| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | P0 | [description] | [section/line] |
| 2 | P1 | [description] | [section/line] |

### Pass N+1: [Pass Name]
...

## Fix Plan
[Grouped fix batches as described above]

## Fix Log
| Batch | Findings Addressed | Changes Made | New Issues |
|-------|-------------------|--------------|------------|
| 1 | 1.1, 1.3 | [summary] | None |
| 2 | 2.1 | [summary] | 2.1a (P2) |

## Re-Validation Results
[Which passes were re-run, what was found]

## Downstream Readiness Assessment
- **Gate result:** Pass | Conditional Pass | Fail
- **Handoff notes:** [specific items the next phase should be aware of]
- **Remaining P2/P3 items:** [count and brief summary, for future reference]
```

---

### review-operations

*Failure modes and review passes specific to operations and deployment runbook artifacts*

# Review: Operations & Deployment

The operations runbook defines how the system is deployed, monitored, and maintained in production. It must cover the full deployment lifecycle, provide runbook procedures for common failure scenarios, and ensure the development environment reasonably mirrors production. This review uses 7 passes targeting the specific ways operations documentation fails.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Deployment Strategy Completeness**: Full deploy lifecycle documented from merged PR to running production, including build, test, stage, deploy, verify, and rollback stages.
- **Pass 2 — Rollback Procedures**: Every deployment type has a corresponding rollback procedure; database rollbacks addressed separately from code rollbacks.
- **Pass 3 — Monitoring Coverage**: Infrastructure, application, and business metrics identified with dashboards defined for all critical system components.
- **Pass 4 — Alerting Thresholds**: Alerts have justified thresholds based on baselines, severity levels map to response expectations, and alert fatigue is considered.
- **Pass 5 — Runbook Scenarios**: Common failure scenarios have step-by-step runbook entries covering symptoms, diagnosis, resolution, verification, and escalation.
- **Pass 6 — Dev Environment Parity**: Local development environment reasonably matches production behavior; documented deviations with implications.
- **Pass 7 — DR/Backup Coverage**: Disaster recovery approach documented with RTO/RPO targets; backup strategy covers all persistent data stores.

## Deep Guidance

---

## Pass 1: Deployment Strategy Completeness

### What to Check

The full deploy lifecycle is documented: how code gets from a merged PR to running in production. Build, test, stage, deploy, verify, and rollback stages are all covered.

### Why This Matters

An incomplete deployment strategy means the team is one configuration error away from a production outage with no recovery plan. Every gap in the deployment pipeline is a place where a deployment can fail silently — code that passes CI but is never actually deployed, deployments that succeed but skip health checks, environments that drift from the documented configuration.

### How to Check

1. Trace the deployment pipeline from commit to production: build step, test step, staging deployment, production deployment, post-deploy verification
2. Verify each stage has a clear trigger (manual, automatic), success criteria, and failure behavior
3. Check for environment progression: does code move through dev -> staging -> production? Can environments be skipped?
4. Verify that deployment artifacts are specified: Docker images, serverless packages, compiled binaries — what gets deployed?
5. Check for blue-green or canary deployment patterns if mentioned in ADRs — are they fully designed or just named?
6. Verify that deployment credentials, access controls, and approval requirements are documented (who can deploy, who can approve)
7. Check for database migration integration: when do migrations run relative to code deployment?

### What a Finding Looks Like

- P0: "Deployment pipeline shows build -> test -> production with no staging environment. There is no way to verify a deployment before it reaches production."
- P1: "Database migrations are not mentioned in the deployment pipeline. When do migrations run? Before or after the new code deploys? What happens if a migration fails mid-deploy?"
- P1: "Post-deploy verification is missing. After deployment, how is the team notified that the new version is healthy? No health check, no smoke test, no monitoring check."
- P2: "Deployment approvals are not specified. Can any developer deploy to production, or is approval required?"

---

## Pass 2: Rollback Procedures

### What to Check

Every deployment type has a corresponding rollback procedure. Rollback is tested (or at least testable), not just documented. Database rollbacks are addressed separately from code rollbacks.

### Why This Matters

Rollback is the emergency brake. When a deployment causes a production incident, the first response is to roll back. If the rollback procedure is untested, incomplete, or does not exist, the team is stuck debugging a production issue under pressure instead of reverting to a known-good state. Database rollbacks are especially critical — code can be swapped instantly, but data changes cannot.

### How to Check

1. For each deployment type (code deploy, database migration, configuration change, infrastructure change), verify a rollback procedure exists
2. Check that code rollback specifies the mechanism: redeploy previous version, revert container tag, infrastructure-as-code rollback
3. Check that database rollback addresses: can migrations be reversed? What about data migrations (not just schema)?
4. Verify rollback has a time estimate: how long does a rollback take?
5. Check for rollback testing: is the rollback procedure tested periodically, or only discovered during an incident?
6. Verify that partial deployment rollback is addressed: what if only 2 of 5 services deployed before the failure?
7. Check for data consistency during rollback: if the new code wrote data in a new format, does the old code handle it?

### What a Finding Looks Like

- P0: "No rollback procedure exists. If a deployment causes a production issue, the team has no documented way to revert."
- P0: "Database migration rollback says 'reverse the migration' but the migration drops a column. Column data is lost — rollback is impossible without a backup."
- P1: "Code rollback procedure exists but does not address database schema compatibility. Rolling back code to version N-1 while the database is at schema version N will cause errors."
- P2: "Rollback time estimate is missing. The team does not know whether rollback takes 30 seconds or 30 minutes."

---

## Pass 3: Monitoring Coverage

### What to Check

All critical system metrics are identified, dashboards are defined, and monitoring covers infrastructure, application, and business metrics.

### Why This Matters

Without monitoring, production issues are discovered by users, not by the team. The time between "something breaks" and "the team knows about it" determines the blast radius of every incident. Monitoring must cover three layers: infrastructure (servers, containers, network), application (response times, error rates, throughput), and business (transaction volume, conversion rates, revenue).

### How to Check

1. Verify infrastructure metrics are specified: CPU, memory, disk, network, container health
2. Verify application metrics are specified: request rate, error rate, response time (p50, p95, p99), active connections
3. Check for business metrics: transaction volume, user signups, conversion rates — metrics that indicate the system is functioning correctly from a business perspective
4. Verify that every component from the architecture has at least one monitored metric
5. Check for dependency monitoring: are external services (databases, third-party APIs, message queues) monitored for availability and latency?
6. Verify that monitoring covers error categorization: not just "errors happened" but "what type of errors" (4xx vs. 5xx, timeout vs. validation)
7. Check for dashboard specifications: what dashboards exist, what do they show, who uses them?

### What a Finding Looks Like

- P0: "No application-level metrics are defined. The operations runbook mentions 'monitoring' but does not specify what is monitored."
- P1: "Infrastructure metrics (CPU, memory) are monitored but application error rates are not. A bug causing 100% 500 errors would not trigger an alert."
- P1: "External database monitoring is not mentioned. If the database becomes slow or unavailable, the monitoring system will not detect it until application health checks fail."
- P2: "Business metrics (order volume, revenue) are not monitored. The system could be returning empty results for all product queries without triggering any alert."

---

## Pass 4: Alerting Thresholds

### What to Check

Alerts have justified thresholds (not arbitrary values). Alert severity levels map to response expectations. Alert fatigue is considered — not everything is a page.

### Why This Matters

Arbitrary thresholds cause two problems. Thresholds too low create alert storms — the on-call engineer gets paged for normal traffic spikes and learns to ignore alerts. Thresholds too high mean real incidents go undetected. Justified thresholds based on baseline behavior and business impact ensure alerts are both actionable and timely.

### How to Check

1. For each alert, check that the threshold has a rationale: why this number? Based on baseline data, SLA requirements, or capacity limits?
2. Verify alert severity levels are defined: page (wake someone up), warn (investigate next business day), info (log for review)
3. Check that page-level alerts are reserved for conditions that affect users or revenue — not internal metrics that can wait
4. Verify de-duplication and grouping: if a server flaps, does it generate one alert or hundreds?
5. Check for missing alerts: are there monitored metrics that have no corresponding alert? (Monitoring without alerting means no one is watching the dashboard)
6. Verify alert routing: who gets which alerts? Is the on-call rotation documented?
7. Check for alert testing: are alerts tested (fire a synthetic failure and verify the alert triggers)?

### What a Finding Looks Like

- P0: "Error rate alert threshold is 'greater than 0' — any single error triggers a page. This will cause alert fatigue within the first day of production."
- P1: "CPU usage alert threshold is 80% with no justification. Is 80% normal during peak traffic? Is 60% already a problem? The threshold needs to be based on baseline behavior."
- P1: "Alerts exist but no on-call rotation or escalation path is documented. When an alert fires at 3 AM, who receives it?"
- P2: "Alert for disk usage exists but no alert for disk growth rate. A slow disk leak will only trigger when the disk is nearly full, leaving little time to respond."

---

## Pass 5: Runbook Scenarios

### What to Check

Common failure scenarios have runbook entries with step-by-step resolution procedures. Scenarios cover the failures most likely to occur and most impactful when they do.

### Why This Matters

During an incident, the on-call engineer is under stress, possibly working at 3 AM, and possibly unfamiliar with the subsystem that failed. A runbook provides step-by-step guidance so they do not need to debug from first principles. Missing runbook scenarios mean the engineer improvises under pressure — increasing resolution time and risk of making things worse.

### How to Check

1. List the most likely failure scenarios: database connection loss, external API outage, out-of-memory, certificate expiration, disk full, deployment failure, high latency
2. For each scenario, verify a runbook entry exists
3. Check that each runbook entry includes: symptoms (how to recognize this failure), diagnosis steps (how to confirm the root cause), resolution steps (how to fix it), verification (how to confirm it is fixed), post-mortem (what to document after the incident)
4. Verify that runbook steps are specific and actionable: "check the logs" is too vague; "run `kubectl logs deployment/order-service -n production --tail=100` and look for `ConnectionRefused` errors" is actionable
5. Check for escalation paths: when should the on-call engineer escalate to a senior engineer or the team lead?
6. Verify that runbook entries reference the correct tools, dashboards, and access paths

### What a Finding Looks Like

- P0: "No runbook entries exist. The operations runbook discusses monitoring and alerting but provides no incident response procedures."
- P1: "Database connection failure runbook says 'restart the database connection pool.' How? What command? What service? What if it does not recover after restart?"
- P2: "Runbook entries exist for infrastructure failures but not for application-level failures (e.g., a bug causing 500 errors on a specific endpoint)."

---

## Pass 6: Dev Environment Parity

### What to Check

The local development environment reasonably matches production. Developers can run the full system locally with realistic behavior. Environment differences are documented.

### Why This Matters

When the development environment diverges from production, "works on my machine" becomes the default. Bugs that only appear in production are impossible to reproduce locally, increasing debugging time from hours to days. Dev environment parity is not about identical hardware — it is about identical behavior for application-level concerns.

### How to Check

1. Compare the dev environment stack to production: same database engine? Same message queue? Same cache? Same auth provider?
2. Check for documented deviations: if production uses AWS SQS but dev uses a local queue, is this documented with its implications?
3. Verify that local setup instructions exist and are complete: can a new developer go from clone to running system?
4. Check that seed data or test fixtures exist for local development
5. Verify that environment variables, configuration, and secrets management for local development are documented
6. Check for containerization: if production runs in containers, does local development also use containers?
7. Verify that local SSL/TLS handling matches production if HTTPS is required

### What a Finding Looks Like

- P0: "No local development setup instructions exist. A new developer cannot run the system locally."
- P1: "Production uses PostgreSQL 15 but local development uses SQLite. SQL dialect differences will cause bugs that only appear in production."
- P1: "Production uses Redis for session storage but local development stores sessions in memory. Multi-instance behavior cannot be tested locally."
- P2: "Local development uses mock email service but production uses SendGrid. Email formatting and delivery behavior differences are not documented."

---

## Pass 7: DR/Backup Coverage

### What to Check

Disaster recovery approach is documented. Backup strategy covers all persistent data. Recovery time objectives (RTO) and recovery point objectives (RPO) are specified.

### Why This Matters

Without a backup strategy, data loss is permanent. Without a disaster recovery plan, a region outage or infrastructure failure takes the system offline indefinitely. RTO and RPO define the business tolerance for downtime and data loss — without them, the team does not know whether their backup strategy is sufficient.

### How to Check

1. Verify backup strategy covers all persistent data stores: primary database, file storage, message queues (if persistent), configuration stores
2. Check that backup frequency is specified and aligns with RPO: if RPO is 1 hour, backups must run at least hourly
3. Verify backup retention policy: how long are backups kept? Is there a legal/compliance requirement?
4. Check that backup restoration is documented and tested: can the team actually restore from a backup?
5. Verify DR strategy: multi-region, failover, warm standby, or cold recovery? What is the expected RTO?
6. Check for data encryption at rest: are backups encrypted? Where are encryption keys stored?
7. Verify that DR testing is planned: is there a schedule for testing recovery procedures?

### What a Finding Looks Like

- P0: "No backup strategy is documented. If the primary database is corrupted or lost, data recovery is impossible."
- P0: "Backups run daily but the RPO is 15 minutes. Up to 24 hours of data could be lost, far exceeding the business tolerance."
- P1: "Backup restoration procedure says 'restore from backup' with no specifics. What tool? What command? How long does it take? What is the verification step?"
- P2: "DR strategy exists but has never been tested. The team does not know if recovery actually works within the stated RTO."

---

## Common Review Anti-Patterns

### 1. Reviewing the Runbook as a Standalone Document

The reviewer checks the operations runbook for completeness (are all sections present? are rollback procedures documented?) but never cross-references with the architecture or deployment infrastructure. The runbook may describe a deployment pipeline that does not match the actual CI/CD configuration, or monitoring that covers components that no longer exist. Operations documentation must be validated against the architecture it describes.

**How to spot it:** The review has no findings that reference the architecture document or infrastructure configuration. All findings are about what the runbook says, not whether what it says matches reality.

### 2. "We Use Kubernetes" as a Complete Deployment Strategy

The deployment section names the orchestration platform (Kubernetes, ECS, Heroku) but does not describe the actual deployment process. How are images built? How are they tagged? What triggers a deployment? What is the rollout strategy (rolling update, blue-green, canary)? What happens when a pod fails health checks during rollout? Naming the platform is not a strategy.

**Example finding:**

```markdown
## Finding: OPS-011

**Priority:** P1
**Pass:** Deployment Strategy Completeness (Pass 1)
**Document:** docs/operations-runbook.md, Section 2

**Issue:** Deployment section states: "The application is deployed to Kubernetes using
Helm charts." No further detail is provided. The following questions are unanswered:
  - What triggers a deployment? (manual, on PR merge, on tag?)
  - What is the rollout strategy? (rolling update, blue-green, canary?)
  - What are the health check endpoints and thresholds?
  - When do database migrations run relative to the code deployment?
  - What is the rollback procedure? (Helm rollback? Redeploy previous image?)
  - How long does a typical deployment take?

**Recommendation:** Expand the deployment section to cover each stage of the pipeline
from merged PR to verified production deployment, with specific commands, tools,
and decision points.
```

### 3. Monitoring Section Lists Tools but Not Metrics

The monitoring section says "we use Datadog for monitoring and PagerDuty for alerting" but does not specify what metrics are collected, what dashboards exist, or what alert thresholds are configured. Tools are not a monitoring strategy. The question is not "do we have Datadog?" but "what does Datadog measure, and when does it wake someone up?"

**How to spot it:** The monitoring section mentions tool names but contains no metric names (error rate, p95 latency, request throughput), no threshold values, and no alert severity definitions.

### 4. Rollback Procedure That Ignores Data

The rollback section describes how to revert code (redeploy previous version, Helm rollback) but does not address database schema changes or data migrations. If the deployment included a migration that added a column and backfilled data, "rollback" is not just reverting the code — it requires a reverse migration, and the reverse migration may be destructive (dropping the new column loses the backfilled data).

**How to spot it:** The rollback section mentions code rollback but not database rollback. Search for "migration," "schema," or "database" in the rollback procedure — if absent, data rollback is unaddressed.

### 5. No Runbook Entries for the Most Likely Failures

The runbook has procedures for exotic failure scenarios (complete region outage, database corruption) but not for the failures that actually happen weekly: a single pod crashing, a dependency timing out, disk filling up from log accumulation, a certificate expiring. The most useful runbook entries cover common, mundane failures — not catastrophic ones.

**How to spot it:** Count runbook entries. If there are fewer than 5, the most likely failure scenarios are probably missing. Check specifically for: service restart, dependency timeout, disk full, certificate expiration, and failed deployment rollback.

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

### review-step-template

*Shared template pattern for review pipeline steps including multi-model dispatch, finding severity, and resolution workflow*

# Review Step Template

## Summary

This entry documents the common structure shared by all 15+ review pipeline steps. Individual review steps customize this structure with artifact-specific failure modes and review passes, but the scaffolding is consistent across all reviews.

**Purpose pattern**: Every review step targets domain-specific failure modes for a given artifact — not generic quality checks. Each pass has a specific focus, concrete checking instructions, and example findings.

**Standard inputs**: Primary artifact being reviewed, upstream artifacts for cross-reference validation, `review-methodology` knowledge + artifact-specific review knowledge entry.

**Standard outputs**: Review document (`docs/reviews/review-{artifact}.md`), updated primary artifact with P0/P1 fixes applied, and at depth 4+: multi-model artifacts (`codex-review.json`, `gemini-review.json`, `review-summary.md`) under `docs/reviews/{artifact}/`.

**Finding severity**: P0 (blocking — must fix), P1 (significant — fix before implementation), P2 (improvement — fix if time permits), P3 (nitpick — log for later).

**Methodology scaling**: Depth 1-2 runs top passes only (P0 focus). Depth 3 runs all passes. Depth 4-5 adds multi-model dispatch to Codex/Gemini with finding synthesis.

**Mode detection**: First review runs all passes from scratch. Re-review preserves prior findings, marks resolved ones, and reports NEW/EXISTING/RESOLVED status.

**Frontmatter conventions**: Reviews are order = creation step + 10, always include `review-methodology` in knowledge-base, and are never conditional.

## Deep Guidance

### Purpose Pattern

Every review step follows the pattern:

> Review **[artifact]** targeting **[domain]**-specific failure modes.

The review does not check generic quality ("is this document complete?"). Instead, it runs artifact-specific passes that target the known ways that artifact type fails. Each pass has a specific focus, concrete checking instructions, and example findings.

### Standard Inputs

Every review step reads:
- **Primary artifact**: The document being reviewed (e.g., `docs/domain-models.md`, `docs/api-contracts.md`)
- **Upstream artifacts**: Documents the primary artifact was built from (e.g., PRD, domain models, ADRs) -- used for cross-reference validation
- **Knowledge base entries**: `review-methodology` (shared process) + artifact-specific review knowledge (e.g., `review-api-design`, `review-database-design`)

### Standard Outputs

Every review step produces:
- **Review document**: `docs/reviews/review-{artifact}.md` -- findings organized by pass, with severity and trace information
- **Updated artifact**: The primary artifact with fixes applied for P0/P1 findings
- **Depth 4+ multi-model artifacts** (when methodology depth >= 4):
  - `docs/reviews/{artifact}/codex-review.json` -- Codex independent review findings
  - `docs/reviews/{artifact}/gemini-review.json` -- Gemini independent review findings
  - `docs/reviews/{artifact}/review-summary.md` -- Synthesized findings from all models

### Finding Severity Levels

All review steps use the same four-level severity scale:

| Level | Name | Meaning | Action |
|-------|------|---------|--------|
| P0 | Blocking | Cannot proceed to downstream steps without fixing | Must fix before moving on |
| P1 | Significant | Downstream steps can proceed but will encounter problems | Fix before implementation |
| P2 | Improvement | Artifact works but could be better | Fix if time permits |
| P3 | Nitpick | Style or preference | Log for future cleanup |

### Finding Format

Each finding includes:
- **Pass**: Which review pass discovered it (e.g., "Pass 3 -- Auth/AuthZ Coverage")
- **Priority**: P0-P3
- **Location**: Specific section, line, or element in the artifact
- **Issue**: What is wrong, with concrete details
- **Impact**: What goes wrong downstream if this is not fixed
- **Recommendation**: Specific fix, not just "fix this"
- **Trace**: Link back to upstream artifact that establishes the requirement (e.g., "PRD Section 3.2 -> Architecture DF-005")

### Example Finding

```markdown
### Finding F-003 (P1)
- **Pass**: Pass 2 — Entity Coverage
- **Location**: docs/domain-models/order.md, Section "Order Aggregate"
- **Issue**: Order aggregate does not include a `cancellationReason` field, but PRD
  Section 4.1 requires cancellation reason tracking for analytics.
- **Impact**: Implementation will lack cancellation reason; analytics pipeline will
  receive null values, causing dashboard gaps.
- **Recommendation**: Add `cancellationReason: CancellationReason` value object to
  Order aggregate with enum values: USER_REQUEST, PAYMENT_FAILED, OUT_OF_STOCK,
  ADMIN_ACTION.
- **Trace**: PRD §4.1 → User Story US-014 → Domain Model: Order Aggregate
```

### Review Document Structure

Every review output document follows a consistent structure:

```markdown
  # Review: [Artifact Name]

  **Date**: YYYY-MM-DD
  **Methodology**: deep | mvp | custom:depth(N)
  **Status**: INITIAL | RE-REVIEW
  **Models**: Claude | Claude + Codex | Claude + Codex + Gemini

  ## Findings Summary
  - Total findings: N (P0: X, P1: Y, P2: Z, P3: W)
  - Passes run: N of M
  - Artifacts checked: [list]

  ## Findings by Pass

  ### Pass 1 — [Pass Name]
  [Findings listed by severity, highest first]

  ### Pass 2 — [Pass Name]
  ...

  ## Resolution Log
  | Finding | Severity | Status | Resolution |
  |---------|----------|--------|------------|
  | F-001   | P0       | RESOLVED | Fixed in commit abc123 |
  | F-002   | P1       | EXISTING | Deferred — tracked in ADR-015 |

  ## Multi-Model Synthesis (depth 4+)
  ### Convergent Findings
  [Issues found by 2+ models — high confidence]

  ### Divergent Findings
  [Issues found by only one model — requires manual triage]
```

### Methodology Scaling Pattern

Review steps scale their thoroughness based on the methodology depth setting:

### Depth 1-2 (MVP/Minimal)
- Run only the highest-impact passes (typically passes 1-3)
- Single-model review only
- Focus on P0 findings; skip P2/P3
- Abbreviated finding descriptions

### Depth 3 (Standard)
- Run all review passes
- Single-model review
- Report all severity levels
- Full finding descriptions with trace information

### Depth 4-5 (Comprehensive)
- Run all review passes
- Multi-model dispatch: send the artifact to Codex and Gemini for independent analysis
- Synthesize findings from all models, flagging convergent findings (multiple models found the same issue) as higher confidence
- Cross-artifact consistency checks against all upstream documents
- Full finding descriptions with detailed trace and impact analysis

### Depth Scaling Example

At depth 2 (MVP), a domain model review might produce:

```markdown
  # Review: Domain Models (MVP)
  ## Findings Summary
  - Total findings: 3 (P0: 1, P1: 2)
  - Passes run: 3 of 10
  ## Findings
  ### F-001 (P0) — Missing aggregate root for Payment bounded context
  ### F-002 (P1) — Order entity lacks status field referenced in user stories
  ### F-003 (P1) — No domain event defined for order completion
```

At depth 5 (comprehensive), the same review would run all 10 passes, dispatch to
Codex and Gemini, and produce a full synthesis with 15-30 findings across all
severity levels.

### Mode Detection Pattern

Every review step checks whether this is a first review or a re-review:

**First review**: No prior review document exists. Run all passes from scratch.

**Re-review**: A prior review document exists (`docs/reviews/review-{artifact}.md`). The step:
1. Reads the prior review findings
2. Checks which findings were addressed (fixed in the artifact)
3. Marks resolved findings as "RESOLVED" rather than removing them
4. Runs all passes again looking for new issues or regressions
5. Reports findings as "NEW", "EXISTING" (still unfixed), or "RESOLVED"

This preserves review history and makes progress visible.

### Resolution Workflow

The standard workflow from review to resolution:

1. **Review**: Run the review step, producing findings
2. **Triage**: Categorize findings by severity; confirm P0s are genuine blockers
3. **Fix**: Update the primary artifact to address P0 and P1 findings
4. **Re-review**: Run the review step again in re-review mode
5. **Verify**: Confirm all P0 findings are resolved; P1 findings are resolved or have documented justification for deferral
6. **Proceed**: Move to the next pipeline phase

For depth 4+ reviews, the multi-model dispatch happens in both the initial review and the re-review, ensuring fixes do not introduce new issues visible to other models.

### Frontmatter Pattern

Review steps follow a consistent frontmatter structure:

```yaml
---
name: review-{artifact}
description: "Review {artifact} for completeness, consistency, and downstream readiness"
phase: "{phase-slug}"
order: {N}20  # Reviews are always 10 after their creation step
dependencies: [{creation-step}]
outputs: [docs/reviews/review-{artifact}.md, docs/reviews/{artifact}/review-summary.md, docs/reviews/{artifact}/codex-review.json, docs/reviews/{artifact}/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-{artifact-domain}]
---
```

Key conventions:
- Review steps always have order = creation step order + 10
- Primary output uses `review-` prefix; multi-model directory uses bare artifact name
- Knowledge base always includes `review-methodology` plus a domain-specific entry
- Reviews are never conditional — if the creation step ran, the review runs

### Common Anti-Patterns

### Reviewing Without Upstream Context
Running a review without loading the upstream artifacts that define requirements.
The review cannot verify traceability if it does not have the PRD, domain models,
or ADRs that establish what the artifact should contain.

### Severity Inflation
Marking everything as P0 to force immediate action. This undermines the severity
system and causes triage fatigue. Reserve P0 for genuine blockers where downstream
steps will fail or produce incorrect output.

### Fix Without Re-Review
Applying fixes to findings without re-running the review. Fixes can introduce new
issues or incompletely address the original finding. Always re-review after fixes.

### Ignoring Convergent Multi-Model Findings
When multiple models independently find the same issue, it has high confidence.
Dismissing convergent findings without strong justification undermines the value
of multi-model review.

### Removing Prior Findings
Deleting findings from a re-review output instead of marking them RESOLVED. This
loses review history and makes it impossible to track what was caught and fixed.

---

## After This Step

Continue with: `/scaffold:security`
