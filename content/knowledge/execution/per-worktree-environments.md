---
name: per-worktree-environments
description: Deterministic per-worktree Docker staging environments for parallel-agent development — port-band allocation, a protected shared QA stack, and orphan reaping
topics: [dev-environment, docker, worktrees, staging, ports, multi-agent]
volatility: evolving
last-reviewed: null
version-pin: null
sources: []
---

# Per-Worktree Environments

When N agents work in parallel git worktrees (see
[worktree-management](./worktree-management.md)), each one
eventually needs to run the project's containerized services — a database,
a cache, a queue, the app itself — to exercise real behavior instead of
mocks. If every worktree reaches for the same `docker-compose up`, they
collide on ports, share (and corrupt) the same database, and one agent's
`docker system prune` takes down every other agent's stack. Per-worktree
staging environments solve this with deterministic, collision-free port and
network allocation derived purely from the worktree's filesystem path — no
registry, no locking, no coordination between agents required.

## Summary

### The Collision Problem
A single shared `docker-compose.yml` with hardcoded ports (`5432:5432`)
works for one developer. It breaks the moment two agents try to bring up
the stack at once: the second `docker compose up` fails on "port already
allocated," or worse, silently reuses the first agent's containers and both
agents now read and write the same database.

### Deterministic Port Derivation
Each worktree computes an integer offset from a checksum of its own
absolute path — `O = (cksum(worktree_path) % 254) + 1`, always in `1..254`.
Every service gets a 1000-wide port band (assigned in config, starting at
20000); the worktree's host port for that service is `band + O`. Two
worktrees only collide if their paths checksum to the same offset, which is
rare enough in practice and has an escape hatch (`STAGING_WT_OFFSET`) for
the case where it happens. The private subnet (`10.<O>.0.0/16`) uses the
same reduced offset, but the compose project name does not — it embeds the
raw, unreduced checksum (`<project>-wt-<cksum>`), so container, network,
and volume names stay distinct across worktrees even in the rare case where
two paths reduce to the same offset.

### The Shared QA Stack
The primary checkout (not a worktree) gets a separate, fixed-port stack
under the project's own compose project name — a stable target for manual
QA, demos, or a smoke-test job that doesn't want ports to move between
runs. Selecting the shared stack from inside a worktree is a guarded error,
not a footgun: nothing should point real worktree traffic at the one stack
every other agent might also be poking at.

### Lifecycle and Hygiene
Staging stacks are meant to be short-lived: `make staging-up` at the start
of a work session, `make staging-down` at the end. Agents that crash or get
their worktree removed without tearing down leave orphaned `-wt-*` stacks
behind; a reap pass (age- and label-scoped) cleans those up without
touching any stack whose worktree still exists. The one rule that protects
everyone: never run `docker system prune` — it does not know about other
agents' stacks and takes all of them down.

## Deep Guidance

### Config shape
The pattern is driven by one small YAML file, `.scaffold/agent-ops.yaml`,
that enumerates services and assigns port bands in the order data stores,
then caches, then app services are declared:

```yaml
project_name: myapp
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

A generated `scripts/ops/staging-env.sh` reads this config (baked in at
install time as generated bash variables, not parsed at runtime) and, when
sourced, exports `PORT_<SERVICE>` for every configured service plus
`COMPOSE_PROJECT_NAME` and `STAGING_SUBNET`. A compose file then references
only those variables — never a literal port — so the same
`ops/compose/staging.yml` works unmodified from any worktree or from the
primary checkout.

### The offset algorithm, precisely
1. Resolve the worktree's repo root (`git rev-parse --show-toplevel`).
2. Checksum that absolute path (`cksum`), take it modulo 254, add 1 — this
   keeps the offset in `1..254`, leaving `.0.0/16` and `.255.0/16` free.
3. If the invoking script is running from the primary checkout (or a caller
   explicitly selects the project's own compose project name), skip the
   offset entirely and export the fixed `shared_stack` ports instead —
   guarded so this path can only be taken from the primary checkout.
4. Otherwise, for each configured service, export
   `PORT_<SERVICE> = band + offset` and set the subnet to
   `10.<offset>.0.0/16`.

### Compose wiring
Every `ports:` entry uses the exported variable form —
`"${PORT_POSTGRES}:5432"` — and the network block is conditional on
`STAGING_SUBNET` being non-empty (the shared stack keeps compose's default
network rather than a synthesized one). Data-store services need a
`healthcheck:`; app services that depend on them wait on
`condition: service_healthy` instead of a fixed sleep, so `make staging-up`
is safe to treat as synchronous.

### Teardown, reap, and engine contention
A companion teardown script tears down only the caller's own stack by
default; a `--reap` mode additionally sweeps every `-wt-*` compose project
whose originating worktree directory no longer exists, leaving live
siblings and the shared stack untouched. A separate engine-pin script fixes
which Docker context (e.g. OrbStack vs. the default context) the project
uses, and a doctor script surfaces "split-brain" — containers running on a
different engine than the one currently active — which is the most common
cause of "my stack won't come up" reports. Leaked ephemeral containers from
testcontainers-style test runs get their own age- and label-scoped reap
pass, separate from the compose-level one.

### Integration with the parallel-agent loop
In a multi-agent workflow, `make staging-up` is one of the first things a
freshly created worktree does before build/test work starts, and
`make staging-down` is one of the last things that happens before the
worktree's branch is merged and the worktree torn down. A red `make check`
caused by Docker contention (not a real test failure) is diagnosed with the
doctor script, cleaned up with the reap targets, and re-run in isolation —
never treated as a merge-blocking test failure and never "fixed" with
`docker system prune`.

---
*Initial pass authored alongside the `staging-environments` pipeline step
(2026 nibble-agent-workflow-port design). Scheduled for a follow-up
expansion pass that broadens coverage beyond the Docker-specific mechanics
documented here.*

## See Also
- [worktree-management](./worktree-management.md) — the git
  worktree isolation this pattern is layered on top of
- [dev-environment](../core/dev-environment.md) — general local dev
  environment patterns (Makefile, .env, live reload) this specializes for
  the multi-agent case
