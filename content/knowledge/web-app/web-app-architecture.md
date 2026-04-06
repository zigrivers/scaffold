---
name: web-app-architecture
description: Rendering strategy tradeoffs, CDN edge patterns, hydration strategies, BFF pattern, and micro-frontend considerations for web apps
topics: [web-app, architecture, ssr, ssg, spa, hydration, bff, micro-frontends, cdn]
---

Web application architecture is the set of decisions that are expensive to reverse: rendering strategy, client-server boundary, data fetching patterns, and infrastructure topology. These decisions must be made with explicit tradeoff acknowledgment and documented as Architecture Decision Records. The most common architectural mistake is choosing a sophisticated pattern because it is interesting, not because the problem demands it.

## Summary

Web app architecture decisions — rendering strategy (CSR, SSG, SSR, ISR, hybrid), CDN edge patterns, hydration strategy, and the BFF pattern — are expensive to reverse. Match each strategy to the use case rather than trends. Most real-world apps benefit from a hybrid approach mixing strategies per route. Document every significant architectural choice as an Architecture Decision Record.

## Deep Guidance

### Rendering Strategy Tradeoffs

Every rendering strategy has a cost and a benefit profile. Match the strategy to the use case:

**CSR (Client-Side Rendering)**
- All rendering happens in the browser; server delivers a shell HTML + JS bundle
- Benefits: Simplest server infrastructure (static file hosting), excellent for authenticated apps with no SEO requirement
- Costs: Poor initial LCP (blank page until JS loads), crawlers may not index content, no server-side data access
- Use when: Dashboard, admin panel, authenticated tools, single-page apps behind login

**SSG (Static Site Generation)**
- Pages built at deploy time; served as static files from CDN
- Benefits: Near-zero TTFB, cheapest to serve, CDN-native, best Lighthouse scores
- Costs: Data is stale until next deploy, build time grows with page count (thousands of pages = slow builds)
- Use when: Marketing sites, documentation, blogs, any content that changes infrequently

**SSR (Server-Side Rendering)**
- Every request rendered on the server; fresh data every time
- Benefits: SEO-friendly, always fresh data, works without JavaScript enabled, good LCP on slow connections
- Costs: Server infrastructure required, cold start latency, harder caching, session management complexity
- Use when: E-commerce product pages, news sites, any dynamic content that must be SEO-indexed

**ISR (Incremental Static Regeneration)**
- Static generation with time-based revalidation; stale-while-revalidate per route
- Benefits: CDN-served like SSG, data freshness configurable per route (10 seconds to 24 hours)
- Costs: Staleness window must be acceptable to the business, first-visitor after expiry pays SSR cost
- Use when: Product listings, blog index pages, any content where "minutes stale" is acceptable

**Hybrid**
- Mix strategies per route: SSG for marketing pages, SSR for product pages, CSR for dashboard
- Next.js and Remix enable hybrid out of the box — this is the recommended approach for most real-world apps

### CDN Edge Patterns

Deploy static assets and, when possible, entire page renders to CDN edge nodes geographically close to users:

- **Edge caching**: Cache SSR responses at the CDN by setting appropriate `Cache-Control` headers. A page with `Cache-Control: s-maxage=60` is served from CDN for 60 seconds before revalidation.
- **Edge middleware**: Run logic at the CDN edge (Cloudflare Workers, Vercel Edge Functions) for auth redirects, A/B testing, and geolocation routing without hitting the origin server.
- **CDN-first asset serving**: All static assets (JS bundles, CSS, images) should always be CDN-served with long-lived cache headers (`Cache-Control: immutable, max-age=31536000`) and content-hashed filenames. Frameworks handle this automatically at build time.

### Hydration Strategies

Hydration is the process of attaching JavaScript interactivity to server-rendered HTML. It is the primary performance cost of SSR frameworks:

- **Full hydration**: The entire component tree hydrates at load. Simplest, but pays full JS parse/execute cost even for static content. Next.js and Remix default behavior.
- **Progressive hydration**: Hydrate high-priority interactive components first (navigation, above-fold CTAs), defer lower-priority components. Reduces TTI (Time to Interactive) without reducing interactivity.
- **Selective hydration / Islands architecture**: Only interactive components hydrate; purely static content never runs JS. Implemented by Astro natively; Qwik takes this further with resumability.
- **React Server Components (RSC)**: Components marked `"server"` never ship to the client. Their rendered output is streamed as a serialized component tree, not HTML. Zero hydration cost for server components.

Match hydration strategy to interactivity requirements. A content site with sparse interactive elements benefits significantly from islands architecture. A complex dashboard with no static content benefits from full hydration.

### BFF (Backend for Frontend) Pattern

The BFF pattern places a purpose-built server layer between the frontend and backend microservices:

- **Problem solved**: Frontend needs data aggregated from 5 microservices to render one page. Directly calling all 5 from the client creates waterfall requests, exposes internal service URLs, and splits auth concerns.
- **BFF solution**: The frontend calls one BFF endpoint. The BFF aggregates service responses, transforms data to match the UI's needs, handles auth tokens, and returns a single optimized response.
- **Implementation**: Next.js API routes or Remix loader functions are natural BFF layers. For separate backend services: a Node.js/Express/Fastify service that the frontend treats as its own API.

Do not build a BFF that becomes an unowned monolith. The BFF is owned by the frontend team and changes with the frontend's needs.

### Architecture Decision Record Template

Document every significant architectural choice:

```markdown
# ADR-001: Rendering Strategy Selection

## Status
Accepted — 2024-01-15

## Context
Marketing site (40 pages, infrequent content updates) plus authenticated dashboard.

## Decision
- Marketing pages: SSG via Next.js; rebuild on content change via webhook
- Dashboard: CSR with React Query; no SEO requirement

## Consequences
- Marketing pages: near-zero TTFB, excellent SEO, requires rebuild pipeline
- Dashboard: full JS bundle on load; auth gate prevents SEO concerns
- Hybrid in one codebase (Next.js handles both routing strategies)
```

### Micro-Frontend Considerations

Micro-frontends split one frontend monolith into independently deployable pieces, each owned by a different team. Adopt only when the organizational cost exceeds the technical cost:

- **When justified**: 50+ frontend engineers across 10+ teams, independent release cadences are blocked by coordination overhead, different teams own completely separate product domains
- **When NOT justified**: Under 20 engineers, single team owns the frontend, coordination overhead is manageable
- **Implementation options**: Module Federation (webpack), iframe composition (isolation but poor UX), server-side composition (ESI, Nginx include), link-based navigation (least coupling, least shared state)

Most teams that adopt micro-frontends at 10 engineers regret it. Prefer well-structured monorepos with internal package boundaries first.

### Streaming SSR

React 18+ enables streaming HTML responses: send the page shell immediately, stream in component subtrees as their data resolves. This dramatically improves TTFB perception and LCP:

- Critical path renders immediately; slow data sources do not block the initial HTML flush
- Implement with React's `<Suspense>` boundaries and `renderToPipeableStream`
- Next.js App Router uses streaming by default; wrap slow data-fetching components in `<Suspense>`
- Monitor streaming behavior in production — if a slow database query is not wrapped in Suspense, it blocks the entire response stream
