---
name: library-testing
description: Unit tests, consumer integration tests, example app tests, snapshot testing, and type testing for published libraries
topics: [library, testing, unit-tests, integration-tests, type-testing, tsd, snapshot-testing, consumer-testing]
---

Library testing has a different threat model than application testing. You are not just testing that your code works internally — you are testing that the public API works correctly from a consumer's perspective, across different environments and module systems, and that type definitions accurately reflect runtime behavior. A library with excellent unit tests but untested consumer integration can still fail spectacularly when installed in a real project. Every public API export needs test coverage that exercises it as a consumer would.

## Summary

Library testing requires four layers: unit tests for internal logic (fast, isolated), consumer-perspective integration tests (exercise the public API as an external consumer would), example application tests (run the examples from the docs to catch regressions), and type tests (verify TypeScript types are accurate and don't regress). Use vitest for unit and integration tests. Use `tsd` or vitest's `expectTypeOf` for type tests. Run example apps in CI. Aim for 100% coverage of public API exports.

Testing layers:
- Unit tests: pure functions, internal logic, error conditions
- Integration tests: public API called without any internal access
- Type tests: `tsd` or `expect-type` assertions on all public exports
- Example tests: run examples/ as standalone scripts in CI
- Cross-environment tests: Node ESM, Node CJS, and bundler environments

## Deep Guidance

### Unit Tests

Unit tests cover individual functions and classes in isolation. Use vitest for its TypeScript support and fast execution:

```typescript
// tests/unit/parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseConfig } from '../../src/parser'
import { ParseError } from '../../src/errors'

describe('parseConfig', () => {
  it('parses a valid TOML string', () => {
    const result = parseConfig('[server]\nhost = "localhost"\nport = 3000')
    expect(result.server.host).toBe('localhost')
    expect(result.server.port).toBe(3000)
  })

  it('throws ParseError on invalid TOML', () => {
    expect(() => parseConfig('invalid = {toml')).toThrow(ParseError)
  })

  it('includes line number in ParseError', () => {
    try {
      parseConfig('line1 = "ok"\nline2 = {invalid')
    } catch (err) {
      expect(err).toBeInstanceOf(ParseError)
      expect((err as ParseError).line).toBe(2)
    }
  })

  it('returns empty config for empty input', () => {
    const result = parseConfig('')
    expect(result).toEqual({})
  })

  it('handles special characters in string values', () => {
    const result = parseConfig('key = "hello\\nworld"')
    expect(result.key).toBe('hello\nworld')
  })
})
```

**Unit test coverage targets:**
- Every exported function: 100% coverage
- Every error case: tested explicitly
- Edge cases: empty inputs, null/undefined, very large inputs, special characters
- Option combinations: test that each option modifies behavior correctly

### Consumer-Perspective Integration Tests

These tests exercise the public API exactly as a consumer would — importing from the package root, never accessing internal modules:

```typescript
// tests/integration/consumer-api.test.ts
// Import from the package root, not from src/
// This tests the actual public API surface
import { parseConfig, createClient, ParseError, ValidationError } from 'my-library'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// If running in Node, import the dist/ version not the source
// Configure vitest to resolve 'my-library' to './dist/index.js'

describe('Consumer API', () => {
  describe('parseConfig()', () => {
    it('is callable with a single string argument', () => {
      expect(() => parseConfig('[test]\nvalue = 1')).not.toThrow()
    })

    it('returns an object with the parsed structure', () => {
      const config = parseConfig('[db]\nhost = "localhost"')
      expect(config).toMatchObject({ db: { host: 'localhost' } })
    })

    it('throws ParseError (a named export) on syntax errors', () => {
      expect(() => parseConfig('invalid')).toThrow(ParseError)
    })
  })

  describe('createClient()', () => {
    let client: ReturnType<typeof createClient>

    beforeEach(() => {
      const config = parseConfig('[server]\nhost = "localhost"\nport = 3000')
      client = createClient({ config })
    })

    afterEach(async () => {
      await client.close()
    })

    it('creates a client with a query method', () => {
      expect(client.query).toBeTypeOf('function')
    })
  })
})
```

**Configure vitest to test against dist/ for integration tests:**
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest'

export default defineConfig({
  test: {
    // Unit tests use src/ directly
    // Integration tests use the built dist/
    include: ['tests/unit/**/*.test.ts'],
  }
})

// vitest.integration.config.ts
export default defineConfig({
  resolve: {
    alias: {
      'my-library': new URL('./dist/index.js', import.meta.url).pathname
    }
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
  }
})
```

### Type Tests with tsd

Type tests verify that TypeScript types are accurate and don't regress:

```typescript
// tests/types/index.test-d.ts
import { expectType, expectError, expectAssignable, expectNotType } from 'tsd'
import type { Config, ParseOptions, ParseError as PE } from 'my-library'
import { parseConfig, createClient, ParseError } from 'my-library'

// Return type tests
expectType<Config>(parseConfig('[test]\nvalue = 1'))

// Overload resolution
expectType<Config>(parseConfig('input', { async: false }))
expectType<Promise<Config>>(parseConfig('input', { async: true }))

// Input type constraints
expectError(parseConfig(42))
expectError(parseConfig(null))
expectError(parseConfig(undefined))
expectError(parseConfig([]))

// Options shape
const validOptions: ParseOptions = { strict: true, encoding: 'utf-8' }
expectAssignable<ParseOptions>(validOptions)
expectAssignable<ParseOptions>({})  // All options are optional

// Error type hierarchy
const err = new ParseError('msg', 1, 1)
expectAssignable<Error>(err)
expectType<number>(err.line)
expectType<number>(err.column)

// Discriminated union types
type ParseResult = ReturnType<typeof parseConfig>
expectNotType<undefined>(null as ParseResult)  // Result is never null
```

```json
// package.json — configure tsd
{
  "tsd": {
    "directory": "tests/types"
  },
  "scripts": {
    "test:types": "tsd"
  }
}
```

### Snapshot Testing for Serialized Output

Snapshot tests catch unintentional changes to formatted output:

```typescript
// tests/unit/formatter.test.ts
import { describe, it, expect } from 'vitest'
import { formatConfig } from '../../src/formatter'

describe('formatConfig', () => {
  it('formats a config object to TOML', () => {
    const config = { server: { host: 'localhost', port: 3000 } }
    expect(formatConfig(config)).toMatchSnapshot()
  })

  it('formats an array value', () => {
    const config = { allowed: ['read', 'write'] }
    expect(formatConfig(config)).toMatchSnapshot()
  })
})
```

Snapshot files are committed to the repository. When intentional output changes are made, update snapshots with `vitest --update-snapshots`. In CI, fail on unexpected snapshot changes.

**When to use snapshots vs. explicit assertions:**
- Use snapshots for complex serialized output (HTML, TOML, JSON with many fields)
- Use explicit assertions for simple return values — snapshots hide intent
- Never snapshot non-deterministic output (timestamps, random IDs)

### Cross-Environment Testing

Libraries must work in both Node ESM and CJS environments:

```typescript
// tests/env/esm.test.mjs — ES module import test
import { parseConfig } from 'my-library'
console.assert(typeof parseConfig === 'function', 'ESM import works')
console.log('ESM: OK')

// tests/env/cjs.test.cjs — CommonJS require test
const { parseConfig } = require('my-library')
console.assert(typeof parseConfig === 'function', 'CJS require works')
console.log('CJS: OK')
```

```yaml
# .github/workflows/ci.yml
- name: Test CJS compatibility
  run: node tests/env/cjs.test.cjs

- name: Test ESM compatibility
  run: node tests/env/esm.test.mjs

- name: Test with latest Node
  run: npm test
  env:
    NODE_VERSION: 22

- name: Test with minimum Node
  run: npm test
  env:
    NODE_VERSION: 18
```

### Example Application Tests

Run examples in CI to catch regressions in the documented usage:

```yaml
# .github/workflows/ci.yml
- name: Build library
  run: npm run build

- name: Test basic-usage example
  run: |
    cd examples/basic-usage
    npm install
    node index.js
  # Fails if the example throws an error or exits non-zero

- name: Test advanced example
  run: |
    cd examples/advanced-plugin
    npm install
    node index.js
```

Each example's `package.json` references `"my-library": "file:../../"` so it uses the locally built dist/, not a published version:

```json
{
  "dependencies": {
    "my-library": "file:../../"
  }
}
```

If an example breaks, the public API has regressed. Fix the library, not the example.

### Test Coverage Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/internal/**', 'src/**/*.test.ts'],
      thresholds: {
        functions: 100,    // Every exported function must be tested
        branches: 90,      // 90% branch coverage
        lines: 95,
        statements: 95
      },
      reporter: ['text', 'lcov', 'html']
    }
  }
})
```

A 100% function coverage target is achievable for libraries and enforces that every public export has at least one test. Combined with type tests (which test every function's type signature), this gives comprehensive coverage of the public API contract.
