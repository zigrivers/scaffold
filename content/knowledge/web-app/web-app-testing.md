---
name: web-app-testing
description: Component testing with Testing Library, SSR testing, E2E testing with Playwright, visual regression, accessibility testing with axe-core, and Lighthouse CI
topics: [web-app, testing, playwright, testing-library, accessibility, visual-regression, lighthouse, e2e]
---

Web application testing requires covering multiple distinct layers: component behavior, server rendering correctness, end-to-end user flows, visual appearance, accessibility compliance, and performance budgets. Each layer catches different classes of bugs and has different cost/value characteristics. The correct strategy invests heavily in component and integration tests (fast feedback, high coverage), uses E2E tests for critical user journeys (slow but comprehensive), and enforces visual and performance budgets in CI (catches regressions before users do).

## Summary

### Testing Layers

**Component tests (Testing Library):** Test components in isolation from the DOM's perspective — interactions, rendering, and state changes. These form the bulk of the test suite. Use `@testing-library/user-event` for realistic interactions, not `fireEvent`.

**Integration tests:** Test pages or feature slices with real data flow but mocked network calls. Verify that components interact correctly. In Next.js: test pages as React components with a mocked router.

**SSR tests (render-to-string):** Verify server-rendered HTML is correct and does not throw. Check that SSR and hydration produce consistent output (no hydration mismatches). Use `@testing-library/react`'s `renderToStaticMarkup` or framework-specific utilities.

**E2E tests (Playwright):** Test complete user flows in a real browser against a running application. Reserve for high-value, business-critical flows: registration, login, checkout, core product value proposition. Keep the E2E suite small and fast (target under 10 minutes for the critical path).

**Visual regression tests:** Screenshot comparison against committed baselines. Catch unintended UI changes from CSS refactors, component updates, or dependency upgrades. Run against a static Storybook deployment for fast, stable comparisons.

**Accessibility tests (axe-core):** Automated WCAG compliance checking. Catches ~30–40% of accessibility issues automatically. Not a substitute for manual testing with a screen reader, but essential for catching regressions.

**Performance tests (Lighthouse CI):** Enforce performance budgets in CI. Fail the build if LCP, CLS, or INP regressions are detected.

### Testing Library Principles

Testing Library is designed around the principle that tests should resemble how users interact with the application:

- **Query by role first** — `getByRole('button', { name: 'Submit' })` over `getByTestId`
- **Query by label text** — `getByLabelText('Email address')` for form inputs
- **Never query by CSS class** — classes are implementation details, not behavior
- **Use `userEvent` not `fireEvent`** — `userEvent.type()` simulates real keystrokes including focus, blur, and change events; `fireEvent` dispatches synthetic events that skip browser behaviors

### Playwright for E2E

Playwright supports Chromium, Firefox, and WebKit. Configure it to run against your staging environment in CI and your local dev server locally. Key features:
- Auto-waiting: Playwright automatically waits for elements to be ready before interacting
- Network mocking: intercept and mock API responses in tests
- Trace viewer: visual debugging of test failures with full network and DOM timeline
- Component testing: Playwright can also test components in isolation (alternative to Testing Library for teams that want one tool)

## Deep Guidance

### Component Testing Patterns

```typescript
// UserProfile.test.tsx — Testing Library patterns
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserProfile } from './UserProfile';
import { server } from '@/mocks/server';  // MSW mock server
import { http, HttpResponse } from 'msw';

describe('UserProfile', () => {
  it('displays user data after loading', async () => {
    render(<UserProfile userId="user-123" />);

    // Loading state
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Data loads
    await screen.findByText('Jane Smith');  // Awaits element appearance
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('allows editing the display name', async () => {
    const user = userEvent.setup();
    render(<UserProfile userId="user-123" />);

    await screen.findByText('Jane Smith');
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));

    const nameInput = screen.getByLabelText('Display name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByText('Profile updated successfully');
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('shows an error message when the save fails', async () => {
    // Override the default MSW handler for this test
    server.use(
      http.patch('/api/users/:id', () =>
        HttpResponse.json({ error: 'Server error' }, { status: 500 })
      )
    );

    const user = userEvent.setup();
    render(<UserProfile userId="user-123" />);

    await screen.findByText('Jane Smith');
    await user.click(screen.getByRole('button', { name: 'Edit profile' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await screen.findByRole('alert');
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });
});
```

Use Mock Service Worker (MSW) for network mocking — it intercepts requests at the network level, making tests work identically in browser and Node environments.

### Playwright E2E Tests

```typescript
// tests/e2e/auth.spec.ts — Playwright E2E for critical auth flow
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can register and log in', async ({ page }) => {
    const email = `test-${Date.now()}@example.com`;

    // Registration
    await page.goto('/register');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill('SecureP@ss123');
    await page.getByLabel('Confirm password').fill('SecureP@ss123');
    await page.getByRole('button', { name: 'Create account' }).click();

    // Should redirect to onboarding
    await expect(page).toHaveURL('/onboarding');
    await expect(page.getByText('Welcome')).toBeVisible();

    // Log out
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/');

    // Log in
    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill('SecureP@ss123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL('/dashboard');
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill('nonexistent@example.com');
    await page.getByLabel('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid email or password');
    await expect(page).toHaveURL('/login');
  });
});
```

### Accessibility Testing with axe-core

```typescript
// Integrate axe-core into component tests
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('Accessibility', () => {
  it('LoginForm has no accessibility violations', async () => {
    const { container } = render(<LoginForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// Playwright accessibility snapshot
test('dashboard is accessible', async ({ page }) => {
  await page.goto('/dashboard');
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
```

Axe-core checks: missing alt text, insufficient color contrast, missing form labels, improper heading hierarchy, keyboard navigation issues, and ARIA attribute misuse. Run it against every page in CI.

### Lighthouse CI Configuration

```yaml
# lighthouserc.yml
ci:
  collect:
    url:
      - 'http://localhost:3000/'
      - 'http://localhost:3000/dashboard'
    numberOfRuns: 3  # Average across multiple runs for stability
    settings:
      preset: 'desktop'
      throttling:
        rttMs: 40
        throughputKbps: 10240
        cpuSlowdownMultiplier: 1

  assert:
    preset: 'lighthouse:no-pwa'
    assertions:
      # Core Web Vitals
      largest-contentful-paint:
        - error
        - maxNumericValue: 2500
          aggregationMethod: optimistic  # Use best of N runs
      cumulative-layout-shift:
        - error
        - maxNumericValue: 0.1
      total-blocking-time:
        - warn
        - maxNumericValue: 300

      # Performance budget
      uses-optimized-images: ['warn', { minScore: 0.9 }]
      uses-text-compression: ['error', { minScore: 1 }]
      render-blocking-resources: ['warn', { minScore: 0.8 }]

      # Accessibility
      categories:accessibility: ['error', { minScore: 0.9 }]
```

Run Lighthouse CI in a separate CI step after deployment to your staging environment. Fail only on errors (hard regressions); warn on improvements.

### SSR Hydration Testing

```typescript
// Verify SSR output and hydration consistency
import { renderToString } from 'react-dom/server';
import { render } from '@testing-library/react';

test('ProductCard renders consistently in SSR and client', () => {
  const props = { name: 'Widget', price: 29.99 };

  // SSR render
  const ssrHTML = renderToString(<ProductCard {...props} />);

  // Client render
  const { container } = render(<ProductCard {...props} />);

  // Compare — normalize whitespace differences
  const normalize = (html: string) => html.replace(/\s+/g, ' ').trim();
  expect(normalize(container.innerHTML)).toBe(normalize(ssrHTML));
});
```

Hydration mismatches produce React warnings in development and can cause visual flicker in production. Test SSR/client consistency for any component that uses `Date.now()`, `Math.random()`, browser APIs, or dynamic imports.
