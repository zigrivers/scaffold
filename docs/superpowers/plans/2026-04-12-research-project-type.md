# Research Project Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `research` as scaffold's 10th project type — schema, detector, overlay system with domain sub-overlays, wizard, and CLI flags.

**Architecture:** A new project type following the exact patterns of the existing 9 types. The one novel addition is a generic sub-overlay system (domain-specific knowledge injection) that extends the overlay resolver for any type, not just research.

**Tech Stack:** TypeScript (Zod schemas, vitest tests), YAML (overlays), Markdown (knowledge files)

**Spec:** `docs/superpowers/specs/2026-04-12-research-project-type-design.md`

---

### Task 1: Schema & Type Registration

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/types/config.ts`
- Modify: `src/project/adopt.ts`
- Test: `src/config/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add to `src/config/schema.test.ts`:

```typescript
describe('ResearchConfigSchema', () => {
  it('accepts valid research config with all fields', () => {
    const result = ResearchConfigSchema.safeParse({
      experimentDriver: 'code-driven',
      interactionMode: 'autonomous',
      hasExperimentTracking: true,
      domain: 'quant-finance',
    })
    expect(result.success).toBe(true)
  })

  it('applies defaults for all fields except experimentDriver', () => {
    const result = ResearchConfigSchema.safeParse({
      experimentDriver: 'config-driven',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.interactionMode).toBe('checkpoint-gated')
      expect(result.data.hasExperimentTracking).toBe(true)
      expect(result.data.domain).toBe('none')
    }
  })

  it('rejects missing experimentDriver', () => {
    const result = ResearchConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects unknown fields with strict', () => {
    const result = ResearchConfigSchema.safeParse({
      experimentDriver: 'code-driven',
      unknownField: true,
    })
    expect(result.success).toBe(false)
  })
})

describe('ProjectSchema research cross-field validation', () => {
  it('rejects researchConfig when projectType is not research', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      project: {
        projectType: 'ml',
        researchConfig: { experimentDriver: 'code-driven' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects notebook-driven + autonomous combination', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      project: {
        projectType: 'research',
        researchConfig: {
          experimentDriver: 'notebook-driven',
          interactionMode: 'autonomous',
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts notebook-driven + checkpoint-gated', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      project: {
        projectType: 'research',
        researchConfig: {
          experimentDriver: 'notebook-driven',
          interactionMode: 'checkpoint-gated',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid research config with research projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      project: {
        projectType: 'research',
        researchConfig: { experimentDriver: 'code-driven' },
      },
    })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config/schema.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `ResearchConfigSchema` is not defined

- [ ] **Step 3: Add ResearchConfigSchema and update ProjectTypeSchema**

In `src/config/schema.ts`, add `'research'` to the `ProjectTypeSchema` enum (line 15-18):

```typescript
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
])
```

Add the `ResearchConfigSchema` after `BrowserExtensionConfigSchema` (around line 79):

```typescript
export const ResearchConfigSchema = z.object({
  experimentDriver: z.enum([
    'code-driven', 'config-driven', 'api-driven', 'notebook-driven',
  ]),
  interactionMode: z.enum([
    'autonomous', 'checkpoint-gated', 'human-guided',
  ]).default('checkpoint-gated'),
  hasExperimentTracking: z.boolean().default(true),
  domain: z.enum([
    'none', 'quant-finance', 'ml-research', 'simulation',
  ]).default('none'),
}).strict()
```

Add `researchConfig` to `ProjectSchema` (around line 110):

```typescript
researchConfig: ResearchConfigSchema.optional(),
```

Add cross-field validation in `ProjectSchema.superRefine()` (after the `browserExtensionConfig` block):

```typescript
if (data.researchConfig !== undefined && data.projectType !== 'research') {
  ctx.addIssue({ path: ['researchConfig'], code: 'custom',
    message: 'researchConfig requires projectType: research' })
}
if (data.researchConfig) {
  const { experimentDriver, interactionMode } = data.researchConfig
  if (experimentDriver === 'notebook-driven' && interactionMode === 'autonomous') {
    ctx.addIssue({ path: ['researchConfig', 'interactionMode'], code: 'custom',
      message: 'Notebook-driven execution cannot be fully autonomous' })
  }
}
```

- [ ] **Step 4: Update types/config.ts**

In `src/types/config.ts`:

Add the type derivation (near the other type derivations around line 50):
```typescript
export type ResearchConfig = z.infer<typeof ResearchConfigSchema>
```

Add to `DetectedConfig` union (around line 78):
```typescript
| { type: 'research'; config: ResearchConfig }
```

Add to `ProjectConfig` interface (around line 122):
```typescript
researchConfig?: ResearchConfig
```

- [ ] **Step 5: Update adopt.ts**

In `src/project/adopt.ts`:

Add to `TYPE_KEY` record:
```typescript
'research':          'researchConfig',
```

Add to `schemaForType` switch:
```typescript
case 'research':          return ResearchConfigSchema
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/config/schema.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/config/schema.ts src/types/config.ts src/project/adopt.ts src/config/schema.test.ts
git commit -m "feat(research): add ResearchConfigSchema and type registration"
```

---

### Task 2: Shared Signal Library

**Files:**
- Create: `src/project/detectors/shared-signals.ts`
- Modify: `src/project/detectors/ml.ts`
- Test: existing ML detector tests should still pass

- [ ] **Step 1: Create shared-signals.ts**

Create `src/project/detectors/shared-signals.ts`:

```typescript
export const ML_FRAMEWORK_DEPS = [
  'torch', 'pytorch-lightning', 'tensorflow', 'keras', 'jax',
  'scikit-learn', 'xgboost', 'lightgbm', 'catboost',
  'transformers', 'sentence-transformers', 'mlx',
] as const

export const EXPERIMENT_TRACKING_DEPS = [
  'mlflow', 'wandb', 'neptune-client', 'clearml', 'dvc',
] as const
```

- [ ] **Step 2: Refactor ml.ts to import from shared-signals**

In `src/project/detectors/ml.ts`:

Replace the inline `ML_FRAMEWORK_DEPS` array (line 5-9) with:
```typescript
import { ML_FRAMEWORK_DEPS, EXPERIMENT_TRACKING_DEPS } from './shared-signals.js'
```

Remove the inline array definition. Update line 14 (`ctx.hasAnyDep(ML_FRAMEWORK_DEPS, 'py')`) — this still works because the import has the same values plus `mlx`.

Replace the inline tracking deps check (line 38) from:
```typescript
const hasTrackingDep = ctx.hasAnyDep(['mlflow', 'wandb', 'neptune-client', 'clearml', 'dvc'], 'py')
```
to:
```typescript
const hasTrackingDep = ctx.hasAnyDep([...EXPERIMENT_TRACKING_DEPS], 'py')
```

- [ ] **Step 3: Run existing ML detector tests**

Run: `npx vitest run src/project/detectors/ --reporter=verbose 2>&1 | tail -20`
Expected: ALL PASS (refactor only, no behavior change)

- [ ] **Step 4: Commit**

```bash
git add src/project/detectors/shared-signals.ts src/project/detectors/ml.ts
git commit -m "refactor: extract ML_FRAMEWORK_DEPS and EXPERIMENT_TRACKING_DEPS to shared-signals"
```

---

### Task 3: Detector Types & Registry

**Files:**
- Modify: `src/project/detectors/types.ts`
- Modify: `src/project/detectors/index.ts`
- Modify: `src/project/detectors/disambiguate.ts`

- [ ] **Step 1: Add ResearchMatch to types.ts**

In `src/project/detectors/types.ts`, add after the `MlMatch` interface:

```typescript
export interface ResearchMatch extends BaseMatch {
  readonly projectType: 'research'
  readonly partialConfig: Partial<z.infer<typeof ResearchConfigSchema>>
}
```

Add `ResearchMatch` to the `DetectionMatch` union:
```typescript
export type DetectionMatch =
  | WebAppMatch | BackendMatch | CliMatch | LibraryMatch | MobileAppMatch
  | DataPipelineMatch | MlMatch | BrowserExtensionMatch | GameMatch
  | ResearchMatch
```

Add the `ResearchConfigSchema` import at the top.

- [ ] **Step 2: Add research to disambiguate.ts**

In `src/project/detectors/disambiguate.ts`, update `PROJECT_TYPE_PREFERENCE`:

```typescript
const PROJECT_TYPE_PREFERENCE: readonly ProjectType[] = [
  'web-app', 'backend', 'cli', 'library', 'mobile-app',
  'data-pipeline', 'ml', 'research', 'browser-extension', 'game',
]
```

- [ ] **Step 3: Stub detectResearch in index.ts**

Create a stub `src/project/detectors/research.ts`:
```typescript
import type { SignalContext } from './context.js'
import type { ResearchMatch } from './types.js'

export function detectResearch(_ctx: SignalContext): ResearchMatch | null {
  return null  // Stub — implemented in Task 4
}
```

In `src/project/detectors/index.ts`, add the import and register:
```typescript
import { detectResearch } from './research.js'
```

Add `detectResearch` to `ALL_DETECTORS`:
```typescript
export const ALL_DETECTORS: readonly Detector[] = [
  detectGame, detectBrowserExtension, detectMobileApp, detectDataPipeline,
  detectWebApp, detectBackend, detectMl, detectResearch, detectCli,
  detectLibrary,
]
```

- [ ] **Step 4: Run all detector tests**

Run: `npx vitest run src/project/detectors/ --reporter=verbose 2>&1 | tail -20`
Expected: ALL PASS (stub returns null, no behavior change)

- [ ] **Step 5: Commit**

```bash
git add src/project/detectors/types.ts src/project/detectors/index.ts \
  src/project/detectors/disambiguate.ts src/project/detectors/research.ts
git commit -m "feat(research): add ResearchMatch type and detector stub"
```

---

### Task 4: Research Detector Implementation

**Files:**
- Modify: `src/project/detectors/research.ts`
- Create: `src/project/detectors/research.test.ts`
- Create: `tests/fixtures/adopt/detectors/research/` (fixtures)

- [ ] **Step 1: Write high-confidence detection tests**

Create `src/project/detectors/research.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectResearch } from './research.js'
import { fakeContext } from './context.js'

describe('detectResearch', () => {
  describe('high confidence', () => {
    it('detects autoresearch pattern: program.md + results.tsv with markers', () => {
      const ctx = fakeContext({
        files: ['program.md', 'results.tsv', 'train.py'],
        fileContents: {
          'program.md': '# Research Protocol\nLoop: iterate through experiments and evaluate results\n',
        },
      })
      const match = detectResearch(ctx)
      expect(match).not.toBeNull()
      expect(match!.confidence).toBe('high')
      expect(match!.partialConfig.experimentDriver).toBe('code-driven')
      expect(match!.partialConfig.interactionMode).toBe('autonomous')
    })

    it('detects backtest + trading deps with import verification', () => {
      const ctx = fakeContext({
        files: ['backtest.py'],
        fileContents: {
          'backtest.py': 'from backtrader import cerebro\nimport pandas as pd\n',
        },
        pyDeps: ['backtrader', 'pandas'],
      })
      const match = detectResearch(ctx)
      expect(match).not.toBeNull()
      expect(match!.confidence).toBe('high')
      expect(match!.partialConfig.experimentDriver).toBe('code-driven')
      expect(match!.partialConfig.domain).toBe('quant-finance')
    })
  })

  describe('medium confidence', () => {
    it('detects optimization deps + experiments dir (no ML deps)', () => {
      const ctx = fakeContext({
        dirs: ['experiments'],
        pyDeps: ['optuna'],
      })
      const match = detectResearch(ctx)
      expect(match).not.toBeNull()
      expect(match!.confidence).toBe('medium')
      expect(match!.partialConfig.experimentDriver).toBe('config-driven')
    })

    it('does NOT detect optimization deps when ML framework deps present', () => {
      const ctx = fakeContext({
        dirs: ['experiments'],
        pyDeps: ['optuna', 'torch'],
      })
      const match = detectResearch(ctx)
      // Should return null — ML detector should claim this repo
      expect(match).toBeNull()
    })

    it('detects simulation deps + experiment structure', () => {
      const ctx = fakeContext({
        dirs: ['experiments'],
        pyDeps: ['simpy'],
      })
      const match = detectResearch(ctx)
      expect(match).not.toBeNull()
      expect(match!.confidence).toBe('medium')
      expect(match!.partialConfig.domain).toBe('simulation')
    })
  })

  describe('low confidence', () => {
    it('detects experiments dir alone', () => {
      const ctx = fakeContext({
        files: ['experiment.py'],
      })
      const match = detectResearch(ctx)
      expect(match).not.toBeNull()
      expect(match!.confidence).toBe('low')
      expect(match!.partialConfig.experimentDriver).toBe('code-driven')
    })
  })

  it('returns null for empty repo', () => {
    const ctx = fakeContext({})
    expect(detectResearch(ctx)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/project/detectors/research.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — stub returns null for everything

- [ ] **Step 3: Implement the research detector**

Replace the stub in `src/project/detectors/research.ts` with the full implementation:

```typescript
import type { SignalContext } from './context.js'
import type { ResearchMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'
import { ML_FRAMEWORK_DEPS, EXPERIMENT_TRACKING_DEPS } from './shared-signals.js'

const TRADING_DEPS = ['backtrader', 'zipline', 'vectorbt', 'ccxt', 'ta-lib']
const OPTIMIZATION_DEPS = ['optuna', 'hyperopt', 'pymoo', 'nevergrad']
const SIMULATION_DEPS = ['openfoam', 'fenics', 'simpy', 'pyomo', 'deap']
const LLM_SDK_DEPS = ['openai', 'anthropic', 'langchain']
const WEB_FRAMEWORK_DEPS = ['express', 'fastapi', 'django', 'flask', 'hono', 'nestjs']

export function detectResearch(ctx: SignalContext): ResearchMatch | null {
  const ev: DetectionEvidence[] = []
  const partialConfig: ResearchMatch['partialConfig'] = {}

  // --- High confidence: autoresearch pattern ---
  const hasProgramMd = ctx.hasFile('program.md')
  const hasResultsTsv = ctx.hasFile('results.tsv')
  if (hasProgramMd && hasResultsTsv) {
    const content = ctx.readFileText('program.md', 512) ?? ''
    const markers = /\b(loop|iterate|experiment|run|evaluate)\b/i
    if (markers.test(content)) {
      ev.push(evidence('autoresearch-protocol', 'program.md'))
      return {
        projectType: 'research',
        confidence: 'high',
        partialConfig: {
          experimentDriver: 'code-driven',
          interactionMode: 'autonomous',
        },
        evidence: ev,
      }
    }
  }

  // --- High confidence: backtest/strategy + trading deps with import verification ---
  const backtestFile = ['backtest.py', 'strategy.py'].find(f => ctx.hasFile(f))
  const hasTradingDep = ctx.hasAnyDep(TRADING_DEPS, 'py')
  if (backtestFile && hasTradingDep) {
    const text = ctx.readFileText(backtestFile) ?? ''
    if (TRADING_DEPS.some(dep => new RegExp(`from\\s+${dep}|import\\s+${dep}`).test(text))) {
      ev.push(evidence('trading-backtest', backtestFile))
      return {
        projectType: 'research',
        confidence: 'high',
        partialConfig: { experimentDriver: 'code-driven', domain: 'quant-finance' },
        evidence: ev,
      }
    }
  }

  // --- Medium confidence signals ---
  const hasOptDep = ctx.hasAnyDep(OPTIMIZATION_DEPS, 'py')
  const hasExperimentsDir = ctx.dirExists('experiments') || ctx.dirExists('results')
  const hasMlDep = ctx.hasAnyDep([...ML_FRAMEWORK_DEPS], 'py')
  const hasWebDep = ctx.hasAnyDep(WEB_FRAMEWORK_DEPS, 'py')
    || ctx.hasAnyDep(WEB_FRAMEWORK_DEPS, 'npm')

  // Optimization deps + experiment dir (NO ML deps — negative gate)
  if (hasOptDep && hasExperimentsDir && !hasMlDep) {
    ev.push(evidence('optimization-framework'))
    partialConfig.experimentDriver = 'config-driven'
  }

  // Trading deps alone + no web framework
  if (hasTradingDep && !hasWebDep && !backtestFile) {
    ev.push(evidence('trading-deps'))
    partialConfig.experimentDriver = 'code-driven'
    partialConfig.domain = 'quant-finance'
  }

  // Simulation deps + experiment structure
  const hasSimDep = ctx.hasAnyDep(SIMULATION_DEPS, 'py')
  if (hasSimDep && hasExperimentsDir) {
    ev.push(evidence('simulation-framework'))
    partialConfig.experimentDriver = 'code-driven'
    partialConfig.domain = 'simulation'
  }

  // LLM SDK + eval structure (no train.py)
  const hasLlmDep = ctx.hasAnyDep(LLM_SDK_DEPS, 'py')
  const hasEvalDir = ctx.dirExists('evals')
  const hasTrainPy = ctx.hasFile('train.py')
  if (hasLlmDep && hasEvalDir && !hasTrainPy) {
    ev.push(evidence('llm-eval-framework'))
    partialConfig.experimentDriver = 'api-driven'
  }

  // Academic artifact upgrade: .tex, .bib, paper/
  const hasAcademic = ctx.hasFile('paper.tex')
    || ctx.rootEntries().some(f => f.endsWith('.bib'))
    || ctx.dirExists('paper')

  // Experiment tracking
  const hasTrackingDep = ctx.hasAnyDep([...EXPERIMENT_TRACKING_DEPS], 'py')
  if (hasTrackingDep) {
    partialConfig.hasExperimentTracking = true
  }

  if (ev.length > 0) {
    // Academic artifacts upgrade medium to high
    if (hasAcademic) {
      ev.push(evidence('academic-artifacts'))
      return { projectType: 'research', confidence: 'high', partialConfig, evidence: ev }
    }
    return { projectType: 'research', confidence: 'medium', partialConfig, evidence: ev }
  }

  // --- Low confidence signals ---
  const hasNotebooks = ctx.rootEntries().some(f => f.endsWith('.ipynb'))
  if (hasNotebooks && hasOptDep) {
    return {
      projectType: 'research',
      confidence: 'low',
      partialConfig: { experimentDriver: 'notebook-driven' },
      evidence: [evidence('notebook-optimization')],
    }
  }

  if (ctx.hasFile('experiment.py') || ctx.dirExists('experiments')) {
    return {
      projectType: 'research',
      confidence: 'low',
      partialConfig: { experimentDriver: 'code-driven' },
      evidence: [evidence('experiment-dir')],
    }
  }

  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/project/detectors/research.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 5: Run full detector suite**

Run: `npx vitest run src/project/detectors/ --reporter=verbose 2>&1 | tail -30`
Expected: ALL PASS (existing detectors unaffected)

- [ ] **Step 6: Commit**

```bash
git add src/project/detectors/research.ts src/project/detectors/research.test.ts
git commit -m "feat(research): implement research project detector with tiered signals"
```

---

### Task 5: Overlay Loader Extension

**Files:**
- Modify: `src/core/assembly/overlay-loader.ts`
- Test: `src/core/assembly/overlay-loader.test.ts`

- [ ] **Step 1: Write failing test for sub-overlay loading**

Add to `src/core/assembly/overlay-loader.test.ts`:

```typescript
describe('loadSubOverlay', () => {
  it('loads knowledge-overrides from a sub-overlay file', () => {
    // Create a temp sub-overlay YAML with knowledge-overrides only
    const yaml = `
name: research-quant-finance
description: Quant finance sub-overlay
project-type: research
domain: quant-finance

knowledge-overrides:
  system-architecture:
    append: [research-quant-backtesting]
`
    const tmpPath = writeTempOverlay(yaml)
    const { overlay, warnings } = loadSubOverlay(tmpPath)
    expect(overlay).not.toBeNull()
    expect(overlay!.knowledgeOverrides).toHaveProperty('system-architecture')
    expect(warnings).toHaveLength(0)
  })

  it('warns and strips non-knowledge sections from sub-overlay', () => {
    const yaml = `
name: test-sub
description: Test sub-overlay
project-type: research
domain: quant-finance

knowledge-overrides:
  tdd:
    append: [test-knowledge]
step-overrides:
  some-step:
    enabled: true
`
    const tmpPath = writeTempOverlay(yaml)
    const { overlay, warnings } = loadSubOverlay(tmpPath)
    expect(overlay).not.toBeNull()
    expect(overlay!.knowledgeOverrides).toHaveProperty('tdd')
    expect(overlay!.stepOverrides).toEqual({})
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0].message).toContain('non-knowledge')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL — `loadSubOverlay` is not defined

- [ ] **Step 3: Implement loadSubOverlay**

In `src/core/assembly/overlay-loader.ts`, add a new exported function after `loadOverlay`:

```typescript
export function loadSubOverlay(
  overlayPath: string,
): { overlay: ProjectTypeOverlay | null; errors: ScaffoldError[]; warnings: ScaffoldWarning[] } {
  const result = loadOverlay(overlayPath)
  if (!result.overlay) return result

  const warnings = [...result.warnings]
  const overlay = { ...result.overlay }

  // Enforce knowledge-only constraint
  const hasStep = Object.keys(overlay.stepOverrides ?? {}).length > 0
  const hasReads = Object.keys(overlay.readsOverrides ?? {}).length > 0
  const hasDeps = Object.keys(overlay.dependencyOverrides ?? {}).length > 0

  if (hasStep || hasReads || hasDeps) {
    warnings.push({
      code: 'sub-overlay-non-knowledge',
      message: `Sub-overlay ${overlayPath} contains non-knowledge sections (step/reads/dependency overrides). These are stripped for domain sub-overlays.`,
      file: overlayPath,
    })
    overlay.stepOverrides = {}
    overlay.readsOverrides = {}
    overlay.dependencyOverrides = {}
  }

  return { overlay, errors: result.errors, warnings }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/assembly/overlay-loader.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/overlay-loader.ts src/core/assembly/overlay-loader.test.ts
git commit -m "feat(overlay): add loadSubOverlay with knowledge-only enforcement"
```

---

### Task 6: Overlay Resolver Extension

**Files:**
- Modify: `src/core/assembly/overlay-state-resolver.ts`
- Test: `src/core/assembly/overlay-state-resolver.test.ts`

- [ ] **Step 1: Write failing test for domain sub-overlay resolution**

Add to `src/core/assembly/overlay-state-resolver.test.ts`:

```typescript
describe('domain sub-overlay resolution', () => {
  it('applies domain sub-overlay knowledge after core overlay', () => {
    const state = resolveOverlayState({
      config: {
        version: 2,
        project: {
          projectType: 'research',
          researchConfig: { experimentDriver: 'code-driven', domain: 'quant-finance' },
        },
      },
      methodologyDir: fixtureMethodologyDir,
      metaPrompts: testMetaPrompts,
      presetSteps: testPresetSteps,
      output: testOutput,
    })
    // Core knowledge should be present
    expect(state.overlayKnowledge['system-architecture']).toContain('research-architecture')
    // Domain knowledge should be appended AFTER core
    expect(state.overlayKnowledge['system-architecture']).toContain('research-quant-backtesting')
  })

  it('skips domain sub-overlay when domain is none', () => {
    const state = resolveOverlayState({
      config: {
        version: 2,
        project: {
          projectType: 'research',
          researchConfig: { experimentDriver: 'code-driven', domain: 'none' },
        },
      },
      methodologyDir: fixtureMethodologyDir,
      metaPrompts: testMetaPrompts,
      presetSteps: testPresetSteps,
      output: testOutput,
    })
    // Core knowledge present, no domain knowledge
    expect(state.overlayKnowledge['system-architecture']).toContain('research-architecture')
    expect(state.overlayKnowledge['system-architecture']).not.toContain('research-quant-backtesting')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: FAIL

- [ ] **Step 3: Implement generic domain sub-overlay loading**

In `src/core/assembly/overlay-state-resolver.ts`, after the core overlay application block, add:

```typescript
// Generic domain sub-overlay: if typeConfig has a domain !== 'none', load sub-overlay
const typeConfigKey = `${projectType}Config` as const
const typeConfig = config.project?.[typeConfigKey] as Record<string, unknown> | undefined
if (typeConfig && typeof typeConfig.domain === 'string' && typeConfig.domain !== 'none') {
  const subOverlayPath = path.join(methodologyDir, `${projectType}-${typeConfig.domain}.yml`)
  if (fs.existsSync(subOverlayPath)) {
    const { overlay: subOverlay, warnings: subWarnings } = loadSubOverlay(subOverlayPath)
    warnings.push(...subWarnings)
    if (subOverlay) {
      // Apply knowledge-overrides only, starting from ALREADY-MERGED state
      for (const [step, overrides] of Object.entries(subOverlay.knowledgeOverrides ?? {})) {
        if (step in overlayKnowledge) {
          const toAppend = overrides.append ?? []
          overlayKnowledge[step] = [...overlayKnowledge[step], ...toAppend]
        }
      }
    }
  }
}
```

Import `loadSubOverlay` at the top of the file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/assembly/overlay-state-resolver.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/overlay-state-resolver.ts src/core/assembly/overlay-state-resolver.test.ts
git commit -m "feat(overlay): add generic domain sub-overlay resolution"
```

---

### Task 7: Core Overlay YAML + Core Knowledge Files

**Files:**
- Create: `content/methodology/research-overlay.yml`
- Create: `content/knowledge/research/` (11 files)

- [ ] **Step 1: Create the core overlay YAML**

Create `content/methodology/research-overlay.yml` with the exact content from the spec (Section 3, Core Overlay). The YAML includes `name`, `description`, `project-type`, and all 21 `knowledge-overrides` step mappings.

- [ ] **Step 2: Create the 11 core knowledge files**

Each file in `content/knowledge/research/` follows this structure:

```markdown
---
name: research-{name}
description: {one-line description}
topics: [research, {relevant-topics}]
---

{Content: Summary section + Deep Guidance section with domain expertise}
```

Create all 11 files listed in the spec's knowledge inventory (Section 3):
1. `research-requirements.md`
2. `research-conventions.md`
3. `research-project-structure.md`
4. `research-dev-environment.md`
5. `research-architecture.md`
6. `research-experiment-loop.md`
7. `research-experiment-tracking.md`
8. `research-testing.md`
9. `research-overfitting-prevention.md`
10. `research-security.md`
11. `research-observability.md`

Use existing `content/knowledge/ml/ml-architecture.md` as a reference for depth and structure. Each file should have a Summary section (2-3 sentences) and a Deep Guidance section with code examples and patterns specific to research experiment loops.

- [ ] **Step 3: Validate overlay with make validate**

Run: `make validate 2>&1 | tail -20`
Expected: PASS (no validation errors for new overlay or knowledge files)

- [ ] **Step 4: Commit**

```bash
git add content/methodology/research-overlay.yml content/knowledge/research/
git commit -m "feat(research): add core overlay and 11 knowledge files"
```

---

### Task 8: Domain Sub-Overlays + Domain Knowledge Files

**Files:**
- Create: `content/methodology/research-quant-finance.yml`
- Create: `content/methodology/research-ml-research.yml`
- Create: `content/methodology/research-simulation.yml`
- Create: `content/knowledge/research/research-quant-*.md` (6 files)
- Create: `content/knowledge/research/research-ml-*.md` (4 files)
- Create: `content/knowledge/research/research-sim-*.md` (4 files)

- [ ] **Step 1: Create the 3 domain sub-overlay YAMLs**

Create each file with the exact content from the spec (Section 3, Domain Sub-Overlays). Each includes `name`, `description`, `project-type`, `domain`, and `knowledge-overrides`.

- [ ] **Step 2: Create the 6 quant-finance knowledge files**

In `content/knowledge/research/`:
1. `research-quant-requirements.md`
2. `research-quant-backtesting.md`
3. `research-quant-metrics.md`
4. `research-quant-market-data.md`
5. `research-quant-strategy-patterns.md`
6. `research-quant-risk.md`

Each follows the standard knowledge file structure with frontmatter, Summary, and Deep Guidance sections. Content should cover the topics listed in the spec's knowledge inventory.

- [ ] **Step 3: Create the 4 ML-research knowledge files**

1. `research-ml-architecture-search.md`
2. `research-ml-training-patterns.md`
3. `research-ml-evaluation.md`
4. `research-ml-experiment-tracking.md`

Adapt content from existing `content/knowledge/ml/` files where relevant, reframed for research context.

- [ ] **Step 4: Create the 4 simulation knowledge files**

1. `research-sim-engine-patterns.md`
2. `research-sim-parameter-spaces.md`
3. `research-sim-validation.md`
4. `research-sim-compute-management.md`

- [ ] **Step 5: Validate all overlays**

Run: `make validate 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add content/methodology/research-quant-finance.yml \
  content/methodology/research-ml-research.yml \
  content/methodology/research-simulation.yml \
  content/knowledge/research/
git commit -m "feat(research): add 3 domain sub-overlays and 14 domain knowledge files"
```

---

### Task 9: Wizard Copy System

**Files:**
- Modify: `src/wizard/copy/types.ts`
- Create: `src/wizard/copy/research.ts`
- Modify: `src/wizard/copy/index.ts`
- Modify: `src/wizard/copy/core.ts`

- [ ] **Step 1: Add ResearchCopy type**

In `src/wizard/copy/types.ts`, add after the `MlCopy` type:

```typescript
export type ResearchCopy = { [K in keyof ResearchConfig]: QuestionCopy<ResearchConfig[K]> }
```

Add `'research': ResearchCopy` to `ProjectCopyMap`:

```typescript
export interface ProjectCopyMap {
  // ... existing entries ...
  'research':          ResearchCopy
}
```

Add the `ResearchConfig` import.

- [ ] **Step 2: Create research copy file**

Create `src/wizard/copy/research.ts` with the exact content from the spec (Section 4, Copy).

- [ ] **Step 3: Register in copy index**

In `src/wizard/copy/index.ts`, add import:
```typescript
import { researchCopy } from './research.js'
```

Add to `PROJECT_COPY`:
```typescript
'research': researchCopy,
```

- [ ] **Step 4: Add project-type selection copy**

In `src/wizard/copy/core.ts`, add to the `projectType.options`:
```typescript
'research': {
  label: 'Research project',
  short: 'Iterative experiment loops where an agent drives the research cycle.',
},
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/wizard/copy/types.ts src/wizard/copy/research.ts \
  src/wizard/copy/index.ts src/wizard/copy/core.ts
git commit -m "feat(research): add wizard copy definitions"
```

---

### Task 10: Wizard Questions

**Files:**
- Modify: `src/wizard/questions.ts`
- Modify: `src/wizard/wizard.ts`
- Modify: `src/wizard/flags.ts`
- Test: `src/wizard/questions.test.ts`

- [ ] **Step 1: Add ResearchFlags interface**

In `src/wizard/flags.ts`, add:

```typescript
export interface ResearchFlags {
  researchDriver?: ResearchConfig['experimentDriver']
  researchInteraction?: ResearchConfig['interactionMode']
  researchDomain?: ResearchConfig['domain']
  researchTracking?: ResearchConfig['hasExperimentTracking']
}
```

Add the `ResearchConfig` import.

- [ ] **Step 2: Add researchConfig to WizardAnswers**

In `src/wizard/questions.ts`, add to the `WizardAnswers` interface:
```typescript
researchConfig?: ResearchConfig
```

- [ ] **Step 3: Add research question block**

In `src/wizard/questions.ts`, add the research block after the ML block (following the exact same pattern). Place it inside `askWizardQuestions`:

```typescript
let researchConfig: ResearchConfig | undefined
if (projectType === 'research') {
  const copy = getCopyForType('research')
  showBannerOnce()

  if (auto && !options.researchFlags?.researchDriver) {
    throw new Error('--research-driver is required in auto mode for research projects')
  }

  const experimentDriver: ResearchConfig['experimentDriver'] = options.researchFlags?.researchDriver
    ?? await output.select(
      'Experiment driver?',
      optionsFromCopy(copy.experimentDriver.options, ['code-driven', 'config-driven', 'api-driven', 'notebook-driven']),
      undefined,
      copy.experimentDriver,
    ) as ResearchConfig['experimentDriver']

  // Smart filtering: omit autonomous when notebook-driven
  const interactionOptions: ResearchConfig['interactionMode'][] =
    experimentDriver === 'notebook-driven'
      ? ['checkpoint-gated', 'human-guided']
      : ['autonomous', 'checkpoint-gated', 'human-guided']

  const interactionMode: ResearchConfig['interactionMode'] = options.researchFlags?.researchInteraction
    ?? (!auto
      ? await output.select('Interaction mode?',
        optionsFromCopy(copy.interactionMode.options, interactionOptions),
        'checkpoint-gated',
        copy.interactionMode,
      ) as ResearchConfig['interactionMode']
      : 'checkpoint-gated')

  const domain: ResearchConfig['domain'] = options.researchFlags?.researchDomain
    ?? (!auto
      ? await output.select('Research domain?',
        optionsFromCopy(copy.domain.options, ['none', 'quant-finance', 'ml-research', 'simulation']),
        'none',
        copy.domain,
      ) as ResearchConfig['domain']
      : 'none')

  const hasExperimentTracking = options.researchFlags?.researchTracking
    ?? (!auto ? await output.confirm('Experiment tracking?', true, copy.hasExperimentTracking) : true)

  researchConfig = { experimentDriver, interactionMode, domain, hasExperimentTracking }
}
```

Add `researchConfig` to the return object.

- [ ] **Step 4: Update wizard.ts**

In `src/wizard/wizard.ts`:

Add `researchFlags?: ResearchFlags` to `WizardOptions` interface.

In the `runWizard` function's config assembly, add:
```typescript
...(answers.researchConfig && { researchConfig: answers.researchConfig }),
```

Pass `researchFlags: options.researchFlags` to `askWizardQuestions`.

- [ ] **Step 5: Write wizard question tests**

Add to `src/wizard/questions.test.ts`:

```typescript
describe('research wizard questions', () => {
  it('requires --research-driver in auto mode', async () => {
    await expect(askWizardQuestions({
      projectType: 'research',
      auto: true,
      output: testOutput,
      researchFlags: {},
    })).rejects.toThrow('--research-driver is required')
  })

  it('produces valid research config with all flags', async () => {
    const answers = await askWizardQuestions({
      projectType: 'research',
      auto: true,
      output: testOutput,
      researchFlags: {
        researchDriver: 'code-driven',
        researchInteraction: 'autonomous',
        researchDomain: 'quant-finance',
        researchTracking: true,
      },
    })
    expect(answers.researchConfig).toEqual({
      experimentDriver: 'code-driven',
      interactionMode: 'autonomous',
      domain: 'quant-finance',
      hasExperimentTracking: true,
    })
  })
})
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/wizard/questions.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/wizard/flags.ts src/wizard/questions.ts src/wizard/wizard.ts \
  src/wizard/questions.test.ts
git commit -m "feat(research): add wizard questions with smart option filtering"
```

---

### Task 11: CLI Flags

**Files:**
- Modify: `src/cli/init-flag-families.ts`
- Modify: `src/cli/commands/init.ts`
- Modify: `src/cli/commands/adopt.ts`
- Test: `src/cli/init-flag-families.test.ts`

- [ ] **Step 1: Add RESEARCH_FLAGS constant**

In `src/cli/init-flag-families.ts`:

```typescript
export const RESEARCH_FLAGS = [
  'research-driver', 'research-interaction', 'research-domain', 'research-tracking',
] as const
```

- [ ] **Step 2: Update detectFamily**

Add to the `detectFamily` function:
```typescript
if (RESEARCH_FLAGS.some((f) => argv[f] !== undefined)) return 'research'
```

- [ ] **Step 3: Update applyFlagFamilyValidation**

Add research flag validation:
```typescript
const hasResearchFlag = RESEARCH_FLAGS.some((f) => argv[f] !== undefined)
if (hasResearchFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'research') {
  throw new Error('--research-* flags require --project-type research')
}
// Cross-field: notebook-driven + autonomous
if (argv['research-driver'] === 'notebook-driven' && argv['research-interaction'] === 'autonomous') {
  throw new Error('Notebook-driven execution cannot be fully autonomous')
}
```

Add research to the mixed-family detection `typeCount` array.

- [ ] **Step 4: Update PartialConfigOverrides and buildFlagOverrides**

Add to `PartialConfigOverrides` union:
```typescript
| { type: 'research'; partial: Partial<ResearchConfig> }
```

Add `case 'research':` to `buildFlagOverrides`:
```typescript
case 'research': {
  const partial: Partial<ResearchConfig> = {}
  if (argv['research-driver'] !== undefined) {
    partial.experimentDriver = argv['research-driver'] as ResearchConfig['experimentDriver']
  }
  if (argv['research-interaction'] !== undefined) {
    partial.interactionMode = argv['research-interaction'] as ResearchConfig['interactionMode']
  }
  if (argv['research-domain'] !== undefined) {
    partial.domain = argv['research-domain'] as ResearchConfig['domain']
  }
  if (argv['research-tracking'] !== undefined) {
    partial.hasExperimentTracking = argv['research-tracking'] as boolean
  }
  return { type: 'research', partial }
}
```

- [ ] **Step 5: Add flag definitions to init.ts**

In `src/cli/commands/init.ts`, add to the Yargs builder:
```typescript
'research-driver': { type: 'string', choices: ['code-driven', 'config-driven', 'api-driven', 'notebook-driven'] },
'research-interaction': { type: 'string', choices: ['autonomous', 'checkpoint-gated', 'human-guided'] },
'research-domain': { type: 'string', choices: ['none', 'quant-finance', 'ml-research', 'simulation'] },
'research-tracking': { type: 'boolean' },
```

Add `.group([...RESEARCH_FLAGS], 'Research Configuration:')`.

- [ ] **Step 6: Add flag definitions to adopt.ts**

Add the same Yargs flag definitions and group to `src/cli/commands/adopt.ts`.

- [ ] **Step 7: Write flag tests**

Add to `src/cli/init-flag-families.test.ts`:

```typescript
describe('research flags', () => {
  it('detects research family from --research-driver', () => {
    expect(detectFamily({ 'research-driver': 'code-driven' })).toBe('research')
  })

  it('rejects research flags with wrong project type', () => {
    expect(() => applyFlagFamilyValidation({
      'project-type': 'ml',
      'research-driver': 'code-driven',
    })).toThrow('--research-* flags require --project-type research')
  })

  it('rejects notebook-driven + autonomous', () => {
    expect(() => applyFlagFamilyValidation({
      'research-driver': 'notebook-driven',
      'research-interaction': 'autonomous',
    })).toThrow('cannot be fully autonomous')
  })

  it('builds research flag overrides', () => {
    const result = buildFlagOverrides('research', {
      'research-driver': 'api-driven',
      'research-domain': 'quant-finance',
    })
    expect(result).toEqual({
      type: 'research',
      partial: { experimentDriver: 'api-driven', domain: 'quant-finance' },
    })
  })
})
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run src/cli/init-flag-families.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add src/cli/init-flag-families.ts src/cli/commands/init.ts \
  src/cli/commands/adopt.ts src/cli/init-flag-families.test.ts
git commit -m "feat(research): add CLI flags for init and adopt commands"
```

---

### Task 12: End-to-End Overlay Integration Test

**Files:**
- Modify: `src/e2e/project-type-overlays.test.ts`

- [ ] **Step 1: Write e2e overlay test**

Add to `src/e2e/project-type-overlays.test.ts`:

```typescript
describe('research overlay', () => {
  it('applies core research knowledge to all 21 steps', () => {
    const state = resolveOverlayState({
      config: {
        version: 2,
        project: {
          projectType: 'research',
          researchConfig: { experimentDriver: 'code-driven' },
        },
      },
      methodologyDir: contentMethodologyDir,
      metaPrompts: realMetaPrompts,
      presetSteps: realPresetSteps,
      output: testOutput,
    })
    expect(state.overlayKnowledge['system-architecture']).toContain('research-architecture')
    expect(state.overlayKnowledge['tdd']).toContain('research-testing')
    expect(state.overlayKnowledge['operations']).toContain('research-experiment-tracking')
  })

  it('applies quant-finance domain knowledge on top of core', () => {
    const state = resolveOverlayState({
      config: {
        version: 2,
        project: {
          projectType: 'research',
          researchConfig: { experimentDriver: 'code-driven', domain: 'quant-finance' },
        },
      },
      methodologyDir: contentMethodologyDir,
      metaPrompts: realMetaPrompts,
      presetSteps: realPresetSteps,
      output: testOutput,
    })
    // Core + domain knowledge both present
    expect(state.overlayKnowledge['system-architecture']).toContain('research-architecture')
    expect(state.overlayKnowledge['system-architecture']).toContain('research-quant-backtesting')
    // Domain knowledge appears AFTER core
    const sysArch = state.overlayKnowledge['system-architecture']
    const coreIdx = sysArch.indexOf('research-architecture')
    const domainIdx = sysArch.indexOf('research-quant-backtesting')
    expect(domainIdx).toBeGreaterThan(coreIdx)
  })

  it('domain=none skips sub-overlay entirely', () => {
    const state = resolveOverlayState({
      config: {
        version: 2,
        project: {
          projectType: 'research',
          researchConfig: { experimentDriver: 'code-driven', domain: 'none' },
        },
      },
      methodologyDir: contentMethodologyDir,
      metaPrompts: realMetaPrompts,
      presetSteps: realPresetSteps,
      output: testOutput,
    })
    expect(state.overlayKnowledge['system-architecture']).toContain('research-architecture')
    expect(state.overlayKnowledge['system-architecture']).not.toContain('research-quant-backtesting')
  })
})
```

- [ ] **Step 2: Run e2e tests**

Run: `npx vitest run src/e2e/project-type-overlays.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/e2e/project-type-overlays.test.ts
git commit -m "test(research): add e2e overlay integration tests"
```

---

### Task 13: Full Quality Gate

- [ ] **Step 1: Run make check-all**

Run: `make check-all 2>&1 | tail -30`
Expected: ALL PASS (lint + validate + test + eval + TypeScript)

- [ ] **Step 2: Fix any failures**

If any quality gate fails, fix the issue and re-run.

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "fix(research): address quality gate findings"
```
