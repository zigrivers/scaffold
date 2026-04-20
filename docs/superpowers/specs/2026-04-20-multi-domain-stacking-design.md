# Multi-Domain Stacking Design

**Goal**: Let project-type `domain` fields accept an array so multiple domain sub-overlays stack on a single project. Example: `backendConfig.domain: ['fintech', 'climate']` loads both `backend-fintech.yml` and `backend-climate.yml`, merging their knowledge in declaration order.

**Prerequisites**: v3.17.0 (backend-fintech sub-overlay pattern shipped). Sub-overlay loader (`loadSubOverlay`) already enforces the knowledge-only constraint that this design preserves.

**Scope**: ~80–120 LOC production + ~200 LOC tests. The feature is mostly a small change inside `overlay-state-resolver.ts` (iterate a list instead of one value) plus a schema widening to accept arrays.

---

## Section 1 — Schema changes

**Pattern: union with three branches, no `.transform()`, default `'none'`.**

```typescript
// src/config/schema.ts

// Domain value enums — 'none' is NOT in the "real" list.
// It is explicitly a separate literal in the union so it cannot appear
// inside an array (rejected at parse time with a clear enum error).
const backendRealDomains = ['fintech'] as const
const researchRealDomains = ['quant-finance', 'ml-research', 'simulation'] as const

/**
 * Build the domain field for a project-type config.
 *
 * Accepts three shapes:
 *   - 'none' (literal string — explicit no-domain)
 *   - a single real domain string (e.g. 'fintech')
 *   - a non-empty array of real domain strings (e.g. ['fintech', 'climate'])
 *
 * DO NOT add `.transform()`. Transforming would change the Zod output type
 * from `string | string[]` to `string[]`, which breaks all existing
 * write-sites (wizard, CLI flags, detector) that assign single strings into
 * `BackendConfig['domain']`. See spec §3 for the consumer audit.
 */
function domainField<T extends readonly [string, ...string[]]>(realValues: T) {
  return z.union([
    z.literal('none'),
    z.enum(realValues),
    z.array(z.enum(realValues)).min(1),
  ]).default('none')
}

export const BackendConfigSchema = z.object({
  // ... existing fields ...
  domain: domainField(backendRealDomains),
}).strict()

export const ResearchConfigSchema = z.object({
  // ... existing fields ...
  domain: domainField(researchRealDomains),
}).strict()
```

### 1.1 Accepted and rejected input shapes

| Input YAML | Parse result |
|---|---|
| `domain: 'fintech'` | Valid — string |
| `domain: 'none'` | Valid — string literal |
| `domain: ['fintech']` | Valid — single-element array |
| `domain: ['fintech', 'climate']` | Valid — multi-element array (once `'climate'` enum-added) |
| `domain:` (absent) | Defaults to `'none'` via `.default()` |
| `domain: []` | **Rejected** — `.min(1)` violation |
| `domain: ['none']` | **Rejected** — `'none'` not in array-branch enum |
| `domain: ['none', 'fintech']` | **Rejected** — first element fails enum |
| `domain: 'climate'` (unknown) | **Rejected** — string branch uses full enum |
| `domain: null` | **Rejected** — union not nullable |

### 1.2 Inferred TypeScript types

```typescript
// BackendConfig['domain']:
'none' | 'fintech' | Array<'fintech'>

// ResearchConfig['domain']:
'none' | 'quant-finance' | 'ml-research' | 'simulation'
  | Array<'quant-finance' | 'ml-research' | 'simulation'>
```

Note: the array branch's element enum excludes `'none'`. This shape matches the Zod definition exactly.

### 1.3 No `.transform()` — why the schema emits a union type

`.transform(v => Array.isArray(v) ? v : [v])` would normalize the output type to `string[]` and be tempting. It would break every write-site in the codebase:
- `wizard/questions.ts:249,258,516,528` assigns `domain: 'fintech'` (string) into `BackendConfig['domain']`
- `cli/init-flag-families.ts:425,537` same pattern
- `project/detectors/research.ts:157` same pattern
- Six test files make string-equality assertions against `.domain`

With `.transform()`, `BackendConfig['domain']` becomes `string[]`, and those assignments become type errors.

**Decision**: keep the schema output as the pre-transform union. Do normalization at the one read-site that needs an array (the resolver). The helper comment above documents this invariant so a future maintainer doesn't "simplify" it.

---

## Section 2 — Resolver changes

The existing block at `overlay-state-resolver.ts:97-125` changes to iterate over a normalized domain list. The rest of `resolveOverlayState` is untouched.

### 2.1 Replacement block

```typescript
const TYPE_DOMAIN_CONFIG: Partial<Record<string, string>> = {
  'research': 'researchConfig',
  'backend': 'backendConfig',
  // Future types with domain support can be added here
}

const domainConfigKey = TYPE_DOMAIN_CONFIG[projectType]
if (domainConfigKey) {
  const typeConfig = config.project?.[domainConfigKey] as Record<string, unknown> | undefined
  const rawDomain = typeConfig?.['domain'] as string | string[] | undefined
  const domains = normalizeDomains(rawDomain, output, `${domainConfigKey}.domain`)
  for (const domain of domains) {
    const subOverlayPath = path.join(methodologyDir, `${projectType}-${domain}.yml`)
    if (!fs.existsSync(subOverlayPath)) continue  // packaging-integrity test is backstop
    const { overlay: subOverlay, errors: subErrors, warnings: subWarnings } =
      loadSubOverlay(subOverlayPath)
    for (const err of subErrors) output.warn(`[${err.code}] ${err.message}`)
    for (const w of subWarnings) output.warn(w)
    if (subOverlay) {
      for (const [step, overrides] of Object.entries(subOverlay.knowledgeOverrides ?? {})) {
        if (step in overlayKnowledge) {
          const toAppend = overrides.append ?? []
          // Append + dedup preserving first-occurrence order, matching the
          // existing applyOverlay contract (overlay-resolver.ts:97-100). The
          // prior single-domain code in this block did a plain append without
          // dedup — multi-domain stacking exposes that drift as visible
          // duplication when two overlays append the same knowledge entry.
          overlayKnowledge[step] = [...new Set([...overlayKnowledge[step], ...toAppend])]
        }
        // else: sub-overlay references a step not in the pipeline — silently skip
        // (common when domain overlays target optional steps that aren't enabled)
      }
    }
  }
}
```

### 2.2 `normalizeDomains` helper

Colocated in the same file (pure, deterministic, no I/O):

```typescript
function normalizeDomains(
  raw: string | string[] | undefined,
  output: OutputContext,
  configKeyForMessages: string,
): string[] {
  if (raw === undefined || raw === 'none') return []
  const arr = Array.isArray(raw) ? raw : [raw]
  // Schema already rejects 'none' inside arrays (§1.1), so no 'none' filter
  // is needed here. The resolver trusts the Zod-parsed shape.
  const deduped = [...new Set(arr)]
  if (deduped.length !== arr.length) {
    const dupes = [...new Set(arr.filter((d, i) => arr.indexOf(d) !== i))]
    output.warn(
      `Duplicate domain(s) in ${configKeyForMessages}: ${dupes.join(', ')} — deduplicated`,
    )
  }
  return deduped
}
```

### 2.3 Behavioral invariants

- **Order = declaration order.** Iteration follows `normalizeDomains`' output order, which preserves the user-declared array order through `Set` (Set preserves insertion order in JS).
- **First-occurrence dedup.** `['fintech', 'climate', 'fintech']` → `['fintech', 'climate']`.
- **Dedup within step knowledge.** Applied per-step on each sub-overlay merge, not just across the final result. Matches `applyOverlay`'s existing contract.
- **One domain's failure doesn't block others.** A missing file, malformed YAML, or empty overlay for domain A does not prevent domains B and C from loading.
- **Silent-skip for missing files.** Matches current single-domain behavior. Packaging-integrity test (§5.3) is the backstop.

### 2.4 Formal merge semantics

For a configured domain list `[D1, D2, ..., Dn]`, the resulting `overlayKnowledge[step]` is equivalent to:
```
merge(merge(...(merge(base, D1), D2)..., Dn-1), Dn)
```
where `merge(prev, Di) = [...new Set([...prev, ...Di.knowledgeOverrides[step]?.append ?? []])]`.

This is associative only up to first-occurrence ordering. Two permutations of the domain list produce the same *set* of knowledge entries but potentially different orderings within each step's array.

---

## Section 3 — Type impact and consumer audit

### 3.1 Inferred types (post-change)

```typescript
BackendConfig['domain']: 'none' | 'fintech' | Array<'fintech'>
ResearchConfig['domain']: 'none' | 'quant-finance' | 'ml-research' | 'simulation'
  | Array<'quant-finance' | 'ml-research' | 'simulation'>
```

### 3.2 Consumer audit

| Site | Usage | Impact |
|---|---|---|
| `overlay-state-resolver.ts:106` | reads `.domain` semantically | **Rewritten** per §2 |
| `wizard/questions.ts:249,258,516,528` | writes string to `BackendConfig['domain']` | No change — string still assignable to union |
| `cli/init-flag-families.ts:425,537` | writes string cast to `BackendConfig['domain']` | No change |
| `project/detectors/research.ts:157` | writes string | No change |
| `e2e/project-type-overlays.test.ts:1651` | `domain: partial.domain ?? 'none'` | No change — string fallback still valid |
| `config/schema.test.ts:440,448` | asserts `.toBe('fintech')` | No change — existing string-shape configs still parse as string |
| `cli/commands/adopt.cli-flags.test.ts:214` | asserts `.toBe('fintech')` | No change |
| `wizard/questions.test.ts:583,610,624,642,953,973` | asserts `.toBe('<string>')` | No change |
| `wizard/copy/backend.ts`, `wizard/copy/research.ts` | string-to-copy maps | No change — invariant of schema shape |

**Net type impact**: zero breaking changes. Every existing write-site assigns a string; strings satisfy the union. Every existing test asserts string equality against configs that still parse as strings.

### 3.3 Narrowing implications

Existing `if (domain === 'fintech')` branches remain reachable on the string side of the union. A new `if (Array.isArray(domain))` branch becomes reachable for configs that use the array shape. No current consumer performs array checks — this matters only if a second consumer is added (out of scope for v1). If that happens, export `normalizeDomains` from the resolver module and reuse; don't duplicate the logic.

### 3.4 Serialization round-trip

No `.transform()` means YAML parse preserves the user's shape. `yaml.dump(parseConfig(config).data)` round-trips both `domain: 'fintech'` and `domain: ['fintech', 'climate']` losslessly. Round-trip tests in §5.1 verify this.

---

## Section 4 — Error handling and validation

### 4.1 Schema-level (Zod)

All invalid inputs (§1.1 rejection rows) surface through the existing `parseConfig` path at `src/config/parseConfig.ts:79-94`, which maps Zod issues into `FIELD_INVALID_VALUE` errors. No new error category. Error messages include the field path (e.g., `backendConfig.domain`) so users can locate the problem.

### 4.2 Resolver-level warnings

| Situation | Behavior |
|---|---|
| Duplicate domains in array | Warn with `${domainConfigKey}.domain` context, continue with deduped list |
| Sub-overlay file missing | Silent-skip (matches current single-domain behavior) |
| Sub-overlay YAML malformed | Existing `loadSubOverlay` errors surfaced via `output.warn`, that overlay skipped, iteration continues |
| Sub-overlay references step not in pipeline | Silent-skip (matches current behavior) |
| Sub-overlay declares non-knowledge sections (step/reads/deps/cross-reads) | Existing `SUB_OVERLAY_NON_KNOWLEDGE` warning from `loadSubOverlay`; sections stripped |

### 4.3 Invariants preserved

- Missing overlay files never halt execution.
- Malformed overlay YAML warns and skips that overlay only.
- Individual domain failures do not block other domains from loading.
- Single-domain configs (`domain: 'fintech'`) produce identical behavior to before this change, modulo the new dedup-on-append fix in §2.1.

---

## Section 5 — Testing plan

### 5.1 Unit — schema

Add to `src/config/schema.test.ts`:

1. Parses `domain: 'fintech'` as string (existing — keep).
2. Parses `domain: 'none'` as string (existing — keep).
3. Parses `domain: ['fintech']` as single-element array.
4. Parses `domain: ['quant-finance', 'ml-research']` on research config as two-element array.
5. **Rejects** `domain: []` with `.min(1)` error.
6. **Rejects** `domain: ['none']` — `'none'` not in array enum.
7. **Rejects** `domain: ['none', 'fintech']` — first element fails enum.
8. **Rejects** `domain: 'climate'` (unknown value).
9. **Rejects** `domain: null`.
10. Round-trip: YAML-parse `domain: 'fintech'`, serialize, re-parse → same string.
11. Round-trip: YAML-parse `domain: ['fintech']`, serialize, re-parse → same array.

### 5.2 Unit — `normalizeDomains` helper

New tests in `src/core/assembly/overlay-state-resolver.test.ts`:

12. `undefined` → `[]`, no warning.
13. `'none'` → `[]`, no warning.
14. `'fintech'` → `['fintech']`, no warning.
15. `['fintech']` → `['fintech']`, no warning.
16. `['fintech', 'climate']` → `['fintech', 'climate']` — order preserved.
17. `['fintech', 'fintech']` → `['fintech']` — deduped + warn.
18. `['a', 'b', 'a']` → `['a', 'b']` — first-occurrence dedup.
19. Warning message contains the literal config key passed in (e.g., `'backendConfig.domain'`).

### 5.3 Integration — resolver with multi-domain

Using **real** research sub-overlays (`research-quant-finance.yml`, `research-ml-research.yml`):

20. `domain: ['quant-finance', 'ml-research']` merges both overlays' knowledge. Assert **exact arrays** on `tech-stack` and `tdd` target steps, not just containment.
21. Declaration order matters: `['quant-finance', 'ml-research']` vs reversed produces knowledge arrays in different orders on shared steps.
22. Mixed merge: core overlay provides `['core-a']`, domain A appends `['a', 'shared']`, domain B appends `['shared', 'b']` → expected `['core-a', 'a', 'shared', 'b']` (proves first-occurrence dedup across core + two sub-overlays).
23. Missing sub-overlay at runtime → silent-skip, test passes without warnings emitted.
24. String form still works: `domain: 'fintech'` resolves identically to `['fintech']` (invariant check).

**Fixture sub-overlays** (only for contrived collision cases not covered by production overlays):
Create `tests/fixtures/methodology/backend-fake-a.yml` and `backend-fake-b.yml` — each appends an overlapping knowledge doc to the same test-pipeline step — used for test 22. Do not add to production `content/methodology/`.

### 5.4 Packaging-integrity

New file `tests/packaging/domain-overlay-alignment.test.ts`:

25. For every non-`'none'` value in `BackendConfigSchema`'s domain enum, `content/methodology/backend-{value}.yml` exists and is a readable YAML file.
26. Same for `ResearchConfigSchema`.

This test catches the class of packaging bugs that the retracted D5b warning was trying to catch at runtime — earlier, deterministically, and with zero runtime cost.

### 5.5 E2E

No new E2E tests. Multi-domain doesn't surface in CLI output, dashboard, or prompt-assembly beyond the knowledge-merge result, and that path is already exercised by the resolver integration tests (§5.3).

### 5.6 Assertion style

All tests in §5.2, §5.3 use **exact-array equality** (`toEqual`) rather than `toContain`. Containment would pass a suite where merge ordering is subtly wrong.

---

## Section 6 — Out of scope

Explicitly deferred to future work:

1. **Lifting the knowledge-only constraint on sub-overlays.** Sub-overlays cannot declare step/reads/dependency/cross-reads overrides today (enforced by `loadSubOverlay`). Multi-domain stacking preserves this constraint. Lifting it is a separate design with its own conflict-resolution questions (enabled-flag disagreement, cross-reads cascade).
2. **Domain-manifest metadata** (`incompatible_with`, `priority`). No real-world driver today. YAGNI.
3. **Wizard multi-select for domains.** Wizard stays single-select in v1. Users who want multi-domain must hand-edit `.scaffold/config.yml`. Adding wizard multi-select requires UX design (how does select-many render? what does the flag form `--backend-domain` look like?).
4. **CLI flag multi-value parsing.** `--backend-domain=fintech,climate` or repeated `--backend-domain` flags. Needs design in `init-flag-families.ts`.
5. **Knowledge provenance / attribution.** No tracking of which domain contributed which knowledge entry. If a logging/diagnostic consumer ever needs this, it's a separate feature with its own design.
6. **Automatic cross-service invalidation for domain changes.** Same rationale as the v3.17.0 out-of-scope list — multi-service independence is preserved.
7. **Exporting `normalizeDomains` as a public helper.** YAGNI for v1 (one consumer). Can be exported trivially when a second caller appears.

---

## Section 7 — Migration and backward compatibility

### 7.1 Config file compat

All existing `.scaffold/config.yml` files parse unchanged:
- `domain: 'fintech'` → parsed as string (union's string branch).
- `domain: 'none'` → parsed as string literal.
- `domain: 'quant-finance'` etc. → parsed as string.
- Absent domain field → defaults to `'none'`.

No migration step needed. No `configVersion` bump required.

### 7.2 Runtime behavior delta for single-domain users

One semantic change affects single-domain users:
- **New**: sub-overlay knowledge merge is now append+dedup (`new Set`), matching the documented `applyOverlay` contract.
- **Before**: plain append without dedup.

This was a latent bug — overlaps between core-overlay knowledge and sub-overlay knowledge would produce duplicated entries in the assembled prompt. Unlikely to have been observable in practice (single-domain backend-fintech overlay doesn't declare knowledge that overlaps with `backend-overlay.yml`), but the CHANGELOG should note the fix so users who noticed duplicated knowledge entries can match the fix to their symptoms.

### 7.3 Deprecations

None. No fields removed, no enum values changed, no YAML syntax deprecated.

---

## Section 8 — Size estimate

| Artifact | LOC |
|---|---|
| Schema changes (3-way union + helper) | ~20 production + ~50 tests |
| Resolver changes (normalize helper + loop rewrite) | ~35 production + ~100 tests |
| Packaging-integrity test | ~20 tests |
| Fixture sub-overlays (2 × ~8 lines) | ~16 fixtures |
| CHANGELOG / roadmap updates | ~20 docs |
| **Total** | **~80–120 production, ~200 tests** |

---

## Release

Feature ships as **v3.21.0**. Release workflow per `docs/architecture/operations-runbook.md`:

1. Feature PR: `feat(overlays): multi-domain stacking — <summary> (v3.21.0)`
2. 3-channel PR MMR (Codex + Gemini + Claude compensating), fix all P0/P1/P2 findings
3. Merge feature PR on `pass` or `degraded-pass` only
4. Release-prep branch: bump `package.json` + `package-lock.json` to 3.21.0, CHANGELOG entry, move roadmap entry from Phase 2 → Completed Releases
5. Merge release-prep PR after CI green
6. Tag `v3.21.0`, push tag, create GitHub release
7. Verify `npm view @zigrivers/scaffold version` returns `3.21.0` and `brew info scaffold` reflects `3.21.0`
