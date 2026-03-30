---
description: "Create a guide for developers (human or AI) joining the project"
long-description: "Synthesizes all frozen docs into a single onboarding narrative — project purpose, architecture overview, top coding patterns, key commands, and a quick-start checklist — so anyone joining the project knows exactly where to begin."
---

## Purpose
Create a comprehensive onboarding guide that gives any developer (human or AI
agent) everything they need to understand the project and start contributing.
This is the "start here" document. It synthesizes information from all frozen
artifacts into a single coherent narrative that new contributors can read
before their first task.

## Inputs
- All frozen phase artifacts

## Expected Outputs
- docs/onboarding-guide.md — developer onboarding guide

## Quality Criteria
- (mvp) Contains sections for: project purpose, architecture overview (with component diagram reference), top 3 coding patterns with examples, and a file/doc lookup table
- (mvp) Guide includes: clone instructions, dependency install command, dev server start command, and test run command
- (deep) Every ADR referenced by number with one-sentence summary
- (deep) Key architectural decisions are summarized (with pointers to ADRs)
- (mvp) Development workflow section documents: branch creation command, commit message format, test command, and PR creation command
- (mvp) Guide explicitly states relationship to implementation-playbook: what the guide covers vs what the playbook covers

## Methodology Scaling
- **deep**: Comprehensive guide. Architecture walkthrough, key pattern explanations,
  common tasks with examples, troubleshooting section.
- **mvp**: Quick-start guide with: clone command, dependency install, dev server
  start, test run command. Skip architecture overview, key patterns, and
  troubleshooting sections.
- **custom:depth(1-5)**: Depth 1: clone command and dependency install only. Depth 2: quick start with setup, dev server start, and test run commands. Depth 3: add architecture overview, key patterns, and common tasks. Depth 4: add troubleshooting section, entry points documentation, and development workflow detail. Depth 5: full guide with architecture walkthrough, decision rationale, and team-specific onboarding paths.

## Mode Detection
Check if `docs/onboarding-guide.md` already exists.
- If exists: UPDATE MODE — read current guide, diff against upstream docs for changes, propose targeted updates while preserving project-specific customizations and environment-specific instructions.
- If not: FRESH MODE — generate from scratch using all pipeline artifacts.

## Update Mode Specifics

- **Detect**: `docs/onboarding-guide.md` exists with tracking comment
- **Preserve**: Team-specific customizations, troubleshooting entries added from experience, getting-started verification results
- **Triggers**: Architecture changes, new tooling, new patterns established
- **Conflict resolution**: Merge new sections with existing customizations; never remove team-contributed troubleshooting entries

---

## Domain Knowledge

### developer-onboarding

*What an effective onboarding guide covers — repo setup, architecture overview, key patterns*

# Developer Onboarding

A developer onboarding guide is the first document a new developer (human or AI agent) reads when joining the project. Its purpose is to take someone from "I just cloned the repo" to "I can find things, understand the architecture, and start contributing" in the shortest possible time.

This document covers what an effective onboarding guide should contain, how to structure it, and what to avoid.

## Summary

## Guide Structure

The onboarding guide follows a deliberate progression from purpose to productivity:

1. **Purpose** — What this project does and why it exists.
2. **Architecture Overview** — How the system is structured at a high level.
3. **Key Patterns** — The recurring patterns a developer must understand.
4. **Getting Started** — How to set up and run the project locally.
5. **Common Tasks** — Step-by-step guides for frequent activities.
6. **Where to Find Things** — A map of the codebase and key files.
7. **Troubleshooting** — Known issues and their solutions.

Each section serves a distinct purpose. Do not merge them or skip any.

## 1. Purpose

### What to Include

A concise explanation (3-5 sentences) answering:
- What problem does this project solve?
- Who are the users?
- What is the core value proposition?

This is not the full PRD — it is the elevator pitch. A developer who reads this section should understand why the project exists and what matters.

### Example

```markdown
## Purpose

InvoiceFlow aggregates invoices from multiple payment processors (Stripe,
PayPal, Square) into a single reconciliation dashboard for small business
owners. The primary pain point is manual data entry — users currently spend
6+ hours per week reconciling invoices across platforms. Our solution pulls
data automatically and highlights discrepancies for review.
```

### What NOT to Include

- Marketing language ("revolutionary," "best-in-class")
- Full feature lists (that is the PRD)
- Business metrics or revenue goals (irrelevant to contributors)
- History of the project (unless it explains current technical decisions)

## Deep Guidance

## 2. Architecture Overview

### What to Include

A high-level diagram (described in text or ASCII art) showing the major components and how they interact. The goal is mental model, not complete specification.

**Cover:**
- **Component inventory** — What are the 3-7 major components? (API server, database, frontend, background workers, external services)
- **Communication patterns** — How do components talk to each other? (HTTP REST, WebSocket, message queue, shared database)
- **Data flow** — Where does data enter the system, how does it flow, where does it get stored?
- **External dependencies** — What third-party services does the project use? (Payment processors, email services, cloud storage)
- **Key architectural decisions** — Summarize the 3-5 most important ADRs with one sentence each. Link to the full ADRs for detail.

### Example

```markdown
## Architecture Overview

InvoiceFlow is a monolithic TypeScript application with three layers:

- **API Layer** (Express.js) — REST endpoints for frontend and webhook
  receivers for payment processors.
- **Service Layer** — Business logic for invoice reconciliation, matching,
  and discrepancy detection.
- **Data Layer** (PostgreSQL via Prisma) — Invoice records, user accounts,
  reconciliation results.

Background jobs (BullMQ + Redis) handle payment processor data sync on
a configurable schedule (default: every 15 minutes).

The frontend is a React SPA served by the same Express server in production.

Key decisions:
- Monolith over microservices (ADR-001): Simpler operations for small team
- PostgreSQL over MongoDB (ADR-003): Strong consistency for financial data
- Server-side reconciliation (ADR-007): Heavy matching runs as background
  jobs, not in the API request path
```

### Architecture Narrative Style

Use a narrative walkthrough rather than a dry specification. Walk through a single user request end-to-end:

"When a user opens the reconciliation dashboard, the React frontend calls `GET /api/reconciliations?status=pending`. The API layer validates the JWT token, calls `ReconciliationService.getPending(userId)`, which queries PostgreSQL for reconciliations with status 'pending' joined to their invoice line items. The response is serialized and returned as JSON."

This narrative style gives developers an immediate mental model they can generalize from.

## 3. Key Patterns

### What to Include

Document the 5-10 patterns that repeat throughout the codebase. A developer who understands these patterns can read any part of the codebase.

**Common patterns to document:**

**Error handling pattern:**
- How are errors represented? (Custom error classes? Error codes? Result types?)
- How do errors propagate? (Thrown exceptions? Returned errors? Global handler?)
- Where are errors logged? What format?
- How are errors returned to clients? (Error response shape, HTTP status code mapping)

**Request lifecycle pattern:**
- What happens from HTTP request to response?
- Middleware order (auth, validation, rate limiting, logging)
- How request validation works
- How response serialization works

**Database access pattern:**
- ORM or query builder usage patterns
- Transaction management
- How to write migrations
- How repositories are structured

**Testing pattern:**
- Test file naming and location
- Test structure (describe/it, arrange/act/assert)
- What to mock and what to test with real dependencies
- How to set up test data (fixtures, factories, seeding)

**Authentication pattern:**
- How auth tokens work
- How to protect an endpoint
- How to get the current user in a handler

### Example

```markdown
## Key Patterns

### Error Handling
All business errors extend `AppError` (src/errors/app-error.ts). Throw
errors from services; the global error handler (src/middleware/error-handler.ts)
catches and serializes them.

Throw: `throw new NotFoundError('Invoice', invoiceId)`
Client sees: `{ "error": { "code": "NOT_FOUND", "message": "Invoice abc123 not found" } }`

### Database Access
Use Prisma Client. All queries go through repository classes in
src/repositories/. Never call Prisma directly from services or handlers.

Creating a new query: add a method to the repository, write a test that
uses the test database.
```

## 4. Getting Started

### Requirements

This section must be **copy-paste executable**. A developer should be able to follow it literally, command by command, and end up with a running system.

**Include:**
- Prerequisites (with specific versions)
- Clone/install commands
- Environment configuration (what .env vars are needed, how to get them)
- Database setup (migrations, seed data)
- How to start the development server
- How to verify everything works (a specific URL to visit or command to run)

### Example

```markdown
## Getting Started

### Prerequisites
- Node.js 20+ (`node --version` to check)
- PostgreSQL 16+ (running locally on default port 5432)
- Redis 7+ (running locally on default port 6379)

### Setup
git clone git@github.com:org/invoiceflow.git
cd invoiceflow
cp .env.example .env        # Edit .env with your database credentials
npm install
npm run db:migrate           # Create database tables
npm run db:seed              # Load sample data for development
npm run dev                  # Start development server

### Verify
Open http://localhost:3000 in your browser. You should see the login page.
Log in with: demo@example.com / password123 (from seed data).
```

### Common Pitfalls

- **Assumed dependencies** — Do not assume `brew`, `nvm`, `docker` are installed. List prerequisites explicitly.
- **Missing env vars** — Provide a `.env.example` file. List every required variable with a description.
- **Platform differences** — If setup differs between macOS and Linux, say so.
- **Seed data** — Always provide seed data for development. Developers cannot use the app with an empty database.
- **Verification step** — Always end with "how to know it worked." Without this, developers do not know if a silent startup is success or failure.

## 5. Common Tasks

### What to Include

Step-by-step guides for the tasks a developer does repeatedly:

**Adding a feature:**
1. Where to create new files (directory conventions)
2. What files to modify (routes, services, repositories)
3. How to add database migrations
4. How to add tests
5. How to verify the feature works

**Fixing a bug:**
1. How to reproduce (test setup)
2. Where to look first (logs, error handlers)
3. How to add a regression test
4. How to submit the fix

**Running tests:**
1. Full test suite command
2. Single test file command
3. Watch mode command
4. How to run only unit / integration / E2E tests

**Creating a PR:**
1. Branch naming convention
2. Commit message format
3. What checks must pass
4. How to request review
5. Merge process (squash, rebase, merge commit)

**Deploying:**
1. How deployments are triggered
2. How to monitor a deployment
3. How to roll back

### Format

Each task should follow a consistent format:

```markdown
### Adding a New API Endpoint

1. Create route handler in `src/handlers/<resource>.handler.ts`
2. Add route to `src/routes/<resource>.routes.ts`
3. Create or update service in `src/services/<resource>.service.ts`
4. Create or update repository in `src/repositories/<resource>.repository.ts`
5. Add migration if schema changes: `npm run db:migrate:create <name>`
6. Add handler test: `src/handlers/__tests__/<resource>.handler.test.ts`
7. Add service test: `src/services/__tests__/<resource>.service.test.ts`
8. Run tests: `npm test`
9. Start dev server and test manually: `npm run dev`
```

## 6. Where to Find Things

### What to Include

A directory map showing what lives where:

```markdown
## Where to Find Things

src/
  handlers/           # HTTP request handlers (one per resource)
  services/           # Business logic (one per domain concept)
  repositories/       # Database access (one per entity)
  middleware/          # Express middleware (auth, validation, errors)
  models/             # TypeScript types and interfaces
  errors/             # Custom error classes
  utils/              # Shared utility functions
  config/             # Configuration loading and validation
  jobs/               # Background job definitions (BullMQ)
prisma/
  schema.prisma       # Database schema
  migrations/         # Migration files (auto-generated)
  seed.ts             # Development seed data
tests/
  integration/        # Tests that use real database
  e2e/                # End-to-end tests (Playwright)
  fixtures/           # Shared test data
```

Also document key files specifically:

```markdown
### Key Files
- `.env.example` — All environment variables with descriptions
- `src/config/index.ts` — Configuration loading, validation, and defaults
- `src/middleware/error-handler.ts` — Global error handler (how errors become HTTP responses)
- `src/middleware/auth.ts` — Authentication middleware (JWT validation)
- `prisma/schema.prisma` — Database schema (source of truth for data model)
```

### Entry Points

Tell developers where execution starts:

```markdown
### Entry Points
- `src/server.ts` — Application startup (Express initialization, middleware registration, route mounting)
- `src/jobs/worker.ts` — Background job worker startup
- `prisma/seed.ts` — Seed data script
```

## 7. Troubleshooting

### What to Include

Known issues, common mistakes, and their solutions:

```markdown
## Troubleshooting

### "Connection refused" on startup
PostgreSQL is not running. Start it: `brew services start postgresql@16`

### Tests fail with "relation does not exist"
Test database needs migrations. Run: `npm run db:migrate:test`

### "JWT_SECRET must be defined" error
Missing .env file. Copy from example: `cp .env.example .env`

### Hot reload not working
Kill stale processes: `lsof -ti:3000 | xargs kill -9`
Then restart: `npm run dev`
```

List the top 5-10 issues that new developers encounter. If you do not know them yet, add them as they are reported.

## What to Avoid

### Do Not Write a Tutorial

The onboarding guide is not a tutorial about the technology stack. Do not explain what React is or how Express middleware works. Assume developers know the stack; teach them the PROJECT.

### Do Not Duplicate Specifications

The onboarding guide summarizes architecture — it does not reproduce the architecture document. Use links ("See docs/system-architecture.md for the full component design").

### Do Not Include Aspirational Content

Document what the project IS, not what it WILL BE. Planned features, future migrations, and "we should really" items belong in the backlog, not the onboarding guide.

### Do Not Make It a Policy Document

Coding standards, PR review policies, and team processes belong in their respective documents (implementation playbook, git workflow). The onboarding guide links to them but does not contain them.

## Onboarding Guide Quality Criteria

A good onboarding guide passes the "cold start test": give it to someone who has never seen the project, provide no additional help, and they should be able to:

1. Understand what the project does (within 2 minutes)
2. Have a mental model of the architecture (within 5 minutes)
3. Have a running dev environment (within 15 minutes)
4. Know where to find a specific piece of code (within 1 minute of looking)
5. Complete their first simple task (within 30 minutes)

If any of these fail, the guide has a gap.

## Keeping the Guide Current

The onboarding guide is a living document. It must be updated when:
- A new key dependency is added
- The project structure changes significantly
- The setup process changes (new env vars, new services, new tools)
- A troubleshooting scenario is reported more than once
- An architectural decision changes the mental model

---

## After This Step

Continue with: `/scaffold:implementation-playbook`
