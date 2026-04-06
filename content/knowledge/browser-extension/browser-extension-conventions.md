---
name: browser-extension-conventions
description: Naming conventions for manifests, message action types, file organization, and i18n structure in browser extensions
topics: [browser-extension, conventions, naming, i18n, file-organization, messaging]
---

Browser extensions accumulate technical debt faster than typical web apps because they span multiple execution contexts — content scripts, service workers, popup pages, options pages — each with distinct constraints. Consistent naming conventions and file organization make cross-context code navigable and reduce the cognitive overhead of working across these boundaries. Establish conventions before writing code.

## Summary

Browser extension conventions cover four areas: manifest field naming (follow the WebExtensions spec naming exactly, never invent aliases), message action types (use `SCREAMING_SNAKE_CASE` with a `namespace/ACTION` pattern to prevent cross-feature collisions), file organization (separate each execution context into its own source directory), and i18n structure (`_locales/` with `messages.json` per locale, all user-visible strings externalized from day one). Apply these conventions uniformly from the first commit.

## Deep Guidance

### Manifest Naming Conventions

The `manifest.json` is not a place for creative naming. Every field name is defined by the WebExtensions specification. Use the canonical names exactly as specified:

- `manifest_version` — always `3` for new extensions targeting Manifest V3.
- `action` — the toolbar button (previously `browser_action` in MV2). Do not use `browser_action` in MV3 manifests.
- `background.service_worker` — the path to the service worker script. Not `background.scripts` (MV2 syntax).
- `content_scripts` — array of content script declarations. Each entry has `matches`, `js`, `css`, `run_at`.
- `host_permissions` — separate from `permissions` in MV3. Do not mix host patterns into the `permissions` array.
- `web_accessible_resources` — array of objects with `resources` and `matches`. MV3 requires the `matches` field; MV2 accepted a plain string array.

**Version string format:** Follow semantic versioning with exactly four dot-separated integers: `MAJOR.MINOR.PATCH.BUILD` (e.g., `1.2.3.0`). The Chrome Web Store enforces four-part version strings. Keep the manifest `version` field in sync with `package.json` `version` via a build script.

**Extension name and description:**
- `name`: Under 45 characters. This appears in the toolbar tooltip and store listing.
- `short_name`: Under 12 characters. Appears in constrained UI contexts. Define it explicitly rather than relying on automatic truncation.
- `description`: Under 132 characters. This is the store listing short description.

### Message Action Type Naming

Cross-context messaging (`chrome.runtime.sendMessage`, `chrome.tabs.sendMessage`) requires a shared vocabulary for message types. Collisions between unrelated features produce hard-to-diagnose bugs because every message listener receives every message.

**Recommended pattern — namespace/ACTION:**

```typescript
// Shared constants (src/shared/messages.ts)
export const Messages = {
  // Popup → Background
  POPUP_GET_STATUS:        'popup/GET_STATUS',
  POPUP_TOGGLE_ENABLED:    'popup/TOGGLE_ENABLED',

  // Content → Background
  CONTENT_PAGE_LOADED:     'content/PAGE_LOADED',
  CONTENT_REQUEST_CONFIG:  'content/REQUEST_CONFIG',

  // Background → Content
  BG_INJECT_OVERLAY:       'bg/INJECT_OVERLAY',
  BG_CLEAR_STATE:          'bg/CLEAR_STATE',
} as const;

export type MessageType = typeof Messages[keyof typeof Messages];
```

**Rules:**
- All message types are defined in one shared constants file imported by all contexts.
- Use `SCREAMING_SNAKE_CASE` for the constant key; use `namespace/ACTION` for the string value.
- Never use raw string literals for message types — always reference the constant.
- Each message type has exactly one handler. If multiple handlers respond to the same type, it is a design flaw.

**Message payload typing:**

```typescript
type MessageMap = {
  [Messages.POPUP_GET_STATUS]: { payload: undefined; response: StatusPayload };
  [Messages.POPUP_TOGGLE_ENABLED]: { payload: { enabled: boolean }; response: void };
};
```

Typed message maps prevent callers from passing incorrect payloads and give type-safe responses.

### File Organization Conventions

Each execution context gets its own top-level source directory. Do not co-locate content script code with popup code — they have different APIs, different DOM access, and different lifecycle constraints.

**Source directory structure:**

```
src/
  background/        # Service worker entry and background logic
    index.ts         # Service worker entry point
    handlers/        # Message handlers, one file per domain
    alarms.ts        # Alarm setup and handlers
  content/           # Content scripts
    index.ts         # Content script entry point
    injectors/       # DOM injection logic
    observers/       # MutationObserver setup
  popup/             # Popup page
    index.html
    index.ts
    components/      # Popup-specific UI components
  options/           # Options page
    index.html
    index.ts
  shared/            # Code imported by multiple contexts
    messages.ts      # Message type constants
    storage.ts       # Storage key constants and typed wrappers
    types.ts         # Shared TypeScript interfaces
```

**File naming:**
- Use `kebab-case` for all source files.
- Entry points for each context are always named `index.ts` / `index.html`.
- Handler files are named after the domain they handle: `tab-handlers.ts`, `storage-handlers.ts`.
- Never name a file `utils.ts` — name it after what it does: `url-helpers.ts`, `dom-sanitizer.ts`.

### i18n Structure and Conventions

Internationalization in extensions is mandatory if you ever plan to submit to markets outside your primary language. The `_locales/` directory is the WebExtensions standard mechanism.

**Directory structure:**

```
_locales/
  en/
    messages.json
  es/
    messages.json
  fr/
    messages.json
```

**messages.json format:**

```json
{
  "extensionName": {
    "message": "My Extension",
    "description": "The name of the extension"
  },
  "popupToggleLabel": {
    "message": "Enable on this site",
    "description": "Label for the enable/disable toggle in the popup"
  },
  "statusEnabled": {
    "message": "Active",
    "description": "Status label when extension is enabled"
  }
}
```

**Conventions:**
- Message keys use `camelCase`. Never use dots or underscores — they suggest hierarchy that the flat message file does not support.
- Every message has a `description` field. Translators need context. Empty descriptions lead to mistranslations.
- Externalize all user-visible strings from day one, even if only targeting English initially. Retrofitting i18n into an extension that hardcodes strings is expensive.
- Reference messages in the manifest with `__MSG_keyName__` syntax: `"name": "__MSG_extensionName__"`.
- Reference messages in JavaScript with `chrome.i18n.getMessage('keyName')`.
- Reference messages in HTML with the `data-i18n` attribute pattern (requires a small initialization script in the popup to apply translations on load).

**Locale fallback:**
- The `_locales/en/` directory is the fallback locale. If a translation is missing in another locale, Chrome falls back to `en`.
- Always maintain the `en` locale as the source of truth.
- Use the `browser.i18n.getUILanguage()` API to detect the user's browser language for locale-specific logic beyond string translation.
