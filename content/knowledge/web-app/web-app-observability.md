---
name: web-app-observability
description: Real User Monitoring, Core Web Vitals tracking, error tracking with Sentry, CDN analytics, custom performance marks, and performance regression alerting
topics: [web-app, observability, rum, core-web-vitals, sentry, performance, monitoring]
---

You cannot improve what you cannot measure. Frontend observability is often treated as an afterthought — added after users start complaining — but by then you have no baseline to regress against and no historical data to understand when performance degraded or errors started. Real User Monitoring (RUM) captures the experience of your actual users on their actual devices and networks, which lab-based tests like Lighthouse cannot replicate. Core Web Vitals are Google's standardized metrics for page experience and directly influence search ranking.

## Summary

### Real User Monitoring (RUM)

RUM collects performance and behavioral data from real user sessions in production. Unlike synthetic monitoring (scheduled tests from a data center), RUM reflects the diversity of real-world conditions: slow Android devices, congested mobile networks, aggressive ad blockers, and geographically distant users.

**Key RUM metrics:**

- **Core Web Vitals** — Google's page experience signals (see below)
- **Time to First Byte (TTFB)** — server response latency
- **First Contentful Paint (FCP)** — when the first content is painted
- **Time to Interactive (TTI)** — when the page is reliably interactive
- **Custom marks** — application-specific milestones (e.g., "dashboard data loaded")
- **Error rate** — JavaScript exceptions per session
- **Rage clicks** — repeated clicks on non-interactive elements (UX frustration signal)
- **Dead clicks** — clicks on elements that produce no response

**RUM tools:** Vercel Analytics, Datadog RUM, New Relic Browser, Sentry Performance, web-vitals library (self-hosted reporting).

### Core Web Vitals

Google's three Core Web Vitals measure loading, interactivity, and visual stability:

| Metric | Measures | Good | Needs Improvement | Poor |
|---|---|---|---|---|
| **LCP** (Largest Contentful Paint) | Load performance | ≤ 2.5s | 2.5–4s | > 4s |
| **INP** (Interaction to Next Paint) | Responsiveness | ≤ 200ms | 200–500ms | > 500ms |
| **CLS** (Cumulative Layout Shift) | Visual stability | ≤ 0.1 | 0.1–0.25 | > 0.25 |

**Common LCP causes and fixes:**
- Unoptimized hero images → use `srcset`, WebP/AVIF, CDN, `loading="eager"`, `fetchpriority="high"`
- Render-blocking CSS/fonts → inline critical CSS, use `font-display: swap`
- Slow TTFB → edge caching, CDN, server-side optimization

**Common CLS causes and fixes:**
- Images without explicit `width`/`height` attributes → always set dimensions
- Late-loading ads or embeds → reserve space with aspect-ratio boxes
- Custom fonts causing text reflow → use `font-display: optional` or `size-adjust`
- Dynamic content injected above viewport content → append below, not prepend above

**INP (replaced FID in 2024):** Measures the responsiveness of all user interactions, not just the first. Long JavaScript tasks (>50ms) block the main thread and inflate INP. Use `scheduler.postTask()`, web workers, and code splitting to break up long tasks.

### Error Tracking with Sentry

Sentry captures JavaScript exceptions, stack traces, user context, and breadcrumbs (the sequence of events leading to the error). Configure it to filter noise and surface actionable errors.

**Critical Sentry configuration:**
- Source maps for readable stack traces (never ship source maps publicly — upload to Sentry only)
- User context (attach user ID, plan tier — never PII like email without consent)
- Release tracking to correlate error spikes with deployments
- Sampling rate: 100% for errors, 10–20% for performance transactions in high-traffic apps

### Performance Regression Alerting

The goal is to catch regressions before they reach users or before they compound. Alert on:
- LCP p75 (75th percentile) increases by more than 300ms from the rolling 7-day average
- Error rate increases by more than 0.5% from the rolling 24-hour baseline
- Any new error type appearing in production for the first time

## Deep Guidance

### Web Vitals Collection

```typescript
// web-vitals library — collect and report Core Web Vitals
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

function sendToAnalytics(metric: any) {
  // Batch metrics to avoid sending too many beacons
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,    // 'good', 'needs-improvement', 'poor'
    id: metric.id,
    navigationType: metric.navigationType,
    url: window.location.pathname,
    // Attach context for segmentation
    connectionType: (navigator as any).connection?.effectiveType,
    deviceMemory: (navigator as any).deviceMemory,
  });

  // sendBeacon is non-blocking and survives page unload
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/vitals', body);
  } else {
    fetch('/api/vitals', { method: 'POST', body, keepalive: true });
  }
}

// Register all Core Web Vitals + FCP + TTFB
onLCP(sendToAnalytics);
onINP(sendToAnalytics);
onCLS(sendToAnalytics);
onFCP(sendToAnalytics);
onTTFB(sendToAnalytics);
```

Always use `navigator.sendBeacon` for analytics reporting — it queues the request to be sent after the page unloads without blocking navigation.

### Custom Performance Marks

Use the User Timing API to measure application-specific milestones that browser APIs cannot capture:

```typescript
// Mark application-level performance milestones
class PerformanceTracker {
  private marks: Map<string, number> = new Map();

  mark(name: string): void {
    performance.mark(name);
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark?: string): number {
    const end = endMark || name + '-end';
    if (!endMark) this.mark(end);

    const measure = performance.measure(name, startMark, end);
    const duration = measure.duration;

    // Report to RUM
    this.report({ name, duration });
    return duration;
  }

  private report(metric: { name: string; duration: number }): void {
    navigator.sendBeacon?.('/api/perf', JSON.stringify(metric));
  }
}

const perf = new PerformanceTracker();

// Usage in application code
async function loadDashboard() {
  perf.mark('dashboard-fetch-start');
  const data = await fetchDashboardData();
  perf.mark('dashboard-fetch-end');

  perf.measure('dashboard-fetch', 'dashboard-fetch-start', 'dashboard-fetch-end');

  perf.mark('dashboard-render-start');
  renderDashboard(data);
  perf.mark('dashboard-render-end');

  perf.measure('dashboard-render', 'dashboard-render-start', 'dashboard-render-end');
}
```

These custom marks appear in Chrome DevTools Performance panel and can be reported to your RUM backend for tracking.

### Sentry Setup for Next.js

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENV,

  // Performance monitoring sample rate — adjust based on traffic volume
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Replay for error sessions only (privacy-conscious default)
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.0,

  // Filter noise — don't track network errors from ad blockers
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    /Loading chunk \d+ failed/,
  ],

  beforeSend(event, hint) {
    // Strip PII from error context
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
    }
    return event;
  },

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,     // Privacy: mask all text in replays
      blockAllMedia: true,   // Privacy: block media in replays
    }),
  ],
});
```

### CDN Analytics and Cache Hit Rate

Monitor CDN cache performance as a leading indicator for LCP and TTFB:

- **Cache hit rate** — percentage of requests served from CDN cache vs origin. Target >90% for static assets, >70% for edge-cached HTML.
- **Origin shield hit rate** — for CDN tiers that include an origin shield, a low rate indicates cold cache or poor cache-control headers.
- **Edge latency by region** — identify geographic regions where users have poor performance; expand CDN PoP coverage or investigate origin latency.

Key cache-control headers:
```
# Immutable static assets (hashed filenames)
Cache-Control: public, max-age=31536000, immutable

# HTML pages — revalidate frequently but serve stale while revalidating
Cache-Control: public, max-age=0, s-maxage=86400, stale-while-revalidate=3600

# API responses — no public cache, short browser cache
Cache-Control: private, max-age=30
```

Set `Surrogate-Key` (Fastly) or `Cache-Tag` (Cloudflare) headers on HTML responses to enable targeted cache purging when content changes.
