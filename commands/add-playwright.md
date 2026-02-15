---
description: "Configure Playwright for web app testing"
---

Configure Playwright MCP for browser automation and visual testing in this project if applicable, otherwise tell me we don't need this. The Playwright MCP server has already been added to Claude Code.

Review docs/tech-stack.md, docs/tdd-standards.md, and CLAUDE.md to understand the existing project conventions.

## Objectives

1. Configure Playwright for the project's frontend testing needs
2. Establish patterns for visual verification of frontend features
3. Integrate browser testing into the existing TDD workflow
4. Update CLAUDE.md with browser testing procedures

## Available MCP Commands

You have access to these Playwright MCP tools:

### Navigation & Waiting
- `browser_navigate` — Navigate to a URL
- `browser_wait_for` — Wait for an element, network idle, or timeout
- `browser_close` — Close the browser session

### Interaction
- `browser_click` — Click an element
- `browser_type` — Type text into an input field
- `browser_fill` — Fill a form field (clears existing content first)
- `browser_select` — Select an option from a dropdown
- `browser_hover` — Hover over an element
- `browser_scroll` — Scroll the page or an element

### Inspection & Verification
- `browser_take_screenshot` — Capture a screenshot (full page or element)
- `browser_evaluate` — Execute JavaScript in the browser context
- `browser_get_text` — Get text content of an element
- `browser_get_attribute` — Get an attribute value from an element

## What to Configure

### 1. Project Configuration

Create or update configuration files for Playwright in the project:
- Base URL configuration (local dev server, staging)
- Default viewport sizes (desktop, tablet, mobile)
- Screenshot directory structure
- Timeout defaults appropriate for our app

### 2. Screenshot Organization

Set up a systematic screenshot storage approach:
```
/tests/screenshots/
  /baseline/          # Known-good reference screenshots
  /current/           # Screenshots from current test run
  /diff/              # Visual diff outputs (if using comparison)
```

Define naming conventions for screenshots that include:
- Feature or user story ID
- Viewport size
- State being captured (e.g., `US-012_checkout_mobile_empty-cart.png`)

### 3. Visual Testing Patterns

Document reusable patterns for common scenarios:

**Page Load Verification**
```
1. browser_navigate to URL
2. browser_wait_for critical element or network idle
3. browser_take_screenshot for visual verification
```

**User Flow Verification**
```
1. browser_navigate to starting point
2. browser_fill / browser_click through the flow
3. browser_wait_for expected outcome
4. browser_take_screenshot at key states
5. browser_evaluate to assert DOM state if needed
```

**Responsive Verification**
```
For each viewport (desktop, tablet, mobile):
  1. Set viewport size
  2. browser_navigate
  3. browser_take_screenshot
```

**Error State Verification**
```
1. browser_navigate
2. Trigger error condition (invalid input, failed request)
3. browser_wait_for error UI
4. browser_take_screenshot
5. browser_get_text to verify error message content
```

### 4. Integration with TDD Workflow

Define how browser testing fits with existing TDD standards:
- When to use Playwright vs. unit/integration tests (Playwright for visual verification and E2E flows, not for logic testing)
- Screenshot review as part of the verification step before marking Beads tasks complete
- How to handle visual regression (baseline comparison strategy)

### 5. Update CLAUDE.md

Add a section to CLAUDE.md covering:

```markdown
## Browser Testing with Playwright MCP

When implementing frontend features, use Playwright MCP for visual verification:

### When to Use
- Verifying UI renders correctly after implementing a feature
- Testing user flows end-to-end
- Checking responsive layouts
- Capturing error states and edge cases

### Verification Process
1. Start the dev server if not running
2. Use `browser_navigate` to load the relevant page
3. Use `browser_wait_for` to ensure content is loaded
4. Use `browser_take_screenshot` to capture the current state
5. Review screenshot to verify correctness
6. For interactive flows: use `browser_click`, `browser_fill`, etc. to simulate user actions
7. Capture screenshots at key states throughout the flow

### Screenshot Naming
`{story-id}_{feature}_{viewport}_{state}.png`
Example: `US-012_checkout_desktop_success.png`

### Common Patterns
[Include the patterns defined above]

### Rules
- Always `browser_wait_for` before taking screenshots — don't capture loading states accidentally
- Always `browser_close` when done to clean up resources
- Capture both success AND error states
- Test at minimum desktop (1280px) and mobile (375px) viewports for any UI work
```

### 6. Update TDD Standards

Fill in the E2E placeholder section in `docs/tdd-standards.md` (the TDD prompt created a "### 7. E2E / Visual Testing" placeholder for this):
```markdown
### 7. E2E / Visual Testing (Playwright)

**When to write Playwright tests:**
- Verifying UI renders correctly after implementing a feature
- Testing complete user flows end-to-end (login → action → result)
- Checking responsive layouts at multiple viewports
- Capturing error states and visual regressions

**When NOT to use Playwright:**
- Testing business logic (use unit tests)
- Testing API endpoints (use integration tests)
- Testing utility functions (use unit tests)

**Playwright tests are written AFTER the feature works**, as verification. They are NOT part of the Red→Green→Refactor TDD cycle — they verify the integrated result.

**Required tests per UI story:**
- Happy path screenshot at desktop (1280px) and mobile (375px)
- Primary error state screenshot
- Key interactive states (loading, empty, populated)

**Screenshot naming:** `{story-id}_{feature}_{viewport}_{state}.png`
Example: `US-012_checkout_desktop_success.png`

**Baseline management:**
- Baseline screenshots committed to `tests/screenshots/baseline/`
- Current run screenshots in `tests/screenshots/current/` (gitignored)
```

## What NOT to Do

- Don't use Playwright for testing business logic — that's what unit tests are for
- Don't store screenshots in git unless they're intentional baselines
- Don't skip the wait step — flaky screenshots waste time
- Don't leave browser sessions open — always close when done

## Process

- Review the frontend tech stack to understand what's being rendered and how
- Review existing user stories to understand the key user flows that need visual verification
- Create the configuration files and directory structure
- Update CLAUDE.md with the browser testing section
- Run a quick smoke test: navigate to the app, take a screenshot, and close — verify the setup works
- Use AskUserQuestionTool to confirm viewport sizes, baseline storage strategy, and any project-specific conventions

## After This Step

When this step is complete, tell the user:

---
**Phase 4 in progress** — Playwright configured for web app testing.

**Next:**
- If your project **also** has a mobile app: Run `/scaffold:add-maestro` — Configure Maestro for mobile app testing.
- Otherwise: Skip to `/scaffold:user-stories` — Create user stories (starts Phase 5).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
