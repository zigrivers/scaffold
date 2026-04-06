---
name: browser-extension-testing
description: Extension testing with Puppeteer and Playwright, unit testing shared logic, and manual cross-browser smoke test procedures
topics: [browser-extension, testing, puppeteer, playwright, unit-testing, e2e, smoke-tests, cross-browser]
---

Browser extension testing is harder than web app testing because the extension runs in a privileged browser context that most test frameworks cannot easily access. The strategy is to maximize the code that lives in plain TypeScript (easily unit-tested), minimize the code that requires a real browser to test (expensive), and write targeted end-to-end tests that exercise the extension in a real browser for the scenarios that matter most.

## Summary

Test browser extensions at three levels: unit tests for all shared and context-agnostic logic (Vitest, no browser required), integration tests for message handlers using `jest-chrome` or `sinon-chrome` to mock the `chrome.*` APIs, and end-to-end tests using Playwright or Puppeteer with the extension loaded into a real browser instance. Run a manual cross-browser smoke test checklist before every release. Never consider an extension release done without smoke testing in both Chrome and Firefox.

## Deep Guidance

### Testing Strategy Overview

The extension architecture determines the testing strategy:

- **Shared logic** (`src/shared/`) — Pure TypeScript functions with no browser API dependencies. Unit test with Vitest, Jest, or any standard test runner. No special setup required.
- **Background handlers** (`src/background/handlers/`) — Functions that call `chrome.*` APIs. Test with chrome API mocks (`jest-chrome` or manual mocks). No real browser required.
- **Content script logic** (`src/content/`) — DOM manipulation functions. Test with jsdom (Vitest/Jest built-in) for unit tests. Test integration with Playwright for page injection scenarios.
- **Popup/options UI** (`src/popup/`, `src/options/`) — React/framework components. Test with component testing tools (Vitest + Testing Library). E2E test the full popup flow with Playwright.
- **Full extension integration** — Test the complete extension loaded in a real browser with Playwright or Puppeteer.

### Unit Tests for Shared Logic

Unit tests are the fastest feedback loop and highest ROI in extension testing:

```typescript
// tests/unit/shared/url-helpers.test.ts
import { describe, it, expect } from 'vitest';
import { matchesPattern, normalizeUrl } from '../../../src/shared/url-helpers';

describe('matchesPattern', () => {
  it('matches exact URL', () => {
    expect(matchesPattern('https://example.com/page', 'https://example.com/page')).toBe(true);
  });

  it('matches wildcard pattern', () => {
    expect(matchesPattern('https://example.com/anything', 'https://example.com/*')).toBe(true);
  });

  it('rejects non-matching URL', () => {
    expect(matchesPattern('https://other.com/', 'https://example.com/*')).toBe(false);
  });
});
```

**Architecture rule:** Any logic that can be written without importing `chrome.*` or `browser.*` should be. Utilities for URL parsing, config validation, data transformation, and business logic belong in `src/shared/` and are easily unit-tested.

### Mocking chrome.* APIs

For testing background message handlers and storage operations without a real browser, use chrome API mocks:

**jest-chrome** (for Jest or Vitest with compatibility layer):

```bash
npm install -D jest-chrome
```

```typescript
// tests/setup.ts (Vitest global setup)
import chrome from 'jest-chrome';
Object.assign(global, { chrome });

// Setup default mock implementations
chrome.storage.sync.get.mockImplementation((keys, callback) => {
  callback?.({ enabled: true, sitesConfig: [] });
  return Promise.resolve({ enabled: true, sitesConfig: [] });
});
```

```typescript
// tests/unit/background/message-router.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import chrome from 'jest-chrome';
import { handleMessage } from '../../../src/background/message-router';
import { Messages } from '../../../src/shared/messages';

describe('handleMessage', () => {
  beforeEach(() => {
    chrome.storage.sync.get.mockClear();
  });

  it('responds to POPUP_GET_STATUS with current state', async () => {
    chrome.storage.sync.get.mockResolvedValue({ enabled: true });

    const sendResponse = vi.fn();
    handleMessage(
      { type: Messages.POPUP_GET_STATUS },
      { id: chrome.runtime.id },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ enabled: true }));
  });
});
```

**Manual chrome mock** (for projects that prefer explicit control):

```typescript
// tests/mocks/chrome.ts
export const chromeMock = {
  storage: {
    sync: {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    id: 'test-extension-id',
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
};
```

### End-to-End Tests with Playwright

Playwright supports loading Chrome extensions in a persistent browser context:

```bash
npm install -D @playwright/test
npx playwright install chromium
```

```typescript
// tests/e2e/extension.spec.ts
import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(__dirname, '../../dist/chrome');

let context: BrowserContext;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: false, // Extensions require headed mode in Playwright
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
});

test.afterAll(async () => {
  await context.close();
});

test('extension popup opens and displays status', async () => {
  // Get the extension ID from the background service worker URL
  let extensionId: string;
  const backgroundPages = context.backgroundPages();

  if (backgroundPages.length > 0) {
    const backgroundPage = backgroundPages[0];
    extensionId = new URL(backgroundPage.url()).hostname;
  } else {
    // Wait for the service worker
    const serviceWorker = await context.waitForEvent('serviceworker');
    extensionId = new URL(serviceWorker.url()).hostname;
  }

  // Open the popup as a regular page (full Playwright API access)
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup/index.html`);

  await expect(popupPage.locator('#status-indicator')).toBeVisible();
  await expect(popupPage.locator('#toggle-btn')).toBeEnabled();
});

test('content script injects on target page', async () => {
  const page = await context.newPage();
  await page.goto('https://example.com');

  // Wait for content script to inject
  await page.waitForSelector('#my-ext-overlay', { timeout: 5000 });

  const overlay = page.locator('#my-ext-overlay');
  await expect(overlay).toBeVisible();
});
```

**Playwright limitations with extensions:**
- `headless: false` is required — Chrome does not load extensions in headless mode (as of Playwright 1.40). Use `headless: 'new'` with Chromium 112+ for limited headless extension support.
- The extension must be built before tests run. Wire `build:chrome` to run before the e2e test suite in your CI pipeline.

### End-to-End Tests with Puppeteer

Puppeteer supports Chrome extensions and can run in CI:

```typescript
// tests/e2e/puppeteer-extension.test.ts
import puppeteer, { Browser } from 'puppeteer';
import path from 'path';

const extensionPath = path.resolve(__dirname, '../../dist/chrome');

let browser: Browser;
let extensionId: string;

beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: false, // Required for extensions
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  // Find the extension ID by checking the background page URL
  const targets = await browser.targets();
  const extensionTarget = targets.find(
    t => t.type() === 'service_worker' && t.url().includes('background')
  );
  extensionId = new URL(extensionTarget!.url()).hostname;
});

afterAll(async () => {
  await browser.close();
});

test('extension popup renders correctly', async () => {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup/index.html`);
  const title = await page.$eval('h1', el => el.textContent);
  expect(title).toBe('My Extension');
});
```

### Manual Cross-Browser Smoke Test Checklist

Automated tests cannot catch everything. Run this checklist before every release:

**Chrome smoke test:**
- [ ] Build `dist/chrome` with `npm run build:chrome`.
- [ ] Load unpacked from `chrome://extensions`.
- [ ] Extension icon appears in toolbar with correct icon at 16×16.
- [ ] Click toolbar icon — popup opens without errors (check DevTools console for the popup page).
- [ ] All popup controls are interactive and functional.
- [ ] Toggle enabled/disabled — page content changes as expected.
- [ ] Navigate to a target URL — content script injects without errors (check page DevTools console).
- [ ] Open options page (`chrome://extensions` → Details → Extension options) — loads and saves correctly.
- [ ] Disable the extension — injected content is removed from the page.
- [ ] Check `chrome://extensions` — no errors shown under the extension card.
- [ ] Check service worker DevTools (`Inspect views: Service Worker`) — no uncaught errors.

**Firefox smoke test:**
- [ ] Build `dist/firefox` with `npm run build:firefox`.
- [ ] Load via `about:debugging` → This Firefox → Load Temporary Add-on (select `manifest.json`).
- [ ] Repeat all functional checks from Chrome smoke test.
- [ ] Check Browser Console (`Ctrl+Shift+J`) — no extension errors.
- [ ] Verify `browser.storage.sync` reads/writes work (Firefox syncs separately from Chrome).

**Regression test after every change to:**
- `manifest.json` — Reload the extension and verify all declared features still work.
- Content script matches — Verify the script injects on all intended URLs and not on excluded URLs.
- `chrome.storage` schema — Verify existing storage data is read correctly after the schema change.
- Message types — Verify all message senders and receivers still agree on the message format.
