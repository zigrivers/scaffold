# ADR-056: Multi-Type Detection Architecture for `scaffold adopt`

**Status**: accepted
**Date**: 2026-04-08
**Deciders**: v3.10 design spec, multi-model review (13 rounds, ~195 findings)
**Domain(s)**: 07
**Phase**: 2 — Architecture Decision Records

---

## Context

Prior to v3.10, `scaffold adopt` only detected game projects — inline code in `adopt.ts` checked for Unity (`Assets/*.meta`), Unreal (`*.uproject`), and Godot (`project.godot`) files. With R1-R3 overlay support adding 8 new project types (web-app, backend, cli, library, mobile-app, data-pipeline, ml, browser-extension), detection needed to scale to 9 types without growing `adopt.ts` into a monolith.

The existing inline approach had several problems:
- **Not extensible** — adding a new project type meant editing the same function with another `if` branch
- **Not independently testable** — game detection was tangled with adoption orchestration
- **No confidence model** — detection was binary (match or not), with no way to express "this looks like a web-app but might also be a backend"
- **No disambiguation** — if signals for multiple types were present, the code silently picked one

## Decision

Detection is factored into a per-type detector module architecture at `src/project/detectors/`:

1. **Per-type detector modules**: Nine files (`web-app.ts`, `backend.ts`, `cli.ts`, `library.ts`, `mobile-app.ts`, `data-pipeline.ts`, `ml.ts`, `browser-extension.ts`, `game.ts`), each exporting a single `detect<Type>(ctx: SignalContext)` function that returns `DetectionMatch | null`.

2. **Shared `SignalContext` interface**: Avoids redundant filesystem reads by lazy-loading and caching manifest files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`), directory listings, and file existence checks. Detectors are pure functions (input: context, output: match or null). `FsSignalContext` is the real implementation; `createFakeSignalContext` is the test double.

3. **`DetectionMatch` discriminated union**: Each match is keyed on `projectType` with a `confidence` tier (`high`/`medium`/`low`) and an `evidence` trail documenting which signals triggered the match (e.g., `next-config`, `app-router-dir`, `react-dep`).

4. **Case A-G decision table** (`resolveDetection`):
   - **A**: No matches — no project type set
   - **B**: Single high match — auto-commit
   - **C**: Single medium match — auto-commit
   - **D**: Single low match — warn, skip under `--auto`
   - **E**: Multiple matches, one dominant — auto-commit dominant, warn about secondaries
   - **F**: Multiple matches, tied — interactive disambiguation prompt
   - **G**: Disambiguation selected "none" — no project type set

5. **Interactive disambiguation** (`disambiguate`): When Case F applies, a radio prompt shows all matches with confidence and evidence. Under `--auto`, exits with `ExitCode.Ambiguous = 6` instead of prompting.

6. **`detectedConfig` replaces `gameConfig`**: `AdoptionResult` gains a `detectedConfig` field as a discriminated union across all 9 types. The old `gameConfig` field is deprecated (dual-emitted in v3.10, removed in v4.0).

## Rationale

**Per-type modules over a single detector**: Each project type has distinct signal patterns (web-app checks for Next/Nuxt/Vite configs; ML checks for PyTorch/TensorFlow deps and training directories). Separate files keep each detector under 150 lines, independently testable, and trivially extendable — adding a 10th type means adding one file and registering it in `ALL_DETECTORS`.

**SignalContext over direct fs calls**: Multiple detectors need `package.json` and directory listings. Without shared context, 9 detectors would parse `package.json` up to 9 times. `SignalContext` caches reads, keeping detection under 50ms on real-world projects.

**Confidence tiers over binary match**: A project with `package.json` containing `express` and a `routes/` directory is high-confidence backend. A project with only `express` in dependencies is medium-confidence (could be a web-app using Express for SSR). Confidence tiers let the decision table auto-commit clear matches and prompt on ambiguity.

**Discriminated union over type field + untyped config**: TypeScript's exhaustive switch checking on `detectedConfig.type` ensures the orchestrator handles all 9 types at compile time. Adding a type without updating the handler is a type error.

**Exit code 6 over exit code 1 for ambiguity**: Ambiguity is not a validation error (the input is valid) or a user cancellation (the user didn't cancel). It's a distinct "operator action required" state that CI scripts should handle differently — e.g., prompting a human to choose, rather than retrying or filing a bug. See ADR-025, Amendment 1.

## Alternatives Considered

### Single Detector with Strategy Pattern

- **Description**: One `detect(ctx)` function with an internal strategy map.
- **Pros**: Single entry point, no module registration.
- **Cons**: One large file with 9 strategies. Testing requires mocking the strategy map rather than importing individual functions. Adding a type means editing the strategy map and the detector — two places instead of one.

### ML-Based Detection (Classifier)

- **Description**: Train a classifier on project directory structures.
- **Pros**: Could handle edge cases better than rule-based detection.
- **Cons**: Overkill for 9 well-defined types with clear signals. Adds a model dependency, training pipeline, and non-determinism. Rule-based detection with confidence tiers covers the same ground with full transparency.

### No Disambiguation (Pick Highest)

- **Description**: When multiple types match, always pick the highest-confidence one silently.
- **Pros**: Simpler UX — no prompts needed.
- **Cons**: Silent wrong choices are worse than asking. A Next.js app with a Prisma backend legitimately matches both web-app and backend at high confidence. Picking one silently means the user discovers the wrong overlay was applied after running several pipeline steps.

## Consequences

### Positive
- Adding a new project type requires one detector file + fixture tests + registering in `ALL_DETECTORS`
- Each detector is independently testable with `createFakeSignalContext`
- Confidence tiers + evidence trails make detection transparent and debuggable
- Discriminated union provides compile-time exhaustiveness checking
- `ExitCode.Ambiguous = 6` gives CI scripts a clean way to handle ambiguity

### Negative
- 9 new detector files + test files + fixture directories increase the codebase surface
- `SignalContext` caching adds complexity over direct `fs` calls (though it improves performance)
- The `gameConfig` deprecation requires dual-emit in v3.10, adding a migration burden

### Neutral
- Detector execution order is a performance optimization only — it does not affect correctness (all detectors always run)
- The disambiguation prompt uses `@inquirer/prompts` — the specific library is an implementation detail

## Constraints and Compliance

- Detectors MUST be pure functions: `(ctx: SignalContext) => DetectionMatch | null`
- `SignalContext` MUST cache all filesystem reads — no detector may call `fs` directly
- `DetectionMatch` MUST include `projectType`, `confidence`, and `evidence` fields
- The decision table (Case A-G) MUST be implemented in `resolveDetection`, not scattered across callers
- Under `--auto`, disambiguation MUST exit with code 6 — never prompt, never silently pick
- `detectedConfig` MUST be a discriminated union with exhaustive `type` field — `assertNever` at compile time
- The old `gameConfig` field MUST be dual-emitted alongside `detectedConfig` for game projects in v3.10

## Related Decisions

- [ADR-025](ADR-025-cli-output-contract.md) — CLI output contract; amended with Exit Code 6
- [ADR-028](ADR-028-detection-priority.md) — Detection priority (v1 > brownfield > greenfield); extended by per-type detection within brownfield mode
- [ADR-033](ADR-033-forward-compatibility.md) — Forward compatibility; `detectedConfig` dual-emit preserves v3.9 consumer compatibility
- [ADR-040](ADR-040-error-handling-philosophy.md) — Error handling philosophy; `asScaffoldError` wraps unexpected exceptions
- [ADR-055](ADR-055-backward-compatibility-contract.md) — Backward compatibility contract; `gameConfig` deprecation follows the dual-emit pattern
