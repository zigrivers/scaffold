---
name: web-app-rendering-strategies
description: SSR TTFB and SEO benefits, SSG for content sites, ISR, streaming SSR, React Server Components, and progressive hydration patterns
topics: [web-app, rendering, ssr, ssg, isr, streaming, react-server-components, hydration]
---

Rendering strategy is the foundational technical decision in a web app — it determines server infrastructure requirements, SEO characteristics, performance profile, and the developer model for data fetching. Understanding the precise mechanics of each strategy (not just their marketing descriptions) is essential for making and defending the right choice for a given project.

## Summary

### SSR: Benefits and Real Costs

Server-Side Rendering generates HTML on the server for each request. The benefits are real but often overstated:

**Benefits:**
- **SEO**: Search engines receive pre-rendered HTML immediately. Critical for pages that must be indexed.
- **LCP on slow connections**: User sees content before JavaScript downloads and executes. Significant for mobile users on 3G.
- **Social sharing**: OG tags, Twitter Cards, and link previews work because the HTML is complete on the server response.
- **Auth-gated content**: Server can read session cookies and render personalized HTML without a client-side auth check causing layout flash.

**Real costs (often understated):**
- **TTFB**: Server must complete data fetching before sending the first byte. A slow database query delays the entire page. CSR serves a shell HTML in ~50 ms (CDN); SSR may take 200–500 ms for a database-backed page.
- **Server load**: Every page view consumes server CPU. At scale, this is a significant infrastructure cost vs. CDN-served static pages.
- **Caching complexity**: SSR responses may be personalized and cannot be cached at the CDN without careful `Vary` headers and cache key design.
- **Cold starts**: In serverless environments, SSR functions have cold start latency that static serving does not.

### SSG: When It Is the Right Tool

Static Site Generation pre-builds every page at deploy time. It is the correct choice for:

- Content that changes at most a few times per day (blog, docs, marketing pages)
- Pages with no user-specific personalization in the HTML
- Maximum performance requirements (sub-100 ms TTFB from CDN)

SSG limitations are real and must be understood:
- **Build time**: Every page generates during CI. At 10,000 pages with 100 ms per page: 17 minutes of build time. Use incremental builds and build caching to mitigate.
- **Data freshness**: Pages are stale from the moment they are built. A product price change requires a rebuild to appear. Use on-demand revalidation (ISR) for this case.

### ISR: Incremental Static Regeneration

ISR extends SSG with per-route revalidation intervals. A page marked `revalidate: 60` is served from the CDN static cache, but regenerated in the background every 60 seconds when a visitor triggers it:

- Stale-while-revalidate semantics: the first visitor after 60 seconds gets the old page; the next visitor gets the fresh page
- The regeneration happens server-side, not in response to a specific user — it is eventual consistency, not real-time
- On-demand ISR (via `res.revalidate(path)`) allows webhook-triggered immediate rebuilds — product price change → webhook → rebuild that product page within seconds

ISR is appropriate when "a few seconds to a minute stale" is acceptable and you want CDN-level performance without a full rebuild per data change.

### Streaming SSR

React 18 and Next.js App Router support streaming HTML responses using `renderToPipeableStream` and `<Suspense>`:

1. Server sends the page shell (header, navigation, above-fold layout) immediately — TTFB is fast
2. Data-dependent sections are wrapped in `<Suspense>` with a fallback (skeleton)
3. As each suspended section's data resolves, React streams its HTML directly into the response
4. Browser progressively renders content as it arrives

This transforms LCP dramatically: users see layout and fast content immediately; slow data sections (product reviews, recommendations) arrive asynchronously without blocking the critical paint.

**Implementation pattern:**
```tsx
// app/product/[id]/page.tsx
export default function ProductPage({ params }) {
  return (
    <main>
      <ProductHero id={params.id} />        {/* Fast: renders immediately */}
      <Suspense fallback={<ReviewSkeleton />}>
        <ProductReviews id={params.id} />   {/* Slow: streams in when ready */}
      </Suspense>
      <Suspense fallback={<RecommendationSkeleton />}>
        <Recommendations id={params.id} />  {/* Slow: streams in when ready */}
      </Suspense>
    </main>
  );
}
```

### React Server Components

RSC is a model where components run exclusively on the server and send a serialized component description to the client — not HTML, not JavaScript:

- **Server Components**: Zero client-side JS. Read databases, file systems, environment variables directly. Not interactive.
- **Client Components**: Marked with `"use client"`. Run on both server (for initial HTML) and client (for interactivity). Receive server component output as props.
- **Benefit**: A product page with 40 KB of component code can ship 5 KB to the browser if most components are server-only.

The mental model shift: the client-server boundary is now drawn at the component level, not the page level. This is the most significant change in React architecture since hooks.

## Deep Guidance

### Choosing a Strategy: Decision Framework

Answer these questions in order:

1. **Does this page need SEO?** If no → CSR. If yes → continue.
2. **Is the content personalized per user?** If no → SSG or ISR. If yes → SSR or RSC.
3. **How stale can the data be?** Minutes acceptable → ISR. Real-time required → SSR.
4. **How much traffic?** Millions of pageviews/day → CDN-served (SSG/ISR) wins on cost. Low traffic → SSR is fine.

Most real-world apps need a hybrid: SSG for marketing, ISR for product listings, SSR for checkout, CSR for the user dashboard.

### Progressive Hydration Pattern

In Next.js without RSC, implement progressive hydration by deferring non-critical component hydration:

```typescript
import dynamic from "next/dynamic";

// Defer hydration until the component is in the viewport
const HeavyWidget = dynamic(() => import("./HeavyWidget"), {
  ssr: false,  // Not needed for SEO
  loading: () => <WidgetSkeleton />,
});

// Or: load but don't hydrate until user interacts
const ChatWidget = dynamic(() => import("./ChatWidget"), {
  ssr: false,
});
```

Each dynamically imported component creates a separate JS chunk. Only load what is needed for the current page — analyze your bundle with `@next/bundle-analyzer` or `rollup-plugin-visualizer`.

### Hydration Mismatch Debugging

The most common SSR debugging problem is hydration mismatches — the server renders different HTML than the client expects. Common causes:

- Browser-only APIs (`window`, `document`, `navigator`) accessed during server render
- Date formatting that differs between server timezone and client timezone
- Random values (`Math.random()`, `uuid()`) that differ between server and client renders
- Conditional rendering based on browser features (`typeof window !== 'undefined'`)

Fix by moving browser-only code into `useEffect` (runs only on client) or by using `dynamic(() => import(...), { ssr: false })` for components that inherently require the browser. Never suppress hydration warnings with `suppressHydrationWarning` except for timestamps and user-agent-dependent content where mismatch is expected and benign.
