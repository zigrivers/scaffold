# Scaffold Roadmap

Working document tracking completed work, in-progress items, and future directions. Updated as work progresses.

---

## Completed Releases

### v3.16.0 (2026-04-13)

- **MMR CLI v1.1.0** — Multi-Model Review overhaul with `mmr reconcile`, 4-channel flow, verdict system
- **Wave 0 (Security)** — artifact path containment via `resolveContainedArtifactPath()` across all 5 artifact sites

---

## Unreleased (targeting v3.17.0)

Everything below is merged to main or spec'd, awaiting release.

### Wave 1: Domain Knowledge (merged — PR #277)

- Backend fintech domain sub-overlay (`backend-fintech.yml`)
- `BackendConfig.domain` field: `'none' | 'fintech'` (default `'none'`)
- 8 fintech knowledge documents under `content/knowledge/backend/`
- Wizard prompt + `--backend-domain` flag for opt-in

### Wave 3a: Service Manifest (merged — PR #278)

- `ServiceSchema` with per-service `projectType` + coupling validators
- `ProjectSchema.services[]` optional array with unique-name refinement
- `scaffold init --from <file.yml>` declarative init
- `assertSingleServiceOrExit` guard on 9 stateful commands
- State `schema-version` widened to `1 | 2`
- `ScaffoldUserError` taxonomy (7 error classes)
- Wizard seam split: `collectWizardAnswers` + `materializeScaffoldProject`

### Wave 2: Cross-Service Pipeline (merged — PR #279)

- `PipelineOverlay` type (renamed from `ProjectTypeOverlay`, `projectType` optional)
- `loadStructuralOverlay()` — overlay loader without project-type requirement
- 4th overlay pass in `resolveOverlayState()` gated on `services[].length`
- 5 pipeline steps: `service-ownership-map`, `inter-service-contracts`, `cross-service-auth`, `cross-service-observability`, `integration-test-plan`
- 8 multi-service knowledge documents (architecture, data ownership, API contracts, auth, observability, testing, resilience, task decomposition)
- `multi-service-overlay.yml` with step, knowledge, reads, and dependency overrides
- Preset registration (5 steps as `enabled: false` in all 3 presets)

### Wave 3b: Service-Qualified Execution (merged — PR #280)

- `StatePathResolver` — centralizes path construction for global vs service-scoped state
- Merged state view — service-scoped `StateManager` loads global + service state, writes only service steps
- Per-service overlay resolution — `resolvePipeline()` gains `serviceId`, builds synthetic config
- `computeEligible()` scope filtering + fan-in (global steps auto-satisfy per-service deps)
- `guardStepCommand()` + `guardSteplessCommand()` replace `assertSingleServiceOrExit`
- `--service` flag on all 10 stateful commands
- Parallel-ready locking (service locks independent, global lock blocks all)
- v2→v3 state migration with global lock + service sharding
- `ensureV3Migration()` + `loadGlobalStepSlugs()` shared helpers
- 5 new `ScaffoldUserError` subclasses for service validation
- `schema-version` widened to `1 | 2 | 3`

### Wave 3c: Cross-Service References (merged — PR pending)

- `exports` allowlist on `ServiceConfig` — closed by default, kebab-case validation, global-step rejection via `ProjectSchema.superRefine` → `InvalidConfigError`
- `cross-reads` frontmatter field on pipeline steps (4 parser touch-points)
- `StateManager.loadStateReadOnly()` — side-effect-free foreign state loader (applies migrations in memory only; no saveState, no lock)
- Transitive cross-reads resolution with DFS cycle detection, full-closure memoization, per-service state cache, per-traversal dedup, tool-category guard, and optional globalSteps runtime guard
- `crossDependencies` on `DependencyNode` (informational, non-blocking) with overlay-first lookup
- `crossReads` field on `OverlayState` (seam for post-release overlay-overrides)
- `resolveCrossReadReadiness` + `CrossReadStatus` + `humanCrossReadStatus` — shared helper for `next` and `status` display
- `run.ts` artifact gathering wired with `gatheredPaths` dedup
- `next` and `status` text + JSON output include `crossDependencies` per shown step
- E2E test coverage: foreign artifact resolution, transitive chain (A→B→C), no-write regression, concurrency under foreign lock
- ~300 LOC production, ~450 LOC tests (across 14 TDD tasks with per-task multi-model review)

**To complete v3.17.0:**
1. Open PR from `feat/wave-3c`
2. Follow CLAUDE.md 3-channel review flow
3. Squash-merge + tag release per `docs/architecture/operations-runbook.md`
4. Follow release workflow in `docs/architecture/operations-runbook.md`

---

## Post-Release: Near-Term Enhancements

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

## Post-Release: Phase 2 Features

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

## Post-Release: Content & Quality

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
