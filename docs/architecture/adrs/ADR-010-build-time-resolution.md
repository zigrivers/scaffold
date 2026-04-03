# ADR-010: Build-Time Resolution and Injection

**Status**: superseded (by [ADR-044](ADR-044-runtime-prompt-generation.md))
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 01, 12
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2's pipeline involves several computational steps: resolving which prompts to include (domain 01), injecting mixin content into prompts (domain 12), computing dependency order (domain 02), and generating platform-specific outputs (domain 05). The question is when these transformations should happen — at build time (when the user runs `scaffold build`) or at runtime (when the user runs `scaffold resume` to execute prompts).

The timing decision affects determinism, validation capability, startup latency, and the debugging experience. If resolution and injection happen at runtime, the output depends on the current state of mixin files and config at execution time, which may change between runs. If they happen at build time, the output is locked in and can be validated before any prompt is executed.

The v2 spec explicitly states that `scaffold build` is idempotent and always regenerates from scratch. This section evaluates whether that design is correct and what consequences it has for the rest of the architecture.

## Decision

All prompt resolution, mixin injection, dependency ordering, and platform output generation happens at **build time** (`scaffold build`). Runtime (`scaffold resume`, `scaffold next`) reads pre-built prompts and manages state transitions only.

Build-time responsibilities:
- Resolve the prompt set from config, manifest, and customization layers (domain 01)
- Inject mixin content into resolved prompts (domain 12)
- Compute dependency order via topological sort (domain 02)
- Generate platform-specific outputs: `commands/*.md`, `AGENTS.md`, universal prompts (domain 05)

Runtime responsibilities:
- Read pre-built prompts from the build output
- Track prompt completion status in `state.json` (domain 03)
- Evaluate eligibility (which prompts can run next) against the static dependency graph
- Present prompts to the user or agent

`scaffold build` is **fully idempotent** — it always regenerates everything from scratch. There is no "update build" or incremental build mode. Re-running `scaffold build` after changing `config.yml` regenerates all outputs.

**Mode Detection** (the mechanism by which prompts detect whether they are creating a fresh artifact or updating an existing one) operates at **runtime**, not build time. The build system passes Mode Detection blocks through unmodified — they are evaluated when the agent executes the prompt and checks whether output files already exist.

Config-to-output mapping is **deterministic**: the same `config.yml`, manifest files, mixin files, and customization files always produce the same build output.

## Rationale

- **Determinism enables validation**: Because all resolution and injection happen at build time, `scaffold validate` can verify the complete output before any prompt executes. It can check that all mixin markers resolved, all dependencies form a DAG, all frontmatter is valid, and all artifact schemas are satisfiable. Runtime resolution would mean validation can only check the current state, which may change before execution (domain 12, Section 8, MQ5 — "Why errors by default: an unresolved marker in a prompt that an agent executes would be silently ignored").
- **Idempotent rebuild is simpler than incremental**: An incremental build must track which inputs changed, which outputs are stale, and which can be reused. This invalidation logic is a notorious source of bugs (stale caches, missed dependencies). Full regeneration eliminates this entire class of bugs. The build is fast enough to regenerate (typically 20-40 prompts with simple text transformations) that incremental optimization is unnecessary (v2 spec, Rebuild Behavior section).
- **Runtime reads are fast**: Pre-built prompts are plain markdown files on disk. `scaffold resume` reads one file, checks `state.json`, and presents the prompt. No resolution, injection, or sorting happens at runtime, so startup latency is minimal.
- **Reconfiguration is explicit**: Users change `config.yml` and run `scaffold build` to see the effect. There is no risk of "I changed a mixin file and now my running pipeline has inconsistent prompts" because the running pipeline reads only from the build output, not from source files.

## Alternatives Considered

### Runtime Resolution (Resolve on Each `scaffold resume`)
- **Description**: No build step. Each time the user runs `scaffold resume`, the system resolves prompts, injects mixins, and computes dependencies on the fly.
- **Pros**: Always reflects the current state of config and mixin files. No "forgot to rebuild" problem. Simpler mental model — one command does everything.
- **Cons**: Slower startup for each `scaffold resume` invocation (resolution + injection + sorting on every run). Non-deterministic if files change between runs — prompt N might see different mixin content than prompt N+1 if a mixin file was edited mid-pipeline. Validation cannot be performed ahead of time. Debugging is harder because the effective prompt is never written to disk — the user cannot inspect what the agent will actually see.

### Incremental Build (Only Rebuild Changed Prompts)
- **Description**: `scaffold build` tracks file modification times and only re-processes prompts whose inputs (config, mixin files, base prompt files) have changed since the last build.
- **Pros**: Faster subsequent builds for large pipelines. Does not regenerate unchanged outputs.
- **Cons**: Invalidation logic is complex — a change to `config.yml` (e.g., changing the task-tracking mixin) invalidates every prompt that contains task verb markers, but not prompts without them. A change to a mixin file invalidates every prompt that references that axis. Getting the dependency graph of inputs to outputs correct is a significant implementation effort. Stale output risk: if the invalidation logic has a bug, the user gets a mix of old and new outputs with no obvious indication. The 20-40 prompt pipeline regenerates in well under the 2-second performance target, making incremental builds an optimization for a problem that does not exist.

### Hybrid (Resolve at Build, Inject at Runtime)
- **Description**: `scaffold build` resolves the prompt set and computes dependencies, but mixin injection happens at runtime when each prompt is presented.
- **Pros**: Mixin content changes take effect immediately without rebuilding. The dependency graph is stable (computed at build time) while content is dynamic.
- **Cons**: Split logic — some transformations happen at build time, others at runtime. Validation can check resolution and dependencies but not injection, so unresolved markers are only caught at execution time. Debugging requires understanding which parts of the output came from build time vs. runtime. The `scaffold validate` command cannot verify the complete output.

## Consequences

### Positive
- Complete validation at build time — `scaffold validate` catches all resolution, injection, and dependency errors before any prompt executes
- Deterministic output — same inputs always produce the same build, enabling reproducible debugging and testing
- Fast runtime — `scaffold resume` reads pre-built files with no computation overhead
- Inspectable output — users can read the generated `commands/*.md` files to see exactly what agents will receive
- Safe reconfiguration — changing `config.yml` and rebuilding is an explicit, atomic operation

### Negative
- Users must remember to run `scaffold build` after changing config or mixin files. A stale build produces outdated prompts with no automatic detection (mitigated by `scaffold resume` checking whether `config.yml` is newer than the build output and printing a warning)
- No way to make mixin content dynamic based on runtime conditions (e.g., "inject different content on the second run"). Mode Detection handles the most common dynamic case (fresh vs. update), and it operates at the prompt level, not the mixin level
- Full regeneration means even unchanged prompts are reprocessed, though this is fast enough to be unnoticeable

### Neutral
- Mode Detection blocks in prompts pass through the build system unmodified and are evaluated at runtime by the agent. This creates a deliberate boundary: the build system controls *what* the prompt says, while Mode Detection controls *how* the prompt behaves based on existing artifacts.

## Constraints and Compliance

- All prompt resolution, mixin injection, dependency ordering, and platform output generation MUST happen during `scaffold build` (domains 01, 12, 02, 05)
- `scaffold build` MUST be idempotent — re-running always regenerates all outputs from scratch (v2 spec, Rebuild Behavior)
- `scaffold resume` and `scaffold next` MUST NOT perform resolution or injection. They MUST read only from pre-built outputs
- The build output MUST be deterministic: identical inputs (config.yml, manifest, mixin files, customizations) MUST produce identical outputs
- Mode Detection blocks MUST pass through the build system unmodified — they are runtime concerns, not build-time concerns (v2 spec, Rebuild Behavior)
- `scaffold resume` SHOULD warn when `config.yml` modification time is newer than the build output, indicating a potentially stale build
- Axis mixin markers are replaced BEFORE task verb markers during injection (two-pass ordering: axis first, verbs second). This means mixin content may contain task verb markers, and they will be correctly replaced in the second pass. The reverse order would prevent mixin-contributed task operations from being resolved.
- Implementers MUST NOT introduce "update build" or incremental build modes. Partial regeneration creates stale output risk.

## Related Decisions

- [ADR-005](ADR-005-three-layer-prompt-resolution.md) — Three-layer resolution that runs at build time
- [ADR-006](ADR-006-mixin-injection-over-templating.md) — Mixin injection pipeline executed at build time
- [ADR-009](ADR-009-kahns-algorithm-dependency-resolution.md) — Dependency ordering computed at build time and stored as static graph
- [ADR-022](ADR-022-three-platform-adapters.md) — Platform adapter generation is the final build-time stage
- Domain 01 ([01-prompt-resolution.md](../domain-models/01-prompt-resolution.md)) — Resolution algorithm executed at build time
- Domain 12 ([12-mixin-injection.md](../domain-models/12-mixin-injection.md)) — Injection pipeline executed at build time
- Domain 03 ([03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md)) — Runtime state machine that reads pre-built prompts
