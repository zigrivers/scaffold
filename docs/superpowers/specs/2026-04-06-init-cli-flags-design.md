# Finer-Grained CLI Flags for `scaffold init` — Design Spec

## Problem

`scaffold init` has only 2 pipeline-configuration flags (`--methodology` and
`--project-type`). All other config — game engine, multiplayer mode, target
platforms, economy, etc. — requires either the interactive wizard or `--auto`
with Zod defaults. CI/scripting workflows can't specify configurations like
"online multiplayer on mobile with Unity" without interactive input.

## Solution

Add 14 new CLI flags covering every wizard question. When a flag is
provided, the corresponding wizard question is skipped. When absent, the
wizard asks interactively (or uses Zod defaults in `--auto` mode). Flags
override `--auto` defaults, enabling precise CI configurations.

## Flag Inventory

### Existing Flags (unchanged)

| Flag | Type | Purpose |
|------|------|---------|
| `--root` | string | Project root directory |
| `--force` | boolean | Reinitialize if .scaffold/ exists |
| `--auto` | boolean | Non-interactive mode |
| `--methodology` | string | Preset (deep/mvp/custom) — add `choices` validation |
| `--verbose` | boolean | Verbose output |
| `--project-type` | string | Project type (web-app/mobile-app/backend/cli/library/game) |
| `--idea` | string | One-line idea for methodology suggestion |
| `--format` | string | Output format |

### New General Flags (all project types)

| Flag | Type | Maps to | Default (--auto) |
|------|------|---------|------------------|
| `--depth` | number | `custom.default_depth` | 3 |
| `--adapters` | comma-sep | `config.platforms` | `['claude-code']` |
| `--traits` | comma-sep | `config.project.platforms` | `[]` |

`--depth` only applies when `--methodology custom`. Error if used with
deep or mvp. Enforce valid range via yargs `choices: [1, 2, 3, 4, 5]`.

`--adapters` was originally named `--platforms` but renamed to avoid a
three-way naming collision (AI adapters, game target platforms, project
deployment platforms). Valid values: claude-code, codex, gemini. Enforce
via yargs `choices`. Note: the current wizard asks two separate confirm
questions ("Include Codex?" / "Include Gemini?") with claude-code always
included. When `--adapters` is provided, skip both confirms and use the
flag value directly.

`--traits` covers the "Is this a web app? / Is this a mobile app?" wizard
questions. Values: web, mobile. (`desktop` is accepted by the type system
but not currently asked by the wizard — accepting it via flag is a minor
new capability.)

### New Game Config Flags (require `--project-type game`)

| Flag | Type | Maps to | Default (--auto) |
|------|------|---------|------------------|
| `--engine` | string | `gameConfig.engine` | `'custom'` |
| `--multiplayer` | string | `gameConfig.multiplayerMode` | `'none'` |
| `--target-platforms` | comma-sep | `gameConfig.targetPlatforms` | `['pc']` |
| `--online-services` | comma-sep | `gameConfig.onlineServices` | `[]` |
| `--content-structure` | string | `gameConfig.contentStructure` | `'discrete'` |
| `--economy` | string | `gameConfig.economy` | `'none'` |
| `--narrative` | string | `gameConfig.narrative` | `'none'` |
| `--locales` | comma-sep | `gameConfig.supportedLocales` | `['en']` |
| `--npc-ai` | string | `gameConfig.npcAiComplexity` | `'none'` |
| `--modding` | boolean | `gameConfig.hasModding` | `false` |
| `--persistence` | string | `gameConfig.persistence` | `'progression'` |

Enum values for each flag match the TypeScript types in `src/types/config.ts`:
- `--engine`: unity, unreal, godot, custom
- `--multiplayer`: none, local, online, hybrid
- `--target-platforms`: pc, web, ios, android, ps5, xbox, switch, vr, ar
- `--online-services`: leaderboards, accounts, matchmaking, live-ops
- `--content-structure`: discrete, open-world, procedural, endless, mission-based
- `--economy`: none, progression, monetized, both
- `--narrative`: none, light, heavy
- `--locales`: simplified locale format (en, ja, fr-FR) validated by regex `^[a-z]{2}(-[A-Z]{2})?$` — not full BCP 47
- `--npc-ai`: none, simple, complex
- `--persistence`: none, settings-only, profile, progression, cloud

## Validation Rules

Enforced at the CLI layer (yargs `.check()`) before the wizard runs:

1. **Game flags auto-set game project type**: Providing any game config flag
   (--engine, --multiplayer, --target-platforms, etc.) without
   `--project-type` auto-sets project type to `game`. If `--project-type`
   is explicitly set to a non-game value (e.g., `--project-type web-app
   --engine unity`), produce a CLI error.

2. **`--depth` requires `--methodology custom`**: Error if used with deep
   or mvp. Those methodologies have fixed depths (5 and 1 respectively).

3. **`--online-services` requires multiplayer online/hybrid**: Error if
   `--multiplayer` is none or local (or absent, defaulting to none).

4. **CSV arrays auto-dedup**: `--locales en,en,ja` → `['en', 'ja']`.
   Prevents false "multiple locales" from duplicates.

5. **Enum validation via yargs `choices`**: Immediate CLI error for invalid
   values (e.g., `--engine godott` → "Invalid value for --engine").

6. **Locale regex validation**: Each comma-separated locale validated
   against `^[a-z]{2}(-[A-Z]{2})?$` either via yargs `.coerce()` or
   deferred to Zod schema.

## Implementation Details

### Comma-separated array parsing

Yargs does not natively split comma-separated values. Use `.coerce()` on
all array flags. The coerce must handle both string input (`--flag a,b`)
and array input (`--flag a --flag b`) since yargs collapses repeated flags
into arrays:

```typescript
.option('target-platforms', {
  type: 'string',
  describe: 'Game target platforms (comma-separated)',
  coerce: (val: string | string[]) =>
    [...new Set([].concat(val).flatMap(v => v.split(',').map(s => s.trim())))],
})
```

This handles splitting, trimming, deduplication, and repeated-flag input.

For array flags with enum values, yargs `choices` does not work with
`.coerce()`. Use a yargs `.check()` function to validate each element
against the allowed values after coercion:

```typescript
.check((argv) => {
  const valid = ['pc', 'web', 'ios', 'android', 'ps5', 'xbox', 'switch', 'vr', 'ar']
  for (const p of argv.targetPlatforms ?? []) {
    if (!valid.includes(p)) throw new Error(`Invalid target platform: ${p}`)
  }
  return true
})
```

### Boolean three-state for `--modding`

Yargs `type: 'boolean'` gives three states: `undefined` (not provided),
`true` (`--modding`), `false` (`--no-modding`). The wizard skip logic
checks `argv.modding !== undefined` to distinguish "not provided" from
"explicitly set to false".

### Flag-to-config key mapping

CLI flags use short kebab-case names; config keys use longer camelCase.
Explicit mapping in the wizard:

| CLI Flag | Config Key |
|----------|-----------|
| `--multiplayer` | `multiplayerMode` |
| `--locales` | `supportedLocales` |
| `--npc-ai` | `npcAiComplexity` |
| `--modding` | `hasModding` |
| `--adapters` | `platforms` (config root) |
| `--traits` | `project.platforms` (NOT config.platforms — different field) |

All other flags map directly (kebab-to-camel).

### Help text grouping

With 22+ total flags, use yargs `.group()` for discoverability:

```typescript
.group(['methodology', 'depth', 'adapters', 'traits', 'project-type'], 'Configuration:')
.group(['engine', 'multiplayer', 'target-platforms', ...], 'Game Configuration:')
.group(['root', 'force', 'auto', 'idea', 'format'], 'General:')
```

## Flag-Question Skip Behavior

Same pattern as existing `--methodology` and `--project-type`:

1. Flag provided → skip the wizard question, use flag value
2. Flag absent + `--auto` → use Zod default
3. Flag absent + interactive → ask the wizard question

Flags always take highest precedence: `--auto --engine unreal` uses Zod
defaults for everything except engine (which is `unreal`).

### Advanced game flag gate behavior

The wizard has a "Configure advanced game options?" confirm gate before
asking narrative, locales, npc-ai, modding, and persistence. When any of
these flags is provided via CLI, the confirm gate is skipped (forced open)
and only the remaining unset advanced questions are asked interactively.
In `--auto` mode, the gate is always skipped (advanced fields use Zod
defaults unless overridden by flags).

## Files Changed

| File | Action | What Changes |
|------|--------|-------------|
| `src/cli/commands/init.ts` | Modify | Add 14 yargs options, validation checks, pass to wizard |
| `src/wizard/wizard.ts` | Modify | Extend WizardOptions with new flag fields |
| `src/wizard/questions.ts` | Modify | Skip questions when corresponding flag is provided |
| `src/wizard/questions.test.ts` | Modify | Test flag-skip behavior for each new flag |
| `src/wizard/wizard.test.ts` | Modify | Test end-to-end flag → config flow |
| `src/cli/commands/init.test.ts` | Modify | Test CSV parsing, dedup, choices, cross-field validation |
| `src/types/config.ts` | Modify (if needed) | Verify `ProjectConfig.platforms` alignment with `--traits` |
| `src/config/schema.ts` | Modify (if needed) | Verify `ProjectSchema` matches any type changes |

## Example CI Workflows

```bash
# Multiplayer mobile game with Unity
scaffold init --project-type game --methodology deep --auto \
  --engine unity --multiplayer online --target-platforms ios,android \
  --economy monetized --online-services matchmaking,leaderboards

# Simple puzzle game with Godot
scaffold init --project-type game --auto --engine godot

# Non-game web app with multiple adapters
scaffold init --project-type web-app --methodology mvp --auto \
  --adapters claude-code,gemini --traits web,mobile

# Custom methodology at depth 3
scaffold init --methodology custom --depth 3 --auto

# Game with explicit no-modding
scaffold init --project-type game --auto --engine godot --no-modding

# Partial flags + interactive (wizard asks remaining questions)
scaffold init --project-type game --engine unreal --multiplayer online
# → wizard asks target-platforms, economy, etc. interactively
```

## Impact

- **14 new yargs options** in init.ts
- **6-8 files changed**: init.ts, wizard.ts, questions.ts, + 3 test files, + type/schema if needed
- **0 new files**
- **Full CI scriptability**: every wizard question can be answered via flags
- **Backward compatible**: no existing flags change behavior
