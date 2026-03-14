---
name: review-operations
description: Failure modes and review passes specific to operations and deployment runbook artifacts
topics: [review, operations, deployment, monitoring, runbooks]
---

# Review: Operations & Deployment

The operations runbook defines how the system is deployed, monitored, and maintained in production. It must cover the full deployment lifecycle, provide runbook procedures for common failure scenarios, and ensure the development environment reasonably mirrors production. This review uses 7 passes targeting the specific ways operations documentation fails.

Follows the review process defined in `review-methodology.md`.

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
