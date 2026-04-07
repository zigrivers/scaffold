---
name: browser-extension-architecture
description: Component isolation across content scripts, background service workers, and popup pages; message passing patterns; and state synchronization strategies
topics: [browser-extension, architecture, message-passing, state-synchronization, service-worker, content-scripts]
---

Browser extension architecture is fundamentally different from web app architecture because the application is split across multiple isolated execution environments that cannot share memory directly. Content scripts run inside host pages but in an isolated JavaScript world. Service workers run in a separate context that is terminated and re-created between events. Popup pages are ephemeral — they exist only while the popup is open. These constraints drive every architectural decision: communication is via message passing, state must be externalized to `chrome.storage`, and every component must tolerate being initialized from scratch at any time.

## Summary

Browser extensions have three primary execution contexts: content scripts (run in page context, DOM access, restricted API), background service worker (runs in extension context, full API access, no DOM, terminated between events), and popup/options pages (full HTML pages, full API access, ephemeral lifecycle). Communication between contexts is via `chrome.runtime.sendMessage` (one-shot) or `chrome.runtime.connect` (persistent port). State is synchronized via `chrome.storage` as the single source of truth, with `chrome.storage.onChanged` listeners propagating changes to interested contexts.

## Deep Guidance

### Execution Context Isolation

Understanding the isolation boundaries is the foundation of extension architecture. Bugs caused by violating these boundaries are subtle and hard to diagnose.

**Content scripts:**
- Execute in the context of a web page but in an isolated JavaScript world — they share the DOM with the page but do not share the JavaScript scope.
- Can read and modify the DOM.
- Can communicate with the host page via `window.postMessage` (crosses the world boundary).
- Can call a limited subset of `chrome.*` APIs: `chrome.runtime.sendMessage`, `chrome.runtime.connect`, `chrome.storage`, `chrome.i18n`.
- Cannot call `chrome.tabs`, `chrome.windows`, `chrome.browsingData`, or most other privileged APIs.
- Multiple content scripts run as separate injected scripts — they share the isolated world and can communicate via DOM events or shared global state if needed.

**Background service worker:**
- Runs in the extension context — fully isolated from any web page.
- Has access to the full `chrome.*` API surface.
- Has no DOM — `document` and `window` are undefined.
- Is event-driven: Chrome terminates the service worker when it is idle and restarts it when an event arrives. Never rely on in-memory state surviving between event handlers.
- All persistent state must live in `chrome.storage.local`, `chrome.storage.sync`, or `IndexedDB`.

**Popup and options pages:**
- Full HTML pages loaded in the extension context.
- Have full `chrome.*` API access and full DOM access.
- Popup: exists only while the popup window is open. Closing the popup destroys all JavaScript state. Do not use the popup as a state manager.
- Options page: persistent as long as the tab is open, but still an ephemeral page that should load its state from `chrome.storage` on mount.

### Message Passing Architecture

Message passing is the only way for isolated contexts to communicate. Design a clear message flow before writing handlers.

**One-shot messages (chrome.runtime.sendMessage):**

```typescript
// Sender (popup or content script)
const response = await chrome.runtime.sendMessage<RequestPayload, ResponsePayload>({
  type: Messages.POPUP_GET_STATUS,
  payload: undefined,
});

// Receiver (background service worker)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === Messages.POPUP_GET_STATUS) {
    getStatus().then(sendResponse);
    return true; // Required for async sendResponse
  }
});
```

**Key rules for sendMessage:**
- The listener must `return true` if `sendResponse` will be called asynchronously. Failing to return `true` causes the message channel to close before the response arrives.
- Wrap all `sendMessage` calls in try/catch — if no listener is registered (e.g., the service worker has not started yet), Chrome throws `"Could not establish connection. Receiving end does not exist."`.
- One-shot messages are appropriate for request/response patterns: get current state, toggle a setting, trigger an action.

**Persistent connections (chrome.runtime.connect):**

```typescript
// Content script — persistent port for streaming updates
const port = chrome.runtime.connect({ name: 'content-state-stream' });

port.onMessage.addListener((message) => {
  applyStateUpdate(message);
});

port.onDisconnect.addListener(() => {
  // Service worker was terminated or background closed the port
  // Reconnect or degrade gracefully
});

// Background service worker
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'content-state-stream') {
    // Store port reference for pushing updates
    activePorts.add(port);
    port.onDisconnect.addListener(() => {
      activePorts.delete(port);
    });
  }
});
```

Use persistent ports for: real-time updates pushed from background to content, long-lived streams (e.g., streaming API responses), and cases where the overhead of repeated `sendMessage` calls is unacceptable.

**Background-to-content communication:**

Sending messages from the background to a content script requires knowing the tab ID:

```typescript
// Background → Content (requires tab ID)
await chrome.tabs.sendMessage(tabId, {
  type: Messages.BG_INJECT_OVERLAY,
  payload: { data },
});
```

The background cannot send to a content script without a tab ID. Obtain it from `sender.tab.id` in an incoming message, from `chrome.tabs.query()`, or from the `chrome.tabs.onActivated` event.

### State Synchronization Architecture

`chrome.storage` is the single source of truth for all extension state. Every context reads from and writes to storage; no context holds authoritative state in memory.

**Storage tiers:**

- `chrome.storage.sync` — Syncs across the user's browsers via their Google/Firefox account. Limited to 100 KB total, 8 KB per item. Use for user preferences and settings.
- `chrome.storage.local` — Local to the device. 10 MB default limit (can request 5 GB with `unlimitedStorage` permission). Use for cached data, large state objects, per-device state.
- `chrome.storage.session` — (Chrome 102+) — Cleared when the browser session ends. Use for ephemeral state that must survive service worker restarts within a session but not persist across browser restarts.

**Typed storage wrapper pattern:**

```typescript
// src/shared/storage.ts
export const StorageKeys = {
  ENABLED: 'enabled',
  SITES_CONFIG: 'sitesConfig',
  LAST_ACTIVE: 'lastActive',
} as const;

export interface ExtensionState {
  [StorageKeys.ENABLED]: boolean;
  [StorageKeys.SITES_CONFIG]: SiteConfig[];
  [StorageKeys.LAST_ACTIVE]: number;
}

export async function getState(): Promise<Partial<ExtensionState>> {
  return chrome.storage.sync.get(null) as Promise<Partial<ExtensionState>>;
}

export async function setState(partial: Partial<ExtensionState>): Promise<void> {
  return chrome.storage.sync.set(partial);
}
```

**Reactive state propagation with onChanged:**

```typescript
// In popup or options page — react to storage changes in real time
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[StorageKeys.ENABLED]) {
    const newValue = changes[StorageKeys.ENABLED].newValue as boolean;
    setUIEnabled(newValue);
  }
});
```

This pattern ensures all open popup/options pages reflect state changes made by background or content scripts without requiring explicit message passing.

### Popup Architecture

The popup is stateless by design — it reads from storage on open and writes to storage on user interaction. The background reacts to storage changes.

**Anti-pattern:** Popup sends message to background requesting action → background performs action → background sends message back to popup. This creates a request/response round trip that duplicates what storage-driven reactivity provides for free.

**Correct pattern:** Popup writes to storage → background listens via `chrome.storage.onChanged` → background performs action → background writes result to storage → popup listens via `chrome.storage.onChanged` → popup updates UI.

### Service Worker Lifecycle Management

Because the service worker is terminated when idle, all setup that must survive restarts belongs in `chrome.storage`, not in module-level variables.

**Install handler — first-run initialization:**

```typescript
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // Set default state
    await chrome.storage.sync.set({
      [StorageKeys.ENABLED]: true,
      [StorageKeys.SITES_CONFIG]: [],
    });
    // Open onboarding tab
    await chrome.tabs.create({ url: chrome.runtime.getURL('options/index.html') });
  }
  if (reason === chrome.runtime.OnInstalledReason.UPDATE) {
    // Handle migration if schema changed
    await migrateStorage();
  }
});
```

**Keeping the service worker active when needed:**

For operations that must not be interrupted by service worker termination (e.g., a long-running fetch), use the Chrome alarms API to schedule a "keepalive" alarm, or use `chrome.storage.session` to track whether work is in progress and re-initiate it on service worker restart.

Never use `setInterval` or `setTimeout` for recurring background work — they do not survive service worker termination. Use `chrome.alarms` instead.
