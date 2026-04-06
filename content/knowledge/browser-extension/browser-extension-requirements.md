---
name: browser-extension-requirements
description: User permissions model, store policies (Chrome Web Store, AMO), accessibility requirements, and performance budgets for browser extensions
topics: [browser-extension, requirements, permissions, store-policies, accessibility, performance]
---

Browser extension requirements differ fundamentally from web app requirements because the extension operates inside a user's browser with elevated trust and broad access to browsing data. Every permission requested must be justified, every store policy must be understood before writing code, and performance budgets must be set early because extensions run on every page a user visits — regressions directly degrade the entire browsing experience.

## Summary

Browser extension requirements center on four domains: permissions (request only what the feature requires, justify each in the store listing), store policies (Chrome Web Store and AMO have distinct review timelines and policy sets that affect architecture decisions), accessibility (popup UIs must meet WCAG 2.1 AA, keyboard-only operation is mandatory), and performance budgets (content scripts add parse time to every page load, service workers must stay under memory limits). Lock these down before implementation to avoid costly store rejections or permission refactors.

## Deep Guidance

### User Permissions Model

The permissions model is the most consequential requirement decision. Every permission granted to an extension represents a promise to the user and a liability in the store review process.

**Permission categories in Manifest V3:**

- `permissions` — Declared API access that is always active (e.g., `storage`, `tabs`, `alarms`, `contextMenus`). Granted at install time with no per-use prompt.
- `host_permissions` — Access to specific origins or all origins (`<all_urls>`). Triggers a prominent install-time warning. In MV3, these can be made optional via `optional_host_permissions`.
- `optional_permissions` — APIs requested at runtime via `chrome.permissions.request()`. Prefer optional for features that not all users need.

**Principle of least privilege — apply strictly:**

- Never request `<all_urls>` if you only need `https://api.example.com/*`. Broad host permissions trigger stricter review and user concern.
- Request `tabs` only if you need tab URL, title, or favicon. If you only need the active tab's content, use `activeTab` instead — it requires no persistent permission and is granted only on explicit user gesture.
- Audit permissions on every sprint. Remove any permission no longer used by shipping features.

**Sensitive permissions that trigger enhanced review:**

- `webRequest` / `declarativeNetRequest` — Modifying network requests is the highest-scrutiny permission. Justify it explicitly in your store listing.
- `history` — Access to browsing history requires strong justification.
- `cookies` — Access to cookies including session tokens requires explicit user-facing documentation of what data is accessed and why.
- `nativeMessaging` — Communicates with native applications; triggers manual review on CWS.

**Communicating permissions to users:**

- Write a clear Privacy Policy linked in the store listing before submission. Extensions that access user data without a privacy policy are rejected.
- The store listing description must explain every permission in plain language. "This extension requires access to all websites to block ads" is better than silence.

### Chrome Web Store Policies

The Chrome Web Store (CWS) review process is automated for most submissions but involves manual review for sensitive permissions or policy violations.

**Key policies affecting architecture:**

- **Single purpose policy**: An extension must have a single, clearly described purpose. A "productivity suite" that does 10 unrelated things will be rejected. Define the purpose before writing code.
- **No remote code execution**: Extensions cannot load and execute remote JavaScript. All logic must be bundled at submission time. This directly prohibits `eval()`, `new Function()`, and dynamic `<script>` injection from remote URLs.
- **Data use transparency**: Any data collected or transmitted must be disclosed in the Privacy Policy and the Data Use section of the developer console.
- **Deceptive behavior**: Extensions must not alter user settings (search engine, homepage, new tab page) without explicit opt-in. Implementing a new tab override requires a first-run setup flow where the user explicitly enables it.

**Review timelines:**

- New extensions: 1–3 business days for automated review; manual review can take 1–2 weeks.
- Updates to existing extensions: typically 24–72 hours.
- Permission changes in updates trigger re-review and may prompt existing users to re-approve.

**CWS rejection common causes:**

- Requesting permissions not used by any feature in the submitted version.
- Missing or incomplete Privacy Policy for extensions that access user data.
- Violating the remote code execution policy (using `eval` in content scripts).
- Deceptive store listing (screenshots that do not match actual functionality).

### Mozilla Add-ons (AMO) Policies

AMO (addons.mozilla.org) has a more developer-friendly review process but with distinct requirements:

- **Source code review**: AMO reviewers may request the unminified source code for manual inspection. Always submit source maps or the raw source alongside minified builds.
- **No obfuscation**: Obfuscated code is not permitted. Minification is fine; intentional obfuscation is grounds for rejection.
- **Listed vs. self-distributed**: AMO-listed extensions receive a full review. Self-distributed (signed but unlisted) extensions receive only automated signing. Most extensions should target listed status.
- **WebExtensions API compliance**: AMO does not support Manifest V3 features that Chrome added post-specification. Use `webextension-polyfill` and test against the current Firefox ESR.

### Accessibility Requirements

Extension popup UIs are full web interfaces and must meet WCAG 2.1 AA:

- **Keyboard navigation**: Every interactive element must be reachable and operable via keyboard alone. Tab order must be logical. Focus must be visible at all times.
- **Color contrast**: Text must meet 4.5:1 contrast ratio for normal text, 3:1 for large text. Dark-mode-only extensions are exempt from light-mode contrast checks but must still pass in their target mode.
- **ARIA roles**: Use semantic HTML first. Add ARIA roles only where semantic HTML is insufficient. Popup UIs are typically small enough that semantic HTML covers all cases.
- **Screen reader compatibility**: Test with NVDA + Firefox and VoiceOver + Chrome. Extension popups open in a context that screen readers handle differently from regular web pages — verify announce behavior on open.

Content scripts that inject UI into host pages must not break the host page's existing accessibility tree. Use `aria-hidden` on injected containers where appropriate and avoid stealing focus unexpectedly.

### Performance Budgets

Extensions impose a cost on every page load and every browser session. Set explicit budgets before implementation:

**Content script budgets:**
- Parse + execute time: under 50 ms on a mid-range device for the combined content script bundle.
- DOM manipulation: defer DOM modifications until `DOMContentLoaded` or later. Synchronous DOM work in `document_start` blocks page render.
- Bundle size: content script bundle under 100 KB (uncompressed). Prefer tree-shaken, purpose-built code over importing full utility libraries.

**Service worker budgets:**
- Background service workers are terminated after ~30 seconds of inactivity in Chrome. Design for stateless, event-driven operation.
- Memory ceiling: Chrome enforces a per-extension memory limit. Keep the service worker footprint under 50 MB. Use `chrome.storage` for persistent state rather than in-memory caches.

**Popup UI budgets:**
- Popup open-to-interactive: under 300 ms. Popups that block on slow network requests before rendering anything will feel broken.
- Bundle size: popup bundle under 200 KB. Users open and close popups frequently; fast load matters.

**Measurement:**
- Profile content scripts with Chrome DevTools Performance panel on a cold-cache page load.
- Use `chrome.runtime.getBackgroundPage()` (MV2) or service worker `self.performance` metrics to measure background processing time.
- Run Lighthouse on the popup HTML file directly to catch performance regressions in the UI.
