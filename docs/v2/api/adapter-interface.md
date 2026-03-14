# Scaffold v2 — Platform Adapter Interface

**Phase**: 5 — API Contract Specification
**Depends on**: [Domain Model 05](../domain-models/05-platform-adapters.md), [ADR-022](../adrs/ADR-022-three-platform-adapters.md), [Architecture Sections 4a, 8](../architecture/system-architecture.md)
**Last updated**: 2026-03-14
**Status**: draft

**Status: Transformed** — Adapters simplified to thin delivery wrappers per meta-prompt architecture (ADR-041). Adapters no longer transform prompt content; they wrap the `scaffold run` assembly trigger in platform-specific format.

---

## Section 1: Interface Overview

### What an adapter does

A platform adapter is a **thin delivery wrapper** around the assembly engine. Adapters do NOT transform prompt content — they wrap the `scaffold run <step>` trigger in platform-specific format. The assembled prompt is platform-neutral; the delivery adapter determines how it reaches the AI, but the prompt content is identical across platforms (PRD Section 12).

Three adapters ship with Scaffold v2:

- **Claude Code** — generates `commands/*.md` that invoke `scaffold run <step>`
- **Codex** — generates `AGENTS.md` entries pointing to the assembly pipeline
- **Universal** — `scaffold run <step>` outputs the assembled prompt to stdout or a file

This means:
- Improving a meta-prompt or knowledge base entry improves output on all platforms.
- No platform-specific prompt variants to maintain.
- New platforms require only a new thin wrapper, not prompt adaptation.

Adapters produce files and share no state with each other. Adding a new adapter requires zero changes to existing adapters ([ADR-022](../adrs/ADR-022-three-platform-adapters.md)).

### When adapters run

Adapters run exclusively at **build time** (`scaffold build`). They never run at runtime. Note that `scaffold init` invokes the build pipeline automatically after creating configuration — adapters run in that flow too, through the same `scaffold build` code path.

Key properties of adapter execution:

- **Build-time only**: Adapters generate thin wrapper files during `scaffold build`. The `scaffold run` command invokes the assembly engine at runtime — it does not invoke adapters.
- **Deterministic**: Given identical `config.yml` and meta-prompt inventory, adapters always produce identical output. `scaffold build` is fully idempotent.
- **No content transformation**: Adapters do not see or transform prompt content. They generate references to `scaffold run <step>` that trigger the assembly engine at runtime.

### How adapters are registered and discovered

Adapters are registered in the adapter factory in `src/core/adapters/adapter.ts`. Each adapter is identified by its `platformId`, which must match a value recognized in `config.yml`'s `platforms` array.

The `platforms` array in `config.yml` determines which adapters run during `scaffold build`. The **Universal adapter** operates differently — it does not generate files but is always available via `scaffold run <step>`, which outputs the assembled prompt to stdout.

The adapter execution sequence per `scaffold build` is:

1. **Initialization**: Each configured adapter's `initialize()` is called once. All adapters validate output directories.
2. **Per-step wrapper generation**: For each step in the pipeline, each adapter generates a thin wrapper file that references `scaffold run <step>`.
3. **Finalization**: Each adapter's `finalize()` is called once after all steps are processed. Codex writes `AGENTS.md`.
4. **File writing**: The CLI writes all returned `OutputFile` records to disk.

---

## Section 2: TypeScript Interface Definition

The `PlatformAdapter` interface is defined in `src/core/adapters/adapter.ts` and all types live in `src/types/adapter.ts`.

```typescript
/**
 * The core interface every platform adapter implements.
 * Called once per `scaffold build` invocation for each configured platform.
 *
 * Adapters are thin delivery wrappers — they generate files that reference
 * `scaffold run <step>`, NOT files containing prompt content. Content assembly
 * happens at runtime via the assembly engine (PRD Section 9).
 */
interface PlatformAdapter {
  /**
   * The platform this adapter generates output for.
   * Must match a value in the config.yml `platforms` array.
   */
  readonly platformId: PlatformId;

  /** Human-readable adapter name for logs and error messages. */
  readonly displayName: string;

  /**
   * Initialize the adapter before generating wrapper files.
   * Called once per build. Validates output directories and
   * pre-computes any shared resources.
   *
   * @param context - Build-wide context: project root, manifest, all
   *   resolved steps, dependency graph, and platform list.
   * @returns AdapterInitResult with success flag, errors, and warnings.
   *
   * Error conditions:
   * - ADAPTER_INIT_FAILED: General initialization failure.
   * - OUTPUT_WRITE_FAILED: Output directory cannot be created or written.
   *
   * On failure: the build accumulates the error and may skip this adapter's
   * per-step calls. Exit code 5 (BUILD_ERROR) per ADR-040.
   */
  initialize(context: AdapterContext): Promise<AdapterInitResult>;

  /**
   * Generate a thin wrapper file for a single pipeline step.
   * Called once per step in pipeline order (topological sort from domain 02).
   *
   * @param input - The step's resolved metadata, pipeline index,
   *   and dependency context.
   * @returns AdapterStepOutput with files to write, errors, and a success flag.
   *
   * Behavioral contract:
   * - Generates a wrapper that invokes `scaffold run <step>`, not prompt content.
   * - Must not modify input; wrapper generation produces new output only.
   *
   * Error conditions:
   * - FRONTMATTER_GENERATION: Failed to generate YAML frontmatter (Claude Code).
   * - OUTPUT_WRITE_FAILED: Content could not be written to disk.
   */
  generateStepWrapper(input: AdapterStepInput): AdapterStepOutput;

  /**
   * Generate aggregate output files after all steps are processed.
   * Called once after all generateStepWrapper() calls complete.
   *
   * - Claude Code: no-op (each step produces its own command file).
   * - Codex: assembles AGENTS.md with entries pointing to `scaffold run`.
   *
   * @param results - All AdapterStepOutput records from generateStepWrapper() calls.
   * @returns AdapterFinalizeResult with aggregate files, statistics, errors,
   *   warnings, and a success flag.
   *
   * Error conditions:
   * - AGENTS_MD_ASSEMBLY: Failed to assemble AGENTS.md (Codex).
   * - OUTPUT_WRITE_FAILED: Aggregate file could not be written.
   */
  finalize(results: AdapterStepOutput[]): AdapterFinalizeResult;
}
```

---

## Section 3: Input/Output Type Definitions

All types are defined in `src/types/adapter.ts`.

### Platform Identification

```typescript
/**
 * Identifies a target platform for output generation.
 * Matches values in config.yml `platforms` array.
 */
type PlatformId = 'claude-code' | 'codex' | 'universal';
```

### AdapterContext

Build-wide context passed to every adapter during `initialize()`.

```typescript
interface AdapterContext {
  /** Absolute path to the project root (directory containing .scaffold/). */
  projectRoot: string;

  /** The methodology slug being built (e.g., "deep", "mvp"). */
  methodology: string;

  /**
   * The loaded methodology manifest, for phase ordering, phase names,
   * and navigation generation.
   * Type: MethodologyManifest from src/types/prompt.ts.
   * See [manifest-yml-schema](../data/manifest-yml-schema.md) for the file-level definition.
   */
  manifest: MethodologyManifest;

  /**
   * All resolved steps in the pipeline, in pipeline order (topological sort).
   * Used by adapters for AGENTS.md phase grouping and navigation generation.
   * Type: ResolvedStep[] from src/types/step.ts.
   */
  allSteps: ResolvedStep[];

  /**
   * The dependency graph after Kahn's algorithm, for computing
   * "next steps" (dependents) for navigation sections.
   * Type: DependencyGraph from src/types/dependency.ts.
   */
  dependencyGraph: DependencyGraph;

  /**
   * Platform IDs configured in config.yml `platforms` array.
   */
  platforms: PlatformId[];
}
```

### AdapterInitResult

```typescript
/**
 * Result of adapter initialization.
 * A failed initialization (success: false) prevents generateStepWrapper() from
 * being called for this adapter. The build accumulates errors and continues
 * with other adapters (accumulate-and-report pattern per ADR-040).
 */
interface AdapterInitResult {
  /** Whether initialization succeeded. */
  success: boolean;

  /** Fatal errors that prevented initialization. */
  errors: AdapterError[];

  /** Non-fatal warnings encountered during initialization. */
  warnings: AdapterWarning[];
}
```

### AdapterStepInput

Input for generating a wrapper for a single step.

```typescript
interface AdapterStepInput {
  /**
   * Resolved step metadata: slug, description, phase, frontmatter.
   * Type: ResolvedStep from src/types/step.ts.
   */
  step: ResolvedStep;

  /**
   * 0-based index of this step in manifest pipeline order.
   * Used for "You've completed step N of M" progress context.
   */
  pipelineIndex: number;

  /**
   * Slugs of steps that directly depend on this step
   * (reverse dependency edges from the dependency graph).
   * Used by the Claude Code adapter to generate "After This Step" navigation.
   */
  dependents: string[];

  /**
   * Slugs of steps this step depends on.
   * Used as secondary context for navigation sections.
   */
  dependencies: string[];
}
```

### AdapterStepOutput

Result of generating a wrapper for a single step.

```typescript
interface AdapterStepOutput {
  /** The step slug (passed through from AdapterStepInput.step.slug). */
  slug: string;

  /** The platform this output targets. */
  platformId: PlatformId;

  /**
   * Files to write for this step.
   * For Claude Code: one file at commands/<slug>.md.
   */
  files: OutputFile[];

  /** Fatal errors encountered during wrapper generation. */
  errors: AdapterError[];

  /** Non-fatal warnings during wrapper generation. */
  warnings: AdapterWarning[];

  /** Whether wrapper generation succeeded (no fatal errors). */
  success: boolean;
}
```

### OutputFile

```typescript
/**
 * A file that an adapter wants to write to disk.
 * The CLI Shell collects all OutputFile records from all adapters and
 * performs the actual disk writes after all adapters complete.
 */
interface OutputFile {
  /**
   * Relative path from project root where the file should be written.
   * Examples:
   *   "commands/tech-stack.md"       (Claude Code adapter)
   *   "AGENTS.md"                    (Codex adapter, finalize)
   */
  relativePath: string;

  /** The full file content to write. */
  content: string;

  /**
   * Write mode:
   * - 'create': Write the complete file, overwriting any existing content.
   * - 'section': Append or replace a named section in an existing file.
   */
  writeMode: 'create' | 'section';

  /**
   * For writeMode 'section': the section identifier to find and replace.
   */
  sectionId?: string;
}
```

### AdapterFinalizeResult

```typescript
/**
 * Result of the finalize step.
 * Contains aggregate output files (AGENTS.md) and build statistics.
 */
interface AdapterFinalizeResult {
  /**
   * Aggregate files to write.
   * Claude Code: empty array (no aggregate output).
   * Codex: [AGENTS.md].
   */
  files: OutputFile[];

  /** Summary statistics for this adapter's build run. */
  stats: AdapterStats;

  /** Fatal errors during finalization. */
  errors: AdapterError[];

  /** Non-fatal warnings during finalization. */
  warnings: AdapterWarning[];

  /** Whether finalization succeeded. */
  success: boolean;
}

interface AdapterStats {
  platformId: PlatformId;

  /** Total steps processed by this adapter. */
  totalSteps: number;

  /** Number of output files written (step files + aggregate files). */
  filesWritten: number;
}
```

### Error and Warning Types

```typescript
/**
 * Error codes for the adapter system.
 * All adapter errors use exit code 5 (BUILD_ERROR) per ADR-040.
 */
type AdapterErrorCode =
  | 'ADAPTER_INIT_FAILED'     // Adapter initialization failed (general)
  | 'OUTPUT_WRITE_FAILED'     // Could not write an output file
  | 'FRONTMATTER_GENERATION'  // Failed to generate YAML frontmatter (Claude Code)
  | 'UNKNOWN_PLATFORM'        // Platform ID not recognized in adapter registry
  | 'AGENTS_MD_ASSEMBLY';     // Failed to assemble AGENTS.md (Codex finalize)

interface AdapterError {
  code: AdapterErrorCode;
  message: string;
  platformId: PlatformId;

  /** Slug of the step that caused the error, if applicable. */
  stepSlug?: string;

  /** Underlying error for diagnostics. */
  cause?: Error;
}

interface AdapterWarning {
  code: string;
  message: string;
  platformId: PlatformId;

  /** Slug of the step that triggered the warning, if applicable. */
  stepSlug?: string;
}
```

### Aggregate Build Result

```typescript
/**
 * The aggregate output of running all configured adapters.
 * This is the final result type of the adapter stage in scaffold build.
 * Returned by the adapter orchestrator to the CLI Shell (domain 09).
 */
interface AdapterPipelineResult {
  /** Results keyed by platform, one entry per configured adapter. */
  platformResults: Map<PlatformId, AdapterFinalizeResult>;

  /** Whether all adapters succeeded (no fatal errors on any platform). */
  success: boolean;

  /** Aggregate errors across all platforms. */
  errors: AdapterError[];

  /** Aggregate warnings across all platforms. */
  warnings: AdapterWarning[];

  /** Summary statistics per platform. */
  stats: Map<PlatformId, AdapterStats>;
}
```

---

## Section 4: Per-Adapter Behavioral Contracts

### 4a: Claude Code Adapter (`src/core/adapters/claude-code.ts`)

**Platform ID**: `claude-code`

Generates `commands/*.md` files that invoke `scaffold run <step>`. Each command is a thin wrapper — it contains no prompt content, only a trigger for the assembly engine.

#### `initialize()` behavior

- Validates that the `commands/` output directory is writable.
- Validates that `CLAUDE.md` exists or can be created (via the CLAUDE.md Manager, `src/project/claude-md.ts`).

#### `generateStepWrapper()` behavior

Produces one file per step at `commands/<slug>.md`. The wrapper generation pipeline is:

1. **Frontmatter generation**: Extracts `description` from step metadata and serializes as YAML. Failure produces `FRONTMATTER_GENERATION` error.

2. **Execution instruction**: Generates the `scaffold run <step>` invocation line.

3. **Navigation generation**: The "After This Step" section is generated from `AdapterStepInput.dependents`:
   - For each dependent, formats a navigation entry: `\`/scaffold:<slug>\` — <description>`
   - Adds a progress context line: `"You've completed step N of M in Phase P — <phaseName>."`
   - If this step has no dependents (terminal node), emits `"Pipeline complete — begin implementation."`

**Output format** (`commands/<slug>.md`):

```
---
description: "Run phase N: <step description>"
---
Execute: scaffold run <step-slug>

---

## After This Step

You've completed step N of M in Phase P — <phaseName>.

- `/scaffold:<next-slug>` — <next description>
```

#### `finalize()` behavior

No-op for Claude Code. Returns an `AdapterFinalizeResult` with an empty `files` array and aggregate statistics.

### 4b: Codex Adapter (`src/core/adapters/codex.ts`)

**Platform ID**: `codex`

Generates `AGENTS.md` entries that point to the assembly pipeline via `scaffold run <step>`.

#### `initialize()` behavior

- Validates that the project root is writable (for `AGENTS.md`).

#### `generateStepWrapper()` behavior

No per-step files are generated. The Codex adapter collects step metadata during this phase and generates all output in `finalize()`.

#### `finalize()` behavior

Assembles `AGENTS.md` from all collected step metadata:

1. Groups steps by phase index using `context.allSteps` for ordering.
2. For each phase, generates a `## Phase N — <phaseName>` section.
3. For each step within a phase, generates a subsection with:
   - Step description
   - `Run \`scaffold run <step-slug>\`` instruction
4. Writes the assembled `AGENTS.md` as a single `OutputFile` with `writeMode: 'create'`.
5. Failure produces `AGENTS_MD_ASSEMBLY` error.

**AGENTS.md structure**:

```markdown
# AGENTS.md

Auto-generated by `scaffold build` for the <methodology> methodology.
Do not edit manually — changes will be overwritten on next build.

---

## Phase 0 — <phaseName>

## <Step Name>
Run `scaffold run <step-slug>` to <step description>.

## Phase 1 — <phaseName>
...
```

### 4c: Universal Adapter

**Platform ID**: `universal`

The Universal adapter does not generate files at build time. Instead, `scaffold run <step>` outputs the assembled prompt to stdout or a file, which users can paste into any AI tool.

This is the platform-neutral escape hatch — it works with any AI tool that accepts text input.

---

## Section 5: Extension Guide

### Creating a new adapter

To add support for a new AI platform:

**Step 1: Implement the interface.**

Create `src/core/adapters/<platform-id>.ts` implementing the `PlatformAdapter` interface:

```typescript
import type {
  PlatformAdapter, PlatformId, AdapterContext,
  AdapterInitResult, AdapterStepInput, AdapterStepOutput,
  AdapterFinalizeResult
} from '../../types/adapter';

export class MyPlatformAdapter implements PlatformAdapter {
  readonly platformId: PlatformId = 'my-platform' as PlatformId;
  readonly displayName = 'My Platform';

  async initialize(context: AdapterContext): Promise<AdapterInitResult> {
    // Validate output directories, pre-compute resources.
    // Return { success: true, errors: [], warnings: [] } on success.
  }

  generateStepWrapper(input: AdapterStepInput): AdapterStepOutput {
    // Generate a thin wrapper that invokes `scaffold run <step>`.
    // Return files at your platform's conventional paths.
  }

  finalize(results: AdapterStepOutput[]): AdapterFinalizeResult {
    // Generate any aggregate output files (index docs, instruction files, etc.).
    // Return { files: [], stats: {...}, errors: [], warnings: [], success: true } if no aggregate needed.
  }
}
```

**Step 2: Register the adapter.**

Add the new adapter to the adapter factory in `src/core/adapters/adapter.ts`:

```typescript
import { MyPlatformAdapter } from './my-platform';

const ADAPTER_REGISTRY: Map<PlatformId, () => PlatformAdapter> = new Map([
  ['claude-code', () => new ClaudeCodeAdapter()],
  ['codex',       () => new CodexAdapter()],
  ['my-platform', () => new MyPlatformAdapter()],  // Add here
]);
```

**Step 3: Add the platform ID to the config schema.**

Update the `platforms` array enum in `src/config/schema.ts` to include the new platform ID.

**Step 4: Test with `scaffold build`.**

After registering, add `my-platform` to a test project's `config.yml` `platforms` array and run `scaffold build`. Verify:
- `initialize()` completes without errors
- Each step produces the expected wrapper file(s)
- `finalize()` writes any aggregate output
- The build is deterministic (running twice produces identical output)

### What adapters must not do

- Adapters MUST NOT read or write `state.json`, `decisions.jsonl`, or `lock.json`. These are runtime state files, not build-time concerns.
- Adapters MUST NOT call other adapters or read other adapters' output files.
- Adapters MUST NOT transform or include prompt content — they only generate wrappers referencing `scaffold run`.
- Adapters MUST produce deterministic output given identical input.

---

## Section 6: Error Contract

### Error handling philosophy

The adapter system follows the **accumulate-and-report** pattern at build time ([ADR-040](../adrs/ADR-040-error-handling-philosophy.md)):

- All adapter errors and warnings are accumulated during processing.
- After all adapters complete (or as much as possible), issues are reported grouped by step and platform.
- Exit code 5 (`BUILD_ERROR`) if any adapter produces a fatal error.
- Exit code 0 if only warnings are present.

A failed adapter initialization (`ADAPTER_INIT_FAILED`) prevents that adapter's `generateStepWrapper()` calls from running. Other adapters continue unaffected.

### Fatal errors (exit code 5)

| Code | Condition | Recovery |
|------|-----------|----------|
| `ADAPTER_INIT_FAILED` | Adapter's `initialize()` threw or returned `success: false`. | Check adapter configuration and output directory permissions. |
| `OUTPUT_WRITE_FAILED` | An output file could not be written to disk. | Check that the output directory exists, the process has write permissions, and disk has sufficient space. |
| `FRONTMATTER_GENERATION` | Failed to generate YAML frontmatter for a step (Claude Code adapter). | The step's metadata is missing the required `description` field. Check the meta-prompt source file. |
| `UNKNOWN_PLATFORM` | A platform ID in `config.yml` is not registered in the adapter factory. | Valid values are `claude-code` and `codex`. Check the `platforms` array in `.scaffold/config.yml`. |
| `AGENTS_MD_ASSEMBLY` | Failed to assemble `AGENTS.md` during Codex finalize. | Check that all per-step outputs succeeded. An internal error in the Codex finalize step. |
