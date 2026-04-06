---
name: backend-conventions
description: Service and handler naming conventions, structured error handling patterns, structured logging with correlation IDs, and file organization standards for backend codebases
topics: [backend, conventions, error-handling, logging, naming, file-organization]
---

Consistent conventions in a backend codebase reduce cognitive load, make code reviewable at a glance, and prevent entire classes of bugs. Naming, error handling, and logging are the three highest-leverage areas — they touch every layer of the stack and every engineer on the team. Establish these conventions before the first PR, codify them in linting rules where possible, and treat violations as blocking review comments.

## Summary

### Service and Handler Naming

Names should reveal intent and be consistent across the codebase:

- **Services**: Named after the domain concept they own, noun form. `OrderService`, `UserAuthService`, `PaymentProcessor`. One service per domain concept. Services contain business logic only — no HTTP, no database drivers.
- **Handlers / Controllers**: Named after the HTTP resource or operation. `OrdersHandler`, `UserController`, `AuthRouter`. One handler per resource family. Handlers translate HTTP concerns to service calls — no business logic.
- **Repository / DAO classes**: `OrderRepository`, `UserStore`. Contain only data-access logic. No business rules, no HTTP.
- **Method naming**: Use verb-noun patterns that reveal intent. Prefer `createOrder`, `cancelOrder`, `findOrdersByCustomer` over generic `get`, `set`, `update`. Reserve `get` for trivial accessors.
- **File names**: Match the class/module name in kebab-case. `order-service.ts`, `orders-handler.ts`, `order-repository.ts`.

### Structured Error Handling

Unstructured errors (`throw new Error("something went wrong")`) are a maintenance liability. Use structured errors throughout:

- **Error codes**: Define an enum or constant map of machine-readable error codes. `ORDER_NOT_FOUND`, `PAYMENT_DECLINED`, `INSUFFICIENT_INVENTORY`. Codes enable consumers to handle specific failure cases without string parsing.
- **Error shape**: Standardize the error response object across all endpoints. A minimal shape: `{ code: string, message: string, details?: unknown, requestId: string }`. Never leak stack traces to API consumers in production.
- **Error categories**: Separate operational errors (expected, business logic failures) from programmer errors (unexpected, indicative of a bug). Operational errors are `4xx`; programmer errors are `5xx`. Log programmer errors with full context.
- **Never swallow errors**: A bare `catch {}` or `catch (e) { /* ignore */ }` is a production bug waiting to surface. At minimum, log the error with context. If the error is expected and recoverable, handle it explicitly and document why.

### Structured Logging

Log entries are your primary debugging tool in production. Treat them as a first-class API:

- **Structured format**: Always emit JSON logs. Human-readable log lines are unsearchable at scale. Every entry should be a JSON object parseable by log aggregation tools (Datadog, Loki, CloudWatch).
- **Required fields on every log entry**: `timestamp` (ISO 8601), `level` (debug/info/warn/error), `message`, `service`, `requestId` (correlation ID), `environment`.
- **Correlation IDs**: Generate a `requestId` (UUID v4) at the API gateway or first handler and propagate it through every downstream service call via a header (`X-Request-ID`) and a context object (AsyncLocalStorage in Node.js). Every log line and error response includes this ID. A support ticket becomes: "give me requestId X" → full trace in 10 seconds.
- **Log levels**: `debug` — internal state, loop iterations (disabled in production); `info` — request start/end, state transitions; `warn` — recoverable anomalies, deprecated usage; `error` — failures requiring human attention.
- **Avoid over-logging**: Logging every field of every object in a high-throughput path fills disks and incurs cost. Log decision points, not data dumps.

### File Organization

Enforce a predictable directory layout:

- Group by layer, not by feature, in small services. In larger codebases, group by feature/domain with layer sub-directories.
- Test files co-located with source files (`order-service.test.ts` next to `order-service.ts`) or in a parallel `__tests__/` directory — choose one pattern and enforce it.
- Configuration files at the root of `src/`, not scattered across subdirectories.

## Deep Guidance

### Enforcing Conventions with Tooling

Conventions enforced by humans alone drift. Use automated tools:

- **ESLint / Biome**: Enforce naming patterns, ban `console.log` in favor of a logger, require explicit error handling.
- **TypeScript strict mode**: Catches the class of errors that naming conventions alone cannot prevent — `strictNullChecks`, `noImplicitAny`, `noUncheckedIndexedAccess`.
- **Commit hooks**: Run linting on staged files via `lint-staged` + `husky`. Prevents convention drift from reaching the repository.
- **OpenAPI response schema validation**: Validate that error responses match the standard shape in integration tests. Catches endpoints that return non-standard errors before they reach production.
