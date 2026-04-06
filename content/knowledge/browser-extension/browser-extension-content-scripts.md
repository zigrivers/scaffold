---
name: browser-extension-content-scripts
description: DOM manipulation from content scripts, isolated worlds, CSS injection, and communicating with the host page via postMessage
topics: [browser-extension, content-scripts, dom-manipulation, isolated-worlds, css-injection, postmessage]
---

Content scripts are the extension's interface with the web page. They run inside the page's DOM but in an isolated JavaScript world — they see the same HTML and can manipulate the same elements, but they cannot access the page's JavaScript variables or prototype chain without explicitly crossing the world boundary. Understanding this isolation is essential for writing content scripts that are both functional and secure.

## Summary

Content scripts execute in an isolated JavaScript world by default (ISOLATED world): they have DOM access but no access to the page's JS globals. CSS is injected via manifest declarations or `chrome.scripting.insertCSS()`. Communication with the host page uses `window.postMessage()` (crosses the world boundary) with origin validation. Communication with the background service worker uses `chrome.runtime.sendMessage()`. Minimize DOM manipulation, use `MutationObserver` for dynamic pages, and always clean up injected elements and observers when the extension is disabled.

## Deep Guidance

### Isolated Worlds

The isolated world is the security boundary between extension code and page code. It has important implications:

**What content scripts can access:**
- The full DOM (`document`, `window.location`, `document.querySelector`, all DOM methods).
- The `window` object's properties that are reflected from the DOM (e.g., `window.location`, `window.document`).
- `window.addEventListener` — content scripts and page scripts can both add listeners to the same DOM events.

**What content scripts cannot access:**
- JavaScript variables defined by the page script (`window.myApp`, `window.React`, page-defined globals).
- DOM properties set by page scripts that are not reflected in the HTML (e.g., a React component's state stored in a closure).
- Custom properties set on DOM elements by page scripts (e.g., `element._reactInternals` — the element is accessible but the custom property is set in the page world, not visible in the isolated world).

**MAIN world execution** (when you need page-world access):

```json
// manifest.json
"content_scripts": [
  {
    "matches": ["https://example.com/*"],
    "js": ["content-main-world.js"],
    "world": "MAIN"
  }
]
```

Or programmatically:

```typescript
await chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    // This runs in the page's JavaScript world
    return window.myPageGlobal?.someValue;
  },
  world: 'MAIN',
});
```

Use MAIN world execution sparingly — it gives extension code full access to page variables, increasing the risk of interference and XSS if inputs are not sanitized.

### DOM Manipulation Patterns

**Safe element injection:**

```typescript
// Create a container that isolates extension styles from the page
function injectOverlay(): void {
  // Check for duplicate injection
  if (document.getElementById('my-ext-overlay')) return;

  const container = document.createElement('div');
  container.id = 'my-ext-overlay';
  container.setAttribute('role', 'complementary');
  container.setAttribute('aria-label', 'My Extension');

  // Use Shadow DOM for style isolation
  const shadow = container.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = overlayCSS; // Inline CSS string

  const content = document.createElement('div');
  content.className = 'overlay-content';

  shadow.appendChild(style);
  shadow.appendChild(content);
  document.body.appendChild(container);
}
```

**Why Shadow DOM:** Shadow DOM provides style encapsulation. Extension styles do not leak into the host page, and host page styles do not affect extension UI. This is the correct approach for injecting interactive UI elements. If you only need to inject non-interactive content or annotations, direct DOM insertion is acceptable.

**Cleanup on disable:**

```typescript
function cleanup(): void {
  const overlay = document.getElementById('my-ext-overlay');
  overlay?.remove();
  observer?.disconnect();
  window.removeEventListener('message', messageHandler);
}

// Listen for cleanup signal from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === Messages.BG_CLEAR_STATE) {
    cleanup();
  }
});
```

Always implement cleanup. Users who disable the extension expect the page to return to its original state without requiring a refresh.

### Handling Dynamic Pages (SPA and Infinite Scroll)

Modern web apps modify the DOM after initial load. `document_idle` injection runs once — if the relevant content loads asynchronously, the content script misses it.

**MutationObserver for dynamic content:**

```typescript
function observeForTargetElements(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const el = node as Element;

        if (el.matches('.target-class')) {
          processElement(el);
        }
        // Also check descendants
        el.querySelectorAll('.target-class').forEach(processElement);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
```

**Performance consideration:** `MutationObserver` callbacks run synchronously after DOM mutations. Heavy work in the callback (complex selectors, network requests) will block the page's rendering. Defer expensive work:

```typescript
const deferredWork = debounce((elements: Element[]) => {
  elements.forEach(processElement);
}, 100);

const observer = new MutationObserver((mutations) => {
  const targets = mutations
    .flatMap(m => [...m.addedNodes])
    .filter(n => n.nodeType === Node.ELEMENT_NODE)
    .flatMap(el => [...(el as Element).querySelectorAll('.target-class')]);

  if (targets.length > 0) deferredWork(targets);
});
```

**URL change detection (for SPA navigation):**

SPAs change the URL via `history.pushState` without triggering a page load. Content scripts do not automatically re-run on SPA navigation:

```typescript
let lastUrl = location.href;

const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    onNavigate(location.href);
  }
});

urlObserver.observe(document, { subtree: true, childList: true });
```

### CSS Injection

**Method 1 — Manifest declaration (preferred for always-on styles):**

```json
"content_scripts": [
  {
    "matches": ["https://example.com/*"],
    "css": ["content.css"]
  }
]
```

Injected stylesheets receive the lowest specificity among author styles. Host page styles with equal or higher specificity will override them. Use high-specificity selectors or `!important` (sparingly) on extension-injected styles that must not be overridden.

**Method 2 — Programmatic injection:**

```typescript
// From background service worker
await chrome.scripting.insertCSS({
  target: { tabId },
  files: ['content.css'],
});

// Remove previously injected CSS
await chrome.scripting.removeCSS({
  target: { tabId },
  files: ['content.css'],
});
```

Programmatic injection allows toggling styles on demand. Use it when the extension can be enabled/disabled per site.

**Method 3 — Inline style element (for dynamic styles):**

```typescript
const style = document.createElement('style');
style.id = 'my-ext-styles';
style.textContent = generateDynamicCSS(userPreferences);
document.head.appendChild(style);
```

### Communication with the Host Page via postMessage

Content scripts and page scripts cannot call each other's functions directly due to world isolation. `window.postMessage` is the crossing mechanism.

**Sending from content script to page script:**

```typescript
// Content script — send message to page
window.postMessage(
  { source: 'my-extension', type: 'INIT', payload: { version: '1.0' } },
  window.location.origin, // MUST restrict origin — never use '*' for extension messages
);
```

**Receiving in page script:**

```javascript
// Page script
window.addEventListener('message', (event) => {
  // ALWAYS validate source origin
  if (event.origin !== window.location.origin) return;
  if (!event.data || event.data.source !== 'my-extension') return;

  handleExtensionMessage(event.data);
});
```

**Receiving in content script from page:**

```typescript
// Content script — receive messages from page script
function messageHandler(event: MessageEvent): void {
  if (event.origin !== window.location.origin) return;
  if (!event.data || event.data.source !== 'my-page-app') return;

  // Forward to background service worker
  chrome.runtime.sendMessage({
    type: Messages.CONTENT_PAGE_LOADED,
    payload: event.data.payload,
  });
}

window.addEventListener('message', messageHandler);
```

**Security rules for postMessage:**
- Always specify the target origin — never use `'*'`. Malicious pages at other origins could otherwise intercept extension messages.
- Always validate `event.origin` in receivers.
- Always validate a `source` field on the message object to distinguish extension messages from other `postMessage` traffic on the page.
- Never pass sensitive data (auth tokens, PII) via `postMessage` — the host page receives these messages too.
