---
description: "Configure E2E testing for your project"
long-description: "Detects project platform (web, mobile, or both) from tech-stack.md and package.json, then configures Playwright and/or Maestro with test patterns, screenshot management, and documentation updates. Self-skips for backend-only projects."
---

Configure end-to-end testing for this project. This step auto-detects which platform(s) the project targets and configures the appropriate E2E framework(s).

Review docs/tech-stack.md, docs/tdd-standards.md, and CLAUDE.md to understand the existing project conventions.

## Step 0: Platform Detection & Applicability

Before doing anything else, determine if this step applies and which sections to run.

### Detect Platform Type

1. **Read** `docs/tech-stack.md` and `package.json` (or `app.json` for Expo projects)
2. **Identify platform signals:**

**Web app signals** (any of these → configure Playwright):
- `react-dom`, `next`, `@remix-run/react`, `gatsby`, `@sveltejs/kit`, `svelte`, `vue`, `@angular/core`, `vite` in package.json dependencies
- Tech-stack.md mentions a web frontend framework, SSR, or SPA rendering

**Mobile app signals** (any of these → configure Maestro):
- `expo`, `react-native` in package.json dependencies
- `app.json` or `app.config.js` exists with Expo configuration
- Tech-stack.md mentions Expo, React Native, or mobile platforms

3. **Decision:**

| Detection Result | Action |
|-----------------|--------|
| Web only | Run **Playwright sections only**, skip all Maestro sections |
| Mobile only | Run **Maestro sections only**, skip all Playwright sections |
| Both web and mobile | Run **both** Playwright and Maestro sections |
| Neither detected | **AUTO-SKIP**: Tell the user "No web or mobile frontend detected in tech-stack or package.json. Skipping E2E testing setup." Then stop. |

State the detection result explicitly before proceeding (e.g., "Detected: web app (Next.js). Configuring Playwright.").

### Brownfield Detection

After determining the platform, check if E2E testing is already configured:

**Playwright brownfield signals:**
- `@playwright/test` in package.json dependencies or devDependencies
- `playwright.config.ts` or `playwright.config.js` exists in project root
- `tests/screenshots/` or `tests/e2e/` directory exists with content

**Maestro brownfield signals:**
- `maestro/` directory exists with `.yaml` flow files
- `maestro/config.yaml` exists
- package.json has a `test:e2e` script referencing `maestro`

**If brownfield detected** → Inform the user ("Detected existing Playwright configuration. Running in update mode.") and proceed directly to update mode for that platform. Skip the fresh/update mode detection question.

**If no brownfield detected** → Proceed to Mode Detection as normal.

---

## Mode Detection

**Skip this section if brownfield detection already determined the mode.**

Check if E2E config files already exist:
- Playwright: `playwright.config.ts`, `playwright.config.js`, or `tests/screenshots/`
- Maestro: `maestro/` directory

**If no config exists → FRESH MODE**: Create from scratch.

**If config exists → UPDATE MODE**:
1. **Read & analyze**: Read existing config files, the E2E sections of `docs/tdd-standards.md`, and testing sections of `CLAUDE.md`. Check for tracking comments: `// scaffold:playwright v<ver> <date>` or `# scaffold:maestro v<ver> <date>`. If absent, treat as legacy — be extra conservative.
2. **Diff against current structure**: Categorize content as ADD / RESTRUCTURE / PRESERVE.
3. **Cross-doc consistency**: Verify updates won't contradict `docs/tdd-standards.md`, `docs/dev-setup.md`, `CLAUDE.md`.
4. **Preview changes**: Present summary table. Wait for user approval.
5. **Execute update**: Add missing sections, preserve project-specific content.
6. **Update tracking comments** on config files.
7. **Report** what was added, restructured, and preserved.

### Update Mode Specifics
- **Preserve**: Baseline screenshots (never delete), custom viewport configurations, existing flow files, sub-flows, testID conventions, environment variables
- **Related docs**: `docs/tdd-standards.md`, `docs/dev-setup.md`, `CLAUDE.md`
- **Special rules**: Update tdd-standards.md E2E sections in-place (don't append duplicates)

---

## Web App Testing (Playwright)

**Skip this entire section if platform detection found no web frontend.**

### Objectives

1. Configure Playwright for the project's frontend testing needs
2. Establish patterns for visual verification of frontend features
3. Integrate browser testing into the existing TDD workflow
4. Update CLAUDE.md with browser testing procedures

### Framework-Specific Configuration

Read `docs/tech-stack.md` and `package.json` to determine the web framework, then generate the appropriate Playwright configuration with the correct dev server:

| Framework | webServer.command | Default Port | Base URL |
|-----------|------------------|-------------|----------|
| **Next.js** | `npm run dev` | 3000 | `http://localhost:3000` |
| **Vite** (React/Vue/Svelte) | `npx vite --port 5173` | 5173 | `http://localhost:5173` |
| **Remix** | `npm run dev` | 3000 | `http://localhost:3000` |
| **Gatsby** | `npm run develop` | 8000 | `http://localhost:8000` |
| **SvelteKit** | `npm run dev` | 5173 | `http://localhost:5173` |
| **Angular** | `npm start` | 4200 | `http://localhost:4200` |
| **Unknown/Other** | `npm start` | — | Ask user for URL |

Generate `playwright.config.ts` (or `.js`) using the detected framework:

```typescript
// scaffold:playwright v1 YYYY-MM-DD
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/screenshots/current',
  webServer: {
    command: '<framework-specific command>',
    url: '<framework-specific URL>',
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: '<framework-specific URL>',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 } } },
  ],
})
```

### Available MCP Commands

You have access to these Playwright MCP tools:

**Navigation & Page Management:**
- `browser_navigate` — Navigate to a URL
- `browser_navigate_back` — Go back in history
- `browser_wait_for` — Wait for text or timeout
- `browser_close` — Close the browser session
- `browser_tabs` — Manage browser tabs
- `browser_install` — Install the browser

**Interaction:**
- `browser_click` — Click an element
- `browser_type` — Type text into an element
- `browser_fill_form` — Fill multiple form fields
- `browser_select_option` — Select dropdown option
- `browser_hover` — Hover over an element
- `browser_drag` — Drag and drop
- `browser_press_key` — Press a keyboard key
- `browser_file_upload` — Upload files
- `browser_handle_dialog` — Handle browser dialogs

**Inspection & Verification:**
- `browser_take_screenshot` — Capture a screenshot
- `browser_snapshot` — Capture accessibility snapshot
- `browser_evaluate` — Execute JavaScript
- `browser_resize` — Resize the browser window
- `browser_run_code` — Run a Playwright code snippet
- `browser_console_messages` — Return console messages
- `browser_network_requests` — Return network requests

### Screenshot Organization

```
tests/screenshots/
  baseline/          # Known-good reference screenshots (committed)
  current/           # Screenshots from current test run (gitignored)
  diff/              # Visual diff outputs
```

Naming convention: `{story-id}_{feature}_{viewport}_{state}.png`
Example: `US-012_checkout_mobile_empty-cart.png`

### Visual Testing Patterns

**Page Load Verification**
```
1. browser_navigate to URL
2. browser_wait_for critical element or network idle
3. browser_take_screenshot for visual verification
```

**User Flow Verification**
```
1. browser_navigate to starting point
2. browser_fill_form / browser_click through the flow
3. browser_wait_for expected outcome
4. browser_take_screenshot at key states
5. browser_evaluate to assert DOM state if needed
```

**Responsive Verification**
```
For each viewport (desktop, tablet, mobile):
  1. browser_resize to target dimensions
  2. browser_navigate
  3. browser_take_screenshot
```

**Error State Verification**
```
1. browser_navigate
2. Trigger error condition (invalid input, failed request)
3. browser_wait_for error UI
4. browser_take_screenshot
5. browser_evaluate to verify error message content
```

### Update TDD Standards (Playwright)

Fill in the E2E placeholder section in `docs/tdd-standards.md`:

```markdown
### 7. E2E / Visual Testing (Playwright)

**When to write Playwright tests:**
- Verifying UI renders correctly after implementing a feature
- Testing complete user flows end-to-end
- Checking responsive layouts at multiple viewports
- Capturing error states and visual regressions

**When NOT to use Playwright:**
- Testing business logic (use unit tests)
- Testing API endpoints (use integration tests)

**Playwright tests are written AFTER the feature works**, as verification.

**Required tests per UI story:**
- Happy path at desktop (1280px) and mobile (375px)
- Primary error state screenshot
- Key interactive states (loading, empty, populated)

**Screenshot naming:** `{story-id}_{feature}_{viewport}_{state}.png`

**Baseline management:**
- Baselines committed to `tests/screenshots/baseline/`
- Current runs in `tests/screenshots/current/` (gitignored)
```

### Update CLAUDE.md (Playwright)

Add a "Browser Testing with Playwright MCP" section covering: when to use, verification process, screenshot naming, common patterns, and rules (always wait before screenshot, always close browser, test both desktop and mobile).

### Playwright Permissions

Add bare server-name entry to `~/.claude/settings.json` allow array:
```json
"mcp__plugin_playwright_playwright"
```

Create `.claude/settings.local.json` with individual tool entries as fallback.

### What NOT to Do (Playwright)
- Don't use Playwright for testing business logic
- Don't store screenshots in git unless they're intentional baselines
- Don't skip the wait step — flaky screenshots waste time
- Don't leave browser sessions open — always close when done

---

## Mobile App Testing (Maestro)

**Skip this entire section if platform detection found no mobile framework.**

### What is Maestro

Maestro is a mobile UI testing framework ideal for Expo/React Native apps. It uses YAML flow files to define user interactions and assertions, with automatic UI settling.

### Expo-Specific Detection

Read `app.json` (or `app.config.js`) and `package.json` to determine:

1. **Expo SDK version**: Check `expo` dependency version. SDK 50+ supports `expo-dev-client` natively.
2. **EAS Build detection**: Check for `eas.json` in project root. If present, document EAS Build commands for creating development builds.
3. **Managed vs bare workflow**: Check for `ios/` and `android/` directories.
   - **Managed** (no native dirs): Use `npx expo prebuild` then `npx expo run:ios`
   - **Bare** (native dirs exist): Use `npx react-native run-ios` or native build tools
4. **Config plugins**: Check `app.json` for `expo.plugins` — may affect build configuration.

### Installation & Configuration

```bash
# macOS
curl -Ls "https://get.maestro.mobile.dev" | bash
maestro --version
```

Create the Maestro directory structure:
```
maestro/
├── flows/                    # Test flow files by feature
│   ├── auth/
│   ├── onboarding/
│   └── ...
├── shared/                   # Reusable sub-flows
│   ├── login.yaml
│   └── logout.yaml
├── screenshots/
│   ├── baseline/            # Known-good references (committed)
│   └── current/             # Current test run (gitignored)
└── config.yaml              # Maestro configuration
```

Create `maestro/config.yaml` using the detected app bundle ID from `app.json`:
```yaml
# scaffold:maestro v1 YYYY-MM-DD
appId: ${APP_BUNDLE_ID}
flows:
  - flows/**/*.yaml
env:
  TEST_USER_EMAIL: test@example.com
  TEST_USER_PASSWORD: testpassword123
```

### Maestro Commands Reference

**App Lifecycle:** `launchApp`, `launchApp: { clearState: true }`, `stopApp`

**Navigation & Interaction:** `tapOn`, `longPressOn`, `inputText`, `eraseText`, `scroll`, `scrollUntilVisible`, `swipe`, `back`, `hideKeyboard`

**Assertions:** `assertVisible`, `assertNotVisible`, `assertTrue`

**Waiting:** `waitForAnimationToEnd`, `extendedWaitUntil`

**Screenshots:** `takeScreenshot: "path/name"`

**Flow Control:** `runFlow`, `runFlow` with parameters, conditional `when`, `repeat`

### Testing Patterns

**Screen Verification:** Launch → login → assert visible → screenshot
**User Flow:** Launch → navigate → fill form → submit → verify success → screenshot
**Error State:** Launch → trigger error → assert error message → screenshot
**Reusable Sub-flow:** Login flow parameterized with env vars
**Device Testing:** Same flow on multiple devices (`--device` flag)

### testID Conventions

Add to `docs/coding-standards.md`:
- All interactive elements MUST have a `testID` prop
- Naming convention: `{feature}-{element}-{descriptor}`
- Examples: `auth-email-input`, `session-create-button`, `nav-home-tab`

### Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "test:e2e": "maestro test maestro/flows/",
    "test:e2e:ios": "maestro test maestro/flows/ --device 'iPhone 15'",
    "test:e2e:android": "maestro test maestro/flows/ --device 'emulator'",
    "test:e2e:flow": "maestro test",
    "maestro:studio": "maestro studio"
  }
}
```

### Update TDD Standards (Maestro)

Add to the E2E section in `docs/tdd-standards.md`:
- When to write Maestro flows (E2E user journeys, visual verification)
- When NOT to use Maestro (unit logic, API testing)
- Maestro flows are written AFTER the feature works
- Required: happy path + primary error states per user story

### Update CLAUDE.md (Maestro)

Add a "Mobile Testing with Maestro" section covering: when to use, prerequisites (dev build running), verification process, creating test flows, testID requirements, key commands, and rules (always waitForAnimationToEnd, use testID selectors, test both platforms).

### Development Build Requirement

Maestro requires a development build (not Expo Go) for reliable testID access:
```bash
npx expo prebuild
npx expo run:ios  # or run:android
```

### Verification (Maestro)

After setup, verify:
1. Maestro CLI installed and accessible
2. Development build created and running on simulator
3. Sample verification flow executes successfully
4. Screenshot captured to correct directory
5. testID props accessible in the app

---

## Process

1. **Detect platform** — Read tech-stack.md and package.json. Determine web, mobile, both, or skip.
2. **Check brownfield** — Look for existing Playwright config or Maestro directory.
3. **Configure detected platforms** — Run the applicable section(s) above.
4. **Update documentation** — CLAUDE.md, tdd-standards.md, coding-standards.md (if mobile).
5. **Run verification** — Smoke test for each configured platform.
6. **Ask user** — Confirm viewport sizes, test devices, baseline strategy, and any project-specific conventions.

## After This Step

When this step is complete, tell the user:

---
**Phase 4 complete** — E2E testing configured for detected platform(s).

**Next:** Run `/scaffold:user-stories` — Create user stories covering every PRD feature (starts Phase 5).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
