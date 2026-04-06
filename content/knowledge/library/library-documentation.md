---
name: library-documentation
description: TypeDoc/JSDoc setup, README structure, example code, migration guides, and API reference for published libraries
topics: [library, documentation, typedoc, jsdoc, readme, examples, migration-guides, api-reference]
---

Library documentation is the primary onboarding surface for new consumers and the support surface for existing ones. Poor documentation causes consumers to misuse the API, open avoidable issues, and ultimately abandon the library for better-documented alternatives. Good documentation reduces support burden, increases adoption, and communicates the library's quality and professionalism. Documentation must be treated as a first-class deliverable, not an afterthought after code is complete.

## Summary

Every library needs four documentation layers: a README for discovery and quick start, API reference generated from JSDoc (TypeDoc), example code that is runnable and tested, and migration guides for each major version. The README structure follows a standard pattern: badges, one-line description, install, quick start, core concepts, API overview with links to full reference, and contributing. JSDoc comments are the source of truth for the API reference — they must be maintained alongside code.

Documentation layers:
- README.md: discovery, install, quick start (< 5 minutes to first working code)
- JSDoc inline: function descriptions, parameter docs, examples, throws
- TypeDoc site: full API reference with types, overloads, inheritance
- examples/: runnable, tested example projects per major use case
- Migration guides: step-by-step for every major version bump

## Deep Guidance

### README Structure

The README must answer four questions in order: What is it? How do I install it? How do I use it? Where do I learn more?

```markdown
# my-library

[![npm](https://img.shields.io/npm/v/my-library)](https://npmjs.com/package/my-library)
[![CI](https://github.com/org/my-library/actions/workflows/ci.yml/badge.svg)](...)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

One-sentence description of what the library does and the problem it solves.

## Install

\`\`\`bash
npm install my-library
\`\`\`

Requires Node.js 18+. TypeScript 5.0+ recommended.

## Quick Start

\`\`\`typescript
import { parseConfig, createClient } from 'my-library'

const config = parseConfig(`
  [server]
  host = "localhost"
  port = 3000
`)

const client = createClient({ config })
const result = await client.query('SELECT 1')
\`\`\`

## Core Concepts

Brief explanation of the 2-3 key concepts consumers need to understand before using the API:
- **Config**: The parsed configuration object. Passed to all client methods.
- **Client**: Stateful connection to a service. Create once per application.
- **Query**: An operation executed against the client.

## API Reference

Full API documentation: [https://my-library.dev/api](https://my-library.dev/api)

Key exports:
| Export | Description |
|--------|-------------|
| `parseConfig(input)` | Parse a TOML string into a Config object |
| `createClient(options)` | Create a connected Client instance |
| `ParseError` | Thrown when input is not valid TOML |

## Examples

See [examples/](examples/) for runnable examples:
- [Basic usage](examples/basic-usage/) — Parse a config and run a query
- [Custom transport](examples/custom-transport/) — Inject a custom HTTP transport

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
```

**README anti-patterns to avoid:**
- Feature lists without usage examples
- Installation section that assumes npm — show the command explicitly
- API "documentation" that only lists function names without signatures
- No error handling in examples (shows only the happy path)
- Out-of-date examples (the most common and damaging README failure)

### JSDoc Standards

JSDoc comments are compiled into the generated API reference. Write them for the consumer who has never read the source:

```typescript
/**
 * Parse a TOML-formatted configuration string.
 *
 * Parses `input` as TOML and validates the result against the expected Config
 * schema. Returns a fully typed Config object on success.
 *
 * @param input - TOML-formatted string. Must be valid TOML 1.0.
 * @param options - Optional parsing configuration.
 * @param options.strict - When true, unknown fields cause a ValidationError.
 *   Defaults to false (unknown fields are ignored).
 * @param options.encoding - Character encoding. Defaults to 'utf-8'.
 *
 * @returns Parsed Config object with all fields typed.
 *
 * @throws {ParseError} If `input` is not valid TOML. The error includes
 *   `line` and `column` properties indicating the error location.
 * @throws {ValidationError} If `options.strict` is true and the parsed config
 *   contains unknown fields.
 *
 * @example
 * Basic usage:
 * ```typescript
 * const config = parseConfig('[server]\nhost = "localhost"')
 * console.log(config.server.host) // "localhost"
 * ```
 *
 * @example
 * With strict mode:
 * ```typescript
 * try {
 *   const config = parseConfig(input, { strict: true })
 * } catch (err) {
 *   if (err instanceof ValidationError) {
 *     console.error('Unknown fields:', err.unknownFields)
 *   }
 * }
 * ```
 *
 * @since 1.0.0
 */
export function parseConfig(input: string, options?: ParseOptions): Config
```

**Minimum JSDoc for every public export:**
- One-sentence description (what it does, not how)
- `@param` for each parameter with type context and constraints
- `@returns` describing the return value
- `@throws` for every error type that can be thrown
- At least one `@example` showing realistic usage
- `@since` for when the export was added (helps with migration)
- `@deprecated` with replacement and removal version when applicable

### TypeDoc Setup

TypeDoc generates HTML API reference from JSDoc comments:

```bash
npm install --save-dev typedoc typedoc-plugin-markdown
```

```json
// typedoc.json
{
  "entryPoints": ["src/index.ts"],
  "out": "docs/api",
  "plugin": ["typedoc-plugin-markdown"],
  "readme": "none",
  "excludePrivate": true,
  "excludeInternal": true,
  "categorizeByGroup": true,
  "categoryOrder": ["Core", "Types", "Errors", "*"],
  "gitRemote": "origin",
  "githubPages": true
}
```

```bash
# Generate docs
npm run docs
# Or: npx typedoc

# Deploy to GitHub Pages (in CI)
# Add to your GitHub Actions workflow:
- uses: actions/upload-pages-artifact@v3
  with:
    path: docs/api
```

Run TypeDoc in CI to catch documentation failures (missing exports, broken references) before they reach consumers.

### Example Code Standards

Examples are documentation that can be run and tested. They must:

1. **Be complete and runnable:**
```typescript
// examples/basic-usage/index.ts
// This file runs standalone: `node index.js`
import { parseConfig, createClient } from 'my-library'

const raw = `
[server]
host = "localhost"
port = 3000
`

const config = parseConfig(raw)
const client = createClient({ config })

async function main() {
  const result = await client.query('SELECT 1')
  console.log('Connected:', result)
  await client.close()
}

main().catch((err) => {
  console.error('Example failed:', err)
  process.exit(1)
})
```

2. **Show error handling:**
```typescript
// Don't just show the happy path
try {
  const config = parseConfig(invalidInput)
} catch (err) {
  if (err instanceof ParseError) {
    console.error(`Syntax error at line ${err.line}, column ${err.column}`)
    console.error(err.message)
  }
}
```

3. **Be tested in CI:**
```yaml
# .github/workflows/ci.yml
- name: Test examples
  run: |
    cd examples/basic-usage && npm install && node index.js
    cd examples/custom-transport && npm install && node index.js
```

### Migration Guides

Every major version must have a migration guide. The guide must be findable from the CHANGELOG and README:

```markdown
<!-- docs/guides/migration-v2-to-v3.md -->
# Migrating from v2 to v3

## Breaking Changes

### `parse()` removed
`parse()` was deprecated in v2.3. Replace with `parseConfig()`:

**Before (v2):**
\`\`\`typescript
import { parse } from 'my-library'
const config = parse(input)
\`\`\`

**After (v3):**
\`\`\`typescript
import { parseConfig } from 'my-library'
const config = parseConfig(input)
\`\`\`

### `Config.timeout` is now milliseconds
The `timeout` field was previously in seconds. Multiply by 1000:

**Before (v2):**
\`\`\`typescript
const config = parseConfig(input)
// config.timeout === 30 (seconds)
\`\`\`

**After (v3):**
\`\`\`typescript
const config = parseConfig(input)
// config.timeout === 30000 (milliseconds)
// Adjust your code: config.timeout * 1000 is no longer needed
\`\`\`

## Automated Migration

A codemod is available to automate common patterns:
\`\`\`bash
npx @my-library/codemod v2-to-v3 ./src
\`\`\`
```

**Migration guide checklist:**
- Every breaking change has a before/after code example
- Every renamed export has an explicit replacement
- Behavior changes are explained, not just listed
- A codemod is provided for mechanical changes (optional but appreciated)
- Link to the migration guide from the CHANGELOG entry
