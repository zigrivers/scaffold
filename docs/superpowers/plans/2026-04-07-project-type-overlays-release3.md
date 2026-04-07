# Project-Type Overlays (Release 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use multi-model reviews after each task and fix all P0, P1, and P2 findings.

**Goal:** Add overlay support for data-pipeline, ml, and browser-extension project types. Expand ProjectType enum with 3 new values.

**Architecture:** Identical to Releases 1-2. Knowledge-first overlays. The only difference from R1/R2 is that this release adds new enum values to ProjectTypeSchema.

**Spec:** `docs/superpowers/specs/2026-04-07-project-type-overlays-release3-design.md`

---

## Tasks (grouped for efficiency — same patterns as R1/R2)

### Task 1: Expand ProjectType + add schemas + extend ProjectConfig

- Modify: `src/config/schema.ts` — add 3 enum values, 3 new schemas, extend ProjectSchema
- Modify: `src/types/config.ts` — derive types, extend ProjectConfig
- Add .superRefine() rules: type gating + ML inference/serving + ML training/serving + browser-ext empty check

### Task 2: Schema tests

- Modify: `src/config/schema.test.ts` — tests for all 3 new schemas + cross-field validation

### Task 3: CLI flags + .check() + .group() + handler

- Modify: `src/cli/commands/init.ts` — 13 new flags, flag families, validation, handler

### Task 4: WizardOptions + wizard questions + serialization

- Modify: `src/wizard/wizard.ts` — WizardOptions + passthrough + serialization
- Modify: `src/wizard/questions.ts` — WizardAnswers + options + 3 question blocks

### Task 5: CLI flag tests + wizard tests

- Modify: `src/cli/commands/init.test.ts`
- Modify: `src/wizard/questions.test.ts`

### Task 6: Overlay YAMLs + loader tests

- Create: `content/methodology/data-pipeline-overlay.yml`
- Create: `content/methodology/ml-overlay.yml`
- Create: `content/methodology/browser-extension-overlay.yml`
- Modify: `src/core/assembly/overlay-loader.test.ts`

### Task 7: Data-pipeline knowledge entries (12 files)

### Task 8: ML knowledge entries (12 files)

### Task 9: Browser-extension knowledge entries (12 files)

### Task 10: Integration tests + README + CHANGELOG
