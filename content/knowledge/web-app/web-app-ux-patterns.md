---
name: web-app-ux-patterns
description: Responsive design, loading states, error boundaries, offline patterns, optimistic updates, and accessibility (WCAG) for web apps
topics: [web-app, ux, responsive-design, loading-states, error-handling, accessibility, wcag, offline, optimistic-updates]
---

UX patterns are the difference between an app that users trust and one they abandon. The patterns covered here are not visual design choices — they are engineering decisions about how the app communicates state, handles failure, and responds to interaction. Implement them consistently across the entire app or they create a fragmented user experience that signals poor quality.

## Summary

### Responsive Design: Mobile-First

Design and implement for mobile first, then add complexity for larger screens. This discipline prevents the "desktop first, mobile afterthought" failure mode:

```css
/* Mobile default: full width stack */
.product-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--sp-4);
}

/* Tablet: 2 columns */
@media (min-width: 768px) {
  .product-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop: 3 columns */
@media (min-width: 1024px) {
  .product-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

Touch targets must be at least 44 × 44 px (Apple HIG) or 48 × 48 px (Material Design). Smaller tap targets on mobile cause accidental taps and user frustration. This is both a UX and accessibility requirement.

Viewport-relative units (`vw`, `vh`, `svh`, `dvh`) handle mobile browser chrome (address bars, bottom navigation) correctly. Use `dvh` for full-height layouts on mobile — `100vh` overflows when the browser chrome is visible.

### Loading States

Never show a blank screen or unresponsive UI during data fetching. Use the appropriate loading pattern for the context:

- **Skeleton screens**: Render a content-shaped placeholder that mirrors the final layout. Reduces perceived load time and prevents layout shift when content arrives. Preferred over spinners for content that has a predictable layout.
- **Progressive loading**: Render low-quality or partial content immediately, replace with full content as it loads. Image blur-up (blur-hash placeholder → full image) is a common example.
- **Inline spinners**: For user-triggered actions (button submit, form save) where a skeleton does not make sense. Keep spinners small and contextual — a full-page spinner on a button press is jarring.
- **Optimistic updates**: Show the result immediately, apply it to the server in the background (see below). Best perceived performance.

Never show a loading state for actions that complete under 100 ms. Adding a spinner to fast operations makes the app feel slower.

### Error Boundaries

React error boundaries prevent a single component crash from destroying the entire page:

```tsx
// components/ErrorBoundary.tsx
class ErrorBoundary extends React.Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, info);  // Send to Sentry, Datadog, etc.
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
```

Place error boundaries at meaningful granularity: one per major page section, not one per component (too granular) and not one per app (too coarse). When the sidebar crashes, the main content should still work.

Provide actionable fallback UIs: "Something went wrong" with a Retry button, not a blank space. Log errors to your monitoring service with full context (user ID, route, component stack) so you can fix them.

### Offline Patterns

If the app targets users who may lose connectivity (mobile users, field workers, PWA), design for it explicitly:

- **Detect connectivity**: `navigator.onLine` and the `online`/`offline` events. React Query and SWR automatically pause requests while offline and retry on reconnect.
- **Cache reads**: Service worker with a cache-first or stale-while-revalidate strategy for read operations. Users see the last known state instead of an error page.
- **Queue writes**: Store mutations locally (IndexedDB via Dexie, or background sync API) and replay them when connectivity restores. Essential for field apps where users must be able to submit forms offline.
- **Communicate status**: Show a banner when offline. Tell users which data may be stale. Do not silently fail mutations — tell the user the action is queued.

Implementing offline support adds significant complexity. Scope it to the specific user journeys that need it, not the entire app.

### Optimistic Updates

Optimistic updates apply the result of a mutation to the UI immediately, before server confirmation:

```typescript
// React Query optimistic update pattern
const mutation = useMutation({
  mutationFn: updateTodo,
  onMutate: async (newTodo) => {
    await queryClient.cancelQueries({ queryKey: ["todos"] });
    const previousTodos = queryClient.getQueryData(["todos"]);
    queryClient.setQueryData(["todos"], (old) =>
      old.map((t) => t.id === newTodo.id ? { ...t, ...newTodo } : t)
    );
    return { previousTodos };
  },
  onError: (error, variables, context) => {
    queryClient.setQueryData(["todos"], context.previousTodos);
    showError("Failed to save changes.");
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
});
```

Use optimistic updates for: toggling checkboxes, likes/favorites, reordering, simple field edits. Do not use for: payments, irreversible actions, or anything where showing a false success state is harmful.

## Deep Guidance

### Accessibility Implementation

WCAG compliance is a legal requirement in many jurisdictions (ADA, EN 301 549, AODA) and a quality signal for all users:

**Keyboard navigation:**
- Every interactive element reachable by Tab key in logical order
- Focus styles visible and high-contrast (never `outline: none` without a replacement)
- Modal dialogs trap focus; Escape closes them
- Custom interactive components (dropdowns, sliders, date pickers) implement ARIA keyboard patterns from the WAI-ARIA Authoring Practices Guide

**Screen reader support:**
- Semantic HTML first: `<button>` not `<div onClick>`, `<nav>` not `<div class="nav">`, `<h1>`–`<h6>` for heading hierarchy
- `alt` text on all meaningful images; `alt=""` for decorative images
- `aria-label` or `aria-labelledby` for elements whose text content does not describe their purpose
- Live regions (`aria-live="polite"`) for dynamic content updates (error messages, notifications)
- Test with VoiceOver (macOS/iOS) and NVDA (Windows) — automated tools miss 60–70% of real issues

**Color and contrast:**
- Minimum 4.5:1 contrast ratio for normal text, 3:1 for large text (WCAG AA)
- Do not rely on color alone to convey meaning — add icons, patterns, or text labels

### Form UX Patterns

Forms are the highest-friction interaction in most apps. Apply these patterns:

- **Inline validation**: Validate on blur (not on keystroke) to avoid distracting errors as users type. Show success states to confirm correct input.
- **Error placement**: Show field-level errors directly below the field, not in a summary banner. Users must not hunt to find which field has an error.
- **Label positioning**: Labels above inputs, not placeholders-as-labels. Placeholder text disappears when the user types and fails accessibility requirements.
- **Disabled submit vs. validation feedback**: Do not disable the submit button with no explanation. Instead, allow submission and show validation errors. Disabled buttons with no label are inaccessible and frustrating.

### Toast / Notification Patterns

Notifications must not interrupt user flow or require dismissal for low-priority information:

- **Success toasts**: Auto-dismiss after 4–5 seconds. No action required.
- **Error toasts**: Persist until dismissed or action taken. User must be able to act on the error.
- **Placement**: Bottom-right (desktop) or bottom-center (mobile) to avoid covering primary content.
- **Screen reader**: Announce via `aria-live="polite"` for non-critical messages, `aria-live="assertive"` only for critical errors. Assertive announcements interrupt screen reader narration — use sparingly.
