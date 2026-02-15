---
description: "Audit platform coverage across all docs"
---

This app targets multiple platforms as first-class citizens. Review `docs/tech-stack.md` and `docs/plan.md` to identify the specific target platforms (iOS, Android, web browsers, desktop) and their version requirements.

Key personas may use desktop/laptop as their primary device. If the PRD specifies web support, **the web version is a first-class citizen, not an afterthought.** The same applies in reverse — if mobile is listed, it's not just a responsive website.

Review all project documentation to ensure every target platform is thoroughly addressed. Identify gaps where one platform was assumed but another wasn't considered.

---

## Phase 1: Establish Platform Context

Before auditing, read `docs/tech-stack.md` and `docs/plan.md` to answer:

1. **What are the target platforms?** (iOS, Android, web, desktop — list exactly)
2. **What framework handles cross-platform?** (React Native + Expo, Flutter, separate codebases, responsive web app, etc.)
3. **How does the framework serve each platform?** (shared codebase with platform exports, separate builds, responsive CSS, etc.)
4. **Which personas use which platforms?** (e.g., admins on desktop, players on mobile)
5. **What are the browser/OS version requirements?**

This context determines which checklist items apply. Skip items that don't apply to the project's tech stack.

---

## Phase 2: Document Review

Read these documents thoroughly:
- `docs/plan.md` (PRD)
- `docs/user-stories.md`
- `docs/tech-stack.md`
- `docs/coding-standards.md`
- `docs/project-structure.md`
- `docs/tdd-standards.md`
- `docs/design-system.md` (if exists) — responsive breakpoints, platform-specific component patterns
- `docs/implementation-plan.md` (if exists)
- `docs/dev-setup.md` (if exists)
- `CLAUDE.md`

For each document, note:
- Platform-specific mentions (iOS, Android, web, mobile, browser, desktop)
- Assumptions that seem single-platform (e.g., only mobile APIs, only browser APIs)
- Missing platform considerations

---

## Phase 3: Platform Parity Checklist

Check each item against the project's tech stack. Skip items that don't apply.

### 3.1 Tech Stack (`docs/tech-stack.md`)

**Framework & Rendering**:
- [ ] Framework supports all target platforms (verify, don't assume)
- [ ] Build/export strategy defined for each platform
- [ ] Web rendering strategy defined if applicable (CSR, SSR, SSG, hybrid)
- [ ] Web bundler/build tool specified if separate from mobile
- [ ] Code splitting or lazy loading strategy for web

**Responsive & Adaptive**:
- [ ] Responsive breakpoints defined (mobile, tablet, desktop)
- [ ] Adaptive component strategy documented (shared components that scale vs. platform-specific components)
- [ ] Navigation pattern differences addressed per platform (bottom tabs, sidebar, top nav, drawer)

**Platform APIs** (check each API the app uses):
- [ ] Camera/media: approach for each platform
- [ ] Push notifications: approach for each platform (APNs, FCM, Web Push, etc.)
- [ ] Offline/caching: approach for each platform
- [ ] Local storage: approach for each platform (and abstraction strategy if different per platform)
- [ ] Deep linking / URL routing: approach for each platform
- [ ] Geolocation, sensors, biometrics, etc.: approach per platform where used

**Authentication**:
- [ ] Auth flow defined for each platform (redirect vs. popup for web, native flows for mobile)
- [ ] Session/token management per platform
- [ ] Persistent login strategy per platform

**Browser Compatibility** (if web is a target):
- [ ] Target browsers and minimum versions explicitly listed
- [ ] Polyfill or compatibility strategy for older browsers
- [ ] CSS compatibility approach documented
- [ ] Browser testing matrix defined

### 3.2 Coding Standards (`docs/coding-standards.md`)

**Input Handling**:
- [ ] Touch interaction patterns (tap, swipe, long press — if mobile is a target)
- [ ] Mouse interaction patterns (hover states, right-click — if web is a target)
- [ ] Keyboard navigation requirements (Tab, Enter, Escape, arrow keys — if web/desktop is a target)
- [ ] Focus management documented (focus traps for modals, skip links, focus indicators)
- [ ] Unified event handling approach (how the framework handles touch vs. click)

**Accessibility**:
- [ ] Web accessibility standards specified (WCAG level — if web is a target)
- [ ] Mobile accessibility (VoiceOver, TalkBack — if mobile is a target)
- [ ] Screen reader support approach per platform
- [ ] Reduced motion / high contrast preferences

**Responsive Patterns**:
- [ ] Component patterns for responsive behavior documented
- [ ] When to use platform detection vs. responsive breakpoints
- [ ] Platform-specific file conventions documented (e.g., `.web.tsx`, `.native.tsx`, `.ios.tsx`)

**Forms**:
- [ ] Form validation approach (shared across platforms?)
- [ ] Platform-specific form behaviors (Enter to submit on web, keyboard dismiss on mobile)
- [ ] Autofill/autocomplete support (if web is a target)
- [ ] Date/time picker strategy per platform

### 3.3 Project Structure (`docs/project-structure.md`)

**Code Organization**:
- [ ] Platform-specific file conventions defined and documented
- [ ] Shared code vs. platform-specific code locations clear
- [ ] Platform-specific asset directories (web public folder, mobile asset bundles, etc.)

**Build & Deploy**:
- [ ] Build pipeline defined for each target platform
- [ ] Deployment/distribution strategy per platform (app stores, web hosting, etc.)
- [ ] Environment configuration per platform

**Assets**:
- [ ] Web assets (favicon, manifest, og:image — if web is a target)
- [ ] Mobile assets (app icons, splash screens — if mobile is a target)
- [ ] Image optimization strategy per platform
- [ ] Font loading strategy per platform

### 3.4 User Stories (`docs/user-stories.md`)

**Platform Coverage**:
- [ ] Stories mention platform when behavior differs between platforms
- [ ] Platform-specific stories exist where needed (keyboard shortcuts for web, gestures for mobile, etc.)
- [ ] Acceptance criteria include platform-specific requirements where applicable
- [ ] Personas with a primary platform have stories that address that platform's conventions

**Common Gaps** (check if applicable to target platforms):
- [ ] Keyboard navigation story (if web is a target)
- [ ] Shareable URLs / deep links (if web is a target)
- [ ] Desktop-optimized layout story (if web/desktop personas exist)
- [ ] Gesture-based interaction stories (if mobile is a target)
- [ ] Offline usage story (if either platform needs offline support)

### 3.5 PRD (`docs/plan.md`)

**Platform Requirements**:
- [ ] Target platforms explicitly listed with version requirements
- [ ] Platform-specific usage patterns acknowledged (which personas use which platforms)
- [ ] Responsive/adaptive design requirements specified

**Feature Parity**:
- [ ] Features that differ by platform are marked as such
- [ ] No features implicitly assume a single platform (e.g., "swipe to delete" without keyboard alternative, or "hover to preview" without touch alternative)
- [ ] Platform-specific features called out (SEO for web, push notifications for mobile, etc.)

### 3.6 Dev Environment (`docs/dev-setup.md`)

**Platform-Specific Dev Commands**:
- [ ] Command to run each target platform documented (with expected output)
- [ ] How to run multiple platforms simultaneously
- [ ] Dev server URLs/ports documented for web

**Testing Setup Per Platform**:
- [ ] E2E testing tool specified for each platform (Playwright/Cypress for web, Maestro/Detox for mobile, etc.)
- [ ] Command to run tests for each platform (separate, not combined)
- [ ] Headed vs. headless mode instructions for browser tests
- [ ] Simulator/emulator setup for mobile tests
- [ ] Cross-browser testing workflow (if web is a target)

**Cross-Platform Development Workflow**:
- [ ] How to develop a feature that touches multiple platforms
- [ ] How to test the same feature on all target platforms
- [ ] Platform-specific debugging tools documented
- [ ] When to use simulator/emulator vs. physical device vs. browser

**CLAUDE.md Integration**:
- [ ] Platform-specific dev commands in CLAUDE.md quick reference
- [ ] Testing commands per platform in CLAUDE.md
- [ ] "Before testing" checklist per platform (e.g., start correct dev server, verify simulator running)

---

## Phase 4: Gap Analysis

### 4.1 Identify Gaps

Create a table:

| Document | Section | Gap Type | Issue | Severity | Recommendation |
|----------|---------|----------|-------|----------|----------------|
| tech-stack.md | Storage | Platform gap | Only documents mobile storage, not web | High | Add web storage strategy |
| coding-standards.md | Input | Platform gap | No keyboard nav standards | Critical | Add keyboard interaction patterns |
| user-stories.md | US-012 | Platform bias | "Swipe to archive" with no keyboard alt | High | Add keyboard alternative |
| dev-setup.md | Commands | Platform gap | No web dev server command | Critical | Add platform-specific commands |

### 4.2 Categorize by Severity

**Critical** (blocks a target platform from launching):
- No build/deploy pipeline for a target platform
- No responsive/adaptive strategy
- Authentication doesn't work on a target platform
- Core features require APIs unavailable on a target platform
- No dev server command for a target platform
- No E2E testing setup for a target platform

**High** (poor UX on a target platform):
- Missing input method support (keyboard for web, gestures for mobile)
- Single-platform navigation patterns used everywhere
- No platform-optimized layouts
- Missing browser/OS compatibility handling
- Dev setup doesn't explain cross-platform workflow

**Medium** (missing polish):
- No PWA / offline support for web
- No platform-specific optimizations (code splitting, lazy loading)
- Missing accessibility features for a platform
- Testing commands not separated by platform

**Low** (nice to have):
- No social sharing / OG tags for web
- No platform-specific animations or transitions
- Missing print stylesheets

---

## Phase 5: Recommendations

### 5.1 Documentation Updates

For each gap, specify:
- Which document to update
- What section to add or modify
- Draft content or key points

Structure recommendations by document, not by gap, so updates are batched.

### 5.2 User Story Additions

If user stories are missing platform coverage, draft the stories with:
- Story text referencing the specific platform and persona
- Acceptance criteria with platform-specific behavior
- Scope boundary (what's NOT included)
- Priority based on persona importance

### 5.3 Task Additions

If Beads tasks are missing platform work, group by:

**Platform infrastructure** (priority 0-1):
- Build/deploy setup for each platform
- Platform-specific dev commands and scripts
- Testing setup per platform (E2E tool, commands, configuration)

**Platform-specific features** (priority 1-2):
- Responsive/adaptive layouts
- Input method support (keyboard nav, gestures)
- Platform API adapters (storage, notifications, etc.)

**Dev environment** (priority 0-1):
- Platform-specific dev server commands
- Testing commands per platform
- Cross-platform development documentation
- CLAUDE.md updates for platform-specific commands

---

## Phase 6: Present Findings

### Summary Report

```
## Platform Parity Review Summary

### Target Platforms
[List from tech-stack.md/plan.md with version requirements]

### Documents Reviewed
[List with ✓/✗ status]

### Overall Assessment
[Good / Needs Work / Significant Gaps]

### Gap Summary
- Critical: X issues
- High: X issues
- Medium: X issues
- Low: X issues

### Key Findings
1. [Most important gap]
2. [Second most important]
3. [Third most important]

### Recommended Actions
1. [Highest priority — grouped by document]
2. [Second priority]
3. [etc.]

### Questions for You
- [Platform-specific decisions needed]
```

Wait for approval before making changes.

---

## Phase 7: Execute Updates

After approval:

1. **Update documentation** — batch by document
2. **Create missing user stories** in docs/user-stories.md
3. **Create Beads tasks** for missing platform work
4. **Update CLAUDE.md** with platform-specific commands and patterns

### Verification

After updates:
- [ ] Every target platform has a build/deploy strategy documented
- [ ] Every platform API the app uses has an approach documented per platform
- [ ] User stories cover platform-specific behavior where it differs
- [ ] Beads tasks exist for all platform infrastructure and features
- [ ] Coding standards include input patterns for every target platform's primary input method
- [ ] Dev setup has separate commands for each target platform
- [ ] E2E testing is set up for each target platform with clear commands
- [ ] CLAUDE.md has platform-specific dev and test commands
- [ ] No feature assumes a single platform without offering an alternative for other targets

---

## Common Platform Gaps

### Web gaps (when mobile was the primary focus):
1. Keyboard navigation — everything must be keyboard accessible
2. Desktop layouts — not just "mobile but wider"; genuinely different layouts
3. Navigation patterns — bottom tabs feel wrong on desktop
4. URL routing — web users expect shareable, bookmarkable URLs
5. Browser back button — must work correctly with navigation state
6. Form autofill — browsers expect proper autocomplete attributes
7. Text selection — web users expect to select and copy text
8. Link behavior — Cmd/Ctrl+click to open in new tab
9. No web dev server command — only mobile start commands documented
10. No browser testing — only mobile E2E tools set up

### Mobile gaps (when web was the primary focus):
1. Touch targets — minimum 44x44pt tap targets
2. Gesture support — swipe, long press, pull to refresh
3. Keyboard dismiss — tapping outside input fields should dismiss keyboard
4. Safe areas — notch, home indicator, status bar insets
5. Offline behavior — mobile loses connectivity more often
6. App state — backgrounding, foregrounding, memory pressure
7. Platform navigation — system back button on Android, swipe back on iOS
8. Native feel — platform-appropriate animations, haptics, transitions
9. No simulator/emulator commands — only browser dev setup documented
10. No mobile E2E testing — only Playwright/Cypress for web

### Dev environment gaps (commonly missed for both):
1. Platform-specific start commands not separated
2. Test commands not separated by platform
3. Dev server ports/URLs not documented
4. Cross-platform development workflow not explained
5. CLAUDE.md missing platform-specific commands for AI agents

---

## Process Rules

1. **Read tech-stack.md first** — Understand the actual framework and platforms before auditing
2. **Skip what doesn't apply** — Not every checklist item is relevant to every project
3. **Be specific** — "Add web support" is not actionable; name the exact file, section, and content
4. **Prioritize by persona impact** — If the primary persona uses desktop, keyboard nav is critical
5. **Present before changing** — Get approval on the gap list before updating docs
6. **Create tasks for implementation** — Documentation updates happen now; code work goes to Beads
7. **Don't prescribe tech choices** — If a platform API adapter is needed, describe what it must do, not which library to use (that's in tech-stack.md)

## After This Step

When this step is complete, tell the user:

---
**Phase 5 complete** — Platform parity gaps identified and fixed across all docs.

**Next:** Run `/scaffold:claude-md-optimization` — Consolidate and optimize CLAUDE.md (starts Phase 6).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
