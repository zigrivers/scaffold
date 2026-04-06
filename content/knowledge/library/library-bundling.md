---
name: library-bundling
description: ESM/CJS dual publishing, package.json exports map, bundler configuration, and tree-shaking verification for libraries
topics: [library, bundling, esm, cjs, dual-publishing, exports-map, tree-shaking, tsup, rollup]
---

Library bundling solves the problem of serving multiple module systems from one codebase. The JavaScript ecosystem is mid-transition from CommonJS to ES modules, and libraries must serve both until the transition completes. Getting bundling wrong produces libraries that fail to import in certain environments, cause dual-package hazards (two instances of the same library loaded simultaneously), or defeat tree-shaking and inflate consumer bundle sizes.

## Summary

Use a bundler (tsup or rollup) rather than raw TypeScript compilation for libraries that need dual ESM/CJS output. The `package.json` exports map is the canonical module resolution contract — define it precisely with condition precedence (types before default, import before require). Set `"sideEffects": false` when true to enable aggressive tree-shaking. Test module resolution in real consumer environments, not just in your build output. ESM-only is acceptable if your minimum supported environment supports it; document this clearly.

Key bundling decisions:
- Output formats: ESM + CJS for maximum compatibility; ESM-only for modern toolchains
- File extensions: `.js`/`.cjs` to signal format explicitly
- Declaration files: emitted alongside each output, not separately
- Exports map: precise condition ordering (types, import, require, default)
- Tree-shaking: `sideEffects: false` + ES module output + no barrel-file anti-patterns

## Deep Guidance

### Choosing a Bundler

**tsup (recommended for most libraries):**
tsup is a TypeScript-first bundler built on esbuild. Fast, opinionated, handles dual ESM/CJS output with declaration files:

```typescript
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,               // Emit .d.ts declaration files
  sourcemap: true,
  clean: true,             // Clean dist/ before each build
  splitting: false,        // Keep single output file per format
  treeshake: true,
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js'
    }
  }
})
```

Output:
```
dist/
├── index.js       # ESM
├── index.cjs      # CJS
├── index.d.ts     # TypeScript declarations
└── index.d.cts    # CJS declarations (tsup generates automatically)
```

**rollup (when you need fine-grained control):**
```javascript
// rollup.config.mjs
import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default [
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.js', format: 'es', sourcemap: true },
    plugins: [nodeResolve(), typescript({ declaration: false })]
  },
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.cjs', format: 'cjs', sourcemap: true, exports: 'named' },
    plugins: [nodeResolve(), typescript({ declaration: false })]
  }
]
```

**tsc only (when bundling is unnecessary):**
If the library has no dependencies to bundle, raw `tsc` with separate CJS and ESM configs works. Use this for pure type libraries or libraries where consumers handle bundling:

```bash
# ESM
tsc -p tsconfig.json

# CJS (separate tsconfig)
tsc -p tsconfig.cjs.json
```

### Exports Map Configuration

The `exports` field in `package.json` is the definitive module resolution spec for Node.js 12+ and modern bundlers. Define it precisely:

```json
{
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    },
    "./plugins": {
      "import": {
        "types": "./dist/plugins/index.d.ts",
        "default": "./dist/plugins/index.js"
      },
      "require": {
        "types": "./dist/plugins/index.d.cts",
        "default": "./dist/plugins/index.cjs"
      }
    },
    "./package.json": "./package.json"
  }
}
```

**Condition ordering matters:**
- `types` must come before `default` so TypeScript resolves declarations correctly
- `import` before `require` (ESM preferred when both are available)
- `default` as the final fallback

**Legacy fields for older tooling:**
Keep `"main"` and `"module"` for older bundlers and Node versions that don't support `exports`:
```json
{
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

Bundlers like webpack 4 and older rollup configurations use `"module"` for ESM. Modern tooling uses `exports`.

### Dual Package Hazard

The dual package hazard occurs when both ESM and CJS versions of the same library are loaded in the same process, creating two instances of what should be a singleton. Symptoms: `instanceof` checks fail, shared state doesn't sync, plugin registrations disappear.

**Prevention strategies:**

1. **State in the ESM version only:**
```javascript
// dist/index.cjs — CJS wrapper that re-exports the ESM version
// This ensures only one module instance regardless of import style
const mod = await import('./index.js')
module.exports = mod
```

2. **Stateless library design (best):**
Design the library with no module-level state. Factory functions create instances; there is no singleton. With no shared state, dual loading is harmless:
```typescript
// NO module-level state — safe for dual loading
export function createCache(): Cache { return new Map() }
export function parseConfig(input: string): Config { /* pure function */ }
```

3. **Wrapper CJS file:**
```javascript
// dist/index.cjs — thin CJS wrapper
'use strict'
const mod = require('./index.js') // This won't work if index.js is ESM
// Use a proper wrapper instead:
Object.assign(exports, require('./index-cjs-impl.cjs'))
```

For complex libraries with state, use approach 1 or design as approach 2.

### Tree-Shaking Verification

After building, verify that tree-shaking actually works:

```bash
# Install a fresh consumer project and import one function
mkdir /tmp/tree-shake-test && cd /tmp/tree-shake-test
npm init -y
npm install my-library@file:/path/to/library

cat > index.js << 'EOF'
import { parseConfig } from 'my-library'
const config = parseConfig('[server]\nhost = "localhost"')
console.log(config)
EOF

# Bundle with rollup and check output size
npx rollup index.js --format iife --bundle > bundle.js
wc -c bundle.js

# If the bundle is larger than just parseConfig + its dependencies,
# tree-shaking is not working — investigate the sideEffects field
# and ES module output
```

**Common tree-shaking failures:**
- CommonJS output used (bundler can't statically analyze)
- `sideEffects: true` in package.json (prevents dead code elimination)
- Barrel files that import everything (forces all code into bundle)
- `export * from './large-module'` at root when consumers only use one export

**Subpath exports enable opt-in tree-shaking at the feature level:**
```typescript
// Consumer only needs the validator — zero parser code in bundle
import { validateSchema } from 'my-library/validators'
```

### Bundle Size Budgets

Define a bundle size budget for browser-targeted libraries:

```json
// package.json
{
  "size-limit": [
    {
      "path": "./dist/index.js",
      "limit": "10 kB"
    },
    {
      "path": "./dist/plugins/index.js",
      "limit": "5 kB"
    }
  ]
}
```

```bash
# Check with size-limit
npx size-limit
```

Enforce in CI: if a PR increases bundle size beyond the budget, fail the check. This prevents gradual size bloat.

### Source Maps

Always emit source maps. They enable consumers to debug into the library source when troubleshooting:

```typescript
// tsup.config.ts
export default defineConfig({
  sourcemap: true,  // Emits .js.map alongside .js
})
```

Source maps should be included in the published package (`dist/*.map`). They don't significantly affect install size but dramatically improve debugging.
