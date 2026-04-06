---
name: web-app-deployment
description: Static CDN hosting, serverless platforms, container deployments, edge runtimes, long-running servers, and blue-green deploy patterns for web apps
topics: [web-app, deployment, vercel, netlify, aws, docker, cloudflare, serverless, containers]
---

Deployment platform selection determines your app's operational cost, performance ceiling, and scaling characteristics. Each platform has a different cost model, latency profile, and runtime constraint. Choose based on your app's rendering strategy, traffic patterns, and team's operational expertise — not on what is fashionable.

## Summary

### Static Hosting (CDN)

For SSG applications with no server-side rendering at request time:

- **Best platforms**: Cloudflare Pages, Netlify, Vercel (static tier), AWS S3 + CloudFront, GitHub Pages
- **Cost**: Near zero for low-to-medium traffic; CDN egress costs at very high traffic
- **Performance**: Best possible — globally distributed, no cold starts, ~50 ms TTFB from any major city
- **Limitations**: No request-time server logic, no secrets at request time, data freshness = deploy frequency

Configure aggressive caching headers. Static assets (hashed filenames) get `Cache-Control: immutable, max-age=31536000`. HTML pages get `Cache-Control: no-cache` (validated on every request, served from cache when fresh).

### Serverless (Vercel, Netlify, AWS Lambda)

For SSR apps or API routes that need server logic at request time without managing servers:

- **Best platforms**: Vercel (Next.js-native), Netlify Functions, AWS Lambda + API Gateway, Cloudflare Pages Functions
- **Cost model**: Pay per invocation and compute time. Typically very cheap at low traffic, can become expensive at sustained high traffic vs. a long-running server.
- **Cold starts**: The primary performance concern. Lambda cold starts: 100–500 ms (Node.js), 1–3 seconds (container-based). Vercel/Netlify Edge Functions: 0 ms (V8 isolates, not containers).
- **Limitations**: Execution time limits (Vercel: 10–300 seconds depending on plan; Lambda: 15 minutes max), no persistent memory between invocations, no long-lived connections

Minimize cold start impact: keep bundles small (Lambda-specific: prefer ESM + tree-shaking over CommonJS), use Provisioned Concurrency for latency-critical endpoints, or migrate latency-sensitive APIs to edge functions.

### Container (Docker, AWS ECS/Fargate, Google Cloud Run)

For apps that need more control than serverless, persistent connections, or custom runtime environments:

- **Best platforms**: AWS ECS/Fargate, Google Cloud Run, Azure Container Apps, Railway, Fly.io, self-managed Kubernetes
- **Cost model**: Per-container-hour (Fargate) or per-request with scale-to-zero (Cloud Run). More expensive than serverless at low traffic, cheaper at sustained high traffic.
- **Benefits over serverless**: No cold starts with min replicas > 0, persistent WebSocket connections, custom binaries/runtimes, larger memory limits
- **Operational overhead**: You manage container definitions, health checks, and scaling policies

Use multi-stage Docker builds to minimize image size. Target images under 200 MB:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
RUN npm ci --omit=dev
USER node
EXPOSE 3000
CMD ["npm", "start"]
```

### Edge (Cloudflare Workers, Vercel Edge Functions)

For global, low-latency request processing with simple logic:

- **Runtime**: V8 isolates (not Node.js). Fast startup (~0 ms), runs at 300+ edge locations globally, ~1–5 ms TTFB worldwide.
- **Use cases**: Auth token validation, A/B testing, geo-routing, request rewriting, rate limiting, personalized cache headers
- **Limitations**: No Node.js built-ins (`fs`, `crypto` partially available, `child_process` unavailable), no SQLite, execution time limits (50 ms CPU time on Cloudflare free tier), no persistent file system
- **Data access**: Use edge-native databases: Cloudflare D1 (SQLite), Cloudflare KV, Upstash Redis, PlanetScale edge

Never put complex business logic in edge functions. Their value is speed and global distribution for request/response transformations, not application logic.

### Long-Running Server (Express, Fastify, Node.js HTTP)

For apps that need WebSockets, background jobs, or full control over the request lifecycle:

- **Best platforms**: AWS EC2 + ALB, Fly.io, Railway, DigitalOcean Droplets, Hetzner (cost-efficient)
- **When to choose**: Real-time features (WebSockets, SSE), background workers, long-running database transactions, legacy apps that cannot be adapted to serverless constraints

## Deep Guidance

### Blue-Green Deployments

Blue-green deployments eliminate downtime and reduce rollback time to seconds:

1. **Blue** = current production (100% of traffic)
2. **Green** = new version (deployed but receiving 0% of traffic)
3. Run smoke tests against the green environment
4. Switch the load balancer to route 100% of traffic to green
5. Monitor for 5–15 minutes
6. If healthy: decommission blue. If unhealthy: switch back to blue (rollback complete in < 30 seconds)

Requirements: stateless app servers (session data in Redis/DB, not in-memory), database schema changes must be backward-compatible with both versions simultaneously.

### Platform Selection Decision Matrix

| Criteria | Static CDN | Serverless | Container | Edge | Long-Running |
|----------|-----------|------------|-----------|------|--------------|
| SSG only | Best | Overkill | Overkill | Good | Overkill |
| SSR with SEO | — | Best | Good | Good | Good |
| Real-time (WebSocket) | No | No | Best | No | Best |
| Low traffic / cost | Best | Best | Expensive | Best | Expensive |
| High sustained traffic | Best | Expensive | Best | Best | Best |
| Cold start sensitive | N/A | Problem | Solved | Solved | Solved |
| Ops complexity | Lowest | Low | Medium | Low | High |

### Health Checks and Readiness Probes

Every deployed service must expose health endpoints:

```typescript
// app/api/health/route.ts
export async function GET() {
  try {
    // Check critical dependencies
    await db.query("SELECT 1");
    return Response.json({ status: "healthy", version: process.env.npm_package_version });
  } catch (error) {
    return Response.json({ status: "unhealthy", error: String(error) }, { status: 503 });
  }
}
```

Configure your load balancer or container orchestrator to route traffic only to healthy instances. Health check failure should trigger automatic rollback in your deployment pipeline.

### Cost Optimization

- Use serverless for variable or low traffic; switch to containers once monthly serverless cost exceeds 2–3 baseline container instances
- CDN cache hit rate should be above 90% for SSG content — if it is not, investigate cache-busting headers
- Set spending alerts at 50% and 100% of monthly budget on cloud providers — auto-remediation (scale down) if the alert fires on unexpected traffic
