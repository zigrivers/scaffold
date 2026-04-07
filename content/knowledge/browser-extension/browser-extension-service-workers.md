---
name: browser-extension-service-workers
description: Extension service worker lifecycle (install/activate), event-driven programming model, alarms API for recurring tasks, and persistent state via chrome.storage
topics: [browser-extension, service-worker, lifecycle, alarms, chrome-storage, event-driven, background]
---

The Manifest V3 background service worker is the most architecturally disruptive change from MV2. The persistent background page that could hold state indefinitely is gone. Service workers are event-driven and ephemeral — Chrome terminates them when idle and restarts them when events arrive. Every design decision for background logic must account for this constraint.

## Summary

Extension service workers follow a lifecycle of install, activate, and per-event wake-up/terminate cycles. All persistent state must be in `chrome.storage` — never rely on module-level variables surviving between events. Use `chrome.alarms` for recurring background tasks (never `setInterval`). Listen for `chrome.runtime.onInstalled` to perform first-run setup and migration. Structure the service worker as a pure event dispatcher that routes to handler functions, keeping the top-level script lean so it parses and registers listeners quickly on each wake-up.

## Deep Guidance

### Service Worker Lifecycle

The extension service worker has three lifecycle phases:

**1. Install**

Fires once when the extension is first installed or when an update changes the service worker script. This is where you set default state:

```typescript
chrome.runtime.onInstalled.addListener(async ({ reason, previousVersion }) => {
  switch (reason) {
    case chrome.runtime.OnInstalledReason.INSTALL:
      // First-time install — set defaults
      await chrome.storage.sync.set({
        enabled: true,
        theme: 'auto',
        blocklist: [],
      });
      // Open onboarding page
      await chrome.tabs.create({
        url: chrome.runtime.getURL('options/index.html?onboarding=true'),
      });
      break;

    case chrome.runtime.OnInstalledReason.UPDATE:
      // Extension updated — run migration if needed
      if (previousVersion && isOlderThan(previousVersion, '2.0.0')) {
        await migrateV1ToV2();
      }
      break;

    case chrome.runtime.OnInstalledReason.CHROME_UPDATE:
      // Chrome updated — rarely needs handling
      break;
  }
});
```

**2. Activate**

For extension service workers, `activate` fires immediately after `install`. In the web service worker model, `activate` is used for cache cleanup; extension service workers rarely need custom `activate` logic. Chrome handles the transition automatically.

**3. Event-driven execution**

After install/activate, the service worker is idle. Chrome terminates it after 30 seconds of inactivity. It is restarted when:
- A message arrives via `chrome.runtime.onMessage` or a port connection via `chrome.runtime.onConnect`.
- An alarm fires via `chrome.alarms.onAlarm`.
- A browser event fires: `chrome.tabs.onActivated`, `chrome.tabs.onUpdated`, `chrome.storage.onChanged`, etc.
- The user clicks the extension action (toolbar button).

**Critical implication:** Every event handler must be registered at the top level of the service worker script, not inside async callbacks or deferred initialization. Chrome only keeps the service worker alive long enough to process the current event — if a listener is registered in a `setTimeout` or inside a `Promise.then`, it may never execute because the service worker was terminated before the deferred code ran.

### Event-Driven Architecture Pattern

The service worker entry point should be a lean dispatcher. Heavy logic belongs in imported handler modules:

```typescript
// background/index.ts — the service worker entry point

// Import handlers (all imports resolve synchronously at parse time)
import { handleMessage } from './message-router';
import { handleAlarm } from './alarm-handlers';
import { handleTabUpdate } from './tab-handlers';
import { handleInstalled } from './install';

// Register ALL event listeners at the TOP LEVEL immediately
// Chrome requires listeners to be registered synchronously during
// the service worker's initial execution
chrome.runtime.onInstalled.addListener(handleInstalled);
chrome.runtime.onMessage.addListener(handleMessage);
chrome.alarms.onAlarm.addListener(handleAlarm);
chrome.tabs.onUpdated.addListener(handleTabUpdate);

// DO NOT do this — the listener may never be registered
async function init() {
  await loadConfig(); // ← If this takes time, Chrome may terminate the SW first
  chrome.runtime.onMessage.addListener(handleMessage); // ← Never reached
}
init();
```

**Message router pattern:**

```typescript
// background/message-router.ts
export function handleMessage(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): boolean | undefined {
  switch (message.type) {
    case Messages.POPUP_GET_STATUS:
      getStatus().then(sendResponse);
      return true; // Async response

    case Messages.POPUP_TOGGLE_ENABLED:
      toggleEnabled(message.payload.enabled).then(() => sendResponse());
      return true;

    case Messages.CONTENT_PAGE_LOADED:
      handlePageLoaded(message.payload, sender.tab?.id);
      // No response needed — fall through (returns undefined → synchronous)
      break;

    default:
      console.warn('Unhandled message type:', message.type);
  }
}
```

### Avoiding State Loss on Service Worker Termination

**Anti-pattern — in-memory cache:**

```typescript
// WRONG — this cache is lost when the service worker is terminated
const configCache = new Map<string, SiteConfig>();

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === Messages.CONTENT_REQUEST_CONFIG) {
    // May return undefined if SW was terminated and cache was cleared
    return configCache.get(message.payload.url);
  }
});
```

**Correct pattern — always read from storage:**

```typescript
// CORRECT — storage persists across service worker terminations
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === Messages.CONTENT_REQUEST_CONFIG) {
    getConfigForUrl(message.payload.url).then(sendResponse);
    return true;
  }
});

async function getConfigForUrl(url: string): Promise<SiteConfig | null> {
  const { sitesConfig } = await chrome.storage.sync.get('sitesConfig');
  return sitesConfig?.find((c: SiteConfig) => urlMatches(url, c.pattern)) ?? null;
}
```

**chrome.storage.session for within-session state:**

Chrome 102+ provides `chrome.storage.session` — storage that persists across service worker restarts within a browser session but is cleared when the browser closes:

```typescript
// Track whether we're mid-operation, survives SW restart within session
await chrome.storage.session.set({ processingTabId: tabId });

// On SW restart, check if interrupted work needs resuming
const { processingTabId } = await chrome.storage.session.get('processingTabId');
if (processingTabId) {
  await resumeProcessing(processingTabId);
}
```

### Alarms API for Recurring Tasks

`setInterval` and `setTimeout` do not survive service worker termination. Use `chrome.alarms` for any recurring background work.

**Registering alarms (must be idempotent):**

```typescript
// Register in onInstalled AND when the service worker starts up
// (In case alarms were cleared by a browser update)
async function ensureAlarmsRegistered(): Promise<void> {
  const existing = await chrome.alarms.get('sync-check');
  if (!existing) {
    chrome.alarms.create('sync-check', {
      periodInMinutes: 15,
      delayInMinutes: 1, // First fire after 1 minute
    });
  }

  const existingDaily = await chrome.alarms.get('daily-cleanup');
  if (!existingDaily) {
    chrome.alarms.create('daily-cleanup', {
      periodInMinutes: 60 * 24,
      when: Date.now() + 60 * 60 * 1000, // First fire in 1 hour
    });
  }
}

// Call on install and at service worker startup
chrome.runtime.onInstalled.addListener(ensureAlarmsRegistered);
// Also call when SW starts (in case alarms were lost)
ensureAlarmsRegistered();
```

**Alarm handler:**

```typescript
chrome.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case 'sync-check':
      await performSyncCheck();
      break;
    case 'daily-cleanup':
      await performDailyCleanup();
      break;
    default:
      console.warn('Unknown alarm:', alarm.name);
  }
});
```

**Minimum alarm interval:** Chrome enforces a minimum alarm interval of 1 minute (or 30 seconds in some contexts). Do not attempt sub-minute recurring tasks with alarms — use a polling loop within a single alarm handler if sub-minute work is needed, and be aware this will keep the service worker alive.

### Keeping the Service Worker Alive for Long Operations

For long-running operations that must not be interrupted (e.g., downloading and processing a large file), use strategies to prevent premature termination:

**Strategy 1 — Chain promises to stay active:**

Chrome extends the service worker's lifetime as long as there are pending promises created within the current event handler. Keep a promise chain alive for the duration of the work:

```typescript
chrome.runtime.onMessage.addListener((_msg, _sender, sendResponse) => {
  // The returned `true` and the pending `sendResponse` keep the SW alive
  runLongOperation()
    .then(result => sendResponse({ success: true, result }))
    .catch(err => sendResponse({ success: false, error: err.message }));
  return true;
});
```

**Strategy 2 — Use the service worker's `waitUntil` equivalent:**

Extension service workers do not have `event.waitUntil()` like web service workers. The closest equivalent is to keep an event's `sendResponse` callback pending, or to hold a port connection open.

**Strategy 3 — Checkpoint progress to storage:**

For operations that genuinely need more time than the service worker lifetime allows, checkpoint progress to `chrome.storage.session` and resume on the next alarm or message:

```typescript
async function processInChunks(items: Item[]): Promise<void> {
  const { processedIndex = 0 } = await chrome.storage.session.get('processedIndex');

  for (let i = processedIndex; i < items.length; i++) {
    await processItem(items[i]);
    // Checkpoint every 10 items in case SW is terminated
    if (i % 10 === 0) {
      await chrome.storage.session.set({ processedIndex: i });
    }
  }

  await chrome.storage.session.remove('processedIndex');
}
```
