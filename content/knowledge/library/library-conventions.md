---
name: library-conventions
description: Public API naming, deprecation patterns, changelog conventions, and export patterns for published libraries
topics: [library, conventions, naming, deprecation, changelog, exports, api-design]
---

Library conventions are the agreements that make a library predictable, navigable, and trustworthy across versions. They cover how public APIs are named, how deprecated APIs are marked and eventually removed, how changes are communicated through changelogs, and how exports are structured. Inconsistent conventions are a tax on every consumer — they create confusion about what is stable, what is safe to use, and what changed between versions.

## Summary

Establish and document conventions before publishing v1. Key areas: consistent naming patterns (verbs for functions, nouns for types/classes, `is`/`has` for predicates), deprecation lifecycle with JSDoc markers and migration guidance, changelog format (Keep a Changelog or Conventional Commits), and export structure that makes tree-shaking possible. Internal exports must be clearly separated from public exports to avoid accidental API surface expansion.

Core conventions:
- Functions: verb-noun (`parseConfig`, `validateSchema`, `createClient`)
- Types/interfaces: PascalCase nouns (`ParseOptions`, `ClientConfig`, `ValidationError`)
- Predicates: `is` prefix (`isError`, `isValidConfig`)
- Constants: SCREAMING_SNAKE for module-level, camelCase for config object keys
- Deprecation: JSDoc `@deprecated` + replacement reference + removal version
- Changelog: per-version sections with Added / Changed / Deprecated / Removed / Fixed / Security

## Deep Guidance

### Public API Naming

Naming is the most visible part of the API contract. Inconsistency in naming signals immaturity and creates cognitive load for consumers.

**Functions — verb-noun pattern:**
```typescript
// Good: verb-noun, action is clear
parseConfig(input: string): Config
validateSchema(schema: Schema): ValidationResult
createClient(options: ClientOptions): Client
formatError(error: unknown): string
resolveModulePath(specifier: string): string

// Bad: ambiguous, no verb, or inverted
config(input: string): Config        // what does it do?
schemaValidator(schema: Schema): ... // -or suffix is not a function verb
client(options: ClientOptions): ...  // noun-only looks like a constructor
```

**Types and interfaces — PascalCase nouns:**
```typescript
// Good
interface ParseOptions { ... }
type ValidationResult = { valid: boolean; errors: ValidationError[] }
class ConfigClient { ... }
type ErrorCode = 'NOT_FOUND' | 'INVALID' | 'TIMEOUT'

// Bad
interface parseOptions { ... }    // lowercase
type validation_result = ...      // snake_case
type ErrCode = ...                // abbreviation
```

**Predicates — `is` prefix:**
```typescript
function isError(value: unknown): value is Error
function isValidConfig(config: unknown): config is Config
function hasRequiredFields(obj: unknown): boolean  // 'has' for possession checks
```

**Boolean options — avoid double negatives:**
```typescript
// Good
interface Options {
  strict: boolean        // enable strict mode
  cache: boolean         // enable caching
}

// Bad
interface Options {
  noStrict: boolean      // double negative when true disables
  disableCache: boolean  // confusing when combined: disableCache: false
}
```

**Error types — descriptive, namespace-prefixed:**
```typescript
// Good: namespaced, descriptive
class ParseError extends Error {
  constructor(message: string, public readonly line: number, public readonly col: number) {
    super(message)
    this.name = 'ParseError'
  }
}

// Available as named export:
export { ParseError, ValidationError, NetworkError, TimeoutError }
```

### Deprecation Lifecycle

Deprecation is a promise to consumers: "this still works today, but plan to migrate." It must be communicated at multiple levels.

**Step 1: Add `@deprecated` JSDoc in a MINOR release:**
```typescript
/**
 * Parse a configuration string.
 * @deprecated Use `parseConfig()` instead. Will be removed in v3.0.
 * @see parseConfig
 */
export function parse(input: string): Config {
  return parseConfig(input)
}
```

The `@deprecated` tag causes TypeScript to show strikethrough in IDEs and emit warnings. Always include:
- What to use instead
- When it will be removed (target major version)

**Step 2: Log a runtime warning (optional, for JS users without TypeScript):**
```typescript
export function parse(input: string): Config {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[my-library] parse() is deprecated. Use parseConfig() instead. ' +
      'Will be removed in v3.0. See migration guide: https://example.com/v3-migration'
    )
  }
  return parseConfig(input)
}
```

Only add runtime warnings if the library has significant JS (non-TypeScript) consumers. Don't pollute production logs.

**Step 3: Remove in the next major version:**
- Remove the export entirely
- Add a clear CHANGELOG entry with migration instructions
- Include migration guide link in the changelog entry

**Deprecation period policy:**
The minimum deprecation period before removal should be one full major version. If you deprecate in v2.3, the earliest removal is v3.0. Communicate the removal version at deprecation time.

### Changelog Conventions

Follow the [Keep a Changelog](https://keepachangelog.com) format. Every release must have a changelog entry before publishing.

**Format:**
```markdown
# Changelog

## [Unreleased]

## [2.1.0] - 2024-03-15

### Added
- `parseConfig()` function as the new primary parsing API
- `ParseOptions.strict` flag for strict mode validation

### Changed
- `createClient()` now accepts `ClientOptions.timeout` in milliseconds (previously seconds)

### Deprecated
- `parse()` — use `parseConfig()` instead. Will be removed in v3.0.

### Fixed
- `validateSchema()` no longer throws on empty input; returns `{ valid: false, errors: [] }`

## [2.0.0] - 2024-01-10

### Breaking Changes
- Removed `connect()` (deprecated since v1.5.0). Use `createClient()`.
- `Config.timeout` is now in milliseconds (was seconds in v1.x). Multiply existing values by 1000.

### Migration from v1.x
See: https://example.com/v2-migration
```

Rules:
- Every entry in "Breaking Changes" must have a migration instruction or link
- "Added" entries must reference the new API by name
- "Fixed" entries must describe the incorrect behavior and the correct behavior
- Never put vague entries like "Various bug fixes" — enumerate them

### Export Patterns

How you structure exports determines your tree-shaking story and your public API surface.

**Root index.ts — explicit, intentional exports only:**
```typescript
// src/index.ts
// Public API — these are the semver-protected exports

// Core functions
export { parseConfig } from './parser'
export { validateSchema } from './validator'
export { createClient } from './client'

// Types
export type { ParseOptions, ParseResult } from './parser'
export type { ValidationResult, ValidationError } from './validator'
export type { ClientOptions, Client } from './client'

// Error types
export { ParseError, ValidationError as LibValidationError } from './errors'

// DO NOT export internal utilities
// DO NOT re-export everything with `export * from './...'`
```

**Avoid `export *` at the root:** It makes the API surface opaque and causes accidental exports of internal symbols.

**Subpath exports for optional features:**
```typescript
// package.json exports map (see library-bundling.md for full config)
{
  "exports": {
    ".": "./dist/index.js",
    "./plugins": "./dist/plugins/index.js",
    "./testing": "./dist/testing/index.js"
  }
}
```

Consumers who don't use plugins pay zero bundle cost. Testing utilities stay separate from production code.

**Barrel files — use sparingly:**
Barrel files (files that re-export from many modules) can defeat tree-shaking in some bundlers. Prefer deep imports in internal code; use the root barrel only for the public API.

### Convention Documentation

Every library must have a `CONTRIBUTING.md` or `docs/conventions.md` documenting:
1. Naming conventions for new API additions
2. Deprecation lifecycle steps (checklist format)
3. Changelog update requirement (must update before PR merges)
4. Export checklist for new public APIs

Without documented conventions, contributors add APIs inconsistently, and the library accumulates naming debt that is expensive to fix without breaking changes.
