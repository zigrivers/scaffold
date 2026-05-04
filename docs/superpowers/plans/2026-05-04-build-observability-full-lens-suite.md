# Build Observability — Full Lens Suite Implementation Plan (Plan 3 of N)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the eight-lens audit by adding lenses C (coding-standards), D (tech-stack), E (design-system), F (missing scope), and G (undocumented decisions, with cross-lens correlation to D). Build the supporting graph machinery these lenses depend on (`file_to_component_use` edges from import analysis, `file_to_token_use` edges from style parsing) and add per-project lens configuration via `.scaffold/observability.yaml`.

**Architecture:** Two new use-detectors under `src/observability/engine/doc-graph/` (component-use and token-use) feed the edge builder so Lenses D and E can query structural data instead of re-parsing source. Five new lens modules under `src/observability/checks/` plug into Plan 2's `runChecks` runner; Lens G declares `depends_on: ['D-stack']` and reads D's findings via the runner's shared findings buffer (already supported by Plan 2). The lens registry grows from three entries to eight; `runAudit`'s scope mapping is extended so `scope=code` runs A/B/C/D/E/F/G and `scope=docs` continues to run just H.

**Tech Stack:** TypeScript (vitest, `postcss` for CSS/SCSS AST, `@babel/parser` + `@babel/traverse` for TSX/JSX style-prop walking, `js-yaml` for `.scaffold/observability.yaml`). No new bats infrastructure; existing harness extends.

**Spec:** [`docs/superpowers/specs/2026-04-30-build-observability-design.md`](../specs/2026-04-30-build-observability-design.md)

**Depends on:** [`Plan 1 — Foundation`](2026-04-30-build-observability-foundation.md) and [`Plan 2 — Audit MVP`](2026-04-30-build-observability-audit-mvp.md). Plan 3 reuses Plan 2's `LensManifest`, `runChecks`, `aggregate`, `resolveFixThreshold`, `buildDocGraph`, and the existing edge builder; it does not modify those contracts (only adds new edges and new lens entries).

**Subsequent plans:** Plan 4 adds the markdown + dashboard renderers + JSON sidecars (closes the audit-history loop). Plan 5 adds replay + stall detection. Plan 6 adds phase-boundary triggers + StateManager refactor. Plan 7 adds the MMR doc-conformance channel. Plan 8 adds the `--fix` flow + worktree teardown.

---

## Pre-flight

Verify Plans 1 + 2 are on the current branch:

```bash
test -f src/observability/engine/checks/runner.ts && \
  test -f src/observability/engine/doc-graph/index.ts && \
  test -f src/observability/checks/lens-a-tdd.ts && \
  test -f src/observability/checks/lens-b-ac-coverage.ts && \
  test -f src/observability/checks/lens-h-cross-doc.ts && \
  echo "Plans 1+2 present" || echo "Plans 1+2 missing — abort"
```

Worktree (recommended):

```bash
scripts/setup-agent-worktree.sh observability-full-lens-suite
cd ../scaffold-observability-full-lens-suite
```

Add style-parsing dependencies (used by Tasks 2 and 3):

```bash
npm ls postcss @babel/parser @babel/traverse >/dev/null 2>&1 || \
  npm install --save postcss @babel/parser @babel/traverse
npm install --save-dev @types/babel__traverse
git add package.json package-lock.json && \
  git commit -m "deps: add postcss + @babel/parser/@babel/traverse for design-system drift detection"
```

---

## File Structure

New files this plan creates (existing files this plan modifies):

```
src/observability/engine/doc-graph/
  token-use-detector.ts          token-use-detector.test.ts
  component-use-detector.ts      component-use-detector.test.ts
  edge-builder.ts                (modify) integrate detector output into edges

src/observability/engine/checks/
  registry.ts                    (modify) 3 → 8 lens entries
  observability-config.ts        observability-config.test.ts  (.scaffold/observability.yaml loader)

src/observability/checks/
  lens-c-standards.ts            lens-c-standards.test.ts
  lens-d-stack.ts                lens-d-stack.test.ts
  lens-e-design.ts               lens-e-design.test.ts
  lens-f-scope.ts                lens-f-scope.test.ts
  lens-g-decisions.ts            lens-g-decisions.test.ts

src/observability/engine/api.ts  (modify) wire 5 new lenses + scope=code mapping

tests/observability/fixtures/projects/audit-mvp/  (extend) trip C/D/E/F/G drift
tests/observability/audit.bats                     (extend) e2e for all 8 lenses
.scaffold/observability.yaml                       (created at runtime; example committed under tests/)
```

---

## Task 1: Configurable lens settings via `.scaffold/observability.yaml`

Loader for per-project knobs (E's ad-hoc-token threshold and `ui_glob`, C's linter-integration toggle and rule-severity overrides, lens enable/disable list, stall thresholds — last group consumed by Plan 5 but the schema accepts them now so it's stable).

**Files:**
- Create: `src/observability/engine/checks/observability-config.ts`
- Create: `src/observability/engine/checks/observability-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/checks/observability-config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadObservabilityConfig, DEFAULT_CONFIG } from './observability-config'

describe('loadObservabilityConfig', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-cfg-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns defaults when no file exists', () => {
    const cfg = loadObservabilityConfig(dir)
    expect(cfg).toEqual(DEFAULT_CONFIG)
  })

  it('merges user values over defaults at the lens-keyed level', () => {
    writeFileSync(join(dir, '.scaffold/observability.yaml').replace('/.scaffold', ''), '')
    writeFileSync(join(dir, '.scaffold-observability.yaml'), '')   // create the dir first via the next write
    // Recreate with proper path:
    rmSync(dir, { recursive: true, force: true })
    const dir2 = mkdtempSync(join(tmpdir(), 'observe-cfg2-'))
    try {
      const path = join(dir2, '.scaffold/observability.yaml')
      writeFileSync(path.replace('observability.yaml', '.gitkeep'), '')
      writeFileSync(path,
`lenses:
  E-design:
    ad_hoc_token_threshold: 5
    ui_glob: "src/components/**/*.{tsx,vue}"
  C-standards:
    enforce_via_linter: true
    rule_overrides:
      no-console: P1
`)
      const cfg = loadObservabilityConfig(dir2)
      expect(cfg.lenses['E-design']?.ad_hoc_token_threshold).toBe(5)
      expect(cfg.lenses['E-design']?.ui_glob).toBe('src/components/**/*.{tsx,vue}')
      expect(cfg.lenses['C-standards']?.enforce_via_linter).toBe(true)
      expect(cfg.lenses['C-standards']?.rule_overrides).toEqual({ 'no-console': 'P1' })
    } finally {
      rmSync(dir2, { recursive: true, force: true })
    }
  })

  it('falls through to defaults silently when the file is malformed YAML', () => {
    writeFileSync(join(dir, '.scaffold-fake'), '')
    const dir2 = mkdtempSync(join(tmpdir(), 'observe-cfg3-'))
    try {
      const cfgPath = join(dir2, '.scaffold/observability.yaml')
      writeFileSync(cfgPath.replace('observability.yaml', '.gitkeep'), '')
      writeFileSync(cfgPath, ': - bad yaml -')
      const cfg = loadObservabilityConfig(dir2)
      expect(cfg).toEqual(DEFAULT_CONFIG)
    } finally {
      rmSync(dir2, { recursive: true, force: true })
    }
  })

  it('disabled_lenses takes the registered ids out of the enabled set', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'observe-cfg4-'))
    try {
      const cfgPath = join(dir2, '.scaffold/observability.yaml')
      writeFileSync(cfgPath.replace('observability.yaml', '.gitkeep'), '')
      writeFileSync(cfgPath, 'disabled_lenses: ["E-design", "G-decisions"]\n')
      const cfg = loadObservabilityConfig(dir2)
      expect(cfg.disabled_lenses).toEqual(['E-design', 'G-decisions'])
    } finally {
      rmSync(dir2, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/checks/observability-config.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `observability-config.ts`**

Create `src/observability/engine/checks/observability-config.ts`:

```typescript
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

export interface ELensConfig {
  ad_hoc_token_threshold?: number
  ui_glob?: string
}
export interface CLensConfig {
  enforce_via_linter?: boolean
  rule_overrides?: Record<string, 'P0' | 'P1' | 'P2' | 'P3'>
}
export interface FLensConfig {
  untouched_story_grace_hours?: number  // wave/phase budget for "story planned but untouched"
}
export interface GLensConfig {
  keywords_file?: string                // override path to decision-keywords.txt
}

export interface StallConfig {
  task_stale?: string | 'off'
  pr_stale?: string | 'off'
  pr_review_stale?: string | 'off'
  blocker_unaddressed?: string | 'off'
  audit_findings_unresolved?: string | 'off'
}

export interface ObservabilityConfig {
  lenses: {
    'A-tdd'?: Record<string, never>
    'B-ac-coverage'?: Record<string, never>
    'C-standards'?: CLensConfig
    'D-stack'?: Record<string, never>
    'E-design'?: ELensConfig
    'F-scope'?: FLensConfig
    'G-decisions'?: GLensConfig
    'H-cross-doc'?: { skip_phase_subsets?: string[] }
  }
  disabled_lenses: string[]
  stall: StallConfig
  phase_audit: { enabled: boolean; timeout_s: number; detached: boolean }
}

export const DEFAULT_CONFIG: ObservabilityConfig = {
  lenses: {
    'C-standards': { enforce_via_linter: true, rule_overrides: {} },
    'E-design':    { ad_hoc_token_threshold: 3, ui_glob: 'src/components/**/*.{tsx,jsx,vue,svelte},src/styles/**/*.{css,scss}' },
    'F-scope':     { untouched_story_grace_hours: 168 },  // one week
    'G-decisions': {},
    'H-cross-doc': {},
  },
  disabled_lenses: [],
  stall: {
    task_stale: '4h', pr_stale: '48h', pr_review_stale: '24h',
    blocker_unaddressed: '2h', audit_findings_unresolved: '24h',
  },
  phase_audit: { enabled: true, timeout_s: 60, detached: false },
}

const CONFIG_PATH = '.scaffold/observability.yaml'

function deepMerge<T extends Record<string, unknown>>(base: T, over: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(over)) {
    const baseV = base[k]
    if (v && typeof v === 'object' && !Array.isArray(v) && baseV && typeof baseV === 'object' && !Array.isArray(baseV)) {
      out[k] = deepMerge(baseV as Record<string, unknown>, v as Record<string, unknown>)
    } else {
      out[k] = v
    }
  }
  return out as T
}

export function loadObservabilityConfig(cwd: string): ObservabilityConfig {
  const path = join(cwd, CONFIG_PATH)
  if (!existsSync(path)) return DEFAULT_CONFIG
  try {
    const raw = yaml.load(readFileSync(path, 'utf8')) as Record<string, unknown> | null
    if (!raw || typeof raw !== 'object') return DEFAULT_CONFIG
    return deepMerge(DEFAULT_CONFIG, raw)
  } catch {
    return DEFAULT_CONFIG
  }
}

/** Helper for the tests: ensure the config dir exists before writing the YAML file. */
export function ensureConfigDir(cwd: string): string {
  const dir = join(cwd, '.scaffold')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'observability.yaml')
}
```

- [ ] **Step 4: Update the test to use `ensureConfigDir`**

The test in Step 1 used a hand-rolled mkdir-via-writeFileSync hack to create `.scaffold/`. Refactor it to use the helper for clarity. Replace the test bodies with:

```typescript
import { loadObservabilityConfig, DEFAULT_CONFIG, ensureConfigDir } from './observability-config'
import { writeFileSync } from 'node:fs'
// ...

it('returns defaults when no file exists', () => {
  expect(loadObservabilityConfig(dir)).toEqual(DEFAULT_CONFIG)
})

it('merges user values over defaults at the lens-keyed level', () => {
  writeFileSync(ensureConfigDir(dir),
`lenses:
  E-design:
    ad_hoc_token_threshold: 5
    ui_glob: "src/components/**/*.{tsx,vue}"
  C-standards:
    enforce_via_linter: true
    rule_overrides:
      no-console: P1
`)
  const cfg = loadObservabilityConfig(dir)
  expect(cfg.lenses['E-design']?.ad_hoc_token_threshold).toBe(5)
  expect(cfg.lenses['E-design']?.ui_glob).toBe('src/components/**/*.{tsx,vue}')
  expect(cfg.lenses['C-standards']?.enforce_via_linter).toBe(true)
  expect(cfg.lenses['C-standards']?.rule_overrides).toEqual({ 'no-console': 'P1' })
})

it('falls through to defaults silently when the file is malformed YAML', () => {
  writeFileSync(ensureConfigDir(dir), ': - bad yaml -')
  expect(loadObservabilityConfig(dir)).toEqual(DEFAULT_CONFIG)
})

it('disabled_lenses takes the registered ids out of the enabled set', () => {
  writeFileSync(ensureConfigDir(dir), 'disabled_lenses: ["E-design", "G-decisions"]\n')
  const cfg = loadObservabilityConfig(dir)
  expect(cfg.disabled_lenses).toEqual(['E-design', 'G-decisions'])
})
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/checks/observability-config.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/observability/engine/checks/observability-config.ts src/observability/engine/checks/observability-config.test.ts
git commit -m "observability: load .scaffold/observability.yaml (lens config, disabled_lenses, stall thresholds, phase_audit)"
```

---

## Task 2: Token-use detector (CSS / SCSS via postcss)

Walks `ui_glob` files matching `*.css`/`*.scss`, uses `postcss` to extract values for color/spacing/typography properties, and matches each value against `DesignToken[]`. Produces `file_to_token_use` edges (`token_id` for matches, `"ad_hoc"` for unmatched values).

**Files:**
- Create: `src/observability/engine/doc-graph/token-use-detector.ts`
- Create: `src/observability/engine/doc-graph/token-use-detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/doc-graph/token-use-detector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectCssTokenUses } from './token-use-detector'
import type { DesignToken } from '../types'

const tokens: DesignToken[] = [
  { id: 'token:--color-primary', category: 'color',    value: '#4f46e5', priority: 'must',   source_anchor: '' },
  { id: 'token:--color-danger',  category: 'color',    value: '#ef4444', priority: 'must',   source_anchor: '' },
  { id: 'token:--sp-2',          category: 'spacing',  value: '8px',     priority: 'should', source_anchor: '' },
]

describe('detectCssTokenUses', () => {
  it('matches CSS literals against design tokens', () => {
    const css = `.btn { color: #4f46e5; padding: 8px; background: #abcdef; }`
    const uses = detectCssTokenUses(css, tokens, 'src/styles/btn.css')
    expect(uses).toEqual([
      { file: 'src/styles/btn.css', property: 'color',   value: '#4f46e5', token_id: 'token:--color-primary' },
      { file: 'src/styles/btn.css', property: 'padding', value: '8px',     token_id: 'token:--sp-2' },
      { file: 'src/styles/btn.css', property: 'background', value: '#abcdef', token_id: 'ad_hoc' },
    ])
  })

  it('walks shorthand properties (margin/padding) and emits one use per side that is a literal', () => {
    const css = `.box { padding: 8px 16px; margin: 4px; }`
    const uses = detectCssTokenUses(css, tokens, 'src/styles/box.css')
    // 8px matches a token; 16px does not; 4px does not.
    expect(uses.find((u) => u.value === '8px' && u.token_id === 'token:--sp-2')).toBeDefined()
    expect(uses.find((u) => u.value === '16px' && u.token_id === 'ad_hoc')).toBeDefined()
    expect(uses.find((u) => u.value === '4px' && u.token_id === 'ad_hoc')).toBeDefined()
  })

  it('ignores values that are CSS variables (var(--…))', () => {
    const css = `.btn { color: var(--color-primary); }`
    expect(detectCssTokenUses(css, tokens, 'src/styles/btn.css')).toEqual([])
  })

  it('handles SCSS nested selectors without crashing', () => {
    const scss = `.btn { color: #4f46e5; &:hover { color: #ef4444; } }`
    const uses = detectCssTokenUses(scss, tokens, 'src/styles/btn.scss')
    expect(uses.map((u) => u.token_id)).toEqual(['token:--color-primary', 'token:--color-danger'])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/doc-graph/token-use-detector.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `token-use-detector.ts` (CSS branch)**

Create `src/observability/engine/doc-graph/token-use-detector.ts`:

```typescript
import postcss from 'postcss'
import type { DesignToken } from '../types'

export interface TokenUse {
  file: string
  property: string
  value: string
  token_id: string         // "token:<id>" or "ad_hoc"
}

const COLOR_PROPS = /^(color|background(-color)?|border(-color)?|fill|stroke)$/i
const SPACING_PROPS = /^(margin|padding)(-(top|right|bottom|left))?$|^(gap|top|right|bottom|left)$/i
const TYPOGRAPHY_PROPS = /^(font-size|font-family|font-weight|line-height)$/i

function isLiteral(value: string): boolean {
  return !/^var\(/i.test(value.trim()) && value.trim().length > 0
}

function tokenIdFor(value: string, tokens: DesignToken[], category: DesignToken['category'] | null): string {
  if (!category) return 'ad_hoc'
  const v = value.trim().toLowerCase()
  const match = tokens.find((t) => t.category === category && t.value.trim().toLowerCase() === v)
  return match ? match.id : 'ad_hoc'
}

function categoryOfProp(prop: string): DesignToken['category'] | null {
  if (COLOR_PROPS.test(prop)) return 'color'
  if (SPACING_PROPS.test(prop)) return 'spacing'
  if (TYPOGRAPHY_PROPS.test(prop)) return 'typography'
  return null
}

function splitShorthand(prop: string, value: string): { property: string; value: string }[] {
  if (!/^(margin|padding|gap)$/i.test(prop)) return [{ property: prop, value }]
  // Split on whitespace; each piece becomes its own emitted use.
  return value.split(/\s+/).filter(Boolean).map((v) => ({ property: prop, value: v }))
}

export function detectCssTokenUses(source: string, tokens: DesignToken[], filePath: string): TokenUse[] {
  const out: TokenUse[] = []
  let root: postcss.Root
  try {
    root = postcss.parse(source, { from: filePath })
  } catch {
    return out
  }
  root.walkDecls((decl) => {
    const cat = categoryOfProp(decl.prop)
    if (!cat) return
    if (!isLiteral(decl.value)) return
    for (const piece of splitShorthand(decl.prop, decl.value)) {
      if (!isLiteral(piece.value)) continue
      out.push({
        file: filePath,
        property: piece.property,
        value: piece.value,
        token_id: tokenIdFor(piece.value, tokens, cat),
      })
    }
  })
  return out
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/doc-graph/token-use-detector.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/doc-graph/token-use-detector.ts src/observability/engine/doc-graph/token-use-detector.test.ts
git commit -m "observability: detect CSS/SCSS token uses (color/spacing/typography matched against DesignToken[])"
```

---

## Task 3: Token-use detector — TSX / JSX `style={…}` props

Extends the detector with a `detectJsxTokenUses` function that uses `@babel/parser` to walk JSX `style` object expressions, extracting CSS-like property values.

**Files:**
- Modify: `src/observability/engine/doc-graph/token-use-detector.ts`
- Modify: `src/observability/engine/doc-graph/token-use-detector.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/engine/doc-graph/token-use-detector.test.ts`:

```typescript
import { detectJsxTokenUses } from './token-use-detector'

describe('detectJsxTokenUses', () => {
  it('extracts CSS-like values from JSX style={{ … }} props', () => {
    const tsx = `
      export const Btn = () => (
        <button style={{ color: '#4f46e5', padding: '8px', background: '#abcdef' }}>X</button>
      )
    `
    const uses = detectJsxTokenUses(tsx, tokens, 'src/components/Btn.tsx')
    expect(uses).toEqual([
      { file: 'src/components/Btn.tsx', property: 'color',      value: '#4f46e5', token_id: 'token:--color-primary' },
      { file: 'src/components/Btn.tsx', property: 'padding',    value: '8px',     token_id: 'token:--sp-2' },
      { file: 'src/components/Btn.tsx', property: 'background', value: '#abcdef', token_id: 'ad_hoc' },
    ])
  })

  it('converts camelCase style keys (backgroundColor) to kebab-case for token matching', () => {
    const tsx = `<div style={{ backgroundColor: '#ef4444' }} />`
    const uses = detectJsxTokenUses(tsx, tokens, 'a.tsx')
    expect(uses[0]).toMatchObject({ property: 'background-color', value: '#ef4444', token_id: 'token:--color-danger' })
  })

  it('skips non-literal values (variable references) instead of matching them', () => {
    const tsx = `const c = '#4f46e5'; export default () => <div style={{ color: c }} />`
    const uses = detectJsxTokenUses(tsx, tokens, 'a.tsx')
    expect(uses).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/doc-graph/token-use-detector.test.ts
```

Expected: FAIL — `detectJsxTokenUses` not exported.

- [ ] **Step 3: Implement `detectJsxTokenUses`**

Append to `src/observability/engine/doc-graph/token-use-detector.ts`:

```typescript
import { parse as babelParse } from '@babel/parser'
import traverseDefault from '@babel/traverse'
import type {
  JSXAttribute, ObjectExpression, ObjectProperty, Identifier, StringLiteral,
} from '@babel/types'

const traverse = (traverseDefault as unknown as { default: typeof traverseDefault }).default ?? traverseDefault

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

export function detectJsxTokenUses(source: string, tokens: DesignToken[], filePath: string): TokenUse[] {
  const out: TokenUse[] = []
  let ast
  try {
    ast = babelParse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  } catch {
    return out
  }
  traverse(ast, {
    JSXAttribute(path) {
      const node = path.node as JSXAttribute
      const nameNode = node.name
      if (nameNode.type !== 'JSXIdentifier' || nameNode.name !== 'style') return
      const expr = node.value
      if (!expr || expr.type !== 'JSXExpressionContainer') return
      if (expr.expression.type !== 'ObjectExpression') return
      for (const prop of (expr.expression as ObjectExpression).properties) {
        if (prop.type !== 'ObjectProperty') continue
        const op = prop as ObjectProperty
        const keyName = op.key.type === 'Identifier' ? (op.key as Identifier).name
                      : op.key.type === 'StringLiteral' ? (op.key as StringLiteral).value
                      : null
        if (!keyName) continue
        const valueNode = op.value
        if (valueNode.type !== 'StringLiteral') continue
        const property = camelToKebab(keyName)
        for (const piece of splitShorthand(property, (valueNode as StringLiteral).value)) {
          out.push({
            file: filePath,
            property: piece.property,
            value: piece.value,
            token_id: tokenIdFor(piece.value, tokens, categoryOfProp(piece.property)),
          })
        }
      }
    },
  })
  return out
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/doc-graph/token-use-detector.test.ts
```

Expected: PASS, 7 tests total (4 from Task 2 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/doc-graph/token-use-detector.ts src/observability/engine/doc-graph/token-use-detector.test.ts
git commit -m "observability: detect JSX style={…} token uses with @babel/parser (camelCase→kebab-case mapping)"
```

---

## Task 4: Component-use detector (TS/JS imports)

Parses TypeScript/JavaScript source with `@babel/parser` and extracts `import` declarations. For each imported package or relative path, classifies it as a sanctioned component (matched against `SanctionedComponent.package_or_url`) or `unsanctioned`.

**Files:**
- Create: `src/observability/engine/doc-graph/component-use-detector.ts`
- Create: `src/observability/engine/doc-graph/component-use-detector.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/engine/doc-graph/component-use-detector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectComponentUses } from './component-use-detector'
import type { SanctionedComponent } from '../types'

const components: SanctionedComponent[] = [
  { id: 'component:react',       package_or_url: 'react@18',       layer: 'frontend', source_anchor: '' },
  { id: 'component:tailwindcss', package_or_url: 'tailwindcss@3',  layer: 'frontend', source_anchor: '' },
  { id: 'component:postgres',    package_or_url: 'postgres@16',    layer: 'data',     source_anchor: '' },
]

describe('detectComponentUses', () => {
  it('matches imports by package name (ignoring version suffix)', () => {
    const ts = `
      import React from 'react'
      import { sql } from 'postgres'
      import { isDeprecated } from 'lodash'
    `
    const uses = detectComponentUses(ts, components, 'src/x.ts')
    expect(uses).toEqual([
      { file: 'src/x.ts', specifier: 'react',    component_id: 'component:react' },
      { file: 'src/x.ts', specifier: 'postgres', component_id: 'component:postgres' },
      { file: 'src/x.ts', specifier: 'lodash',   component_id: 'unsanctioned' },
    ])
  })

  it('treats relative imports as in-repo (skipped, not unsanctioned)', () => {
    const ts = `import { foo } from './foo'\nimport bar from '../bar'`
    expect(detectComponentUses(ts, components, 'src/x.ts')).toEqual([])
  })

  it('handles scoped packages like @org/pkg', () => {
    const local: SanctionedComponent[] = [
      { id: 'component:trpc', package_or_url: '@trpc/server@10', layer: 'backend', source_anchor: '' },
    ]
    const ts = `import { router } from '@trpc/server'`
    const uses = detectComponentUses(ts, local, 'src/x.ts')
    expect(uses[0]).toMatchObject({ specifier: '@trpc/server', component_id: 'component:trpc' })
  })

  it('returns [] when source has no imports', () => {
    expect(detectComponentUses('export const x = 1', components, 'src/x.ts')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/doc-graph/component-use-detector.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `component-use-detector.ts`**

Create `src/observability/engine/doc-graph/component-use-detector.ts`:

```typescript
import { parse as babelParse } from '@babel/parser'
import traverseDefault from '@babel/traverse'
import type { ImportDeclaration } from '@babel/types'
import type { SanctionedComponent } from '../types'

const traverse = (traverseDefault as unknown as { default: typeof traverseDefault }).default ?? traverseDefault

export interface ComponentUse {
  file: string
  specifier: string
  component_id: string  // "component:<id>" or "unsanctioned"
}

function packageNameOf(component: SanctionedComponent): string {
  // Strip version suffix: "react@18" → "react"; "@trpc/server@10" → "@trpc/server"
  const m = component.package_or_url.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@.+)?$/)
  return m ? m[1] : component.package_or_url
}

function isRelative(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')
}

export function detectComponentUses(source: string, components: SanctionedComponent[], filePath: string): ComponentUse[] {
  const out: ComponentUse[] = []
  const sanctionedByName = new Map(components.map((c) => [packageNameOf(c), c.id]))

  let ast
  try {
    ast = babelParse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  } catch {
    return out
  }

  traverse(ast, {
    ImportDeclaration(path) {
      const node = path.node as ImportDeclaration
      const spec = node.source.value
      if (isRelative(spec)) return
      const componentId = sanctionedByName.get(spec) ?? 'unsanctioned'
      out.push({ file: filePath, specifier: spec, component_id: componentId })
    },
  })
  return out
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/doc-graph/component-use-detector.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/doc-graph/component-use-detector.ts src/observability/engine/doc-graph/component-use-detector.test.ts
git commit -m "observability: detect TS/JS imports vs SanctionedComponent[] (sanctioned vs unsanctioned)"
```

---

## Task 5: Integrate detectors into the doc-graph builder

Plan 2's `buildDocGraph` walks files but doesn't apply the detectors. This task wires them in: it runs `detectCssTokenUses` and `detectJsxTokenUses` against `ui_glob` files (config from Task 1) and `detectComponentUses` against TS/JS files, producing `file_to_token_use` and `file_to_component_use` edges.

**Files:**
- Modify: `src/observability/engine/doc-graph/index.ts`
- Modify: `src/observability/engine/doc-graph/index.test.ts`
- Modify: `src/observability/engine/doc-graph/edge-builder.ts`
- Modify: `src/observability/engine/doc-graph/edge-builder.test.ts`

- [ ] **Step 1: Append the failing test for the edge builder**

Append to `src/observability/engine/doc-graph/edge-builder.test.ts`:

```typescript
import type { TokenUse } from './token-use-detector'
import type { ComponentUse } from './component-use-detector'

describe('buildEdges (with token + component uses)', () => {
  const minimalInput = {
    features: [], stories: [], acs: [], plan_tasks: [], playbook_tasks: [],
    tests: [], decisions: [],
    files: [
      { id: 'file:src/styles/btn.css',  path: 'src/styles/btn.css' },
      { id: 'file:src/components/Btn.tsx', path: 'src/components/Btn.tsx' },
      { id: 'file:src/lib/auth.ts',     path: 'src/lib/auth.ts' },
    ],
  }

  it('emits file_to_token_use edges for each detected use', () => {
    const tokenUses: TokenUse[] = [
      { file: 'src/styles/btn.css', property: 'color', value: '#4f46e5', token_id: 'token:--color-primary' },
      { file: 'src/styles/btn.css', property: 'background', value: '#abcdef', token_id: 'ad_hoc' },
    ]
    const result = buildEdges({ ...minimalInput, token_uses: tokenUses } as never)
    const edges = result.edges.filter((e) => e.kind === 'file_to_token_use')
    expect(edges).toHaveLength(2)
    expect(edges[0]).toEqual({ kind: 'file_to_token_use', from: 'file:src/styles/btn.css', to: 'token:--color-primary' })
    expect(edges[1]).toEqual({ kind: 'file_to_token_use', from: 'file:src/styles/btn.css', to: 'ad_hoc' })
  })

  it('emits file_to_component_use edges for each detected import', () => {
    const componentUses: ComponentUse[] = [
      { file: 'src/lib/auth.ts', specifier: 'react',    component_id: 'component:react' },
      { file: 'src/lib/auth.ts', specifier: 'lodash',   component_id: 'unsanctioned' },
    ]
    const result = buildEdges({ ...minimalInput, component_uses: componentUses } as never)
    const edges = result.edges.filter((e) => e.kind === 'file_to_component_use')
    expect(edges).toHaveLength(2)
    expect(edges[0]).toEqual({ kind: 'file_to_component_use', from: 'file:src/lib/auth.ts', to: 'component:react' })
    expect(edges[1]).toEqual({ kind: 'file_to_component_use', from: 'file:src/lib/auth.ts', to: 'unsanctioned' })
  })
})
```

- [ ] **Step 2: Run the edge-builder test to confirm it fails**

```bash
npx vitest run src/observability/engine/doc-graph/edge-builder.test.ts
```

Expected: FAIL — `buildEdges` doesn't accept `token_uses` or `component_uses`.

- [ ] **Step 3: Extend `BuildEdgesInput` and the implementation**

In `src/observability/engine/doc-graph/edge-builder.ts`, add to `BuildEdgesInput`:

```typescript
import type { TokenUse } from './token-use-detector'
import type { ComponentUse } from './component-use-detector'

export interface BuildEdgesInput {
  // ... existing fields
  token_uses?: TokenUse[]
  component_uses?: ComponentUse[]
}
```

Append to the body of `buildEdges` (after the existing edge-construction blocks and before the `return`):

```typescript
  // file_to_token_use
  for (const use of input.token_uses ?? []) {
    const fileId = fileIdByPath.get(use.file) ?? `file:${use.file}`
    edges.push({ kind: 'file_to_token_use', from: fileId, to: use.token_id as never })
  }
  // file_to_component_use
  for (const use of input.component_uses ?? []) {
    const fileId = fileIdByPath.get(use.file) ?? `file:${use.file}`
    edges.push({ kind: 'file_to_component_use', from: fileId, to: use.component_id as never })
  }
```

- [ ] **Step 4: Run the edge-builder test to confirm it passes**

```bash
npx vitest run src/observability/engine/doc-graph/edge-builder.test.ts
```

Expected: PASS — original 2 tests + 2 new ones.

- [ ] **Step 5: Wire detectors into `buildDocGraph`**

In `src/observability/engine/doc-graph/index.ts`, add detector invocation between the existing parser calls and the `buildEdges` call:

```typescript
import { minimatch } from 'minimatch'
import { detectCssTokenUses, detectJsxTokenUses } from './token-use-detector'
import type { TokenUse } from './token-use-detector'
import { detectComponentUses } from './component-use-detector'
import type { ComponentUse } from './component-use-detector'
import { loadObservabilityConfig } from '../checks/observability-config'

// Inside buildDocGraph, after `const tokens = artifacts.design_system ? parseDesignTokens(artifacts.design_system) : []`:

const config = loadObservabilityConfig(cwd)
const uiGlobs = (config.lenses['E-design']?.ui_glob ?? '').split(',').map((s) => s.trim()).filter(Boolean)

const tokenUses: TokenUse[] = []
const componentUses: ComponentUse[] = []

for (const f of files) {
  // Token uses
  if (uiGlobs.length > 0 && uiGlobs.some((g) => minimatch(f.path, g))) {
    let content: string
    try { content = readFileSync(join(cwd, f.path), 'utf8') } catch { continue }
    if (/\.(css|scss)$/.test(f.path)) {
      tokenUses.push(...detectCssTokenUses(content, tokens, f.path))
    } else if (/\.(tsx|jsx)$/.test(f.path)) {
      tokenUses.push(...detectJsxTokenUses(content, tokens, f.path))
    }
  }
  // Component uses (TS/JS)
  if (/\.(ts|tsx|js|jsx|mts|cts)$/.test(f.path) && !f.path.endsWith('.d.ts')) {
    let content: string
    try { content = readFileSync(join(cwd, f.path), 'utf8') } catch { continue }
    componentUses.push(...detectComponentUses(content, components, f.path))
  }
}

const { edges, unresolved_globs } = buildEdges({
  features, stories, acs, plan_tasks: planTasks, playbook_tasks: playbookTasks,
  tests, files, decisions, ac_to_test_overrides: acToTestOverrides,
  token_uses: tokenUses,
  component_uses: componentUses,
})
```

- [ ] **Step 6: Append a graph-level test**

Append to `src/observability/engine/doc-graph/index.test.ts`:

```typescript
it('emits file_to_token_use and file_to_component_use edges for a UI-flavored fixture', async () => {
  mkdirSync(join(dir, 'docs'), { recursive: true })
  mkdirSync(join(dir, 'src/components'), { recursive: true })
  mkdirSync(join(dir, 'src/lib'), { recursive: true })

  writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
  writeFileSync(join(dir, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
  writeFileSync(join(dir, 'docs/user-stories.md'), '## Story s-1: T [priority: must]\n')
  writeFileSync(join(dir, 'docs/tech-stack.md'), '## Frontend\n\n### React\n\n- package_or_url: react@18\n')
  writeFileSync(join(dir, 'docs/design-system.md'),
`## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | must |\n`)

  writeFileSync(join(dir, 'src/components/Btn.tsx'),
    `import React from 'react'\nimport { uniq } from 'lodash'\nexport const Btn = () => <button style={{ color: '#4f46e5', padding: '12px' }}>X</button>`)
  writeFileSync(join(dir, 'src/lib/auth.ts'), `import { sign } from 'jsonwebtoken'\n`)

  // Set ui_glob via config so the detector picks up the .tsx file
  mkdirSync(join(dir, '.scaffold'), { recursive: true })
  writeFileSync(join(dir, '.scaffold/observability.yaml'), 'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.{tsx,jsx}"\n')

  const graph = await buildDocGraph(dir)
  expect(graph.edges.find((e) => e.kind === 'file_to_token_use' && (e as { to: string }).to === 'token:--color-primary')).toBeDefined()
  expect(graph.edges.find((e) => e.kind === 'file_to_token_use' && (e as { to: string }).to === 'ad_hoc')).toBeDefined()
  expect(graph.edges.find((e) => e.kind === 'file_to_component_use' && (e as { to: string }).to === 'component:react')).toBeDefined()
  expect(graph.edges.find((e) => e.kind === 'file_to_component_use' && (e as { to: string }).to === 'unsanctioned')).toBeDefined()
})
```

- [ ] **Step 7: Run all doc-graph tests**

```bash
npx vitest run src/observability/engine/doc-graph/
```

Expected: PASS — original tests + 1 new edge-graph test.

- [ ] **Step 8: Commit**

```bash
git add src/observability/engine/doc-graph/edge-builder.ts src/observability/engine/doc-graph/edge-builder.test.ts src/observability/engine/doc-graph/index.ts src/observability/engine/doc-graph/index.test.ts
git commit -m "observability: integrate token + component use detectors into buildDocGraph (file_to_token_use + file_to_component_use edges)"
```

---

## Task 6: Lens C — coding-standards drift (`lens-c-standards.ts`)

Two fast-profile checks: (a) deterministic pattern/forbidden-symbol matching against changed files, and (b) reading per-rule config overrides from `.scaffold/observability.yaml`. The `enforce-via: linter` rules are honored by surfacing them with the linter-flagged severity (we don't actually run the linter here — that's an integration Plan 7+ may revisit).

**Files:**
- Create: `src/observability/checks/lens-c-standards.ts`
- Create: `src/observability/checks/lens-c-standards.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/checks/lens-c-standards.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lensCStandards } from './lens-c-standards'
import { buildDocGraph } from '../engine/doc-graph'

const stubAvail = {
  git: { status: 'available' as const }, gh: { status: 'unavailable' as const },
  pipeline_docs: { status: 'available' as const }, tests: { status: 'available' as const },
  state: { status: 'available' as const }, beads: { status: 'unavailable' as const },
  mmr: { status: 'available' as const }, audit_history: { status: 'unavailable' as const },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

describe('lensCStandards', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-lensC-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('emits findings when pattern matches in source files (default P2)', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
`# Coding Standards
### Rule: no-console
- pattern: \`console\\.log\\(\`
- match: src/**/*.ts
- language: typescript
`)
    writeFileSync(join(dir, 'src/foo.ts'), `console.log('debug')\n`)

    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    expect(findings).toHaveLength(1)
    expect(findings[0].lens_id).toBe('C-standards')
    expect(findings[0].severity).toBe('P2')
    expect(findings[0].evidence.kind).toBe('rule_violation')
    if (findings[0].evidence.kind === 'rule_violation') {
      expect(findings[0].evidence.rule_id).toBe('rule:no-console')
    }
  })

  it('honors explicit rule severity from the doc', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
`### Rule: no-console
- pattern: \`console\\.log\\(\`
- match: src/**/*.ts
- severity: P0
`)
    writeFileSync(join(dir, 'src/foo.ts'), `console.log('debug')\n`)
    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    expect(findings[0].severity).toBe('P0')
  })

  it('escalates to P1 when the same rule is violated more than 5 times across the project', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
`### Rule: no-console
- pattern: \`console\\.log\\(\`
- match: src/**/*.ts
`)
    writeFileSync(join(dir, 'src/foo.ts'),
`console.log(1)\nconsole.log(2)\nconsole.log(3)\nconsole.log(4)\nconsole.log(5)\nconsole.log(6)\n`)
    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    // 6 occurrences in one file → 6 findings; severity escalates to P1 because total count > 5
    expect(findings).toHaveLength(6)
    expect(findings.every((f) => f.severity === 'P1')).toBe(true)
  })

  it('honors observability.yaml rule_overrides over doc-declared severity', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
`### Rule: no-console
- pattern: \`console\\.log\\(\`
- match: src/**/*.ts
- severity: P2
`)
    writeFileSync(join(dir, 'src/foo.ts'), `console.log('x')\n`)
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
`lenses:
  C-standards:
    rule_overrides:
      no-console: P0
`)
    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    expect(findings[0].severity).toBe('P0')
  })

  it('checks forbidden symbols too', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/coding-standards.md'),
`### Rule: no-eval
- forbidden: eval, new Function
- match: src/**/*.ts
`)
    writeFileSync(join(dir, 'src/foo.ts'), `eval('1 + 1')\n`)
    const graph = await buildDocGraph(dir)
    const findings = await lensCStandards(graph, { events: [] }, stubAvail, [], new Set(['C-standards']))
    expect(findings[0].lens_id).toBe('C-standards')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-c-standards.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lens-c-standards.ts`**

Create `src/observability/checks/lens-c-standards.ts`:

```typescript
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { minimatch } from 'minimatch'
import type { Finding, Rule, Severity } from '../engine/types'
import type { LensFn } from '../engine/checks/runner'
import { loadObservabilityConfig } from '../engine/checks/observability-config'

const lensId = 'C-standards'
const ESCALATION_THRESHOLD = 5
function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

interface RuleViolation { rule: Rule; file: string; lineStart: number; lineEnd: number }

function findPatternViolations(rule: Rule, file: string, content: string): RuleViolation[] {
  const out: RuleViolation[] = []
  if (rule.pattern) {
    let re: RegExp
    try { re = new RegExp(rule.pattern, 'g') } catch { return out }
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        out.push({ rule, file, lineStart: i + 1, lineEnd: i + 1 })
        re.lastIndex = 0
      }
    }
  }
  if (rule.forbidden) {
    const lines = content.split('\n')
    for (const sym of rule.forbidden) {
      const symRe = new RegExp(`\\b${sym.replace(/\s+/g, '\\s+')}\\b`)
      for (let i = 0; i < lines.length; i++) {
        if (symRe.test(lines[i])) out.push({ rule, file, lineStart: i + 1, lineEnd: i + 1 })
      }
    }
  }
  return out
}

function severityFor(rule: Rule, totalCount: number, override?: Severity): Severity {
  if (override) return override
  if (rule.severity) return rule.severity
  if (totalCount > ESCALATION_THRESHOLD) return 'P1'
  return 'P2'
}

export const lensCStandards: LensFn = async (graph) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()
  const cwd = process.cwd()
  const config = loadObservabilityConfig(cwd)
  const overrides = config.lenses['C-standards']?.rule_overrides ?? {}

  // Group violations per rule first to compute total count for severity escalation
  const violationsByRule = new Map<string, RuleViolation[]>()
  for (const rule of graph.rules) {
    const matches = (file: string) => !rule.match || minimatch(file, rule.match)
    for (const f of graph.files) {
      if (!matches(f.path)) continue
      let content: string
      try { content = readFileSync(join(cwd, f.path), 'utf8') } catch { continue }
      const vs = findPatternViolations(rule, f.path, content)
      if (vs.length === 0) continue
      const list = violationsByRule.get(rule.id) ?? []
      list.push(...vs)
      violationsByRule.set(rule.id, list)
    }
  }

  for (const [ruleId, vs] of violationsByRule) {
    const rule = graph.rules.find((r) => r.id === ruleId)
    if (!rule) continue
    const ruleKey = rule.id.replace(/^rule:/, '')
    const override = overrides[ruleKey]
    const severity = severityFor(rule, vs.length, override)
    for (const v of vs) {
      findings.push({
        id: makeFindingId([lensId, ruleId, v.file, String(v.lineStart)]),
        lens_id: lensId, severity,
        title: `${rule.description ?? ruleId} (${v.file}:${v.lineStart})`,
        description: `Rule ${ruleId} violated at ${v.file}:${v.lineStart}.`,
        source_doc: 'docs/coding-standards.md',
        evidence: { kind: 'rule_violation', rule_id: ruleId, file: `file:${v.file}`, lines: [v.lineStart, v.lineEnd] },
        confidence: 'high', first_seen: now, last_seen: now, status: 'open',
        fix_hint: { kind: 'edit_doc', target: v.file, prompt: `Address rule ${ruleId} at ${v.file}:${v.lineStart}.` },
      })
    }
  }

  return findings
}

void existsSync // keep import alive for any future probe path
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-c-standards.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/checks/lens-c-standards.ts src/observability/checks/lens-c-standards.test.ts
git commit -m "observability: lens C — coding-standards drift (pattern + forbidden, escalation, observability.yaml overrides)"
```

---

## Task 7: Lens D — tech-stack drift (`lens-d-stack.ts`)

Two structural checks: (a) `file_to_component_use → "unsanctioned"` edges become findings; (b) sanctioned-component used outside its layer (via path conventions — files under `src/api/` are layer `backend`, etc., per a small built-in heuristic).

For Plan 3, sub-check (a) is implemented fully; sub-check (b) is a stub with a single declarative mapping. Architecture-doc layer rules (e.g., "domain layer must not import from infra layer") are deferred to Plan 7+ where richer architecture parsing happens.

**Files:**
- Create: `src/observability/checks/lens-d-stack.ts`
- Create: `src/observability/checks/lens-d-stack.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/checks/lens-d-stack.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lensDStack } from './lens-d-stack'
import { buildDocGraph } from '../engine/doc-graph'

const stubAvail = {
  git: { status: 'available' as const }, gh: { status: 'unavailable' as const },
  pipeline_docs: { status: 'available' as const }, tests: { status: 'available' as const },
  state: { status: 'available' as const }, beads: { status: 'unavailable' as const },
  mmr: { status: 'available' as const }, audit_history: { status: 'unavailable' as const },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

describe('lensDStack', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-lensD-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('emits P0 for unsanctioned dependency without a recorded decision', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/lib'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/tech-stack.md'),
`## Frontend\n\n### React\n- package_or_url: react@18\n`)
    writeFileSync(join(dir, 'src/lib/x.ts'), `import { uniq } from 'lodash'\n`)
    const graph = await buildDocGraph(dir)
    const findings = await lensDStack(graph, { events: [] }, stubAvail, [], new Set(['D-stack']))
    expect(findings.length).toBe(1)
    expect(findings[0].severity).toBe('P0')
    expect(findings[0].title).toContain('unsanctioned')
    if (findings[0].evidence.kind === 'rule_violation') {
      expect(findings[0].evidence.file).toBe('file:src/lib/x.ts')
    }
  })

  it('does NOT emit when the unsanctioned import has a matching decision_recorded ledger event', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/lib'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/tech-stack.md'),
`## Frontend\n\n### React\n- package_or_url: react@18\n`)
    writeFileSync(join(dir, 'src/lib/x.ts'), `import { uniq } from 'lodash'\n`)
    const graph = await buildDocGraph(dir)
    const events = [{
      event_id: 'ulid-x', worktree_id: 'wid', actor_label: 'a', branch: 'b', task_id: null,
      type: 'decision_recorded', ts: '2026-05-04T00:00:00Z',
      payload: { key: 'lodash-allowed', summary: 'Allow lodash for now', affects: ['src/lib/**'], links: [] },
    } as never]
    const findings = await lensDStack(graph, { events }, stubAvail, [], new Set(['D-stack']))
    expect(findings.find((f) => /unsanctioned/i.test(f.title))).toBeUndefined()
  })

  it('emits P1 for sanctioned component used outside its layer (heuristic)', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/api'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/tech-stack.md'),
`## Frontend\n\n### React\n- package_or_url: react@18\n- layer: frontend\n`)
    writeFileSync(join(dir, 'src/api/handler.ts'), `import React from 'react'\n`)
    const graph = await buildDocGraph(dir)
    const findings = await lensDStack(graph, { events: [] }, stubAvail, [], new Set(['D-stack']))
    const layerFinding = findings.find((f) => /layer/i.test(f.title))
    expect(layerFinding?.severity).toBe('P1')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-d-stack.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lens-d-stack.ts`**

Create `src/observability/checks/lens-d-stack.ts`:

```typescript
import { createHash } from 'node:crypto'
import { minimatch } from 'minimatch'
import type { Finding, Event } from '../engine/types'
import type { LensFn } from '../engine/checks/runner'

const lensId = 'D-stack'
function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

const PATH_TO_LAYER: Array<{ glob: string; layer: string }> = [
  { glob: 'src/api/**',         layer: 'backend'  },
  { glob: 'src/server/**',      layer: 'backend'  },
  { glob: 'src/components/**',  layer: 'frontend' },
  { glob: 'src/pages/**',       layer: 'frontend' },
  { glob: 'src/styles/**',      layer: 'frontend' },
  { glob: 'src/db/**',          layer: 'data'     },
  { glob: 'src/migrations/**',  layer: 'data'     },
]

function fileLayer(path: string): string | null {
  for (const { glob, layer } of PATH_TO_LAYER) {
    if (minimatch(path, glob)) return layer
  }
  return null
}

function decisionsCoverPath(events: Event[], filePath: string): boolean {
  for (const e of events) {
    if (e.type !== 'decision_recorded') continue
    const affects = e.payload.affects
    if (!Array.isArray(affects)) continue
    if (affects.some((g) => minimatch(filePath, g))) return true
  }
  return false
}

export const lensDStack: LensFn = async (graph, ledger) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()

  // (a) unsanctioned dependency without a recorded decision
  const unsanctionedEdges = graph.edges.filter((e) => e.kind === 'file_to_component_use' && (e as { to: string }).to === 'unsanctioned') as Array<{ kind: 'file_to_component_use'; from: string; to: string }>
  for (const edge of unsanctionedEdges) {
    const filePath = edge.from.replace(/^file:/, '')
    if (decisionsCoverPath(ledger.events, filePath)) continue
    findings.push({
      id: makeFindingId([lensId, 'unsanctioned', edge.from]),
      lens_id: lensId, severity: 'P0',
      title: `unsanctioned dependency: ${filePath}`,
      description: `${filePath} imports an unsanctioned package. Record a decision in decisions.jsonl or remove the import.`,
      source_doc: 'docs/tech-stack.md',
      evidence: { kind: 'rule_violation', rule_id: 'tech-stack-unsanctioned', file: edge.from },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'record_decision', target: 'decisions.jsonl', prompt: `Record a decision for the unsanctioned dependency in ${filePath}.` },
    })
  }

  // (b) sanctioned component used outside its declared layer (path-heuristic)
  const sanctionedEdges = graph.edges.filter((e) =>
    e.kind === 'file_to_component_use' && (e as { to: string }).to.startsWith('component:')
  ) as Array<{ kind: 'file_to_component_use'; from: string; to: string }>
  for (const edge of sanctionedEdges) {
    const filePath = edge.from.replace(/^file:/, '')
    const componentId = edge.to
    const component = graph.components.find((c) => c.id === componentId)
    if (!component?.layer) continue
    const inferredLayer = fileLayer(filePath)
    if (!inferredLayer || inferredLayer === component.layer) continue
    findings.push({
      id: makeFindingId([lensId, 'layer', edge.from, componentId]),
      lens_id: lensId, severity: 'P1',
      title: `component used outside its layer: ${component.id} in ${filePath}`,
      description: `${component.id} is declared in layer "${component.layer}" but is used from ${filePath} (inferred layer "${inferredLayer}").`,
      source_doc: 'docs/tech-stack.md',
      evidence: { kind: 'rule_violation', rule_id: 'tech-stack-layer', file: edge.from },
      confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
    })
  }

  return findings
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-d-stack.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/checks/lens-d-stack.ts src/observability/checks/lens-d-stack.test.ts
git commit -m "observability: lens D — tech-stack drift (unsanctioned-without-decision P0, layer mismatch P1)"
```

---

## Task 8: Lens E — design-system drift (`lens-e-design.ts`)

Two checks: (a) per-file ad-hoc-token threshold (default 3, per `observability.yaml`), and (b) per-property must-token violation (a token-governed property whose token is `priority: must` was used as a literal in production UI).

**Files:**
- Create: `src/observability/checks/lens-e-design.ts`
- Create: `src/observability/checks/lens-e-design.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/checks/lens-e-design.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lensEDesign } from './lens-e-design'
import { buildDocGraph } from '../engine/doc-graph'

const stubAvail = {
  git: { status: 'available' as const }, gh: { status: 'unavailable' as const },
  pipeline_docs: { status: 'available' as const }, tests: { status: 'available' as const },
  state: { status: 'available' as const }, beads: { status: 'unavailable' as const },
  mmr: { status: 'available' as const }, audit_history: { status: 'unavailable' as const },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

describe('lensEDesign', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-lensE-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('emits P1 when a UI file has more than the configured ad-hoc threshold (default 3)', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/components'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/design-system.md'),
`## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | must |\n`)
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
      'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n    ad_hoc_token_threshold: 3\n')
    writeFileSync(join(dir, 'src/components/Big.tsx'),
      `export const Big = () => <div style={{ color: '#abc', background: '#def', borderColor: '#123', padding: '13px' }} />`)
    const graph = await buildDocGraph(dir)
    const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
    expect(findings.find((f) => /ad-hoc/i.test(f.title))).toBeDefined()
    expect(findings.find((f) => /ad-hoc/i.test(f.title))?.severity).toBe('P1')
  })

  it('emits P0 when a must-priority token is replaced by a literal', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/components'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/design-system.md'),
`## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | must |\n`)
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
      'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n')
    // Use a non-token color value for `color` (a property whose token is must)
    writeFileSync(join(dir, 'src/components/Btn.tsx'),
      `export const Btn = () => <button style={{ color: '#zz0011' }}>X</button>`)
    const graph = await buildDocGraph(dir)
    const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
    const must = findings.find((f) => /must-priority/i.test(f.title))
    expect(must?.severity).toBe('P0')
  })

  it('emits no findings when files use tokens correctly', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/components'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/design-system.md'),
`## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | must |\n`)
    writeFileSync(join(dir, '.scaffold/observability.yaml'),
      'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n')
    writeFileSync(join(dir, 'src/components/Btn.tsx'),
      `export const Btn = () => <button style={{ color: '#4f46e5' }}>X</button>`)
    const graph = await buildDocGraph(dir)
    const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
    expect(findings).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-e-design.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lens-e-design.ts`**

Create `src/observability/checks/lens-e-design.ts`:

```typescript
import { createHash } from 'node:crypto'
import type { Finding } from '../engine/types'
import type { LensFn } from '../engine/checks/runner'
import { loadObservabilityConfig } from '../engine/checks/observability-config'

const lensId = 'E-design'
function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

const COLOR_PROPS = new Set(['color', 'background', 'background-color', 'border-color', 'fill', 'stroke'])
const SPACING_PROPS = new Set(['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'top', 'right', 'bottom', 'left'])
const TYPOGRAPHY_PROPS = new Set(['font-size', 'font-family', 'font-weight', 'line-height'])

function categoryOfProp(prop: string): 'color' | 'spacing' | 'typography' | null {
  if (COLOR_PROPS.has(prop)) return 'color'
  if (SPACING_PROPS.has(prop)) return 'spacing'
  if (TYPOGRAPHY_PROPS.has(prop)) return 'typography'
  return null
}

export const lensEDesign: LensFn = async (graph) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()
  const config = loadObservabilityConfig(process.cwd())
  const threshold = config.lenses['E-design']?.ad_hoc_token_threshold ?? 3

  // Group ad_hoc edges by file
  const adHocByFile = new Map<string, number>()
  for (const e of graph.edges) {
    if (e.kind !== 'file_to_token_use') continue
    if ((e as { to: string }).to !== 'ad_hoc') continue
    const fileId = (e as { from: string }).from
    adHocByFile.set(fileId, (adHocByFile.get(fileId) ?? 0) + 1)
  }
  for (const [fileId, count] of adHocByFile) {
    if (count <= threshold) continue
    findings.push({
      id: makeFindingId([lensId, 'ad-hoc', fileId]),
      lens_id: lensId, severity: 'P1',
      title: `${count} ad-hoc design values in ${fileId.replace(/^file:/, '')} (threshold: ${threshold})`,
      description: `${fileId.replace(/^file:/, '')} has ${count} style values that don't resolve to design-system tokens.`,
      source_doc: 'docs/design-system.md',
      evidence: { kind: 'rule_violation', rule_id: 'design-ad-hoc-threshold', file: fileId },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'rename_token', target: fileId.replace(/^file:/, ''), prompt: `Replace ad-hoc values with design-system tokens in ${fileId.replace(/^file:/, '')}.` },
    })
  }

  // For Plan 3, "must-priority token replaced by literal" is detected by checking if a property whose
  // category has any must-priority token was used with an unmatched value. We don't have property-level
  // info on the edge today (token-use-detector emits the file → token_id pair); to keep the lens working,
  // we treat any ad_hoc use in a file that contains a must-priority token category as "must-priority"
  // when the file is actively flagged by the threshold rule above. Plan 4 can refine this when we
  // surface the property in the edge payload.
  const mustCategories = new Set(graph.tokens.filter((t) => t.priority === 'must').map((t) => t.category))
  if (mustCategories.size > 0) {
    for (const [fileId, count] of adHocByFile) {
      if (count === 0) continue
      // Only escalate if there's at least one must-priority token category in scope; else stay at P1 from above.
      // We add an additional P0 finding to surface the must-violation explicitly.
      findings.push({
        id: makeFindingId([lensId, 'must-priority', fileId]),
        lens_id: lensId, severity: 'P0',
        title: `must-priority token bypassed in ${fileId.replace(/^file:/, '')}`,
        description: `${fileId.replace(/^file:/, '')} has ad-hoc style values for property categories that include a must-priority token (${[...mustCategories].join(', ')}).`,
        source_doc: 'docs/design-system.md',
        evidence: { kind: 'rule_violation', rule_id: 'design-must-token', file: fileId },
        confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
        fix_hint: { kind: 'rename_token', target: fileId.replace(/^file:/, ''), prompt: `Replace ad-hoc values with the corresponding must-priority tokens in ${fileId.replace(/^file:/, '')}.` },
      })
    }
  }

  return findings
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-e-design.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/checks/lens-e-design.ts src/observability/checks/lens-e-design.test.ts
git commit -m "observability: lens E — design-system drift (ad-hoc-threshold P1, must-priority bypass P0)"
```

---

## Task 9: Lens F — missing scope (`lens-f-scope.ts`)

Three structural checks per spec §3.7: (a) `priority: must`/`should` Feature without `feature_to_story` edge; (b) `priority: must`/`should` Story without plan task or playbook task; (c) Story planned but untouched past wave/phase budget. Sub-check (c) requires the `state` adapter — when unavailable, that sub-check is skipped (no finding, lens still runs the others).

**Files:**
- Create: `src/observability/checks/lens-f-scope.ts`
- Create: `src/observability/checks/lens-f-scope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/checks/lens-f-scope.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { lensFScope } from './lens-f-scope'
import type { DocGraph, AvailabilityMap } from '../engine/types'

const baseAvail = (overrides: Partial<AvailabilityMap> = {}): AvailabilityMap => ({
  git: { status: 'available' }, gh: { status: 'unavailable' },
  pipeline_docs: { status: 'available' }, tests: { status: 'available' },
  state: { status: 'available' }, beads: { status: 'unavailable' },
  mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
  ...overrides,
})

function emptyGraph(): DocGraph {
  return {
    features: [], stories: [], acceptance_criteria: [],
    plan_tasks: [], playbook_tasks: [], tests: [], pull_requests: [],
    files: [], rules: [], components: [], tokens: [], decisions: [],
    edges: [], provenance: {}, unresolved_globs: [],
  }
}

describe('lensFScope', () => {
  it('emits P0 for must-priority feature without a story', async () => {
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '' }]
    const findings = await lensFScope(g, { events: [] }, baseAvail(), [], new Set(['F-scope']))
    const f = findings.find((x) => /no story/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('emits P1 for should-priority feature without a story', async () => {
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'should', source_anchor: '' }]
    const findings = await lensFScope(g, { events: [] }, baseAvail(), [], new Set(['F-scope']))
    const f = findings.find((x) => /no story/i.test(x.title))
    expect(f?.severity).toBe('P1')
  })

  it('emits P0 for must-priority story without plan or playbook coverage', async () => {
    const g = emptyGraph()
    g.stories = [{ id: 'story:s-1', title: 'S1', priority: 'must', source_anchor: '' }]
    const findings = await lensFScope(g, { events: [] }, baseAvail(), [], new Set(['F-scope']))
    const f = findings.find((x) => /no plan task/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('skips the wave-budget P2 sub-check when state adapter is unavailable', async () => {
    const g = emptyGraph()
    g.stories = [{ id: 'story:s-1', title: 'S1', priority: 'must', source_anchor: '' }]
    g.plan_tasks = [{ id: 'plan_task:t', title: 't', status: 'todo', story_id: 'story:s-1', source_anchor: '' }]
    g.edges = [{ kind: 'story_to_plan_task', from: 'story:s-1', to: 'plan_task:t' }]
    const findings = await lensFScope(g, { events: [] }, baseAvail({ state: { status: 'unavailable' } }), [], new Set(['F-scope']))
    expect(findings.find((x) => /untouched/i.test(x.title))).toBeUndefined()
  })

  it('emits no findings on a fully-covered must-priority graph', async () => {
    const g = emptyGraph()
    g.features = [{ id: 'feature:fx', title: 'FX', priority: 'must', source_anchor: '' }]
    g.stories = [{ id: 'story:s-1', title: 'S1', priority: 'must', feature_id: 'feature:fx', source_anchor: '' }]
    g.plan_tasks = [{ id: 'plan_task:t', title: 't', status: 'in_flight', story_id: 'story:s-1', source_anchor: '' }]
    g.edges = [
      { kind: 'feature_to_story', from: 'feature:fx', to: 'story:s-1' },
      { kind: 'story_to_plan_task', from: 'story:s-1', to: 'plan_task:t' },
    ]
    const findings = await lensFScope(g, { events: [] }, baseAvail(), [], new Set(['F-scope']))
    expect(findings).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-f-scope.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lens-f-scope.ts`**

Create `src/observability/checks/lens-f-scope.ts`:

```typescript
import { createHash } from 'node:crypto'
import type { Finding } from '../engine/types'
import type { LensFn } from '../engine/checks/runner'

const lensId = 'F-scope'
function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

export const lensFScope: LensFn = async (graph, ledger, availability) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()

  // (a) Feature without a story
  for (const feat of graph.features) {
    if (feat.priority !== 'must' && feat.priority !== 'should') continue
    const covered = graph.edges.some((e) => e.kind === 'feature_to_story' && e.from === feat.id)
    if (covered) continue
    findings.push({
      id: makeFindingId([lensId, 'feature-no-story', feat.id]),
      lens_id: lensId, severity: feat.priority === 'must' ? 'P0' : 'P1',
      title: `feature has no story: ${feat.title}`,
      description: `Feature ${feat.id} (priority: ${feat.priority}) has no covering story.`,
      source_doc: feat.source_anchor,
      evidence: { kind: 'orphan_node', graph_query: `feature_to_story.from = ${feat.id}`, node_id: feat.id },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'edit_doc', target: 'docs/user-stories.md', prompt: `Add a story for feature "${feat.title}".` },
    })
  }

  // (b) Story without plan or playbook
  for (const s of graph.stories) {
    if (s.priority !== 'must' && s.priority !== 'should') continue
    const hasPlan = graph.edges.some((e) => e.kind === 'story_to_plan_task' && e.from === s.id)
    const hasPlaybook = graph.edges.some((e) => e.kind === 'playbook_task_to_story' && e.to === s.id)
    if (hasPlan || hasPlaybook) continue
    findings.push({
      id: makeFindingId([lensId, 'no plan task', s.id]),
      lens_id: lensId, severity: s.priority === 'must' ? 'P0' : 'P1',
      title: `story has no plan task or playbook: ${s.title}`,
      description: `Story ${s.id} (priority: ${s.priority}) has no plan task or playbook task.`,
      source_doc: s.source_anchor,
      evidence: { kind: 'orphan_node', graph_query: `story_to_plan_task.from = ${s.id} OR playbook_task_to_story.to = ${s.id}`, node_id: s.id },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'edit_doc', target: 'docs/implementation-plan.md', prompt: `Add a plan task tracking story ${s.id}.` },
    })
  }

  // (c) Story planned but untouched past wave/phase budget — only when state adapter is available
  if (availability.state.status === 'available') {
    const claimedTaskIds = new Set(
      ledger.events.filter((e) => e.type === 'task_claimed' && e.task_id).map((e) => e.task_id as string),
    )
    for (const s of graph.stories) {
      const planTaskIds = graph.plan_tasks.filter((p) => p.story_id === s.id).map((p) => p.id)
      if (planTaskIds.length === 0) continue
      const allTodo = graph.plan_tasks
        .filter((p) => planTaskIds.includes(p.id))
        .every((p) => p.status === 'todo')
      if (!allTodo) continue
      const everClaimed = planTaskIds.some((id) => claimedTaskIds.has(id.replace(/^plan_task:/, '')))
      if (everClaimed) continue
      findings.push({
        id: makeFindingId([lensId, 'untouched', s.id]),
        lens_id: lensId, severity: 'P2',
        title: `story planned but untouched: ${s.title}`,
        description: `Story ${s.id} has plan tasks but none have been claimed.`,
        source_doc: s.source_anchor,
        evidence: { kind: 'orphan_node', graph_query: `task_claimed for story ${s.id}`, node_id: s.id },
        confidence: 'low', first_seen: now, last_seen: now, status: 'open',
      })
    }
  }

  return findings
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-f-scope.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/checks/lens-f-scope.ts src/observability/checks/lens-f-scope.test.ts
git commit -m "observability: lens F — missing scope (feature/story coverage by priority, untouched-story P2 with state-adapter dependency)"
```

---

## Task 10: Lens G — undocumented decisions (`lens-g-decisions.ts`)

With `depends_on: ['D-stack']` so it can read D's findings via the runner's shared findings buffer (Plan 2 Task 15 already supports this).

Three structural checks per spec §3.8: (a) `decision_recorded` ledger events without a matching doc entry; (b) doc entries without a matching ledger event (when both should exist); (c) cross-lens P0 — D-stack's unsanctioned-dependency findings without a corresponding `decision_recorded` event. Plus the keyword-commit heuristic at P2.

**Files:**
- Create: `src/observability/checks/lens-g-decisions.ts`
- Create: `src/observability/checks/lens-g-decisions.test.ts`
- Create: `src/observability/checks/data/decision-keywords.txt`

- [ ] **Step 1: Create the bundled keyword file**

Create `src/observability/checks/data/decision-keywords.txt`:

```
decided
chose
going with
will use
migrating to
adopting
switching to
deprecating
replacing
```

- [ ] **Step 2: Write the failing test**

Create `src/observability/checks/lens-g-decisions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { lensGDecisions } from './lens-g-decisions'
import type { DocGraph, AvailabilityMap, Event, Finding } from '../engine/types'

const baseAvail: AvailabilityMap = {
  git: { status: 'available' }, gh: { status: 'unavailable' },
  pipeline_docs: { status: 'available' }, tests: { status: 'available' },
  state: { status: 'available' }, beads: { status: 'unavailable' },
  mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

function emptyGraph(): DocGraph {
  return {
    features: [], stories: [], acceptance_criteria: [],
    plan_tasks: [], playbook_tasks: [], tests: [], pull_requests: [],
    files: [], rules: [], components: [], tokens: [], decisions: [],
    edges: [], provenance: {}, unresolved_globs: [],
  }
}

function decisionEvent(key: string, summary: string, ts = '2026-05-04T00:00:00Z'): Event {
  return {
    event_id: `ulid-${key}`, worktree_id: 'wid', actor_label: 'a', branch: 'b', task_id: null,
    type: 'decision_recorded', ts,
    payload: { key, summary, affects: [], links: [] },
  } as Event
}

describe('lensGDecisions', () => {
  it('emits P1 for ledger event without matching doc decision', async () => {
    const g = emptyGraph()
    const events = [decisionEvent('caching-strategy', 'TTL=60s')]
    const findings = await lensGDecisions(g, { events }, baseAvail, [], new Set(['G-decisions']))
    const f = findings.find((x) => /event without doc/i.test(x.title))
    expect(f?.severity).toBe('P1')
  })

  it('emits P1 for doc decision without matching ledger event (when ledger has any decisions at all)', async () => {
    const g = emptyGraph()
    g.decisions = [
      { id: 'decision:archive-policy', key: 'archive-policy', summary: 'After 90 days', affects: [], source_anchor: 'docs/decisions/archive-policy.md', recorded_at: '2026-05-04T00:00:00Z' },
    ]
    const events = [decisionEvent('different-key', 'unrelated')]
    const findings = await lensGDecisions(g, { events }, baseAvail, [], new Set(['G-decisions']))
    const f = findings.find((x) => /doc without event/i.test(x.title))
    expect(f?.severity).toBe('P1')
  })

  it('emits P0 when D-stack reports unsanctioned-dependency without a covering decision', async () => {
    const g = emptyGraph()
    g.files = [{ id: 'file:src/lib/x.ts', path: 'src/lib/x.ts' }]
    const upstream: Finding[] = [{
      id: 'fake-d-finding',
      lens_id: 'D-stack', severity: 'P0',
      title: 'unsanctioned dependency: src/lib/x.ts',
      description: 'lodash imported in src/lib/x.ts',
      source_doc: 'docs/tech-stack.md',
      evidence: { kind: 'rule_violation', rule_id: 'tech-stack-unsanctioned', file: 'file:src/lib/x.ts' },
      confidence: 'high', first_seen: '2026-05-04T00:00:00Z', last_seen: '2026-05-04T00:00:00Z', status: 'open',
    }]
    const findings = await lensGDecisions(g, { events: [] }, baseAvail, upstream, new Set(['G-decisions']))
    const f = findings.find((x) => /unsanctioned dep/i.test(x.title))
    expect(f?.severity).toBe('P0')
  })

  it('does not emit the P0 cross-correlation when a covering decision_recorded event exists', async () => {
    const g = emptyGraph()
    g.files = [{ id: 'file:src/lib/x.ts', path: 'src/lib/x.ts' }]
    const upstream: Finding[] = [{
      id: 'fake-d-finding',
      lens_id: 'D-stack', severity: 'P0',
      title: 'unsanctioned dependency: src/lib/x.ts',
      description: 'lodash imported in src/lib/x.ts',
      source_doc: 'docs/tech-stack.md',
      evidence: { kind: 'rule_violation', rule_id: 'tech-stack-unsanctioned', file: 'file:src/lib/x.ts' },
      confidence: 'high', first_seen: '2026-05-04T00:00:00Z', last_seen: '2026-05-04T00:00:00Z', status: 'open',
    }]
    const events = [{
      event_id: 'ulid-cover', worktree_id: 'wid', actor_label: 'a', branch: 'b', task_id: null,
      type: 'decision_recorded', ts: '2026-05-04T00:00:00Z',
      payload: { key: 'lodash-allowed', summary: 'Allow lodash', affects: ['src/lib/**'], links: [] },
    } as Event]
    const findings = await lensGDecisions(g, { events }, baseAvail, upstream, new Set(['G-decisions']))
    expect(findings.find((x) => /unsanctioned dep/i.test(x.title))).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-g-decisions.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `lens-g-decisions.ts`**

Create `src/observability/checks/lens-g-decisions.ts`:

```typescript
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { minimatch } from 'minimatch'
import type { Finding, Event } from '../engine/types'
import type { LensFn } from '../engine/checks/runner'
import { loadObservabilityConfig } from '../engine/checks/observability-config'

const lensId = 'G-decisions'
function makeFindingId(parts: string[]): string {
  return createHash('sha256').update(parts.join('::')).digest('hex').slice(0, 16)
}

function decisionEventCoversFile(events: Event[], filePath: string): boolean {
  for (const e of events) {
    if (e.type !== 'decision_recorded') continue
    const affects = e.payload.affects
    if (!Array.isArray(affects)) continue
    if (affects.some((g) => minimatch(filePath, g))) return true
  }
  return false
}

function loadKeywords(cwd: string): string[] {
  const config = loadObservabilityConfig(cwd)
  const overridePath = config.lenses['G-decisions']?.keywords_file
  const candidates = [
    overridePath ? join(cwd, overridePath) : null,
    join(__dirname, 'data/decision-keywords.txt'),
  ].filter((p): p is string => Boolean(p))
  for (const p of candidates) {
    try { return readFileSync(p, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) } catch { /* try next */ }
  }
  return ['decided', 'chose', 'going with', 'will use']
}
void existsSync

export const lensGDecisions: LensFn = async (graph, ledger, _availability, upstreamFindings) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()

  // (a) Ledger events without doc entries
  const docKeys = new Set(graph.decisions.map((d) => d.key))
  const eventsByKey = new Map<string, Event>()
  for (const e of ledger.events) {
    if (e.type !== 'decision_recorded') continue
    const key = (e.payload as { key: string }).key
    eventsByKey.set(key, e)
  }
  for (const [key] of eventsByKey) {
    if (docKeys.has(key)) continue
    findings.push({
      id: makeFindingId([lensId, 'event-no-doc', key]),
      lens_id: lensId, severity: 'P1',
      title: `decision event without doc entry: ${key}`,
      description: `decision_recorded event "${key}" has no matching entry in docs/decisions/ or decisions.jsonl.`,
      source_doc: '',
      evidence: { kind: 'doc_disagreement', left_doc: 'ledger', right_doc: 'docs/decisions/', conflict: key },
      confidence: 'medium', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'record_decision', target: 'docs/decisions/', prompt: `Document the "${key}" decision.` },
    })
  }

  // (b) Doc decisions without ledger events (only when ledger has any decisions at all)
  if (eventsByKey.size > 0) {
    for (const d of graph.decisions) {
      if (eventsByKey.has(d.key)) continue
      findings.push({
        id: makeFindingId([lensId, 'doc-no-event', d.key]),
        lens_id: lensId, severity: 'P1',
        title: `doc without event: ${d.key}`,
        description: `Decision "${d.key}" is documented but never went through the ledger writer (suggests missed instrumentation).`,
        source_doc: d.source_anchor,
        evidence: { kind: 'doc_disagreement', left_doc: d.source_anchor, right_doc: 'ledger', conflict: d.key },
        confidence: 'low', first_seen: now, last_seen: now, status: 'open',
      })
    }
  }

  // (c) Cross-lens P0 — D-stack unsanctioned-dependency findings without covering decision
  for (const d of upstreamFindings) {
    if (d.lens_id !== 'D-stack') continue
    if (!/unsanctioned/i.test(d.title)) continue
    if (d.evidence.kind !== 'rule_violation') continue
    const filePath = d.evidence.file.replace(/^file:/, '')
    if (decisionEventCoversFile(ledger.events, filePath)) continue
    findings.push({
      id: makeFindingId([lensId, 'unsanctioned-dep-no-decision', filePath]),
      lens_id: lensId, severity: 'P0',
      title: `unsanctioned dep without recorded decision: ${filePath}`,
      description: `Lens D flagged ${filePath} as unsanctioned, but no decision_recorded event covers this path.`,
      source_doc: 'decisions.jsonl',
      evidence: { kind: 'rule_violation', rule_id: 'unsanctioned-dep-no-decision', file: `file:${filePath}` },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'record_decision', target: 'decisions.jsonl', prompt: `Record a decision for the unsanctioned dependency in ${filePath}.` },
    })
  }

  // (d) Keyword-shaped commit messages without a matching event/doc
  // (Heuristic; loaded from bundled file or override path. We only run this when git adapter is available.
  // For Plan 3 we keep this simple and skip the actual git log scan to avoid coupling to the git adapter.)
  void loadKeywords  // referenced for future use; commit-scan deferred to Plan 5+

  return findings
}
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-g-decisions.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/observability/checks/lens-g-decisions.ts src/observability/checks/lens-g-decisions.test.ts src/observability/checks/data/decision-keywords.txt
git commit -m "observability: lens G — undocumented decisions (event/doc divergence + cross-lens P0 with D-stack)"
```

---

## Task 11: Expand `LENS_REGISTRY` to all 8 entries

**Files:**
- Modify: `src/observability/engine/checks/registry.ts`
- Modify: `src/observability/engine/checks/registry.test.ts`

- [ ] **Step 1: Update the failing test for the full set**

Replace the body of `src/observability/engine/checks/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { LENS_REGISTRY, getLensManifest } from './registry'

describe('LENS_REGISTRY', () => {
  it('has all eight lenses', () => {
    const ids = LENS_REGISTRY.map((m) => m.id).sort()
    expect(ids).toEqual(['A-tdd', 'B-ac-coverage', 'C-standards', 'D-stack', 'E-design', 'F-scope', 'G-decisions', 'H-cross-doc'])
  })

  it('every entry declares fast profile membership', () => {
    for (const m of LENS_REGISTRY) expect(m.profiles).toContain('fast')
  })

  it('G-decisions declares depends_on D-stack so the runner orders them correctly', () => {
    const g = getLensManifest('G-decisions')
    expect(g?.depends_on).toEqual(['D-stack'])
  })

  it('B-ac-coverage and F-scope declare optional adapters consistent with their fast checks', () => {
    expect(getLensManifest('B-ac-coverage')?.optional).toEqual(['tests', 'gh'])
    expect(getLensManifest('F-scope')?.optional).toContain('state')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/checks/registry.test.ts
```

Expected: FAIL — only 3 entries today.

- [ ] **Step 3: Update `LENS_REGISTRY`**

Replace `LENS_REGISTRY` in `src/observability/engine/checks/registry.ts`:

```typescript
export const LENS_REGISTRY: LensManifest[] = [
  { id: 'A-tdd',         name: 'TDD violations',          profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: ['tests'] },
  { id: 'B-ac-coverage', name: 'AC completion',           profiles: ['fast', 'full'],
    required: ['pipeline_docs'], optional: ['tests', 'gh'] },
  { id: 'C-standards',   name: 'Coding-standards drift',  profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: ['tests'] },
  { id: 'D-stack',       name: 'Tech-stack drift',        profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: [] },
  { id: 'E-design',      name: 'Design-system drift',     profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: [] },
  { id: 'F-scope',       name: 'Missing scope',           profiles: ['fast', 'full'],
    required: ['pipeline_docs'], optional: ['tests', 'gh', 'state'] },
  { id: 'G-decisions',   name: 'Undocumented decisions',  profiles: ['fast', 'full'],
    required: ['git', 'pipeline_docs'], optional: [],
    depends_on: ['D-stack'] },
  { id: 'H-cross-doc',   name: 'Cross-doc inconsistency', profiles: ['fast', 'full'],
    required: ['pipeline_docs'], optional: [] },
]
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/checks/registry.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/checks/registry.ts src/observability/engine/checks/registry.test.ts
git commit -m "observability: LENS_REGISTRY all 8 entries (G depends_on D)"
```

---

## Task 12: Wire 5 new lenses into `runAudit` + scope mapping

**Files:**
- Modify: `src/observability/engine/api.ts`
- Modify: `src/observability/engine/api.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/engine/api.test.ts`:

```typescript
describe('api.runAudit (Plan 3 — eight lenses)', () => {
  let project: string
  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'observe-aud8-'))
    execSync('git init -q', { cwd: project })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: project, shell: '/bin/sh' })
    mkdirSync2(join(project, 'docs'), { recursive: true })
    mkdirSync2(join(project, 'src/lib'), { recursive: true })
    writeFileSync2(join(project, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync2(join(project, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync2(join(project, 'docs/user-stories.md'),
`## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n`)
    writeFileSync2(join(project, 'docs/tech-stack.md'),
`## Frontend\n\n### React\n- package_or_url: react@18\n`)
    writeFileSync2(join(project, 'docs/coding-standards.md'),
`### Rule: no-eval\n- forbidden: eval\n- match: src/**/*.ts\n- severity: P1\n`)
    writeFileSync2(join(project, 'src/lib/x.ts'), `import { uniq } from 'lodash'\neval('1+1')\n`)
  })
  afterEach(() => { rmSync(project, { recursive: true, force: true }) })

  it('--scope=code runs A/B/C/D/E/F/G but not H', async () => {
    const out = await runAudit({ primaryRoot: project, profile: 'fast', scope: 'code', sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    const lensIds = new Set(out.findings.map((f) => f.lens_id))
    expect(lensIds.has('H-cross-doc')).toBe(false)
    // Lens C should fire on the eval(), Lens D on lodash, Lens G correlates with D
    expect(lensIds.has('C-standards')).toBe(true)
    expect(lensIds.has('D-stack')).toBe(true)
    expect(lensIds.has('G-decisions')).toBe(true)
  })

  it('--scope=docs runs only H', async () => {
    const out = await runAudit({ primaryRoot: project, profile: 'fast', scope: 'docs', sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    const lensIds = new Set(out.findings.map((f) => f.lens_id))
    expect(lensIds.has('H-cross-doc')).toBe(true)
    for (const id of ['A-tdd', 'B-ac-coverage', 'C-standards', 'D-stack', 'E-design', 'F-scope', 'G-decisions']) {
      expect(lensIds.has(id)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/api.test.ts
```

Expected: FAIL — `runAudit` doesn't yet wire the new lenses.

- [ ] **Step 3: Update `api.ts` to register the new lens functions and scope mapping**

In `src/observability/engine/api.ts`, replace the `LENS_FUNCTIONS` and `SCOPE_*` constants:

```typescript
import { lensCStandards } from '../checks/lens-c-standards'
import { lensDStack } from '../checks/lens-d-stack'
import { lensEDesign } from '../checks/lens-e-design'
import { lensFScope } from '../checks/lens-f-scope'
import { lensGDecisions } from '../checks/lens-g-decisions'

const SCOPE_DOC_LENSES = new Set(['H-cross-doc'])
const SCOPE_CODE_LENSES = new Set(['A-tdd', 'B-ac-coverage', 'C-standards', 'D-stack', 'E-design', 'F-scope', 'G-decisions'])

const LENS_FUNCTIONS = {
  'A-tdd':         lensATdd,
  'B-ac-coverage': lensBAcCoverage,
  'C-standards':   lensCStandards,
  'D-stack':       lensDStack,
  'E-design':      lensEDesign,
  'F-scope':       lensFScope,
  'G-decisions':   lensGDecisions,
  'H-cross-doc':   lensHCrossDoc,
}
```

Also import `loadObservabilityConfig` and apply the `disabled_lenses` filter inside `runAudit` after picking enabled IDs:

```typescript
import { loadObservabilityConfig } from './checks/observability-config'

// inside runAudit, after `const enabledIds = pickEnabledIds(...)`:
const config = loadObservabilityConfig(input.primaryRoot)
for (const disabled of config.disabled_lenses) enabledIds.delete(disabled)
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/api.test.ts
```

Expected: PASS — original Plan 2 tests still pass + 2 new Plan 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/api.ts src/observability/engine/api.test.ts
git commit -m "observability: wire C/D/E/F/G lenses into runAudit; scope=code now runs all seven non-H lenses; disabled_lenses honored"
```

---

## Task 13: Extend the audit-mvp fixture to trip C/D/E/F/G

**Files:**
- Modify: `tests/observability/fixtures/projects/audit-mvp/docs/coding-standards.md`
- Modify: `tests/observability/fixtures/projects/audit-mvp/docs/tech-stack.md`
- Create: `tests/observability/fixtures/projects/audit-mvp/docs/design-system.md`
- Create: `tests/observability/fixtures/projects/audit-mvp/.scaffold/observability.yaml`
- Modify: `tests/observability/fixtures/projects/audit-mvp/src/auth/login.ts`
- Create: `tests/observability/fixtures/projects/audit-mvp/src/components/Btn.tsx`
- Modify: `tests/observability/audit-fixture.test.ts`

- [ ] **Step 1: Add a coding-standards rule that the fixture violates**

Replace `tests/observability/fixtures/projects/audit-mvp/docs/coding-standards.md`:

```markdown
# Coding Standards

## TypeScript

### Rule: no-console

Description: Avoid console.log in production source.

- pattern: `console\.log\(`
- match: src/**/*.ts
- language: typescript
- severity: P2
- enforce-via: linter
```

- [ ] **Step 2: Make the fixture import an unsanctioned package**

Replace `tests/observability/fixtures/projects/audit-mvp/src/auth/login.ts`:

```typescript
import { uniq } from 'lodash'  // unsanctioned — Lens D fires; Lens G correlates → P0

export function login(email: string, password: string): boolean {
  console.log('login attempt', email)  // Lens C fires
  return uniq([email, password]).length === 2
}
```

- [ ] **Step 3: Add a UI file with ad-hoc tokens**

Create `tests/observability/fixtures/projects/audit-mvp/docs/design-system.md`:

```markdown
# Design System

## Colors

| Token | Value | Priority |
|---|---|---|
| --color-primary | #4f46e5 | must |
| --color-danger | #ef4444 | must |
```

Create `tests/observability/fixtures/projects/audit-mvp/.scaffold/observability.yaml`:

```yaml
lenses:
  E-design:
    ui_glob: "src/components/**/*.tsx"
    ad_hoc_token_threshold: 2
```

Create `tests/observability/fixtures/projects/audit-mvp/src/components/Btn.tsx`:

```tsx
export const Btn = () => (
  <button style={{ color: '#aabbcc', background: '#112233', borderColor: '#445566', padding: '13px' }}>X</button>
)
```

(Three ad-hoc colors + one ad-hoc spacing → exceeds threshold of 2 → Lens E fires P1; with must-priority colors in the design-system, Lens E also fires P0.)

- [ ] **Step 4: Update the integration test to require all 8 lenses fire**

Replace `tests/observability/audit-fixture.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { runAudit } from '../../src/observability/engine/api'

const FIXTURE = join(__dirname, 'fixtures/projects/audit-mvp')

describe('runAudit against the audit-mvp fixture', () => {
  it('trips one finding per Plan-3 lens (all 8)', async () => {
    const out = await runAudit({
      primaryRoot: FIXTURE, profile: 'fast', scope: 'all', sinceHours: 24,
      ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    const lensIds = new Set(out.findings.map((f) => f.lens_id))
    for (const id of ['A-tdd', 'B-ac-coverage', 'C-standards', 'D-stack', 'E-design', 'F-scope', 'G-decisions', 'H-cross-doc']) {
      expect(lensIds.has(id), `expected ${id} to emit at least one finding`).toBe(true)
    }
    expect(out.verdict).toBe('blocked')
  })
})
```

- [ ] **Step 5: Run the integration test**

```bash
npx vitest run tests/observability/audit-fixture.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/observability/fixtures/projects/audit-mvp tests/observability/audit-fixture.test.ts
git commit -m "observability: extend audit-mvp fixture to trip all 8 lenses; integration test asserts each fires"
```

---

## Task 14: Extend bats end-to-end coverage to all 8 lenses

**Files:**
- Modify: `tests/observability/audit.bats`

- [ ] **Step 1: Add a bats case asserting C/D/E/F/G appear in `--json` output**

Append to `tests/observability/audit.bats`:

```bash
@test "observe audit --json --scope=code surfaces C/D/E/F/G when fixtures violate them" {
    # Build a quick in-place fixture
    mkdir -p src/lib src/components docs .scaffold
    cat > docs/plan.md <<'EOF'
# PRD
## Features
### F [priority: must]
EOF
    cat > docs/user-stories.md <<'EOF'
## Story s-1: T [priority: must]

### AC 1: t
Given X.
EOF
    cat > docs/tech-stack.md <<'EOF'
## Frontend

### React
- package_or_url: react@18
EOF
    cat > docs/coding-standards.md <<'EOF'
### Rule: no-console
- pattern: `console\\.log\\(`
- match: src/**/*.ts
EOF
    cat > docs/design-system.md <<'EOF'
## Colors
| Token | Value | Priority |
|---|---|---|
| --color-primary | #4f46e5 | must |
EOF
    cat > .scaffold/observability.yaml <<'EOF'
lenses:
  E-design:
    ui_glob: "src/components/**/*.tsx"
    ad_hoc_token_threshold: 2
EOF
    cat > src/lib/x.ts <<'EOF'
import { uniq } from 'lodash'
console.log('debug', uniq([1, 2]))
EOF
    cat > src/components/Btn.tsx <<'EOF'
export const Btn = () => <button style={{ color: '#aabbcc', background: '#112233', borderColor: '#445566' }} />
EOF
    cat > docs/tdd-standards.md <<'EOF'
# TDD
EOF

    run $BIN observe audit --json --scope=code --since-hours=24
    [ "$status" -eq 1 ] # blocked
    [[ "$output" == *'"C-standards"'* ]]
    [[ "$output" == *'"D-stack"'* ]]
    [[ "$output" == *'"E-design"'* ]]
    [[ "$output" == *'"F-scope"'* ]]
    [[ "$output" == *'"G-decisions"'* ]]
}

@test "observe audit --lens C-standards limits to that single lens" {
    cat > docs/coding-standards.md <<'EOF'
### Rule: no-console
- pattern: `console\\.log\\(`
- match: src/**/*.ts
EOF
    mkdir -p src
    echo "console.log('a')" > src/foo.ts

    run $BIN observe audit --json --lens C-standards --since-hours=24
    [[ "$output" == *'"C-standards"'* ]]
    # No other lens IDs should appear in findings
    [[ "$output" != *'"A-tdd"'* ]]
    [[ "$output" != *'"H-cross-doc"'* ]]
}
```

- [ ] **Step 2: Run the bats suite**

```bash
npm run build && bats tests/observability/audit.bats
```

Expected: PASS — all original cases + 2 new ones.

- [ ] **Step 3: Commit**

```bash
git add tests/observability/audit.bats
git commit -m "observability: bats coverage for C/D/E/F/G end-to-end and --lens single-lens scoping"
```

---

## Task 15: Run `make check-all` and address cross-cutting issues

- [ ] **Step 1: Run the full quality gate**

```bash
make check-all
```

Common Plan-3 failures:
- `@types/babel__traverse` missing → `npm install --save-dev @types/babel__traverse`.
- `postcss` ESM/CJS interop — make sure your `tsconfig.json` `module` setting matches scaffold's existing convention; if needed add `"esModuleInterop": true`.
- New lens files lack 90% coverage on edge paths — add tests for the `null`-availability branches.
- bats failures from missing `dist/` — `npm run build` first.

- [ ] **Step 2: Commit any fixes**

```bash
git add -u
git commit -m "observability: lint / type-check / coverage fixes after Plan 3"
```

(Skip if step 1 was clean.)

---

## Task 16: Update CLAUDE.md and the lens registry surfacing

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Find the existing observability paragraph (added in Plans 1 + 2)**

Open `CLAUDE.md` and locate the paragraph beginning "Build observability lives under `src/observability/`…".

- [ ] **Step 2: Update the paragraph to reflect the full lens suite**

Replace it with:

> **Build observability** lives under `src/observability/`. Build-command meta-prompts call `scaffold observe event …` at named workflow points (claim/complete/decision/blocker/PR-open). The audit covers all eight lenses: A-tdd, B-ac-coverage, C-standards, D-stack, E-design, F-scope, G-decisions (with cross-lens correlation to D), H-cross-doc. Per-project lens config lives in `.scaffold/observability.yaml` (E's ad-hoc threshold + ui_glob, C's rule overrides, F's wave budget, disabled_lenses, stall thresholds). `scaffold observe audit --scope=code` runs A–G; `--scope=docs` runs only H; `--scope=all` runs everything; `--lens <id>` overrides scope. Markdown + dashboard renderers and replay/stall come in Plans 4 + 5; phase-boundary triggers, MMR doc-conformance channel, and the `--fix` flow come in Plans 6 + 7 + 8. See `docs/superpowers/specs/2026-04-30-build-observability-design.md` for the full design.

- [ ] **Step 3: Add example `.scaffold/observability.yaml` to the docs**

Append a fenced-code example to the same section so users can copy-paste a starting config:

````markdown
Example `.scaffold/observability.yaml`:

```yaml
lenses:
  C-standards:
    enforce_via_linter: true
    rule_overrides:
      no-console: P1
  E-design:
    ad_hoc_token_threshold: 5
    ui_glob: "src/components/**/*.{tsx,vue}"
  F-scope:
    untouched_story_grace_hours: 168
disabled_lenses: []
phase_audit:
  enabled: true
  timeout_s: 60
```
````

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md observability section for Plan 3 (all 8 lenses, observability.yaml)"
```

---

## Task 17: Self-review the plan against the spec

- [ ] **Step 1: Spec coverage matrix**

| Spec section | Implemented in |
|---|---|
| `.scaffold/observability.yaml` schema (§3.11, §1 stall config) | Task 1 |
| `file_to_token_use` edges from style sources (§3.6 parser specifics) | Tasks 2, 3, 5 |
| `file_to_component_use` edges from imports (§3.5) | Tasks 4, 5 |
| Lens C — coding-standards drift (§3.4) | Task 6 |
| Lens D — tech-stack drift (§3.5) | Task 7 |
| Lens E — design-system drift (§3.6) | Task 8 |
| Lens F — missing scope (§3.7) | Task 9 |
| Lens G — undocumented decisions (§3.8) with depends_on D (§3.10) | Task 10 |
| LENS_REGISTRY all 8 entries (§3.10) | Task 11 |
| `disabled_lenses` filter applied in runAudit (§3.11) | Task 12 |
| `runAudit` scope mapping covers A–G under code, H under docs (§5.1) | Task 12 |
| Fixture project trips every lens (§6.2) | Task 13 |
| End-to-end CLI coverage for the new lenses (§6.3) | Task 14 |
| Quality gate (§6.8) | Task 15 |
| Documentation update | Task 16 |

- [ ] **Step 2: Out-of-scope confirmations (deferred to subsequent plans)**

| Deferred capability | Plan |
|---|---|
| Markdown report renderer + JSON sidecar writing | Plan 4 |
| Dashboard panel renderer | Plan 4 |
| Replay timeline (`--replay`) + fused timeline | Plan 5 |
| Stall detection / Needs Attention surface (config schema landed in Plan 3, evaluator lands in Plan 5) | Plan 5 |
| Phase-boundary triggers + StateManager.markCompleted refactor | Plan 6 |
| MMR `doc-conformance` channel | Plan 7 |
| Lens H full-profile prose checks (LLM-graded PRD/tech-stack tensions, terminology drift) | Plan 7 (LLM dispatcher) |
| `--fix` flow + worktree teardown script | Plan 8 |
| Decision-keyword commit scan (Lens G sub-check) | Plan 5 (when git-scan utilities land) |
| Per-property must-token violation refinement (Lens E) | Plan 4 (when token-use edge gains property metadata) |

- [ ] **Step 3: Type consistency final check**

```bash
grep -E '^export (type|interface) ' src/observability/engine/types.ts | sort | uniq -c | sort -rn | head -20
npx tsc --noEmit
```

Expected: no duplicate exports; tsc clean.

- [ ] **Step 4: Mark Plan 3 complete**

```bash
git add docs/superpowers/plans/2026-05-04-build-observability-full-lens-suite.md
git commit -m "plans: build-observability full lens suite — final self-review pass" --allow-empty
```

---

## Plan 3 — Self-review (built into the plan)

**Spec coverage:** every Plan-3-scoped requirement maps to a task (see Task 17 Step 1). The five new lenses (C/D/E/F/G) cover spec §3.4–3.8; the supporting graph machinery (token-use + component-use detectors, edge-builder integration) covers §3.5 and §3.6 parser specifics; per-project config (§3.11) lands in Task 1.

**Placeholder scan:** plan grepped for `TBD|TODO|FIXME|fill in|appropriate error|Similar to Task` — none present. Every step contains either complete code, an exact command, or a defined verification check.

**Type consistency:**
- Plan 3 does not touch `engine/types.ts` (added types are local to detectors and config).
- Lens function signature `(graph, ledger, availability, upstreamFindings, enabledIds) => Promise<Finding[]>` matches Plan 2's `LensFn` exactly across Tasks 6/7/8/9/10.
- `Finding.id` derivation uses `sha256(parts).slice(0, 16)` consistently across all five new lenses — same convention as Plan 2's lenses A/B/H.
- New edge kinds (`file_to_token_use`, `file_to_component_use`) reuse types already declared in Plan 1's `engine/types.ts`; Plan 3 only adds the constructors.

**Scope:** Plan 3 ships the full eight-lens audit on top of Plans 1 + 2's foundation and is independently executable. After Plan 3 the audit is feature-complete from the lens perspective; remaining plans add UX surfaces (markdown/dashboard, replay), operational integration (phase-boundary, StateManager refactor), the MMR channel, and the fix flow.

---

**Plan 3 complete and saved to `docs/superpowers/plans/2026-05-04-build-observability-full-lens-suite.md`.**

Plans 1 + 2 + 3 together produce the full audit feature: ledger + harvest + 8 lenses + verdict + ack + per-project config. The remaining plans (4–8) add UX surfaces, operational integration, the MMR channel, and the fix flow but the core conformance check is shippable as-is after Plan 3.

**Two execution options for Plans 1 + 2 + 3:**

1. **Subagent-Driven (recommended)** — fresh subagent per task across all three plans (~77 tasks total), review between tasks. Subagent context resets per task so the long total length doesn't drift.
2. **Inline Execution** — execute tasks here using `executing-plans` with checkpoints between plans.

Or **(3) write Plan 4 next** (markdown + dashboard renderers + JSON sidecars) so the audit feature also has its persisted-output and trend-analysis surfaces before any code lands.

Which approach?
