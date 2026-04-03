# Scaffold v2 — Internal Module Interfaces

**Purpose**: Defines the public API contract for each core module. Implementing agents MUST match these signatures exactly. All types referenced here are defined in `src/types/` (T-002).

**Convention**: Core modules (StateManager, LockManager, AssemblyEngine, ConfigLoader) are classes instantiated with dependencies via constructor injection. Utility modules (`src/utils/`) export plain functions. Type-only modules (`src/types/`) export interfaces and type aliases. All file I/O uses synchronous fs APIs per the single-process model (system-architecture.md Section 6a).

---

## 1. StateManager (`src/state/state-manager.ts`)

```typescript
/**
 * Manages pipeline state persistence and step lifecycle transitions.
 * Wraps .scaffold/state.json with atomic read/write and eligibility caching.
 */
export class StateManager {
  /**
   * @param projectRoot - Absolute path to project root (contains .scaffold/)
   * @param computeEligible - Callback that derives next-eligible steps from current step map
   */
  constructor(
    projectRoot: string,
    computeEligible: (steps: Record<string, StepStateEntry>) => string[]
  );

  /** Load and validate state.json from disk. Throws on schema mismatch. */
  loadState(): PipelineState;

  /** Atomically persist state to disk (write tmp + rename). */
  saveState(state: PipelineState): void;

  /** Transition step to in_progress; sets in_progress record with actor. */
  setInProgress(step: string, actor: string): void;

  /** Transition step to completed; records outputs, actor, and depth. */
  markCompleted(step: string, outputs: string[], completedBy: string, depth: DepthLevel): void;

  /** Transition step to skipped; records reason and actor. */
  markSkipped(step: string, reason: string, skippedBy: string): void;

  /** Clear the in_progress record (null out). Used by crash recovery. */
  clearInProgress(): void;

  /** Return the status of a single step, or undefined if step not in state. */
  getStepStatus(step: string): StepStatus | undefined;
}
```

---

## 2. FrontmatterParser (`src/project/frontmatter.ts`)

```typescript
/**
 * Parses and validates YAML frontmatter from meta-prompt .md files.
 * Frontmatter is delimited by --- lines at the top of the file.
 */

/** Parse frontmatter only. Throws on malformed YAML. */
export function parseFrontmatter(filePath: string): MetaPromptFrontmatter;

/**
 * Parse frontmatter + body with validation against the frontmatter JSON schema.
 * Returns errors array (empty on success) rather than throwing.
 */
export function parseAndValidate(filePath: string): {
  frontmatter: MetaPromptFrontmatter;
  body: string;
  errors: ScaffoldError[];
};
```

---

## 3. ConfigLoader (`src/config/loader.ts`)

```typescript
/**
 * Loads and validates .scaffold/config.yml.
 * Returns null config with errors on failure; returns warnings for unknown fields.
 */

/**
 * @param projectRoot - Absolute path to project root
 * @param knownSteps - Step slugs from discovered meta-prompts (for validating custom.steps keys)
 */
export function loadConfig(
  projectRoot: string,
  knownSteps: string[]
): { config: ScaffoldConfig | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] };

/** Migrate a v1 config object to v2 ScaffoldConfig shape. */
export function migrateV1(raw: Record<string, unknown>): ScaffoldConfig;
```

---

## 4. DependencyResolver (`src/core/dependency/resolver.ts`)

```typescript
/**
 * Builds and queries the step dependency graph.
 * Uses Kahn's algorithm for topological sort with frontmatter `order` as tiebreaker.
 */

/** Build the full dependency graph from meta-prompt frontmatter and preset enablement. */
export function buildGraph(
  metaPrompts: MetaPromptFrontmatter[],
  presetSteps: Map<string, { enabled: boolean }>
): DependencyGraph;

/** Produce a linear execution order via Kahn's algorithm. */
export function topologicalSort(graph: DependencyGraph): string[];

/** Return step slugs whose dependencies are all completed or skipped. */
export function computeEligible(
  graph: DependencyGraph,
  steps: Record<string, StepStateEntry>
): string[];

/** Group steps into maximal parallel sets (steps within a set have no mutual dependencies). */
export function getParallelSets(graph: DependencyGraph): string[][];

/** Detect cycles in the graph. Returns empty array if acyclic. */
export function detectCycles(graph: DependencyGraph): ScaffoldError[];
```

---

## 5. AssemblyEngine (`src/core/assembly/engine.ts`)

```typescript
/**
 * Core runtime orchestrator. Composes an assembled prompt from meta-prompt,
 * knowledge base, project context, user instructions, and methodology settings.
 */
export class AssemblyEngine {
  /** Assemble the prompt for a single step. */
  assemble(step: string, options: AssemblyOptions): AssemblyResult;
}

/** Input bundle for a single assembly invocation. */
export interface AssemblyOptions {
  config: ScaffoldConfig;
  state: PipelineState;
  metaPrompt: MetaPromptFile;
  knowledgeEntries: KnowledgeEntry[];
  instructions: UserInstructions;
  depth: DepthLevel;
  depthProvenance: DepthProvenance;
  updateMode: boolean;
  existingArtifact?: ExistingArtifact;
}
```

---

## 6. MetaPromptLoader (`src/core/assembly/meta-prompt-loader.ts`)

```typescript
/**
 * Discovers and loads meta-prompt .md files from the pipeline/ directory.
 */

/** Scan pipelineDir for all .md files; return map of step slug to MetaPromptFile. */
export function discoverMetaPrompts(pipelineDir: string): Map<string, MetaPromptFile>;

/** Load and parse a single meta-prompt file. Throws on missing file or invalid frontmatter. */
export function loadMetaPrompt(filePath: string): MetaPromptFile;
```

---

## 7. KnowledgeLoader (`src/core/assembly/knowledge-loader.ts`)

```typescript
/**
 * Indexes and loads knowledge base entries from the knowledge/ directory.
 */

/** Scan knowledgeDir recursively; return map of entry name to file path. */
export function buildIndex(knowledgeDir: string): Map<string, string>;

/**
 * Load the named entries from the index.
 * Missing entries produce warnings (non-fatal), not errors.
 */
export function loadEntries(
  index: Map<string, string>,
  names: string[]
): { entries: KnowledgeEntry[]; warnings: ScaffoldWarning[] };
```

---

## 8. InstructionLoader (`src/core/assembly/instruction-loader.ts`)

```typescript
/**
 * Loads user instructions from the three-layer precedence hierarchy:
 * global (.scaffold/instructions/global.md), per-step (.scaffold/instructions/<step>.md),
 * and inline (--instructions flag).
 */

export function loadInstructions(
  projectRoot: string,
  step: string,
  inline?: string
): UserInstructions;

/** Resolved instructions from all three layers. null = layer not present. */
export interface UserInstructions {
  global: string | null;
  perStep: string | null;
  inline: string | null;
}
```

---

## 9. CompletionDetector (`src/state/completion.ts`)

```typescript
/**
 * Dual completion detection: state-based (step marked completed) and
 * artifact-based (expected output files exist on disk).
 */

/** Check whether a step's expected outputs are present on disk. */
export function detectCompletion(
  step: string,
  state: PipelineState,
  expectedOutputs: string[]
): CompletionResult;

/** Analyze a crashed session (non-null in_progress) and recommend recovery action. */
export function analyzeCrash(state: PipelineState): CrashRecoveryAction;

export interface CompletionResult {
  complete: boolean;
  artifactsPresent: string[];
  artifactsMissing: string[];
}

export interface CrashRecoveryAction {
  action: 'auto_complete' | 'recommend_rerun' | 'ask_user';
  presentArtifacts: string[];
  missingArtifacts: string[];
}
```

---

## 10. LockManager (`src/state/lock.ts`)

```typescript
/**
 * Advisory file lock for .scaffold/lock.json.
 * Prevents concurrent scaffold commands from corrupting state.
 */

/**
 * Attempt to acquire the lock. Returns acquired: false with a warning on contention.
 * @param step - Step slug being executed (optional; omit for non-step commands like init/reset)
 */
export function acquireLock(
  projectRoot: string,
  command: string,
  step?: string
): { acquired: boolean; warning?: ScaffoldWarning };

/** Release the lock by deleting .scaffold/lock.json. */
export function releaseLock(projectRoot: string): void;

/** Read the lock file if it exists; return null if absent. */
export function checkLock(projectRoot: string): LockFile | null;

/** Check whether a lock is stale (holder process no longer running). */
export function isStale(lock: LockFile): boolean;
```

---

## 11. DecisionLogger (`src/state/decision-logger.ts`)

```typescript
/**
 * Append-only logger for .scaffold/decisions.jsonl.
 * Each line is a JSON DecisionEntry recording a design decision made during a step.
 */

/**
 * Append a decision entry. Assigns a sequential ID (e.g., "D-001").
 * @returns The assigned decision ID.
 */
export function appendDecision(
  projectRoot: string,
  entry: Omit<DecisionEntry, 'id'>
): string;

/** Read decision entries, optionally filtered by step or limited to the last N. */
export function readDecisions(
  projectRoot: string,
  filter?: { step?: string; last?: number }
): DecisionEntry[];
```

---

## 12. MethodologyResolver (`src/core/methodology/resolver.ts`)

```typescript
/**
 * Resolves effective depth and enablement for a step by applying the
 * precedence chain: preset defaults -> custom overrides -> per-step overrides -> CLI flags.
 */

/**
 * Resolve the effective depth for a step.
 * Precedence (highest wins): cliDepth > step-override > custom-default > preset-default.
 */
export function resolveDepth(
  step: string,
  config: ScaffoldConfig,
  preset: MethodologyPreset,
  cliDepth?: DepthLevel
): { depth: DepthLevel; provenance: DepthProvenance };

/**
 * Resolve whether a step is enabled or disabled.
 * Precedence: custom-override > conditional-detection > preset-default.
 */
export function resolveEnablement(
  step: string,
  config: ScaffoldConfig,
  preset: MethodologyPreset
): { enabled: boolean; provenance: EnablementProvenance };

export type DepthProvenance = 'cli-flag' | 'step-override' | 'custom-default' | 'preset-default';
export type EnablementProvenance = 'custom-override' | 'conditional-detection' | 'preset-default';
```

---

## Type Index

All types referenced above are defined in the following source modules:

| Type | Source | Origin Spec |
|------|--------|-------------|
| `PipelineState` | `src/types/state.ts` | state-json-schema.md |
| `StepStateEntry` | `src/types/state.ts` | state-json-schema.md |
| `StepStatus` | `src/types/state.ts` | `'pending' \| 'in_progress' \| 'completed' \| 'skipped'` |
| `DepthLevel` | `src/types/methodology.ts` | `1 \| 2 \| 3 \| 4 \| 5` |
| `MetaPromptFrontmatter` | `src/types/frontmatter.ts` | frontmatter-schema.md |
| `MetaPromptFile` | `src/types/assembly.ts` | 15-assembly-engine.md |
| `KnowledgeEntry` | `src/types/assembly.ts` | 15-assembly-engine.md (`KnowledgeBaseEntry`) |
| `ExistingArtifact` | `src/types/assembly.ts` | 15-assembly-engine.md |
| `AssemblyResult` | `src/types/assembly.ts` | 15-assembly-engine.md |
| `DecisionEntry` | `src/types/state.ts` | 15-assembly-engine.md |
| `UserInstructions` | `src/types/assembly.ts` | 15-assembly-engine.md |
| `DependencyGraph` | `src/types/dependency.ts` | 02-dependency-resolution.md |
| `ScaffoldConfig` | `src/types/config.ts` | config-yml-schema.md |
| `ScaffoldError` | `src/types/errors.ts` | 09-cli-architecture.md |
| `ScaffoldWarning` | `src/types/errors.ts` | 09-cli-architecture.md |
| `LockFile` | `src/types/lock.ts` | 13-pipeline-locking.md |
| `MethodologyPreset` | `src/types/methodology.ts` | 16-methodology-depth-resolution.md |
| `DepthProvenance` | `src/types/methodology.ts` | 16-methodology-depth-resolution.md |
| `EnablementProvenance` | `src/types/methodology.ts` | 16-methodology-depth-resolution.md |
