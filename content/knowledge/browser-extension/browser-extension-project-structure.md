---
name: browser-extension-project-structure
description: Directory layout for browser extensions covering src/popup, src/content, src/background, src/options, public/icons, and _locales
topics: [browser-extension, project-structure, file-organization, build, icons]
---

Browser extension project structure must account for multiple compilation targets (one bundle per execution context), static assets that bypass the build pipeline, and locale files consumed by the WebExtensions runtime. A well-organized project structure makes build configuration straightforward, keeps context-specific code isolated, and prevents accidentally importing browser APIs that are unavailable in a given context.

## Summary

Browser extension projects organize source code by execution context (`src/background/`, `src/content/`, `src/popup/`, `src/options/`), share cross-context code via `src/shared/`, serve static assets and icons from `public/`, store locale strings in `_locales/`, and output all built artifacts to `dist/`. The build tool (Vite or Webpack) is configured with multiple entry points — one per context. The `manifest.json` lives at the root and references compiled output paths.

## Deep Guidance

### Top-Level Directory Layout

```
my-extension/
  src/                     # All TypeScript/JavaScript source
  public/                  # Static assets copied verbatim to dist/
  _locales/                # WebExtensions i18n message files
  manifest.json            # Extension manifest (source of truth)
  dist/                    # Build output (gitignored)
  tests/                   # Unit and integration tests
  scripts/                 # Build and release helper scripts
  package.json
  tsconfig.json
  vite.config.ts           # (or webpack.config.ts)
```

**Key decisions at this level:**
- `manifest.json` is a source file, not generated. Keep it at the root and have the build tool copy it to `dist/` with any environment-specific substitutions applied.
- `dist/` is always gitignored. It is a build artifact, not source.
- `public/` contains files that are copied as-is without processing — icons, web-accessible static HTML, third-party JS files that must not be bundled.

### src/ — Source Organized by Execution Context

```
src/
  background/
    index.ts               # Service worker entry point
    message-router.ts      # Central message dispatch
    handlers/
      tab-handlers.ts
      storage-handlers.ts
      alarm-handlers.ts
    alarms.ts              # Alarm registration
    install.ts             # onInstalled handler (first-run setup)

  content/
    index.ts               # Content script entry point
    injectors/
      overlay-injector.ts  # Injects UI overlays into the host page
      banner-injector.ts
    observers/
      dom-observer.ts      # MutationObserver for dynamic pages
    styles/
      content.css          # Styles injected alongside content scripts

  popup/
    index.html             # Popup page HTML (references compiled JS)
    index.ts               # Popup entry point
    App.tsx                # Root component (if using React)
    components/
      Toggle.tsx
      StatusBadge.tsx
    hooks/
      useExtensionState.ts

  options/
    index.html             # Options page HTML
    index.ts               # Options page entry point
    App.tsx
    components/
      SettingsForm.tsx
      PermissionsPanel.tsx

  shared/
    messages.ts            # Message type constants (used by all contexts)
    storage.ts             # chrome.storage typed wrappers and key constants
    types.ts               # Shared TypeScript interfaces
    constants.ts           # App-wide constants (version, default config)
    utils/
      url-helpers.ts
      sanitizer.ts
```

**Why isolate by context:**
- Content scripts run in the page context with restricted API access (no `chrome.tabs`, for example).
- Service workers have no DOM access and are terminated between events.
- Popup and options pages are full HTML pages with full API access but a different lifecycle from the service worker.
- Keeping code per context prevents accidental API calls that are undefined in that context and makes the build configuration's entry points map directly to directories.

### public/ — Static Assets

```
public/
  icons/
    icon-16.png            # 16×16 toolbar icon
    icon-32.png            # 32×32 (Windows HiDPI toolbar)
    icon-48.png            # 48×48 (extension management page)
    icon-128.png           # 128×128 (Chrome Web Store listing)
  images/
    logo.svg               # Brand assets for options page
```

**Icon requirements:**
- Provide all four sizes (16, 32, 48, 128). Missing sizes cause the browser to scale up smaller icons, producing blurry results.
- Icons must be PNG. SVG is not supported in `manifest.json` icon fields.
- Design icons to be recognizable at 16×16 (the smallest size shown in the toolbar). Detailed illustrations fail at this scale.
- Provide separate icon sets for active and inactive states if the extension toggles on/off — users expect visual feedback.
- The Chrome Web Store also requires a 440×280 promotional tile and up to 5 screenshots. These belong in a separate `store-assets/` directory at the repo root, not in `public/`.

### _locales/ — Internationalization

```
_locales/
  en/
    messages.json          # English strings (required, used as fallback)
  es/
    messages.json
  fr/
    messages.json
  ja/
    messages.json
```

The `_locales/` directory must be copied verbatim to `dist/` by the build tool. It is not processed — the WebExtensions runtime reads it directly. Configure your bundler to copy `_locales/` as a static asset.

### dist/ — Build Output

```
dist/
  manifest.json            # Copied from root, possibly with env substitutions
  background.js            # Compiled service worker bundle
  content.js               # Compiled content script bundle
  content.css              # Compiled content script stylesheet
  popup/
    index.html
    popup.js
    popup.css
  options/
    index.html
    options.js
    options.css
  icons/                   # Copied from public/icons/
  _locales/                # Copied from source _locales/
```

The directory structure in `dist/` must match what `manifest.json` references in its `background.service_worker`, `content_scripts`, and `action.default_popup` fields. Mismatches cause silent failures — the extension loads but the referenced scripts do not execute.

### tests/ Structure

```
tests/
  unit/
    shared/                # Tests for shared utility functions
    background/            # Unit tests for background handlers
    content/               # Unit tests for content script logic
  integration/
    background.test.ts     # Chrome extension API mocked integration tests
    popup.test.ts
  e2e/
    extension.spec.ts      # Playwright tests with real extension loaded
```

Test files mirror the source structure. Unit tests for `src/shared/storage.ts` live in `tests/unit/shared/storage.test.ts`. Integration and e2e tests live at their own level because they span multiple contexts.

### Configuration Files at Root

Keep build and tooling configuration files at the root, not inside `src/`:

```
vite.config.ts             # Multi-entry Vite build config
tsconfig.json              # Base TypeScript config
tsconfig.content.json      # Context-specific tsconfig for content scripts (lib: DOM)
tsconfig.background.json   # Context-specific tsconfig (lib: WebWorker)
.eslintrc.json
.prettierrc
web-ext-config.yml         # web-ext tool configuration for dev/testing
```

Context-specific `tsconfig` files are important: the service worker uses the `WebWorker` lib (not `DOM`), while content scripts and popup use the `DOM` lib. A single tsconfig targeting both will produce incorrect type checking.
