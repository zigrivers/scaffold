---
name: library-dev-environment
description: Monorepo setup, npm link workflow, build watch mode, and local consumer testing for library development
topics: [library, dev-environment, monorepo, npm-link, build-watch, local-testing]
---

Library development environment setup is distinct from application development: you are building code that will be consumed by other projects, which means your dev workflow must include a way to test the library as a consumer would — before publishing to npm. The feedback loop between changing library source and seeing the effect in a consumer application is the central challenge. Get this wrong, and you spend hours debugging issues that only surface after publish.

## Summary

Use build watch mode (TypeScript `--watch` or a bundler watcher) for fast feedback during development. For testing in a real consumer project, use `npm link` or workspace-relative `file:` references. In monorepos, use npm/pnpm/yarn workspaces to co-locate the library and consumer apps. Never develop library code exclusively through unit tests — always validate through a real consumer context. Set up scripts for the full dev loop: `build:watch` in one terminal, consumer app in another.

Core workflow tools:
- `tsc --watch` for TypeScript compilation feedback
- `npm link` / `pnpm link` for local cross-project testing
- Workspace `file:` references for monorepo consumers
- `npm pack` + install for pre-publish verification

## Deep Guidance

### Build Watch Mode

The development feedback loop starts with build watch mode. TypeScript's `--watch` mode recompiles on every save:

```bash
# Terminal 1: watch the library build
npm run build:watch

# package.json script:
"build:watch": "tsc -p tsconfig.json --watch --preserveWatchOutput"
```

For more complex builds (bundling, multiple outputs), use a bundler watcher:

```bash
# With tsup (recommended for dual ESM/CJS builds)
"build:watch": "tsup --watch"

# tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  watch: process.env.WATCH === 'true'
})
```

TypeScript `--watch` alone is sufficient for type-only changes. If you're bundling (minifying, inlining), use the bundler's watch mode.

### npm link Workflow

`npm link` creates a symlink from your global npm prefix to the library, then links that into the consuming project:

```bash
# In the library directory:
cd my-library
npm link
# Creates: ~/.nvm/versions/node/vX/lib/node_modules/my-library -> /path/to/my-library

# In the consuming project:
cd my-app
npm link my-library
# Creates: my-app/node_modules/my-library -> ~/.nvm/.../my-library

# The consumer now uses the live dist/ from the library
```

**Caveats with npm link:**
- The consumer uses the `dist/` directory, so the library must be built first and kept rebuilt via watch mode
- React and other singleton libraries can cause issues because the library and consumer may each resolve their own copy: use `npm link my-app/node_modules/react` inside the library to force shared resolution
- `npm install` in the consumer will break the link — you must re-run `npm link my-library`

**Preferred alternative: `file:` reference in consumer:**
```json
// my-app/package.json
{
  "dependencies": {
    "my-library": "file:../my-library"
  }
}
```

Run `npm install` in `my-app`. This creates a symlink into `my-library/` respecting the `exports` map. Survives `npm install` (unlike `npm link`). Requires the library to have its `dist/` built.

### pnpm Workspace Setup (Recommended for Monorepos)

pnpm workspaces handle library + consumer in the same repository without symlink complexity:

```yaml
# pnpm-workspace.yaml (at monorepo root)
packages:
  - 'packages/*'
  - 'apps/*'
  - 'examples/*'
```

```
monorepo/
├── packages/
│   └── my-library/
│       ├── src/
│       ├── dist/
│       └── package.json  # name: "my-library"
├── apps/
│   └── my-app/
│       └── package.json  # depends on "my-library": "workspace:*"
└── pnpm-workspace.yaml
```

```json
// apps/my-app/package.json
{
  "dependencies": {
    "my-library": "workspace:*"
  }
}
```

With `workspace:*`, pnpm links to the local package automatically. The `dist/` directory is used (respecting `exports` map), so the library still needs to be built.

**Monorepo dev script:**
```bash
# Run both library watch and app dev server in parallel
"dev": "concurrently \"npm run build:watch -w packages/my-library\" \"npm run dev -w apps/my-app\""
```

### Pre-publish Verification with npm pack

Before publishing, verify the actual package contents:

```bash
# Pack the library without publishing
npm pack --dry-run

# This shows exactly what files will be included in the published package
# Look for:
# - dist/ files present (ESM, CJS, .d.ts)
# - No src/ files (source not published)
# - No test files
# - README.md and CHANGELOG.md present
# - No .env or secrets

# Pack to a tarball and install it in a test project
npm pack
# Creates: my-library-1.0.0.tgz

# In a fresh test project:
npm install ../my-library/my-library-1.0.0.tgz
```

Installing the tarball is the most faithful pre-publish test. It reproduces exactly what consumers get from `npm install my-library`.

### Dev Dependencies vs. Build Dependencies

Keep the dev environment fast by understanding what belongs where:

**devDependencies** (not published):
```json
{
  "devDependencies": {
    "typescript": "^5.4.0",       // Build tool
    "tsup": "^8.0.0",             // Bundler
    "vitest": "^1.4.0",           // Test runner
    "tsd": "^0.31.0",             // Type testing
    "typedoc": "^0.25.0",         // Doc generation
    "eslint": "^8.57.0",          // Linter
    "prettier": "^3.2.0",         // Formatter
    "concurrently": "^8.2.0",     // Parallel scripts
    "rimraf": "^5.0.0"            // Cross-platform rm -rf
  }
}
```

**dependencies** (installed by consumers):
Only runtime dependencies that the library code imports at runtime. Keep this list minimal. Every dependency you add becomes a consumer's dependency. Prefer zero runtime dependencies for utility libraries.

**peerDependencies**:
Framework dependencies the consumer is expected to provide (React, Vue, etc.).

### Environment Variables for Dev

Libraries should not read environment variables at runtime (that's the consumer's responsibility). But the build process may need them:

```bash
# .env.local (gitignored) — only for build/test scripts
NPM_REGISTRY=https://registry.npmjs.org
TYPEDOC_TOKEN=...  # for doc deployment
```

Document any required environment variables in `docs/dev-setup.md`. Never hardcode registry URLs or tokens.

### Recommended package.json Dev Scripts

```json
{
  "scripts": {
    "build": "rimraf dist && tsup",
    "build:watch": "tsup --watch",
    "dev": "npm run build:watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:types": "tsd",
    "test:coverage": "vitest run --coverage",
    "test:examples": "node examples/basic-usage/index.js",
    "lint": "eslint src/ tests/",
    "format": "prettier --write src/ tests/",
    "typecheck": "tsc --noEmit -p tsconfig.dev.json",
    "docs": "typedoc",
    "pack:dry": "npm pack --dry-run",
    "prepublishOnly": "npm run build && npm run test && npm run test:types",
    "clean": "rimraf dist"
  }
}
```

The `prepublishOnly` script is a safety net — it runs automatically before `npm publish` and blocks publishing if tests fail.
