---
name: browser-extension-dev-environment
description: Build tooling with Webpack/Vite, hot reload via web-ext and crx-hotreload, and browser launch configuration for extension development
topics: [browser-extension, dev-environment, vite, webpack, hot-reload, web-ext, build]
---

Browser extension development requires a different local setup than web app development. There is no dev server to navigate to — the extension must be loaded into a real browser instance, and changes require either a manual reload or a dedicated hot-reload tool. Getting this setup right at the start of the project eliminates the most friction-heavy part of the development loop.

## Summary

Use Vite with `vite-plugin-web-extension` (or `@crxjs/vite-plugin` for Chrome-only projects) as the build tool — it handles multi-entry bundling, manifest processing, and dev-mode content script injection automatically. For hot reload in development, use `web-ext` (Mozilla's CLI tool, works for both Chrome and Firefox) with its `--watch` flag, which reloads the extension on file changes. For Chrome-specific hot reload, `crx-hotreload` provides a lightweight alternative. Use separate npm scripts for dev (with watch + auto-reload) and build (production bundle for store submission).

## Deep Guidance

### Build Tool: Vite with Extension Plugin

Vite is the recommended build tool for new browser extension projects. Its ES module native dev server is not used directly (extensions load from `dist/`, not a dev server), but Vite's build pipeline provides fast incremental rebuilds, TypeScript compilation, CSS processing, and tree shaking.

**vite-plugin-web-extension** (cross-browser, recommended):

```bash
npm install -D vite vite-plugin-web-extension
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: () => require('./manifest.json'),
      // Automatically discovers entry points from manifest.json
      // and configures multi-entry build
    }),
  ],
});
```

`vite-plugin-web-extension` reads `manifest.json` and automatically derives all build entry points from `background.service_worker`, `content_scripts[].js`, `action.default_popup`, and `options_page` fields. No manual entry point configuration required.

**@crxjs/vite-plugin** (Chrome-only, with HMR support):

```bash
npm install -D vite @crxjs/vite-plugin
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
  ],
});
```

`@crxjs/vite-plugin` additionally supports Hot Module Replacement for popup and options pages in Chrome, making UI development significantly faster. Note: Firefox support is limited and experimental with this plugin.

**Webpack alternative** (for projects with existing Webpack investment):

```bash
npm install -D webpack webpack-cli copy-webpack-plugin ts-loader
```

Webpack requires manual entry point configuration for each context. Use `copy-webpack-plugin` to copy `manifest.json`, `_locales/`, and `public/` assets to `dist/`. The manual configuration is verbose; prefer Vite unless the project already uses Webpack.

### Hot Reload: web-ext

`web-ext` is Mozilla's official CLI for extension development. Despite being maintained by Mozilla, it works equally well with Chromium-based browsers.

**Installation:**

```bash
npm install -D web-ext
```

**Configuration file (web-ext-config.yml):**

```yaml
sourceDir: ./dist
artifactsDir: ./web-ext-artifacts
build:
  overwriteDest: true
run:
  firefox: '/Applications/Firefox.app/Contents/MacOS/firefox'
  # For Chrome:
  # chromiumBinary: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  # chromiumProfile: ./dev-profile
  startUrl:
    - about:newtab
  watchFiles:
    - dist/**/*
```

**Development workflow with web-ext:**

```json
// package.json scripts
{
  "scripts": {
    "dev": "vite build --watch & web-ext run --config web-ext-config.yml",
    "build": "vite build",
    "build:watch": "vite build --watch",
    "start:chrome": "web-ext run --target chromium --config web-ext-config.yml",
    "start:firefox": "web-ext run --target firefox --config web-ext-config.yml"
  }
}
```

`vite build --watch` rebuilds `dist/` on every source change. `web-ext run --config web-ext-config.yml` watches `dist/` and reloads the extension in the browser when the built files change. Together they form a full hot-reload loop.

**What web-ext does on reload:**
- Reloads the extension manifest and background service worker.
- Reloads all open popup instances.
- Content scripts on already-open tabs are NOT automatically re-injected — you must navigate to a new page or manually reload the tab to test content script changes.

### Hot Reload: crx-hotreload

For Chrome-only development, `crx-hotreload` is a lightweight alternative that adds hot reload by injecting a small background script into your extension:

```bash
npm install -D crx-hotreload
```

Add the hot reload script to your manifest in development:

```json
// manifest.json (development variant)
{
  "background": {
    "service_worker": "background.js"
  }
}
```

```typescript
// background/index.ts
if (process.env.NODE_ENV === 'development') {
  // crx-hotreload polls for dist/ changes and triggers extension reload
  import('crx-hotreload');
}
```

`crx-hotreload` is simpler than `web-ext` but Chrome-only and does not handle Firefox or cross-browser testing.

### Browser Launch Configuration

**Loading an unpacked extension in Chrome:**
1. Navigate to `chrome://extensions`.
2. Enable "Developer mode" (top-right toggle).
3. Click "Load unpacked" and select the `dist/` directory.
4. Note the assigned extension ID — it changes if you remove and re-add the extension, which breaks `chrome.runtime.getURL()` calls that embed the ID.

**Persistent dev profile for Chrome:**

Using a dedicated Chrome profile for development prevents the extension from interfering with your daily browsing and keeps the dev extension ID stable:

```bash
# Launch Chrome with a dedicated dev profile
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$(pwd)/.dev-profile" \
  --load-extension="$(pwd)/dist" \
  --no-first-run
```

Add this to a `scripts/dev-chrome.sh` helper. The `--load-extension` flag auto-loads the extension at browser start, skipping the manual "Load unpacked" step.

**Loading in Firefox:**

```bash
# Temporary install (survives until browser restart)
web-ext run --source-dir ./dist --firefox firefox

# Or via about:debugging
# Navigate to about:debugging → This Firefox → Load Temporary Add-on
# Select dist/manifest.json
```

Temporary installs in Firefox are removed when the browser restarts. For persistent dev installs, create a signed development build via `web-ext build` and install the `.zip` as a permanent add-on.

### Environment Variables and Build Modes

Use Vite's mode system to separate development and production builds:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  define: {
    __DEV__: mode === 'development',
    __EXT_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
  build: {
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development',
  },
}));
```

**Never ship development-only code to the store.** Use `__DEV__` guards around logging, hot-reload imports, and debug panels. Dead-code elimination in the production build will strip guarded code when `__DEV__` is `false`.

### TypeScript Configuration for Extension Contexts

```json
// tsconfig.json (base)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "types": ["chrome"]
  }
}
```

```json
// tsconfig.background.json (service worker — no DOM)
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "WebWorker"],
    "types": ["chrome"]
  },
  "include": ["src/background/**/*", "src/shared/**/*"]
}
```

```json
// tsconfig.content.json (content scripts — DOM access)
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "types": ["chrome"]
  },
  "include": ["src/content/**/*", "src/shared/**/*"]
}
```

Install the Chrome types package: `npm install -D @types/chrome`. This provides full type definitions for the `chrome.*` API namespace across all contexts.
