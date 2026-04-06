---
name: library-architecture
description: Module design, dependency minimization, tree-shaking enablement, and plugin patterns for published libraries
topics: [library, architecture, modules, tree-shaking, plugins, dependencies, design]
---

Library architecture is constrained by two forces that do not apply to applications: the consumer's bundle size budget and the consumer's dependency graph. Every architectural decision must account for what the library adds to consumers who import it — not just the feature complexity it solves. A well-architected library is modular by default, has minimal or zero runtime dependencies, enables tree-shaking so consumers pay only for what they use, and provides extension points that don't require forking the library.

## Summary

Design libraries as collections of composable, independently tree-shakeable units. The root module is a barrel export; each feature module is independently importable. Minimize runtime dependencies to zero where possible — every dependency you add becomes a transitive dependency for every consumer. Enable tree-shaking by using ES modules, avoiding side effects, and ensuring the `"sideEffects": false` field is accurate. Plugin patterns allow extension without coupling; prefer dependency injection and factory functions over class hierarchies.

Core architectural decisions:
- Module boundary: each exported function/class is its own module file, barrel at root
- Dependency strategy: zero runtime deps preferred; peer deps for framework integration
- Side effects: none at module load time; `"sideEffects": false` in package.json
- Extension pattern: plugin factory or dependency injection, not subclassing
- Error strategy: typed error classes, not string codes; never swallow errors

## Deep Guidance

### Module Boundary Design

Each public export should have a clear, single responsibility. The module structure mirrors the API surface:

```
src/
├── index.ts           # Barrel: re-exports all public APIs
├── parser.ts          # parseConfig, ParseOptions, ParseError
├── validator.ts       # validateSchema, ValidationResult, ValidationError
├── client.ts          # createClient, ClientOptions, Client interface
├── types.ts           # Shared types used by multiple modules
├── errors.ts          # Base error classes
└── internal/
    ├── cache.ts       # Internal LRU cache (not exported)
    ├── http.ts        # Internal HTTP utilities
    └── utils.ts       # Internal pure utilities
```

**The key constraint:** modules in `internal/` must never be imported by consumers. Enforce this with an ESLint rule:

```json
// .eslintrc.json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": ["*/internal/*"]
    }]
  }
}
```

This rule is for consumer code, not for library internals. The library's own modules can freely import from `internal/`.

### Dependency Minimization

Every runtime dependency you add has costs:
1. Adds to install size for all consumers
2. Creates a version conflict risk (consumer uses different version of same dep)
3. Introduces a supply chain attack surface
4. Creates license compliance requirements for consumers

**Target: zero runtime dependencies for utility libraries.** If the library's value is transforming data, parsing strings, or providing utilities, it should have no runtime dependencies.

**When dependencies are justified:**
- The dependency solves a genuinely hard problem with no reasonable alternative (cryptography, date parsing)
- The dependency is a peer dependency the consumer already has (React, Vue, Node.js built-ins)
- The functionality would require thousands of lines of well-tested code to replicate

**Inlining vs. depending:**
For small, stable utilities (10-50 lines), consider inlining instead of depending:
```typescript
// Instead of: import { clamp } from 'lodash-es'
// Inline it:
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
```

For large, complex utilities (crypto, parsing), depend on the established library.

### Tree-Shaking Enablement

Tree-shaking requires the bundler to statically analyze which exports are used. Three requirements:

**1. ES module syntax throughout:**
```typescript
// Good — static, analyzable
export function parseConfig(input: string): Config { ... }
export { validateSchema } from './validator'

// Bad — dynamic, blocks tree-shaking
module.exports = { parseConfig }  // CommonJS
exports[functionName] = fn         // Dynamic export key
```

**2. No side effects at module load time:**
```typescript
// BAD: side effect on import — breaks tree-shaking
const cache = new Map()
globalThis.__myLibCache = cache  // Pollutes global on import
console.log('my-library loaded') // Log on import

// GOOD: factory function — no side effect until called
export function createCache(): Map<string, unknown> {
  return new Map()
}
```

**3. Accurate `sideEffects` field:**
```json
// package.json — only if genuinely no side effects
{ "sideEffects": false }

// If CSS imports or polyfills have side effects:
{ "sideEffects": ["*.css", "src/polyfills.js"] }
```

**Verify tree-shaking works:**
```bash
# Use bundle-buddy, rollup-plugin-visualizer, or bundlephobia to verify
npx bundlephobia my-library@1.0.0

# Or build a minimal consumer and check the output bundle size
# A consumer that only imports parseConfig should not include validateSchema code
```

### Plugin Architecture Patterns

Plugins allow consumers to extend the library without modifying it. Three patterns in increasing flexibility order:

**Pattern 1: Factory function with options (simplest):**
```typescript
export interface ClientOptions {
  transport?: Transport  // Consumer provides custom transport
  serializer?: Serializer
  logger?: Logger
}

export function createClient(options: ClientOptions = {}): Client {
  const transport = options.transport ?? defaultHttpTransport()
  const serializer = options.serializer ?? jsonSerializer()
  const logger = options.logger ?? noopLogger()
  return new ClientImpl(transport, serializer, logger)
}

// Consumer can inject their own transport:
const client = createClient({
  transport: myCustomTransport,
  logger: pinoLogger
})
```

This is dependency injection — the simplest, most testable plugin pattern.

**Pattern 2: Plugin registry (for named, composable extensions):**
```typescript
export interface Plugin {
  name: string
  setup(context: PluginContext): void | Promise<void>
}

export interface PluginContext {
  registerTransform(name: string, fn: TransformFn): void
  registerValidator(name: string, fn: ValidatorFn): void
  onParse(hook: ParseHook): void
}

export function createClient(options: { plugins?: Plugin[] } = {}): Client {
  const context = createPluginContext()
  for (const plugin of (options.plugins ?? [])) {
    plugin.setup(context)
  }
  return new ClientImpl(context)
}

// Consumer uses plugins:
import { myPlugin } from 'my-library-plugin-example'
const client = createClient({ plugins: [myPlugin()] })
```

**Pattern 3: Middleware chain (for transform pipelines):**
```typescript
export type Middleware<T> = (value: T, next: (value: T) => T) => T

export function createPipeline<T>(middlewares: Middleware<T>[]): (value: T) => T {
  return (initial: T) => {
    const chain = middlewares.reduceRight<(value: T) => T>(
      (next, middleware) => (value) => middleware(value, next),
      (value) => value
    )
    return chain(initial)
  }
}
```

**What to avoid:**
- Class inheritance as extension mechanism (consumers must subclass to customize — creates tight coupling)
- Singleton registries (one global registry makes testing and isolation difficult)
- Monkey-patching as extension (fragile, hidden coupling)

### Error Architecture

Typed errors are part of the public API contract:

```typescript
// errors.ts — exported as part of public API
export class LibraryError extends Error {
  constructor(message: string, public readonly code: ErrorCode) {
    super(message)
    this.name = 'LibraryError'
    // Maintain proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ParseError extends LibraryError {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly source?: string
  ) {
    super(message, 'PARSE_ERROR')
    this.name = 'ParseError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export type ErrorCode = 'PARSE_ERROR' | 'VALIDATION_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT'
```

Never throw raw `Error` objects from library code — consumers cannot distinguish library errors from their own errors. Always throw typed errors with enough context to diagnose the problem.

### Avoiding Circular Dependencies

Circular dependencies in libraries cause subtle initialization order bugs. Enforce absence with ESLint:

```json
{
  "rules": {
    "import/no-cycle": ["error", { "maxDepth": 10 }]
  }
}
```

When you detect a circular dependency, the usual fix is extracting shared types to `types.ts` (which has no imports) rather than rearranging imports.
