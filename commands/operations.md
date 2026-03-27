---
description: "Define deployment, monitoring, and incident response operations"
long-description: "Reads system architecture, TDD standards, and existing CI/dev-setup docs, then creates docs/operations-runbook.md defining deployment pipeline, deployment strategy, monitoring, alerting, and incident response. References docs/dev-setup.md for local dev and docs/git-workflow.md for base CI."
---

Read `docs/system-architecture.md`, `docs/tdd-standards.md`, `docs/adrs/`, `docs/dev-setup.md` (if it exists), and `docs/git-workflow.md` (if it exists), then define the production operational strategy. Create `docs/operations-runbook.md` covering deployment pipeline (extending the base CI from git-workflow), deployment strategy, monitoring, alerting, incident response, and rollback procedures.

**Important — avoid duplication:**
- **Dev environment setup** is already covered in `docs/dev-setup.md` (created by the Dev Setup prompt). Do NOT redefine prerequisites, env vars, one-command setup, common commands, or troubleshooting here — reference `docs/dev-setup.md` instead.
- **Base CI pipeline** (lint + test on PRs) is already configured in `.github/workflows/ci.yml` (created by the Git Workflow prompt). Do NOT redefine Stages 1-2 (fast checks, tests) — reference the existing CI and focus on extending it with build, deploy, and post-deploy stages.

## Mode Detection

Before starting, check if `docs/operations-runbook.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:operations v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing sections against what this prompt would produce fresh. Categorize:
   - **ADD** — Required sections missing from existing runbook
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure
   - **PRESERVE** — Project-specific deployment commands, custom alert thresholds, environment-specific configuration
3. **Cross-doc consistency**: Read related docs and verify runbook aligns with current architecture and testing standards.
4. **Preview changes**: Present the user a summary table. Wait for approval before proceeding.
5. **Execute update**: Update runbook, respecting preserve rules.
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:operations v<ver> <date> -->`
7. **Post-update summary**: Report sections added, restructured, preserved, and cross-doc issues.

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `docs/operations-runbook.md`
- **Preserve**: Custom alert thresholds with documented justification, environment-specific configs, deployment commands, runbook entries for known incidents, SLA definitions
- **Related docs**: `docs/system-architecture.md`, `docs/tdd-standards.md`, `docs/adrs/`
- **Special rules**: Never remove runbook entries for past incidents. Preserve alert thresholds that have been tuned from monitoring data.

---

## What the Document Must Cover

### 1. Dev Environment Reference

**Do not redefine local development setup here.** Reference `docs/dev-setup.md` for:
- Prerequisites, version managers, and version pinning
- Environment variables (`.env.example` template)
- One-command setup (`make setup` or equivalent)
- Database setup (local, Docker, SQLite)
- Hot reloading configuration
- Common dev commands table
- Troubleshooting guide

If `docs/dev-setup.md` does not exist yet, note that the Dev Setup prompt should be run first and add a brief placeholder section.

**What to add here (operations-specific only):**
- Environment-specific configurations for staging and production (env var differences, secrets management)
- Production database connection and migration procedures (distinct from local dev)
- Secrets management approach (how production secrets are stored and rotated — environment variables, secrets manager, etc.)

### 2. Deployment Pipeline (Extending Base CI)

The base CI pipeline (lint + test on PRs) is already configured in `.github/workflows/ci.yml` by the Git Workflow prompt. **Do not redefine Stages 1-2.** Instead, reference the existing CI and extend it with production deployment stages:

```
Existing CI (from git-workflow):
  -> Stage 1: Fast checks (30s) — lint, format, type check
  -> Stage 2: Tests (2-5 min) — unit + integration in parallel

Operations adds (main branch only):
  -> Stage 3: Build (1-2 min) — compile, bundle, generate artifacts
  -> Stage 4: Deploy (2-5 min) — deploy to staging/production + health check
  -> Stage 5: Post-deploy verification — smoke tests against deployed environment
```

For each new stage: what runs, what blocks, target duration.

**Artifact management**: Build once, deploy to all environments. Tag with git SHA. Set retention policies.

**Dependency caching**: If the existing CI doesn't already cache dependencies, add caching (keyed by lockfile hash) to the deployment pipeline.

### 3. Deployment Strategy

Choose and document one:
- **Blue-green**: Two environments, instant rollback via load balancer switch
- **Canary**: Gradual traffic shift (1% -> 5% -> 25% -> 100%), monitor at each step
- **Rolling**: Replace instances one at a time, verify health before proceeding
- **Feature flags**: Decouple deployment from release

**Rollback procedure** for the chosen strategy:

| Strategy | Rollback Method | Time to Rollback |
|----------|----------------|-----------------|
| Blue-green | Switch load balancer | Seconds |
| Canary | Route 100% to old | Seconds |
| Rolling | Re-deploy previous | Minutes |
| Feature flags | Disable flag | Seconds |

**Database rollback**: Reverse migrations, tested before deploying. Document irreversible migrations.

### 4. Monitoring and Alerting

**Four Golden Signals:**
- **Latency**: p50, p95, p99. Separate success from error latency.
- **Traffic**: Requests per second by endpoint and status code.
- **Errors**: Error rate as percentage. 4xx vs. 5xx breakdown.
- **Saturation**: CPU, memory, disk, database connection pool.

**Dashboard design**: Overview (request rate, error rate, latency, active users, business metrics) + per-service (golden signals, DB pool, cache hit rate, external dependency health).

**Alerting thresholds** — based on user impact, not arbitrary numbers:

| Alert | Condition | Severity | Response |
|-------|-----------|----------|----------|
| High error rate | 5xx > 1% for 5 min | Critical | Page on-call |
| High latency | p95 > 2s for 10 min | Warning | Investigate |
| DB saturation | Pool > 80% for 5 min | Warning | Scale/optimize |
| Disk space | < 20% free | Warning | Expand/clean |
| External API failure | > 50% errors for 5 min | Critical | Circuit breaker |

**Alert fatigue prevention**: Every alert has a documented response action. Use warning vs. critical levels. Aggregate related alerts.

### 5. Incident Response

**Runbook format** for each anticipated failure mode:
- Symptoms (what you see in logs, monitoring, API responses)
- Likely causes (ordered by probability)
- Resolution steps (specific commands)
- Prevention measures

**Escalation paths:**

| Severity | Response Time | Who | Action |
|----------|--------------|-----|--------|
| SEV-1 (outage) | < 15 min | On-call + lead | All hands, user comms |
| SEV-2 (degraded) | < 1 hour | On-call | Investigate and mitigate |
| SEV-3 (minor) | Next business day | Assigned engineer | Normal workflow |

**Post-mortem template**: Summary, timeline, root cause, impact, what went well, what went wrong, action items with owners and due dates.

**SLA definitions**: Availability target, API latency target, error rate target, deploy frequency, MTTR.

---

## Quality Criteria

- Deployment pipeline stages (build, deploy, post-deploy) defined with target durations
- Extends existing CI from git-workflow — does not redefine lint/test stages
- Deployment strategy chosen with tested rollback procedure
- Monitoring covers all four golden signals
- Alerting thresholds justified by user impact, not arbitrary
- References `docs/dev-setup.md` for local dev — does not redefine it
- Incident response process defined with escalation paths
- Every alert has a documented response action
- Secrets management: no secrets in code

---

## Process

1. **Read all inputs** — Read `docs/system-architecture.md`, `docs/tdd-standards.md`, `docs/adrs/`, `docs/dev-setup.md` (if exists), and `docs/git-workflow.md` (if exists).
2. **Use AskUserQuestionTool** for these decisions:
   - **Hosting platform**: Where will the app be deployed (Vercel, AWS, GCP, self-hosted)?
   - **Deployment strategy**: Blue-green, canary, rolling, or feature flags?
   - **Monitoring tooling**: Datadog, Grafana, CloudWatch, or built-in platform monitoring?
   - **Team size**: Solo developer, small team, or larger team (affects on-call and escalation)?
3. **Use subagents** to research deployment patterns for the project's hosting platform
4. **Reference dev setup** — link to `docs/dev-setup.md`, add only operations-specific content (staging/prod env vars, secrets management)
5. **Extend CI with deployment pipeline** — reference existing CI stages from `.github/workflows/ci.yml`, add build/deploy/post-deploy stages
6. **Define deployment strategy** — including rollback and database migration handling
7. **Set up monitoring** — four golden signals, dashboards, alert thresholds
8. **Document incident response** — runbooks, escalation, post-mortems, SLAs
9. **Cross-validate** — verify deployment pipeline matches architecture, alert thresholds cover all critical paths
10. If using Beads: create a task (`bd create "docs: operations runbook" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)

## After This Step

When this step is complete, tell the user:

---
**Quality phase in progress** — `docs/operations-runbook.md` created with deployment pipeline, deployment strategy, monitoring, and incident response.

**Next:** Run `/scaffold:security` — Conduct security review of the system design.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
