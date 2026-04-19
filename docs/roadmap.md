# Scaffold Roadmap

Working document tracking completed work, in-progress items, and future directions. Updated as work progresses.

---

## Completed Releases

### v3.17.0 (2026-04-19)

Multi-service monorepo support — 5 waves landing together.

- **Wave 1: Domain Knowledge** (PR #277) — backend fintech sub-overlay (8 knowledge docs, `BackendConfig.domain: 'none' | 'fintech'`)
- **Wave 2: Cross-Service Pipeline** (PR #279) — structural multi-service overlay, 5 cross-service steps, 8 knowledge docs, `PipelineOverlay` / `loadStructuralOverlay()`
- **Wave 3a: Service Manifest** (PR #278) — `ServiceSchema`, `scaffold init --from`, `ScaffoldUserError` taxonomy, wizard seam split
- **Wave 3b: Service-Qualified Execution** (PR #280) — `--service` flag on all stateful commands, per-service state sharding, v2→v3 migration, parallel-ready locking
- **Wave 3c: Cross-Service References** (PR #282) — `exports` allowlist, `cross-reads` frontmatter, `StateManager.loadStateReadOnly`, transitive resolver with DFS/memo/cache/tool-guard, `crossDependencies` on `DependencyNode`, readiness display in `next`/`status` (text + JSON)

### v3.16.0 (2026-04-13)

- **MMR CLI v1.1.0** — Multi-Model Review overhaul with `mmr reconcile`, 4-channel flow, verdict system
- **Wave 0 (Security)** — artifact path containment via `resolveContainedArtifactPath()` across all 5 artifact sites

---

## Near-Term Enhancements

### Multi-Service Dashboard (deferred from Wave 3b)

The `scaffold dashboard` command with `--service` shows a single service's view. A full multi-service dashboard showing all services in one HTML page requires:

- `src/dashboard/generator.ts` updated to accept multiple `PipelineState` objects
- Service tabs or sections in the HTML layout
- Aggregate progress indicators (e.g., "3/5 services complete through Phase 7")
- Cross-service dependency visualization

**Scope**: ~100-150 lines across 3-4 files. Small standalone feature.

### Overlay `crossReads` Overrides (deferred from Wave 3c)

Currently cross-reads are defined only in frontmatter (step templates). Projects with heterogeneous service relationships may need service-specific cross-reads that can't be captured in a global template.

Addition to `PipelineOverlay`:
```yaml
cross-reads-overrides:
  system-architecture:
    append:
      - service: billing
        step: api-contracts
```

**Scope**: ~50-80 lines. Extends existing overlay override pattern.

### Brownfield `adopt` for Multi-Service Monorepos

`scaffold adopt` currently detects a single project type. Multi-service adoption would:

- Detect multiple services in a monorepo (e.g., separate `package.json` in subdirectories)
- Create `services[]` config with detected types
- Initialize v3 state layout directly

**Scope**: Design needed. Medium complexity (~200-300 lines).

### Multi-Domain Stacking

Currently each project type supports one domain (e.g., `backend` + `fintech`). Multi-domain would allow:
```yaml
backendConfig:
  domain: ['fintech', 'healthcare']
```

Requires overlay conflict resolution for knowledge injection when multiple domains overlap.

**Scope**: Design needed. Depends on Wave 2 overlay conflict resolution.

---

## Phase 2 Features

These are features reserved in the current state schema but not yet implemented.

### Custom Steps (`extra-steps`)

The `PipelineState` interface has `'extra-steps': ExtraStepEntry[]` (always `[]` in Phase 1). Phase 2 enables:

- User-defined pipeline steps added via CLI: `scaffold step add --name my-step --after tech-stack`
- Custom steps stored in `extra-steps` array with `slug`, `path`, `depends-on`, `phase`
- Custom step content in `.scaffold/custom-steps/my-step.md`
- Integration with dependency graph, `next`, `status`, and `run`

**Scope**: Design needed. Medium-large (~300-400 lines).

### Eligible Step Caching (`next_eligible`)

The `PipelineState` interface has `next_eligible: string[]` (always `[]` in Phase 1). Phase 2 enables:

- `saveState()` computes and caches eligible steps on every state change
- `scaffold next` reads from cache instead of recomputing
- Invalidated on step completion, skip, or pipeline reconciliation

**Scope**: Small (~50-80 lines). Most infrastructure already in place.

### Plugin System

From the v2 PRD Phase 2:

- Claude Code adapter improvements (thin command wrapper generation)
- Codex adapter (AGENTS.md generation from pipeline state)
- Universal adapter (stdout/file output for CI)

**Scope**: Design needed. Large.

---

## Content & Quality

### New Project Type Overlays

The overlay system supports any project type. Potential additions:

- **IoT/Embedded** — firmware lifecycle, OTA updates, device provisioning
- **Blockchain/Web3** — smart contract lifecycle, gas optimization, audit workflows
- **Data Science/Analytics** — notebook workflows, data pipeline integration

Each requires: 1 overlay YAML + ~10 knowledge documents + ~10-20 pipeline steps + preset registration.

### Knowledge Document Expansion

Current knowledge coverage by category:

| Category | Count | Status |
|----------|-------|--------|
| Core | 27 | Complete |
| Game | 15 | Complete |
| Research | 6 | Complete |
| Backend (fintech) | 8 | Complete |
| Multi-service | 8 | Complete |

Potential additions: mobile-specific patterns, DevOps/platform engineering, accessibility deep dives.

### Eval Coverage Expansion

Current eval suite: 73 assertions across 8 eval files. Areas for expansion:

- Cross-service step ordering validation
- Service-scoped artifact consumption checks
- Knowledge document freshness (content age vs industry evolution)

---

## Explicitly Out of Scope (No Plans)

These were considered and explicitly deferred with no current plans:

- **Automatic cross-service invalidation** — changing service A's artifacts auto-invalidating service B's derived steps
- **Mobile/desktop multi-platform multi-service** — combined multi-platform + multi-service
- **GUI/web interface** — Scaffold is CLI-first; dashboard is read-only HTML
- **Cloud-hosted execution** — Scaffold runs locally; no SaaS component planned

---

## Release Checklist Reference

For any release, follow `docs/architecture/operations-runbook.md`:

1. Update `CHANGELOG.md` and `README.md`
2. Merge release-prep to `main`
3. Tag `main` with `vX.Y.Z`, push tag
4. Create GitHub release
5. Verify npm publish + Homebrew update workflows
6. Verify `npm update -g @zigrivers/scaffold` and `brew upgrade scaffold`
