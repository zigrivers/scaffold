# Scaffold Roadmap

Working document tracking completed work, in-progress items, and future directions. Updated as work progresses.

---

## Completed Releases

### v3.21.0 (2026-04-20)

Multi-Domain Stacking — `backendConfig.domain` / `researchConfig.domain` accept arrays to stack multiple domain sub-overlays in declaration order. Completes roadmap Phase 2 "Multi-Domain Stacking."

- **Schema change**: 3-way union on `domain` field (`'none'` literal | single enum | non-empty array of enum). No `.transform()` — zero write-site breakage.
- **Resolver change**: `normalizeDomains` helper iterates over domains with warn-on-duplicate; knowledge merge now append + dedup (fixes latent single-domain bug).
- **Service-mode**: inherited automatically via `ServiceSchema` reuse — `services[N].researchConfig.domain: [...]` works out of the box.
- **Fixture-only test content**: no new production domain sub-overlays ship with this feature. Two contrived fixtures (`backend-fake-a.yml`, `backend-fake-b.yml`) used only to engineer collision cases.
- **Review discipline**: 4-round spec MMR (Codex + Gemini) + 3-channel PR MMR.

### v3.20.0 (2026-04-20)

Multi-Service Dashboard — `scaffold dashboard` on a multi-service project renders a single bird's-eye page with per-service progress cards + aggregate stats. Completes roadmap Near-Term "Multi-Service Dashboard (deferred from Wave 3b)".

- **New** `generateMultiServiceDashboardData` + `generateMultiServiceHtml` + `buildMultiServiceTemplate`. Types: `MultiServiceDashboardData`, `ServiceSummary`, `MultiServiceAggregate`.
- **Dispatch**: services[] configured + no `--service` → multi-service view. Single-project and `--service X` paths unchanged.
- **Defensive**: missing per-service `state.json` renders as "Not started" (distinct from "Complete"). Corrupt JSON / schema-version / permission errors re-throw instead of being hidden as skeletons.
- **Security**: service-card click-to-copy uses `data-copy` + event listener (no inline `onclick`). Attacker-controlled service names can't reach a JS string context.
- **Review**: 3-channel PR MMR caught 1 P1 XSS, 1 P1 skeleton-badge bug, 2 P2s, 1 P3 rounding. All fixed + regression-locked before merge. PR #292.

### v3.19.0 (2026-04-20)

Eligible-Step Cache v2 — `scaffold next` + `status` now trust the `next_eligible` cache end-to-end, backed by graph-hash invalidation and TOCTOU-safe cross-file counters. Completes roadmap Phase 2 "Eligible Step Caching".

- **Fixes 3 latent bugs** — service-scope leakage in `saveState`, stale cache on pipeline-YAML edits, cross-file staleness between root and service state (captured via monotonic `save_counter` at `loadState` time, stamped as `next_eligible_root_counter` on service state files).
- **New helpers** — `computePipelineHash` (`src/core/pipeline/graph-hash.ts`), `readEligible` (`src/core/pipeline/read-eligible.ts`), `readRootSaveCounter` (`src/state/root-counter-reader.ts`), memoized `ResolvedPipeline.getPipelineHash(scope)` on the resolver.
- **New optional state fields** — `save_counter?`, `next_eligible_hash?`, `next_eligible_root_counter?` on `PipelineState`. Pre-v3.19 state files degrade to live recompute once and self-heal.
- **Consumer integration** — `next.ts` + `status.ts` (JSON + interactive) route through `readEligible`. All mutating command paths thread the scope-correct pipeline hash to `StateManager`. `info`/`dashboard`/`adopt`/`wizard` pass explicit undefined with rationale.
- **Review discipline** — 5-round spec MMR + 2-round plan MMR + 15-task per-task 4-gate review + 3-channel PR review. PRs: #290 (23 commits). Comparable to Wave 3c's 13-task structure.

### v3.18.1 (2026-04-20)

Internal cleanup — no user-facing behavior change.

- Removed redundant `?.` + frontmatter fallback chains at 3 consumer sites (`run.ts`, `status.ts`, `next.ts`) now that `OverlayState.crossReads` is authoritative + populated per-step (since v3.18.0)
- Normalized `resolveOverlayState` pass-1 `applyOverlay` threading (symmetric with pass 2)
- Hoisted `resolveOverlayState` test mocks updated to mirror real function behavior

### v3.18.0 (2026-04-19)

Overlay `cross-reads-overrides` — completes the Wave 3c seam from v3.17.0.

- **Structural overlays can append per-step `crossReads`** via `cross-reads-overrides` YAML section in `multi-service-overlay.yml`
- **Structural-only constraint** (spec §4.1) — project-type overlays that declare `cross-reads-overrides` are stripped at parse time with `OVERLAY_CROSS_READS_NOT_ALLOWED` warning (detected with `!== undefined` so explicit YAML null is caught)
- `CrossReadsOverride` type + required `PipelineOverlay.crossReadsOverrides` field
- `parseCrossReadsOverrides()` parser with item-level warnings (`OVERLAY_MALFORMED_APPEND_ITEM`)
- `applyCrossReadsOverrides()` helper — append + dedup by `service:step`, first-occurrence preserved, deep-copies entries
- `OverlayState.crossReads` becomes required (was Wave 3c seam); `resolveOverlayState` threads the map through BOTH overlay passes
- `resolveTransitiveCrossReads` gains optional `overlayCrossReads?` param for overlay-first recursion; `foreignMeta` existence guard preserved
- PRs: #284 (13 tasks, 23 commits) + #285 (release prep). #286 (cleanup) → v3.18.1.

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

### Cross-Service Dependency Visualization (multi-service dashboard follow-up)

Multi-Service Dashboard shipped in v3.20.0 without cross-service dep visualization. A graph view would show `exports`/`cross-reads` edges between services — useful for reasoning about upstream-ready gates in multi-service monorepos.

- Needs design: which edges to draw, graph layout (d3? graphviz? simple SVG?), whether to lay out alongside the service cards or a separate tab
- Non-trivial to render without adding a heavy client-side dep in the currently zero-dep HTML output

**Scope**: Design needed. Medium (~200 lines if kept server-rendered).

### Brownfield `adopt` for Multi-Service Monorepos

`scaffold adopt` currently detects a single project type. Multi-service adoption would:

- Detect multiple services in a monorepo (e.g., separate `package.json` in subdirectories)
- Create `services[]` config with detected types
- Initialize v3 state layout directly

**Scope**: Design needed. Medium complexity (~200-300 lines).

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
