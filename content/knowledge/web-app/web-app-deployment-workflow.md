---
name: web-app-deployment-workflow
description: Preview deploys per PR, staging environments, deployment branches, CI/CD pipeline stages, rollback strategies, and canary deployments
topics: [web-app, deployment, ci-cd, staging, preview, rollback, canary]
---

A mature deployment workflow transforms deployment from a risky, manual event into a routine, automated step. The goal is to make every merge to main automatically and safely deliverable to production, with fast rollback when something goes wrong. The cost of building this infrastructure up front is trivially small compared to the cost of a major incident caused by a manual deploy process.

## Summary

### Preview Deploys Per PR

Every pull request should get its own preview deployment — a fully functional URL that reviewers and QA can use to verify behavior before merging. This is the single highest-ROI practice in modern web deployment:

- **Vercel, Netlify, Railway**: Automatically create preview deploys on PR open/push. Zero configuration for most frameworks.
- **Custom CI**: Build and deploy to a path-based preview URL (`preview/<pr-number>/`) or a subdomain. Tear down on PR close.

Preview deploys must use isolated environment variables (dev database, dev third-party API keys). Never point a preview deploy at a production database.

### Deployment Branches

Establish a clear branch-to-environment mapping and document it in the repo:

| Branch | Environment | Deploys |
|--------|-------------|---------|
| `main` | Production | Automatic on merge |
| `staging` | Staging | Automatic on merge |
| `feature/*`, `fix/*` | Preview | Automatic on PR push |

Avoid long-lived branches other than `main` and optionally `staging`. Feature branches merge to `main` via PR. `main` deploys to production. This is the simplest model that works.

If you have a separate `staging` branch: keep it in sync with `main` via regular merges. Staging branches that lag `main` by weeks create false confidence and painful integration surprises.

### CI/CD Pipeline Stages

Every push to a branch should run a pipeline in this order (fast-to-slow, fail-fast):

1. **Install dependencies** (cached; skip if lockfile unchanged)
2. **Lint** — ESLint, Prettier check (fail fast; ~30 seconds)
3. **Typecheck** — `tsc --noEmit` (fail fast; ~60 seconds)
4. **Unit tests** — Vitest/Jest with coverage threshold (1–3 minutes)
5. **Build** — Production build to verify no build errors (2–5 minutes)
6. **E2E tests** (optional, on main/staging only) — Playwright or Cypress against preview deploy (5–15 minutes)
7. **Deploy** — Only if all above pass

Do not run all tests on every PR if the test suite is slow. Use test impact analysis (run only tests related to changed files) or split E2E tests to a separate workflow that runs on merge to `main`.

### Rollback Strategies

Every deployment system must have a tested rollback procedure. "We can just revert the commit and redeploy" is not a rollback strategy — that takes 5+ minutes and requires a developer to execute it under pressure.

- **Vercel/Netlify**: One-click rollback to any previous deployment in the dashboard. Target: under 30 seconds to rollback.
- **Custom infrastructure**: Maintain the previous two deployment artifacts. Rollback = swap the active artifact. Use blue-green or immutable deployment patterns (see below).
- **Database migrations**: Rollback is the hard part. Write migrations that are forward-compatible (additive only). Keep destructive changes separate, deployed only after the new code is stable. Use a migration tool that tracks state (Prisma, Flyway, Liquibase).

Test the rollback procedure at least quarterly. A rollback you have never practiced will fail in an incident.

### Canary Deployments

For high-traffic production apps, deploy changes to a small percentage of traffic before full rollout:

- Route 5% of requests to the new version, 95% to the old
- Monitor error rates, latency, and business metrics for 15–30 minutes
- Gradually increase the percentage or roll back if metrics degrade

Canary deployments require infrastructure support: feature flag services (LaunchDarkly, Unleash), traffic splitting at the load balancer (AWS ALB weighted routing, Cloudflare Workers), or platform-level support (Vercel edge middleware). Do not implement canaries manually — use the platform's built-in mechanism.

## Deep Guidance

### CI/CD Pipeline Template (GitHub Actions)

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, staging]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --coverage
      - run: npm run build

  deploy-preview:
    needs: quality
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci && npm run build
      - name: Deploy preview
        run: npx vercel deploy --prebuilt --token=${{ secrets.VERCEL_TOKEN }}
```

### Deployment Environment Variables

Separate environment variables by tier and manage them securely:

- **Local**: `.env.local` (gitignored, developer-managed)
- **Preview**: Vercel/Netlify project environment variables, marked "Preview" tier; use dev API keys only
- **Staging**: Staging-specific secrets in GitHub Actions or your secrets manager
- **Production**: Production secrets never visible to developers; managed by infra/ops

Audit who has access to production secrets quarterly. Rotate API keys and tokens on team member offboarding without exception.

### Defining "Deployment Complete"

A deployment is not complete when the deploy command exits. It is complete when:

1. The new version is serving traffic (health check passes)
2. Error rate is not elevated above baseline
3. Response latency p95 is not elevated above baseline
4. At least one synthetic monitor has confirmed the critical user journey works

Automate this check in your deploy pipeline. Do not send "deploy succeeded" notifications until you have validated real traffic behavior.

### Zero-Downtime Deployments

For apps that cannot tolerate downtime:

- **Rolling deployments**: Bring up new instances, drain old instances. Requires stateless services (no in-memory session storage).
- **Blue-green deployments**: Run two identical environments (blue = current, green = new). Switch traffic at the load balancer level. Old environment stays up as instant rollback target.
- **Feature flags**: Deploy code to production without enabling it. Enable via flag without a deployment. Fastest and most controllable rollout mechanism.

For stateful workloads (databases, file storage): always plan the data migration before the code migration. Code deploys are reversible; bad data migrations often are not.
