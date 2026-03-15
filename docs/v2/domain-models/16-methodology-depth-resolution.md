# Domain Model: Methodology & Depth Resolution

**Domain ID**: 16
**Phase**: 1 — Deep Domain Modeling
**Depends on**: [06-config-validation.md](06-config-validation.md) (reads validated config schema), [14-init-wizard.md](14-init-wizard.md) (wizard produces the initial methodology config)
**Last updated**: 2026-03-14
**Status**: draft

---

## Section 1: Domain Overview

The Methodology & Depth Resolution domain models the runtime resolution logic that determines which pipeline steps are active and at what depth level. Every CLI command that cares about step availability or output rigor queries this domain: `scaffold run` uses it to check step enablement and determine depth before assembly, `scaffold next` uses it to filter the eligible set to only enabled steps, `scaffold status` uses it to show depth alongside completion, `scaffold list` uses it to display the full pipeline with enablement status, `scaffold skip` uses it to validate that a step can be skipped, and `scaffold info` uses it to show a step's effective configuration.

**Role in the v2 architecture**: This domain sits between the static configuration (domain 06's validated `config.yml` and the methodology preset YAML files in `methodology/`) and the runtime orchestrator (domain 15's assembly engine). The config schema is domain 06's territory — it defines what fields are valid and validates their types. This domain takes those validated values and resolves them into effective step configurations by applying a precedence chain: preset defaults, then custom overrides, then per-step depth overrides.

**Central design challenge**: The resolution logic must produce a deterministic, explainable result for every step. When a user asks "why is this step at depth 3?" or "why is this step disabled?", the resolution result must carry provenance — where each value came from (preset, custom default, per-step override) — so the CLI can display a clear explanation. The resolution must also handle methodology changes mid-pipeline gracefully: changing from MVP to Deep after completing some steps does not invalidate completed work, but does change the depth and enablement for remaining steps.

---

## Section 2: Glossary

**conditional step** — A pipeline step with `conditional: "if-needed"` in its meta-prompt frontmatter. Conditional steps are evaluated for relevance during init wizard (domain 14) based on project signals. Users can override the detection result. Examples: database schema, API contracts, UX spec.

**custom methodology** — The `custom` methodology preset, which allows per-step depth and enablement overrides. Config.yml's `custom` block provides the overrides; `methodology/custom-defaults.yml` provides the base.

**default depth** — The depth level applied to all steps that do not have an explicit per-step depth override. Defined by the methodology preset's `default_depth` field. Can be overridden in the custom config block.

**depth** — An integer from 1 to 5 controlling output rigor. 1 = MVP floor (minimum viable artifact), 5 = Deep ceiling (comprehensive). See PRD §6 for descriptions of each level.

**depth provenance** — The source of a resolved depth value: `preset_default` (from methodology YAML), `custom_default` (from config.yml custom block), or `step_override` (from per-step depth in config.yml).

**effective step config** — The fully resolved configuration for a single step after merging preset defaults with custom overrides. Contains final values for enabled, depth, and conditional status, plus provenance for each.

**enablement provenance** — The source of a step's enabled/disabled status: `preset` (from methodology YAML), `custom_override` (from config.yml custom block), or `conditional_detection` (from init wizard signal detection).

**methodology preset** — A YAML configuration file in `methodology/` defining a named approach (Deep, MVP, Custom). Specifies `default_depth` and per-step `enabled` status. Three presets ship with scaffold: `deep.yml`, `mvp.yml`, `custom-defaults.yml`.

**per-step depth override** — An explicit depth value (1-5) set for a specific step in the custom config block. Overrides both the preset default and the custom default depth.

**resolved pipeline** — The complete set of effective step configurations for all 32 pipeline steps. The output of full pipeline resolution.

**step config** — The raw configuration for a single step from a methodology preset YAML file. Contains `enabled` (boolean) and optionally `conditional` (string). Does not contain depth — depth comes from `default_depth` or per-step override.

---

## Section 3: Entity Model

```typescript
/**
 * Value object: step name within the pipeline.
 * Invariant: matches /^[a-z0-9]+(-[a-z0-9]+)*$/ (kebab-case).
 */
type StepName = string;

/**
 * Value object: depth level for a pipeline step.
 * Invariant: integer in range [1, 5].
 */
type DepthLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Value object: name of a methodology preset.
 * Invariant: one of the three built-in preset names.
 */
type MethodologyName = 'deep' | 'mvp' | 'custom';

/**
 * Value object: provenance of a resolved depth value.
 * Records where the depth came from in the precedence chain.
 */
type DepthProvenance =
  | 'preset_default'     // from methodology YAML's default_depth
  | 'custom_default'     // from config.yml custom.default_depth
  | 'step_override';     // from config.yml custom.steps.<step>.depth

/**
 * Value object: provenance of a step's enablement status.
 * Records where the enabled/disabled decision came from.
 */
type EnablementProvenance =
  | 'preset'               // from methodology YAML's steps.<step>.enabled
  | 'custom_override'      // from config.yml custom.steps.<step>.enabled
  | 'conditional_detection'; // from init wizard signal detection (for conditional steps)

/**
 * A loaded methodology preset from methodology/<name>.yml.
 * Defines the default configuration for a named approach.
 *
 * Invariants:
 * - name matches one of the three built-in presets
 * - default_depth is in range [1, 5]
 * - steps map contains an entry for every pipeline step (32 entries)
 * - every step entry has an 'enabled' boolean field
 */
interface MethodologyPreset {
  /** Preset name (e.g., "Deep Domain Modeling", "MVP", "Custom") */
  name: string;

  /** Human-readable description of the methodology */
  description: string;

  /** Default depth level for all steps without per-step overrides */
  defaultDepth: DepthLevel;

  /** Per-step configuration map, keyed by step name */
  steps: Record<StepName, StepConfig>;
}

/**
 * Raw configuration for a single step from a methodology preset.
 * This is the preset's declaration — may be overridden by custom config.
 */
interface StepConfig {
  /** Whether the step is enabled in this preset */
  enabled: boolean;

  /**
   * Conditional evaluation marker.
   * "if-needed" means the step is evaluated for relevance during init.
   * null/undefined means the step is unconditional.
   */
  conditional?: 'if-needed' | null;
}

/**
 * Custom overrides from config.yml's custom block.
 * Only present when methodology is 'custom'.
 * Fields are optional — omitted fields inherit from the preset.
 *
 * Invariants:
 * - defaultDepth, if present, is in range [1, 5]
 * - per-step depth overrides, if present, are in range [1, 5]
 */
interface CustomOverrides {
  /** Override for the preset's default_depth. Optional. */
  defaultDepth?: DepthLevel;

  /** Per-step overrides, keyed by step name. Only overridden steps are listed. */
  steps?: Record<StepName, CustomStepOverride>;
}

/**
 * A single step's overrides from the custom config block.
 * All fields are optional — omitted fields inherit from the preset.
 */
interface CustomStepOverride {
  /** Override enablement. If omitted, inherits from preset. */
  enabled?: boolean;

  /** Override depth for this specific step. If omitted, inherits default_depth. */
  depth?: DepthLevel;
}

/**
 * Fully resolved configuration for a single pipeline step.
 * The output of merging preset defaults with custom overrides.
 *
 * Invariants:
 * - depth is always in range [1, 5]
 * - provenance fields accurately reflect the source of each value
 * - if conditional is true and conditionalResolved is false, the step
 *   has not been evaluated for relevance yet
 */
interface EffectiveStepConfig {
  /** Step name */
  stepName: StepName;

  /** Whether the step is enabled (active in the pipeline) */
  enabled: boolean;

  /** Where the enablement decision came from */
  enablementProvenance: EnablementProvenance;

  /** The resolved depth level for this step */
  depth: DepthLevel;

  /** Where the depth value came from */
  depthProvenance: DepthProvenance;

  /** Whether the step is conditional (if-needed) */
  conditional: boolean;

  /**
   * Whether the conditional evaluation has been performed.
   * Relevant only when conditional is true.
   * Set to true after init wizard evaluates the step's relevance.
   */
  conditionalResolved: boolean;

  /**
   * Human-readable explanation of why the step has its current configuration.
   * Example: "Enabled by preset 'Deep Domain Modeling', depth 5 (preset default)"
   */
  explanation: string;
}

/**
 * The result of resolving depth for a specific step.
 * Used by the assembly engine (domain 15) to determine output rigor.
 */
interface DepthResolutionResult {
  /** The resolved depth level */
  depth: DepthLevel;

  /** Where the depth value came from */
  provenance: DepthProvenance;

  /** Human-readable explanation */
  explanation: string;
}

/**
 * The result of resolving enablement for a specific step.
 * Used by CLI commands to determine whether a step can be run.
 */
interface StepEnablementResult {
  /** Whether the step is enabled */
  enabled: boolean;

  /** Where the enablement decision came from */
  provenance: EnablementProvenance;

  /** The reason the step is disabled (if applicable) */
  reason?: string;

  /** Human-readable explanation */
  explanation: string;
}

/**
 * The complete set of effective step configurations for all pipeline steps.
 * The output of full pipeline resolution.
 *
 * Invariants:
 * - Contains exactly one entry per pipeline step (32 entries for the standard pipeline)
 * - Every step has a resolved depth and enablement status
 * - The ordered list matches the dependency-sorted order from domain 02
 */
interface ResolvedPipeline {
  /** Methodology name used for resolution */
  methodology: MethodologyName;

  /** The preset that was loaded */
  presetName: string;

  /** Default depth (after custom override, if applicable) */
  effectiveDefaultDepth: DepthLevel;

  /** Per-step effective configs, keyed by step name */
  steps: Record<StepName, EffectiveStepConfig>;

  /** Steps in dependency-sorted order (from domain 02) */
  orderedSteps: StepName[];

  /** Count of enabled steps */
  enabledCount: number;

  /** Count of disabled steps */
  disabledCount: number;

  /** Count of conditional steps */
  conditionalCount: number;
}

/**
 * A request to change methodology or depth configuration.
 * Used when a user modifies config.yml and runs a command.
 *
 * Invariants:
 * - newMethodology is a valid preset name
 * - If switchingPreset is true, completedSteps may have been run under different settings
 */
interface MethodologyChangeRequest {
  /** The previous methodology (from state.json) */
  previousMethodology: MethodologyName;

  /** The new methodology (from updated config.yml) */
  newMethodology: MethodologyName;

  /** Whether the preset itself changed (not just custom overrides) */
  switchingPreset: boolean;

  /** Steps already completed under the previous methodology */
  completedSteps: StepName[];

  /** Steps whose depth changed between old and new configuration */
  depthChangedSteps: DepthChange[];
}

/**
 * A depth change detected between two methodology configurations.
 */
interface DepthChange {
  /** Step name */
  stepName: StepName;

  /** Depth under previous configuration */
  previousDepth: DepthLevel;

  /** Depth under new configuration */
  newDepth: DepthLevel;

  /** Whether the step was already completed */
  alreadyCompleted: boolean;
}
```

---

## Section 4: State Transitions

The methodology & depth resolution domain does not have its own persistent state machine. It is a stateless resolver: given a config and a preset, it computes effective values. However, the **methodology itself can change**, and those changes interact with domain 03's pipeline state.

### Methodology Change Lifecycle

```
  [Config unchanged]
       |
       | User edits config.yml (changes methodology or depth)
       v
  [Change detected on next CLI command]
       |
       v
  Detect changes
       |── Preset changed (e.g., mvp → deep)
       |    |── Completed steps: unchanged in state.json
       |    |── Pending steps: re-resolved with new preset
       |    |── Depth changed for completed steps:
       |    |    → WARN "Step X was completed at depth 1, now configured at depth 5"
       |    |    → User can re-run to upgrade (triggers update mode in domain 15)
       |    └── Newly enabled steps: become available in pipeline
       |
       |── Only custom overrides changed
       |    |── Same behavior as preset change but more targeted
       |    └── Only affected steps are re-resolved
       |
       └── No change detected → proceed normally
```

### Conditional Step Evaluation Lifecycle

```
  [Step marked conditional: "if-needed"]
       |
       v
  Init wizard evaluates signals (domain 14)
       |── Signals detected → enabled in config, conditionalResolved: true
       |── No signals → disabled in config, conditionalResolved: true
       |── Wizard skipped → inherits preset default, conditionalResolved: false
       |
       v
  [User may override in config.yml at any time]
       |── User enables → enabled, enablementProvenance: custom_override
       └── User disables → disabled, enablementProvenance: custom_override
```

---

## Section 5: Core Algorithms

### Algorithm 1: Preset Loading

Loads and validates a methodology preset from YAML.

```
function loadPreset(methodologyName: MethodologyName): MethodologyPreset

  path = "methodology/" + methodologyName + ".yml"
  // For "deep" → methodology/deep.yml
  // For "mvp" → methodology/mvp.yml
  // For "custom" → methodology/custom-defaults.yml

  raw = readYaml(path)

  if raw is null:
    throw PRESET_NOT_FOUND("Methodology preset '${methodologyName}' not found at ${path}")

  // Validate required fields
  if raw.name is undefined: throw PRESET_INVALID("Missing 'name' field")
  if raw.default_depth is undefined: throw PRESET_INVALID("Missing 'default_depth' field")
  if raw.default_depth < 1 or raw.default_depth > 5: throw PRESET_INVALID("default_depth must be 1-5")
  if raw.steps is undefined: throw PRESET_INVALID("Missing 'steps' field")

  // Validate each step entry
  for each [stepName, stepConfig] in raw.steps:
    if stepConfig.enabled is not boolean:
      throw PRESET_INVALID("Step '${stepName}' missing 'enabled' field")

  return {
    name: raw.name,
    description: raw.description,
    defaultDepth: raw.default_depth,
    steps: raw.steps
  }
```

### Algorithm 2: Step Enablement Resolution

Resolves whether a specific step is enabled, with full provenance.

```
function resolveStepEnablement(
  stepName: StepName,
  preset: MethodologyPreset,
  customOverrides: CustomOverrides | null,
  conditionalSignals: Record<StepName, boolean> | null
): StepEnablementResult

  // Start with preset default
  presetStep = preset.steps[stepName]
  if presetStep is undefined:
    // Step not in preset — treat as enabled by default (forward compatibility)
    return { enabled: true, provenance: 'preset', explanation: "Not in preset, enabled by default" }

  enabled = presetStep.enabled
  provenance = 'preset'

  // Layer 2: Custom override (if methodology is 'custom' and step is listed)
  if customOverrides and customOverrides.steps and customOverrides.steps[stepName]:
    override = customOverrides.steps[stepName]
    if override.enabled is not undefined:
      enabled = override.enabled
      provenance = 'custom_override'

  // Layer 3: Conditional evaluation (for conditional steps not yet overridden by custom)
  if presetStep.conditional == 'if-needed' and provenance != 'custom_override':
    if conditionalSignals and conditionalSignals[stepName] is not undefined:
      enabled = conditionalSignals[stepName]
      provenance = 'conditional_detection'

  reason = null
  if not enabled:
    switch provenance:
      case 'preset': reason = "Disabled by ${preset.name} preset"
      case 'custom_override': reason = "Disabled by custom configuration"
      case 'conditional_detection': reason = "No signals detected for conditional step"

  explanation = buildEnablementExplanation(stepName, enabled, provenance, preset.name)

  return { enabled, provenance, reason, explanation }
```

Decision tree (full precedence):
1. Custom override `.enabled` → use it (provenance: `custom_override`)
2. Conditional signal detection → use it (provenance: `conditional_detection`)
3. Preset `.enabled` → use it (provenance: `preset`)

### Algorithm 3: Depth Resolution

Resolves the effective depth for a specific step.

```
function resolveDepth(
  stepName: StepName,
  preset: MethodologyPreset,
  customOverrides: CustomOverrides | null
): DepthResolutionResult

  // Start with preset default_depth
  depth = preset.defaultDepth
  provenance = 'preset_default'

  // Layer 2: Custom default_depth override
  if customOverrides and customOverrides.defaultDepth is not undefined:
    depth = customOverrides.defaultDepth
    provenance = 'custom_default'

  // Layer 3: Per-step depth override (highest precedence)
  if customOverrides and customOverrides.steps and customOverrides.steps[stepName]:
    override = customOverrides.steps[stepName]
    if override.depth is not undefined:
      if override.depth < 1 or override.depth > 5:
        throw INVALID_DEPTH("Depth override for '${stepName}' must be 1-5, got ${override.depth}")
      depth = override.depth
      provenance = 'step_override'

  explanation = buildDepthExplanation(stepName, depth, provenance, preset.name)

  return { depth, provenance, explanation }
```

Precedence chain:
1. Per-step depth override (config.yml `custom.steps.<step>.depth`) → highest
2. Custom default depth (config.yml `custom.default_depth`) → middle
3. Preset default depth (methodology YAML `default_depth`) → lowest

### Algorithm 4: Full Pipeline Resolution

Resolves the complete pipeline — all 32 steps' effective configurations.

```
function resolvePipeline(
  config: ValidatedConfig,
  sortedOrder: StepName[]  // from domain 02
): ResolvedPipeline

  preset = loadPreset(config.methodology)
  customOverrides = config.methodology == 'custom' ? config.custom : null
  conditionalSignals = loadConditionalSignals(config)  // from init wizard results

  steps = {}
  enabledCount = 0
  disabledCount = 0
  conditionalCount = 0

  for each stepName in sortedOrder:
    // Resolve enablement
    enablement = resolveStepEnablement(stepName, preset, customOverrides, conditionalSignals)

    // Resolve depth (only meaningful if enabled, but compute anyway for info display)
    depthResult = resolveDepth(stepName, preset, customOverrides)

    // Build effective config
    isConditional = preset.steps[stepName]?.conditional == 'if-needed'
    steps[stepName] = {
      stepName,
      enabled: enablement.enabled,
      enablementProvenance: enablement.provenance,
      depth: depthResult.depth,
      depthProvenance: depthResult.provenance,
      conditional: isConditional,
      conditionalResolved: enablement.provenance == 'conditional_detection'
        or enablement.provenance == 'custom_override',
      explanation: "${enablement.explanation}; ${depthResult.explanation}"
    }

    if enablement.enabled: enabledCount++
    else: disabledCount++
    if isConditional: conditionalCount++

  effectiveDefaultDepth = customOverrides?.defaultDepth ?? preset.defaultDepth

  return {
    methodology: config.methodology,
    presetName: preset.name,
    effectiveDefaultDepth,
    steps,
    orderedSteps: sortedOrder,
    enabledCount,
    disabledCount,
    conditionalCount
  }
```

Complexity: O(S) where S = number of pipeline steps (32). Each step requires constant-time lookups.

### Algorithm 5: Methodology Change Detection

Detects what changed when a user modifies methodology config between runs.

```
function detectMethodologyChange(
  previousMethodology: MethodologyName,
  currentConfig: ValidatedConfig,
  state: PipelineState
): MethodologyChangeRequest | null

  if previousMethodology == currentConfig.methodology:
    // Check for custom override changes (methodology name unchanged)
    if currentConfig.methodology != 'custom':
      return null  // deep and mvp presets have no custom overrides to change

    // Custom methodology — check if overrides changed
    // (This requires comparing resolved values, not raw config)
    previousResolved = resolvePipelineFromState(state)
    currentResolved = resolvePipeline(currentConfig, getStepOrder())

    changes = compareResolutions(previousResolved, currentResolved)
    if changes is empty:
      return null

    return buildChangeRequest(previousMethodology, currentConfig.methodology, false, changes, state)

  // Preset switched (e.g., mvp → deep)
  previousResolved = resolvePipelineFromState(state)
  currentResolved = resolvePipeline(currentConfig, getStepOrder())
  changes = compareResolutions(previousResolved, currentResolved)

  return buildChangeRequest(previousMethodology, currentConfig.methodology, true, changes, state)
```

### Algorithm 6: Custom Override Merging

Merges config.yml's custom block with the preset's step definitions.

```
function mergeCustomOverrides(
  preset: MethodologyPreset,
  customOverrides: CustomOverrides
): Record<StepName, EffectiveStepConfig>

  result = {}

  for each [stepName, presetConfig] in preset.steps:
    override = customOverrides.steps?.[stepName]

    // Enablement: custom override > preset
    enabled = override?.enabled ?? presetConfig.enabled
    enablementProv = override?.enabled !== undefined ? 'custom_override' : 'preset'

    // Depth: per-step override > custom default > preset default
    if override?.depth !== undefined:
      depth = override.depth
      depthProv = 'step_override'
    else if customOverrides.defaultDepth !== undefined:
      depth = customOverrides.defaultDepth
      depthProv = 'custom_default'
    else:
      depth = preset.defaultDepth
      depthProv = 'preset_default'

    result[stepName] = buildEffectiveConfig(stepName, enabled, enablementProv, depth, depthProv, presetConfig)

  return result
```

---

## Section 6: Error Taxonomy

```typescript
/**
 * Error codes for methodology resolution failures.
 */
type MethodologyErrorCode =
  | 'PRESET_NOT_FOUND'     // methodology YAML file not found
  | 'PRESET_INVALID'       // methodology YAML fails validation
  | 'INVALID_DEPTH'        // depth value outside range [1, 5]
  | 'UNKNOWN_STEP'         // custom override references a step not in the pipeline
  | 'CONFIG_MISMATCH'      // state.json methodology doesn't match config.yml
  ;

/**
 * A fatal error from methodology resolution.
 */
interface MethodologyError {
  /** Error code for programmatic handling */
  code: MethodologyErrorCode;

  /** Human-readable error message */
  message: string;

  /** Suggested recovery action */
  recovery: string;
}

/**
 * Warning codes for non-fatal methodology issues.
 */
type MethodologyWarningCode =
  | 'DEPTH_DOWNGRADE'            // re-running at lower depth than previous execution
  | 'METHODOLOGY_CHANGED'        // methodology changed since last run
  | 'COMPLETED_AT_LOWER_DEPTH'   // step completed at lower depth than current config
  | 'UNKNOWN_STEP_IN_CUSTOM'     // custom block references unknown step (ignored)
  | 'CONDITIONAL_NOT_EVALUATED'  // conditional step not yet evaluated by init wizard
  ;

/**
 * A non-fatal warning from methodology resolution.
 */
interface MethodologyWarning {
  /** Warning code for programmatic handling */
  code: MethodologyWarningCode;

  /** Human-readable warning message */
  message: string;

  /** The step involved (if applicable) */
  stepName?: StepName;
}
```

---

## Section 7: Integration Points

### Domain 06 (Config Validation) → This Domain

Domain 06 provides the validated config. This domain reads:
- `methodology` field (which preset to load)
- `custom` block (default_depth override, per-step overrides)
- `project.platforms` (informs conditional step detection signals)

The config schema is domain 06's territory. This domain does not validate config structure — it trusts that domain 06 has already validated it.

### Domain 14 (Init Wizard) → This Domain

Domain 14 produces the initial methodology config during `scaffold init`. The wizard:
- Presents methodology selection (Deep/MVP/Custom)
- Evaluates conditional step signals
- Writes the result to `config.yml`

This domain resolves the config that domain 14 writes. The wizard may also pre-set custom overrides for conditional steps based on detection signals.

### This Domain → Domain 15 (Assembly Engine)

The assembly engine queries this domain for:
- **Step enablement**: Is the step active in the current methodology? (Used in prerequisite checking, step 2 of the execution sequence.)
- **Effective depth**: What depth level should be used for this step? (Used in step 6 of the execution sequence, and included in the methodology section of the assembled prompt.)
- **Depth provenance**: Where did the depth value come from? (Included in the assembled prompt's methodology section for AI context.)

### This Domain → Domain 02 (Dependency Resolution)

Step enablement affects the dependency graph. When a step is disabled:
- Domain 02 excludes it from the active step set
- Dependents of disabled steps may become unblocked (if the disabled step was their only remaining dependency)
- Domain 02's `excludedSlugs` set contains disabled steps

### This Domain → Domain 03 (Pipeline State Machine)

Depth is recorded in `state.json` when a step completes:
- The `depth` field in `PromptStateEntry` records the depth used for execution
- This enables methodology change detection (completed at depth 1, now configured at depth 5)
- Domain 03 reads this domain's output to understand what depth to record

### This Domain → Domain 09 (CLI Architecture)

Multiple CLI commands query this domain:
- `scaffold list`: Shows enablement status and depth for each step
- `scaffold info <step>`: Shows effective configuration with provenance
- `scaffold next`: Filters eligible steps to only enabled steps
- `scaffold status`: Shows depth alongside completion status

---

## Section 8: Edge Cases & Failure Modes

### 1. Custom methodology with no explicit step overrides

**Scenario**: User selects `custom` methodology but provides no `custom.steps` block in config.yml.
**Expected behavior**: All steps inherit from `custom-defaults.yml`. All 32 steps are enabled at depth 3 (the custom-defaults preset's default_depth). This is equivalent to the balanced preset.

### 2. Step not listed in custom config

**Scenario**: config.yml has `custom.steps` but only lists 5 steps.
**Expected behavior**: The 5 listed steps get their overrides applied. The remaining 27 steps inherit entirely from the preset (enabled status from `custom-defaults.yml`, depth from `custom.default_depth` or preset `default_depth`).

### 3. Depth override of 0

**Scenario**: config.yml has `custom.steps.create-prd.depth: 0`.
**Expected behavior**: Validation error `INVALID_DEPTH`. Depth must be in range [1, 5]. The CLI rejects the config before resolution begins (domain 06 should catch this, but this domain validates defensively).

### 4. Switching from MVP to Deep mid-pipeline

**Scenario**: User ran `create-prd` at depth 1 under MVP. Then changes config to `methodology: deep`.
**Expected behavior**:
- State records: `create-prd` completed at depth 1.
- New resolution: `create-prd` now configured at depth 5.
- Emit warning `COMPLETED_AT_LOWER_DEPTH`: "create-prd was completed at depth 1, now configured at depth 5. Re-run with `scaffold run create-prd` to upgrade."
- All previously disabled steps (28 steps in MVP) become enabled.
- Completed steps are NOT re-run automatically — user must explicitly re-run them.

### 5. Conditional step enabled by user override despite no detection signal

**Scenario**: Init wizard did not detect database signals, so `database-schema` was disabled. User manually sets `custom.steps.database-schema.enabled: true`.
**Expected behavior**: Step becomes enabled. Enablement provenance: `custom_override`. The conditional detection result is overridden. The step appears in `scaffold next` when its dependencies are met.

### 6. Preset file missing or malformed

**Scenario**: `methodology/deep.yml` is deleted or contains invalid YAML.
**Expected behavior**: Error `PRESET_NOT_FOUND` or `PRESET_INVALID`. The CLI cannot resolve methodology without the preset file. Recovery suggestion: "Reinstall scaffold or restore methodology/deep.yml".

### 7. Re-running a completed step at a higher depth

**Scenario**: `create-prd` completed at depth 1. User changes config to depth 3 and runs `scaffold run create-prd`.
**Expected behavior**: Domain 16 resolves depth as 3 with appropriate provenance. Domain 15 (assembly engine) detects the step is already completed, enters update mode, and includes the depth change context (previous: 1, current: 3, depthIncreased: true) in the assembled prompt.

### 8. Re-running a completed step at a lower depth

**Scenario**: `create-prd` completed at depth 5. User changes config to depth 1 and runs `scaffold run create-prd`.
**Expected behavior**: Emit warning `DEPTH_DOWNGRADE`: "Re-running create-prd at depth 1 (previously completed at depth 5). This may produce a simpler artifact." The assembly engine proceeds with update mode. This is allowed but warned — the user may be intentionally simplifying.

**Open question**: Should downgrade be allowed without `--force`? See Section 10.

### 9. Config.yml methodology doesn't match state.json methodology

**Scenario**: State.json records `methodology: "mvp"` but config.yml says `methodology: "deep"`.
**Expected behavior**: Emit warning `METHODOLOGY_CHANGED`. Proceed with the config.yml methodology (config is the source of truth for current settings). State.json records what was used historically — it doesn't constrain future runs.

### 10. Unknown step name in custom overrides

**Scenario**: config.yml has `custom.steps.nonexistent-step.depth: 3`.
**Expected behavior**: Emit warning `UNKNOWN_STEP_IN_CUSTOM`. The unknown step is ignored. Resolution continues for all known steps. This provides forward compatibility — a newer config format won't break an older CLI.

---

## Section 9: Testing Considerations

### Key Test Categories

1. **Preset loading**: Test with valid presets (deep, mvp, custom-defaults), missing files, malformed YAML, missing required fields, extra unknown fields.

2. **Depth resolution**: Test all precedence levels — preset default only, custom default override, per-step override. Test boundary values (1, 5) and invalid values (0, 6, -1, "high").

3. **Enablement resolution**: Test all provenance paths — preset default, custom override enabling, custom override disabling, conditional detection enabling, conditional detection disabling. Test precedence (custom override wins over conditional detection wins over preset).

4. **Full pipeline resolution**: Test with each preset (deep = all enabled at depth 5, mvp = 4 enabled at depth 1, custom = various). Verify counts (enabled, disabled, conditional).

5. **Methodology change detection**: Test preset switch (mvp → deep), custom override change, no change, depth change on completed step, depth change on pending step.

6. **Custom override merging**: Test with no overrides, partial overrides, full overrides, overrides for unknown steps, depth-only overrides, enabled-only overrides.

### Boundary Conditions

- All 32 steps enabled (deep preset)
- Only 4 steps enabled (mvp preset)
- All steps disabled via custom overrides (pathological but valid)
- Depth 1 everywhere (mvp default)
- Depth 5 everywhere (deep default)
- Mixed depths across steps (custom with per-step overrides)
- Conditional step with no detection signal and no custom override
- Empty custom block (valid — inherits everything from preset)

### What to Mock vs. Real Data

- **Real data**: Use the actual methodology YAML files (`methodology/deep.yml`, etc.) in integration tests to catch drift between the domain model and the preset files.
- **Mock**: Config.yml (provide in-memory fixtures with various custom block configurations), conditional detection signals (provide fixed boolean maps), pipeline step order (provide a fixed step list).

---

## Section 10: Open Questions & Recommendations

### Must Resolve Before Implementation

1. **Depth downgrade policy**: Should re-running a completed step at a *lower* depth require `--force`? Arguments for: prevents accidental quality regression. Arguments against: the user explicitly chose to re-run at a different depth. **Recommendation**: Allow without `--force` but emit a prominent warning. The user is in control.

2. **Methodology field in state.json**: Should state.json's `methodology` field be updated when the user changes methodology in config.yml, or should it remain as the originally initialized value? **Recommendation**: Keep the original value as a historical record. Add a separate `last_methodology` or similar if tracking the most recent methodology is needed. The config is the source of truth for current settings.

3. **Conditional step re-evaluation**: If a user adds a database dependency after init (e.g., installs PostgreSQL), should `scaffold validate` suggest re-evaluating conditional steps? **Recommendation**: Yes — `scaffold validate` should re-run conditional signal detection and warn if new signals are found for disabled conditional steps.

### Can Defer

4. **Custom preset definitions**: Users may want to define their own named presets beyond deep/mvp/custom. This would require a preset discovery mechanism (scan `methodology/` directory). Defer until user demand exists.

5. **Depth interpolation**: Some users may want depth 2.5 or non-integer depth. The current model uses integers only. Defer — the 5-level scale provides sufficient granularity.

6. **Team-level methodology coordination**: In multi-agent scenarios, agents may need to coordinate methodology changes. Currently, config.yml is the shared state. If more coordination is needed, it can be added to the locking mechanism (domain 13).

---

## Section 11: Concrete Examples

### Example 1: Deep Methodology — Full Resolution

**Config**: `methodology: deep` (no custom block)

```
Load preset: methodology/deep.yml
  - name: "Deep Domain Modeling"
  - default_depth: 5
  - steps: all 32 steps enabled

Resolve each step:
  create-prd:
    enabled: true (provenance: preset)
    depth: 5 (provenance: preset_default)
    conditional: false
    explanation: "Enabled by preset 'Deep Domain Modeling', depth 5 (preset default)"

  review-prd:
    enabled: true (provenance: preset)
    depth: 5 (provenance: preset_default)
    conditional: false

  innovate-prd:
    enabled: true (provenance: preset)
    depth: 5 (provenance: preset_default)
    conditional: true (if-needed)
    conditionalResolved: false (not yet evaluated by init wizard)

  database-schema:
    enabled: true (provenance: preset)
    depth: 5 (provenance: preset_default)
    conditional: true (if-needed)
    conditionalResolved: false (not yet evaluated by init wizard)

  ... (all 32 steps at depth 5, enabled)

Result:
  methodology: "deep"
  effectiveDefaultDepth: 5
  enabledCount: 32
  disabledCount: 0
  conditionalCount: 6 (database-schema, review-database, api-contracts, review-api, ux-spec, review-ux)
```

### Example 2: MVP Methodology

**Config**: `methodology: mvp` (no custom block)

```
Load preset: methodology/mvp.yml
  - name: "MVP"
  - default_depth: 1
  - steps: 4 enabled, 28 disabled

Resolve each step:
  create-prd:
    enabled: true (provenance: preset)
    depth: 1 (provenance: preset_default)

  review-prd:
    enabled: false (provenance: preset)
    depth: 1 (provenance: preset_default)
    reason: "Disabled by MVP preset"

  innovate-prd:
    enabled: false (provenance: preset)
    depth: 1 (provenance: preset_default)
    reason: "Disabled by MVP preset"

  implementation-tasks:
    enabled: true (provenance: preset)
    depth: 1 (provenance: preset_default)

  testing-strategy:
    enabled: true (provenance: preset)
    depth: 1 (provenance: preset_default)

  implementation-playbook:
    enabled: true (provenance: preset)
    depth: 1 (provenance: preset_default)

  ... (28 other steps disabled at depth 1)

Result:
  methodology: "mvp"
  effectiveDefaultDepth: 1
  enabledCount: 4
  disabledCount: 28
```

### Example 3: Custom Methodology with Mixed Overrides

**Config**:
```yaml
methodology: custom
custom:
  default_depth: 3
  steps:
    create-prd:
      enabled: true
      depth: 4
    review-prd:
      enabled: true
    innovate-prd:
      enabled: false
    domain-modeling:
      depth: 5
    database-schema:
      enabled: true
```

```
Load preset: methodology/custom-defaults.yml
  - default_depth: 3 (overridden by custom.default_depth: 3 — same value)
  - steps: all 32 enabled

Apply custom overrides:

  create-prd:
    enabled: true (provenance: custom_override — explicitly set)
    depth: 4 (provenance: step_override — per-step depth)

  review-prd:
    enabled: true (provenance: custom_override — explicitly set)
    depth: 3 (provenance: custom_default)

  innovate-prd:
    enabled: false (provenance: custom_override — explicitly disabled)
    depth: 3 (provenance: custom_default)
    reason: "Disabled by custom configuration"

  domain-modeling:
    enabled: true (provenance: preset — not overridden)
    depth: 5 (provenance: step_override — per-step depth)

  database-schema:
    enabled: true (provenance: custom_override — user override)
    depth: 3 (provenance: custom_default)
    conditional: true (if-needed)
    conditionalResolved: true (overridden by custom_override)

  adrs:
    enabled: true (provenance: preset — not listed in custom.steps)
    depth: 3 (provenance: custom_default)

  ... (remaining steps: enabled from preset, depth 3 from custom default)

Result:
  methodology: "custom"
  effectiveDefaultDepth: 3
  enabledCount: 31
  disabledCount: 1
```
