# macOS-Native Project Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `macos-native` project type (Swift/SwiftUI/AppKit) to Scaffold so the pipeline can scaffold native macOS apps — comprehensive, on par with the `game` type.

**Architecture:** A project-type *overlay* (identical mechanism to `game`). No engine changes — the overlay machinery already shipped with the game pipeline. Work is: (1) thread `macos-native` through the TypeScript config/validator/types/detector/wizard/CLI layers, (2) author 5 new pipeline-step meta-prompts + a 20-entry knowledge category, (3) wire the overlay + preset defaults, (4) docs/freshness.

**Tech Stack:** TypeScript (Zod schemas, vitest), bats, Markdown meta-prompts + YAML overlays. Tests: `npx vitest run <file>` for TS; `make validate` for pipeline frontmatter; `node dist/index.js validate-knowledge` for knowledge frontmatter; `make check-all` for the full gate.

**Spec:** `docs/superpowers/specs/2026-06-18-macos-native-project-type-design.md` (read it first — this plan implements it verbatim).

## Global Constraints

These apply to **every** task:

- **Project-type slug:** `macos-native` (kebab-case, exactly).
- **Config = 7 fields** with these exact names/values/defaults:
  - `uiFramework`: `swiftui` | `appkit` | `hybrid` — default `swiftui`
  - `appStyle`: `standard` | `menu-bar` | `agent` — default `standard`
  - `minMacosVersion`: version string (e.g. `"15.0"`) — default `"15.0"`
  - `distribution`: `developer-id` | `mac-app-store` | `both` — default `developer-id`
  - `sandboxed`: boolean — default `false`
  - `persistence`: `none` | `sqlite` | `core-data` | `swiftdata` — default `none`
  - `autoUpdate`: `none` | `sparkle` — default `none`
- **3 coupling rules** (config invalid if violated):
  1. `distribution ∈ {mac-app-store, both}` ⇒ `sandboxed` must be `true`
  2. `distribution === 'mac-app-store'` ⇒ `autoUpdate` must be `none`
  3. `persistence === 'swiftdata'` ⇒ major(`minMacosVersion`) ≥ `14`
- **5 new pipeline steps:** `macos-ui-spec`, `review-macos-ui` (phase `specification`); `macos-distribution-spec`, `macos-entitlements-privacy-spec`, `review-macos-release` (phase `quality`).
- **3 disabled web steps** (via overlay): `design-system`, `ux-spec`, `review-ux`.
- **20 knowledge entries** under `content/knowledge/macos-native/` (listed in Task 11–13).
- **Single source of truth:** `ProjectTypeSchema` in `src/config/schema.ts`. Every list of project types derives from it.
- **Follow existing patterns exactly.** The `mobile-app` and `ml` types are the closest mirrors for plumbing; `game` is the mirror for the overlay/steps/knowledge. Match file style, import ordering, and naming.
- **Commit after every task** with a `feat:`/`docs:`/`test:` message. Do **not** use `--no-verify` to bypass secret scanning; `--no-verify` is allowed only to skip the slow pre-push test hook when `make check-all` already passed.
- **Branch:** all work lands on `macos-native-project-type` (already created; the spec lives there).

---

## File Structure

**New files:**
- `src/config/validators/macos-native.ts` — coupling validator (3 rules)
- `src/config/validators/macos-native.test.ts` — validator tests
- `src/project/detectors/macos-native.ts` — auto-detector
- `src/project/detectors/macos-native.test.ts` — detector tests
- `src/wizard/copy/macos-native.ts` — wizard copy for the 7 fields
- `content/methodology/macos-native-overlay.yml` — the overlay
- `content/pipeline/specification/macos-ui-spec.md`, `review-macos-ui.md`
- `content/pipeline/quality/macos-distribution-spec.md`, `macos-entitlements-privacy-spec.md`, `review-macos-release.md`
- `content/knowledge/macos-native/*.md` — 20 entries

**Modified files:**
- `src/config/schema.ts` — enum + `MacosNativeConfigSchema` + `ProjectSchema`/`ServiceSchema` fields
- `src/config/validators/index.ts` — register validator
- `src/types/config.ts` — type + `DetectedConfig` + `ProjectConfig`/`ServiceConfig` fields
- `src/project/detectors/types.ts` — `MacosNativeMatch` + union
- `src/project/detectors/index.ts` — register detector
- `src/wizard/copy/types.ts` — `MacosNativeCopy` + `ProjectCopyMap`
- `src/wizard/copy/index.ts` — register copy
- `src/wizard/copy/core.ts` — `projectType.options['macos-native']`
- `src/wizard/flags.ts` — `MacosNativeFlags`
- `src/wizard/questions.ts` — config branch
- `src/cli/init-flag-families.ts` — `MACOS_NATIVE_FLAGS` + validation + overrides
- `src/cli/commands/init.ts` — flag defs + grouping + wizard wiring + `CONFIG_SETTING_FLAGS`
- `src/e2e/project-type-overlays.test.ts` — macos-native e2e case
- `content/methodology/deep.yml`, `content/methodology/mvp.yml` — 5 steps default-off
- `content/knowledge/VERSION` — bump
- `README.md`, `CHANGELOG.md` — docs + count bump

---

## Task 1: Config schema + types

**Files:**
- Modify: `src/config/schema.ts` (add to `ProjectTypeSchema`; add `MacosNativeConfigSchema`; add field to `ProjectSchema` and `ServiceSchema`)
- Modify: `src/types/config.ts` (import schema; add type; add to `DetectedConfig`, `ProjectConfig`, `ServiceConfig`)
- Test: `src/config/schema.test.ts` (existing file — add a describe block; if it does not exist, create it)

**Interfaces:**
- Produces: `MacosNativeConfigSchema` (Zod), `MacosNativeConfig` type with fields from Global Constraints. `ProjectTypeSchema` now includes `'macos-native'`.

- [ ] **Step 1: Write the failing test**

Add to `src/config/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ProjectTypeSchema, MacosNativeConfigSchema } from './schema.js'

describe('macos-native config schema', () => {
  it('includes macos-native in the project-type enum', () => {
    expect(ProjectTypeSchema.options).toContain('macos-native')
  })

  it('applies defaults', () => {
    const cfg = MacosNativeConfigSchema.parse({})
    expect(cfg).toEqual({
      uiFramework: 'swiftui',
      appStyle: 'standard',
      minMacosVersion: '15.0',
      distribution: 'developer-id',
      sandboxed: false,
      persistence: 'none',
      autoUpdate: 'none',
    })
  })

  it('rejects unknown keys (strict)', () => {
    expect(MacosNativeConfigSchema.safeParse({ bogus: true }).success).toBe(false)
  })

  it('rejects a malformed minMacosVersion', () => {
    expect(MacosNativeConfigSchema.safeParse({ minMacosVersion: 'Sonoma' }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/config/schema.test.ts -t "macos-native config schema"`
Expected: FAIL — `MacosNativeConfigSchema` is not exported / `macos-native` not in enum.

- [ ] **Step 3: Implement the schema**

In `src/config/schema.ts`, add `'macos-native'` to the enum array:

```ts
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
  'data-science', 'web3', 'mcp-server', 'macos-native',
])
```

Add the config schema near `GameConfigSchema` (before `ServiceSchema`):

```ts
export const MacosNativeConfigSchema = z.object({
  uiFramework: z.enum(['swiftui', 'appkit', 'hybrid']).default('swiftui'),
  appStyle: z.enum(['standard', 'menu-bar', 'agent']).default('standard'),
  minMacosVersion: z.string()
    .regex(/^\d+(\.\d+){0,2}$/, 'must be a macOS version like "15" or "15.0"')
    .default('15.0'),
  distribution: z.enum(['developer-id', 'mac-app-store', 'both']).default('developer-id'),
  sandboxed: z.boolean().default(false),
  persistence: z.enum(['none', 'sqlite', 'core-data', 'swiftdata']).default('none'),
  autoUpdate: z.enum(['none', 'sparkle']).default('none'),
}).strict()
```

Add the optional field to both `ServiceSchema` and `ProjectSchema` object shapes (next to `gameConfig: GameConfigSchema.optional(),`):

```ts
  macosNativeConfig: MacosNativeConfigSchema.optional(),
```

- [ ] **Step 4: Add the inferred type + wiring in `src/types/config.ts`**

Add `MacosNativeConfigSchema` to the schema import block at the top. Add the type near `GameConfig`:

```ts
/** macOS-native (Swift/SwiftUI/AppKit) configuration — derived from Zod schema (single source of truth). */
export type MacosNativeConfig = z.infer<typeof MacosNativeConfigSchema>
```

Add to the `DetectedConfig` union:

```ts
  | { type: 'macos-native'; config: MacosNativeConfig }
```

Add `macosNativeConfig?: MacosNativeConfig` to both the `ProjectConfig` interface and the `ServiceConfig` interface (next to `gameConfig?`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/config/schema.test.ts -t "macos-native config schema"`
Expected: PASS (4 assertions).

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts src/types/config.ts src/config/schema.test.ts
git commit -m "feat(config): add macos-native project type + MacosNativeConfig schema"
```

---

## Task 2: Coupling validator (3 rules)

**Files:**
- Create: `src/config/validators/macos-native.ts`
- Create: `src/config/validators/macos-native.test.ts`
- Modify: `src/config/validators/index.ts` (import + add to `ALL_COUPLING_VALIDATORS`)

**Interfaces:**
- Consumes: `MacosNativeConfig` (Task 1), `CouplingValidator<T>` from `./types.js`.
- Produces: `macosNativeCouplingValidator` with `configKey: 'macosNativeConfig'`, `projectType: 'macos-native'`. Registering it makes `configKeyFor('macos-native')` return `'macosNativeConfig'` and runs the 3 coupling rules inside `ProjectSchema`/`ServiceSchema` `superRefine`.

- [ ] **Step 1: Write the failing test**

Create `src/config/validators/macos-native.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ProjectSchema } from '../schema.js'

function check(macosNativeConfig: Record<string, unknown>) {
  return ProjectSchema.safeParse({ projectType: 'macos-native', macosNativeConfig })
}

describe('macos-native coupling validator', () => {
  it('accepts a valid developer-id config', () => {
    expect(check({ distribution: 'developer-id', sandboxed: false, autoUpdate: 'sparkle' }).success).toBe(true)
  })

  it('requires sandboxed:true for mac-app-store', () => {
    const r = check({ distribution: 'mac-app-store', sandboxed: false, autoUpdate: 'none' })
    expect(r.success).toBe(false)
  })

  it('forbids sparkle in a mac-app-store build', () => {
    const r = check({ distribution: 'mac-app-store', sandboxed: true, autoUpdate: 'sparkle' })
    expect(r.success).toBe(false)
  })

  it('allows sparkle when distribution is both', () => {
    const r = check({ distribution: 'both', sandboxed: true, autoUpdate: 'sparkle' })
    expect(r.success).toBe(true)
  })

  it('requires macOS 14+ for swiftdata', () => {
    expect(check({ persistence: 'swiftdata', minMacosVersion: '13.0' }).success).toBe(false)
    expect(check({ persistence: 'swiftdata', minMacosVersion: '14.0' }).success).toBe(true)
  })

  it('rejects macosNativeConfig on a non-macos-native project', () => {
    const r = ProjectSchema.safeParse({ projectType: 'web-app', macosNativeConfig: {} })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/config/validators/macos-native.test.ts`
Expected: FAIL — validator not registered, so coupling rules don't fire (most assertions fail).

- [ ] **Step 3: Implement the validator**

Create `src/config/validators/macos-native.ts`:

```ts
import type { CouplingValidator } from './types.js'
import type { MacosNativeConfig } from '../../types/config.js'

/** Leading integer (major version) of a macOS version string, e.g. "15.0" → 15. */
function macosMajor(version: string): number {
  return parseInt(version.split('.')[0] ?? '', 10)
}

export const macosNativeCouplingValidator: CouplingValidator<MacosNativeConfig> = {
  configKey: 'macosNativeConfig',
  projectType: 'macos-native',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'macos-native') {
      ctx.addIssue({
        path: [...path, 'macosNativeConfig'],
        code: 'custom',
        message: 'macosNativeConfig requires projectType: macos-native',
      })
    }
    if (config) {
      const { distribution, sandboxed, autoUpdate, persistence, minMacosVersion } = config
      // Rule 1 — Mac App Store requires the App Sandbox.
      if ((distribution === 'mac-app-store' || distribution === 'both') && !sandboxed) {
        ctx.addIssue({
          path: [...path, 'macosNativeConfig', 'sandboxed'],
          code: 'custom',
          message: 'Mac App Store distribution requires sandboxed: true',
        })
      }
      // Rule 2 — Sparkle/third-party updaters are disallowed in App Store builds.
      if (distribution === 'mac-app-store' && autoUpdate !== 'none') {
        ctx.addIssue({
          path: [...path, 'macosNativeConfig', 'autoUpdate'],
          code: 'custom',
          message: 'Mac App Store builds cannot bundle a third-party updater '
            + '(set autoUpdate: none; the App Store delivers updates)',
        })
      }
      // Rule 3 — SwiftData requires macOS 14+.
      if (persistence === 'swiftdata' && macosMajor(minMacosVersion) < 14) {
        ctx.addIssue({
          path: [...path, 'macosNativeConfig', 'persistence'],
          code: 'custom',
          message: 'SwiftData requires minMacosVersion 14.0 or later',
        })
      }
    }
  },
}
```

- [ ] **Step 4: Register the validator**

In `src/config/validators/index.ts`: add the import (alphabetically near the others) and add the entry to `ALL_COUPLING_VALIDATORS`:

```ts
import { macosNativeCouplingValidator } from './macos-native.js'
```
```ts
  macosNativeCouplingValidator as CouplingValidator<unknown>,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/config/validators/macos-native.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/config/validators/macos-native.ts src/config/validators/macos-native.test.ts src/config/validators/index.ts
git commit -m "feat(config): add macos-native coupling validator (MAS⇒sandboxed, MAS⇒no-sparkle, swiftdata⇒macOS14)"
```

---

## Task 3: Auto-detector + iOS disambiguation

**Files:**
- Create: `src/project/detectors/macos-native.ts`
- Create: `src/project/detectors/macos-native.test.ts`
- Modify: `src/project/detectors/types.ts` (`MacosNativeMatch` + union)
- Modify: `src/project/detectors/index.ts` (import + register in `ALL_DETECTORS`)

**Interfaces:**
- Consumes: `SignalContext` (`ctx.readFileText`, `ctx.rootEntries`, `ctx.listDir`, `ctx.dirExists`, `ctx.hasDep`, `ctx.hasFile`), `createFakeSignalContext` for tests.
- Produces: `detectMacosNative(ctx): MacosNativeMatch | null`. Confidence tiers per spec §8. Yields `null` for pure-iOS / pure-library / no-Apple-signal.

- [ ] **Step 1: Add the match type to `src/project/detectors/types.ts`**

Add `MacosNativeConfigSchema` to the schema import block. Add the interface near `GameMatch`:

```ts
export interface MacosNativeMatch extends BaseMatch {
  readonly projectType: 'macos-native'
  readonly partialConfig: Partial<z.infer<typeof MacosNativeConfigSchema>>
}
```

Add `MacosNativeMatch` to the `DetectionMatch` union.

- [ ] **Step 2: Write the failing test**

Create `src/project/detectors/macos-native.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createFakeSignalContext } from './context.js'
import { detectMacosNative } from './macos-native.js'

describe('detectMacosNative', () => {
  it('high confidence: AppKit import + entitlements', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Glyver.xcodeproj', 'Glyver.entitlements', 'main.swift'],
      files: {
        'Glyver.entitlements': '<plist/>',
        'main.swift': 'import AppKit\nimport SwiftUI\n@main struct App {}',
      },
    })
    const m = detectMacosNative(ctx)
    expect(m?.projectType).toBe('macos-native')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.uiFramework).toBe('hybrid')
    expect(m?.partialConfig.sandboxed).toBe(true)
  })

  it('high confidence: Package.swift with .macOS executable', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Package.swift'],
      files: {
        'Package.swift': 'platforms: [.macOS(.v15)],\n.executable(name: "app", targets: ["App"])',
      },
    })
    expect(detectMacosNative(ctx)?.confidence).toBe('high')
  })

  it('returns null for a pure iOS Xcode app (SDKROOT iphoneos)', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['MyApp.xcodeproj'],
      dirs: ['MyApp.xcodeproj'],
      dirListings: { 'MyApp.xcodeproj': ['project.pbxproj'] },
      files: {
        'MyApp.xcodeproj/project.pbxproj': 'SDKROOT = iphoneos;\nIPHONEOS_DEPLOYMENT_TARGET = 17.0;',
      },
    })
    expect(detectMacosNative(ctx)).toBeNull()
  })

  it('returns null for a pure Swift library (.macOS platform, no executable)', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Package.swift'],
      files: { 'Package.swift': 'platforms: [.macOS(.v13), .iOS(.v16)],\n.library(name: "Lib", targets: ["Lib"])' },
    })
    expect(detectMacosNative(ctx)).toBeNull()
  })

  it('low confidence for a multiplatform macOS+iOS target', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Package.swift', 'App.swift'],
      files: {
        'Package.swift': 'platforms: [.macOS(.v15), .iOS(.v17)],\n.executable(name: "app", targets: ["App"])',
        'App.swift': 'import SwiftUI\nimport UIKit\n@main struct A {}',
      },
    })
    const m = detectMacosNative(ctx)
    expect(m?.projectType).toBe('macos-native')
    expect(m?.confidence).toBe('low')
  })

  it('returns null when there are no Apple/Swift signals', () => {
    const ctx = createFakeSignalContext({ rootEntries: ['package.json'], files: { 'package.json': '{}' } })
    expect(detectMacosNative(ctx)).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/project/detectors/macos-native.test.ts`
Expected: FAIL — `detectMacosNative` not defined.

- [ ] **Step 4: Implement the detector**

Create `src/project/detectors/macos-native.ts`:

```ts
import type { SignalContext } from './context.js'
import type { MacosNativeMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

const SWIFT_SAMPLE_DIRS = ['', 'Sources', 'App', 'src'] as const

/** Sample Swift source text from conventional locations (depth-1 + one nested Sources/<module> level). */
function sampleSwift(ctx: SignalContext, limit = 16): string {
  const texts: string[] = []
  const add = (rel: string) => {
    if (texts.length >= limit || !rel.endsWith('.swift')) return
    const t = ctx.readFileText(rel, 65536)
    if (t) texts.push(t)
  }
  for (const dir of SWIFT_SAMPLE_DIRS) {
    const entries = dir === '' ? ctx.rootEntries() : ctx.listDir(dir)
    for (const name of entries) {
      const rel = dir === '' ? name : `${dir}/${name}`
      if (name.endsWith('.swift')) add(rel)
      else if (dir === 'Sources') for (const inner of ctx.listDir(rel)) add(`${rel}/${inner}`)
    }
  }
  return texts.join('\n')
}

/** Read the first .xcodeproj/.xcworkspace's project.pbxproj text, if any. */
function pbxproj(ctx: SignalContext): string {
  const proj = ctx.rootEntries().find(f => f.endsWith('.xcodeproj'))
  if (!proj) return ''
  return ctx.readFileText(`${proj}/project.pbxproj`, 131072) ?? ''
}

export function detectMacosNative(ctx: SignalContext): MacosNativeMatch | null {
  const swift = sampleSwift(ctx)
  const pkg = ctx.readFileText('Package.swift') ?? ''
  const pbx = pbxproj(ctx)

  const xcodeArtifact = ctx.rootEntries().find(f => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace'))
  const entitlements = ctx.rootEntries().some(f => f.endsWith('.entitlements'))
  const importsAppKit = /\bimport\s+(AppKit|Cocoa)\b/.test(swift)
  const importsSwiftUI = /\bimport\s+SwiftUI\b/.test(swift)
  const importsUIKit = /\bimport\s+UIKit\b/.test(swift)
  const hasMainApp = /@main/.test(swift)
  const pkgMacos = /\.macOS\s*\(/.test(pkg)
  const pkgIos = /\.iOS\s*\(/.test(pkg)
  const pkgExecutable = /\.executable\b/.test(pkg) || /executableTarget\s*\(/.test(pkg)
  const sdkMacos = /SDKROOT\s*=\s*macosx/.test(pbx) || /MACOSX_DEPLOYMENT_TARGET/.test(pbx)
  const sdkIos = /SDKROOT\s*=\s*iphoneos/.test(pbx) || /IPHONEOS_DEPLOYMENT_TARGET/.test(pbx)

  // No Apple/Swift signal at all → not ours.
  if (!importsAppKit && !importsSwiftUI && !importsUIKit && !pkg && !xcodeArtifact && !entitlements) {
    return null
  }

  const macosPositive = importsAppKit || entitlements || sdkMacos || (pkgMacos && pkgExecutable)
  const iosPositive =
    ctx.dirExists('ios') || importsUIKit || sdkIos || (pkgIos && !pkgMacos)
    || ctx.hasDep('expo', 'npm') || ctx.hasDep('react-native', 'npm') || ctx.hasFile('pubspec.yaml')

  // Pure iOS (or RN/Expo/Flutter) → mobile-app owns it.
  if (iosPositive && !macosPositive) return null
  if (!macosPositive) {
    // No positive macOS signal and not clearly iOS — only a SwiftUI @main Xcode app counts (medium).
    if (xcodeArtifact && hasMainApp && importsSwiftUI && !iosPositive) {
      return {
        projectType: 'macos-native', confidence: 'medium',
        partialConfig: inferConfig(swift, pkg, entitlements),
        evidence: [evidence('xcode-swiftui-main-app', xcodeArtifact)],
      }
    }
    return null
  }

  const ev: DetectionEvidence[] = []
  if (importsAppKit) ev.push(evidence('appkit-import'))
  if (entitlements) ev.push(evidence('entitlements-file'))
  if (sdkMacos) ev.push(evidence('pbxproj-macosx-sdk'))
  if (pkgMacos && pkgExecutable) ev.push(evidence('package-swift-macos-executable', 'Package.swift'))

  // Multiplatform macOS+iOS → low confidence; let disambiguation rank it vs mobile-app.
  const confidence: MacosNativeMatch['confidence'] = iosPositive ? 'low' : 'high'
  if (iosPositive) ev.push(evidence('multiplatform-macos-ios'))

  return {
    projectType: 'macos-native', confidence,
    partialConfig: inferConfig(swift, pkg, entitlements),
    evidence: ev,
  }
}

function inferConfig(swift: string, pkg: string, entitlements: boolean): Partial<MacosNativeMatch['partialConfig']> {
  const pc: Partial<MacosNativeMatch['partialConfig']> = {}
  const appkit = /\bimport\s+(AppKit|Cocoa)\b/.test(swift)
  const swiftui = /\bimport\s+SwiftUI\b/.test(swift)
  if (appkit && swiftui) pc.uiFramework = 'hybrid'
  else if (appkit) pc.uiFramework = 'appkit'
  else if (swiftui) pc.uiFramework = 'swiftui'
  if (entitlements) pc.sandboxed = true
  if (/Sparkle/.test(pkg)) pc.autoUpdate = 'sparkle'
  if (/\bimport\s+SwiftData\b/.test(swift)) pc.persistence = 'swiftdata'
  else if (/\bimport\s+CoreData\b/.test(swift)) pc.persistence = 'core-data'
  else if (/\bimport\s+(GRDB|SQLite)\b/.test(swift)) pc.persistence = 'sqlite'
  if (/\bLSUIElement\b/.test(swift)) pc.appStyle = 'agent'
  else if (/\b(NSStatusItem|MenuBarExtra)\b/.test(swift)) pc.appStyle = 'menu-bar'
  return pc
}
```

- [ ] **Step 5: Register in `src/project/detectors/index.ts`**

Add the import and place `detectMacosNative` in Tier 1 of `ALL_DETECTORS` (next to `detectMobileApp`):

```ts
import { detectMacosNative } from './macos-native.js'
```
```ts
  detectGame, detectBrowserExtension, detectMobileApp, detectMacosNative, detectDataPipeline,
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/project/detectors/macos-native.test.ts`
Expected: PASS (6 tests). Then run the disambiguation regression: `npx vitest run src/project/detectors/` — Expected: all green (no existing detector regresses).

- [ ] **Step 7: Commit**

```bash
git add src/project/detectors/macos-native.ts src/project/detectors/macos-native.test.ts src/project/detectors/types.ts src/project/detectors/index.ts
git commit -m "feat(adopt): add macos-native detector with iOS/library disambiguation"
```

---

## Task 4: Wizard copy

**Files:**
- Create: `src/wizard/copy/macos-native.ts`
- Modify: `src/wizard/copy/types.ts` (`MacosNativeCopy` + `ProjectCopyMap` entry; import `MacosNativeConfig`)
- Modify: `src/wizard/copy/index.ts` (import + `PROJECT_COPY` entry)
- Modify: `src/wizard/copy/core.ts` (`projectType.options['macos-native']`)
- Test: `src/wizard/copy/macos-native.test.ts` (create)

**Interfaces:**
- Consumes: `QuestionCopy`, `MacosNativeConfig`.
- Produces: `macosNativeCopy: MacosNativeCopy`. `getCopyForType('macos-native')` returns it; `optionsFromCopy(copy.<field>.options, [...])` works for every enum field.

- [ ] **Step 1: Write the failing test**

Create `src/wizard/copy/macos-native.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getCopyForType, optionsFromCopy } from './index.js'

describe('macos-native copy', () => {
  it('is registered and exposes options for every enum field', () => {
    const copy = getCopyForType('macos-native')
    expect(optionsFromCopy(copy.uiFramework.options, ['swiftui', 'appkit', 'hybrid'])).toHaveLength(3)
    expect(optionsFromCopy(copy.appStyle.options, ['standard', 'menu-bar', 'agent'])).toHaveLength(3)
    expect(optionsFromCopy(copy.distribution.options, ['developer-id', 'mac-app-store', 'both'])).toHaveLength(3)
    expect(optionsFromCopy(copy.persistence.options, ['none', 'sqlite', 'core-data', 'swiftdata'])).toHaveLength(4)
    expect(optionsFromCopy(copy.autoUpdate.options, ['none', 'sparkle'])).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/wizard/copy/macos-native.test.ts`
Expected: FAIL — `'macos-native'` not assignable to `getCopyForType` / not registered.

- [ ] **Step 3: Add the `MacosNativeCopy` type**

In `src/wizard/copy/types.ts`: add `MacosNativeConfig` to the type import block; add the alias near `GameCopy`:

```ts
export type MacosNativeCopy = { [K in keyof MacosNativeConfig]: QuestionCopy<MacosNativeConfig[K]> }
```

Add to `ProjectCopyMap`:

```ts
  'macos-native':      MacosNativeCopy
```

- [ ] **Step 4: Create the copy file**

Create `src/wizard/copy/macos-native.ts`:

```ts
import type { MacosNativeCopy } from './types.js'

export const macosNativeCopy: MacosNativeCopy = {
  uiFramework: {
    short: 'The UI framework powering the app.',
    long: 'SwiftUI is the modern default; AppKit gives fine-grained control and virtualization; '
      + 'hybrid mixes SwiftUI chrome with AppKit where performance demands it.',
    options: {
      swiftui: { label: 'SwiftUI',  short: 'Modern declarative UI — the default for new macOS apps.' },
      appkit:  { label: 'AppKit',   short: 'Mature imperative UI — maximum control and virtualization.' },
      hybrid:  { label: 'Hybrid',   short: 'SwiftUI for most UI, AppKit (NSViewRepresentable) where needed.' },
    },
  },
  appStyle: {
    short: 'The kind of macOS app this is.',
    long: 'Standard is a windowed app; menu-bar lives in the status bar (NSStatusItem/MenuBarExtra); '
      + 'agent runs in the background with no Dock icon (LSUIElement).',
    options: {
      standard:   { label: 'Standard window app', short: 'A normal windowed app with a Dock icon.' },
      'menu-bar': { label: 'Menu-bar app',         short: 'Lives in the menu bar (NSStatusItem / MenuBarExtra).' },
      agent:      { label: 'Background agent',      short: 'No Dock icon / UI chrome (LSUIElement).' },
    },
  },
  minMacosVersion: {
    short: 'Minimum supported macOS version (e.g. "15.0"). Drives @available guidance.',
  },
  distribution: {
    short: 'How the app is delivered to users.',
    long: 'Developer ID ships a notarized direct download; Mac App Store requires the App Sandbox; '
      + 'both ships two variants.',
    options: {
      'developer-id':  { label: 'Developer ID (direct download)', short: 'Notarized DMG/pkg outside the App Store.' },
      'mac-app-store': { label: 'Mac App Store',                  short: 'Distributed via the App Store (sandbox required).' },
      both:            { label: 'Both',                           short: 'Direct download AND Mac App Store builds.' },
    },
  },
  sandboxed: {
    short: 'Enable the App Sandbox (required for the Mac App Store).',
  },
  persistence: {
    short: 'Local data persistence approach.',
    options: {
      none:        { label: 'None',       short: 'No local persistence.' },
      sqlite:      { label: 'SQLite/GRDB', short: 'Direct SQLite (e.g. via GRDB) — full control.' },
      'core-data': { label: 'Core Data',  short: 'Apple’s object-graph persistence framework.' },
      swiftdata:   { label: 'SwiftData',  short: 'Modern Swift persistence (requires macOS 14+).' },
    },
  },
  autoUpdate: {
    short: 'Auto-update mechanism for direct-download builds.',
    options: {
      none:    { label: 'None',    short: 'No in-app updater (or App Store handles updates).' },
      sparkle: { label: 'Sparkle', short: 'Sparkle appcast auto-updates (Developer-ID builds only).' },
    },
  },
}
```

- [ ] **Step 5: Register in `src/wizard/copy/index.ts` and add the project-type option in `core.ts`**

In `index.ts`: add `import { macosNativeCopy } from './macos-native.js'` and add `'macos-native': macosNativeCopy,` to `PROJECT_COPY`.

In `core.ts`, add to `projectType.options`:

```ts
      'macos-native': {
        label: 'macOS native app',
        short: 'Native macOS desktop app in Swift/SwiftUI/AppKit (notarized or App Store).',
      },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/wizard/copy/macos-native.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/wizard/copy/macos-native.ts src/wizard/copy/types.ts src/wizard/copy/index.ts src/wizard/copy/core.ts src/wizard/copy/macos-native.test.ts
git commit -m "feat(wizard): add macos-native wizard copy + project-type option"
```

---

## Task 5: Wizard flags + question branch

**Files:**
- Modify: `src/wizard/flags.ts` (`MacosNativeFlags`)
- Modify: `src/wizard/questions.ts` (import types; `WizardAnswers.macosNativeConfig`; options `macosNativeFlags?`; the config branch; return)
- Test: `src/wizard/questions.test.ts` (existing — add a describe block; if absent, create)

**Interfaces:**
- Consumes: `MacosNativeConfig`, `MacosNativeFlags`, `getCopyForType('macos-native')`, `MacosNativeConfigSchema` (for auto-mode defaults).
- Produces: `askWizardQuestions(...)` returns `macosNativeConfig` when `projectType === 'macos-native'`.

- [ ] **Step 1: Add the `MacosNativeFlags` interface to `src/wizard/flags.ts`**

Add `MacosNativeConfig` to the type import block; add near `MobileAppFlags`:

```ts
export interface MacosNativeFlags {
  macosUiFramework?: MacosNativeConfig['uiFramework']
  macosAppStyle?: MacosNativeConfig['appStyle']
  macosMinVersion?: MacosNativeConfig['minMacosVersion']
  macosDistribution?: MacosNativeConfig['distribution']
  macosSandboxed?: MacosNativeConfig['sandboxed']
  macosPersistence?: MacosNativeConfig['persistence']
  macosAutoUpdate?: MacosNativeConfig['autoUpdate']
}
```

- [ ] **Step 2: Write the failing test**

Add to `src/wizard/questions.test.ts` (mirror existing wizard tests — they call `askWizardQuestions` with a mock `OutputContext`; reuse the existing mock/helper in that file):

```ts
describe('macos-native wizard branch', () => {
  it('produces a valid macosNativeConfig in auto mode from flags', async () => {
    const answers = await askWizardQuestions({
      output: makeMockOutput(),       // existing helper in this test file
      suggestion: 'deep',
      projectType: 'macos-native',
      auto: true,
      macosNativeFlags: {
        macosUiFramework: 'hybrid', macosDistribution: 'developer-id',
        macosPersistence: 'sqlite', macosAutoUpdate: 'sparkle',
      },
    })
    expect(answers.macosNativeConfig).toEqual({
      uiFramework: 'hybrid',
      appStyle: 'standard',
      minMacosVersion: '15.0',
      distribution: 'developer-id',
      sandboxed: false,
      persistence: 'sqlite',
      autoUpdate: 'sparkle',
    })
  })
})
```

> If `questions.test.ts` lacks a reusable `makeMockOutput`, copy the `createMockOutput` shape from `src/e2e/project-type-overlays.test.ts` (Task 15) into the test.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/wizard/questions.test.ts -t "macos-native wizard branch"`
Expected: FAIL — `macosNativeConfig`/`macosNativeFlags` don't exist.

- [ ] **Step 4: Implement the branch in `src/wizard/questions.ts`**

Add `MacosNativeConfig` to the config-type import and `MacosNativeFlags` to the flags import. Add `macosNativeConfig?: MacosNativeConfig` to `WizardAnswers`. Add `macosNativeFlags?: MacosNativeFlags` to the `askWizardQuestions` options object. Add this branch (after the `mobile-app` branch):

```ts
  // macOS-native configuration
  let macosNativeConfig: MacosNativeConfig | undefined
  if (projectType === 'macos-native') {
    const copy = getCopyForType('macos-native')
    showBannerOnce()
    const mf = options.macosNativeFlags

    const uiFramework: MacosNativeConfig['uiFramework'] = mf?.macosUiFramework
      ?? (!auto
        ? await output.select('UI framework?',
          optionsFromCopy(copy.uiFramework.options, ['swiftui', 'appkit', 'hybrid']),
          'swiftui', copy.uiFramework) as MacosNativeConfig['uiFramework']
        : 'swiftui')

    const appStyle: MacosNativeConfig['appStyle'] = mf?.macosAppStyle
      ?? (!auto
        ? await output.select('App style?',
          optionsFromCopy(copy.appStyle.options, ['standard', 'menu-bar', 'agent']),
          'standard', copy.appStyle) as MacosNativeConfig['appStyle']
        : 'standard')

    const minMacosVersion: string = mf?.macosMinVersion
      ?? (!auto
        ? (await output.prompt<string>('Minimum macOS version [15.0]:', '15.0', copy.minMacosVersion)) || '15.0'
        : '15.0')

    const distribution: MacosNativeConfig['distribution'] = mf?.macosDistribution
      ?? (!auto
        ? await output.select('Distribution?',
          optionsFromCopy(copy.distribution.options, ['developer-id', 'mac-app-store', 'both']),
          'developer-id', copy.distribution) as MacosNativeConfig['distribution']
        : 'developer-id')

    // Mac App Store requires the sandbox — force it; otherwise ask/ default false.
    const requiresSandbox = distribution === 'mac-app-store' || distribution === 'both'
    const sandboxed: boolean = requiresSandbox ? true
      : (mf?.macosSandboxed ?? (!auto ? await output.confirm('Enable App Sandbox?', false, copy.sandboxed) : false))

    const persistence: MacosNativeConfig['persistence'] = mf?.macosPersistence
      ?? (!auto
        ? await output.select('Local persistence?',
          optionsFromCopy(copy.persistence.options, ['none', 'sqlite', 'core-data', 'swiftdata']),
          'none', copy.persistence) as MacosNativeConfig['persistence']
        : 'none')

    // App Store builds can't bundle Sparkle — force none.
    const autoUpdate: MacosNativeConfig['autoUpdate'] = distribution === 'mac-app-store' ? 'none'
      : (mf?.macosAutoUpdate
        ?? (!auto
          ? await output.select('Auto-update?',
            optionsFromCopy(copy.autoUpdate.options, ['none', 'sparkle']),
            'none', copy.autoUpdate) as MacosNativeConfig['autoUpdate']
          : 'none'))

    macosNativeConfig = { uiFramework, appStyle, minMacosVersion, distribution, sandboxed, persistence, autoUpdate }
  }
```

Add `macosNativeConfig` to the final `return { ... }` object.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/wizard/questions.test.ts -t "macos-native wizard branch"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/wizard/flags.ts src/wizard/questions.ts src/wizard/questions.test.ts
git commit -m "feat(wizard): collect macosNativeConfig in the init wizard"
```

---

## Task 6: CLI flag family + init.ts wiring

**Files:**
- Modify: `src/cli/init-flag-families.ts` (`MACOS_NATIVE_FLAGS`, `detectFamily`, `applyFlagFamilyValidation`, `buildFlagOverrides`, `PartialConfigOverrides`, type alias)
- Modify: `src/cli/commands/init.ts` (`InitArgs` fields, `CONFIG_SETTING_FLAGS`, `.option()` defs, `.group()`, `hasMacosNativeFlag` + `macosNativeFlags` wiring into `askWizardQuestions`)
- Test: `src/cli/init-flag-families.test.ts` (existing — add cases)

**Interfaces:**
- Consumes: `MacosNativeConfig`.
- Produces: `MACOS_NATIVE_FLAGS` const; `applyFlagFamilyValidation` rejects mixed-family + cross-field violations; `buildFlagOverrides` returns `{ type: 'macos-native', partial }`.

- [ ] **Step 1: Write the failing test**

Add to `src/cli/init-flag-families.test.ts`:

```ts
import { applyFlagFamilyValidation, buildFlagOverrides } from './init-flag-families.js'

describe('macos-native flags', () => {
  it('rejects macos flags with a non-macos project type', () => {
    expect(() => applyFlagFamilyValidation({ 'macos-ui-framework': 'swiftui', 'project-type': 'web-app' }))
      .toThrow(/macos/i)
  })
  it('rejects mac-app-store + sparkle', () => {
    expect(() => applyFlagFamilyValidation({ 'macos-distribution': 'mac-app-store', 'macos-auto-update': 'sparkle' }))
      .toThrow(/App Store/i)
  })
  it('rejects swiftdata below macOS 14', () => {
    expect(() => applyFlagFamilyValidation({ 'macos-persistence': 'swiftdata', 'macos-min-version': '13.0' }))
      .toThrow(/SwiftData/i)
  })
  it('maps flags into a macos-native partial', () => {
    const out = buildFlagOverrides({ 'macos-ui-framework': 'hybrid', 'macos-distribution': 'developer-id' })
    expect(out).toEqual({ type: 'macos-native', partial: { uiFramework: 'hybrid', distribution: 'developer-id' } })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/cli/init-flag-families.test.ts -t "macos-native flags"`
Expected: FAIL.

- [ ] **Step 3: Implement in `src/cli/init-flag-families.ts`**

Add the type alias (near the others): `type MacosNativeConfig = z.infer<typeof MacosNativeConfigSchema>` and add `MacosNativeConfigSchema` to the schema type import.

Add the flag-family constant:

```ts
export const MACOS_NATIVE_FLAGS = [
  'macos-ui-framework', 'macos-app-style', 'macos-min-version',
  'macos-distribution', 'macos-sandboxed', 'macos-persistence', 'macos-auto-update',
] as const
```

Add `| 'macos-native'` to `detectFamily`'s return type and add (after the mobile check, preserving precedence — place after `mcp-server`):

```ts
  if (MACOS_NATIVE_FLAGS.some((f) => argv[f] !== undefined)) return 'macos-native'
```

In `applyFlagFamilyValidation`: add `const hasMacosNativeFlag = MACOS_NATIVE_FLAGS.some((f) => argv[f] !== undefined)`, include it in the `typeCount` array and the mixed-family error message, and add:

```ts
  if (hasMacosNativeFlag && argv['project-type'] !== undefined && argv['project-type'] !== 'macos-native') {
    throw new Error('--macos-* flags require --project-type macos-native')
  }
  if (hasMacosNativeFlag) {
    if (argv['macos-distribution'] === 'mac-app-store' && argv['macos-auto-update'] !== undefined
        && argv['macos-auto-update'] !== 'none') {
      throw new Error('Mac App Store builds cannot bundle Sparkle (set --macos-auto-update none)')
    }
    if (argv['macos-persistence'] === 'swiftdata' && argv['macos-min-version'] !== undefined) {
      const major = parseInt(String(argv['macos-min-version']).split('.')[0] ?? '', 10)
      if (major < 14) throw new Error('SwiftData requires --macos-min-version 14.0 or later')
    }
  }
```

Add `| { type: 'macos-native'; partial: Partial<MacosNativeConfig> }` to `PartialConfigOverrides`. Add the `buildFlagOverrides` case:

```ts
  case 'macos-native': {
    const partial: Partial<MacosNativeConfig> = {}
    if (argv['macos-ui-framework'] !== undefined) partial.uiFramework = argv['macos-ui-framework'] as MacosNativeConfig['uiFramework']
    if (argv['macos-app-style'] !== undefined) partial.appStyle = argv['macos-app-style'] as MacosNativeConfig['appStyle']
    if (argv['macos-min-version'] !== undefined) partial.minMacosVersion = argv['macos-min-version'] as string
    if (argv['macos-distribution'] !== undefined) partial.distribution = argv['macos-distribution'] as MacosNativeConfig['distribution']
    if (argv['macos-sandboxed'] !== undefined) partial.sandboxed = argv['macos-sandboxed'] as boolean
    if (argv['macos-persistence'] !== undefined) partial.persistence = argv['macos-persistence'] as MacosNativeConfig['persistence']
    if (argv['macos-auto-update'] !== undefined) partial.autoUpdate = argv['macos-auto-update'] as MacosNativeConfig['autoUpdate']
    return { type: 'macos-native', partial }
  }
```

- [ ] **Step 4: Wire `src/cli/commands/init.ts`**

(a) Add `MACOS_NATIVE_FLAGS` to the import from `init-flag-families.js` and add `...MACOS_NATIVE_FLAGS` to `CONFIG_SETTING_FLAGS`.

(b) Add the `InitArgs` flag fields (near the other `'mobile-*'?` fields):

```ts
  'macos-ui-framework'?: string
  'macos-app-style'?: string
  'macos-min-version'?: string
  'macos-distribution'?: string
  'macos-sandboxed'?: boolean
  'macos-persistence'?: string
  'macos-auto-update'?: string
```

(c) Add the yargs `.option()` definitions (after the mobile block):

```ts
      // macOS-Native Configuration
      .option('macos-ui-framework', { type: 'string', describe: 'UI framework', choices: ['swiftui', 'appkit', 'hybrid'] as const })
      .option('macos-app-style', { type: 'string', describe: 'App style', choices: ['standard', 'menu-bar', 'agent'] as const })
      .option('macos-min-version', { type: 'string', describe: 'Minimum macOS version (e.g. 15.0)' })
      .option('macos-distribution', { type: 'string', describe: 'Distribution', choices: ['developer-id', 'mac-app-store', 'both'] as const })
      .option('macos-sandboxed', { type: 'boolean', describe: 'Enable App Sandbox' })
      .option('macos-persistence', { type: 'string', describe: 'Local persistence', choices: ['none', 'sqlite', 'core-data', 'swiftdata'] as const })
      .option('macos-auto-update', { type: 'string', describe: 'Auto-update mechanism', choices: ['none', 'sparkle'] as const })
```

(d) Add the group: `.group([...MACOS_NATIVE_FLAGS], 'macOS-Native Configuration:')`.

(e) In the wizard-wiring block, add `const hasMacosNativeFlag = MACOS_NATIVE_FLAGS.some((f) => argv[f] !== undefined)` and pass to `askWizardQuestions`:

```ts
            macosNativeFlags: hasMacosNativeFlag ? {
              macosUiFramework: argv['macos-ui-framework'] as MacosNativeFlags['macosUiFramework'],
              macosAppStyle: argv['macos-app-style'] as MacosNativeFlags['macosAppStyle'],
              macosMinVersion: argv['macos-min-version'] as MacosNativeFlags['macosMinVersion'],
              macosDistribution: argv['macos-distribution'] as MacosNativeFlags['macosDistribution'],
              macosSandboxed: argv['macos-sandboxed'],
              macosPersistence: argv['macos-persistence'] as MacosNativeFlags['macosPersistence'],
              macosAutoUpdate: argv['macos-auto-update'] as MacosNativeFlags['macosAutoUpdate'],
            } : undefined,
```

Import `MacosNativeFlags` from `../../wizard/flags.js` (alongside the other `*Flags` imports).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/cli/init-flag-families.test.ts` then `npx tsc --noEmit` (or `npm run build`)
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/cli/init-flag-families.ts src/cli/commands/init.ts src/cli/init-flag-families.test.ts
git commit -m "feat(cli): add --macos-* flag family with coupling validation"
```

---

## Task 7: Pipeline steps — `macos-ui-spec` + `review-macos-ui`

**Files:**
- Create: `content/pipeline/specification/macos-ui-spec.md`
- Create: `content/pipeline/specification/review-macos-ui.md`

**Interfaces:**
- Produces: two step slugs `macos-ui-spec`, `review-macos-ui` (phase `specification`). Frontmatter contract (from existing steps): `name`, `description`, `summary`, `phase`, `order`, `dependencies` (inline array), `outputs`, `conditional`, `reads`, `knowledge-base`. Doc-creating steps MUST include `## Mode Detection` and `## Update Mode Specifics` blocks.

- [ ] **Step 1: Author `macos-ui-spec.md`**

Frontmatter (exact):

```yaml
---
name: macos-ui-spec
description: Specify the macOS UI per Apple HIG — windows, menus, toolbars, keyboard model, and accessibility
summary: "Replaces design-system and ux-spec for macOS-native projects. Covers window/scene structure, menu bar and menu-bar extras, toolbars, sidebars, keyboard shortcuts and the responder chain, multi-window/multi-monitor behavior, dark mode, density, Reduce Motion, and accessibility (VoiceOver, Dynamic Type)."
phase: "specification"
order: 862
dependencies: [system-architecture]
outputs: [docs/macos-ui-spec.md]
conditional: null
reads: [create-prd, user-stories, system-architecture]
knowledge-base: [macos-hig-ui-patterns, macos-accessibility, macos-keyboard-and-menus]
---
```

Body must contain (mirror the structure of `content/pipeline/specification/game-ui-spec.md`): an opening paragraph, then `## Mode Detection` and `## Update Mode Specifics` blocks, then `## Purpose`, `## Inputs`, `## Expected Outputs`, `## Quality Criteria` (tagged `(mvp)`/`(deep)`), `## Methodology Scaling` (deep/mvp/custom depth 1–5). Content checklist the prompt must direct the agent to specify: app style (standard/menu-bar/agent) and its lifecycle implications; window & scene structure; the menu bar (app menu, standard edit/view/window menus) and menu-bar extras; toolbars and sidebars; the keyboard model, shortcuts, and responder chain; command palette (⌘K) if applicable; multi-window/multi-monitor; dark mode + density; Reduce Motion; and accessibility (VoiceOver labels for custom/canvas views, Dynamic Type, high contrast). State explicitly that it **replaces** `design-system` and `ux-spec`.

- [ ] **Step 2: Author `review-macos-ui.md`**

Frontmatter:

```yaml
---
name: review-macos-ui
description: Review the macOS UI spec for HIG conformance, accessibility, and keyboard completeness
summary: "Replaces review-ux for macOS-native projects. Audits docs/macos-ui-spec.md against Apple HIG, accessibility requirements, and keyboard/menu completeness."
phase: "specification"
order: 864
dependencies: [macos-ui-spec]
outputs: [docs/macos-ui-spec.md]
conditional: null
reads: [macos-ui-spec, user-stories]
knowledge-base: [macos-hig-ui-patterns, macos-accessibility]
---
```

Body: opening paragraph + `## Mode Detection` + `## Update Mode Specifics` + the review checklist (HIG conformance, every menu/shortcut covered, VoiceOver/Dynamic Type/Reduce Motion addressed, multi-window behavior defined). Mirror an existing `review-*` step (e.g. `content/pipeline/specification/review-game-ui.md`) for structure.

- [ ] **Step 3: Validate frontmatter**

Run: `./scripts/validate-frontmatter.sh content/pipeline/specification/macos-ui-spec.md content/pipeline/specification/review-macos-ui.md`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add content/pipeline/specification/macos-ui-spec.md content/pipeline/specification/review-macos-ui.md
git commit -m "feat(pipeline): add macos-ui-spec + review-macos-ui steps"
```

---

## Task 8: Pipeline steps — distribution, entitlements/privacy, release review

**Files:**
- Create: `content/pipeline/quality/macos-distribution-spec.md`
- Create: `content/pipeline/quality/macos-entitlements-privacy-spec.md`
- Create: `content/pipeline/quality/review-macos-release.md`

- [ ] **Step 1: Author `macos-distribution-spec.md`**

```yaml
---
name: macos-distribution-spec
description: Specify code signing, notarization, packaging, auto-update, and Mac App Store distribution for the app
summary: "Covers Developer ID code signing, notarization (notarytool + stapling + Gatekeeper), DMG/pkg packaging, Sparkle auto-update appcast, the Mac App Store submission path, and CI sign/notarize/release automation."
phase: "quality"
order: 935
dependencies: [system-architecture, tech-stack]
outputs: [docs/macos-distribution.md]
conditional: null
reads: [system-architecture, tech-stack, operations]
knowledge-base: [macos-code-signing, macos-notarization, macos-packaging-distribution, macos-app-store, macos-ci-release-automation]
---
```

Body content checklist: signing identities (Developer ID Application / Installer), hardened runtime, `notarytool` submission + stapling + Gatekeeper verification, DMG vs pkg packaging, Sparkle appcast + EdDSA signing (Developer-ID variant only), the Mac App Store path (sandbox + receipts + review), and CI automation (macOS runners / Xcode Cloud / fastlane: build→sign→notarize→release). Reflect the config: if `distribution: mac-app-store`, the doc focuses on MAS and omits Sparkle.

- [ ] **Step 2: Author `macos-entitlements-privacy-spec.md`**

```yaml
---
name: macos-entitlements-privacy-spec
description: Specify the App Sandbox, entitlements, hardened runtime, and privacy (TCC) posture for the app
summary: "Defines App Sandbox on/off, required entitlements, hardened runtime exceptions, TCC privacy usage-description strings, security-scoped bookmarks/Powerbox for user-granted file access, and (for sandboxed apps) subprocess/system-tool access limits."
phase: "quality"
order: 936
dependencies: [system-architecture, tech-stack]
outputs: [docs/macos-entitlements-privacy.md]
conditional: null
reads: [system-architecture, security]
knowledge-base: [macos-app-sandbox-entitlements, macos-privacy-tcc, macos-keychain-secrets]
---
```

Body content checklist: sandbox decision (and its trade-offs), the exact entitlements needed for the app's capabilities, hardened-runtime exceptions, privacy usage-description strings, security-scoped bookmarks/Powerbox for persistent folder access, Keychain for secrets, and — critically for tools like Glyver — whether the app shells out to system binaries (e.g. `git`) and what the sandbox permits there (this is where the `sandboxed` vs `developer-id` trade-off is resolved).

- [ ] **Step 3: Author `review-macos-release.md`**

```yaml
---
name: review-macos-release
description: Combined ship-readiness review of the macOS distribution and entitlements/privacy specs
summary: "Single gate over docs/macos-distribution.md and docs/macos-entitlements-privacy.md — verifies signing/notarization completeness, sandbox/entitlements correctness, privacy strings, and config consistency (e.g. no Sparkle in a Mac App Store build)."
phase: "quality"
order: 937
dependencies: [macos-distribution-spec, macos-entitlements-privacy-spec]
outputs: [docs/macos-distribution.md, docs/macos-entitlements-privacy.md]
conditional: null
reads: [macos-distribution-spec, macos-entitlements-privacy-spec]
knowledge-base: [macos-code-signing, macos-app-sandbox-entitlements]
---
```

Body: review checklist asserting signing+notarization are complete and internally consistent with the config (distribution/sandboxed/autoUpdate), entitlements match the app's declared capabilities, and privacy strings exist for every TCC-gated capability.

All three bodies include `## Mode Detection` + `## Update Mode Specifics` blocks.

- [ ] **Step 4: Validate**

Run: `./scripts/validate-frontmatter.sh content/pipeline/quality/macos-distribution-spec.md content/pipeline/quality/macos-entitlements-privacy-spec.md content/pipeline/quality/review-macos-release.md`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add content/pipeline/quality/macos-distribution-spec.md content/pipeline/quality/macos-entitlements-privacy-spec.md content/pipeline/quality/review-macos-release.md
git commit -m "feat(pipeline): add macOS distribution, entitlements/privacy, and release-review steps"
```

---

## Task 9: Methodology presets — default-off entries

**Files:**
- Modify: `content/methodology/deep.yml`
- Modify: `content/methodology/mvp.yml`

**Interfaces:**
- Produces: the 5 new steps present in both presets, all `{ enabled: false }` (enabled only by the overlay).

- [ ] **Step 1: Add the block to `deep.yml`**

After the `# Game development steps (enabled via game overlay)` block, add:

```yaml
  # macOS-native steps (enabled via macos-native overlay)
  macos-ui-spec: { enabled: false }
  review-macos-ui: { enabled: false }
  macos-distribution-spec: { enabled: false }
  macos-entitlements-privacy-spec: { enabled: false }
  review-macos-release: { enabled: false }
```

- [ ] **Step 2: Add the identical block to `mvp.yml`**

Add the same 5 lines under a matching `# macOS-native steps (enabled via macos-native overlay)` comment, after the game block.

- [ ] **Step 3: Verify presets load**

Run: `npx vitest run -t "preset"` (or the existing preset-loader test file) — Expected: PASS.
Then a quick assertion the steps are present + disabled:

```bash
node -e "const y=require('js-yaml');const fs=require('fs');for(const f of ['deep','mvp']){const d=y.load(fs.readFileSync('content/methodology/'+f+'.yml','utf8'));for(const s of ['macos-ui-spec','review-macos-ui','macos-distribution-spec','macos-entitlements-privacy-spec','review-macos-release']){if(d.steps[s]?.enabled!==false)throw new Error(f+':'+s+' not default-off');}}console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add content/methodology/deep.yml content/methodology/mvp.yml
git commit -m "feat(methodology): register macos-native steps default-off in deep/mvp presets"
```

---

## Task 10: The overlay — `macos-native-overlay.yml`

**Files:**
- Create: `content/methodology/macos-native-overlay.yml`

**Interfaces:**
- Produces: a `PipelineOverlay` with `project-type: macos-native`. Loaded by `loadOverlay`; resolved by `resolveOverlayState` when `config.project.projectType === 'macos-native'`.

- [ ] **Step 1: Author the overlay** (mirror `game-overlay.yml` block-for-block)

```yaml
# methodology/macos-native-overlay.yml
name: macos-native
description: >
  macOS-native overlay — enables Apple-HIG UI, distribution/signing, and
  entitlements/privacy steps; injects macOS knowledge; disables web-centric
  UI steps and remaps their artifact references.
project-type: macos-native

step-overrides:
  # Enable the 5 macOS steps
  macos-ui-spec: { enabled: true }
  review-macos-ui: { enabled: true }
  macos-distribution-spec: { enabled: true }
  macos-entitlements-privacy-spec: { enabled: true }
  review-macos-release: { enabled: true }
  # Disable web-centric UI steps (replaced by macos-ui-spec / review-macos-ui)
  design-system: { enabled: false }
  ux-spec: { enabled: false }
  review-ux: { enabled: false }

knowledge-overrides:
  tech-stack:
    append: [macos-app-architecture, macos-swiftui-appkit-interop, macos-project-tooling]
  coding-standards:
    append: [macos-swift-concurrency, macos-app-architecture]
  tdd:
    append: [macos-testing]
  story-tests:
    append: [macos-testing]
  review-testing:
    append: [macos-testing]
  create-evals:
    append: [macos-testing]
  add-e2e-testing:
    append: [macos-testing]
  project-structure:
    append: [macos-project-tooling]
  dev-env-setup:
    append: [macos-project-tooling]
  git-workflow:
    append: [macos-project-tooling]
  domain-modeling:
    append: [macos-data-persistence]
  database-schema:
    append: [macos-data-persistence]
  adrs:
    append: [macos-app-architecture, macos-swiftui-appkit-interop]
  system-architecture:
    append: [macos-app-architecture, macos-swiftui-appkit-interop, macos-performance, macos-system-integration]
  review-architecture:
    append: [macos-performance]
  security:
    append: [macos-app-sandbox-entitlements, macos-privacy-tcc, macos-keychain-secrets, macos-untrusted-input]
  review-security:
    append: [macos-app-sandbox-entitlements, macos-privacy-tcc]
  operations:
    append: [macos-ci-release-automation, macos-packaging-distribution]
  review-operations:
    append: [macos-ci-release-automation]
  implementation-plan:
    append: [macos-app-architecture]
  implementation-playbook:
    append: [macos-app-architecture]

reads-overrides:
  story-tests:
    replace: { ux-spec: macos-ui-spec }
  create-evals:
    replace: { ux-spec: macos-ui-spec }
  implementation-plan:
    replace: { ux-spec: macos-ui-spec }
  new-enhancement:
    replace: { ux-spec: macos-ui-spec }
  implementation-playbook:
    replace: { ux-spec: macos-ui-spec, design-system: macos-ui-spec }
  platform-parity-review:
    replace: { design-system: macos-ui-spec }

dependency-overrides:
  platform-parity-review:
    replace: { review-ux: review-macos-ui }
```

- [ ] **Step 2: Verify the overlay loads and references real steps/knowledge**

Run:
```bash
node -e "const y=require('js-yaml');const fs=require('fs');const o=y.load(fs.readFileSync('content/methodology/macos-native-overlay.yml','utf8'));const k=new Set(fs.readdirSync('content/knowledge/macos-native').map(f=>f.replace(/\.md$/,'')));for(const step of Object.values(o['knowledge-overrides'])){for(const e of step.append){if(!k.has(e))throw new Error('overlay refs missing knowledge: '+e)}}console.log('overlay knowledge refs ok')"
```
Expected: `overlay knowledge refs ok` (run **after** Task 11–13 author the entries; if run before, it will list the not-yet-authored entries — that's fine as a checklist).

- [ ] **Step 3: Commit**

```bash
git add content/methodology/macos-native-overlay.yml
git commit -m "feat(methodology): add macos-native-overlay.yml"
```

---

## Task 11: Knowledge — Architecture & language (5 entries)

**Files (create):**
- `content/knowledge/macos-native/macos-app-architecture.md`
- `content/knowledge/macos-native/macos-swiftui-appkit-interop.md`
- `content/knowledge/macos-native/macos-swift-concurrency.md`
- `content/knowledge/macos-native/macos-data-persistence.md`
- `content/knowledge/macos-native/macos-performance.md`

**Knowledge frontmatter contract** (validated by `validate-knowledge`; `hash` optional):

```yaml
---
name: <slug>            # kebab-case, must match filename
description: <one line>
topics: [macos-native, <topic>, ...]
volatility: evolving    # stable | evolving | fast-moving
last-reviewed: 2026-06-18
version-pin: null
sources:
  - url: https://developer.apple.com/documentation/<path>
---
```

Body MUST include a `## Summary` and a `## Deep Guidance` heading.

- [ ] **Step 1: Author the 5 entries.** Per-entry content focus:
  - `macos-app-architecture` — app & scene lifecycle (`App`/`NSApplicationDelegate`), window/scene management, MVVM, observable state. Sources: developer.apple.com SwiftUI / AppKit app-lifecycle docs.
  - `macos-swiftui-appkit-interop` — when to use SwiftUI vs AppKit; `NSViewRepresentable`/`NSHostingController`; virtualized `NSCollectionView`/`NSTableView`; hosting boundaries.
  - `macos-swift-concurrency` — async/await, actors, `@MainActor`, structured concurrency, `Sendable`, Task cancellation.
  - `macos-data-persistence` — SwiftData vs Core Data vs SQLite/GRDB; **note SwiftData requires macOS 14+** (ties to coupling rule 3); local-first caching.
  - `macos-performance` — virtualization for large data, smooth scrolling, low idle CPU, Instruments profiling.

- [ ] **Step 2: Validate.** Run `npm run build && node dist/index.js validate-knowledge`
Expected: 0 errors (warnings about allowlisted hosts are acceptable).

- [ ] **Step 3: Commit**

```bash
git add content/knowledge/macos-native/macos-app-architecture.md content/knowledge/macos-native/macos-swiftui-appkit-interop.md content/knowledge/macos-native/macos-swift-concurrency.md content/knowledge/macos-native/macos-data-persistence.md content/knowledge/macos-native/macos-performance.md
git commit -m "feat(knowledge): macos-native architecture & language entries (5)"
```

---

## Task 12: Knowledge — UI/accessibility (3) + Security/privacy (4)

**Files (create):**
- `content/knowledge/macos-native/macos-hig-ui-patterns.md`
- `content/knowledge/macos-native/macos-accessibility.md`
- `content/knowledge/macos-native/macos-keyboard-and-menus.md`
- `content/knowledge/macos-native/macos-app-sandbox-entitlements.md`
- `content/knowledge/macos-native/macos-privacy-tcc.md`
- `content/knowledge/macos-native/macos-keychain-secrets.md`
- `content/knowledge/macos-native/macos-untrusted-input.md`

- [ ] **Step 1: Author the 7 entries.** Per-entry content focus:
  - `macos-hig-ui-patterns` — Apple HIG: menus, toolbars, sidebars, windows, multi-window/monitor, dark mode, density, menu-bar extras. Source: developer.apple.com/design/human-interface-guidelines.
  - `macos-accessibility` — VoiceOver, Dynamic Type, Reduce Motion, high contrast, accessibility for canvas/custom views.
  - `macos-keyboard-and-menus` — keyboard model, standard shortcuts, command pattern, responder chain, ⌘K palettes.
  - `macos-app-sandbox-entitlements` — App Sandbox, entitlements, hardened runtime, **plus** subprocess execution under sandbox (system `git`), tool/binary access limits, SSH-key/credential access constraints, security-scoped bookmarks/Powerbox (the Glyver sandbox tension; note when developer-id non-sandboxed is the pragmatic choice). *(Resolves review finding #9.)*
  - `macos-privacy-tcc` — TCC permissions, usage-description strings, security-scoped bookmarks, file access.
  - `macos-keychain-secrets` — Keychain, secure storage, no hardcoded secrets.
  - `macos-untrusted-input` — treat external repos/files as hostile: argument arrays (not shell strings), disabled pagers/prompts, timeouts, output caps, escaping. Cross-link `[[macos-app-sandbox-entitlements]]` in prose.

- [ ] **Step 2: Validate.** `node dist/index.js validate-knowledge` (after `npm run build`) — Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add content/knowledge/macos-native/macos-hig-ui-patterns.md content/knowledge/macos-native/macos-accessibility.md content/knowledge/macos-native/macos-keyboard-and-menus.md content/knowledge/macos-native/macos-app-sandbox-entitlements.md content/knowledge/macos-native/macos-privacy-tcc.md content/knowledge/macos-native/macos-keychain-secrets.md content/knowledge/macos-native/macos-untrusted-input.md
git commit -m "feat(knowledge): macos-native UI/accessibility + security/privacy entries (7)"
```

---

## Task 13: Knowledge — Distribution (5) + Tooling/testing/integration (3)

**Files (create):**
- `content/knowledge/macos-native/macos-code-signing.md`
- `content/knowledge/macos-native/macos-notarization.md`
- `content/knowledge/macos-native/macos-packaging-distribution.md`
- `content/knowledge/macos-native/macos-app-store.md`
- `content/knowledge/macos-native/macos-ci-release-automation.md`
- `content/knowledge/macos-native/macos-project-tooling.md`
- `content/knowledge/macos-native/macos-testing.md`
- `content/knowledge/macos-native/macos-system-integration.md`

- [ ] **Step 1: Author the 8 entries.** Per-entry content focus:
  - `macos-code-signing` — Developer ID, certificates, signing identities, `codesign`, hardened runtime.
  - `macos-notarization` — `notarytool`, stapling, Gatekeeper, common failures.
  - `macos-packaging-distribution` — DMG/pkg, direct download, Sparkle appcast/EdDSA. **Note: a Mac App Store build must not bundle Sparkle** (ties to coupling rule 2).
  - `macos-app-store` — MAS submission, sandbox requirement, review guidelines, receipts.
  - `macos-ci-release-automation` — GitHub Actions macOS runners / Xcode Cloud, fastlane, automated build→sign→notarize→release.
  - `macos-project-tooling` — Xcode project vs SPM vs Tuist/XcodeGen; SPM dependency management; project structure.
  - `macos-testing` — XCTest, Swift Testing, XCUITest, snapshot testing, CI test runs.
  - `macos-system-integration` — FSEvents, `NSWorkspace`, user notifications, login items, launching external tools / URL schemes, file watching.

- [ ] **Step 2: Validate.** `node dist/index.js validate-knowledge` — Expected: 0 errors. Confirm total count: `ls content/knowledge/macos-native/*.md | wc -l` → **20**.

- [ ] **Step 3: Re-run the overlay knowledge-ref check from Task 10 Step 2** — Expected: `overlay knowledge refs ok`.

- [ ] **Step 4: Commit**

```bash
git add content/knowledge/macos-native/
git commit -m "feat(knowledge): macos-native distribution + tooling/testing/integration entries (8)"
```

---

## Task 14: E2E overlay-resolution test

**Files:**
- Modify: `src/e2e/project-type-overlays.test.ts`

**Interfaces:**
- Consumes: `resolveProjectOverlay` helper (extend its `projectType` union to include `'macos-native'`).

- [ ] **Step 1: Write the test**

Extend the `resolveProjectOverlay` helper's `projectType` parameter union to add `| 'macos-native'`. Add:

```ts
describe('macos-native overlay', () => {
  it('enables the 5 macOS steps, disables web UI steps, injects knowledge, remaps reads', async () => {
    const { overlayState } = await resolveProjectOverlay('macos-native', 'deep')
    const steps = overlayState.stepOverrides ?? overlayState.steps  // use whichever the OverlayState exposes
    expect(steps['macos-ui-spec'].enabled).toBe(true)
    expect(steps['review-macos-release'].enabled).toBe(true)
    expect(steps['design-system'].enabled).toBe(false)
    expect(steps['ux-spec'].enabled).toBe(false)
    expect(steps['review-ux'].enabled).toBe(false)
    // knowledge injected into a reused step
    expect(overlayState.knowledge['system-architecture']).toContain('macos-app-architecture')
    // reads remapped
    expect(overlayState.reads['implementation-plan']).toContain('macos-ui-spec')
    expect(overlayState.reads['implementation-plan']).not.toContain('ux-spec')
  })
})
```

> Inspect the actual `OverlayState` shape returned by `resolveOverlayState` (top of the test file imports it) and adjust property names (`stepOverrides`/`steps`, `knowledge`, `reads`) to match — the existing web-app/backend cases in this file show the exact accessors; copy their assertion style.

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/e2e/project-type-overlays.test.ts -t "macos-native overlay"`
Expected: PASS. (If it fails on property names, align with the existing cases in the same file.)

- [ ] **Step 3: Commit**

```bash
git add src/e2e/project-type-overlays.test.ts
git commit -m "test(e2e): macos-native overlay resolution"
```

---

## Task 15: Docs, version bump, guides rebake

**Files:**
- Modify: `README.md` (project-type enum + table; `13 project types` → `14`)
- Modify: `CHANGELOG.md`
- Modify: `content/knowledge/VERSION`

- [ ] **Step 1: Update `README.md`**

Add `macos-native` to the `--project-type` enum/list and the project-type table (description: "Native macOS desktop app (Swift/SwiftUI/AppKit)"). Change the line `scaffold adopt detects 13 project types ...` (README.md ~line 777) to `14`. Grep for any other hardcoded count:

```bash
grep -rIn "13 project type\|13 supported" README.md docs src 2>/dev/null
```
Update each occurrence that refers to the project-type total.

- [ ] **Step 2: Update `CHANGELOG.md`**

Under `## [Unreleased]`, add: `- Add \`macos-native\` project type for scaffolding native macOS apps (Swift/SwiftUI/AppKit) — config, overlay, 5 pipeline steps, 20 knowledge entries, detector, wizard/CLI.`

- [ ] **Step 3: Bump knowledge VERSION + rebake guides** (per the `guides-embed-live-counts` lesson — 20 new entries change embedded counts)

```bash
# Bump the patch version in content/knowledge/VERSION
node scripts/build-freshness-reference.mjs   # if this is the freshness/count reference builder
scaffold guides --build                       # rebake generated guides (or: node dist/index.js guides --build)
```
Expected: guides regenerate without drift errors.

- [ ] **Step 4: Verify the drift/citation gate**

Run the guides freshness gate (the same one CI runs — check `Makefile`/`package.json` for the exact target, commonly `make check-all` covers it). Confirm no drift failures.

- [ ] **Step 5: Commit**

```bash
git add README.md CHANGELOG.md content/knowledge/VERSION content/guides
git commit -m "docs(macos-native): README + CHANGELOG + knowledge VERSION bump + guides rebake"
```

---

## Task 16: Full gate + final review

- [ ] **Step 1: Run the full gate**

Run: `make check-all`
Expected: all green (bash + TypeScript). Fix any failure before proceeding.

- [ ] **Step 2: Smoke-test the new type end-to-end**

```bash
npm run build
node dist/index.js init --project-type macos-native --macos-ui-framework hybrid --macos-distribution developer-id --macos-persistence sqlite --auto --methodology deep --dry-run 2>&1 | tail -40
```
(Use the actual `init` dry-run/preview flag the CLI supports; the goal is to confirm the config validates and the overlay resolves with no web-centric steps.) Expected: a macos-native config + macOS steps, no `ux-spec`/`design-system`.

- [ ] **Step 3: Multi-model review of the whole branch**

Run the MMR review per CLAUDE.md (foreground, all channels) **and** the local AI review:
```bash
mmr review --base main --head HEAD --sync --format json > /tmp/mmr-macos.json
```
…and `local_review` (scope `since-main`) via the local-ai-delegate MCP. Fix all blocking (≥P2) findings; re-run until verdict is `pass`/`degraded-pass`.

- [ ] **Step 4: Final commit (if review fixes were needed)** and stop for user review before opening a PR.

---

## Self-Review (planner — completed)

**Spec coverage:** §2 config → Task 1; coupling rules → Task 2 (+ CLI guard Task 6); §3 steps (5 new + 3 disabled) → Tasks 7–8 (new), Task 10 (disable via overlay); §3.3 conditional steps → already conditional, untouched (noted); §4 knowledge (20) → Tasks 11–13; §5 overlay → Task 10; §6 presets → Task 9; §7 wizard/CLI → Tasks 4–6; §8 detector → Task 3; §9 tests/docs/freshness → Tasks 3/14 (tests), 15 (docs/freshness). Every spec section maps to a task.

**Placeholder scan:** Content-heavy tasks (7–8, 11–13) give complete frontmatter + explicit per-item content checklists + validation commands rather than ghostwritten prose, because the prose body is the deliverable an implementer authors and validates — this is intentional, not a TODO. All TypeScript/YAML steps contain complete code.

**Type consistency:** `MacosNativeConfig` field names (`uiFramework`, `appStyle`, `minMacosVersion`, `distribution`, `sandboxed`, `persistence`, `autoUpdate`) are identical across schema (Task 1), validator (Task 2), detector inference (Task 3), copy (Task 4), flags/wizard (Task 5), and CLI overrides (Task 6). `configKey: 'macosNativeConfig'` and `projectType: 'macos-native'` are consistent. Step slugs and knowledge-entry slugs match between the step frontmatter `knowledge-base` (Tasks 7–8), the overlay (Task 10), and the knowledge files (Tasks 11–13).

**Known verification points flagged inline** (not placeholders — they say exactly what to confirm against the live code): the `OverlayState` accessor names in Task 14, the `init` dry-run flag in Task 16, and the freshness-reference builder script name in Task 15.
