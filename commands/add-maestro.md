---
description: "Configure Maestro for mobile app testing"
---

Install and configure Maestro for mobile UI testing in this Expo project. Maestro will be used for automated testing and visual verification of mobile app features.

Review docs/tech-stack.md, docs/tdd-standards.md, and CLAUDE.md to understand the existing project conventions.

## Mode Detection

Before starting, check if `maestro/` directory already exists:

**If `maestro/` does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If `maestro/` exists → UPDATE MODE**:
1. **Read & analyze**: Read `maestro/config.yaml`, existing flow files, the E2E section of `docs/tdd-standards.md`, and the mobile testing section of `CLAUDE.md`. Check for a tracking comment on line 1 of `maestro/config.yaml`: `# scaffold:maestro v<ver> <date>`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing configuration against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing config
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tdd-standards.md`, `docs/dev-setup.md`, `CLAUDE.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1 of `maestro/config.yaml`: `# scaffold:maestro v<ver> <date>`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `maestro/config.yaml`
- **Secondary output**: `maestro/flows/`, `maestro/shared/`, `maestro/screenshots/`, `docs/tdd-standards.md` E2E section, `CLAUDE.md` mobile testing section
- **Preserve**: All existing flow files, sub-flows, baseline screenshots, custom `testID` conventions, environment variables in config
- **Related docs**: `docs/tdd-standards.md`, `docs/dev-setup.md`, `CLAUDE.md`
- **Special rules**: **Never delete existing flow files or sub-flows** — they represent tested user journeys. **Never delete baseline screenshots**. Preserve custom environment variables in `maestro/config.yaml`. Update `docs/tdd-standards.md` E2E section in-place rather than appending duplicates.

## What is Maestro

Maestro is a mobile UI testing framework that's ideal for Expo/React Native apps. It uses simple YAML flow files to define user interactions and assertions. It's more reliable than alternatives because it waits for the UI to settle automatically.

## Installation & Configuration

### 1. Install Maestro CLI

```bash
# macOS
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version
```

Document any additional setup needed for:
- iOS Simulator requirements
- Android Emulator requirements
- Expo-specific configuration

### 2. Project Configuration

Create the Maestro directory structure:
```
maestro/
├── flows/                    # Test flow files
│   ├── auth/                 # Flows by feature
│   ├── onboarding/
│   └── ...
├── shared/                   # Reusable sub-flows
│   ├── login.yaml
│   └── logout.yaml
├── screenshots/              # Captured screenshots
│   ├── baseline/            # Known-good references
│   └── current/             # Current test run
└── config.yaml              # Maestro configuration
```

Create `maestro/config.yaml`:
```yaml
# App configuration
appId: ${APP_BUNDLE_ID}  # From app.json

# Default settings
flows:
  - flows/**/*.yaml

# Environment variables available in flows
env:
  TEST_USER_EMAIL: test@example.com
  TEST_USER_PASSWORD: testpassword123
```

### 3. Environment Setup

Add to `.env.example` and document:
```
# Maestro Testing
MAESTRO_APP_ID=your.app.bundle.id
MAESTRO_TEST_USER_EMAIL=test@example.com
MAESTRO_TEST_USER_PASSWORD=testpassword123
```

## Maestro Commands Reference

### App Lifecycle
```yaml
- launchApp                          # Start the app fresh
- launchApp:
    clearState: true                 # Clear app data first
- stopApp                            # Stop the app
```

### Navigation & Interaction
```yaml
- tapOn: "Button Text"               # Tap by text
- tapOn:
    id: "button-submit"              # Tap by testID
- tapOn:
    point: "50%,50%"                 # Tap by coordinates

- longPressOn: "Element"             # Long press

- inputText: "Hello world"           # Type into focused field
- eraseText: 10                      # Delete characters

- scroll                             # Scroll down
- scrollUntilVisible:
    element: "Target Element"
    direction: DOWN

- swipe:
    direction: LEFT
    duration: 500

- back                               # Android back / iOS swipe back
- hideKeyboard
```

### Assertions
```yaml
- assertVisible: "Welcome"           # Text is visible
- assertVisible:
    id: "home-screen"                # testID is visible

- assertNotVisible: "Error"          # Text is not visible

- assertTrue: ${SOME_CONDITION}      # Boolean check
```

### Waiting
```yaml
- waitForAnimationToEnd              # Wait for UI to settle
- extendedWaitUntil:
    visible: "Loaded Content"
    timeout: 10000                   # ms
```

### Screenshots
```yaml
- takeScreenshot: "screenshots/current/home-screen"
```

### Flow Control
```yaml
# Run a shared sub-flow
- runFlow: shared/login.yaml

# Run with parameters
- runFlow:
    file: shared/login.yaml
    env:
      EMAIL: custom@example.com

# Conditional execution
- runFlow:
    when:
      visible: "Login Button"
    file: shared/login.yaml

# Repeat actions
- repeat:
    times: 3
    commands:
      - tapOn: "Increment"
```

## Testing Patterns

### Pattern 1: Screen Verification
```yaml
# flows/home/verify-home-screen.yaml
appId: ${MAESTRO_APP_ID}
---
- launchApp:
    clearState: true
- runFlow: ../shared/login.yaml
- assertVisible: "Home"
- assertVisible:
    id: "dashboard-stats"
- takeScreenshot: "screenshots/current/home_authenticated"
```

### Pattern 2: User Flow
```yaml
# flows/sessions/create-session.yaml
appId: ${MAESTRO_APP_ID}
---
- launchApp
- runFlow: ../shared/login.yaml

# Navigate to create
- tapOn: "New Session"
- assertVisible: "Create Session"

# Fill form
- tapOn:
    id: "session-name-input"
- inputText: "Test Session"
- tapOn:
    id: "session-duration"
- tapOn: "30 minutes"

# Submit
- tapOn: "Create"
- waitForAnimationToEnd

# Verify success
- assertVisible: "Session Created"
- takeScreenshot: "screenshots/current/session_created_success"
```

### Pattern 3: Error State Verification
```yaml
# flows/auth/login-error.yaml
appId: ${MAESTRO_APP_ID}
---
- launchApp:
    clearState: true
- tapOn: "Login"
- tapOn:
    id: "email-input"
- inputText: "invalid@example.com"
- tapOn:
    id: "password-input"
- inputText: "wrongpassword"
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible: "Invalid credentials"
- takeScreenshot: "screenshots/current/login_error_invalid_credentials"
```

### Pattern 4: Reusable Sub-flow
```yaml
# maestro/shared/login.yaml
appId: ${MAESTRO_APP_ID}
---
- assertVisible: "Login"
- tapOn:
    id: "email-input"
- inputText: ${TEST_USER_EMAIL}
- tapOn:
    id: "password-input"
- inputText: ${TEST_USER_PASSWORD}
- tapOn: "Sign In"
- waitForAnimationToEnd
- assertVisible:
    id: "home-screen"
```

### Pattern 5: Responsive/Device Testing
```yaml
# Run same flow on multiple devices
# maestro test flows/home/verify-home-screen.yaml --device "iPhone 14"
# maestro test flows/home/verify-home-screen.yaml --device "Pixel 6"
```

## Expo-Specific Setup

### 1. Configure testID Props

Ensure components use testID for reliable selection:
```tsx
// Good - uses testID
<Button testID="submit-button" title="Submit" />

// Avoid - relies on text matching which can be fragile
<Button title="Submit" />
```

Add to docs/coding-standards.md:
- All interactive elements MUST have a testID prop
- testID naming convention: `{feature}-{element}-{descriptor}`
- Examples: `auth-email-input`, `session-create-button`, `nav-home-tab`

### 2. Running with Expo

```bash
# Start Expo dev server (in one terminal)
npx expo start

# Run on iOS Simulator (in another terminal)
npx expo run:ios

# Or Android Emulator
npx expo run:android

# Then run Maestro tests
maestro test maestro/flows/
```

### 3. Development Build Requirement

Maestro requires a development build (not Expo Go) for reliable testID access:
```bash
# Create development build
npx expo prebuild
npx expo run:ios  # or run:android
```

Document this requirement clearly for the team.

## Scripts/Commands

Add to package.json:
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

| Command | Purpose |
|---------|---------|
| `npm run test:e2e` | Run all Maestro flows |
| `npm run test:e2e:ios` | Run on iOS Simulator |
| `npm run test:e2e:android` | Run on Android Emulator |
| `npm run test:e2e:flow maestro/flows/auth/login.yaml` | Run specific flow |
| `npm run maestro:studio` | Open Maestro Studio (interactive mode) |

## Screenshot Organization

```
maestro/screenshots/
├── baseline/
│   ├── auth/
│   │   ├── login_screen.png
│   │   └── login_error.png
│   ├── home/
│   │   └── dashboard.png
│   └── ...
└── current/
    └── [generated during test runs]
```

Naming convention: `{feature}_{screen}_{state}.png`
- `auth_login_default.png`
- `auth_login_error_invalid.png`
- `session_create_success.png`

## Update CLAUDE.md

Add a Mobile Testing section:

```markdown
## Mobile Testing with Maestro

When implementing mobile features, use Maestro for UI verification.

### When to Use
- Verifying screens render correctly after implementing a feature
- Testing user flows end-to-end on mobile
- Capturing error states and edge cases
- Visual regression checks

### Prerequisites
- Development build running: `npx expo run:ios` or `npx expo run:android`
- Simulator/emulator is open and app is installed

### Verification Process
1. Ensure dev build is running on simulator/emulator
2. Write or run Maestro flow for the feature
3. Use `takeScreenshot` to capture key states
4. Review screenshots to verify correctness

### Creating a Test Flow
1. Create YAML file in `maestro/flows/{feature}/`
2. Start with `launchApp` or use shared login flow
3. Navigate to the feature being tested
4. Add assertions for expected UI state
5. Capture screenshots at key states

### TestID Requirements
All interactive elements MUST have testID props:
- Buttons: `{feature}-{action}-button`
- Inputs: `{feature}-{field}-input`
- Screens: `{feature}-screen`

### Key Commands
| Task | Command |
|------|---------|
| Run all tests | `npm run test:e2e` |
| Run specific flow | `npm run test:e2e:flow maestro/flows/auth/login.yaml` |
| Interactive mode | `npm run maestro:studio` |

### Rules
- Always include `waitForAnimationToEnd` after navigation or actions
- Always use testID selectors over text matching when possible
- Always capture both success AND error states
- Test on both iOS and Android before marking mobile tasks complete
```

## Update TDD Standards

Add to docs/tdd-standards.md a section on mobile E2E testing:
- When to write Maestro flows (E2E user journeys, visual verification)
- When NOT to use Maestro (unit logic, API testing)
- Maestro flows are written AFTER the feature works, as verification
- Required flows: happy path + primary error states for each user story

## Verification

After setup, verify everything works:

1. [ ] Maestro CLI installed and accessible
2. [ ] Development build created and running on simulator
3. [ ] Sample flow executes successfully
4. [ ] Screenshot is captured to correct directory
5. [ ] testID props are accessible in the app

Create a simple verification flow:
```yaml
# maestro/flows/verify-setup.yaml
appId: ${MAESTRO_APP_ID}
---
- launchApp
- waitForAnimationToEnd
- takeScreenshot: "screenshots/current/setup_verification"
```

Run it: `maestro test maestro/flows/verify-setup.yaml`

## Process

- Review docs/tech-stack.md to confirm Expo configuration
- Install Maestro CLI and verify it works
- Create directory structure and config files
- Add testID conventions to coding standards
- Create sample flows demonstrating each pattern
- Update CLAUDE.md with mobile testing section
- Run verification to confirm setup works
- Use AskUserQuestionTool to ask about:
  - Primary test devices (iPhone model, Android device)
  - Any existing test users/accounts
  - Priority features that need E2E coverage first

## After This Step

When this step is complete, tell the user:

---
**Phase 4 complete** — Maestro configured for mobile app testing.

**Next:** Run `/scaffold:user-stories` — Create user stories covering every PRD feature (starts Phase 5).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
