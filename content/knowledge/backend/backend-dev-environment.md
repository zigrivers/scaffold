---
name: backend-dev-environment
description: Docker Compose for local databases and queues, database seeding and migration scripts, API testing tools, environment variable management, and local SSL setup
topics: [backend, dev-environment, docker, migrations, testing, environment-variables]
---

A backend development environment that requires manual setup steps is a productivity drain and an onboarding failure. The standard should be: clone the repo, run one command, and have a fully functional local environment in under five minutes. Docker Compose is the primary tool for achieving this — it pins the exact versions of every external dependency and makes the environment reproducible across all developer machines.

## Summary

### Docker Compose for Infrastructure

Use Docker Compose to run all stateful infrastructure dependencies locally:

- **Databases**: Pin the exact version that matches production. `postgres:16.2-alpine`, not `postgres:latest`. Version drift between local and production is a common source of query behavior differences.
- **Cache / message queues**: Redis, RabbitMQ, Kafka, or SQS-compatible LocalStack — all run well in Compose. Define realistic resource limits to catch memory pressure issues locally.
- **Health checks**: Add `healthcheck` to each service so `docker compose up --wait` blocks until the database is actually accepting connections, not just when the container starts.
- **Named volumes**: Use named volumes (not bind mounts) for database data. This prevents accidental data loss when rebuilding containers.

A `compose.yml` at the repo root is the convention. A `compose.override.yml` (gitignored) allows developer-specific customizations without touching the shared file.

### Database Migrations

Migrations are the source of truth for schema evolution. Never modify the database directly in development or production:

- **Migration tool selection**: Flyway (Java, SQL-based), Liquibase (XML/YAML/SQL), Alembic (Python), golang-migrate, Prisma Migrate, or Knex — choose one and commit to it.
- **Up/down migrations**: Every migration needs a reversible `down` script. Test the down migration in CI — it is the escape hatch for a bad deployment.
- **Naming convention**: `V20240115__add_order_status_index.sql` — timestamp prefix ensures ordering is deterministic across branches.
- **Run on startup**: In development, configure the app to run pending migrations automatically on startup. In production, run migrations as a pre-deployment step before traffic shifts.

### Database Seeding

Seed scripts provide a consistent baseline dataset for development and testing:

- **Seed data separate from migrations**: Never embed seed data in migration files. Migrations are schema changes; seed scripts populate data for local development.
- **Idempotent seeds**: Seed scripts must be safe to run multiple times. Use `INSERT ... ON CONFLICT DO NOTHING` or check for existence before inserting.
- **Representative data**: Seed data should cover edge cases — empty states, boundary values, long strings — not just happy-path records.
- **`npm run db:seed` or `make seed`**: One command to seed the database from a fresh state.

### API Testing Tools

Maintain machine-readable API test artifacts in the repository:

- **Postman / Bruno collections**: Commit a `postman_collection.json` or `bruno/` directory with requests for every endpoint. Parameterize base URLs and auth tokens via environment files. Bruno is preferred for new projects — it uses plain-text files that diff well in git.
- **curl scripts**: A `scripts/api/` directory with shell scripts exercising each endpoint is a low-overhead alternative. Always useful for CI health checks.
- **REST Client files**: `.http` files (VS Code REST Client extension) are readable and committable. Good for simple endpoint documentation.

### Environment Variable Management

- **`.env.example`**: Committed to the repo. Contains all required variable names with placeholder values and comments explaining each. New developers copy this to `.env`.
- **`.env`**: Gitignored. Developer-specific values. Never committed.
- **Validation at startup**: Parse and validate the entire env config with a schema (Zod + `z.string().url()`, envalid) before the server starts. Fail with a clear error listing missing variables, not a cryptic runtime crash 30 minutes later.
- **Secrets vs config**: Secrets (database passwords, private keys) are fetched from a secrets manager in production environments. Config (feature flags, timeouts) can be env vars.

### Local SSL

For services that require HTTPS locally (OAuth redirects, secure cookies, mixed-content testing):

- **mkcert**: Generates locally trusted TLS certificates signed by a local CA. `mkcert localhost 127.0.0.1` produces a certificate that browsers trust without warnings.
- **Caddy reverse proxy**: Configure Caddy as a local reverse proxy with automatic HTTPS to avoid configuring TLS in the app itself.

## Deep Guidance

### One-Command Setup

The `make setup` or `./scripts/dev-setup.sh` target should: install required tool versions (via asdf or mise), pull Docker images, copy `.env.example` to `.env`, start Compose services, run migrations, and run seed scripts. A developer who has never seen the project should be running a working API in under five minutes.

Document any manual steps that cannot be automated (hardware keys, corporate VPN certificates) in a `docs/dev-setup.md`. Every manual step is a future support ticket.
