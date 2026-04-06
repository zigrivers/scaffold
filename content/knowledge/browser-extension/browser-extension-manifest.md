---
name: browser-extension-manifest
description: Manifest V3 schema, permissions declarations, host_permissions, content_scripts configuration, and background service_worker setup
topics: [browser-extension, manifest, manifest-v3, permissions, content-scripts, service-worker, host-permissions]
---

The `manifest.json` is the contract between your extension and the browser. Every capability your extension uses must be declared here before it can be used. Manifest V3 (MV3) is the current standard, having replaced Manifest V2 (MV2) in Chrome. Understanding the MV3 schema in depth prevents runtime errors, store rejections, and security review failures.

## Summary

Manifest V3 separates `permissions` (API access) from `host_permissions` (URL access), requires a service worker instead of a background page, restricts remote code execution, and requires `web_accessible_resources` to include a `matches` field. Declare the minimum required permissions. Use `optional_permissions` and `optional_host_permissions` for features not needed by all users. The `action` key replaces `browser_action`. All `content_scripts` must declare their `matches` precisely.

## Deep Guidance

### Minimal Valid Manifest V3

```json
{
  "manifest_version": 3,
  "name": "__MSG_extensionName__",
  "version": "1.0.0",
  "description": "__MSG_extensionDescription__",
  "short_name": "__MSG_extensionShortName__",
  "default_locale": "en",

  "action": {
    "default_popup": "popup/index.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    },
    "default_title": "__MSG_actionTitle__"
  },

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "content_scripts": [
    {
      "matches": ["https://*.example.com/*"],
      "js": ["content.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],

  "permissions": ["storage", "alarms"],
  "host_permissions": ["https://*.example.com/*"],

  "options_page": "options/index.html",

  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

### permissions Field

`permissions` grants access to Chrome extension APIs. Declare only the APIs your extension actually calls:

| Permission | Grants access to |
|---|---|
| `storage` | `chrome.storage.local`, `chrome.storage.sync`, `chrome.storage.session` |
| `alarms` | `chrome.alarms` (recurring background tasks) |
| `tabs` | `chrome.tabs` (tab URL, title, favicon — triggers install warning) |
| `activeTab` | Active tab URL/content on user gesture (no install warning) |
| `contextMenus` | `chrome.contextMenus` (right-click menu items) |
| `notifications` | `chrome.notifications` |
| `identity` | `chrome.identity` (OAuth2 flow) |
| `webRequest` | `chrome.webRequest` (intercept requests — high scrutiny) |
| `declarativeNetRequest` | `chrome.declarativeNetRequest` (rule-based request blocking) |
| `scripting` | `chrome.scripting.executeScript` (inject scripts programmatically) |
| `history` | `chrome.history` (browsing history access) |
| `bookmarks` | `chrome.bookmarks` |
| `cookies` | `chrome.cookies` |
| `downloads` | `chrome.downloads` |

**activeTab vs tabs:** Prefer `activeTab` over `tabs`. `activeTab` grants temporary access to the current tab URL and content only when the user explicitly invokes the extension (toolbar click, keyboard shortcut, context menu). It does not trigger an install-time warning and does not grant persistent access. Use `tabs` only when you need to enumerate all tabs or access tab information without a user gesture.

### host_permissions Field

`host_permissions` controls which URLs the extension can access via content scripts, `fetch()` from the background, or `chrome.tabs.executeScript()`.

```json
"host_permissions": [
  "https://api.myservice.com/*",
  "https://*.example.com/*"
]
```

**Match pattern syntax:**

- `https://example.com/*` — Only `example.com`, HTTPS only.
- `https://*.example.com/*` — All subdomains of `example.com`, HTTPS only.
- `https://example.com/path/*` — Only paths under `/path/`.
- `*://example.com/*` — Both HTTP and HTTPS.
- `<all_urls>` — Every URL. Triggers maximum-severity install warning. Avoid unless the use case is genuinely broad (ad blockers, password managers, reading mode).

**Optional host permissions** reduce the install-time permission scope and request access contextually:

```json
"optional_host_permissions": ["https://*.github.com/*"]
```

```typescript
// Request at runtime when the user enables the GitHub integration
const granted = await chrome.permissions.request({
  origins: ['https://*.github.com/*'],
});
```

### content_scripts Configuration

Content scripts are injected into matching pages according to their declaration in `manifest.json`.

```json
"content_scripts": [
  {
    "matches": ["https://*.example.com/*"],
    "exclude_matches": ["https://example.com/admin/*"],
    "js": ["content.js"],
    "css": ["content.css"],
    "run_at": "document_idle",
    "all_frames": false,
    "world": "ISOLATED"
  }
]
```

**run_at options:**
- `"document_start"` — Injected before any DOM is built. Useful for blocking scripts from loading. High risk of performance impact.
- `"document_end"` — Injected after DOM is ready but before sub-resources (images, stylesheets) finish loading.
- `"document_idle"` — (Default) Injected after `DOMContentLoaded` and when the page is "idle." Best choice for most extensions.

**world options (MV3 Chrome 102+):**
- `"ISOLATED"` — (Default) Content script runs in the isolated JavaScript world. Cannot access page's JavaScript variables.
- `"MAIN"` — Content script runs in the page's JavaScript world. Can access page variables and global state. Use only when you must interact with the page's JavaScript API. Increases security risk.

**all_frames:** Set to `true` to inject into iframes on matching pages. Default is `false`. Only enable if the extension's functionality is needed within iframes.

**Programmatic injection with chrome.scripting:**

For content scripts that should only be injected on user demand (not all matching pages):

```typescript
// Background — inject only when user requests it
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js'],
  });
  await chrome.scripting.insertCSS({
    target: { tabId: tab.id },
    files: ['content.css'],
  });
});
```

Programmatic injection requires the `scripting` permission and appropriate `host_permissions` for the target URL.

### background.service_worker

```json
"background": {
  "service_worker": "background.js",
  "type": "module"
}
```

`"type": "module"` enables ES module syntax (`import`/`export`) in the service worker. Recommended for TypeScript projects since the bundler outputs ES modules. Without this field, the service worker is treated as a classic script.

**MV2 to MV3 migration notes:**

- MV2 `"background": { "scripts": [...] }` → MV3 `"background": { "service_worker": "..." }`.
- MV2 background pages are persistent. MV3 service workers are not. State in global variables will be lost.
- `chrome.browserAction` → `chrome.action`.
- `chrome.pageAction` → `chrome.action` (with `show_matches` / `hide_matches`).
- Remote code execution (`eval`, remote `<script>` tags, `new Function()` from remote strings) is prohibited in MV3.

### web_accessible_resources

Resources that content scripts or host pages need to load from the extension package:

```json
"web_accessible_resources": [
  {
    "resources": ["images/*.png", "fonts/*.woff2"],
    "matches": ["https://*.example.com/*"]
  },
  {
    "resources": ["sandbox.html"],
    "matches": ["<all_urls>"]
  }
]
```

The `matches` field is required in MV3 (optional in MV2). Restricting `matches` to only the pages that need the resources limits the attack surface — arbitrary pages cannot load the extension's resources unless they match. Use `"<all_urls>"` only for resources that genuinely need to be accessible from any page.

Access declared resources in content scripts with `chrome.runtime.getURL('images/logo.png')`.

### Version Management

```json
"version": "1.4.2",
"version_name": "1.4.2 Beta"
```

- `version` — Machine-readable four-part version used by the store for update detection. Must be strictly greater than the previous published version to be accepted as an update.
- `version_name` — Human-readable display name shown in the extensions management page. Optional; defaults to `version` if omitted.

Automate version synchronization between `manifest.json` and `package.json` with a build script that reads `package.json` version and writes it to `manifest.json` before building.
