# Scaffold Roadmap

Working document tracking completed work, in-progress items, and future directions. Updated as work progresses.

---

## Completed Releases

### v3.27.0 (2026-05-12)

Web3 Project-Type Overlay — `scaffold init --project-type web3` targets smart-contract / protocol teams shipping to EVM chains with 14 knowledge documents covering Foundry tooling, security, upgradeability, gas optimization, oracles, audit workflow, and deployment. Implements roadmap "Content & Quality > New Project Type Overlays" for the W3-1 audience; W3-2 (web3 application / dApp) deferred to backlog.

- **New overlay**: `content/methodology/web3-overlay.yml` injects 14 web3 knowledge docs into 22 universal pipeline steps.
- **Forward-compatible schema**: `Web3Config.scope: 'contracts'` with `.default('contracts')` — W3-2 will extend the enum additively.
- **Brownfield detector**: medium-tier for `foundry.toml` / `hardhat.config.*`; low-tier for `remappings.txt` / `lib/forge-std`. EVM-only scope.
- **Library-collision discipline**: detector + library boundary pinned by 3-scenario `resolve-detection.test.ts` regression (foundry-only → web3; typical Hardhat → web3; published-library Hardhat → library via high-vs-medium tiebreak).
- **Wiring**: schema + validator + detector + wizard copy + adopt mapping + `PROJECT_TYPE_PREFERENCE` entry. New content eval + 8-test E2E block extending the project-type overlay suite.
- **Review discipline**: 3-round plan MMR (Codex + Claude + Gemini-compensating) + multi-round PR MMR. PR #338.

### v3.24.0 (2026-04-22)

Target-Agnostic Multi-Model Review — `mmr review` is no longer framed as PR-only. Skills, tool specs, knowledge entries, build-loop templates, and README all updated to the three-CLI + Superpowers channel model (Codex + Gemini + Claude + Superpowers code-reviewer), with non-PR targets (staged, branch diff, specific file, arbitrary diff) as first-class routing cases.

- **Seeded CLAUDE.md block** now target-agnostic, wrapped in `<!-- scaffold:automated-pr-review:claude-md -->` markers for idempotent Update Mode rewrites. Existing projects should re-run `scaffold run automated-pr-review` to refresh.
- **`scaffold check automated-pr-review`** detects all three MMR CLIs and labels recommended mode as "three-CLI MMR review" / "two-CLI MMR review" / "single-CLI review".
- **`scaffold run review-code`** default mode now computes trunk merge-base and dispatches one coherent delivery-candidate diff instead of concatenating segment diffs.
- **MMR CLI v1.2.0** (bundled) — raise default auth-check timeout for claude and gemini channels from 5s to 20s. Both are full LLM round-trips (9-14s in practice), so 5s was false-failing normal environments and silently dropping them into compensating passes.
- **Review discipline**: 26-round iterative MMR review (Claude + Codex + Gemini-compensating) driving every inconsistency to resolution. PR #301 (impl) + PR #302 (release-prep).

### v3.23.0 (2026-04-22)

Data Science Project-Type Overlay — `scaffold init --project-type data-science` targets solo / small-team data scientists with 13 knowledge documents covering reproducibility, experiment tracking, notebook discipline, model evaluation, and data versioning. Implements roadmap "Content & Quality > New Project Type Overlays" for the DS-1 audience; DS-2 (platform / larger-team) deferred to backlog.

- **New overlay**: `content/methodology/data-science-overlay.yml` injects 13 DS knowledge docs into 21 universal pipeline steps.
- **Forward-compatible schema**: `DataScienceConfig.audience: 'solo'` with `.default('solo')` — DS-2 will extend the enum additively.
- **Low-tier detector**: surfaces DS repos via Marimo signals (`marimo` dep or `.marimo.toml`); DVC signals (`dvc.yaml`, `.dvc/config`, `dvc` py dep) count as supplementary evidence. Defers to `ml` / `research` / `data-pipeline` via `resolveDetection` when those match at medium/high tier.
- **Wiring**: schema + validator + detector + wizard copy + adopt mapping. New packaging test + structural eval + detector-coverage test prevent future silent misregistration.
- **Review discipline**: 4-round spec MMR + 3-round plan MMR (Codex + Claude + Gemini-compensating) + 3-channel PR MMR. PR #299.
- **Known limitations**: `scaffold adopt` misses Marimo-in-dev-deps and may misclassify libraries that use Marimo as tooling. See `CHANGELOG.md` for workarounds.

### v3.22.0 (2026-04-21)

Cross-Service Dependency Visualization — `scaffold dashboard` on multi-service monorepos now renders a service-level dependency graph between phase indicators and service cards, with consumer→producer arrows and step-level readiness detail on hover/focus tooltips. Completes roadmap Near-Term "Cross-Service Dependency Visualization (multi-service dashboard follow-up)".

- **New** `buildDependencyGraph` + `renderDependencyGraphSection`. New types: `DependencyGraphNode`, `StepEdgeDetail`, `DependencyGraphEdge`, `DependencyGraphData`.
- **Pure server-rendered SVG** — zero new runtime dependencies. Layered Sugiyama-style layout (longest-path topological sort + cubic bezier edges). Deterministic.
- **Filters** self-refs, unknown-service targets, and disabled consumer steps at aggregation. `knownServices` guard prevents layout crashes on service-unknown readiness.
- **Accessibility** — `tabindex=0` on edges, nested `<title>`, `role=region` + `aria-live=polite` tooltip, `textContent`-only JS (zero `innerHTML`). Marker-end arrowhead inherits `currentColor` so hover/focus re-coloring propagates.
- **Defensive** — one service's malformed overlay does not crash the multi-service dashboard; its card still renders via the pre-existing `loadState` fallback, only outgoing graph edges are dropped. Same-layer cycle edges route outside the column so arrowheads still point into producers.
- **Review discipline** — 4-round spec MMR + 3-round plan MMR + 9 subagent-dispatched tasks each with per-task 4-gate review + 2-round 3-channel PR MMR. PR #296.

### v3.21.0 (2026-04-21)

Multi-Domain Stacking — `backendConfig.domain` / `researchConfig.domain` accept arrays to stack multiple domain sub-overlays in declaration order. Completes roadmap Phase 2 "Multi-Domain Stacking."

- **Schema change**: 3-way union on `domain` field (`'none'` literal | single enum | non-empty array of enum). No `.transform()` — zero write-site breakage.
- **Resolver change**: `normalizeDomains` helper iterates over domains with warn-on-duplicate; knowledge merge now append + dedup (fixes latent single-domain bug).
- **Service-mode**: inherited automatically via `ServiceSchema` reuse — `services[N].researchConfig.domain: [...]` works out of the box.
- **Fixture-only test content**: no new production domain sub-overlays ship with this feature. Two contrived fixtures (`backend-fake-a.yml`, `backend-fake-b.yml`) used only to engineer collision cases.
- **Review discipline**: 4-round spec MMR (Codex + Gemini) + 3-channel PR MMR (Codex + Gemini + Claude). Zero P0/P1/P2 findings from PR review; 3 P3s fixed before merge. PR #294.

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

- **MMR CLI v1.2.0** — Realistic auth-check timeouts (claude/gemini 5s→20s) unblock three-CLI review by default; builds on v1.1.0's `mmr reconcile` 4-channel flow and verdict system
- **Wave 0 (Security)** — artifact path containment via `resolveContainedArtifactPath()` across all 5 artifact sites

---

## Near-Term Enhancements

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

Each requires: 1 overlay YAML + ~12-14 knowledge documents. Project-type overlays are knowledge-injection (no new pipeline steps required).

### Knowledge Document Expansion

Current knowledge coverage by category (files in `content/knowledge/<category>/`):

| Category | Count |
|----------|-------|
| Core | 35 |
| Game | 25 |
| Research | 25 |
| Backend (incl. multi-service + fintech) | 22 |
| Review | 20 |
| Web-app | 17 |
| Browser-extension | 12 |
| Data-pipeline | 12 |
| Library | 12 |
| ML | 12 |
| Mobile-app | 12 |
| CLI | 10 |
| Validation | 7 |
| Product | 6 |
| Execution | 4 |
| Tools | 4 |
| Finalization | 3 |

Potential additions: mobile-specific patterns, DevOps/platform engineering, accessibility deep dives.

### Eval Coverage Expansion

Current eval suite: 73 `@test` blocks across 23 bats files in `tests/evals/`. Areas for expansion:

- Cross-service step ordering validation
- Service-scoped artifact consumption checks
- Knowledge document freshness (content age vs industry evolution)
- Cross-service dependency-graph rendering invariants (landed in v3.22.0 — eval coverage for the graph shape / determinism is currently in `src/dashboard/` unit tests, not the bats eval suite)

---

## Backlog / Later

Items that are deliberately queued for a future release — scoped but not actively in-flight.

- **DS-2 — Platform / larger-team data science**: extends `DataScienceConfig.audience` with `'platform'` discriminator; adds feature-store, orchestration (Airflow/Dagster), model-registry, lineage, governance knowledge docs.
- **W3-2 — Web3 application / dApp**: extends `Web3Config.scope` with `'dapp'` discriminator; adds wallet UX, subgraph/indexing, account abstraction, gas sponsorship knowledge docs.
- **Non-EVM chains (Solana, Move-based)**: separate overlay families; out of scope for current Web3 work.

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
