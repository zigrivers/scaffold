---
description: "Define CI/CD, deployment, monitoring, and incident response operations"
long-description: "Reads system architecture and TDD standards, then creates docs/operations-runbook.md defining dev environment setup, CI/CD pipeline, deployment strategy, monitoring, alerting, and incident response."
---

Read `docs/system-architecture.md`, `docs/tdd-standards.md`, and `docs/adrs/`, then define the complete operational strategy. Create `docs/operations-runbook.md` covering local development setup, CI/CD pipeline, deployment approach, monitoring, alerting, incident response, and rollback procedures.

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

### 1. Dev Environment Setup

**Prerequisites table** — every system dependency with exact version and reason:

| Dependency | Version | Why |
|------------|---------|-----|
| (runtime) | (version) | (purpose) |

Include version manager recommendations (nvm, pyenv) and version pinning files (.nvmrc, .python-version).

**Environment variables:**
- `.env.example` template committed to git with all required variables, defaults, and comments
- `.env` gitignored, created by copying `.env.example`
- Mark required vs. optional (features degrade gracefully without optional vars)

**One-command setup** — `make setup` or equivalent that installs deps, creates database, runs migrations, seeds data. Must be idempotent.

**Database setup** — local installation, Docker Compose, or SQLite for dev. Include connection strings, migration commands, seed commands.

**Hot reloading** — configure for the project's stack. Frontend and backend must reload automatically on code changes.

**Common dev commands table:**

| Command | Purpose |
|---------|---------|
| `make dev` | Start dev server with hot reload |
| `make test` | Run all tests |
| `make lint` | Check code style |
| `make format` | Auto-fix formatting |
| `make db-migrate` | Run pending migrations |
| `make db-seed` | Seed database |
| `make db-reset` | Drop, recreate, migrate, seed |
| `make check` | Run all quality gates |

**Troubleshooting guide** — solutions for common issues: port in use, database connection refused, dependencies out of sync, migrations out of date.

### 2. CI/CD Pipeline

**Pipeline stages:**
```
Push -> Stage 1: Fast checks (30s) — lint, format, type check
     -> Stage 2: Tests (2-5 min) — unit + integration in parallel
     -> Stage 3: Build (1-2 min) — compile, bundle, artifacts
     -> Stage 4: Deploy (2-5 min, main only) — deploy + health check
     -> Stage 5: Post-deploy verification — smoke tests
```

For each stage: what runs, what blocks, caching strategy, target duration.

**GitHub Actions** (or project's CI platform) configuration with specific YAML examples for the project's stack.

**Parallelization**: Lint, unit tests, integration tests as separate parallel jobs.

**Dependency caching**: Cache `node_modules/` (or equivalent) keyed by lockfile hash.

**Artifact management**: Build once, deploy to all environments. Tag with git SHA. Set retention policies.

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

- CI/CD pipeline defined with all stages and target durations
- Deployment strategy chosen with tested rollback procedure
- Monitoring covers all four golden signals
- Alerting thresholds justified by user impact, not arbitrary
- Dev environment reproducible in under 5 minutes
- Incident response process defined with escalation paths
- Every alert has a documented response action
- Secrets management: no secrets in code

---

## Process

1. **Read all inputs** — Read `docs/system-architecture.md`, `docs/tdd-standards.md`, and `docs/adrs/` completely.
2. **Use AskUserQuestionTool** for these decisions:
   - **Hosting platform**: Where will the app be deployed (Vercel, AWS, GCP, self-hosted)?
   - **CI platform**: GitHub Actions, CircleCI, or other?
   - **Deployment strategy**: Blue-green, canary, rolling, or feature flags?
   - **Monitoring tooling**: Datadog, Grafana, CloudWatch, or built-in platform monitoring?
   - **Team size**: Solo developer, small team, or larger team (affects on-call and escalation)?
3. **Use subagents** to research CI/CD and deployment patterns for the project's hosting platform
4. **Document dev setup** — prerequisites, env vars, one-command setup, common commands, troubleshooting
5. **Design CI/CD pipeline** — stages, parallelization, caching, artifact management
6. **Define deployment strategy** — including rollback and database migration handling
7. **Set up monitoring** — four golden signals, dashboards, alert thresholds
8. **Document incident response** — runbooks, escalation, post-mortems, SLAs
9. **Cross-validate** — verify pipeline stages match test categories from TDD standards, deployment matches architecture
10. Create a Beads task: `bd create "docs: operations runbook" -p 0` and `bd update <id> --claim`
11. When complete and committed: `bd close <id>`

## After This Step

When this step is complete, tell the user:

---
**Quality phase in progress** — `docs/operations-runbook.md` created with dev setup, CI/CD, deployment, monitoring, and incident response.

**Next:** Run `/scaffold:security` — Conduct security review of the system design.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
