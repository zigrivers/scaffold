---
name: web-app-project-structure
description: Directory layout conventions, route organization, shared vs feature modules, barrel exports, and config file placement for web apps
topics: [web-app, project-structure, architecture, routing, modules]
---

A well-structured web app project is navigable by any developer without a tour. The directory layout should communicate the architecture at a glance: where pages live, where shared code lives, where API logic lives, and where configuration lives. A poor structure forces every developer to ask "where does this go?" on every new file they create.

## Summary

### Standard Directory Layout

For a Next.js or similar SSR framework, the canonical structure is:

```
src/
  app/              # App Router pages and layouts (Next.js 13+)
  pages/            # Pages Router (Next.js legacy; or Remix/Vite routes)
  components/       # Shared, reusable UI components
  features/         # Feature modules (colocated components + hooks + logic)
  hooks/            # Shared custom hooks used across features
  lib/              # Framework-agnostic utilities and service clients
  api/              # API route handlers (serverless functions)
  types/            # Shared TypeScript types and interfaces
  styles/           # Global CSS, design tokens, theme config
public/             # Static assets served at root (images, fonts, robots.txt)
```

For a Vite/React SPA, drop `app/` and `api/` and substitute:

```
src/
  routes/           # Route components and nested layouts
  pages/            # Page-level components (one per route)
```

### Route Organization

Routes should mirror the URL structure. Avoid flat route files that make the hierarchy ambiguous:

- `/dashboard` → `app/dashboard/page.tsx`
- `/dashboard/settings` → `app/dashboard/settings/page.tsx`
- `/users/[id]` → `app/users/[id]/page.tsx`

Keep route files thin — they orchestrate data loading and pass props to feature components. Business logic belongs in `features/`, not in the page file.

**Layouts**: Use layout files (`layout.tsx`) to share navigation, auth checks, and providers across route groups. Do not repeat these in every page file.

### Shared vs Feature Modules

The critical distinction is "who owns this code":

- **Feature module** (`features/checkout/`): Owned by one product domain. Contains everything the checkout feature needs — components, hooks, API calls, types. Other features do not import from it directly; they use shared interfaces.
- **Shared module** (`components/`, `hooks/`, `lib/`): Owned by no single feature. Used by two or more features. Has no knowledge of any specific feature's business logic.

The rule: shared modules must have zero imports from feature modules. Feature modules may import from shared modules. This prevents circular dependencies and keeps shared code reusable.

### Barrel Exports

Use `index.ts` barrel files at the feature and component directory level to create clean import paths:

```typescript
// features/user-profile/index.ts
export { UserProfile } from "./UserProfile";
export { useUserProfile } from "./useUserProfile";
export type { UserProfileData } from "./user-profile.types";
```

Consumers import from `features/user-profile`, not from deep internal paths:
```typescript
// Good
import { UserProfile } from "@/features/user-profile";

// Bad — leaks internal structure
import { UserProfile } from "@/features/user-profile/components/UserProfile";
```

Configure TypeScript path aliases (`@/`) to avoid relative path ladders (`../../../../../../`).

### Config Files

Config files belong at the repo root, not inside `src/`. Standard placement:

- `next.config.ts` / `vite.config.ts` — build and bundler config
- `tsconfig.json` — TypeScript compiler config
- `eslint.config.js` — linting rules
- `.env.example` — documented environment variables (committed); `.env.local` — actual values (gitignored)
- `tailwind.config.ts` — if using Tailwind
- `vitest.config.ts` / `jest.config.ts` — test runner config

## Deep Guidance

### Feature Module Template

Every feature module follows the same internal structure. Establish this template in `CONTRIBUTING.md`:

```
features/
  <feature-name>/
    index.ts                  # Barrel export — public API of the feature
    <FeatureName>.tsx          # Top-level feature component
    <FeatureName>.test.tsx     # Component tests
    <FeatureName>.stories.tsx  # Storybook stories (if applicable)
    use<FeatureName>.ts        # Primary data hook
    use<FeatureName>.test.ts   # Hook tests
    <feature-name>.types.ts    # TypeScript types for this feature
    <feature-name>.api.ts      # API calls made by this feature (if applicable)
    components/                # Sub-components used only within this feature
      <SubComponent>.tsx
```

Enforce "no cross-feature imports" with ESLint:

```javascript
// eslint-plugin-import rule to prevent cross-feature imports
"import/no-restricted-paths": [
  "error",
  {
    "zones": [{
      "target": "./src/features",
      "from": "./src/features",
      "except": ["./src/features/index.ts"] // Only barrel is importable
    }]
  }
]
```

### Environment Variable Management

Never hardcode environment-specific values. Use `.env` files and document every variable:

```bash
# .env.example — committed to the repo
# Never commit .env, .env.local, or .env.production

# API base URL
NEXT_PUBLIC_API_URL=https://api.example.com

# Auth provider
NEXT_PUBLIC_AUTH_DOMAIN=your-domain.auth0.com
AUTH_SECRET=          # Server-only; never expose to client (no NEXT_PUBLIC_ prefix)

# Feature flags
NEXT_PUBLIC_FEATURE_NEW_CHECKOUT=false
```

Validate environment variables at startup using a schema (Zod is ideal). Fail fast with a clear error message if required variables are missing or malformed. Never let the app silently run with bad configuration.

### Avoiding the "Utils Dumping Ground"

A `utils/` directory with no sub-organization becomes a junk drawer within weeks. Apply the same discipline to utilities:

- Group by domain: `lib/date.ts`, `lib/currency.ts`, `lib/validation.ts`
- If a utility grows beyond ~100 lines, give it its own directory with an `index.ts`
- Delete utilities that are no longer used — dead code in `lib/` is worse than no code
- Never put business logic in `lib/`. Business logic belongs in features or hooks.

The test for whether something belongs in `lib/`: "Could I copy this to a different web app project without modification?" If yes, it belongs in `lib/`. If it has knowledge of this app's domain, it belongs in `features/` or `hooks/`.
