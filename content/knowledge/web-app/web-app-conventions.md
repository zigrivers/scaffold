---
name: web-app-conventions
description: Component naming, file colocation, state management patterns, custom hook conventions, and CSS methodology selection for web apps
topics: [web-app, conventions, components, state-management, css, hooks]
---

Conventions are the difference between a codebase where any engineer can find and modify any file in minutes versus one where only the original author can navigate it confidently. Establish these once, enforce them via linting and code review, and never let individual preferences override them during the project lifecycle.

## Summary

Web app conventions establish consistent patterns for component naming (PascalCase, domain-specific), file colocation (feature-based over type-based), state management (local, server, global, URL tiers), custom hook conventions, and CSS methodology selection. Choose one approach per area and enforce it via linting.

## Deep Guidance

### Component Naming

- **PascalCase for components**: `UserProfile`, `NavigationMenu`, `CheckoutSummary`. This is universal across React, Vue (single-file components), and Svelte.
- **Descriptive, domain-specific names**: `ProductCard` not `Card`, `AuthModal` not `Modal`, `OrderStatusBadge` not `Badge`. Generic names cause naming conflicts as the codebase grows.
- **Suffix by type where ambiguous**: `UserList` (renders list), `UserListItem` (renders one item), `UserListContainer` (fetches data and passes to list). Be consistent — never mix `Container`/`Provider`/`Wrapper` conventions across the codebase.
- **Page components**: `LoginPage`, `DashboardPage`, `CheckoutPage` — suffix with `Page` to distinguish from reusable components.

### File Colocation

Colocate files that change together. The industry has converged on feature-based colocation over type-based grouping:

**Preferred (feature-colocated):**
```
features/
  user-profile/
    UserProfile.tsx
    UserProfile.test.tsx
    UserProfile.stories.tsx   # Storybook stories
    useUserProfile.ts         # Feature-specific hook
    user-profile.types.ts     # Feature-specific types
    index.ts                  # Barrel export
```

**Avoid (type-segregated):**
```
components/UserProfile.tsx
hooks/useUserProfile.ts
types/userProfile.ts
tests/UserProfile.test.tsx
```

The type-segregated structure requires navigating four directories to understand one feature. It also means deleting a feature requires hunting across the entire directory tree.

**Exception**: Truly shared utilities (`lib/`, `utils/`, `hooks/`) that have no single feature owner belong in a flat shared directory, not inside any feature.

### State Management Patterns

Choose the state tier that matches the problem. Do not reach for Redux when `useState` is sufficient:

- **Local state (`useState`, `useReducer`)**: UI-only state that no sibling or parent needs (open/closed, form draft, hover state). Keep it local.
- **Server state (React Query, SWR, RTK Query)**: Data fetched from an API. Use a server-state library — it handles caching, deduplication, background refresh, and error states for free. Do not put API data in a global Redux store unless you have a compelling reason.
- **Global client state (Zustand, Jotai, Redux Toolkit)**: Shared UI state that multiple distant components need (authenticated user, theme, cart items, notification queue). Use sparingly. Every piece of global state is a coupling point.
- **URL state**: Sort order, filters, pagination, tab selection — anything that should survive a page reload or be shareable via link. Use `useSearchParams` or a URL state library. This is underused; most "global state" is actually URL state in disguise.

### Custom Hook Conventions

- Name all custom hooks with the `use` prefix: `useAuth`, `usePagination`, `useDebounce`.
- Single responsibility: one hook does one thing. `useUserProfile` fetches and returns user data. It does not also handle form state.
- Return stable references: memoize returned objects and callbacks to prevent unnecessary re-renders in consumers.
- Keep hooks pure from the component's perspective: no side effects that the hook consumer cannot control. Accept options objects for configuration rather than hardcoding behavior.
- Co-locate the hook with the feature that owns it. Move to `lib/hooks/` only when reused across three or more features.

### CSS Methodology Selection

Choose one methodology and enforce it. Mixing methodologies creates chaos:

- **Tailwind CSS**: Best for teams that want to move fast and avoid naming bikeshedding. Excellent with design tokens. Downsides: verbose JSX, requires purging to avoid large CSS bundles, learning curve for custom designs.
- **CSS Modules**: Best for teams that prefer semantic class names and encapsulation without a utility framework. No runtime, good TypeScript support via `typed-css-modules`.
- **CSS-in-JS (styled-components, Emotion)**: Best for highly dynamic styles or design systems with programmatic theming. Downsides: runtime cost, hydration complexity with SSR.
- **Vanilla CSS with custom properties**: Best for simple apps or teams who want zero abstraction. Use a consistent BEM-like naming convention.

### Enforcing Conventions with Tooling

Conventions without enforcement degrade immediately. Configure linting to automate the common cases:

```json
// ESLint rules for React component conventions
{
  "rules": {
    "react/jsx-pascal-case": "error",          // Enforce PascalCase for JSX components
    "import/no-default-export": "warn",         // Prefer named exports (easier to find with search)
    "@typescript-eslint/naming-convention": [
      "error",
      { "selector": "function", "format": ["camelCase", "PascalCase"] },
      { "selector": "variable", "format": ["camelCase", "UPPER_CASE", "PascalCase"] }
    ]
  }
}
```

Add a Storybook or component documentation requirement: every shared component must have a story before it can be merged. This enforces composability — if you cannot write a story for it in isolation, the component is too coupled.

### State Management Decision Flowchart

When choosing state location, answer in order:

1. Is this state only used by one component? → `useState`
2. Is this state fetched from a server? → React Query / SWR
3. Can this state live in the URL? → `useSearchParams` / URL state
4. Is this state shared across multiple distant routes? → Zustand / Jotai / Redux Toolkit
5. Is this state needed server-side during SSR? → Context with SSR-safe initialization

Resist the urge to centralize all state globally. Distributed state is easier to delete when features are removed and easier to reason about during debugging.

### Hook Testing Conventions

Test hooks in isolation using `renderHook` from React Testing Library. This keeps hook logic testable without mounting a component:

```typescript
// Good: test hook behavior directly
const { result } = renderHook(() => useDebounce("search", 300));
expect(result.current).toBe("");
act(() => { jest.advanceTimersByTime(300); });
expect(result.current).toBe("search");
```

Never test a hook only via its parent component — that couples the hook test to the component's rendering and makes failures harder to diagnose.
