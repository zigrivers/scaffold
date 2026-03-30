---
description: "Define deployment pipeline, deployment strategy, monitoring, alerting, and incident response"
long-description: "Designs your deployment pipeline (build, test, deploy, verify, rollback), defines monitoring metrics with alert thresholds, and writes incident response procedures with rollback instructions."
---

## Purpose
Define the production operational strategy: deployment pipeline (extending the
base CI from git-workflow), deployment approach, monitoring and alerting, incident
response, and rollback procedures. References docs/dev-setup.md for local
development setup rather than redefining it.

## Inputs
- docs/system-architecture.md (required) — what to deploy
- docs/tdd-standards.md (required) — CI pipeline test stages
- docs/adrs/ (required) — infrastructure decisions
- docs/dev-setup.md (optional) — local dev setup to reference, not redefine
- docs/git-workflow.md (optional) — base CI pipeline to extend, not redefine

## Expected Outputs
- docs/operations-runbook.md — production operations and deployment runbook

## Quality Criteria
- (mvp) Deployment pipeline extends existing CI (build, deploy, post-deploy stages)
- (mvp) Deployment pipeline has explicit stages (build → test → deploy → verify → rollback-ready)
- (mvp) Does not redefine base CI stages (lint, test) from git-workflow
- (mvp) Deployment strategy chosen with rollback procedure
- (deep) Rollback procedure tested with specific trigger conditions (e.g., error rate > X%, health check failure)
- (deep) Runbook structured by operational scenario (deployment, rollback, incident, scaling)
- (mvp) Monitoring covers key metrics (latency, error rate, saturation)
- (deep) Each monitoring metric has an explicit threshold with rationale
- (deep) Health check endpoints defined with expected response codes and latency bounds
- (deep) Log aggregation strategy specifies retention period and searchable fields
- (deep) Each alert threshold documents: the metric, threshold value, business impact if crossed, and mitigation action
- (mvp) References docs/dev-setup.md for local dev — does not redefine it
- (deep) Incident response process defined
- (deep) Recovery Time Objective (RTO) and Recovery Point Objective (RPO) documented for each critical service
- (deep) Secret rotation procedure documented and tested

## Methodology Scaling
- **deep**: Full runbook. Deployment topology diagrams. Monitoring dashboard
  specs. Alert playbooks. DR plan. Capacity planning.
- **mvp**: Deploy command. Basic monitoring. Rollback procedure.
- **custom:depth(1-5)**:
  - Depth 1: deploy command and basic rollback procedure.
  - Depth 2: add basic monitoring metrics (latency, error rate, saturation).
  - Depth 3: add alert thresholds, incident response outline, health check endpoints.
  - Depth 4: full runbook with deployment topology, monitoring dashboards, and DR plan.
  - Depth 5: full runbook with capacity planning, secret rotation testing, and multi-region considerations.

## Mode Detection
Check for docs/operations-runbook.md. If it exists, operate in update mode:
read existing runbook and diff against current system architecture, ADRs, and
deployment configuration. Preserve existing deployment procedures, monitoring
thresholds, and incident response processes. Update deployment pipeline stages
if architecture changed. Never modify rollback procedures without user approval.

## Update Mode Specifics
- **Detect prior artifact**: docs/operations-runbook.md exists
- **Preserve**: deployment procedures, monitoring thresholds, alerting rules,
  incident response processes, rollback procedures, environment-specific
  configurations
- **Triggers for update**: architecture changed deployment topology, new ADRs
  changed infrastructure, security review identified operational requirements,
  CI pipeline changed (new stages to extend)
- **Conflict resolution**: if architecture changed the deployment target,
  update deployment stages but preserve monitoring and alerting sections;
  verify runbook does not redefine base CI stages from git-workflow.md

---

## Domain Knowledge

### operations-runbook

*Deployment pipeline, deployment strategies, monitoring, alerting, and incident response*

## Summary

## Dev Environment Reference

Local development setup (prerequisites, env vars, one-command setup, database, hot reload, common commands, troubleshooting) is defined in `docs/dev-setup.md`, created by the Dev Setup prompt. The operations runbook should reference it rather than redefine it.

**Operations-specific additions** (not covered by dev-setup):

### Environment-Specific Configuration

Document how environment variables differ across environments:

| Variable | Local | Staging | Production |
|----------|-------|---------|------------|
| `APP_ENV` | development | staging | production |
| `DATABASE_URL` | localhost | staging-db-host | prod-db-host |
| `LOG_LEVEL` | debug | info | warn |

### Secrets Management

Production secrets should never be in code or `.env` files:
- Use a secrets manager (AWS Secrets Manager, GCP Secret Manager, Vault, Doppler)
- Rotate secrets on a schedule (90 days for API keys, 365 days for service accounts)
- Audit access to secrets
- Document which secrets exist, where they're stored, and who can access them

## Deployment Pipeline

The base CI pipeline (lint + test on PRs) is configured by the Git Workflow prompt in `.github/workflows/ci.yml`. The operations runbook extends this with production deployment stages — it does not redefine the base CI.

### Pipeline Architecture

```
Existing CI (from git-workflow — already configured):
  -> Stage 1: Fast checks (30s) — lint, format, type check
  -> Stage 2: Tests (2-5 min) — unit + integration in parallel

Operations adds (main branch only):
  -> Stage 3: Build (1-2 min) — compile, bundle, generate artifacts
  -> Stage 4: Deploy (2-5 min) — deploy to staging/production
  -> Stage 5: Post-deploy verification — smoke tests
```

### Stage 3: Build

- Compile TypeScript, bundle frontend assets, generate Docker image
- Verify the build artifact is valid (start the server and check health endpoint)
- Store the build artifact for deployment
- Only runs after Stages 1-2 pass

### Stage 4: Deploy

- Only runs on main branch (after PR merge)
- Deploy the build artifact from Stage 3
- Run database migrations before starting new version
- Verify health check after deployment

### Stage 5: Post-Deploy Verification

- Run smoke tests against the deployed environment
- Verify critical user flows work end-to-end
- Check external dependency connectivity
- If smoke tests fail: trigger automatic rollback

### Artifact Management

- Build artifacts (compiled code, Docker images) should be built once and deployed to all environments
- Store artifacts in a registry (Docker Hub, GitHub Container Registry, S3)
- Tag artifacts with the git SHA for traceability
- Set retention policies (keep last 30 days, keep releases forever)

## Deep Guidance

## Deployment Strategies

### Blue-Green Deployment

Run two identical production environments (blue and green). At any time, one is live (serving traffic) and one is idle (ready for the next version).

**Process:**
1. Deploy new version to the idle environment
2. Run smoke tests against the idle environment
3. Switch the load balancer to point to the idle environment
4. The previously-live environment becomes idle

**Advantages:** Instant rollback (switch back), zero-downtime deployment, full environment testing before cutover.

**Disadvantages:** Requires double the infrastructure. Database migrations need careful handling (both environments share the database).

### Canary Deployment

Route a small percentage of traffic (1-5%) to the new version while the majority continues on the current version.

**Process:**
1. Deploy new version alongside current version
2. Route 1% of traffic to the new version
3. Monitor error rates, latency, and business metrics
4. If metrics are healthy, gradually increase traffic (5%, 25%, 50%, 100%)
5. If metrics degrade, route all traffic back to the current version

**Advantages:** Catches production-only issues with minimal blast radius. Real user traffic validates the deployment.

**Disadvantages:** Requires traffic routing infrastructure. Database schema changes must be compatible with both versions simultaneously.

### Rolling Deployment

Replace instances one at a time. When a new instance is healthy, take down an old one.

**Process:**
1. Start a new instance with the new version
2. Wait for health check to pass
3. Add the new instance to the load balancer
4. Remove one old instance
5. Repeat until all instances are new

**Advantages:** No extra infrastructure needed. Gradual rollout.

**Disadvantages:** During deployment, both versions run simultaneously (must be compatible). Rollback requires re-deploying the old version.

### Feature Flags

Decouple deployment from release. Code is deployed but features are toggled off until ready.

**When to use:**
- Large features that take multiple PRs to complete
- Gradual rollout to users (A/B testing)
- Kill switch for risky features in production

**Implementation options:**
- Environment variables (simple, requires redeployment to change)
- Configuration file (slightly more flexible)
- Feature flag service (LaunchDarkly, Unleash, Flipt — most flexible, adds dependency)

### Rollback Procedures

Every deployment strategy needs a documented rollback plan:

| Strategy | Rollback Method | Time to Rollback |
|----------|----------------|-----------------|
| Blue-green | Switch load balancer back | Seconds |
| Canary | Route 100% to old version | Seconds |
| Rolling | Re-deploy previous version | Minutes |
| Feature flags | Disable the flag | Seconds |

**Database rollback:** If the deployment included database migrations, rollback requires reverse migrations. Test reverse migrations before deploying. Some migrations are irreversible (dropping columns) — have a recovery plan.

## Monitoring and Alerting

### Four Golden Signals

Monitor these four metrics for every service:

**Latency:** How long requests take.
- Track p50, p95, p99 latency
- Separate success latency from error latency (errors are often fast — don't let them hide slow successes)
- Set thresholds based on user expectations (API: <200ms p95, page load: <1s p95)

**Traffic:** How many requests the service is handling.
- Requests per second, broken down by endpoint and status code
- Unusual traffic patterns indicate either success (organic growth) or problems (attack, bot traffic, retry storm)

**Errors:** The rate of failed requests.
- Track error rate as a percentage of total requests
- Categorize errors: client errors (4xx) vs. server errors (5xx)
- A sudden spike in 5xx errors is an incident. A gradual increase in 4xx may indicate a UX problem.

**Saturation:** How "full" the service is.
- CPU utilization, memory utilization, disk I/O, database connection pool usage
- Set alerts before hitting capacity (80% utilization triggers warning, 95% triggers critical)

### Dashboard Design

Dashboards should answer one question: "Is the system healthy right now?"

**Overview dashboard:**
- Request rate (last 1 hour, with 24-hour comparison)
- Error rate (last 1 hour, with threshold lines)
- Latency percentiles (p50, p95, p99 — last 1 hour)
- Active users / sessions (if applicable)
- Key business metrics (orders/minute, signups/hour)

**Per-service dashboard:**
- Same golden signals but scoped to a single service
- Database connection pool (active, idle, waiting)
- Cache hit rate
- External dependency latency and error rates

### Alerting Thresholds

Set alerts based on user impact, not arbitrary numbers:

| Alert | Condition | Severity | Response |
|-------|-----------|----------|----------|
| High error rate | 5xx rate > 1% for 5 minutes | Critical | Page on-call |
| High latency | p95 > 2s for 10 minutes | Warning | Investigate |
| Database saturation | Connection pool > 80% for 5 minutes | Warning | Scale or optimize |
| Disk space | < 20% free | Warning | Expand or clean up |
| Certificate expiry | < 14 days | Warning | Renew certificate |
| External API failure | > 50% error rate for 5 minutes | Critical | Activate circuit breaker |

**Alert fatigue prevention:**
- Every alert must have a documented response action. If nobody knows what to do when it fires, remove it.
- Use warning (investigate when convenient) vs. critical (respond now) to reduce noise
- Aggregate related alerts — don't page for each of 100 failing requests; page once for the pattern
- Tune thresholds based on historical data, not guesses

### On-Call Rotation

If the project has a team:
- Define rotation schedule (weekly rotations are common)
- Document escalation paths (who to contact if on-call can't resolve)
- Ensure handoff includes current incidents and known issues
- Post-rotation review: were there incidents? Were runbooks adequate?

## Incident Response

### Runbook Format

Every anticipated failure mode should have a runbook entry:

```markdown
## Runbook: Database Connection Pool Exhausted

### Symptoms
- Error logs: "Connection pool exhausted"
- API returns 503 for database-dependent endpoints
- Monitoring: connection pool utilization at 100%

### Likely Causes
1. Long-running queries holding connections
2. Missing connection release in error paths
3. Sudden traffic spike exceeding pool size
4. Database server under load

### Resolution Steps
1. Check active queries: `SELECT * FROM pg_stat_activity WHERE state = 'active';`
2. Kill long-running queries: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE duration > interval '5 minutes';`
3. If caused by traffic spike: increase pool size in config and restart
4. If caused by code bug: identify the query, create a fix task, increase pool temporarily

### Prevention
- Set query timeout (30 seconds for API queries, 5 minutes for background jobs)
- Monitor pool utilization with alerts at 80%
- Review N+1 queries in code review
```

### Escalation Paths

Define when to escalate and to whom:

| Severity | Response Time | Who | Action |
|----------|--------------|-----|--------|
| SEV-1 (outage) | <15 minutes | On-call + team lead | All hands, user communication |
| SEV-2 (degraded) | <1 hour | On-call | Investigate and mitigate |
| SEV-3 (minor) | Next business day | Assigned engineer | Fix in normal workflow |

### Post-Mortem Template

After every SEV-1 or SEV-2 incident:

```markdown
## Incident Post-Mortem: [Title]

### Summary
One-paragraph description of what happened, impact, and duration.

### Timeline
- HH:MM — First alert fired
- HH:MM — On-call acknowledged
- HH:MM — Root cause identified
- HH:MM — Mitigation applied
- HH:MM — Service fully recovered

### Root Cause
Technical description of what went wrong and why.

### Impact
- Duration: X hours
- Users affected: N
- Revenue impact: $X (if applicable)

### What Went Well
- Detection was fast (alert fired within 2 minutes)
- Runbook was accurate

### What Went Wrong
- Rollback procedure was untested
- Escalation was delayed due to unclear ownership

### Action Items
| Action | Owner | Due Date |
|--------|-------|----------|
| Add database timeout | @alice | 2026-03-21 |
| Test rollback procedure monthly | @bob | Ongoing |
| Update runbook with new symptoms | @alice | 2026-03-18 |
```

### SLA Definitions

Define service level targets for the application:

| Metric | Target | Measurement Period |
|--------|--------|-------------------|
| Availability | 99.9% (8.7 hours downtime/year) | Monthly |
| API Latency (p95) | < 200ms | Monthly |
| Error Rate | < 0.1% | Weekly |
| Deploy Frequency | Daily | Weekly |
| Mean Time to Recovery | < 1 hour | Per incident |

## Common Pitfalls

**Missing rollback procedures.** Deploying without a tested rollback plan. When the deployment breaks production, the team scrambles to figure out how to revert. Fix: every deployment strategy includes a documented, tested rollback procedure.

**Alert fatigue.** Too many alerts firing for non-critical issues. The on-call person starts ignoring alerts because most are noise. A real incident gets missed. Fix: every alert must have a clear response action. Remove alerts that routinely fire without requiring action.

**Manual deployment steps.** Deployment requires an engineer to SSH into a server and run commands. This is error-prone, unreproducible, and blocks deployment on individual availability. Fix: fully automate deployment. A merge to main should trigger deployment automatically.

**No monitoring before launch.** Monitoring is added after the first incident, when it's most needed and least available. Fix: set up monitoring as part of the infrastructure phase, before any user traffic.

**Secrets in code.** API keys, database passwords, or JWT secrets committed to the repository. Fix: use environment variables loaded from a secrets manager. Scan the repository for accidentally committed secrets (git-secrets, truffleHog).

**Testing in production without feature flags.** Deploying untested features directly to all users. Fix: use feature flags to gradually expose new features. Test with a small percentage of traffic before full rollout.

---

## After This Step

Continue with: `/scaffold:implementation-plan`, `/scaffold:review-operations`
