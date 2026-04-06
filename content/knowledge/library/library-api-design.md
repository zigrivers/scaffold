---
name: library-api-design
description: Public surface design, method signatures, error contracts, and extension points for published library APIs
topics: [library, api-design, public-surface, method-signatures, error-contracts, extension-points]
---

Library API design is the highest-leverage activity in library development. A well-designed API makes correct usage easy and incorrect usage hard, survives multiple major versions without fundamental restructuring, and communicates intent through its shape alone. Poor API design cannot be fixed without breaking changes — every naming mistake, parameter order error, and missing overload becomes permanent once consumers adopt it. Design APIs from the consumer's perspective first, implementation second.

## Summary

Design APIs by writing consumer call sites before writing implementation. Prefer named options objects over positional parameters beyond two arguments. Return values should be typed as specifically as possible — avoid returning `any` or overly wide union types. Error contracts must be explicit: document what each function throws, when, and why. Provide extension points through composition (options injection, middleware, plugins) rather than inheritance. Make the happy path obvious and the error path impossible to ignore.

Core principles:
- Pit-of-success design: the obvious way to use the API is the correct way
- Named options objects for 3+ parameters
- Explicit error contracts (typed throws, documented in JSDoc)
- Overloads for genuinely different call signatures
- Consistent return type patterns (never `T | undefined` when you can overload)

## Deep Guidance

### Write Call Sites First

Before implementing any function, write the code that will call it:

```typescript
// Step 1: Write how consumers will use this
import { parseConfig } from 'my-library'

// Use case 1: parse a string, get typed config
const config = parseConfig(rawString)

// Use case 2: parse with strict mode
const config = parseConfig(rawString, { strict: true })

// Use case 3: parse a file path (different input)
const config = await parseConfigFile('./config.toml')

// Use case 4: handle parse errors gracefully
try {
  const config = parseConfig(rawString)
} catch (err) {
  if (err instanceof ParseError) {
    console.error(`Parse failed at line ${err.line}: ${err.message}`)
  }
}

// Step 2: Now design the API to make this work naturally
export function parseConfig(input: string, options?: ParseOptions): Config
export async function parseConfigFile(path: string, options?: ParseOptions): Promise<Config>
```

This technique reveals usability issues before any code is written.

### Options Object Pattern

Positional parameters beyond two create cognitive load and fragile call sites:

```typescript
// BAD: positional parameters — order is arbitrary, easy to mix up
function connect(host: string, port: number, timeout: number, ssl: boolean, retries: number): Client

// Called as: connect('localhost', 5432, 30000, true, 3)
// Which is timeout and which is retries? Must check signature every time.

// GOOD: named options object
interface ConnectOptions {
  host: string
  port: number
  timeout?: number     // ms, default: 30000
  ssl?: boolean        // default: false
  retries?: number     // default: 3
}

function connect(options: ConnectOptions): Client
// connect({ host: 'localhost', port: 5432, ssl: true })
// Self-documenting call site. New options add without breaking callers.
```

**Options object rules:**
- All options beyond the first two required parameters go in an options object
- Options should have sensible defaults (document the defaults in JSDoc)
- Required options stay required; don't make everything optional
- Never use boolean flags that change behavior fundamentally — use discriminated unions

```typescript
// BAD: boolean flag that means completely different behavior
function parse(input: string, isFile: boolean): Config

// GOOD: separate functions or discriminated union
function parseString(input: string): Config
function parseFile(path: string): Promise<Config>
// Or:
type ParseInput = { type: 'string'; value: string } | { type: 'file'; path: string }
function parse(input: ParseInput): Config | Promise<Config>
```

### Method Signature Design

**Overloads for genuinely different signatures:**
```typescript
// Overloads allow TypeScript to narrow the return type based on input
function parse(input: string): Config
function parse(input: string, options: { async: true }): Promise<Config>
function parse(input: string, options: { async: false }): Config
function parse(input: string, options?: ParseOptions): Config | Promise<Config> {
  // implementation
}
```

Use overloads sparingly. Each overload is a commitment to maintain that signature. If you find yourself needing many overloads, reconsider whether the API should be split into separate functions.

**Generic constraints — add them when they add value:**
```typescript
// Good: generic constraint enables type narrowing
function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>

// Bad: generic without constraint is less type-safe
function pick<T, K>(obj: T, keys: K[]): any

// Bad: generic where it adds no value (always the same type)
function identity<T>(value: T): T  // Fine for teaching, rarely needed in practice
```

**Return type specificity:**
```typescript
// BAD: too wide
function getUser(id: string): object

// BAD: any
function parseYAML(input: string): any

// GOOD: specific types
function getUser(id: string): User | null  // null when not found
function parseYAML<T = unknown>(input: string): T  // generic with default

// BEST when the shape is known:
interface User {
  id: string
  name: string
  email: string
  createdAt: Date
}
function getUser(id: string): User | null
```

### Error Contracts

Every public function must have a documented error contract. Document errors in JSDoc and in a separate errors section of the API documentation.

**JSDoc error documentation:**
```typescript
/**
 * Parse a configuration string into a typed Config object.
 *
 * @param input - TOML-formatted configuration string
 * @param options - Parsing options
 * @returns Parsed and validated Config object
 *
 * @throws {ParseError} If the input string is not valid TOML.
 *   `ParseError.line` and `ParseError.column` indicate the error location.
 * @throws {ValidationError} If the parsed config fails schema validation.
 *   `ValidationError.errors` contains the list of validation failures.
 *
 * @example
 * ```typescript
 * try {
 *   const config = parseConfig('[server]\nhost = "localhost"')
 * } catch (err) {
 *   if (err instanceof ParseError) {
 *     console.error(`Syntax error at line ${err.line}`)
 *   }
 * }
 * ```
 */
export function parseConfig(input: string, options?: ParseOptions): Config
```

**Result type pattern (alternative to throws):**
For APIs where errors are expected and should be handled inline, a Result type is cleaner than throws:

```typescript
export type Result<T, E extends Error = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export function tryParseConfig(input: string): Result<Config, ParseError | ValidationError> {
  try {
    return { ok: true, value: parseConfig(input) }
  } catch (err) {
    return { ok: false, error: err as ParseError | ValidationError }
  }
}

// Consumer usage:
const result = tryParseConfig(input)
if (result.ok) {
  console.log(result.value.server.host)
} else {
  console.error(result.error.message)
}
```

Provide both patterns when the use case warrants: throwing for "should not fail" paths, Result type for "expected to sometimes fail" paths.

### Extension Points

Design extension points that don't require forking or subclassing:

**Middleware pattern for transform pipelines:**
```typescript
export interface ParseMiddleware {
  (input: string, next: (input: string) => Config): Config
}

export function createParser(middlewares: ParseMiddleware[] = []): Parser {
  return {
    parse(input: string): Config {
      const chain = middlewares.reduceRight(
        (next: (i: string) => Config, mw) => (i: string) => mw(i, next),
        parseRaw
      )
      return chain(input)
    }
  }
}

// Consumer adds preprocessing:
const parser = createParser([
  (input, next) => next(input.trim().toLowerCase()),
  (input, next) => {
    const result = next(input)
    return { ...result, source: 'custom' }
  }
])
```

**Hook pattern for lifecycle events:**
```typescript
export interface ClientHooks {
  beforeRequest?: (req: Request) => Request | Promise<Request>
  afterResponse?: (res: Response) => Response | Promise<Response>
  onError?: (err: Error) => void
}

export function createClient(options: ClientOptions & { hooks?: ClientHooks }): Client
```

**Avoid class inheritance as extension:**
```typescript
// BAD: forces consumers to subclass
class BaseClient {
  protected abstract buildRequest(options: RequestOptions): Request
  // Consumers must extend to customize
}

// GOOD: inject the behavior
type RequestBuilder = (options: RequestOptions) => Request

function createClient(options: {
  buildRequest?: RequestBuilder
}): Client
```

Subclassing creates tight coupling between the consumer and the library's internal class hierarchy. Every internal restructuring becomes a breaking change.

### Fluent API Design

Fluent APIs (method chaining) improve readability for configuration-heavy builders:

```typescript
// Query builder example
export class QueryBuilder<T> {
  private _where: WhereClause[] = []
  private _orderBy: OrderClause[] = []
  private _limit?: number

  where(field: keyof T, op: Operator, value: unknown): this {
    this._where.push({ field: field as string, op, value })
    return this
  }

  orderBy(field: keyof T, direction: 'asc' | 'desc' = 'asc'): this {
    this._orderBy.push({ field: field as string, direction })
    return this
  }

  limit(n: number): this {
    this._limit = n
    return this
  }

  build(): Query<T> {
    return { where: this._where, orderBy: this._orderBy, limit: this._limit }
  }
}

// Consumer:
const query = new QueryBuilder<User>()
  .where('active', '=', true)
  .orderBy('createdAt', 'desc')
  .limit(10)
  .build()
```

Use fluent APIs for builders and configuration DSLs. Avoid them for operational functions — `parseConfig(input).validate().execute()` is harder to debug than three explicit function calls.
