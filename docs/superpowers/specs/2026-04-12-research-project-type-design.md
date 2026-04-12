# Research Project Type — Design Spec

**Date**: 2026-04-12
**Status**: Approved (pending implementation)
**Scope**: Add `research` as scaffold's 10th project type

## Overview

The `research` type covers autonomous and semi-autonomous experiment loops — an LLM agent (or human-guided script) iteratively generates hypotheses, runs experiments, evaluates results, and iterates. Use cases include quantitative finance (trading strategy backtesting and parameter optimization), ML model architecture search, and physics/materials/engineering simulation optimization.

**Origin**: Inspired by [autoresearch-mlx](https://github.com/trevin-creator/autoresearch-mlx), a minimal framework where an LLM edits source code, runs experiments, and uses git keep/revert as a state machine. The `research` type generalizes this pattern to support multiple orchestration styles and research domains.

**Why a new type (not `ml` or `data-pipeline`)**: The ML type's knowledge base is deeply PyTorch/CUDA-specific (DDP, FSDP, model serving, feature stores). The overlay system is additive-only — using `ml` would inject 12 irrelevant PyTorch knowledge files into every research project with no way to remove them. The research domain has distinct concerns (backtesting validity, parameter sensitivity analysis, experiment loop architecture) that neither `ml` nor `data-pipeline` covers.

## 1. Config Schema

Four fields. One required (`experimentDriver`), three with defaults.

```typescript
export const ResearchConfigSchema = z.object({
  // How experiments are driven — the mechanism the agent uses to run experiments
  experimentDriver: z.enum([
    'code-driven',       // Agent modifies source files, runs them, reads output
    'config-driven',     // Agent generates config files, fixed runner consumes them
    'api-driven',        // Agent calls experiment/backtest API with parameters
    'notebook-driven',   // Agent generates/edits notebooks, executes cells
  ]),

  // How the agent interacts with humans during the research loop
  interactionMode: z.enum([
    'autonomous',        // Agent runs indefinitely until interrupted
    'checkpoint-gated',  // Agent pauses for human review at intervals
    'human-guided',      // Human decides what to try, agent executes
  ]).default('checkpoint-gated'),

  // Whether to scaffold experiment tracking infrastructure
  hasExperimentTracking: z.boolean().default(true),

  // Research domain — drives which domain sub-overlay is applied
  domain: z.enum([
    'none',              // Core research knowledge only
    'quant-finance',     // Trading strategies, backtesting, risk analysis
    'ml-research',       // Model architecture search, hyperparameter optimization
    'simulation',        // Physics, materials, engineering parameter optimization
  ]).default('none'),
}).strict()
```

### Design Principles Applied

- **"Changes pipeline structure" bar**: `experimentDriver` and `interactionMode` change how architecture, testing, and operations steps are structured. `hasExperimentTracking` gates whether tracking infrastructure is scaffolded in the generated project (the overlay always injects tracking *knowledge* so the architecture step understands the concept, but the field tells that step whether to actually scaffold MLflow/results-database infrastructure). `domain` drives sub-overlay selection (persistence and validation require a typed field — `.passthrough()` is insufficient because wizard/adopt writers only serialize typed fields).
- **Field count**: 4 fields matches the codebase norm (ML: 4, WebApp: 4, Backend: 5, CLI: 3).
- **`domain` uses `'none'` not `.optional()`**: Every other absent concept in the codebase uses a `'none'` enum value (`offlineSupport`, `asyncMessaging`, `servingPattern`, etc.). Implementation caveat: always check `domain !== 'none'`, never `if (domain)` — the string `'none'` is truthy.

### Cross-Field Validation

In `ProjectSchema.superRefine()` (not in `ResearchConfigSchema` — avoids `ZodEffects` breaking `.shape` introspection):

```typescript
if (data.researchConfig) {
  if (data.projectType !== 'research') {
    ctx.addIssue({ path: ['researchConfig'], code: 'custom',
      message: 'researchConfig requires projectType: research' })
  }
  const { experimentDriver, interactionMode } = data.researchConfig
  if (experimentDriver === 'notebook-driven' && interactionMode === 'autonomous') {
    ctx.addIssue({ path: ['researchConfig', 'interactionMode'], code: 'custom',
      message: 'Notebook-driven execution cannot be fully autonomous' })
  }
}
```

### Structural Justification for `experimentDriver`

Each value produces meaningfully different guidance across 4+ pipeline steps:

| Pipeline Step | code-driven | config-driven | api-driven | notebook-driven |
|---|---|---|---|---|
| system-architecture | Git state machine, file mutation, rollback | Config schema, validation, runner interface | API client, request schemas, retry/backoff | Notebook execution engine, cell tracking |
| tdd | Code diff validation, syntax checks | Config validity, schema conformance | API contract tests, response validation | Notebook cell output assertions |
| operations | Git branch management, hard-reset recovery | Config versioning, sweep orchestration | API health monitoring, rate limiting | Notebook server lifecycle, kernel management |
| security | Code injection risk, sandbox boundaries | Config injection, secret handling | API auth, credential rotation | Kernel isolation, output sanitization |

## 2. Detector

File: `src/project/detectors/research.ts`

### Shared Signal Library

New file: `src/project/detectors/shared-signals.ts`

```typescript
export const ML_FRAMEWORK_DEPS = [
  'torch', 'pytorch-lightning', 'tensorflow', 'keras', 'jax',
  'scikit-learn', 'xgboost', 'lightgbm', 'catboost',
  'transformers', 'sentence-transformers', 'mlx',
]

export const EXPERIMENT_TRACKING_DEPS = [
  'mlflow', 'wandb', 'neptune-client', 'clearml', 'dvc',
]
```

Both `ml.ts` and `research.ts` import from this module. Existing `ML_FRAMEWORK_DEPS` in `ml.ts` is replaced with the shared import. Note: `mlx` is added to `ML_FRAMEWORK_DEPS` (MLX is a training framework, not a research signal).

### Boundary Heuristic

- **`ml`** = "I'm building a model or serving system"
- **`research`** = "I'm building an autonomous experiment loop that iterates on hypotheses"

### Disambiguation

Confidence-based, not ordering-based. Detector order in `ALL_DETECTORS` is performance-only (per `index.ts` comment).

- Research high + ml medium/low: `resolveDetection` Case B auto-commits research (single high match)
- Both high: Case C prompts user (multiple high matches) or `--project-type` flag in non-TTY
- `PROJECT_TYPE_PREFERENCE` in `disambiguate.ts`: add `'research'` after `'ml'`, producing: `'web-app', 'backend', 'cli', 'library', 'mobile-app', 'data-pipeline', 'ml', 'research', 'browser-extension', 'game'`

### Detection Tiers

**High confidence** (defining artifact + verified structure):

| Signal | Verification | Partial Config |
|---|---|---|
| `program.md` + `results.tsv` | `program.md` content contains experiment-loop markers (first 500 bytes checked for "loop", "iterate", "experiment", "run", "evaluate") | `experimentDriver: 'code-driven'`, `interactionMode: 'autonomous'` |
| `backtest.py`/`strategy.py` + trading deps | Import verification inside file (`from backtrader`, `from zipline`, etc.) | `experimentDriver: 'code-driven'`, `domain: 'quant-finance'` |
| Medium-tier signal + academic artifacts (`.tex`, `.bib`, `paper/`) | Academic artifacts as upgrade evidence | Inherits from medium match |

**Medium confidence** (framework dep + structure, with negative gates):

| Signal | Guard | Partial Config |
|---|---|---|
| Optimization deps (optuna, hyperopt, pymoo, nevergrad) + `results/`/`experiments/` dir | `!hasAnyDep(ML_FRAMEWORK_DEPS)` | `experimentDriver: 'config-driven'` |
| Non-W&B `sweep.yaml`/`sweep_config.yaml` + results dir | Content check: reject if W&B top-level keys (`method:` + `metric:` + `parameters:`) | `experimentDriver: 'config-driven'`, `interactionMode: 'autonomous'` |
| Trading deps (backtrader, zipline, vectorbt, ccxt) + no web/API framework | No Express/FastAPI/Django deps | `experimentDriver: 'code-driven'`, `domain: 'quant-finance'` |
| Simulation deps (openfoam, fenics, simpy, pyomo, deap) + experiment structure | - | `experimentDriver: 'code-driven'`, `domain: 'simulation'` |
| LLM SDK deps (openai, anthropic, langchain) + eval structure (`evals/`, `results.jsonl`) | No `train.py` | `experimentDriver: 'api-driven'` |

**Low confidence** (weak signals):

| Signal | Partial Config |
|---|---|
| Notebooks + optimization deps (regardless of ML deps) | `experimentDriver: 'notebook-driven'` |
| `experiment.py` or `experiments/` dir alone | `experimentDriver: 'code-driven'` (default) |

**Experiment tracking**: If `hasAnyDep(EXPERIMENT_TRACKING_DEPS)`, set `hasExperimentTracking: true` in partial config. Shared with ML detector.

**`human-guided`** is not detectable — it is an intent question. Wizard/flag only. Documented design decision.

### Known Limitations

- Python-only detection. R, Julia, MATLAB research projects are not covered.
- Future enhancement: quant-finance signals may warrant extraction to a dedicated type if adoption is high.

## 3. Overlay System

### Architecture: Core + Domain Sub-Overlays

```
content/methodology/
  research-overlay.yml          <- core (always applied)
  research-quant-finance.yml    <- domain sub-overlay (knowledge-only)
  research-ml-research.yml      <- domain sub-overlay (knowledge-only)
  research-simulation.yml       <- domain sub-overlay (knowledge-only)
```

### Design Constraints

1. **Domain sub-overlays are knowledge-only**: They may use `knowledge-overrides` only. Never `step-overrides`, `reads-overrides`, or `dependency-overrides`. This ensures identical `researchConfig` always produces the same pipeline structure.
2. **Enforced at loader level**: A `loadSubOverlay()` variant (or `subOverlay: true` flag) warns when non-knowledge sections are present and strips them before returning.
3. **Domain selection lives in `researchConfig.domain`**: The overlay resolver reads this typed, validated field. No `.passthrough()` hack.

### Resolver Extension (Generic)

The resolver extension is **not research-specific**. It uses a generic convention reusable by future types:

```
For ANY project type:
  1. Load {projectType}-overlay.yml -> apply to pipeline state -> get mergedState
  2. If typeConfig has a `domain` field AND domain !== 'none':
     a. Load {projectType}-{domain}.yml as sub-overlay (warn if non-knowledge sections)
     b. Apply knowledge-overrides only, starting from mergedState (not original frontmatter)
  3. Return final mergedState
```

**Critical implementation invariant**: The sub-overlay pass must receive the `overlayKnowledge` map output from the core pass, not the original step frontmatter maps. A naive second `applyOverlay` call starting from original maps would drop core research additions.

### Core Overlay: `research-overlay.yml`

21 steps mapped (matching ml and data-pipeline coverage):

```yaml
name: research
description: >
  Research overlay — injects research domain knowledge into existing
  pipeline steps for experiment loop architecture, tracking, evaluation,
  overfitting prevention, and domain-specific patterns.
project-type: research

knowledge-overrides:
  # Foundational (6 steps)
  create-prd:
    append: [research-requirements]
  user-stories:
    append: [research-requirements]
  coding-standards:
    append: [research-conventions]
  project-structure:
    append: [research-project-structure]
  dev-env-setup:
    append: [research-dev-environment]
  git-workflow:
    append: [research-conventions]

  # Architecture & Design (6 steps)
  system-architecture:
    append: [research-architecture, research-experiment-loop]
  tech-stack:
    append: [research-architecture]
  adrs:
    append: [research-architecture]
  domain-modeling:
    append: [research-experiment-loop]
  security:
    append: [research-security]
  operations:
    append: [research-experiment-tracking, research-observability]

  # Testing (4 steps)
  tdd:
    append: [research-testing, research-overfitting-prevention]
  add-e2e-testing:
    append: [research-testing]
  create-evals:
    append: [research-testing, research-overfitting-prevention]
  story-tests:
    append: [research-testing]

  # Reviews (4 steps)
  review-architecture:
    append: [research-architecture, research-experiment-loop]
  review-security:
    append: [research-security]
  review-operations:
    append: [research-experiment-tracking, research-observability]
  review-testing:
    append: [research-testing, research-overfitting-prevention]

  # Planning (1 step)
  implementation-plan:
    append: [research-architecture]
```

### Domain Sub-Overlays

**Naming convention**: `{projectType}-{domain}.yml` (no `-overlay` suffix). Sub-overlays use the shorter form.

**`research-quant-finance.yml`**:
```yaml
name: research-quant-finance
description: >
  Quant-finance domain sub-overlay — adds trading strategy, backtesting,
  risk analysis, and market data knowledge to research projects.
project-type: research
domain: quant-finance

knowledge-overrides:
  create-prd:
    append: [research-quant-requirements]
  system-architecture:
    append: [research-quant-backtesting, research-quant-strategy-patterns]
  domain-modeling:
    append: [research-quant-market-data]
  security:
    append: [research-quant-risk]
  operations:
    append: [research-quant-metrics]
  tdd:
    append: [research-quant-backtesting]
  create-evals:
    append: [research-quant-metrics, research-quant-backtesting]
  review-architecture:
    append: [research-quant-backtesting, research-quant-strategy-patterns]
  review-testing:
    append: [research-quant-backtesting]
  implementation-plan:
    append: [research-quant-backtesting, research-quant-strategy-patterns]
```

**`research-ml-research.yml`**:
```yaml
name: research-ml-research
description: >
  ML-research domain sub-overlay — adds architecture search, training
  patterns, and evaluation knowledge for ML research projects.
project-type: research
domain: ml-research

knowledge-overrides:
  system-architecture:
    append: [research-ml-architecture-search, research-ml-training-patterns]
  operations:
    append: [research-ml-experiment-tracking]
  tdd:
    append: [research-ml-evaluation]
  create-evals:
    append: [research-ml-evaluation]
  review-architecture:
    append: [research-ml-architecture-search]
  review-testing:
    append: [research-ml-evaluation]
  implementation-plan:
    append: [research-ml-architecture-search]
```

**`research-simulation.yml`**:
```yaml
name: research-simulation
description: >
  Simulation domain sub-overlay — adds physics/materials simulation engine,
  parameter space, and compute management knowledge.
project-type: research
domain: simulation

knowledge-overrides:
  system-architecture:
    append: [research-sim-engine-patterns, research-sim-parameter-spaces]
  domain-modeling:
    append: [research-sim-parameter-spaces]
  operations:
    append: [research-sim-compute-management]
  tdd:
    append: [research-sim-validation]
  create-evals:
    append: [research-sim-validation, research-sim-parameter-spaces]
  review-architecture:
    append: [research-sim-engine-patterns]
  implementation-plan:
    append: [research-sim-engine-patterns]
```

### Knowledge File Inventory

**Core research** (11 files in `content/knowledge/research/`):

| File | Purpose |
|---|---|
| `research-requirements.md` | Research project requirements patterns |
| `research-conventions.md` | Research code conventions, experiment branching |
| `research-project-structure.md` | Directory structure for research projects |
| `research-dev-environment.md` | Research dev tooling setup |
| `research-architecture.md` | Experiment runner architecture, state management |
| `research-experiment-loop.md` | Autonomous loop patterns, keep/discard logic, iteration control |
| `research-experiment-tracking.md` | Results logging, comparison, reproducibility |
| `research-testing.md` | Testing experiment loops, result validation |
| `research-overfitting-prevention.md` | Out-of-sample validation, cross-validation, when to stop |
| `research-security.md` | Sandboxing, resource limits, credential handling |
| `research-observability.md` | Experiment monitoring, anomaly detection |

**Quant-finance domain** (6 files):

| File | Purpose |
|---|---|
| `research-quant-requirements.md` | Trading system research requirements |
| `research-quant-backtesting.md` | Walk-forward analysis, look-ahead bias, survivorship bias, transaction costs |
| `research-quant-metrics.md` | Sharpe, Sortino, max drawdown, profit factor, win rate, expectancy |
| `research-quant-market-data.md` | OHLCV sources, tick data, corporate actions, data quality |
| `research-quant-strategy-patterns.md` | Entry/exit rules, position sizing, stop-loss, multi-asset allocation |
| `research-quant-risk.md` | Regime detection, tail risk, Kelly criterion, position limits |

**ML-research domain** (4 files, adapted from existing `ml` knowledge):

| File | Purpose |
|---|---|
| `research-ml-architecture-search.md` | NAS patterns, architecture mutation strategies |
| `research-ml-training-patterns.md` | Training loop patterns adapted for research iteration |
| `research-ml-evaluation.md` | Model evaluation in research context (not production) |
| `research-ml-experiment-tracking.md` | MLflow/W&B for research (lighter than production ML) |

**Simulation domain** (4 files):

| File | Purpose |
|---|---|
| `research-sim-engine-patterns.md` | Physics/materials simulation engine integration |
| `research-sim-parameter-spaces.md` | Parameter space definition, dimensionality, interaction effects |
| `research-sim-validation.md` | Simulation validation against known solutions, convergence |
| `research-sim-compute-management.md` | Compute budgets, parallelization, resource scheduling |

**Total: 11 core + 6 quant + 4 ml-research + 4 simulation = 25 knowledge files.**

Each file follows the existing knowledge file structure: frontmatter (name, description, topics) + Summary section + Deep Guidance section.

## 4. Wizard

### Copy

The copy object follows the `QuestionCopy` type in `src/wizard/copy/types.ts` (which has `short`, `long`, and `options` fields — no `prompt` field). Prompt strings live directly in `src/wizard/questions.ts`.

```typescript
// src/wizard/copy/research.ts
export const researchCopy = {
  experimentDriver: {
    options: {
      'code-driven':     { label: 'Code-driven',     short: 'Modifies source files, executes them, reads output.' },
      'config-driven':   { label: 'Config-driven',   short: 'Generates config files consumed by a fixed runner.' },
      'api-driven':      { label: 'API-driven',      short: 'Calls an experiment API with parameters.' },
      'notebook-driven': { label: 'Notebook-driven', short: 'Generates or edits notebooks, executes cells.' },
    },
  },
  interactionMode: {
    options: {
      'autonomous':       { label: 'Autonomous',       short: 'Runs indefinitely until interrupted.' },
      'checkpoint-gated': { label: 'Checkpoint-gated', short: 'Pauses for human review at intervals.' },
      'human-guided':     { label: 'Human-guided',     short: 'Human decides what to try, agent executes.' },
    },
  },
  domain: {
    options: {
      'none':           { label: 'None',           short: 'No domain-specific knowledge.' },
      'quant-finance':  { label: 'Quant finance',  short: 'Trading strategies, backtesting, risk analysis.' },
      'ml-research':    { label: 'ML research',    short: 'Model architecture search, hyperparameter optimization.' },
      'simulation':     { label: 'Simulation',     short: 'Physics, materials, engineering parameter optimization.' },
    },
  },
  hasExperimentTracking: {},
} satisfies ResearchCopy
```

Prompt strings in `src/wizard/questions.ts` (inside the research question block):
- `'Experiment driver?'`
- `'Interaction mode?'`
- `'Research domain?'`
- `'Experiment tracking?'`

Project-type selection copy in `src/wizard/copy/core.ts`:
```typescript
'research': {
  label: 'Research project',
  short: 'Iterative experiment loops where an agent drives the research cycle.',
},
```

### Question Flow

1. **"Experiment driver?"** (required, no default)
2. **"Interaction mode?"** (default: checkpoint-gated) — smart filtering: if `experimentDriver === 'notebook-driven'`, omit `'autonomous'` from options
3. **"Research domain?"** (default: none)
4. **"Experiment tracking?"** (default: true)

### Auto-Mode & Non-Interactive Behavior

- `--research-driver` is required in `--auto` mode. Missing = error: `'--research-driver is required in auto mode for research projects'`. Note: `init` currently does not convert JSON output mode to effective auto mode (unlike `adopt`), so JSON output without `--auto` will silently pick the first option for required fields. This is a pre-existing `init` behavior, not specific to research.
- All other fields use defaults if flags are omitted
- Flag-level validation in `applyFlagFamilyValidation` rejects `notebook-driven + autonomous`
- Schema-level validation in `superRefine` also rejects `notebook-driven + autonomous` (catches invalid YAML configs)

### CLI Flags

| Flag | Maps to | Type |
|---|---|---|
| `--research-driver` | `experimentDriver` | enum |
| `--research-interaction` | `interactionMode` | enum |
| `--research-domain` | `domain` | enum |
| `--research-tracking` / `--no-research-tracking` | `hasExperimentTracking` | boolean |

### Flag Interface

```typescript
// src/wizard/flags.ts
export interface ResearchFlags {
  researchDriver?: ResearchConfig['experimentDriver']
  researchInteraction?: ResearchConfig['interactionMode']
  researchDomain?: ResearchConfig['domain']
  researchTracking?: ResearchConfig['hasExperimentTracking']
}
```

## 5. Implementation Touchpoints

All files that need modification or creation, using the ML type as template:

### Type Registration (prerequisite — do first)

| File | Change |
|---|---|
| `src/config/schema.ts` | Add `'research'` to `ProjectTypeSchema`, add `ResearchConfigSchema`, add `researchConfig?` to `ProjectSchema`, add cross-field rules to `superRefine()` |
| `src/types/config.ts` | Add `ResearchConfig` type, add to `DetectedConfig` union, add to `ProjectConfig` |
| `src/project/adopt.ts` | Add `'research'` to `TYPE_KEY` mapping AND add `case 'research': return ResearchConfigSchema` to `schemaForType()` exhaustive switch |

### Detector

| File | Change |
|---|---|
| `src/project/detectors/shared-signals.ts` | New file: shared constants |
| `src/project/detectors/research.ts` | New detector |
| `src/project/detectors/ml.ts` | Import `ML_FRAMEWORK_DEPS` and `EXPERIMENT_TRACKING_DEPS` from shared-signals (refactor both inline constants) |
| `src/project/detectors/resolve-detection.ts` | Verify `synthesizeEmptyMatch` works with new `ResearchMatch` in `DetectionMatch` union |
| `src/project/detectors/types.ts` | Add `ResearchMatch` to `DetectionMatch` union |
| `src/project/detectors/index.ts` | Add `detectResearch` to `ALL_DETECTORS` |
| `src/project/detectors/disambiguate.ts` | Add `'research'` to `PROJECT_TYPE_PREFERENCE` after `'ml'` |

### Overlay System

| File | Change |
|---|---|
| `src/core/assembly/overlay-state-resolver.ts` | Generic sub-overlay loading (domain field check) |
| `src/core/assembly/overlay-loader.ts` | `loadSubOverlay()` with non-knowledge warning |
| `content/methodology/research-overlay.yml` | Core overlay |
| `content/methodology/research-quant-finance.yml` | Quant domain sub-overlay |
| `content/methodology/research-ml-research.yml` | ML-research domain sub-overlay |
| `content/methodology/research-simulation.yml` | Simulation domain sub-overlay |
| `content/knowledge/research/*.md` | 25 knowledge files |

### Wizard & CLI

| File | Change |
|---|---|
| `src/wizard/questions.ts` | Add research question block, add `researchConfig` to `WizardAnswers` |
| `src/wizard/flags.ts` | Add `ResearchFlags` interface |
| `src/wizard/copy/types.ts` | Add `ResearchCopy` type, add to `ProjectCopyMap` |
| `src/wizard/copy/research.ts` | New copy file |
| `src/wizard/copy/index.ts` | Import and register research copy |
| `src/wizard/copy/core.ts` | Add `'research'` to project-type selection copy |
| `src/cli/init-flag-families.ts` | Add `RESEARCH_FLAGS`, update `detectFamily`, `applyFlagFamilyValidation`, `buildFlagOverrides`, add `{ type: 'research'; partial: Partial<ResearchConfig> }` to `PartialConfigOverrides` union |
| `src/cli/commands/init.ts` | Add `--research-*` flag definitions |
| `src/cli/commands/adopt.ts` | Add `--research-*` Yargs flag definitions and `.group([...RESEARCH_FLAGS], 'Research Configuration:')` (adopt re-defines flags separately from init) |
| `src/wizard/wizard.ts` | Add `researchFlags` to `WizardOptions`, pass to `askWizardQuestions`, map `answers.researchConfig` to final config payload |

### Tests

| File | Change |
|---|---|
| `src/config/schema.test.ts` | Schema validation tests (valid configs, cross-field rejection for notebook+autonomous) |
| `src/project/detectors/research.test.ts` | New detector tests (all tiers, ML overlap, false positive/negative) |
| `src/e2e/project-type-overlays.test.ts` | Core + domain overlay sequencing, additive ordering, sub-overlay warning, missing domain fallback |
| `src/wizard/questions.test.ts` | Research wizard question flow, smart filtering, auto-mode required field |
| `src/cli/init-flag-families.test.ts` | Research flag family detection, validation, cross-field rejection |
| `src/cli/commands/adopt.test.ts` | Adopt with research type, flag handling |
| `src/cli/commands/adopt.serialization.test.ts` | Research config serialization roundtrip |
| `src/core/assembly/overlay-loader.test.ts` | Sub-overlay loading, non-knowledge section warning |
| `src/core/assembly/overlay-state-resolver.test.ts` | Generic domain sub-overlay resolution |
| `tests/fixtures/adopt/detectors/research/` | New detector test fixtures |

## 6. Review History

This design was validated through multiple rounds of 3-channel review (Codex CLI, Gemini CLI, Superpowers code-reviewer). Key findings and resolutions:

- **Schema**: `domain` initially removed (failed pipeline-structure bar), then restored (overlay selection requires typed persistence). `evaluationStrategy` and `optimizationDirection` removed as YAGNI. `orchestration` renamed to `experimentDriver` (collision with data-pipeline). `autonomyLevel` renamed to `interactionMode`, default changed to `checkpoint-gated`.
- **Detector**: Priority/ordering framing corrected (confidence-based, not order-based). Optuna medium-tier got ML negative gate. MLX moved to ML_FRAMEWORK_DEPS. High-confidence signals tightened with content/import verification. `sweep.yaml` downgraded to medium with W&B exclusion.
- **Overlay**: `.passthrough()` persistence rejected — `domain` added back to schema. Sub-overlay knowledge-only constraint enforced at loader level. Resolver extension made generic (not research-specific). Step mapping expanded to 21 steps matching ml/data-pipeline.
- **Wizard**: Re-prompt replaced with smart option filtering. `.optional()` replaced with `'none'` enum value. Copy restructured to label + short. Required-field guard covers all non-interactive paths.
