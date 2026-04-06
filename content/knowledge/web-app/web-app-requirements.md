---
name: web-app-requirements
description: SSR/SPA decision criteria, Core Web Vitals budgets, responsive breakpoints, browser support matrix, PWA considerations, and SEO requirements
topics: [web-app, requirements, performance, pwa, seo, accessibility]
---

Defining web app requirements before writing a line of code prevents the most expensive rework in the project lifecycle. Rendering strategy, performance budgets, and browser support targets affect every architectural decision downstream. Locking these down early — with explicit tradeoff acknowledgment — removes ambiguity and gives the team a shared definition of "done."

## Summary

Web app requirements establish rendering strategy (SSR for SEO, SPA for authenticated apps, hybrid for content-heavy sites), Core Web Vitals budgets (LCP < 2.5s, INP < 200ms, CLS < 0.1), responsive breakpoints from a shared token set, browser support matrix encoded via Browserslist, PWA scope decisions, and SEO requirements. Lock these down before sprint one.

## Deep Guidance

### SSR vs SPA Decision Criteria

Rendering strategy is the first architectural decision. The wrong choice costs weeks of retrofit:

- **Choose SSR (Next.js, Remix, SvelteKit, Nuxt)** when: SEO is critical (content sites, e-commerce, marketing), first-paint performance matters on slow connections, users are on low-powered devices, or content changes frequently and needs crawlability.
- **Choose SPA (React, Vue, Angular with CSR)** when: the app is behind authentication (no SEO need), interactions are highly dynamic (dashboards, tools, editors), and the user base is on capable hardware with fast connections.
- **Choose hybrid (SSG + client hydration)** when: most pages are static but some routes need real-time data. This is the default for most content-heavy sites — build pages at deploy time, hydrate interactive islands on the client.

Never choose SSR just because it is the current trend. Server rendering adds operational complexity (cold starts, caching headers, streaming), infrastructure cost, and harder debugging. Quantify the SEO and performance benefit before committing.

### Core Web Vitals Budgets

Establish explicit targets before sprint one. These directly affect Google ranking and user conversion:

- **LCP (Largest Contentful Paint)**: Target under 2.5 seconds on a 3G mobile connection. Optimize with image preloads, font subsetting, and eliminating render-blocking resources.
- **FID / INP (Interaction to Next Paint)**: Target under 200 ms. Long JavaScript tasks block the main thread. Break up tasks, defer non-critical code, use Web Workers for heavy computation.
- **CLS (Cumulative Layout Shift)**: Target under 0.1. Reserve space for images and embeds. Avoid inserting content above the fold after initial paint.

Set budget alerts in Lighthouse CI on every PR. Treat regressions as build failures.

### Responsive Breakpoints

Establish a breakpoint set and document it in the design system. A common mobile-first set:

- **Mobile**: base styles (320–767 px)
- **Tablet**: 768 px and up
- **Desktop**: 1024 px and up
- **Wide**: 1280 px and up (optional; cap content width at 1440 px to prevent excessive line length)

Do not invent per-component breakpoints. All breakpoints must come from a shared token set in CSS custom properties or a design token file.

### Browser Support Matrix

Define this explicitly and commit it to the repo's `CONTRIBUTING.md` or a `BROWSERS.md` file:

- **Evergreen tier** (full support): Chrome, Edge, Firefox, Safari — last 2 major versions
- **Legacy tier** (functional, degraded): IE 11, Safari 12 — no graceful degradation unless business requires it
- **Mobile browsers**: Chrome for Android, Safari iOS — test on real devices, not just emulators

Use Browserslist to encode the matrix and share it across tools (Babel, PostCSS Autoprefixer, ESLint). Target: `"> 0.5%, last 2 versions, not dead"` as a safe default.

### PWA Considerations

Decide at project start whether PWA features are required:

- **Service worker / offline**: Required if the app must function without connectivity or if mobile install is a goal. Adds complexity — cache invalidation is the #1 source of PWA bugs.
- **Web App Manifest**: Low cost, high value. Enables mobile home screen install and controls display mode. Add for any app targeting mobile users.
- **Push notifications**: Requires backend infrastructure and user permission flows. Scope carefully — most apps do not need this.

### SEO Requirements

For public-facing apps:

- Server-render or statically generate all pages indexed by search engines. Client-rendered content is not reliably indexed.
- Implement `<title>`, `<meta description>`, Open Graph, and structured data (JSON-LD) on every route.
- Generate a sitemap at deploy time; submit to Google Search Console.
- Ensure canonical URLs, `robots.txt`, and proper handling of 404/301/302 responses.

### Performance Budget Enforcement

Encode budgets in `budget.json` and enforce in CI:

```json
{
  "resourceSizes": [
    { "resourceType": "script", "budget": 300 },
    { "resourceType": "total", "budget": 1000 },
    { "resourceType": "image", "budget": 500 }
  ],
  "timings": [
    { "metric": "first-contentful-paint", "budget": 1500 },
    { "metric": "interactive", "budget": 3500 },
    { "metric": "largest-contentful-paint", "budget": 2500 }
  ]
}
```

Run `lighthouse-ci` on every PR against a representative page. Block merges that regress LCP, INP, or CLS beyond tolerance.

### Defining "Supported" vs "Functional"

Do not conflate browser support tiers. Define what each means:

- **Supported**: All features work, tested in CI, regressions are P0 bugs.
- **Functional**: Core user journey works, advanced features may degrade gracefully.
- **Unsupported**: App may not load at all; display an upgrade notice.

Document which tier each browser falls into and socialize it with stakeholders before launch. Retrofitting support after launch is significantly more expensive than scoping it at project start.

### Accessibility Requirements

Accessibility is a requirement, not a feature. Decide on the compliance target upfront:

- **WCAG 2.1 AA**: Industry baseline. Required for most government and enterprise customers.
- **WCAG 2.2 AA**: Current standard; prefer this for new projects.
- **Section 508**: Required for US federal contractors.

Automated tools (axe, Lighthouse) catch ~30–40% of issues. Manual keyboard navigation and screen reader testing (VoiceOver, NVDA) must supplement automation.
