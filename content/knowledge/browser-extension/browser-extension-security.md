---
name: browser-extension-security
description: Content Security Policy for extensions, prohibitions on eval and inline scripts, host permissions principle of least privilege, and XSS prevention in extension UIs
topics: [browser-extension, security, csp, xss, permissions, least-privilege, eval]
---

Browser extensions run with elevated browser privileges compared to ordinary web pages. A compromised extension can read browsing history, intercept network requests, steal cookies, and inject content into any page it has permission to access. Security is not optional — it is a first-class requirement enforced by the browser, the store review process, and the trust of every user who installs the extension.

## Summary

Manifest V3 enforces a strict Content Security Policy by default that prohibits `eval()`, `new Function()`, and inline scripts — comply with this unconditionally. Never request more host permissions than features require; prefer `activeTab` over broad host permissions. Extension UI pages (popup, options) are vulnerable to XSS if they render untrusted content — sanitize all dynamic HTML, prefer textContent over innerHTML, and use a trusted types policy where supported. Regularly audit permissions and remove any that are no longer needed.

## Deep Guidance

### Content Security Policy for Extensions

Manifest V3 enforces a strict default CSP for extension pages (popup, options, background):

```
script-src 'self'; object-src 'self'
```

This means:
- No inline `<script>` blocks in popup or options HTML.
- No `eval()`, `setTimeout("string")`, `new Function("string")`, or any other string-to-code evaluation.
- No scripts loaded from external URLs.
- All scripts must be bundled into extension package files referenced by `src=` attributes.

**Customizing the extension CSP** (only add what is absolutely necessary):

```json
// manifest.json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'",
    "sandbox": "sandbox allow-scripts; script-src 'self' 'unsafe-eval'"
  }
}
```

`"sandbox"` is a separate policy for sandboxed extension pages. If you need `eval` for a legitimate reason (e.g., a code editor that evaluates JavaScript), use a sandboxed page — `chrome.runtime.getURL('sandbox.html')` — which is isolated from the extension's privileged context.

**Inline scripts prohibition — practical implications:**

```html
<!-- PROHIBITED — inline script blocked by CSP -->
<button onclick="doThing()">Click me</button>
<script>window.onload = function() { init(); }</script>

<!-- CORRECT — event listeners in external JS file -->
<button id="my-btn">Click me</button>
<!-- popup.js (bundled, loaded as external file) -->
```

```typescript
// popup.ts — attach all event handlers here
document.getElementById('my-btn')?.addEventListener('click', doThing);
document.addEventListener('DOMContentLoaded', init);
```

**Audit your build output:** Run a build in production mode and inspect the output. If your popup HTML contains any `<script>` tags with inline content or `onclick` attributes, your bundler is misconfigured.

### Prohibiting eval and String-to-Code Patterns

`eval()` and related patterns are the primary mechanism for code injection attacks. Manifest V3 prohibits them in extension pages — but you must also avoid them in content scripts (where they would be prohibited by the host page's CSP in `document_start` injection, and represent a security risk in any injection mode).

**Patterns to avoid:**

```typescript
// PROHIBITED
eval('doThing()');
setTimeout('doThing()', 1000);  // String argument form only
setInterval('doThing()', 1000);
new Function('return doThing()')();
document.write('<script>doThing()</script>'); // DOM-based code injection

// Safe alternative
setTimeout(doThing, 1000);  // Function reference
setInterval(doThing, 1000);
```

**Dynamic template rendering without eval:**

If you need to render dynamic content (e.g., user-defined templates), use a CSP-compliant template engine that does not use `eval`. Mustache, Handlebars (with the `noEscape` option disabled), or a custom string-interpolation function all work without `eval`.

### Host Permissions: Principle of Least Privilege

Every host permission you declare expands the attack surface of the extension. A compromised extension with `<all_urls>` can inject code into banking websites, steal session cookies from any domain, and exfiltrate browsing history.

**Permission escalation order (prefer the lowest that works):**

1. **No host permission** — Works for extensions that only modify the browser UI (new tab page, toolbar button with popup) without touching page content.
2. **`activeTab`** — Grants access to the current tab's URL and content only when the user explicitly invokes the extension. No install-time warning. No persistent access. Best for "apply this action to the current page" use cases.
3. **Specific origins** — `"host_permissions": ["https://api.example.com/*"]` — Access only to the declared origins. For extensions that call a specific backend API from content scripts.
4. **Pattern-based** — `"https://*.github.com/*"` — All subdomains of a specific domain. For extensions that enhance a specific service.
5. **`<all_urls>`** — Access to every URL. Only justifiable for: ad blockers, password managers, developer tools, reading mode, and similar utilities that genuinely need to operate on any site.

**Optional host permissions for progressive disclosure:**

```json
// manifest.json
{
  "optional_host_permissions": ["https://*.github.com/*", "https://*.gitlab.com/*"]
}
```

```typescript
// Request GitHub permission when user enables GitHub integration
async function enableGitHubIntegration(): Promise<boolean> {
  return chrome.permissions.request({
    origins: ['https://*.github.com/*'],
  });
}

// Check before using
async function isGitHubAccessGranted(): Promise<boolean> {
  return chrome.permissions.contains({
    origins: ['https://*.github.com/*'],
  });
}
```

Progressive permission requests reduce the number of users who abandon the install due to scary permission warnings, and follow the principle of least privilege by only requesting what the user actively needs.

### XSS Prevention in Extension UIs

Extension popup and options pages are HTML documents that can render dynamic content. If that content includes unsanitized user-controlled strings or data from web pages, XSS is possible — and in an extension context, XSS in a privileged page means XSS with full `chrome.*` API access.

**The core rule: never use innerHTML with untrusted content.**

```typescript
// DANGEROUS — XSS if pageTitle contains <script> or event handlers
element.innerHTML = `<div class="title">${pageTitle}</div>`;

// Safe — textContent is never interpreted as HTML
const titleEl = document.createElement('div');
titleEl.className = 'title';
titleEl.textContent = pageTitle;
element.appendChild(titleEl);

// Also safe — explicit sanitization
import DOMPurify from 'dompurify';
element.innerHTML = DOMPurify.sanitize(htmlContent);
```

**DOMPurify for legitimate HTML rendering:**

When you genuinely need to render HTML from a trusted but potentially malicious source (e.g., a page's meta description):

```typescript
import DOMPurify from 'dompurify';

// Sanitize before rendering
const clean = DOMPurify.sanitize(userHtml, {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
  ALLOWED_ATTR: [],  // No attributes — prevents event handler injection
});
element.innerHTML = clean;
```

**Content retrieved from web pages:** Any data that comes from a web page — tab title, page content, metadata, cookies — must be treated as potentially malicious. Apply the same sanitization discipline you would apply to user input in a web application.

**Message data from postMessage:** Content received via `window.postMessage` from page scripts must be treated as untrusted. Never render raw postMessage data as HTML.

### Securing Cross-Context Communication

**Validate message senders:**

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Reject messages from web pages (non-extension senders)
  if (!sender.id || sender.id !== chrome.runtime.id) {
    console.warn('Message from unexpected sender:', sender);
    return;
  }

  // Process message from known extension context
  handleMessage(message, sender, sendResponse);
});
```

**Be cautious with tabs.sendMessage targets:**

When using `chrome.tabs.sendMessage` to push data to a content script, a malicious page may have replaced the content script's context. Validate the sender in the content script:

```typescript
// Content script — validate incoming messages from background
chrome.runtime.onMessage.addListener((message, sender) => {
  // Only accept messages from the extension itself
  if (sender.id !== chrome.runtime.id) return;
  handleBackgroundMessage(message);
});
```

### Secrets and API Keys

Never bundle API secrets or private keys in extension source code:

- Extension source code is accessible to any user who installs it (via `chrome://extensions` → source in developer mode, or by unpacking the CRX/ZIP file).
- The Chrome Web Store stores submitted ZIP files — assume the contents are readable.
- Use a backend proxy service for API calls requiring secret credentials. The extension authenticates to your backend; your backend authenticates to the third-party API.
- If a third-party API supports per-user OAuth tokens, use `chrome.identity.getAuthToken()` or the full OAuth2 flow — user tokens are not bundled secrets.
