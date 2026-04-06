---
name: web-app-dev-environment
description: Dev server configuration, HMR setup, API proxy, environment variables, Docker for local services, and browser devtools for web app development
topics: [web-app, dev-environment, vite, webpack, hmr, docker, debugging]
---

A fast, reliable local development environment is a force multiplier for the entire team. The goal is sub-second feedback loops for code changes and zero friction getting from a fresh checkout to a running app. Every minute spent fighting the dev environment is a minute not spent building the product.

## Summary

### Dev Server Choice: Vite vs webpack

For new projects in 2024 and beyond, use **Vite** unless you have a specific reason not to:

- **Vite**: Native ESM dev server, near-instant startup regardless of project size, esbuild-powered transforms (10–100x faster than Babel), first-class support for React, Vue, Svelte, and TypeScript out of the box.
- **webpack (via Create React App, Next.js with webpack, or custom)**: Slower cold starts and HMR, but battle-tested and required by some frameworks. Next.js 13+ defaults to Turbopack (Rust-based, approaching Vite speed).

If you are on Next.js, you get the dev server bundled with the framework. Do not fight the framework's built-in tooling — configure it via `next.config.ts`, not by ejecting or customizing webpack directly unless absolutely necessary.

### HMR Configuration

Hot Module Replacement keeps the page live-updating without full reloads. Ensure it is working correctly:

- With Vite: HMR works out of the box. If it stops working after upgrading, check `server.hmr` in `vite.config.ts`. Common issue: HMR fails silently when a module has a circular dependency.
- With React: Install `@vitejs/plugin-react` (uses Babel with Fast Refresh) or `@vitejs/plugin-react-swc` (uses SWC, 3–5x faster). Fast Refresh preserves component state on save — test that it works for your components.
- Watch for HMR performance degradation in large projects: if HMR is slow, profile with `vite --debug hmr`. The usual cause is a large shared module being invalidated on every change.

### API Proxy Configuration

During development, your app's origin is `localhost:3000` but your API backend is `localhost:8000`. Avoid CORS issues and hardcoded localhost URLs by configuring a dev proxy:

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
```

This means your frontend code always calls `/api/users` and the proxy handles routing to the backend. The same relative URL works in production when the API is behind the same domain. Never hardcode `http://localhost:8000` in application code.

### Environment Variables

Use `.env` files for environment-specific configuration. Establish clear conventions:

- `.env.example` — committed, documents all variables with dummy values
- `.env.local` — gitignored, developer-specific overrides (actual API keys, local service URLs)
- `.env.development` — gitignored, shared dev defaults (can be committed if values are non-sensitive)
- `.env.production` — injected by CI/CD, never committed

Validate all required variables at startup. An app that silently uses `undefined` for a missing API URL is worse than one that crashes immediately with a clear error:

```typescript
// lib/env.ts — validate at module load time
import { z } from "zod";

const envSchema = z.object({
  VITE_API_URL: z.string().url(),
  VITE_FEATURE_FLAGS: z.string().default(""),
});

export const env = envSchema.parse(import.meta.env);
```

### Docker for Local Services

Run local dependencies (databases, caches, queues, email servers) in Docker to keep developer machines clean and ensure consistency:

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: myapp_dev
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  mailpit:
    image: axllent/mailpit
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # Web UI

volumes:
  postgres_data:
```

Document the setup in the README: `docker compose up -d` starts all services. Never require developers to install PostgreSQL, Redis, or other services directly on their machines.

## Deep Guidance

### Getting to Zero-Friction Setup

Document the new developer setup flow and time it. Target under 10 minutes from fresh checkout to running app. Anything over 15 minutes will be skipped and developers will use workarounds.

Minimum `package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "dev:full": "docker compose up -d && vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "lint": "eslint src --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
```

Include a `Makefile` or `justfile` for multi-step setup commands that developers run once (`make setup` installs deps, configures git hooks, copies `.env.example`).

### Browser Devtools Configuration

Install and configure browser extensions that accelerate debugging:

- **React Developer Tools**: Component tree inspection, props/state browser, profiler for render performance.
- **Redux DevTools** (if using Redux): Action/state history, time-travel debugging.
- **Vite plugin for browser devtools**: Install `vite-plugin-inspect` to visualize the Vite plugin pipeline and module graph.

Configure source maps in development (`devtool: "eval-source-map"` in webpack or `sourcemap: true` in Vite) so stack traces point to TypeScript source, not compiled JavaScript. Without this, debugging is nearly impossible.

### TypeScript Strict Mode

Enable strict mode from day one in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Disabling strict mode to make TypeScript "less annoying" creates a false sense of safety. The errors strict mode surfaces are real bugs. Fix them instead of disabling the check.

### VS Code Workspace Settings

Commit a `.vscode/settings.json` with recommended settings so all developers use consistent formatting:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "non-relative"
}
```

Commit `.vscode/extensions.json` with recommended extensions. Developers are prompted to install them on workspace open.
