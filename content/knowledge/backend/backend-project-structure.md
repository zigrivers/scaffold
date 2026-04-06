---
name: backend-project-structure
description: Canonical directory layout for backend services — routes/controllers, services, models/repositories, middleware, utils, config resolution, and dependency injection patterns
topics: [backend, project-structure, architecture, dependency-injection, layers]
---

A well-organized backend project is readable to a new engineer in minutes. The directory layout should communicate the architecture: which layer owns which responsibility, where to add a new feature, and where to find any piece of behavior. The most common structural failure is mixing concerns — business logic in controllers, database calls in services, HTTP parsing in repositories. Enforce boundaries through structure first, tooling second.

## Summary

### Canonical Directory Layout

```
src/
  routes/          # HTTP route definitions and handler registration
  handlers/        # (or controllers/) Request parsing, validation, response formatting
  services/        # Business logic — no HTTP, no database drivers
  repositories/    # (or models/) Data access — queries, mutations, ORM models
  middleware/      # Cross-cutting HTTP concerns: auth, logging, rate limiting
  utils/           # Pure utility functions: date formatting, hashing, parsing
  config/          # Configuration loading and validation
  types/           # Shared TypeScript types and interfaces
  errors/          # Custom error classes and error code definitions
  jobs/            # Background jobs, queue workers, scheduled tasks
  events/          # Event emitters, message queue publishers/consumers
  app.ts           # Application composition root
  server.ts        # HTTP server startup (separate from app composition)
```

### Layer Responsibilities

**routes/** (or routers): Define HTTP paths, methods, and which handler each maps to. No logic — only route registration. In Express: `router.post('/orders', ordersHandler.create)`. In Fastify: schema-decorated route objects.

**handlers/** (or controllers/): Translate HTTP into service calls. Parse and validate request parameters and bodies. Call one or more services. Format and send the HTTP response. No business rules, no SQL.

**services/**: Contain all business logic. Receive plain objects (not request/response objects). Return plain objects or throw domain errors. Depend on repository interfaces, not concrete implementations — this enables testing without a real database.

**repositories/**: Abstract data access behind a consistent interface. A `UserRepository` exposes `findById(id)`, `create(data)`, `update(id, data)` — callers never see SQL or ORM query syntax. Swap implementations (Postgres ↔ in-memory ↔ DynamoDB) without changing services.

**middleware/**: Applied globally or per-route at the framework level. Authentication, request ID injection, body parsing, rate limiting, CORS headers. Each middleware does one thing.

**config/**: Load environment variables, validate them with a schema (Zod, Joi, envalid), and export a typed config object. Never access `process.env` directly outside this module.

### Config Resolution

Config follows a priority order: environment variables override file-based config, which overrides built-in defaults. Validate the entire config object at startup with a strict schema — fail fast with a clear error if a required variable is missing. Never lazy-load config in a request handler; config should be loaded and validated once at process start.

Separate config from secrets. Config (feature flags, timeouts, rate limits) lives in environment variables or a config file. Secrets (database passwords, API keys) are fetched from a secrets manager (AWS Secrets Manager, HashiCorp Vault, Doppler) at startup or via a sidecar — never committed to version control.

### Dependency Injection Patterns

Avoid module-level singletons for dependencies with side effects (database connections, HTTP clients). Instead, compose dependencies explicitly:

- **Constructor injection**: Pass dependencies as constructor arguments to service and repository classes. `new OrderService(orderRepository, paymentClient, eventEmitter)`. Testable without framework magic.
- **Composition root**: Wire all dependencies together in `app.ts` or a dedicated `container.ts`. This is the only place that instantiates concrete implementations.
- **DI frameworks**: InversifyJS, tsyringe, or NestJS's built-in IoC container add decorator-based injection. Use only if the manual wiring becomes unmanageable — DI frameworks add complexity and build overhead.

## Deep Guidance

### Feature-Based Structure (Large Codebases)

When a codebase grows beyond ~10 engineers or ~20 domain concepts, flat layer directories become unwieldy. Reorganize by feature/domain with layer sub-directories:

```
src/
  orders/
    orders.handler.ts
    orders.service.ts
    orders.repository.ts
    orders.types.ts
    orders.test.ts
  users/
    users.handler.ts
    users.service.ts
    ...
  shared/
    middleware/
    utils/
    config/
```

This makes the blast radius of a domain change obvious and allows teams to own vertical slices. Enforce a rule: code in `orders/` may not import from `users/` — communication happens through a service interface or event. Cross-domain dependencies are always explicit.

### When to Create a New Layer

The urge to add layers (`managers/`, `helpers/`, `transformers/`) should be resisted unless the new concept is meaningfully distinct and will appear in more than one place. Every layer is a conceptual tax on new engineers. Prefer a clear violation of the existing convention to an ad hoc proliferation of vaguely named directories.
