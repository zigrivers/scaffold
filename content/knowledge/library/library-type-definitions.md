---
name: library-type-definitions
description: Declaration files (.d.ts), type testing with tsd/expect-type, conditional types, and API surface documentation via types
topics: [library, typescript, type-definitions, declarations, tsd, expect-type, conditional-types, dts]
---

Type definitions are a first-class deliverable for TypeScript libraries. They are part of the public API contract, not an afterthought. Declaration files (`.d.ts`) must be accurate, complete, and expressive — they determine whether consumers can use the library with type safety, whether IDEs provide useful completions, and whether type errors are caught at compile time rather than runtime. Inaccurate types are worse than no types because they create false confidence.

## Summary

Emit declaration files alongside compiled JavaScript using TypeScript's `declaration: true` compiler option or a bundler like tsup. Test types with `tsd` or `expect-type` to catch type regressions. Use conditional types to express relationships between input and output types. Export all types that appear in public API signatures — unexported types force consumers to use `any` or `ReturnType<typeof fn>` workarounds. Document type parameters with JSDoc. Include declaration maps (`declarationMap: true`) so Go-to-Definition works across the source.

Core type definition practices:
- Enable `declaration` and `declarationMap` in tsconfig build config
- Export every type that appears in any public API signature
- Write type tests with `tsd` or `expect-type` as part of the test suite
- Use conditional types to narrow return types based on input types
- Avoid `any` in public signatures — use `unknown` for unvalidated input

## Deep Guidance

### TypeScript Configuration for Declaration Emission

The build tsconfig must enable declaration emission:

```json
{
  "compilerOptions": {
    "declaration": true,      // Emit .d.ts files
    "declarationMap": true,   // Emit .d.ts.map for Go-to-Definition
    "declarationDir": "./dist/types",  // Put declarations in dist/types/
    "emitDeclarationOnly": false,      // Emit JS too (or use separate tsc runs)
    "stripInternal": true,    // Remove @internal JSDoc items from declarations
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

With tsup:
```typescript
export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,  // tsup generates declarations using tsc under the hood
})
```

### What to Export

Every type that appears in a public API signature must be exported:

```typescript
// src/index.ts — export all types consumers will need

// Types used in function signatures
export type { ParseOptions, ParseResult } from './parser'
export type { ValidationResult, ValidationError, ValidationRule } from './validator'
export type { ClientOptions, Client, RequestOptions, Response } from './client'

// Error classes (constructors are values AND types)
export { ParseError, ValidationError, NetworkError } from './errors'

// Enums or const objects used as parameter values
export { LogLevel, OutputFormat } from './constants'

// Utility types consumers may want to use
export type { DeepPartial, Awaited } from './utils'
```

**What NOT to export:**
- Internal implementation types (`InternalCacheEntry`, `HttpClientConfig`)
- Types used only within the library's own internals
- Types from `src/internal/` modules

Mark internal types with `@internal` JSDoc to exclude them from declaration files when `stripInternal: true` is set:

```typescript
/** @internal */
export interface InternalCacheEntry {
  value: unknown
  expiresAt: number
}
```

### Type Testing with tsd

`tsd` lets you write assertions about types as test files. These catch type regressions — when a refactor accidentally changes the type of a public API:

```typescript
// tests/types/index.test-d.ts
import { expectType, expectError, expectAssignable } from 'tsd'
import { parseConfig, ParseOptions, ParseError, Config } from 'my-library'

// Assert parseConfig returns Config
expectType<Config>(parseConfig('input'))

// Assert ParseOptions is accepted
const options: ParseOptions = { strict: true }
expectAssignable<ParseOptions>(options)

// Assert ParseError has the right shape
const err = new ParseError('message', 1, 1)
expectType<number>(err.line)
expectType<number>(err.column)

// Assert that invalid input types cause a type error
expectError(parseConfig(42))
expectError(parseConfig(null))

// Assert overload resolution
expectType<Config>(parseConfig('input'))
expectType<Promise<Config>>(parseConfig('input', { async: true }))
```

Run type tests as part of CI:
```bash
# package.json
"test:types": "tsd"
"test": "vitest run && tsd"
```

`tsd` will fail the test suite if any `expectType` assertion fails (wrong type) or any `expectError` assertion fails (expected error didn't occur).

### Using expect-type (Alternative to tsd)

`expect-type` works inline with your test runner (vitest, jest):

```typescript
// tests/types/parser.test.ts
import { expectTypeOf } from 'vitest'
import { parseConfig } from 'my-library'

test('parseConfig return type', () => {
  expectTypeOf(parseConfig).toBeFunction()
  expectTypeOf(parseConfig).parameter(0).toBeString()
  expectTypeOf(parseConfig).returns.toEqualTypeOf<Config>()
})

test('ParseOptions is a valid options object', () => {
  expectTypeOf<ParseOptions>().toHaveProperty('strict')
  expectTypeOf<ParseOptions['strict']>().toEqualTypeOf<boolean | undefined>()
})
```

The advantage of `expect-type` within vitest: type tests live alongside runtime tests and run in the same test command. The advantage of `tsd`: it's a dedicated type testing tool with more ergonomic syntax for complex assertions.

### Conditional Types for Precise Return Types

Conditional types allow the return type to depend on the input type:

```typescript
// Return type narrows based on whether async option is set
function parseConfig(input: string, options?: { async?: false }): Config
function parseConfig(input: string, options: { async: true }): Promise<Config>
function parseConfig(input: string, options?: { async?: boolean }): Config | Promise<Config>

// Generic conditional type
type ParseResult<T extends ParseOptions> =
  T extends { async: true } ? Promise<Config> : Config

// Deep conditional: extract value type from Result
type Unwrap<T> = T extends Promise<infer U> ? U : T
```

**Practical conditional type patterns:**

```typescript
// Input determines output type
function transform<T extends string | Buffer>(
  input: T
): T extends string ? string : Buffer

// Stricter types in strict mode
interface ParseOptions {
  strict?: boolean
}

type ParseReturn<T extends ParseOptions> =
  T extends { strict: true } ? StrictConfig : Config

// Utility: make deeply optional
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}
```

Use conditional types when the return type genuinely depends on the input. Don't overuse them — complex conditional types are hard to debug and can produce confusing error messages.

### Declaration Maps

Declaration maps (`.d.ts.map`) enable Go-to-Definition in IDEs to jump to the TypeScript source rather than the compiled declaration file. This dramatically improves the experience of debugging library code:

```json
// tsconfig.json
{
  "compilerOptions": {
    "declarationMap": true  // Emits .d.ts.map alongside .d.ts
  }
}
```

Include the source maps in the published package:
```json
// package.json
{
  "files": [
    "dist/",   // includes .d.ts.map files
    "src/",    // include source for source map resolution
    "README.md"
  ]
}
```

Including `src/` in the published package allows IDEs to resolve the original TypeScript source through the declaration map.

### Template Literal Types for String APIs

When a library accepts string patterns, template literal types provide exact-match checking:

```typescript
// HTTP method type
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

// Route parameter extraction
type ExtractParams<Route extends string> =
  Route extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractParams<`/${Rest}`>
    : Route extends `${string}:${infer Param}`
      ? Param
      : never

// Usage:
type Params = ExtractParams<'/users/:userId/posts/:postId'>
// Type: "userId" | "postId"

function route<R extends string>(
  path: R,
  handler: (params: Record<ExtractParams<R>, string>) => void
): void
```

Template literal types are powerful for configuration DSLs and string-based APIs. Use them when the consumer's strings have a predictable structure that TypeScript can validate.

### JSDoc for Type Documentation

TypeDoc and IDE hover text both read JSDoc comments from type declarations:

```typescript
/**
 * Options for controlling the parsing behavior.
 *
 * @example
 * ```typescript
 * const config = parseConfig(input, {
 *   strict: true,
 *   encoding: 'utf-8'
 * })
 * ```
 */
export interface ParseOptions {
  /**
   * Enable strict mode validation.
   * In strict mode, unknown fields cause a ValidationError.
   * @default false
   */
  strict?: boolean

  /**
   * File encoding for file-based parsing.
   * @default 'utf-8'
   */
  encoding?: BufferEncoding

  /**
   * Maximum input size in bytes.
   * Inputs larger than this limit throw a ParseError.
   * @default 1_048_576 (1 MB)
   */
  maxSize?: number
}
```

JSDoc on interfaces and their properties generates rich documentation and appears in IDE hover. Always document: the purpose, any constraints, and the default value.
