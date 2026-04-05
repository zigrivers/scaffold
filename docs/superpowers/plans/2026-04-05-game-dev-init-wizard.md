# Game Dev Init Wizard — Implementation Plan (Plan 4 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add game configuration questions to the scaffold init wizard with progressive disclosure, and wire answers into config.yml under `project.gameConfig`.

**Architecture:** Extend the existing wizard question flow in `src/wizard/questions.ts` to ask game-specific questions when `projectType: game` is selected. Store answers via `src/wizard/wizard.ts`. Use the new `select()`, `multiSelect()`, `multiInput()` primitives added in Plan 1.

**Tech Stack:** TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-game-dev-pipeline-design.md` (Section 2d for wizard flow, Section 7 for summary)

**Depends on:** Plan 1 (Zod schema, wizard UI primitives, GameConfig types)

---

### Task 1: Add projectType question to init wizard

**Files:**
- Modify: `src/wizard/questions.ts`
- Modify: `src/wizard/questions.test.ts`

- [ ] **Step 1: Read current questions.ts and questions.test.ts** to understand the flow and WizardAnswers type

- [ ] **Step 2: Write failing test**

Add test: when user selects projectType 'game', WizardAnswers should include `projectType: 'game'`.

- [ ] **Step 3: Extend WizardAnswers** to include `projectType?: ProjectType`

- [ ] **Step 4: Add projectType question** after the existing traits/platforms questions

Use `output.select()`:
```typescript
const projectType = await output.select(
  'What type of project is this?',
  ['web-app', 'mobile-app', 'backend', 'cli', 'library', 'game'],
  'web-app',
)
```

- [ ] **Step 5: Run tests — expect PASS**
- [ ] **Step 6: Commit**

```bash
git add src/wizard/questions.ts src/wizard/questions.test.ts
git commit -m "feat: add projectType question to init wizard"
```

---

### Task 2: Add game config questions with progressive disclosure

**Files:**
- Modify: `src/wizard/questions.ts`
- Modify: `src/wizard/questions.test.ts`

- [ ] **Step 1: Write failing tests** for game config questions

Tests:
1. When projectType is 'game', engine question is asked
2. When projectType is 'game' and multiplayer is 'online', onlineServices question is asked
3. When projectType is not 'game', no game questions are asked
4. Default values applied in auto mode

- [ ] **Step 2: Extend WizardAnswers** to include `gameConfig?` matching the GameConfig type

- [ ] **Step 3: Add game config questions** (only when projectType === 'game')

Progressive disclosure flow per spec Section 2d:

**Core questions (always asked when game):**
```typescript
const engine = await output.select('Game engine?', ['unity', 'unreal', 'godot', 'custom'])
const multiplayerMode = await output.select('Multiplayer mode?', ['none', 'local', 'online', 'hybrid'], 'none')
const targetPlatforms = await output.multiSelect('Target platforms?', ['pc', 'web', 'ios', 'android', 'ps5', 'xbox', 'switch', 'vr', 'ar'], ['pc'])
```

**Conditional follow-ups:**
```typescript
let onlineServices: string[] = []
if (multiplayerMode === 'online' || multiplayerMode === 'hybrid') {
  onlineServices = await output.multiSelect('Online services?', ['leaderboards', 'accounts', 'matchmaking', 'live-ops'], [])
}
const contentStructure = await output.select('Content structure?', ['discrete', 'open-world', 'procedural', 'endless', 'mission-based'], 'discrete')
const economy = await output.select('Economy type?', ['none', 'progression', 'monetized', 'both'], 'none')
```

**Advanced (behind opt-in gate):**
```typescript
const configureAdvanced = await output.confirm('Configure advanced game settings?', false)
let narrative = 'none', supportedLocales = ['en'], npcAiComplexity = 'none', hasModding = false, persistence = 'progression'
if (configureAdvanced) {
  narrative = await output.select('Narrative depth?', ['none', 'light', 'heavy'], 'none')
  supportedLocales = await output.multiInput('Supported locales (comma-separated)?', ['en'])
  npcAiComplexity = await output.select('NPC AI complexity?', ['none', 'simple', 'complex'], 'none')
  hasModding = await output.confirm('Mod support?', false)
  persistence = await output.select('Persistence model?', ['none', 'settings-only', 'profile', 'progression', 'cloud'], 'progression')
}
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Run full test suite**
- [ ] **Step 6: Commit**

```bash
git add src/wizard/questions.ts src/wizard/questions.test.ts
git commit -m "feat: add game config questions with progressive disclosure"
```

---

### Task 3: Wire game config into config.yml writing

**Files:**
- Modify: `src/wizard/wizard.ts`
- Modify: `src/wizard/wizard.test.ts`

- [ ] **Step 1: Read current wizard.ts** to understand config construction (around line 97)

- [ ] **Step 2: Write failing test**

Test: when WizardAnswers has `projectType: 'game'` and `gameConfig`, the written config.yml should contain the game config under `project.gameConfig`.

- [ ] **Step 3: Extend config construction** to include projectType and gameConfig

```typescript
const config: ScaffoldConfig = {
  version: 2,
  methodology: answers.methodology,
  platforms: answers.platforms,
  project: {
    traits: answers.traits,
    ...(answers.projectType && { projectType: answers.projectType }),
    ...(answers.gameConfig && { gameConfig: answers.gameConfig }),
  },
}
```

- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Run full test suite**
- [ ] **Step 6: Commit**

```bash
git add src/wizard/wizard.ts src/wizard/wizard.test.ts
git commit -m "feat: wire game config into config.yml writing"
```

---

### Task 4: Run full quality gates

**Files:** None (verification only)

- [ ] **Step 1: TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: make check-all**

Run: `make check-all`
Expected: All gates pass
