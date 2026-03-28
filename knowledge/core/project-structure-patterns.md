---
name: project-structure-patterns
description: Directory layout patterns by framework, module organization, and file placement rules
topics: [project-structure, directory-layout, module-organization, file-placement, monorepo, colocation]
---

# Project Structure Patterns

Directory structure is the physical manifestation of architectural decisions. A well-organized project communicates its architecture through the file tree alone — a new developer should understand the system's boundaries by reading directory names. This knowledge covers core layout patterns, framework-specific conventions, and the rules that keep structures clean as projects grow.

## Summary

### Core Patterns

Three fundamental approaches to organizing source code:

1. **Feature-Based (Vertical Slices)** — Group by business domain. Each feature directory contains its own components, services, tests, and types. Best for: domain-rich applications, teams organized by feature.
2. **Layer-Based (Horizontal Layers)** — Group by technical concern. Separate directories for controllers, services, repositories, models. Best for: small projects, CRUD-heavy apps, teams organized by specialization.
3. **Hybrid** — Feature-based at the top level, layer-based within each feature. Most common in practice. Combines domain clarity with technical organization.

### The Co-Location Principle

Files that change together should live together. A feature's component, styles, tests, types, and utilities belong in the same directory — not scattered across `components/`, `styles/`, `tests/`, `types/`, and `utils/`. Co-location reduces the cognitive cost of changes.

### The Shared Code Rule

Code belongs in a shared directory (`shared/`, `common/`, `lib/`) only when it has 2 or more consumers. A "shared" utility used by one feature is misplaced — it belongs in that feature's directory. Premature extraction into shared code creates coupling without benefit.

### When to Restructure

Restructure when: navigation becomes difficult (too many files in one directory), features are tangled (changing one feature touches many directories), or onboarding developers consistently get lost. Do not restructure for aesthetic reasons or because a blog post recommended a different layout.

### Test Placement

Co-located tests (`service.test.ts` next to `service.ts`) for unit tests — easy to find, move with refactors. Mirror directory (`tests/` mirroring `src/`) for integration and E2E tests that span modules.

### Config vs. Application Code

Tooling config files (`tsconfig.json`, `eslint.config.js`, `Makefile`) live at project root by convention. Application config (`src/config/`) holds runtime settings (database URLs, feature flags). Never mix the two locations.

## Deep Guidance

### Feature-Based Structure

Feature-based organization maps directly to the product's domain model:

```
src/
  features/
    auth/
      components/LoginForm.tsx, LoginForm.test.tsx
      hooks/useAuth.ts, useAuth.test.ts
      services/auth-service.ts, auth-service.test.ts
      types.ts
      index.ts           # public API barrel — other features import from here
    billing/
      components/, hooks/, services/, types.ts, index.ts
  shared/
    components/          # truly shared: Button, Modal, Input
    hooks/               # truly shared: useDebounce, useLocalStorage
    utils/               # truly shared: formatDate, validateEmail
```

**The index.ts barrel** defines each feature's public API. Other features import from `@/features/auth`, never from internal paths. This creates explicit boundaries — internal refactoring cannot break consumers.

**When it breaks down**: Heavy cross-cutting concerns (every feature needs auth context, analytics, error boundaries). Solution: shared infrastructure lives in `shared/` or `infrastructure/`.

### Layer-Based Structure

Layer-based organization mirrors the technical architecture:

```
src/
  controllers/auth-controller.ts, billing-controller.ts
  services/auth-service.ts, billing-service.ts
  repositories/user-repository.ts, invoice-repository.ts
  models/user.ts, invoice.ts
  middleware/auth-middleware.ts, logging-middleware.ts
```

Clear dependency direction: controllers depend on services, services on repositories, never reverse. Breaks down beyond ~20 files per directory — that signals the need for feature grouping.

### Framework-Specific Patterns

#### Next.js (App Router)

```
app/
  layout.tsx, page.tsx
  (auth)/login/page.tsx, signup/page.tsx    # route group (no URL segment)
  dashboard/layout.tsx, page.tsx, settings/page.tsx
  api/users/route.ts
src/features/, src/shared/
```

Conventions: `page.tsx` defines routes, `layout.tsx` for nested layouts, `loading.tsx` for suspense, `error.tsx` for error boundaries. Route groups `(name)` organize without URL impact. Server Components default — mark `'use client'` explicitly.

#### Express / Fastify

```
src/
  routes/auth.routes.ts, index.ts     # route definitions (thin)
  handlers/auth.handler.ts            # request/response logic
  services/, repositories/, models/, middleware/
  app.ts, server.ts
```

Separate routes from handlers. Routes define paths and middleware chains. Handlers contain logic and are independently testable.

#### FastAPI

```
src/app/
  routers/auth.py, billing.py
  services/, repositories/
  models/          # Pydantic schemas
  db/              # SQLAlchemy models
  core/config.py, security.py, dependencies.py
  main.py
```

Convention: `routers/` not `routes/`. Pydantic models for API schemas, separate ORM models for database. Dependency injection via `Depends()`.

#### Go

```
cmd/server/main.go, cli/main.go
internal/
  auth/handler.go, service.go, repository.go, handler_test.go
  billing/...
  platform/postgres/, redis/, http/
pkg/validate/, money/
```

Convention: `cmd/` for entry points, `internal/` for private code (compiler-enforced), `pkg/` for reusable libraries. Flat package structure preferred.

### Monorepo Patterns

Use a monorepo when packages share types/utilities, you need atomic cross-package changes, or packages are tightly coupled. Do not use when packages are independently deployable with no shared code.

```
packages/
  web/src/, package.json
  api/src/, package.json
  shared/src/, package.json
  config/eslint-base.js, tsconfig-base.json
package.json       # workspace configuration
turbo.json         # build orchestration
```

Packages import from `@myorg/shared`, never from relative paths across package boundaries. Workspace resolution handles local development.

### The Hybrid Pattern — Detailed Example

The hybrid approach is the most practical for medium-to-large applications. Features at the top, layers within:

```
src/
  features/
    auth/
      controller.ts      # HTTP handler / route handler
      service.ts          # Business logic
      repository.ts       # Data access
      model.ts            # Domain types
      service.test.ts     # Unit tests co-located
      controller.test.ts
    billing/
      controller.ts
      service.ts
      repository.ts
      model.ts
      ...
  shared/
    middleware/           # Cross-cutting: auth, logging, rate-limit
    utils/               # Truly shared utilities (2+ consumers)
    types/               # Shared type definitions
  config/                # Application configuration
  app.ts                 # Application bootstrap
  server.ts              # Server entry point
```

Each feature is self-contained. Adding a new feature means creating a new directory — no changes to existing features. Deleting a feature means removing one directory (plus cleanup of any shared references).

### Config File Placement

Config files live in the project root by universal convention: `package.json`, `tsconfig.json`, `eslint.config.js`, `pyproject.toml`, `go.mod`, `Makefile`, `Dockerfile`. Do not move them into a `config/` directory — tooling expects them at root. Application configuration (database URLs, feature flags) belongs in `src/config/`.

### Generated File Handling

Generated files (API clients, GraphQL types, migrations) need special treatment:
- **Dedicated directory**: `src/generated/` or `__generated__/` — clearly non-hand-edited
- **Linter exclusion**: `**/generated/**` excluded from lint configs
- **Regeneration command**: `make generate` documented in CLAUDE.md
- **Git decision**: Generated-from-committed-specs can be gitignored; generated-from-external-sources should be committed

### Entry Points and Barrel Files

**Entry points** (`main.ts`, `server.ts`, `index.ts` at project root, route files) are imported by the framework, not by other source files. Structure evals must exclude them from orphan detection.

**Barrel files** (`index.ts` in feature directories) re-export the feature's public API. Rules:
- One barrel per feature directory
- Only re-export what other features need — internal utilities stay unexported
- Never create barrel files in leaf directories (they add indirection without value)
- Avoid circular dependencies by keeping barrel imports one-directional (features import from shared, never reverse)

### Common Anti-Patterns

**God Directories**: `src/utils/` has 47 files, `src/components/` has 93. Fix: move utilities into their consuming features. Only genuinely shared items (3+ consumers) stay in `shared/`.

**Premature Abstraction into Shared**: Creating `shared/formatCurrency.ts` "because someone might need it later." Fix: enforce the 2+ consumer rule. Code enters `shared/` only when a second consumer actually needs it.

**Inconsistent Depth**: 5-level nesting next to 2-level nesting. Fix: define maximum nesting depth (3-4 levels from `src/`). Deep nesting signals a feature should be split.

**Orphaned Files**: Files not imported by anything and not entry points, accumulated during refactors. Fix: structure evals detect orphans in CI.

### Migration Between Structures

Moving from layer-based to feature-based (the most common migration):

1. Create feature directories alongside existing layers
2. Move one feature at a time — start with the most self-contained (fewest cross-feature dependencies)
3. Update imports as you move — no redirect files
4. Verify tests pass after each feature migration
5. Delete empty layer directories once all features extracted
6. Update `docs/project-structure.md`

Move one feature per PR. Each PR leaves the project working with passing tests. Five small PRs over a week is safer than one massive PR touching every file.

## See Also

- [system-architecture](../core/system-architecture.md) — Architecture manifests in file structure
