---
name: browser-extension-cross-browser
description: Using webextension-polyfill for API compatibility, manifest differences between Chrome and Firefox, browser-specific APIs, and managing a multi-browser build matrix
topics: [browser-extension, cross-browser, firefox, chrome, webextension-polyfill, compatibility, build-matrix]
---

Browser extensions that target both Chrome and Firefox share most of their codebase, but the differences between the two platforms are significant enough to require explicit management. API namespaces differ, manifest syntax diverges in subtle ways, and some APIs exist only in Chrome or only in Firefox. A systematic cross-browser strategy prevents the "works in Chrome, broken in Firefox" class of bugs.

## Summary

Use `webextension-polyfill` to normalize the `chrome.*` API (callback-based) to the `browser.*` API (Promise-based) and fill gaps between browsers. Maintain separate manifest files per browser target (or a shared base with environment-specific overrides) because Chrome uses `background.service_worker` while Firefox still supports `background.scripts` with persistent pages. Build separate artifacts for each target using a build matrix with environment variables. Test on both browsers before each release — API parity is high but not complete.

## Deep Guidance

### webextension-polyfill

Mozilla's `webextension-polyfill` wraps the `chrome.*` namespace (callback-based) with a `browser.*` namespace (Promise-based) that works in both Chrome and Firefox:

**Installation:**

```bash
npm install webextension-polyfill
npm install -D @types/webextension-polyfill
```

**Usage:**

```typescript
// Without polyfill — Chrome callback API
chrome.storage.sync.get('key', (result) => {
  console.log(result.key);
});

// With polyfill — Promise-based, works in Chrome and Firefox
import browser from 'webextension-polyfill';

const result = await browser.storage.sync.get('key');
console.log(result.key);
```

Import `webextension-polyfill` once at the top of each context's entry point. All subsequent `browser.*` calls will be polyfilled in Chrome and will use Firefox's native Promise API in Firefox.

**What the polyfill covers:**
- All `chrome.*` → `browser.*` name normalization.
- Converts callback-based APIs to Promises.
- Fills some API gaps between Chrome and Firefox.

**What the polyfill does not cover:**
- APIs that only exist in Chrome (`chrome.declarativeNetRequest` advanced features, `chrome.sidePanel`, some scripting features).
- Manifest syntax differences — those require separate manifest files.
- Firefox's different extension signing and review requirements.

### Manifest Differences

Chrome and Firefox have diverged enough that maintaining separate manifest files (or a build-time merge strategy) is safer than one shared manifest.

**Background script declaration:**

```json
// Chrome (Manifest V3) — manifest.json
{
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

```json
// Firefox — manifest.json
// Firefox supports MV3 but still supports MV2 with persistent background pages
// Firefox MV3 uses background.scripts (plural) in some versions
{
  "background": {
    "scripts": ["background.js"],
    "type": "module"
  }
}
```

Firefox's MV3 support is still maturing (as of 2025). Many production extensions targeting Firefox maintain an MV2 manifest for Firefox to avoid compatibility issues with Firefox's incomplete MV3 implementation.

**browser_specific_settings (Firefox only):**

```json
// Firefox manifest requires a unique extension ID
{
  "browser_specific_settings": {
    "gecko": {
      "id": "my-extension@example.com",
      "strict_min_version": "109.0"
    }
  }
}
```

Chrome ignores `browser_specific_settings`. Firefox requires a `gecko.id` for extensions submitted to AMO — without it, the extension ID is auto-generated and changes between installs.

**Recommended build strategy — manifest merging:**

```typescript
// scripts/build-manifests.ts
import baseManifest from './manifest.base.json';
import chromeOverrides from './manifest.chrome.json';
import firefoxOverrides from './manifest.firefox.json';

const chromeManifest = { ...baseManifest, ...chromeOverrides };
const firefoxManifest = { ...baseManifest, ...firefoxOverrides };

writeFileSync('dist/chrome/manifest.json', JSON.stringify(chromeManifest, null, 2));
writeFileSync('dist/firefox/manifest.json', JSON.stringify(firefoxManifest, null, 2));
```

### Browser-Specific API Differences

**APIs available in Chrome but not Firefox:**

| API | Chrome | Firefox | Notes |
|---|---|---|---|
| `chrome.sidePanel` | Yes (Chrome 114+) | No | Side panel UI in the browser window |
| `chrome.declarativeNetRequest` | Full | Partial | Firefox support is partial |
| `chrome.offscreen` | Yes (Chrome 109+) | No | Offscreen document for audio/clipboard |
| `chrome.readingList` | Yes | No | Reading list integration |
| `chrome.ttsEngine` | Yes | No | TTS engine extension |

**APIs available in Firefox but not Chrome:**

| API | Chrome | Firefox | Notes |
|---|---|---|---|
| `browser.menus` (full) | Partial | Yes | Firefox has richer context menu API |
| `browser.pkcs11` | No | Yes | Smart card access |
| `browser.theme` | No | Yes | Browser theme management |
| `browser.userScripts` | Limited | Yes (via MV2) | User script management |

**API behavior differences:**

- `chrome.tabs.query({ active: true })` — Returns an array in both browsers, but Chrome always returns a single-element array for the focused window; Firefox may return empty if no window is focused.
- `chrome.storage.sync` — Chrome syncs across devices via Google account. Firefox syncs via Firefox Sync. Storage limits differ slightly.
- `chrome.runtime.sendMessage` — Chrome throws if no listener is registered. Firefox returns a rejected Promise with a specific error code. Handle both in cross-browser code.
- Content script `matches` patterns — Both support the standard match pattern syntax, but Firefox has slightly stricter validation. Test patterns in both browsers.

### Feature Detection Pattern

Rather than browser-sniffing, use feature detection for browser-specific APIs:

```typescript
// Feature detection — works in both browsers
export const canUseSidePanel = 'sidePanel' in chrome;
export const canUseOffscreen = 'offscreen' in chrome;

// Use conditionally
if (canUseSidePanel) {
  chrome.sidePanel.setOptions({ enabled: true });
} else {
  // Fallback: open as a popup instead
  chrome.action.setPopup({ popup: 'popup/index.html' });
}
```

Avoid `navigator.userAgent` parsing to detect Chrome vs Firefox — it is fragile and breaks with Chromium-based browsers that are not Chrome.

### Build Matrix Configuration

Structure the build to produce separate artifacts for each browser target:

```json
// package.json scripts
{
  "scripts": {
    "build": "npm run build:chrome && npm run build:firefox",
    "build:chrome": "BROWSER=chrome vite build --outDir dist/chrome",
    "build:firefox": "BROWSER=firefox vite build --outDir dist/firefox",
    "pack:chrome": "cd dist/chrome && zip -r ../../web-ext-artifacts/extension-chrome.zip .",
    "pack:firefox": "web-ext build --source-dir dist/firefox --artifacts-dir web-ext-artifacts"
  }
}
```

```typescript
// vite.config.ts — browser-conditional build
const browser = process.env.BROWSER ?? 'chrome';

export default defineConfig({
  define: {
    __BROWSER__: JSON.stringify(browser),
    __IS_CHROME__: browser === 'chrome',
    __IS_FIREFOX__: browser === 'firefox',
  },
  plugins: [
    webExtension({
      manifest: browser === 'chrome'
        ? require('./manifest.chrome.json')
        : require('./manifest.firefox.json'),
    }),
  ],
});
```

### Cross-Browser Testing Checklist

Run this checklist before every release:

- Extension loads without errors in `chrome://extensions` (Chrome) and `about:debugging` (Firefox).
- Content scripts inject correctly on target pages in both browsers.
- Storage read/write works in both browsers (test with `chrome.storage.sync` and `browser.storage.sync`).
- Message passing between popup ↔ background works in both browsers.
- Permissions are granted correctly on install in both browsers.
- Options page loads and saves settings in both browsers.
- Extension icon appears correctly at 16×16 in the toolbar (both browsers render icons differently at small sizes).
- `chrome.runtime.getURL()` returns correct paths in both browsers.
- Any browser-specific feature fallbacks activate correctly in the non-supporting browser.

### Continuous Integration for Cross-Browser

Run automated tests against both browser targets in CI:

```yaml
# .github/workflows/test.yml
jobs:
  test:
    strategy:
      matrix:
        browser: [chrome, firefox]
    steps:
      - run: npm run build:${{ matrix.browser }}
      - run: npm run test:e2e -- --browser ${{ matrix.browser }}
```

Puppeteer supports loading Chrome extensions. Playwright supports loading Chrome extensions and (with additional configuration) Firefox extensions. Both are suitable for automated cross-browser extension testing in CI.
