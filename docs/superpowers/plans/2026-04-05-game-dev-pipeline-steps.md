# Game Dev Pipeline Steps — Implementation Plan (Plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create all 24 new game-specific pipeline step files (meta-prompts) that produce game development documentation artifacts.

**Architecture:** Pure content files (markdown with YAML frontmatter). Each step is a meta-prompt that guides an AI agent to produce a specific documentation artifact. Steps follow the existing pipeline step template with required sections: Purpose, Inputs, Expected Outputs, Quality Criteria, Methodology Scaling, Mode Detection, Update Mode Specifics.

**Tech Stack:** Markdown, YAML frontmatter

**Spec:** `docs/superpowers/specs/2026-04-05-game-dev-pipeline-design.md` (Section 4 for all 24 steps)

**Depends on:** Plan 2 (knowledge entries must exist for `knowledge-base` references)

---

## Structural Requirements for Pipeline Steps

Every pipeline step MUST have:

1. **Frontmatter** with ALL required fields:
```yaml
---
name: <kebab-case>
description: <one-line, max 200 chars>
summary: <optional, max 500 chars>
phase: "<phase-slug>"
order: <unique integer>
dependencies: [<step-names>]
outputs: [<artifact-paths>]
conditional: "if-needed"  # or null
reads: [<step-names>]  # optional
knowledge-base: [<kb-entry-names>]
---
```

2. **Required body sections** (in order):
- `## Purpose` — What this step produces and why
- `## Inputs` — What docs/artifacts are read
- `## Expected Outputs` — What artifacts are produced
- `## Quality Criteria` — Measurable pass/fail criteria with depth tags
- `## Methodology Scaling` — What changes at different depth levels (must have both `deep` and `mvp` bullets)
- `## Mode Detection` — How to detect fresh vs. update mode
- `## Update Mode Specifics` — What to preserve in update mode

3. **Conditional steps** must document conditions in the body (Conditional Evaluation section)

4. **Quality Criteria** must have depth-tagged entries (e.g., `- (deep) Multi-model review synthesis`)

5. **No placeholder text** (TODO, TBD, FIXME)

---

## Phase Directory Mapping

| Phase | Directory | Steps |
|-------|-----------|-------|
| pre (1) | `content/pipeline/pre/` | game-design-document, review-gdd |
| foundation (2) | `content/pipeline/foundation/` | performance-budgets |
| modeling (5) | `content/pipeline/modeling/` | narrative-bible |
| architecture (7) | `content/pipeline/architecture/` | netcode-spec, review-netcode, ai-behavior-design |
| specification (8) | `content/pipeline/specification/` | game-accessibility, input-controls-spec, game-ui-spec, review-game-ui, content-structure-design, art-bible, audio-design, economy-design, review-economy, online-services-spec, modding-ugc-spec, save-system-spec, localization-plan |
| quality (9) | `content/pipeline/quality/` | playtest-plan, analytics-telemetry, live-ops-plan, platform-cert-prep |

---

### Task 1: Phase 1 steps — GDD and review (2 files)

**Files:**
- Create: `content/pipeline/pre/game-design-document.md`
- Create: `content/pipeline/pre/review-gdd.md`

Write each file following the structural requirements. Content details from spec Section 4, steps #1 and #2.

**game-design-document.md frontmatter:**
```yaml
---
name: game-design-document
description: Create game design document with pillars, core loop, mechanics, progression, and world overview
phase: "pre"
order: 115
dependencies: [review-prd]
outputs: [docs/game-design.md]
conditional: null
reads: [create-vision, create-prd]
knowledge-base: [game-design-document, game-milestone-definitions]
---
```

**review-gdd.md frontmatter:**
```yaml
---
name: review-gdd
description: Multi-pass review of game design document for pillar coherence, mechanic clarity, and scope feasibility
phase: "pre"
order: 116
dependencies: [game-design-document]
outputs: [docs/reviews/pre-review-gdd.md]
conditional: null
reads: []
knowledge-base: [review-game-design]
---
```

- [ ] **Step 1: Write game-design-document.md** with all 7 required sections
- [ ] **Step 2: Write review-gdd.md** with all 7 required sections
- [ ] **Step 3: Run `make validate`** to verify frontmatter
- [ ] **Step 4: Commit**

```bash
git add content/pipeline/pre/
git commit -m "feat: add game-design-document and review-gdd pipeline steps"
```

---

### Task 2: Phase 2 step — Performance budgets (1 file)

**Files:**
- Create: `content/pipeline/foundation/performance-budgets.md`

**Frontmatter:**
```yaml
---
name: performance-budgets
description: Define frame budgets, memory budgets, GPU budgets, and platform-specific performance targets
phase: "foundation"
order: 225
dependencies: [review-gdd, tech-stack]
outputs: [docs/performance-budgets.md]
conditional: null
reads: [game-design-document]
knowledge-base: [game-performance-budgeting]
---
```

- [ ] **Step 1: Write performance-budgets.md** with all 7 required sections
- [ ] **Step 2: Run `make validate`**
- [ ] **Step 3: Commit**

```bash
git add content/pipeline/foundation/performance-budgets.md
git commit -m "feat: add performance-budgets pipeline step"
```

---

### Task 3: Phase 5+7 steps — Narrative, netcode, AI (4 files)

**Files:**
- Create: `content/pipeline/modeling/narrative-bible.md`
- Create: `content/pipeline/architecture/netcode-spec.md`
- Create: `content/pipeline/architecture/review-netcode.md`
- Create: `content/pipeline/architecture/ai-behavior-design.md`

All conditional steps. Each must have a `## Conditional Evaluation` section documenting when it runs/skips.

**Frontmatter for each** (from spec Section 4, steps #13-16):

narrative-bible: phase=modeling, order=515, deps=[domain-modeling], conditional="if-needed", kb=[game-narrative-design]
netcode-spec: phase=architecture, order=715, deps=[system-architecture], conditional="if-needed", kb=[game-networking]
review-netcode: phase=architecture, order=716, deps=[netcode-spec], conditional="if-needed", kb=[review-netcode]
ai-behavior-design: phase=architecture, order=717, deps=[system-architecture, game-design-document], conditional="if-needed", kb=[game-ai-patterns]

- [ ] **Step 1-4: Write each file** with all required sections + Conditional Evaluation
- [ ] **Step 5: Run `make validate`**
- [ ] **Step 6: Commit**

```bash
git add content/pipeline/modeling/ content/pipeline/architecture/
git commit -m "feat: add narrative, netcode, and AI behavior pipeline steps"
```

---

### Task 4: Phase 8 steps — Core specification (5 files)

**Files:**
- Create: `content/pipeline/specification/game-accessibility.md`
- Create: `content/pipeline/specification/input-controls-spec.md`
- Create: `content/pipeline/specification/game-ui-spec.md`
- Create: `content/pipeline/specification/review-game-ui.md`
- Create: `content/pipeline/specification/content-structure-design.md`

Always-enabled steps (except content-structure-design which adapts by trait).

**Frontmatter** (from spec Section 4, steps #4-8):

game-accessibility: phase=specification, order=861, deps=[game-design-document], kb=[game-accessibility]
input-controls-spec: phase=specification, order=862, deps=[game-design-document, game-accessibility], kb=[game-input-systems]
game-ui-spec: phase=specification, order=863, deps=[game-accessibility, input-controls-spec, system-architecture], kb=[game-ui-patterns, game-accessibility]
review-game-ui: phase=specification, order=864, deps=[game-ui-spec], kb=[review-game-design, game-accessibility]
content-structure-design: phase=specification, order=865, deps=[game-design-document, system-architecture], kb=[game-level-content-design]

- [ ] **Step 1-5: Write each file**
- [ ] **Step 6: Run `make validate`**
- [ ] **Step 7: Commit**

```bash
git add content/pipeline/specification/
git commit -m "feat: add core game specification pipeline steps (accessibility, input, UI, content)"
```

---

### Task 5: Phase 8 steps — Art, audio, economy (5 files)

**Files:**
- Create: `content/pipeline/specification/art-bible.md`
- Create: `content/pipeline/specification/audio-design.md`
- Create: `content/pipeline/specification/economy-design.md`
- Create: `content/pipeline/specification/review-economy.md`
- Create: `content/pipeline/specification/online-services-spec.md`

**Frontmatter** (from spec Section 4, steps #9-10, #17-19):

art-bible: phase=specification, order=866, deps=[game-design-document, performance-budgets, content-structure-design], kb=[game-asset-pipeline, game-performance-budgeting]
audio-design: phase=specification, order=867, deps=[game-design-document, performance-budgets, content-structure-design], kb=[game-audio-design]
economy-design: phase=specification, order=868, deps=[game-design-document], conditional="if-needed", kb=[game-economy-design]
review-economy: phase=specification, order=869, deps=[economy-design], conditional="if-needed", kb=[review-game-economy]
online-services-spec: phase=specification, order=871, deps=[system-architecture], conditional="if-needed", kb=[game-networking, game-liveops-analytics]

- [ ] **Step 1-5: Write each file**
- [ ] **Step 6: Run `make validate`**
- [ ] **Step 7: Commit**

```bash
git add content/pipeline/specification/
git commit -m "feat: add art, audio, economy, and online services pipeline steps"
```

---

### Task 6: Phase 8 steps — Remaining specification (3 files)

**Files:**
- Create: `content/pipeline/specification/modding-ugc-spec.md`
- Create: `content/pipeline/specification/save-system-spec.md`
- Create: `content/pipeline/specification/localization-plan.md`

**Frontmatter** (from spec Section 4, steps #20-22):

modding-ugc-spec: phase=specification, order=872, deps=[system-architecture], conditional="if-needed", kb=[game-modding-ugc]
save-system-spec: phase=specification, order=873, deps=[system-architecture, domain-modeling], conditional="if-needed", kb=[game-save-systems]
localization-plan: phase=specification, order=874, deps=[game-design-document], conditional="if-needed", kb=[game-localization]

- [ ] **Step 1-3: Write each file**
- [ ] **Step 4: Run `make validate`**
- [ ] **Step 5: Commit**

```bash
git add content/pipeline/specification/
git commit -m "feat: add modding, save system, and localization pipeline steps"
```

---

### Task 7: Phase 9 steps — Quality gates (4 files)

**Files:**
- Create: `content/pipeline/quality/playtest-plan.md`
- Create: `content/pipeline/quality/analytics-telemetry.md`
- Create: `content/pipeline/quality/live-ops-plan.md`
- Create: `content/pipeline/quality/platform-cert-prep.md`

**Frontmatter** (from spec Section 4, steps #11-12, #23-24):

playtest-plan: phase=quality, order=961, deps=[game-design-document, user-stories], kb=[game-testing-strategy]
analytics-telemetry: phase=quality, order=962, deps=[game-design-document], kb=[game-liveops-analytics]
live-ops-plan: phase=quality, order=963, deps=[game-design-document, analytics-telemetry], conditional="if-needed", kb=[game-liveops-analytics]
platform-cert-prep: phase=quality, order=964, deps=[game-accessibility, performance-budgets, game-ui-spec, input-controls-spec], conditional="if-needed", kb=[game-platform-certification]

- [ ] **Step 1-4: Write each file**
- [ ] **Step 5: Run `make validate`**
- [ ] **Step 6: Commit**

```bash
git add content/pipeline/quality/
git commit -m "feat: add playtest, analytics, live-ops, and platform cert pipeline steps"
```

---

### Task 8: Update methodology presets + remove eval-wip markers + run quality gates

**Files:**
- Modify: `content/methodology/deep.yml` (add 24 new steps)
- Modify: `content/methodology/mvp.yml` (add 24 new steps, most disabled)
- Modify: `content/methodology/custom-defaults.yml` (add 24 new steps)
- Modify: Knowledge entries (remove `<!-- eval-wip -->` markers from Plan 2)

- [ ] **Step 1: Add all 24 game steps to deep.yml**

All 24 steps should be added with `{ enabled: false }` in non-game presets. The game overlay handles enablement — standard presets just need the step entries to avoid `PRESET_MISSING_STEP` warnings.

- [ ] **Step 2: Add all 24 game steps to mvp.yml and custom-defaults.yml**

Same — `{ enabled: false }` for all game steps in non-game presets.

- [ ] **Step 3: Remove eval-wip markers from knowledge entries**

Now that pipeline steps reference the knowledge entries, remove `<!-- eval-wip -->` from all 29 knowledge files.

- [ ] **Step 4: Run `make check`**

Run: `make check`
Expected: All bash quality gates pass

- [ ] **Step 5: Run `make check-all`**

Run: `make check-all`
Expected: All quality gates pass (bash + TypeScript)

- [ ] **Step 6: Fix any eval failures**

Common issues: missing step in preset, knowledge entry not referenced, QC section needs depth tags, Methodology Scaling needs both deep and mvp bullets.

- [ ] **Step 7: Commit**

```bash
git add content/ 
git commit -m "feat: integrate game steps into methodology presets, remove eval-wip markers"
```
