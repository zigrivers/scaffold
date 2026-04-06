# Finer-Grained Init CLI Flags — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 14 new CLI flags to `scaffold init` so every wizard question can be answered non-interactively, enabling precise CI/scripting configurations.

**Architecture:** Three layers of change: (1) yargs options + validation in init.ts, (2) WizardOptions plumbing in wizard.ts, (3) question-skip logic in questions.ts. Each flag follows the existing pattern: flag provided → skip question, absent → ask interactively or use --auto default.

**Task ordering note:** Tasks 1-4 must be executed sequentially as a unit — the interfaces change across 3 files, so individual tasks may not type-check until all 3 files are updated. Implementers should commit after Task 4 (when all files align) rather than after each sub-task, or alternatively implement Tasks 1-4 as a single task.

**Tech Stack:** TypeScript, Vitest, yargs, Zod

**MMR Review:** Every task must be reviewed via multi-model review (Codex CLI + Gemini CLI + Superpowers code-reviewer) after implementation. Fix all P0, P1, and P2 findings before moving to the next task.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/cli/commands/init.ts` | Modify | Add 14 yargs options, validation checks, pass to wizard |
| `src/wizard/wizard.ts` | Modify | Extend WizardOptions, pass new fields to questions |
| `src/wizard/questions.ts` | Modify | Skip questions when flag provided |
| `src/wizard/questions.test.ts` | Modify | Test flag-skip for each new flag |
| `src/wizard/wizard.test.ts` | Modify | Test end-to-end flag → config |
| `src/cli/commands/init.test.ts` | Modify | Test CSV parsing, validation rules |

**Import path notes:** All wizard files import types from `../types/index.js`. Config types (`GameConfig`, `ProjectType`, `GameEngine`, etc.) are in `src/types/config.ts`, re-exported from `src/types/index.ts`.

---

### Task 1: Add general flags to init.ts (--depth, --adapters, --traits)

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: Read `init.ts`** to confirm current yargs options and InitArgs interface

- [ ] **Step 2: Add new fields to InitArgs interface**

Add to the `InitArgs` interface:

```typescript
interface InitArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  idea?: string
  methodology?: string
  'project-type'?: string
  // New general flags
  depth?: number
  adapters?: string | string[]
  traits?: string | string[]
}
```

- [ ] **Step 3: Add yargs options for --depth, --adapters, --traits**

Add after the existing `.option('verbose', ...)`:

```typescript
.option('depth', {
  type: 'number',
  describe: 'Default depth for custom methodology (1-5)',
  choices: [1, 2, 3, 4, 5],
})
.option('adapters', {
  type: 'string',
  describe: 'AI adapter platforms (comma-separated: claude-code,codex,gemini)',
  coerce: (val: string | string[]) =>
    [...new Set([].concat(val).flatMap((v: string) => v.split(',').map((s: string) => s.trim())))],
})
.option('traits', {
  type: 'string',
  describe: 'Project traits (comma-separated: web,mobile)',
  coerce: (val: string | string[]) =>
    [...new Set([].concat(val).flatMap((v: string) => v.split(',').map((s: string) => s.trim())))],
})
```

Also add `choices` to the existing `--methodology` option:

```typescript
.option('methodology', {
  type: 'string',
  describe: 'Preset methodology (deep/mvp/custom)',
  choices: ['deep', 'mvp', 'custom'],
})
```

- [ ] **Step 4: Add validation checks**

Add a `.check()` block after all options:

```typescript
.check((argv) => {
  // --depth requires --methodology custom (must be explicit)
  if (argv.depth !== undefined && argv.methodology !== 'custom') {
    throw new Error('--depth requires --methodology custom (use --methodology custom --depth N)')
  }
  // Validate --adapters values
  const validAdapters = ['claude-code', 'codex', 'gemini']
  for (const a of (argv.adapters as string[] ?? [])) {
    if (!validAdapters.includes(a)) {
      throw new Error(`Invalid adapter: ${a}. Valid: ${validAdapters.join(', ')}`)
    }
  }
  // Validate --traits values
  const validTraits = ['web', 'mobile', 'desktop']
  for (const t of (argv.traits as string[] ?? [])) {
    if (!validTraits.includes(t)) {
      throw new Error(`Invalid trait: ${t}. Valid: ${validTraits.join(', ')}`)
    }
  }
  // Validate --locales format (simplified locale: xx or xx-XX)
  const localeRegex = /^[a-z]{2}(-[A-Z]{2})?$/
  for (const l of (argv.locales as string[] ?? [])) {
    if (!localeRegex.test(l)) {
      throw new Error(`Invalid locale format: ${l}. Expected: xx or xx-XX (e.g., en, fr-FR, ja)`)
    }
  }
  return true
})
```

- [ ] **Step 5: Pass new flags to runWizard**

Update the `runWizard()` call to include the new fields:

```typescript
const result = await runWizard({
  projectRoot,
  auto: argv.auto ?? false,
  force: argv.force ?? false,
  methodology: argv.methodology,
  projectType: argv['project-type'],
  idea: argv.idea,
  output,
  // New general flags
  depth: argv.depth,
  adapters: argv.adapters as string[] | undefined,
  traits: argv.traits as string[] | undefined,
})
```

- [ ] **Step 6: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors about WizardOptions not having the new fields (expected — fixed in Task 2)

- [ ] **Step 7: Commit**

`feat: add --depth, --adapters, --traits flags to scaffold init`

---

### Task 2: Add game config flags to init.ts

**Files:**
- Modify: `src/cli/commands/init.ts`

- [ ] **Step 1: Add game config fields to InitArgs**

```typescript
// New game config flags
engine?: string
multiplayer?: string
'target-platforms'?: string | string[]
'online-services'?: string | string[]
'content-structure'?: string
economy?: string
narrative?: string
locales?: string | string[]
'npc-ai'?: string
modding?: boolean
persistence?: string
```

- [ ] **Step 2: Add yargs options for all 11 game flags**

```typescript
.option('engine', {
  type: 'string',
  describe: 'Game engine',
  choices: ['unity', 'unreal', 'godot', 'custom'],
})
.option('multiplayer', {
  type: 'string',
  describe: 'Multiplayer mode',
  choices: ['none', 'local', 'online', 'hybrid'],
})
.option('target-platforms', {
  type: 'string',
  describe: 'Game target platforms (comma-separated: pc,web,ios,android,ps5,xbox,switch,vr,ar)',
  coerce: (val: string | string[]) =>
    [...new Set([].concat(val).flatMap((v: string) => v.split(',').map((s: string) => s.trim())))],
})
.option('online-services', {
  type: 'string',
  describe: 'Online services (comma-separated: leaderboards,accounts,matchmaking,live-ops)',
  coerce: (val: string | string[]) =>
    [...new Set([].concat(val).flatMap((v: string) => v.split(',').map((s: string) => s.trim())))],
})
.option('content-structure', {
  type: 'string',
  describe: 'Content structure',
  choices: ['discrete', 'open-world', 'procedural', 'endless', 'mission-based'],
})
.option('economy', {
  type: 'string',
  describe: 'Economy type',
  choices: ['none', 'progression', 'monetized', 'both'],
})
.option('narrative', {
  type: 'string',
  describe: 'Narrative depth',
  choices: ['none', 'light', 'heavy'],
})
.option('locales', {
  type: 'string',
  describe: 'Supported locales (comma-separated: en,ja,fr-FR)',
  coerce: (val: string | string[]) =>
    [...new Set([].concat(val).flatMap((v: string) => v.split(',').map((s: string) => s.trim())))],
})
.option('npc-ai', {
  type: 'string',
  describe: 'NPC AI complexity',
  choices: ['none', 'simple', 'complex'],
})
.option('modding', {
  type: 'boolean',
  describe: 'Mod support (use --no-modding to disable)',
})
.option('persistence', {
  type: 'string',
  describe: 'Persistence model',
  choices: ['none', 'settings-only', 'profile', 'progression', 'cloud'],
})
```

- [ ] **Step 3: Add game-specific validation to the `.check()` block**

```typescript
// Game flags auto-set project type to 'game'
const gameFlags = ['engine', 'multiplayer', 'target-platforms', 'online-services',
  'content-structure', 'economy', 'narrative', 'locales', 'npc-ai', 'modding', 'persistence']
const hasGameFlag = gameFlags.some(f => argv[f] !== undefined)
if (hasGameFlag) {
  if (argv['project-type'] && argv['project-type'] !== 'game') {
    throw new Error(`Game flags (--engine, --multiplayer, etc.) conflict with --project-type ${argv['project-type']}`)
  }
  argv['project-type'] = 'game'
}

// --online-services requires multiplayer online/hybrid
const onlineServices = argv['online-services'] as string[] ?? []
if (onlineServices.length > 0) {
  const mp = argv.multiplayer as string ?? 'none'
  if (mp !== 'online' && mp !== 'hybrid') {
    throw new Error('--online-services requires --multiplayer online or hybrid')
  }
}

// Validate array enum values
const validTargetPlatforms = ['pc', 'web', 'ios', 'android', 'ps5', 'xbox', 'switch', 'vr', 'ar']
for (const p of (argv['target-platforms'] as string[] ?? [])) {
  if (!validTargetPlatforms.includes(p)) {
    throw new Error(`Invalid target platform: ${p}. Valid: ${validTargetPlatforms.join(', ')}`)
  }
}
const validOnlineServices = ['leaderboards', 'accounts', 'matchmaking', 'live-ops']
for (const s of onlineServices) {
  if (!validOnlineServices.includes(s)) {
    throw new Error(`Invalid online service: ${s}. Valid: ${validOnlineServices.join(', ')}`)
  }
}
```

- [ ] **Step 4: Add help text grouping**

```typescript
.group(['methodology', 'depth', 'adapters', 'traits', 'project-type'], 'Configuration:')
.group(['engine', 'multiplayer', 'target-platforms', 'online-services', 'content-structure',
  'economy', 'narrative', 'locales', 'npc-ai', 'modding', 'persistence'], 'Game Configuration:')
.group(['root', 'force', 'auto', 'idea', 'format', 'verbose'], 'General:')
```

- [ ] **Step 5: Pass game flags to runWizard**

```typescript
// Game config flags
engine: argv.engine,
multiplayer: argv.multiplayer,
targetPlatforms: argv['target-platforms'] as string[] | undefined,
onlineServices: argv['online-services'] as string[] | undefined,
contentStructure: argv['content-structure'],
economy: argv.economy,
narrative: argv.narrative,
locales: argv.locales as string[] | undefined,
npcAi: argv['npc-ai'],
modding: argv.modding,
persistence: argv.persistence,
```

- [ ] **Step 6: Commit**

`feat: add 11 game config flags to scaffold init`

---

### Task 3: Extend WizardOptions and plumb flags through wizard.ts

**Files:**
- Modify: `src/wizard/wizard.ts`

- [ ] **Step 1: Read `wizard.ts`** to confirm WizardOptions interface and askWizardQuestions call

- [ ] **Step 2: Extend WizardOptions**

```typescript
export interface WizardOptions {
  projectRoot: string
  idea?: string
  methodology?: string
  projectType?: string
  force: boolean
  auto: boolean
  output: OutputContext
  // New general flags
  depth?: number
  adapters?: string[]
  traits?: string[]
  // New game config flags
  engine?: string
  multiplayer?: string
  targetPlatforms?: string[]
  onlineServices?: string[]
  contentStructure?: string
  economy?: string
  narrative?: string
  locales?: string[]
  npcAi?: string
  modding?: boolean
  persistence?: string
}
```

- [ ] **Step 3: Pass all new fields to askWizardQuestions**

Update the `askWizardQuestions()` call to include all new fields:

```typescript
const answers = await askWizardQuestions({
  output,
  suggestion,
  methodology: presetMethodology,
  projectType: presetProjectType,
  auto,
  // New flags
  depth: options.depth,
  adapters: options.adapters,
  traits: options.traits,
  engine: options.engine,
  multiplayer: options.multiplayer,
  targetPlatforms: options.targetPlatforms,
  onlineServices: options.onlineServices,
  contentStructure: options.contentStructure,
  economy: options.economy,
  narrative: options.narrative,
  locales: options.locales,
  npcAi: options.npcAi,
  modding: options.modding,
  persistence: options.persistence,
})
```

- [ ] **Step 3b: Fix the traits → platforms config mapping**

The current `wizard.ts` writes `traits: answers.traits` into the project config, but
`ProjectConfig` defines this field as `platforms`. Fix the config builder:

Change `project: { traits: answers.traits, ... }` to `project: { platforms: answers.traits, ... }`.
This ensures `--traits web,mobile` correctly produces `project.platforms: ['web', 'mobile']`
in the config YAML, matching the `ProjectConfig` type definition.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: Errors in questions.ts (options parameter doesn't have new fields yet — fixed in Task 4)

- [ ] **Step 5: Commit**

`feat: extend WizardOptions with all new CLI flag fields`

---

### Task 4: Implement question-skip logic in questions.ts

**Files:**
- Modify: `src/wizard/questions.ts`

- [ ] **Step 1: Read `questions.ts`** to confirm the options parameter type and all question locations

- [ ] **Step 2: Extend the options parameter type**

Add all new fields to the `askWizardQuestions` options:

```typescript
export async function askWizardQuestions(options: {
  output: OutputContext
  suggestion: 'deep' | 'mvp'
  methodology?: string
  projectType?: string
  auto: boolean
  // New general flags
  depth?: number
  adapters?: string[]
  traits?: string[]
  // New game config flags
  engine?: string
  multiplayer?: string
  targetPlatforms?: string[]
  onlineServices?: string[]
  contentStructure?: string
  economy?: string
  narrative?: string
  locales?: string[]
  npcAi?: string
  modding?: boolean
  persistence?: string
}): Promise<WizardAnswers>
```

- [ ] **Step 3: Add skip logic for --depth**

Find the depth question (~line 43). Change from:

```typescript
if (methodology === 'custom' && !auto) {
  // ask depth interactively
}
```

To:

```typescript
let depth: 1 | 2 | 3 | 4 | 5 = methodology === 'mvp' ? 1 : methodology === 'deep' ? 5 : 3
if (options.depth !== undefined) {
  depth = options.depth as 1 | 2 | 3 | 4 | 5
} else if (methodology === 'custom' && !auto) {
  // ask depth interactively (existing code)
}
```

- [ ] **Step 4: Add skip logic for --adapters**

Find the platforms question (~line 52). Change from:

```typescript
if (!auto) {
  // ask codex/gemini confirm questions
}
```

To:

```typescript
let platforms: Array<'claude-code' | 'codex' | 'gemini'> = ['claude-code']
if (options.adapters) {
  platforms = options.adapters as Array<'claude-code' | 'codex' | 'gemini'>
} else if (!auto) {
  // existing interactive code
}
```

- [ ] **Step 5: Add skip logic for --traits**

Find the traits question (~line 61). Change from:

```typescript
if (!auto) {
  // ask web/mobile confirms
}
```

To:

```typescript
let traits: string[] = []
if (options.traits) {
  traits = options.traits
} else if (!auto) {
  // existing interactive code
}
```

- [ ] **Step 6: Add skip logic for all 11 game config questions**

In the game config section (~lines 82-177), for each field, add a flag-check before the interactive question. The pattern for each:

```typescript
// Engine
const engine = options.engine
  ?? (auto ? 'custom' : await output.select('Game engine?', ['unity', 'unreal', 'godot', 'custom']))

// Multiplayer
const multiplayerMode = options.multiplayer
  ?? (auto ? 'none' : await output.select('Multiplayer mode?', ...))
```

For the advanced options gate (~line 136), if any advanced flag is provided, skip the gate and force it open:

```typescript
const hasAdvancedFlag = options.narrative !== undefined || options.locales !== undefined
  || options.npcAi !== undefined || options.modding !== undefined || options.persistence !== undefined
const showAdvanced = hasAdvancedFlag || (!auto && await output.confirm('Configure advanced game options?'))
```

Then for each advanced question, use the same pattern:

```typescript
// Use Zod schema defaults for unflagged advanced fields (not hardcoded 'none')
// Import: import { GameConfigSchema } from '../../config/schema.js'
const schemaDefaults = GameConfigSchema.parse({ engine })
const narrative = options.narrative ?? (showAdvanced && !auto ? await output.select(...) : schemaDefaults.narrative)
const persistence = options.persistence ?? (showAdvanced && !auto ? await output.select(...) : schemaDefaults.persistence)
// Same pattern for locales, npcAi, hasModding
```

**Important:** Use `GameConfigSchema.parse({ engine })` to derive defaults rather than
hardcoding `'none'`. This matches the existing `--auto` path (questions.ts ~line 85)
and prevents drift if schema defaults change.

- [ ] **Step 7: Run type check and full test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: Type check passes, all tests pass

- [ ] **Step 8: Commit**

`feat: implement flag-skip logic for all 14 new CLI flags`

---

### Task 5: Add tests for general flags (questions.test.ts)

**Files:**
- Modify: `src/wizard/questions.test.ts`

- [ ] **Step 1: Read `questions.test.ts`** to understand the test helper pattern

- [ ] **Step 2: Add tests for --depth, --adapters, --traits flag-skip**

Add tests to the existing describe block:

```typescript
it('uses depth flag when provided', async () => {
  const output = makeMockOutput()
  vi.mocked(output.select).mockResolvedValueOnce('custom') // methodology
  const answers = await askWizardQuestions({
    output, suggestion: 'deep', auto: false, depth: 4,
  })
  expect(answers.depth).toBe(4)
})

it('uses adapters flag when provided (skips platform confirms)', async () => {
  const output = makeMockOutput()
  vi.mocked(output.select).mockResolvedValueOnce('deep') // methodology
  const answers = await askWizardQuestions({
    output, suggestion: 'deep', auto: false, adapters: ['claude-code', 'gemini'],
  })
  expect(answers.platforms).toEqual(['claude-code', 'gemini'])
  // Confirm was NOT called for codex/gemini
  expect(output.confirm).not.toHaveBeenCalled()
})

it('uses traits flag when provided (skips web/mobile confirms)', async () => {
  const output = makeMockOutput()
  vi.mocked(output.select).mockResolvedValueOnce('deep') // methodology
  const answers = await askWizardQuestions({
    output, suggestion: 'deep', auto: false, traits: ['web', 'mobile'],
  })
  expect(answers.traits).toEqual(['web', 'mobile'])
})
```

- [ ] **Step 3: Run tests — expect PASS**

Run: `npx vitest run src/wizard/questions.test.ts`

- [ ] **Step 4: Commit**

`test: add flag-skip tests for --depth, --adapters, --traits`

---

### Task 6: Add tests for game config flags (questions.test.ts)

**Files:**
- Modify: `src/wizard/questions.test.ts`

- [ ] **Step 1: Add tests for game config flag-skip**

```typescript
it('uses --engine flag (skips engine question)', async () => {
  const output = makeMockOutput()
  const answers = await askWizardQuestions({
    output, suggestion: 'deep', auto: false,
    projectType: 'game', engine: 'unreal',
  })
  expect(answers.gameConfig?.engine).toBe('unreal')
})

it('uses --multiplayer flag', async () => {
  const output = makeMockOutput()
  const answers = await askWizardQuestions({
    output, suggestion: 'deep', auto: false,
    projectType: 'game', engine: 'unity', multiplayer: 'online',
  })
  expect(answers.gameConfig?.multiplayerMode).toBe('online')
})

it('uses --target-platforms flag', async () => {
  const output = makeMockOutput()
  const answers = await askWizardQuestions({
    output, suggestion: 'deep', auto: false,
    projectType: 'game', engine: 'unity', targetPlatforms: ['ios', 'android'],
  })
  expect(answers.gameConfig?.targetPlatforms).toEqual(['ios', 'android'])
})

it('advanced flags skip the advanced gate', async () => {
  const output = makeMockOutput()
  const answers = await askWizardQuestions({
    output, suggestion: 'deep', auto: false,
    projectType: 'game', engine: 'godot', narrative: 'heavy',
  })
  expect(answers.gameConfig?.narrative).toBe('heavy')
  // Confirm for "Configure advanced options?" was NOT called
})

it('--auto with game flags overrides defaults', async () => {
  const output = makeMockOutput()
  const answers = await askWizardQuestions({
    output, suggestion: 'deep', auto: true,
    projectType: 'game', engine: 'unreal', multiplayer: 'online',
    targetPlatforms: ['ps5', 'xbox'], economy: 'monetized',
  })
  expect(answers.gameConfig?.engine).toBe('unreal')
  expect(answers.gameConfig?.multiplayerMode).toBe('online')
  expect(answers.gameConfig?.targetPlatforms).toEqual(['ps5', 'xbox'])
  expect(answers.gameConfig?.economy).toBe('monetized')
  // Non-flagged fields use Zod defaults
  expect(answers.gameConfig?.narrative).toBe('none')
})
```

- [ ] **Step 2: Run tests — expect PASS**

Run: `npx vitest run src/wizard/questions.test.ts`

- [ ] **Step 3: Commit**

`test: add flag-skip tests for game config flags`

---

### Task 7: Add init.ts validation tests

**Files:**
- Modify: `src/cli/commands/init.test.ts`

- [ ] **Step 1: Read `init.test.ts`** to understand test patterns

- [ ] **Step 2: Add validation rule tests**

Test the `.check()` validation rules by calling the yargs builder or handler directly:

```typescript
describe('init CLI validation', () => {
  it('rejects --depth with --methodology deep', async () => {
    // Test that the check function throws for invalid combos
    // Pattern depends on how init.test.ts invokes the command
  })

  it('rejects game flags with non-game --project-type', async () => {
    // --engine unity --project-type web-app → error
  })

  it('auto-sets project-type to game when game flag provided', async () => {
    // --engine unity (no --project-type) → project-type becomes 'game'
  })

  it('rejects --online-services without multiplayer online/hybrid', async () => {
    // --online-services leaderboards --multiplayer none → error
  })
})
```

Note: The exact test patterns depend on how `init.test.ts` currently invokes the command. Read the file to determine if tests call `handler()` directly with synthetic argv or use yargs parsing. Adapt accordingly.

- [ ] **Step 3: Run tests — expect PASS**

Run: `npx vitest run src/cli/commands/init.test.ts`

- [ ] **Step 4: Commit**

`test: add init.ts validation tests for new flag rules`

---

### Task 8: Add wizard end-to-end tests

**Files:**
- Modify: `src/wizard/wizard.test.ts`

- [ ] **Step 1: Add end-to-end flag → config tests**

```typescript
it('game flags produce correct config', async () => {
  // Call runWizard with game flags, verify config.project.gameConfig
})

it('--adapters flag produces correct config.platforms', async () => {
  // Call runWizard with adapters, verify config.platforms
})

it('--traits flag produces correct config.project.platforms', async () => {
  // Call runWizard with traits, verify config.project.platforms
})

it('--depth flag produces correct config.custom.default_depth', async () => {
  // Call runWizard with depth + methodology custom, verify config.custom.default_depth
})
```

- [ ] **Step 2: Run tests — expect PASS**

- [ ] **Step 3: Commit**

`test: add wizard end-to-end tests for new CLI flags`

---

### Task 9: Run full quality gates

**Files:** None (verification only)

- [ ] **Step 1: `npx tsc --noEmit`** — no type errors
- [ ] **Step 2: `npx vitest run`** — all tests pass
- [ ] **Step 3: `npx eslint src/`** — no lint errors
- [ ] **Step 4: `make check-all`** — all quality gates pass
