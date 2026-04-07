# Project-Type Overlays Release 3 Design Spec

**Date:** 2026-04-07
**Status:** Draft
**Scope:** Release 3 — data-pipeline, ml, browser-extension overlays

## Goal

Add overlay support for 3 new project types: `data-pipeline`, `ml`, `browser-extension`. This release requires expanding the `ProjectType` enum with 3 new values.

## Enum Expansion

Add to `ProjectTypeSchema` in `schema.ts`:

```typescript
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension',  // Release 3
])
```

Because all consumers import `ProjectTypeSchema.options` (single source of truth from Release 1), this is a one-file change. The overlay loader, CLI choices, and wizard dropdown all update automatically.

## Config Types

### DataPipelineConfig (5 fields)

```typescript
export const DataPipelineConfigSchema = z.object({
  processingModel: z.enum(['batch', 'streaming', 'hybrid']),
  orchestration: z.enum(['none', 'dag-based', 'event-driven', 'scheduled']).default('none'),
  dataQualityStrategy: z.enum(['none', 'validation', 'testing', 'observability']).default('validation'),
  schemaManagement: z.enum(['none', 'schema-registry', 'contracts']).default('none'),
  hasDataCatalog: z.boolean().default(false),
}).strict()
```

Required anchor: `processingModel`. No cross-field validations needed.

### MlConfig (4 fields)

```typescript
export const MlConfigSchema = z.object({
  projectPhase: z.enum(['training', 'inference', 'both']),
  modelType: z.enum(['classical', 'deep-learning', 'llm']).default('deep-learning'),
  servingPattern: z.enum(['none', 'batch', 'realtime', 'edge']).default('none'),
  hasExperimentTracking: z.boolean().default(true),
}).strict()
```

Required anchor: `projectPhase`.

Cross-field validations:
- `projectPhase: 'inference'` + `servingPattern: 'none'` = error (inference requires a serving pattern)
- `projectPhase: 'training'` + `servingPattern` != `'none'` = error (training-only has no serving)

### BrowserExtensionConfig (4 fields)

```typescript
export const BrowserExtensionConfigSchema = z.object({
  manifestVersion: z.enum(['2', '3']).default('3'),
  uiSurfaces: z.array(z.enum(['popup', 'options', 'newtab', 'devtools', 'sidepanel'])).default(['popup']),
  hasContentScript: z.boolean().default(false),
  hasBackgroundWorker: z.boolean().default(true),
}).strict()
```

No required anchor — `manifestVersion` defaults to `'3'`, all other fields have defaults. This is the first config without a required anchor, which is correct because a browser extension with all defaults (V3, popup, no content script, background worker) is a valid, common configuration.

Cross-field validation:
- `uiSurfaces: []` + `hasContentScript: false` + `hasBackgroundWorker: false` = error (extension does nothing)

## CLI Flags

### Data-pipeline flags (5):
```
--pipeline-processing      batch|streaming|hybrid
--pipeline-orchestration   none|dag-based|event-driven|scheduled
--pipeline-quality         none|validation|testing|observability
--pipeline-schema          none|schema-registry|contracts
--pipeline-catalog         (boolean)
```

### ML flags (4):
```
--ml-phase                 training|inference|both
--ml-model-type            classical|deep-learning|llm
--ml-serving               none|batch|realtime|edge
--ml-experiment-tracking   (boolean)
```

### Browser-extension flags (4):
```
--ext-manifest             2|3
--ext-ui-surfaces          popup,options,newtab,devtools,sidepanel  (CSV)
--ext-content-script       (boolean)
--ext-background-worker    (boolean)
```

Auto-detection: `--pipeline-*` → `data-pipeline`, `--ml-*` → `ml`, `--ext-*` → `browser-extension`

## Wizard Questions

Same flag-skip pattern. Required anchors throw early under `--auto`:
- Data-pipeline: `--pipeline-processing` required
- ML: `--ml-phase` required
- Browser-extension: No required field (all have defaults), so `--auto` works with just `--project-type browser-extension`

## Knowledge Entries

### Data-pipeline (~12 files in `content/knowledge/data-pipeline/`):
data-pipeline-requirements, data-pipeline-conventions, data-pipeline-project-structure, data-pipeline-dev-environment, data-pipeline-architecture, data-pipeline-batch-patterns, data-pipeline-streaming-patterns, data-pipeline-orchestration, data-pipeline-quality, data-pipeline-schema-management, data-pipeline-security, data-pipeline-testing

### ML (~12 files in `content/knowledge/ml/`):
ml-requirements, ml-conventions, ml-project-structure, ml-dev-environment, ml-architecture, ml-training-patterns, ml-serving-patterns, ml-experiment-tracking, ml-model-evaluation, ml-security, ml-observability, ml-testing

### Browser-extension (~12 files in `content/knowledge/browser-extension/`):
browser-extension-requirements, browser-extension-conventions, browser-extension-project-structure, browser-extension-dev-environment, browser-extension-architecture, browser-extension-manifest, browser-extension-content-scripts, browser-extension-service-workers, browser-extension-cross-browser, browser-extension-security, browser-extension-store-submission, browser-extension-testing

## Config Serialization Examples

```yaml
# Data pipeline
project:
  projectType: data-pipeline
  dataPipelineConfig:
    processingModel: streaming
    orchestration: event-driven
    dataQualityStrategy: observability
    schemaManagement: schema-registry
    hasDataCatalog: true

# ML project
project:
  projectType: ml
  mlConfig:
    projectPhase: both
    modelType: llm
    servingPattern: realtime
    hasExperimentTracking: true

# Browser extension
project:
  projectType: browser-extension
  browserExtensionConfig:
    manifestVersion: '3'
    uiSurfaces: [popup, options, devtools]
    hasContentScript: true
    hasBackgroundWorker: true
```
