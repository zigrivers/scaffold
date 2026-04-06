---
name: backend-deployment
description: Containerization best practices, serverless patterns, health check endpoints, graceful shutdown, and deployment strategies
topics: [backend, deployment, docker, serverless, health-checks, graceful-shutdown, blue-green, canary]
---

Deployment reliability is a multiplier on every other engineering investment — a well-written service that deploys poorly will cause more incidents than a mediocre service that deploys safely and rolls back cleanly.

## Summary

### Containerization

**Multi-stage Dockerfile:** Use separate build and runtime stages. The build stage installs all dependencies and compiles. The runtime stage copies only the compiled output and production dependencies — no compiler toolchain, no dev dependencies, no source maps in production. This reduces image size by 60–80% and eliminates build-time tools as attack surface.

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**Distroless base images:** For production, consider `gcr.io/distroless/nodejs` or `cgr.dev/chainguard/node`. These images contain only the runtime and its dependencies — no shell, no package manager, no OS utilities. Smaller attack surface, pass most container security scanners. Trade-off: harder to debug; use a separate debug image with a shell for incident investigation.

**Non-root user:** Always run the container process as a non-root user (`USER node` or `USER nobody`). Combine with read-only filesystems (`--read-only`) and a writable tmpfs for temp files. Set resource limits (CPU, memory) to prevent noisy-neighbor problems in shared clusters.

### Serverless Patterns

**Cold start mitigation:** Cold starts add 200ms–2s of latency on the first request. Minimize cold starts by: keeping the function bundle small (tree-shake, avoid heavy dependencies), using provisioned concurrency for latency-sensitive paths, initializing database connections in the module scope (not inside the handler), and using connection proxies (RDS Proxy, PgBouncer) that maintain connection pools outside the function lifecycle.

**Connection pooling:** Serverless functions can spawn thousands of instances simultaneously, overwhelming a traditional database's connection limit. Use a connection pooler (PgBouncer, RDS Proxy, Neon serverless driver) that sits between functions and the database. Configure pool size per function instance conservatively (1–5 connections).

**Stateless design:** Serverless functions must be stateless. Store all session state, cache, and shared state in external services (Redis, DynamoDB). Write output to S3 or a database, never to the local filesystem.

### Health Check Endpoints

Every service must expose two health endpoints:

**`GET /health` (liveness):** Returns 200 if the process is running and not deadlocked. Checked by the orchestrator to decide whether to restart the container. Must not check external dependencies — if the database is down, the container should not be restarted (it won't help). Respond within 50ms.

**`GET /ready` (readiness):** Returns 200 if the service is ready to serve traffic; returns 503 otherwise. Checked before routing traffic to a new instance. Should verify critical dependencies: database connectivity, required cache availability. Remove from load balancer rotation when returning 503. Add a startup delay check so new instances don't receive traffic before warming up.

Include response body with version, uptime, and dependency statuses for operational visibility.

### Graceful Shutdown

Handle `SIGTERM` (sent by Kubernetes, Docker, and process managers before killing the process):

1. Stop accepting new connections (close the HTTP server's listening socket).
2. Allow in-flight requests to complete (drain the request queue).
3. Close database connections and message queue consumers cleanly.
4. Flush buffered logs and metrics.
5. Exit with code 0.

Set a shutdown timeout (10–30 seconds). If draining takes longer, force exit. In Kubernetes, set `terminationGracePeriodSeconds` to match. Without graceful shutdown, deployments cause dropped requests and incomplete transactions.

## Deep Guidance

### Blue-Green and Canary Deploys

**Blue-green:** Maintain two identical production environments (blue and green). Deploy the new version to the inactive environment, run smoke tests, then cut over traffic in one atomic switch. Instant rollback: switch traffic back. Cost: double the infrastructure during deployment.

**Canary:** Route a small percentage of traffic (1%, 5%, 25%) to the new version. Monitor error rates, latency, and business metrics. Gradually increase the percentage if metrics are healthy, or roll back if they degrade. Better for catching issues that only appear under real traffic patterns. Requires traffic splitting at the load balancer or service mesh layer. Define explicit rollback criteria before deploying.
