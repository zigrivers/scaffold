---
name: staging-environments
description: Per-worktree Docker staging environments with deterministic port allocation for parallel agents
summary: "Installs the agent-ops staging scripts and generates a compose file so every agent worktree gets its own isolated stack — deterministic ports derived from the worktree path, no collisions, orphan reaping, and a protected shared QA stack."
phase: "environment"
order: 315
dependencies: [dev-env-setup]
outputs: [.scaffold/agent-ops.yaml, ops/compose/staging.yml, ops/compose/staging.env.example]
conditional: "if-needed"
knowledge-base: [per-worktree-environments]
reads: [tech-stack]
---

## Purpose
Give every parallel agent worktree its own isolated Docker stack — databases,
caches, queues, and app services — so N agents can run `make staging-up`
simultaneously without colliding on ports or clobbering each other's data.
Ports are derived deterministically from the worktree's filesystem path (no
registry, no coordination), the primary checkout keeps a protected shared QA
stack on fixed ports, and orphaned stacks from removed worktrees are
reapable. This step writes the port-band config, installs the agent-ops
staging scripts, and generates the compose file that wires it together.

## Inputs
- docs/tech-stack.md (required) — which services (databases, queues, caches,
  app processes) run in Docker for local development
- docs/dev-setup.md (required) — existing dev ports and setup commands to
  avoid colliding with, and to source into `worktree_setup_commands`
- .scaffold/agent-ops-version (read-only) — presence signals the agent-ops
  bundle is already installed; absence means this step installs it fresh

## Expected Outputs
- .scaffold/agent-ops.yaml — port-band config (see shape below)
- ops/compose/staging.yml — one compose service per configured service,
  ports and network driven by the exported `staging-env.sh` variables
- ops/compose/staging.env.example — installed by the agent-ops bundle;
  documents non-derived, port-bearing values (CORS origins, callback URLs)
- docs/dev-setup.md — gains a "Per-worktree staging" section
- scripts/ops/ — staging-env.sh, staging-teardown.sh, docker-env.sh,
  docker-doctor.sh, tc-reap.sh (installed by the agent-ops CLI, not authored
  here)

### Conditional check
This step applies only when docs/tech-stack.md declares containerized
services — databases, queues, caches, or app processes run via Docker for
local development. If tech-stack.md declares none, skip the step rather than
generating an empty config:
```
scaffold skip staging-environments --reason "no containerized services"
```

### Write `.scaffold/agent-ops.yaml`
Enumerate every containerized service from docs/tech-stack.md and assign
port bands **in order starting at 20000**, grouping data stores first
(postgres, mysql, mongo), then caches (redis), then message brokers, then
application services — each service gets the next 1000-wide band. Pick fixed
`shared_stack` ports for the primary-checkout QA stack that do not collide
with the project's existing dev-server ports from docs/dev-setup.md. Carry
over the install commands already documented for a fresh worktree (dependency
install, migrations) into `worktree_setup_commands`. Exact shape:

```yaml
project_name: myapp            # compose project + identity domain token
critical_labels: []            # work-beads ranking tier 2 (e.g. [auth, payments]); empty by default
worktree_setup_commands: []    # run inside a fresh worktree, e.g. ["npm ci", "uv sync"]
docker:
  context: orbstack            # engine pin; "default" off-macOS
  services:                    # order assigns port bands: 20000, 21000, ...
    - name: postgres
      band: 20000
    - name: api
      band: 21000
  shared_stack:                # fixed ports for the primary-checkout QA stack
    postgres: 55432
    api: 8001
```

### Run the installer
With the config written, install the staging script bundle and confirm it
landed clean:
```
scaffold agent-ops install --component staging
scaffold agent-ops check
```
The installer refuses to overwrite locally modified files without `--force`
— never pass `--force` in generation mode; a locally modified script means a
prior run already customized it.

### Generate `ops/compose/staging.yml`
One service per `docker.services` entry (plus any `shared_stack`-only
services). Every `ports:` mapping uses the variable `staging-env.sh` exports
for that service, never a literal port — e.g. `"${PORT_POSTGRES}:5432"` for
a service named `postgres`. Set the compose network to `${STAGING_SUBNET}`
when non-empty (per-worktree stacks get an isolated `/16`); omit a custom
network block when `STAGING_SUBNET` is empty (the shared stack keeps
compose's conventional default network). Every data-store service
(postgres, mysql, mongo, redis) gets a `healthcheck:` — app services wait on
`condition: service_healthy` rather than a fixed sleep.

### Create the local staging env file
The installer ships only `ops/compose/staging.env.example` (tracked). Create the
git-ignored, machine-local `ops/compose/staging.env` from it during setup so the
non-derived, port-bearing values (CORS origins, callback URLs) exist for
`make staging-up`:
```
cp ops/compose/staging.env.example ops/compose/staging.env   # then edit as needed
```
`make staging-up`/`staging-down` add `--env-file ops/compose/staging.env` only
when that file exists, so a fresh clone that hasn't created it yet still comes up
(just without the extra overrides). Add `ops/compose/staging.env` to `.gitignore`
— never commit it.

### Document
Append a "Per-worktree staging" section to docs/dev-setup.md covering: the
Docker engine pin (`docker-env.sh` — `orbstack` on macOS, `default`
elsewhere); creating the git-ignored `ops/compose/staging.env` from
`staging.env.example` before first use; `make staging-up` runs **from a worktree
only**, never from the primary checkout; `make staging-down` from the worktree
before you merge (never from the primary — there it targets the shared QA
stack); `make staging-prune` / the `--reap` flag on staging-teardown.sh for
orphaned stacks whose worktree no longer exists; `make docker-doctor` for engine
split-brain and port contention; `make tc-reap` for leaked testcontainers;
and the standing rule that agents must never run `docker system prune` (it
takes down every other agent's stack, not just their own).

## Quality Criteria
- (mvp) Not applicable — mvp preset disables this step by default (see
  Methodology Scaling); when enabled via override, the mvp bar is: config
  validates and `staging-up`/`staging-down` round-trip green
- (deep) `.scaffold/agent-ops.yaml` validates via `scaffold agent-ops check`
  with no drift warnings
- (deep) `make staging-up` followed by `make staging-down` round-trips clean
  in a worktree (containers start healthy, stop, no leftover volumes)
- (deep) The shared QA stack is unreachable from a worktree — selecting it
  outside the primary checkout fails loudly, per staging-env.sh's guard
- (deep) Every data-store service in ops/compose/staging.yml has a
  healthcheck; no service hardcodes a port instead of using the exported
  `PORT_<SERVICE>` variable
- (deep) docs/dev-setup.md contains the "Per-worktree staging" section with
  the never-`docker system prune` rule stated explicitly
- (deep) Port bands in .scaffold/agent-ops.yaml are unique, start at 20000,
  and are ordered stores-then-caches-then-app-services

## Methodology Scaling
- **deep**: Full staging component — config, installer, compose file with
  healthchecks for every store, orphan-reap documentation, and the complete
  "Per-worktree staging" section in docs/dev-setup.md.
- **mvp**: Not applicable — disabled by default in the mvp preset (see the
  Conditional Evaluation section); a project that needs it can enable the
  step explicitly, at which point the deep-level bar applies.
- **custom:depth(1-5)**:
  - Depth 1: config with services and bands only; skip compose generation
    (installer output alone is enough to unblock a single agent).
  - Depth 2: add compose file generation with basic port wiring, no
    healthchecks.
  - Depth 3: add healthchecks for data-store services and the shared-stack
    guard verification.
  - Depth 4: add the docs/dev-setup.md "Per-worktree staging" section and
    orphan-reap (`tc-reap`, `staging-prune`) documentation.
  - Depth 5: full suite with docker-doctor contention guidance and
    engine-pin documentation for Mac/Linux parity.

## Conditional Evaluation
Enable when: docs/tech-stack.md declares one or more containerized services
— a database, cache, message queue, or app process intended to run via
Docker for local development. Detection signals: Postgres/MySQL/MongoDB/
Redis/RabbitMQ/Kafka named as the local datastore, or an explicit "runs in
Docker" note in tech-stack.md. Skip when: the project has no local
containerized services (e.g., a serverless-only backend, a static site, or a
project whose only dependency is a hosted managed database reached over the
network) — run `scaffold skip staging-environments --reason "no containerized
services"` rather than generating an empty config.

## Mode Detection
Update mode if .scaffold/agent-ops.yaml or ops/compose/staging.yml already
exists. In update mode: reconcile the service list against the current
docs/tech-stack.md (add newly declared services with the next free band,
never renumber existing bands), re-run the installer to pick up bundle
updates, and never clobber local script modifications in scripts/ops/.

## Update Mode Specifics
- **Detect prior artifact**: .scaffold/agent-ops.yaml exists, or
  ops/compose/staging.yml exists
- **Preserve**: existing service-to-band assignments, `shared_stack` port
  choices, `worktree_setup_commands`, `critical_labels`, and any local
  modifications under scripts/ops/ (the installer already refuses to
  overwrite these without `--force` — do not pass it)
- **Triggers for update**: tech-stack.md declares a new containerized
  service, dev-setup.md's dev ports changed (risk of collision with
  `shared_stack`), or `scaffold agent-ops check` reports a stale bundle
  version
- **Conflict resolution**: a new service always gets the next unused band
  (existing bands never shift); if a new service's healthcheck or port
  mapping conflicts with a locally-modified compose file, surface the
  conflict and let the user reconcile rather than overwriting their edit
