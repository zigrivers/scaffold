---
name: operations-runbook
description: Dev environment setup, CI/CD pipeline design, deployment, monitoring, and incident response
topics: [operations, cicd, deployment, monitoring, dev-environment, incident-response, local-dev]
---

## Dev Environment Setup

A productive development environment lets a developer (or AI agent) go from cloning the repo to running the application in under 5 minutes. The fewer manual steps, the fewer things that can go wrong.

### Local Development Prerequisites

Document every system-level dependency with exact versions:

| Dependency | Version | Why |
|------------|---------|-----|
| Node.js | 20.x LTS | Runtime |
| Python | 3.12+ | Backend scripts |
| PostgreSQL | 16+ | Primary database |
| Redis | 7+ | Caching and sessions |
| Docker | 24+ | Database containers (optional) |

**Version management:** Recommend a version manager for each language runtime:
- Node.js: `nvm`, `fnm`, or `.nvmrc` for automatic version switching
- Python: `pyenv` with `.python-version`
- Ruby: `rbenv` with `.ruby-version`

Check in a `.node-version` or `.nvmrc` file so tools auto-select the correct version.

### Environment Variables

Every project needs a clear environment variable strategy:

**`.env.example`** — Template committed to git with all required variables, default values for local development, and comments explaining each variable:

```bash
# Application
APP_PORT=3000                    # Port for the dev server
APP_ENV=development              # development | staging | production
APP_URL=http://localhost:3000    # Base URL for the app

# Database
DATABASE_URL=postgresql://localhost:5432/myapp_dev  # Local PostgreSQL
DATABASE_POOL_SIZE=5             # Connection pool size

# Authentication
JWT_SECRET=local-dev-secret-change-in-production  # JWT signing key
SESSION_SECRET=local-session-secret               # Session cookie secret

# External Services (optional for local dev)
# STRIPE_SECRET_KEY=sk_test_...  # Uncomment when testing payments
# SENDGRID_API_KEY=SG....       # Uncomment when testing emails
```

**`.env`** — Actual local configuration, gitignored. Created by copying `.env.example`.

**Required vs. optional:** Clearly mark which variables are required for the app to start and which are optional (features degrade gracefully without them).

### One-Command Setup

Provide a single command that installs all dependencies, creates the database, runs migrations, seeds data, and starts the dev server:

```bash
# First time setup
make setup    # or: npm run setup

# Daily development
make dev      # or: npm run dev
```

The setup command should be idempotent — safe to run twice without breaking anything.

### Database Setup for Local Development

**Option A: Local installation**
- Install database server natively
- Create dev database: `createdb myapp_dev` (PostgreSQL)
- Run migrations: `make db-migrate`
- Seed data: `make db-seed`

**Option B: Docker Compose**
```yaml
services:
  db:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports: ["6379:6379"]

volumes:
  pgdata:
```

Docker Compose is convenient for managing service dependencies but adds startup time and complexity. For simple stacks (SQLite, single service), skip Docker entirely.

**Option C: SQLite for development**
- No setup required
- Create database file on first run
- Fast, zero-configuration
- Trade-off: behavior differences from production PostgreSQL (no JSONB, different SQL dialect)

### Hot Reloading Configuration

The dev server must reload automatically when code changes:

- **Frontend:** Vite HMR (React, Vue, Svelte), Next.js Fast Refresh, or webpack HMR
- **Backend (Node.js):** `tsx watch`, `nodemon`, or `ts-node-dev` for TypeScript; `node --watch` for plain Node
- **Backend (Python):** `uvicorn --reload` (FastAPI), `flask run --debug` (Flask), `manage.py runserver` (Django)
- **Full-stack:** Run frontend and backend concurrently with a process manager (`concurrently`, `honcho`, or Makefile with `&`)

### Common Dev Commands

Every project should have a consistent set of commands. Use whatever mechanism fits the stack:

| Command | Purpose | Implementation |
|---------|---------|---------------|
| `make dev` | Start dev server with hot reload | Frontend + backend concurrently |
| `make test` | Run all tests | Test runner with coverage |
| `make test-watch` | Run tests in watch mode | Test runner in watch mode |
| `make lint` | Check code style | Linter for each language |
| `make format` | Auto-fix formatting | Formatter for each language |
| `make db-migrate` | Run pending migrations | Migration tool |
| `make db-seed` | Seed database with sample data | Seed script |
| `make db-reset` | Drop, recreate, migrate, seed | Compose the above |
| `make check` | Run all quality gates | lint + type-check + test |

Commands should be:
- Short and memorable (not `npx jest --runInBand --coverage --passWithNoTests`)
- Documented with help text
- Idempotent where possible
- Fast enough to run frequently

### Troubleshooting Guide

Document solutions for common development issues:

**Port already in use:**
```bash
lsof -i :3000  # Find the process
kill -9 <PID>  # Kill it
```

**Database connection refused:**
- Is the database running? `pg_isready` or `docker ps`
- Is the connection string correct? Check `.env`
- Is the port correct? Check for port conflicts

**Dependencies out of sync:**
```bash
rm -rf node_modules && npm install  # Node.js
rm -rf .venv && python -m venv .venv && pip install -r requirements.txt  # Python
```

**Migrations out of date:**
```bash
make db-migrate  # Run pending migrations
make db-reset    # Nuclear option: start fresh
```

## CI/CD Pipeline

### Pipeline Architecture

A CI/CD pipeline automates the path from code commit to production deployment. Design it in stages:

```
Push to branch
  -> Stage 1: Fast checks (30s)
       Lint, format check, type check
  -> Stage 2: Tests (2-5 min)
       Unit tests, integration tests (parallel)
  -> Stage 3: Build (1-2 min)
       Compile, bundle, generate artifacts
  -> Stage 4: Deploy (2-5 min, only on main)
       Deploy to staging/production

PR merge to main
  -> All stages above
  -> Stage 5: Post-deploy verification
       Smoke tests against deployed environment
```

### Stage Design

**Stage 1: Fast Checks**
- Run on every push and PR
- Fail fast: if linting fails, don't bother running tests
- Cache dependencies between runs
- Target: <30 seconds

```yaml
# GitHub Actions example
lint:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version-file: '.nvmrc' }
    - run: npm ci --ignore-scripts
    - run: npm run lint
    - run: npm run type-check
```

**Stage 2: Tests**
- Run unit and integration tests in parallel
- Use a service container for the test database
- Upload coverage reports as artifacts
- Target: <5 minutes

```yaml
test:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16
      env:
        POSTGRES_DB: test
        POSTGRES_PASSWORD: test
      ports: ['5432:5432']
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npm run test:ci
      env:
        DATABASE_URL: postgresql://postgres:test@localhost:5432/test
```

**Stage 3: Build**
- Compile TypeScript, bundle frontend assets, generate Docker image
- Verify the build artifact is valid (start the server and check health endpoint)
- Store the build artifact for deployment

**Stage 4: Deploy**
- Only runs on main branch (after PR merge)
- Deploy the build artifact from Stage 3
- Run database migrations before starting new version
- Verify health check after deployment

### Parallelization and Caching

**Parallel jobs:** Run lint, unit tests, and integration tests as separate parallel jobs. The total pipeline time equals the longest individual job, not the sum.

**Dependency caching:** Cache `node_modules/` (keyed by `package-lock.json` hash), Python virtual environments, Docker layer cache. This turns a 60-second install into a 5-second cache restore.

**Test parallelization:** Split test files across multiple runners. Most test frameworks support `--shard` or `--split` modes.

### Artifact Management

- Build artifacts (compiled code, Docker images) should be built once and deployed to all environments
- Store artifacts in a registry (Docker Hub, GitHub Container Registry, S3)
- Tag artifacts with the git SHA for traceability
- Set retention policies (keep last 30 days, keep releases forever)

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

**No local dev story.** "It works on the CI server" but developers can't run the application locally. Fix: document the local setup, make it one command, test it regularly by having new team members follow the instructions.

**Manual deployment steps.** Deployment requires an engineer to SSH into a server and run commands. This is error-prone, unreproducible, and blocks deployment on individual availability. Fix: fully automate deployment. A merge to main should trigger deployment automatically.

**No monitoring before launch.** Monitoring is added after the first incident, when it's most needed and least available. Fix: set up monitoring as part of the infrastructure phase, before any user traffic.

**Secrets in code.** API keys, database passwords, or JWT secrets committed to the repository. Fix: use environment variables loaded from a secrets manager. Scan the repository for accidentally committed secrets (git-secrets, truffleHog).

**Testing in production without feature flags.** Deploying untested features directly to all users. Fix: use feature flags to gradually expose new features. Test with a small percentage of traffic before full rollout.
