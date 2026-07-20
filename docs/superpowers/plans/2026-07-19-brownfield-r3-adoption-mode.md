# Brownfield R3 — Adoption Mode & Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship R3 / Tier B of the brownfield adoption design (`docs/superpowers/specs/2026-07-19-brownfield-adoption-design.md`): D10 (the `artifact_map` in `.scaffold/config.yml` that lets incumbent docs satisfy steps, the ingestion framework generalizing R2's gate seeding, and the `map-candidate` disposition joining the adoption plan with its payload inside `plan_key`) and D11's content half (a third assembly mode `adoption` alongside fresh/update, a global adoption-mode preamble injected from `content/modes/adoption.md`, per-step `## Adoption Mode Specifics` blocks for the initial 18 steps, and knowledge-loader sensitivity that appends a new `brownfield-adoption` knowledge entry for adoption-mode steps — the assembly/knowledge read-side of `init-mode`).

**Architecture:** The mode decision is centralized in a new `resolveAssemblyMode()` in `src/core/assembly/update-mode.ts`, which wraps the existing `detectUpdateMode()` and implements the spec's D3 matrix. `scaffold run` (src/cli/commands/run.ts) calls it instead of `detectUpdateMode` directly, threads the resolved mode into `AssemblyEngine.assemble()` (which injects the adoption preamble into the Instructions section, following the existing `reworkFix` precedent), and appends the brownfield knowledge entry to the step's knowledge names via a pure helper in `knowledge-loader.ts`. The `artifact_map` read-side lives in three places: config schema/validation (`src/config/`), completion verification (`src/state/completion.ts` — R1's D3 module gains a mapped-artifact substitute for the all-outputs check), and update-mode prior-artifact resolution (a mapped incumbent stands in as `existingArtifact`). The write-side (`map-candidate` proposal → plan → approved apply) extends R1's adoption-plan renderer and apply path, fed by a new `src/ingestion/` module that generalizes R2's gate-seed parsing into a reusable incumbent inventory. Content blocks are pure markdown additions guarded by a new grep-based eval.

**Tech Stack:** TypeScript (vitest, colocated `*.test.ts`), zod (config schema), `yaml` `parseDocument` (config AST edits), bats (`tests/evals/*.bats` grep-based content evals), GNU Make (`make check-all` gate).

## Global Constraints

These are pinned by the approved spec — do not re-litigate during implementation.

- **Mode resolution matrix (D3):** a step whose prior scaffold completion survives with `verification: 'verified' | 'declared'` runs in **update** mode; a step with **no surviving completion** (`status !== 'completed'`) runs in **adoption** mode when `state['init-mode']` is `'brownfield'` or `'v1-migration'`; **else fresh**. A completed step whose `verification` is `'unverified'` is neither update (not verified/declared) nor adoption (completion survives) → fresh. `conflict` never reaches assembly as `completed` — R1's apply reopens conflicted steps to `pending`/`unverified`, so they resolve to adoption mode in a brownfield project (the spec's "reopened false completion correctly enters adoption mode").
- **Greenfield semantics are unchanged (spec non-goal).** Post-R1, `markCompleted` produces `declared` for any step with outputs (the migrated `artifacts_verified: true` semantics), so the matrix reproduces today's update-mode behavior for greenfield projects. Defensively, a completed entry missing the `verification` field entirely is treated as `'declared'` (R1's on-load migration makes this unreachable in practice; the default preserves pre-R1 behavior if it is ever hit).
- **Adoption preamble principles (D11), verbatim intent:** read the repo first; extract facts with evidence; interview only for intent gaps; never propose rewrites of working code. Plus the D10b translation rule: translate incumbents with provenance annotations; **list what cannot translate rather than guessing**.
- **`artifact_map` (D10a):** `.scaffold/config.yml` key `artifact_map` (snake_case, exactly as the spec pins it — the rest of config is camelCase; do not "normalize" it) maps a step slug to one existing project-root-relative artifact path (`coding-standards: CONTRIBUTING.md`). D3 verification honors mapped artifacts: an existing mapped file satisfies the all-outputs requirement (the `detect:` contract, when declared, still must pass — mapping never bypasses detect). In update mode the mapped incumbent is the step's prior artifact **only as a fallback** — the step's own produced artifact wins when both exist. Mappings are proposed in the plan, never applied unapproved.
- **`map-candidate` disposition (D10 + D1):** joins the adoption plan in R3. Its payload — the mapping target path — lives **inside the disposition record that `plan_key` hashes** (D1: the key is a sha256 over canonical JSON of the complete apply-action records including disposition-specific payload), so changing a proposed target forces re-approval. `README.md` is never a map candidate (the any-output-exists false-positive class this design exists to kill — spec §1).
- **`run — adoption mode` annotation (spec §6.1):** from R3, `run` disposition rows carry the resolved mode; the mode field is part of the run record and therefore inside `plan_key`.
- **Content-block ordering convention:** every one of the 18 files keeps `# `-less `## Mode Detection` → `## Update Mode Specifics` ordering, and the new `## Adoption Mode Specifics` block is placed **after the Update Mode Specifics section ends** — after its bullet list and any `###` subsections that follow it, before the next `##` heading, or at end of file when no `##` follows. Required bullets in every block: `**Codify from repo evidence**`, `**Interview only for**`, `**Do not**`; optional fourth bullet `**Ingest with provenance**`. The `# Name (Prompt)` heading convention and all existing Mode Detection / Update Mode Specifics blocks are preserved untouched.
- **The 18 adoption-capable steps (exact list):** foundation — `github-setup`, `beads`, `tech-stack`, `coding-standards`, `tdd`, `project-structure`; environment — `dev-env-setup`, `staging-environments`, `design-system`, `git-workflow`, `merge-throughput`, `automated-pr-review`, `ai-memory-setup`; plus `create-prd`, `create-vision`, `domain-modeling`, `system-architecture`, `security`. (`performance-budgets` is the one foundation-phase step excluded: it is game-overlay-gated — `dependencies: [review-gdd]` — and not part of the general brownfield adoption surface; the spec's "~18" resolves to exactly these 18.)
- **R1/R2 staging (consume, don't build):** R1 ships the `verification` enum on `StepStateEntry`, the D3 verification path in `src/state/completion.ts` (incl. `runDetect`), `content/methodology/brownfield.yml`, and the adopt plan renderer with dispositions + `plan_key`; R2 ships the ops-actions preview and the ingestion-lite parser for `package.json` scripts + `.github/workflows/*.yml`. This plan consumes those interfaces by the spec-pinned names. Where an R1/R2 module's exact file path is not pinned by the spec, the task names the expected path and gives a one-line locate instruction (`git grep`) — the code to add is complete either way.
- **Scope guards:** `scaffold build` (static command-file generation) is untouched — adoption mode is runtime assembly only, because it depends on live state. No writes outside what an approved plan showed (D1). No deletion or rewriting of a project's existing configs/docs — translation and mapping only.

---

### Task 1: `artifact_map` config schema, type, and validation

**Files:**
- `src/config/schema.ts` (add `artifact_map` to `ConfigSchema`)
- `src/config/schema.test.ts` (new cases)
- `src/types/config.ts` (add field to `ScaffoldConfig`)
- `src/config/loader.ts` (semantic validation against `knownSteps` + path shape)
- `src/config/loader.test.ts` (new cases)

**Interfaces:**
- `ScaffoldConfig.artifact_map?: Record<string, string>`
- New warning code `CONFIG_ARTIFACT_MAP_UNKNOWN_STEP`; new error code `CONFIG_ARTIFACT_MAP_PATH_INVALID`

**Steps:**

- [ ] Write failing schema tests in `src/config/schema.test.ts` (follow the file's existing parse-fixture style):

  ```ts
  describe('artifact_map (D10a)', () => {
    it('accepts a valid artifact_map', () => {
      const result = ConfigSchema.safeParse({
        version: 2,
        methodology: 'deep',
        platforms: ['claude-code'],
        artifact_map: { 'coding-standards': 'CONTRIBUTING.md' },
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.artifact_map).toEqual({ 'coding-standards': 'CONTRIBUTING.md' })
      }
    })

    it('rejects an artifact_map with a non-string target', () => {
      const result = ConfigSchema.safeParse({
        version: 2,
        methodology: 'deep',
        platforms: ['claude-code'],
        artifact_map: { 'coding-standards': ['CONTRIBUTING.md'] },
      })
      expect(result.success).toBe(false)
    })

    it('rejects an artifact_map with an empty-string target', () => {
      const result = ConfigSchema.safeParse({
        version: 2,
        methodology: 'deep',
        platforms: ['claude-code'],
        artifact_map: { 'coding-standards': '' },
      })
      expect(result.success).toBe(false)
    })

    it('omitting artifact_map stays valid', () => {
      const result = ConfigSchema.safeParse({
        version: 2, methodology: 'deep', platforms: ['claude-code'],
      })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.artifact_map).toBeUndefined()
    })
  })
  ```

- [ ] Run: `npx vitest run src/config/schema.test.ts` — expect the four new tests to FAIL (unknown key passes through `.passthrough()` untyped; the rejection cases fail because no schema rejects them yet).
- [ ] Add to `ConfigSchema` in `src/config/schema.ts`, between `custom:` and `platforms:`:

  ```ts
  /**
   * D10a (brownfield R3): maps a pipeline step slug to an existing project
   * artifact that satisfies it (e.g. `coding-standards: CONTRIBUTING.md`).
   * Key name is snake_case by spec pin. Step-slug validity and path shape are
   * enforced in loader.ts (the schema layer has no knownSteps or projectRoot).
   */
  artifact_map: z.record(z.string(), z.string().min(1)).optional(),
  ```

- [ ] Add to `ScaffoldConfig` in `src/types/config.ts` (after `project?:`):

  ```ts
  /** D10a: step slug → existing incumbent artifact path (project-root-relative). */
  artifact_map?: Record<string, string>
  ```

- [ ] Run: `npx vitest run src/config/schema.test.ts` — expect all green.
- [ ] Write failing loader tests in `src/config/loader.test.ts` (follow the file's existing tmp-dir + `loadConfig(projectRoot, knownSteps)` pattern):

  ```ts
  describe('artifact_map validation (D10a)', () => {
    it('warns on an artifact_map entry for an unknown step', () => {
      writeConfig(`version: 2\nmethodology: deep\nartifact_map:\n  not-a-step: CONTRIBUTING.md\n`)
      const result = loadConfig(tmpDir, ['coding-standards', 'tech-stack'])
      expect(result.warnings.some(w => w.code === 'CONFIG_ARTIFACT_MAP_UNKNOWN_STEP')).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('errors on an absolute artifact_map target', () => {
      writeConfig(`version: 2\nmethodology: deep\nartifact_map:\n  coding-standards: /etc/passwd\n`)
      const result = loadConfig(tmpDir, ['coding-standards'])
      expect(result.errors.some(e => e.code === 'CONFIG_ARTIFACT_MAP_PATH_INVALID')).toBe(true)
    })

    it('errors on a traversal artifact_map target', () => {
      writeConfig(`version: 2\nmethodology: deep\nartifact_map:\n  coding-standards: ../outside.md\n`)
      const result = loadConfig(tmpDir, ['coding-standards'])
      expect(result.errors.some(e => e.code === 'CONFIG_ARTIFACT_MAP_PATH_INVALID')).toBe(true)
    })

    it('accepts a valid artifact_map entry', () => {
      writeConfig(`version: 2\nmethodology: deep\nartifact_map:\n  coding-standards: CONTRIBUTING.md\n`)
      const result = loadConfig(tmpDir, ['coding-standards'])
      expect(result.errors).toHaveLength(0)
      expect(result.config?.artifact_map).toEqual({ 'coding-standards': 'CONTRIBUTING.md' })
    })
  })
  ```

  (Use the file's existing helper for writing `.scaffold/config.yml` into the tmp project — if none exists, add a local `writeConfig` that mkdirs `.scaffold/` and writes the string.)
- [ ] Run: `npx vitest run src/config/loader.test.ts` — expect the new tests to FAIL.
- [ ] Implement semantic validation in `src/config/loader.ts`, immediately after the existing `custom` steps-vs-`knownSteps` validation block (~line 163), following that block's error/warning accumulation pattern (adapt local variable names to the surrounding code):

  ```ts
  // D10a: validate artifact_map entries. Unknown step slugs are warnings
  // (the mapping may target a step added by a newer content version);
  // absolute or root-escaping paths are hard errors.
  const artifactMap = parsed.artifact_map
  if (artifactMap) {
    for (const [stepSlug, target] of Object.entries(artifactMap)) {
      if (knownSteps.length > 0 && !knownSteps.includes(stepSlug)) {
        warnings.push({
          code: 'CONFIG_ARTIFACT_MAP_UNKNOWN_STEP',
          message: `artifact_map references unknown step '${stepSlug}'`,
          context: { step: stepSlug },
        })
      }
      if (path.isAbsolute(target) || target.split(/[\\/]/).includes('..')) {
        errors.push({
          code: 'CONFIG_ARTIFACT_MAP_PATH_INVALID',
          message:
            `artifact_map['${stepSlug}'] must be a project-root-relative path ` +
            `without '..' segments (got '${target}')`,
          exitCode: ExitCode.ValidationError,
          recovery: 'Use a relative path inside the project, e.g. CONTRIBUTING.md',
        })
      }
    }
  }
  ```

  (Import `path` if the loader does not already; runtime consumers additionally re-check containment via `resolveContainedArtifactPath` — defense in depth.)
- [ ] Run: `npx vitest run src/config/loader.test.ts src/config/schema.test.ts` — all green.
- [ ] Commit: `feat(config): artifact_map schema + validation (brownfield R3, D10a)`

---

### Task 2: Verification honors mapped artifacts

**Files:**
- `src/state/completion.ts` (thread `artifactMap` through `detectCompletion` and `checkCompletion`; same treatment for R1's `verifyStep`/`runDetect` wrapper if it wraps these)
- `src/state/completion.test.ts` (new cases; create the file if R1 did not already)

**Interfaces:**
- `detectCompletion(step, state, expectedOutputs, projectRoot, service?, artifactMap?)` — trailing optional param, backward compatible
- `checkCompletion(step, state, projectRoot, artifactMap?)` — same
- `CompletionResult.mappedArtifactUsed?: string` — set when a mapping satisfied the outputs requirement

**Steps:**

- [ ] Write failing tests (tmp-dir pattern as in `update-mode.test.ts`):

  ```ts
  describe('artifact_map integration (D10a)', () => {
    it('detectCompletion accepts an existing mapped incumbent in place of outputs', () => {
      fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# Contributing\n')
      const state = makeState({})
      const result = detectCompletion(
        'coding-standards', state, ['docs/coding-standards.md'], tmpDir, undefined,
        { 'coding-standards': 'CONTRIBUTING.md' },
      )
      expect(result.complete).toBe(true)
      expect(result.mappedArtifactUsed).toBe('CONTRIBUTING.md')
      expect(result.artifactsMissing).toHaveLength(0)
    })

    it('a stale mapping (mapped file missing) falls back to the normal all-outputs check', () => {
      const state = makeState({})
      const result = detectCompletion(
        'coding-standards', state, ['docs/coding-standards.md'], tmpDir, undefined,
        { 'coding-standards': 'CONTRIBUTING.md' },
      )
      expect(result.complete).toBe(false)
      expect(result.mappedArtifactUsed).toBeUndefined()
      expect(result.artifactsMissing).toEqual(['docs/coding-standards.md'])
    })

    it('a mapping that escapes the project root is ignored', () => {
      const state = makeState({})
      const result = detectCompletion(
        'coding-standards', state, ['docs/coding-standards.md'], tmpDir, undefined,
        { 'coding-standards': '../outside.md' },
      )
      expect(result.complete).toBe(false)
      expect(result.mappedArtifactUsed).toBeUndefined()
    })

    it('checkCompletion reports confirmed_complete for completed + mapped incumbent present', () => {
      fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# Contributing\n')
      const state = makeState({
        'coding-standards': {
          status: 'completed', source: 'pipeline',
          produces: ['docs/coding-standards.md'],
        },
      })
      const result = checkCompletion('coding-standards', state, tmpDir,
        { 'coding-standards': 'CONTRIBUTING.md' })
      expect(result.status).toBe('confirmed_complete')
    })
  })
  ```

- [ ] Run: `npx vitest run src/state/completion.test.ts` — new tests FAIL (no `artifactMap` param yet).
- [ ] Implement in `src/state/completion.ts`. Add `mappedArtifactUsed?: string` to `CompletionResult`. At the top of `detectCompletion`, before the outputs loop:

  ```ts
  const mapped = artifactMap?.[step]
  if (mapped !== undefined) {
    const mappedFull = resolveContainedArtifactPath(projectRoot, mapped)
    if (mappedFull !== null && fileExists(mappedFull)) {
      return {
        complete: true,
        artifactsPresent: [mapped],
        artifactsMissing: [],
        mappedArtifactUsed: mapped,
      }
    }
    // Stale mapping (mapped file gone) or escaping path: fall through to the
    // normal all-outputs check — a broken mapping must not silently verify.
  }
  ```

  Apply the same short-circuit to `checkCompletion`'s outputs-presence loop (an existing mapped incumbent ⇒ `allPresent = true` for the status computation). **R1 integration note:** if R1's `verifyStep`/`runDetect` wrapper calls these functions, thread the map through the outputs-presence layer only — the `detect:` contract layer always still runs (mapping never bypasses detect). Locate with `git grep -n "runDetect" src/state/` if the wrapper lives elsewhere.
- [ ] Run: `npx vitest run src/state/completion.test.ts` — all green.
- [ ] Commit: `feat(state): completion verification honors artifact_map incumbents (D10a)`

---

### Task 3: `AssemblyMode` type + `resolveAssemblyMode()` (fresh | update | adoption)

**Files:**
- `src/types/assembly.ts` (add `AssemblyMode` type)
- `src/core/assembly/update-mode.ts` (add `resolveAssemblyMode`; `detectUpdateMode` unchanged)
- `src/core/assembly/update-mode.test.ts` (new describe block)

**Interfaces:**

```ts
// src/types/assembly.ts
export type AssemblyMode = 'fresh' | 'update' | 'adoption'

// src/core/assembly/update-mode.ts
export interface AssemblyModeResult {
  mode: AssemblyMode
  /** Raw update-mode detection result (pre-verification gate). */
  updateDetection: UpdateModeResult
  existingArtifact?: ExistingArtifact
  previousDepth?: DepthLevel
  currentDepth: DepthLevel
  depthIncreased?: boolean
  warnings: ScaffoldWarning[]
}
export function resolveAssemblyMode(options: {
  step: string
  state: PipelineState
  currentDepth: DepthLevel
  projectRoot: string
  service?: string
  artifactMap?: Record<string, string>
}): AssemblyModeResult
```

**Steps:**

- [ ] Write failing tests in `src/core/assembly/update-mode.test.ts` (reuse the file's `makeState` helper — pass `'init-mode'` via a spread override where needed; extend `makeState` with an optional `initMode` second parameter if cleaner):

  ```ts
  describe('resolveAssemblyMode (D3 matrix + D10a)', () => {
    function brownfieldState(steps: PipelineState['steps'] = {}): PipelineState {
      return { ...makeState(steps), 'init-mode': 'brownfield' }
    }

    it('completed + verification declared + artifact on disk → update', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'docs/prd.md'), '# PRD')
      const state = makeState({
        'create-prd': {
          status: 'completed', source: 'pipeline', at: '2024-01-01T00:00:00.000Z',
          produces: ['docs/prd.md'], depth: 3,
          verification: 'declared',
        } as PipelineState['steps'][string],
      })
      const result = resolveAssemblyMode({ step: 'create-prd', state, currentDepth: 3, projectRoot: tmpDir })
      expect(result.mode).toBe('update')
      expect(result.existingArtifact?.filePath).toBe('docs/prd.md')
    })

    it('completed + verification unverified → fresh (matrix "else"), no update warnings leak', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'docs/prd.md'), '# PRD')
      const state = brownfieldState({
        'create-prd': {
          status: 'completed', source: 'pipeline', produces: ['docs/prd.md'], depth: 5,
          verification: 'unverified',
        } as PipelineState['steps'][string],
      })
      const result = resolveAssemblyMode({ step: 'create-prd', state, currentDepth: 3, projectRoot: tmpDir })
      expect(result.mode).toBe('fresh')
      expect(result.warnings).toHaveLength(0)
    })

    it('completed entry missing the verification field defaults to declared → update', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'docs/prd.md'), '# PRD')
      const state = makeState({
        'create-prd': {
          status: 'completed', source: 'pipeline', produces: ['docs/prd.md'], depth: 3,
        },
      })
      const result = resolveAssemblyMode({ step: 'create-prd', state, currentDepth: 3, projectRoot: tmpDir })
      expect(result.mode).toBe('update')
    })

    it('not completed + init-mode brownfield → adoption', () => {
      const state = brownfieldState({
        'tech-stack': { status: 'pending', source: 'pipeline', produces: ['docs/tech-stack.md'] },
      })
      const result = resolveAssemblyMode({ step: 'tech-stack', state, currentDepth: 3, projectRoot: tmpDir })
      expect(result.mode).toBe('adoption')
    })

    it('not completed + init-mode v1-migration → adoption', () => {
      const state = { ...makeState({}), 'init-mode': 'v1-migration' as const }
      const result = resolveAssemblyMode({ step: 'tech-stack', state, currentDepth: 3, projectRoot: tmpDir })
      expect(result.mode).toBe('adoption')
    })

    it('not completed + init-mode greenfield → fresh', () => {
      const state = makeState({})
      const result = resolveAssemblyMode({ step: 'tech-stack', state, currentDepth: 3, projectRoot: tmpDir })
      expect(result.mode).toBe('fresh')
    })

    it('completed verified + own output missing + mapped incumbent present → update with mapped prior artifact', () => {
      fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# House rules\n')
      const state = brownfieldState({
        'coding-standards': {
          status: 'completed', source: 'pipeline', at: '2026-07-19T00:00:00.000Z',
          produces: ['docs/coding-standards.md'], depth: 3,
          verification: 'verified',
        } as PipelineState['steps'][string],
      })
      const result = resolveAssemblyMode({
        step: 'coding-standards', state, currentDepth: 3, projectRoot: tmpDir,
        artifactMap: { 'coding-standards': 'CONTRIBUTING.md' },
      })
      expect(result.mode).toBe('update')
      expect(result.existingArtifact?.filePath).toBe('CONTRIBUTING.md')
      expect(result.existingArtifact?.content).toContain('House rules')
    })

    it('own produced artifact wins over the mapped incumbent when both exist', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, 'docs/coding-standards.md'), '# Own doc')
      fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# Incumbent')
      const state = makeState({
        'coding-standards': {
          status: 'completed', source: 'pipeline', produces: ['docs/coding-standards.md'], depth: 3,
          verification: 'declared',
        } as PipelineState['steps'][string],
      })
      const result = resolveAssemblyMode({
        step: 'coding-standards', state, currentDepth: 3, projectRoot: tmpDir,
        artifactMap: { 'coding-standards': 'CONTRIBUTING.md' },
      })
      expect(result.mode).toBe('update')
      expect(result.existingArtifact?.filePath).toBe('docs/coding-standards.md')
    })
  })
  ```

  (If R1's `StepStateEntry` already types `verification`, drop the `as PipelineState['steps'][string]` casts.)
- [ ] Run: `npx vitest run src/core/assembly/update-mode.test.ts` — new tests FAIL.
- [ ] Implement in `src/core/assembly/update-mode.ts` (below `detectUpdateMode`, reusing its imports):

  ```ts
  export interface AssemblyModeResult {
    mode: AssemblyMode
    updateDetection: UpdateModeResult
    existingArtifact?: ExistingArtifact
    previousDepth?: DepthLevel
    currentDepth: DepthLevel
    depthIncreased?: boolean
    warnings: ScaffoldWarning[]
  }

  /**
   * Resolve the assembly mode for a step per the D3 matrix (brownfield R3):
   *   - prior completion surviving as verification verified|declared → 'update'
   *   - no surviving completion + init-mode brownfield|v1-migration → 'adoption'
   *   - else → 'fresh'
   * A D10a artifact_map incumbent stands in as the prior artifact when the
   * step's own outputs are absent (fallback only — own outputs win).
   */
  export function resolveAssemblyMode(options: {
    step: string
    state: PipelineState
    currentDepth: DepthLevel
    projectRoot: string
    service?: string
    artifactMap?: Record<string, string>
  }): AssemblyModeResult {
    const { step, state, currentDepth, projectRoot, artifactMap } = options
    const detection = detectUpdateMode(options)
    const entry = state.steps[step]
    const completed = entry?.status === 'completed'

    // R1 (D3) verification enum. Pre-R1 entries are migrated on state load;
    // an absent field defaults to 'declared' so pre-migration greenfield
    // behavior (completed + artifact on disk → update) is preserved.
    const verification =
      (entry as { verification?: 'verified' | 'declared' | 'unverified' } | undefined)
        ?.verification ?? 'declared'
    const updateEligible =
      completed && (verification === 'verified' || verification === 'declared')

    if (updateEligible && detection.isUpdateMode) {
      return {
        mode: 'update',
        updateDetection: detection,
        existingArtifact: detection.existingArtifact,
        previousDepth: detection.previousDepth,
        currentDepth,
        depthIncreased: detection.depthIncreased,
        warnings: detection.warnings,
      }
    }

    // D10a fallback: mapped incumbent as prior artifact (own outputs absent).
    // Note: artifact_map targets are project-root-relative; the service prefix
    // is not applied (root-level mapping only — multi-service mapping is out
    // of scope for R3).
    const mapped = artifactMap?.[step]
    if (updateEligible && mapped !== undefined) {
      const mappedFull = resolveContainedArtifactPath(projectRoot, mapped)
      if (mappedFull !== null) {
        try {
          if (fs.statSync(mappedFull).isFile()) {
            const existingArtifact: ExistingArtifact = {
              filePath: mapped,
              content: fs.readFileSync(mappedFull, 'utf8'),
              previousDepth: (entry?.depth ?? currentDepth) as DepthLevel,
              completionTimestamp: entry?.at ?? '',
            }
            return {
              mode: 'update',
              updateDetection: detection,
              existingArtifact,
              previousDepth: entry?.depth as DepthLevel | undefined,
              currentDepth,
              warnings: [],
            }
          }
        } catch {
          // mapped path unreadable — fall through
        }
      }
    }

    const initMode = state['init-mode']
    if (!completed && (initMode === 'brownfield' || initMode === 'v1-migration')) {
      return { mode: 'adoption', updateDetection: detection, currentDepth, warnings: [] }
    }

    return { mode: 'fresh', updateDetection: detection, currentDepth, warnings: [] }
  }
  ```

  Add `export type AssemblyMode = 'fresh' | 'update' | 'adoption'` to `src/types/assembly.ts` and import it (types must not import from core, so the type lives in types/).
- [ ] Run: `npx vitest run src/core/assembly/update-mode.test.ts` — all green (existing `detectUpdateMode` tests must stay green untouched).
- [ ] Commit: `feat(assembly): resolveAssemblyMode — fresh|update|adoption per D3 matrix (brownfield R3)`

---

### Task 4: Engine injects the adoption preamble; metadata records the mode

**Files:**
- `src/types/assembly.ts` (`AssemblyOptions.assemblyMode?`, `AssemblyOptions.adoptionPreamble?`, `AssemblyMetadata.assemblyMode`)
- `src/core/assembly/engine.ts` (Instructions-section injection, metadata)
- `src/core/assembly/engine.test.ts` (new cases)

**Interfaces:**

```ts
// AssemblyOptions additions
/** Resolved assembly mode (brownfield R3). Defaults from updateMode when absent. */
assemblyMode?: AssemblyMode
/** Global adoption-mode preamble text (content/modes/adoption.md). Injected only when assemblyMode === 'adoption'. */
adoptionPreamble?: string

// AssemblyMetadata addition
assemblyMode: AssemblyMode
```

**Steps:**

- [ ] Write failing tests in `src/core/assembly/engine.test.ts` (use the existing `makeOptions` helper):

  ```ts
  describe('adoption mode (brownfield R3, D11)', () => {
    it('injects the adoption preamble into the Instructions section', () => {
      const result = new AssemblyEngine().assemble('tech-stack', makeOptions({
        assemblyMode: 'adoption',
        adoptionPreamble: 'You are running this step in **adoption mode**. Read the repository first.',
      }))
      expect(result.success).toBe(true)
      const instructions = result.prompt!.sections.find(s => s.heading === 'Instructions')!
      expect(instructions.content).toContain('### Adoption Mode')
      expect(instructions.content).toContain('Read the repository first.')
      expect(result.prompt!.metadata.assemblyMode).toBe('adoption')
    })

    it('does not inject the preamble outside adoption mode', () => {
      const result = new AssemblyEngine().assemble('tech-stack', makeOptions({
        assemblyMode: 'fresh',
        adoptionPreamble: 'SHOULD NOT APPEAR',
      }))
      const instructions = result.prompt!.sections.find(s => s.heading === 'Instructions')!
      expect(instructions.content).not.toContain('SHOULD NOT APPEAR')
      expect(result.prompt!.metadata.assemblyMode).toBe('fresh')
    })

    it('metadata.assemblyMode defaults from updateMode when assemblyMode is absent', () => {
      const updated = new AssemblyEngine().assemble('tech-stack', makeOptions({ updateMode: true }))
      expect(updated.prompt!.metadata.assemblyMode).toBe('update')
      const fresh = new AssemblyEngine().assemble('tech-stack', makeOptions({ updateMode: false }))
      expect(fresh.prompt!.metadata.assemblyMode).toBe('fresh')
    })
  })
  ```

- [ ] Run: `npx vitest run src/core/assembly/engine.test.ts` — new tests FAIL.
- [ ] Implement in `engine.ts`:
  - Instructions section call becomes:

    ```ts
    { heading: 'Instructions',
      content: this.buildInstructionsSection(
        options.instructions,
        options.reworkFix,
        options.assemblyMode === 'adoption' ? options.adoptionPreamble : undefined,
      ) },
    ```
  - `buildInstructionsSection(instructions, reworkFix?, adoptionPreamble?)` gains, after the `reworkFix` part (same precedent — a mode modifier rendered as an Instructions part):

    ```ts
    if (adoptionPreamble != null && adoptionPreamble.trim() !== '') {
      parts.push(`### Adoption Mode\n\n${adoptionPreamble.trim()}`)
    }
    ```
  - Metadata: `assemblyMode: options.assemblyMode ?? (options.updateMode ? 'update' : 'fresh')`.
- [ ] Run: `npx vitest run src/core/assembly/engine.test.ts` — all green (all pre-existing engine tests must also stay green; they don't pass `assemblyMode`, so the default path covers them).
- [ ] Commit: `feat(assembly): engine injects adoption preamble into Instructions section (D11)`

---

### Task 5: `content/modes/adoption.md` + modes dir resolver + preamble loader

**Files:**
- `content/modes/adoption.md` (new — the global preamble; `content/` is already in the npm `files` list, so no packaging change)
- `src/utils/fs.ts` (add `getPackageModesDir`)
- `src/core/assembly/mode-loader.ts` (new)
- `src/core/assembly/mode-loader.test.ts` (new)

**Interfaces:**

```ts
export function getPackageModesDir(projectRoot?: string): string
export function loadAdoptionPreamble(projectRoot?: string): {
  content: string | null
  warnings: ScaffoldWarning[]
}
```

**Steps:**

- [ ] Write failing test `src/core/assembly/mode-loader.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { loadAdoptionPreamble } from './mode-loader.js'

  describe('loadAdoptionPreamble', () => {
    it('loads the bundled adoption preamble', () => {
      const { content, warnings } = loadAdoptionPreamble()
      expect(warnings).toHaveLength(0)
      expect(content).toBeTruthy()
      expect(content).toContain('adoption mode')
      expect(content).toContain('Read the repository first')
      expect(content).toContain('provenance')
    })
  })
  ```

- [ ] Run: `npx vitest run src/core/assembly/mode-loader.test.ts` — FAIL (module missing).
- [ ] Create `content/modes/adoption.md` with exactly this content:

  ```markdown
  <!-- Global adoption-mode preamble (brownfield R3, D11). Injected by the
       assembly engine into the Instructions section of every step that
       resolves to adoption mode (init-mode: brownfield | v1-migration and no
       surviving scaffold completion for the step). Step-specific behavior
       lives in each step's "## Adoption Mode Specifics" block.
       Source of truth: docs/superpowers/specs/2026-07-19-brownfield-adoption-design.md §8. -->

  You are running this step in **adoption mode**: this is an existing, working
  codebase being adopted into the scaffold pipeline — not a greenfield project.
  The repository is the primary source of truth. Your job is to codify what
  already exists, not to redesign it.

  **1. Read the repository first.** Before asking the user anything and before
  writing any document, inspect the code, configs, scripts, CI workflows,
  lockfiles, and git history relevant to this step. When this step carries an
  "Adoption Mode Specifics" block, its **Codify from repo evidence** bullet
  lists where to look.

  **2. Extract facts with evidence.** Every claim written into a document must
  cite where it came from: a file path, a config key, a command output, or a
  git-history observation. Prefer "TypeScript 5.x (package.json
  devDependencies)" over "the project uses TypeScript". If you cannot find
  evidence for a claim, it is a question for the user, not a fact.

  **3. Interview only for intent gaps.** Ask the user only what the repository
  cannot answer: goals, priorities, planned changes, risk appetite, and which
  observed patterns are deliberate versus accidental. Never ask a question
  whose answer is already in the repo.

  **4. Never propose rewrites of working code.** Adoption documents describe
  the system as-built. Where current behavior falls short of a standard this
  step would normally impose, record the gap with evidence and move on — do
  not instruct anyone to refactor, restyle, rename, or re-architect
  functioning code. Improvements are follow-up work the user schedules, not
  side effects of documentation.

  **5. Translate incumbents with provenance; list what you cannot translate.**
  When an existing config or document (linter config, CI workflow, CONTRIBUTING
  guide) feeds a scaffold document, translate its actual content and annotate
  each translated section with a provenance comment:

      <!-- provenance: ingested from <path> (<YYYY-MM-DD>) -->

  Anything that cannot be translated faithfully is listed under a
  "Not translated" heading with the reason — never guessed at, never silently
  dropped.
  ```

- [ ] Add to `src/utils/fs.ts`, alongside the other `getPackage*Dir` functions:

  ```ts
  /** Resolve the modes directory (bundled, unless running against scaffold itself). */
  export function getPackageModesDir(projectRoot?: string): string {
    return resolveContentDir('modes', projectRoot)
  }
  ```

- [ ] Create `src/core/assembly/mode-loader.ts`:

  ```ts
  import path from 'node:path'
  import fs from 'node:fs'
  import { getPackageModesDir } from '../../utils/fs.js'
  import type { ScaffoldWarning } from '../../types/index.js'

  /**
   * Load the global adoption-mode preamble (content/modes/adoption.md).
   * A missing file is a warning, never fatal — assembly proceeds without the
   * preamble (the step's Adoption Mode Specifics block still applies).
   */
  export function loadAdoptionPreamble(projectRoot?: string): {
    content: string | null
    warnings: ScaffoldWarning[]
  } {
    const filePath = path.join(getPackageModesDir(projectRoot), 'adoption.md')
    try {
      return { content: fs.readFileSync(filePath, 'utf8').trim(), warnings: [] }
    } catch {
      return {
        content: null,
        warnings: [{
          code: 'ASM_ADOPTION_PREAMBLE_MISSING',
          message: `Adoption-mode preamble not found at ${filePath} — assembling without it`,
        }],
      }
    }
  }
  ```

- [ ] Run: `npx vitest run src/core/assembly/mode-loader.test.ts` — green.
- [ ] Commit: `feat(content): global adoption-mode preamble + loader (D11)`

---

### Task 6: `brownfield-adoption` knowledge entry + knowledge-loader sensitivity

**Files:**
- `content/knowledge/core/brownfield-adoption.md` (new — must satisfy the knowledge evals: ≥200 lines, ≥1 code block, Summary + Deep Guidance dual-channel, full frontmatter)
- `src/core/assembly/knowledge-loader.ts` (add `withAdoptionKnowledge`)
- `src/core/assembly/knowledge-loader.test.ts` (new cases)
- `tests/evals/exemptions.bash` (new `CODE_INJECTED_KNOWLEDGE` list)
- `tests/evals/knowledge-quality.bats` (orphan check honors code-injected entries)

**Interfaces:**

```ts
export const ADOPTION_KNOWLEDGE_ENTRY = 'brownfield-adoption'
export function withAdoptionKnowledge(names: string[], mode: AssemblyMode): string[]
```

**Steps:**

- [ ] Write failing loader tests in `src/core/assembly/knowledge-loader.test.ts`:

  ```ts
  describe('withAdoptionKnowledge (brownfield R3)', () => {
    it('appends brownfield-adoption for adoption mode', () => {
      expect(withAdoptionKnowledge(['tech-stack-selection'], 'adoption'))
        .toEqual(['tech-stack-selection', 'brownfield-adoption'])
    })
    it('returns names unchanged for fresh and update modes', () => {
      expect(withAdoptionKnowledge(['tech-stack-selection'], 'fresh'))
        .toEqual(['tech-stack-selection'])
      expect(withAdoptionKnowledge(['tech-stack-selection'], 'update'))
        .toEqual(['tech-stack-selection'])
    })
    it('does not duplicate an already-present entry', () => {
      expect(withAdoptionKnowledge(['brownfield-adoption'], 'adoption'))
        .toEqual(['brownfield-adoption'])
    })
    it('the bundled brownfield-adoption entry loads from the package index', () => {
      const index = buildIndex(getPackageKnowledgeDir())
      const { entries, warnings } = loadEntries(index, ['brownfield-adoption'])
      expect(warnings).toHaveLength(0)
      expect(entries).toHaveLength(1)
      expect(entries[0].content).toContain('provenance')
    })
  })
  ```

  (Import `getPackageKnowledgeDir` from `../../utils/fs.js`; `buildIndex` is already exported.)
- [ ] Run: `npx vitest run src/core/assembly/knowledge-loader.test.ts` — new tests FAIL.
- [ ] Add to `knowledge-loader.ts`:

  ```ts
  import type { AssemblyMode } from '../../types/index.js'

  /** Knowledge entry injected for adoption-mode steps (brownfield R3, D11). */
  export const ADOPTION_KNOWLEDGE_ENTRY = 'brownfield-adoption'

  /**
   * Append the brownfield-adoption knowledge entry when assembling in
   * adoption mode. Pure; never mutates the input; dedupes.
   */
  export function withAdoptionKnowledge(names: string[], mode: AssemblyMode): string[] {
    if (mode !== 'adoption') return names
    return names.includes(ADOPTION_KNOWLEDGE_ENTRY)
      ? names
      : [...names, ADOPTION_KNOWLEDGE_ENTRY]
  }
  ```

  (Export `AssemblyMode` from `src/types/index.ts` if not already re-exported.)
- [ ] Create `content/knowledge/core/brownfield-adoption.md` with exactly this content:

  ````markdown
  ---
  name: brownfield-adoption
  description: Brownfield adoption patterns — evidence-first codification, incumbent translation with provenance, interview-for-intent discipline, and artifact mapping for existing codebases entering the scaffold pipeline
  topics:
    - brownfield
    - adoption
    - ingestion
    - provenance
    - artifact-mapping
    - evidence
  volatility: stable
  last-reviewed: 2026-07-19
  version-pin: null
  sources:
    - url: https://docs.renovatebot.com/configuration-options/
      anchor: '#onboarding'
      retrieved: 2026-07-19
    - url: https://biomejs.dev/guides/migrate-eslint-prettier/
      anchor: '#migrate-from-eslint'
      retrieved: 2026-07-19
  ---

  # Brownfield Adoption

  Adopting an existing, working codebase into a structured pipeline is a
  different discipline from greenfield scaffolding. Greenfield steps design;
  adoption steps **codify**. The repository — its code, configs, lockfiles,
  CI workflows, and git history — is the primary source of truth, and every
  document produced during adoption describes the system as-built before it
  says anything about the future. This entry is injected automatically for
  every step that runs in adoption mode.

  ## Summary

  ### The adoption stance

  Three postures, in priority order:

  1. **Codify** — the repo already answers most questions a pipeline step
     would normally ask. Record those answers as decisions, with evidence.
  2. **Interview for intent** — the repo cannot answer questions of intent:
     goals, priorities, risk appetite, planned changes, and which observed
     patterns are deliberate. Those are the only questions worth the user's
     time.
  3. **Record gaps, don't fix them** — where the as-built system falls short
     of a standard, write the gap down with evidence and severity. Fixing it
     is follow-up work the user schedules, never a side effect of running a
     documentation step.

  ### Evidence-first codification

  A claim without a source is a guess. Every statement written into an
  adoption-mode document carries its evidence inline: a file path, a config
  key, a command output, or a git-history observation. This does two jobs:
  it makes the document verifiable, and it makes later drift detectable —
  when the evidence changes, the statement is known-stale.

  Weak: "The project uses PostgreSQL."
  Strong: "PostgreSQL 16 (docker-compose.yml `db` service, `pg` ^8.11 in
  package.json dependencies)."

  ### Interview only for intent

  Never ask the user a question the repo answers. Asking "what test runner do
  you use?" of a repo with a `vitest.config.ts` wastes the user's attention
  and teaches them the tool doesn't look. The inverse also holds: never
  answer an intent question from code. A README's marketing copy is evidence
  of past positioning, not of current strategy — confirm before treating it
  as the user's intent.

  ### Incumbent translation and provenance

  When an incumbent artifact (linter config, CI workflow, CONTRIBUTING guide,
  compose file) feeds a scaffold document, translate its actual content —
  never a generic template — and mark every translated section with a
  provenance annotation naming the source. What cannot be translated
  faithfully is listed under a "Not translated" heading with the reason.
  Silence is the failure mode: a dropped incumbent rule is worse than an
  untranslated one, because nobody knows it's gone.

  ### Artifact mapping

  `.scaffold/config.yml` may carry an `artifact_map` that lets an incumbent
  document satisfy a pipeline step outright (`coding-standards:
  CONTRIBUTING.md`). A mapped step is verified through the incumbent, and
  later update-mode runs treat the incumbent as the prior artifact — extend
  it, don't replace it. Mappings are proposed in the adoption plan and only
  ever applied with approval.

  ## Deep Guidance

  ### Evidence-gathering command palette

  The fastest honest picture of a repo comes from a handful of read-only
  commands. Run what applies; cite outputs in the documents you write:

  ```bash
  # Stack and dependencies (versions from lockfiles, not guesses)
  cat package.json | jq '{deps: .dependencies, dev: .devDependencies, scripts}'
  ls *.lock* pnpm-lock.yaml poetry.lock go.mod Cargo.toml 2>/dev/null

  # Conventions actually followed
  git log --oneline -50                  # commit-message convention adherence
  git log --merges --oneline -30         # squash vs merge-commit reality
  git branch -a --sort=-committerdate | head -20   # branch naming in practice

  # Quality tooling as configured (not as wished)
  ls .eslintrc* eslint.config.* biome.json* .prettierrc* ruff.toml 2>/dev/null
  ls vitest.config.* jest.config.* playwright.config.* pytest.ini 2>/dev/null
  ls .github/workflows/                  # what CI actually runs

  # Runtime topology
  ls Dockerfile docker-compose.yml compose.yaml fly.toml vercel.json 2>/dev/null
  ```

  Read the outputs before forming any opinion. The gap between "what the
  README says" and "what the lockfile and CI say" is itself a finding worth
  recording.

  ### Provenance annotation convention

  Every section of a scaffold document whose content was translated from an
  incumbent source carries an HTML comment immediately under its heading:

  ```markdown
  ## Linting and Formatting
  <!-- provenance: ingested from biome.json (2026-07-19) -->

  The project enforces formatting via Biome with a 100-column line width
  (biome.json `formatter.lineWidth`), ...

  ## Not translated
  - biome.json `overrides[0]` (per-directory rule relaxations for `legacy/`):
    scaffold's standards format has no per-directory override section — kept
    in biome.json as the source of truth, noted here so it is not lost.
  ```

  The annotation names the source path and the ingestion date. When the
  incumbent later changes, the date makes staleness computable. The
  "Not translated" section is mandatory whenever anything was skipped — an
  empty section ("Not translated: nothing — full fidelity") is better than an
  absent one, because it proves the question was asked.

  ### The as-built / evolution split

  Adoption documents that mix description and aspiration become untrustworthy
  in both directions. Keep two clearly separated layers:

  - **As-built** — what exists, with evidence. This layer must survive an
    adversarial diff against the repo.
  - **Evolution** (optional) — what the user wants to change, gathered by
    interview, marked as intent. Never written as if it already exists.

  A PRD in adoption mode has a "Current capabilities (as-built)" section
  before any roadmap. An architecture doc describes the real module graph
  before a separated "Evolution" section mentions the target state.

  ### Conflict classes during verification

  Adoption verification distinguishes two conflict shapes (both are recorded,
  never silently resolved):

  - **State-claim conflict** — pipeline state says a step completed but its
    artifacts or live checks fail now. The claim is reversed to pending with
    an audit record preserving who/when/what claimed completion.
  - **Artifact-only conflict** — no completion claim, but partial artifacts
    exist (the classic false positive: a `CLAUDE.md` exists, so a task-tracker
    step "looks done" while `bd info` fails). Recorded as pending with the
    found artifacts listed.

  The rule both classes share: **a conflicted step is not a completed step.**
  It re-enters the pipeline in adoption mode, where the evidence-first
  posture applies.

  ### Anti-patterns

  - **The README false positive.** "A file with the right name exists" is not
    completion. Verify content and live behavior (`bd info`, `git remote
    get-url origin`) before honoring any artifact.
  - **Drive-by modernization.** Swapping a working test runner, linter, or
    framework because the pipeline's greenfield default differs. The
    incumbent is the decision; document it.
  - **Repo-wide reformatting.** A formatting sweep buries the adoption diff
    and destroys blame. Standards apply to new code unless the user
    explicitly schedules a sweep.
  - **Interview theater.** Asking twenty discovery questions whose answers
    are one `jq` away. Every unnecessary question spends trust.
  - **Aspirational documentation.** Writing the architecture the team wishes
    it had. The doc must survive a diff against the code.
  - **Silent dropping.** Skipping an incumbent rule or config section without
    listing it under "Not translated". If it can't translate, say so.
  ````

- [ ] Wire the orphan-check exemption, matching the established split (`KNOWLEDGE_TEMPLATE_EXEMPT` array in `exemptions.bash`, its `is_knowledge_template` helper in the bats file). In `tests/evals/exemptions.bash`, next to `KNOWLEDGE_TEMPLATE_EXEMPT`, add the array only:

  ```bash
  # --- knowledge-quality.bats ---
  # Knowledge entries injected by CODE, not referenced from step frontmatter.
  # brownfield-adoption is appended at assembly time for adoption-mode steps
  # (src/core/assembly/knowledge-loader.ts withAdoptionKnowledge — D11).
  CODE_INJECTED_KNOWLEDGE=(
    "brownfield-adoption"
  )
  ```

  In `tests/evals/knowledge-quality.bats`, next to the existing `is_knowledge_template()` helper, add:

  ```bash
  is_code_injected_knowledge() {
    local name="$1"
    for exempt in "${CODE_INJECTED_KNOWLEDGE[@]}"; do
      [[ "$name" == "$exempt" ]] && return 0
    done
    return 1
  }
  ```

  and in the "all knowledge entries are referenced by at least one pipeline step or tool" test, add alongside the existing `is_knowledge_template "$name" && continue` line:

  ```bash
  is_code_injected_knowledge "$name" && continue
  ```

- [ ] Verify the entry clears the core-category eval floor: `wc -l content/knowledge/core/brownfield-adoption.md` — must print ≥ 200. If short, expand the Deep Guidance "Anti-patterns" section with additional grounded items (e.g. "trusting CI config over CI history", "mapping an incumbent doc that contradicts the code") until it clears — never pad with filler.
- [ ] Run: `npx vitest run src/core/assembly/knowledge-loader.test.ts` — green. Then `npx bats tests/evals/knowledge-quality.bats tests/evals/knowledge-injection.bats` — expect all `ok` (entry ≥200 lines, has code blocks, has Summary + Deep Guidance, orphan check exempted).
- [ ] Commit: `feat(knowledge): brownfield-adoption entry + adoption-mode injection (D11)`

---

### Task 7: Wire `scaffold run` — mode resolution, preamble, knowledge append

**Files:**
- `src/cli/commands/run.ts`
- `src/e2e/adoption-mode.test.ts` (new integration test)

**Interfaces:** consumes Tasks 3–6; no new exports.

**Steps:**

- [ ] Write the failing integration test `src/e2e/adoption-mode.test.ts` (module-level integration mirroring run.ts's wiring — this is the contract run.ts must implement):

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from 'vitest'
  import fs from 'node:fs'
  import os from 'node:os'
  import path from 'node:path'
  import { resolveAssemblyMode } from '../core/assembly/update-mode.js'
  import { loadAdoptionPreamble } from '../core/assembly/mode-loader.js'
  import {
    buildIndex, loadEntries, withAdoptionKnowledge,
  } from '../core/assembly/knowledge-loader.js'
  import { AssemblyEngine } from '../core/assembly/engine.js'
  import { getPackageKnowledgeDir } from '../utils/fs.js'
  import type {
    PipelineState, ScaffoldConfig, MetaPromptFile,
  } from '../types/index.js'

  function makeState(initMode: PipelineState['init-mode']): PipelineState {
    return {
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'deep', config_methodology: 'deep',
      'init-mode': initMode, created: '2026-07-19T00:00:00.000Z',
      in_progress: null,
      steps: { 'tech-stack': { status: 'pending', source: 'pipeline', produces: ['docs/tech-stack.md'] } },
      next_eligible: [], 'extra-steps': [],
    }
  }

  const config: ScaffoldConfig = { version: 2, methodology: 'deep', platforms: ['claude-code'] }

  const metaPrompt: MetaPromptFile = {
    stepName: 'tech-stack',
    filePath: '/content/pipeline/foundation/tech-stack.md',
    frontmatter: {
      name: 'tech-stack', description: 'test', phase: 'foundation', order: 220,
      dependencies: [], outputs: ['docs/tech-stack.md'], conditional: null,
      knowledgeBase: ['tech-stack-selection'], reads: [], stateless: false,
      category: 'pipeline',
    },
    body: 'Research and document the stack.',
    sections: {},
  }

  let tmpDir: string
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-e2e-')) })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  describe('adoption-mode assembly (brownfield R3)', () => {
    it('brownfield + pending step assembles with preamble and brownfield knowledge', () => {
      const state = makeState('brownfield')
      const modeResult = resolveAssemblyMode({
        step: 'tech-stack', state, currentDepth: 3, projectRoot: tmpDir,
      })
      expect(modeResult.mode).toBe('adoption')

      const { content: adoptionPreamble } = loadAdoptionPreamble()
      const index = buildIndex(getPackageKnowledgeDir())
      const names = withAdoptionKnowledge(metaPrompt.frontmatter.knowledgeBase, modeResult.mode)
      expect(names).toContain('brownfield-adoption')
      const { entries } = loadEntries(index, names)

      const result = new AssemblyEngine().assemble('tech-stack', {
        config, state, metaPrompt, knowledgeEntries: entries,
        instructions: { global: null, perStep: null, inline: null },
        depth: 3, depthProvenance: 'preset-default',
        updateMode: false,
        assemblyMode: modeResult.mode,
        adoptionPreamble: adoptionPreamble ?? undefined,
      })
      expect(result.success).toBe(true)
      expect(result.prompt!.text).toContain('### Adoption Mode')
      expect(result.prompt!.text).toContain('Read the repository first')
      expect(result.prompt!.text).toContain('brownfield-adoption')
      expect(result.prompt!.metadata.assemblyMode).toBe('adoption')
    })

    it('greenfield + pending step assembles fresh with no adoption content', () => {
      const state = makeState('greenfield')
      const modeResult = resolveAssemblyMode({
        step: 'tech-stack', state, currentDepth: 3, projectRoot: tmpDir,
      })
      expect(modeResult.mode).toBe('fresh')
      const names = withAdoptionKnowledge(metaPrompt.frontmatter.knowledgeBase, modeResult.mode)
      expect(names).not.toContain('brownfield-adoption')
    })
  })
  ```

- [ ] Run: `npx vitest run src/e2e/adoption-mode.test.ts` — green already if Tasks 3–6 are complete (this test locks the contract); if anything fails, fix the earlier task, not the test.
- [ ] Rewire `src/cli/commands/run.ts` (Step 6 and Step 8 regions):
  - Replace the `detectUpdateMode` import with `resolveAssemblyMode` (from the same module) and `loadAdoptionPreamble` (from `../../core/assembly/mode-loader.js`), and add `withAdoptionKnowledge` to the knowledge-loader import.
  - Replace the Step 6 detection call:

    ```ts
    const modeResult = resolveAssemblyMode({
      step, state, currentDepth: depth, projectRoot, service,
      artifactMap: config.artifact_map,
    })
    const isUpdate = modeResult.mode === 'update'
    ```

    Rekey the existing confirmation block on `isUpdate` and `modeResult.warnings` (mechanical rename from `updateModeResult.isUpdateMode`), and add after it:

    ```ts
    if (modeResult.mode === 'adoption' && outputMode === 'interactive') {
      output.info(`Running step '${step}' in adoption mode (init-mode: ${state['init-mode']})`)
    }
    ```

  - In Step 8, load the preamble only when needed:

    ```ts
    let adoptionPreamble: string | undefined
    if (modeResult.mode === 'adoption') {
      const preamble = loadAdoptionPreamble(projectRoot)
      for (const w of preamble.warnings) output.warn(w)
      adoptionPreamble = preamble.content ?? undefined
    }
    ```

    And wrap the knowledge names:

    ```ts
    const { entries: knowledgeEntries, warnings: kbWarnings } = loadEntries(
      kbIndex,
      withAdoptionKnowledge(
        pipeline.overlay.knowledge[step] ?? metaPrompt.frontmatter.knowledgeBase ?? [],
        modeResult.mode,
      ),
    )
    ```

  - In the `engine.assemble` call, replace `updateMode: updateModeResult.isUpdateMode, existingArtifact: updateModeResult.existingArtifact` with:

    ```ts
    updateMode: isUpdate,
    existingArtifact: isUpdate ? modeResult.existingArtifact : undefined,
    assemblyMode: modeResult.mode,
    adoptionPreamble,
    ```

- [ ] Run: `npx vitest run src/e2e/ src/core/assembly/ src/cli/` — all green. Then `make check-all` for a full sweep — expect exit 0.
- [ ] Commit: `feat(run): wire adoption mode into scaffold run assembly (D11 read-side of init-mode)`

---

### Task 8: `src/ingestion/` — incumbent inventory + map-candidate proposals

**Files:**
- `src/ingestion/incumbents.ts` (new)
- `src/ingestion/incumbents.test.ts` (new)
- `src/ingestion/map-candidates.ts` (new)
- `src/ingestion/map-candidates.test.ts` (new)

**Interfaces:**

```ts
export interface IncumbentInventory {
  lintConfigs: string[]; testConfigs: string[]; ciWorkflows: string[]
  composeFiles: string[]; docs: string[]
}
export function scanIncumbents(projectRoot: string): IncumbentInventory

export interface MapCandidate { step: string; target: string; evidence: string }
export const CANDIDATE_SOURCES: ReadonlyArray<{ step: string; paths: readonly string[] }>
export function proposeMapCandidates(options: {
  projectRoot: string
  resolvedSteps: readonly string[]
  satisfiedSteps: ReadonlySet<string>
  existingMap: Readonly<Record<string, string>>
}): MapCandidate[]
```

**Steps:**

- [ ] Write failing tests `src/ingestion/incumbents.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from 'vitest'
  import fs from 'node:fs'
  import os from 'node:os'
  import path from 'node:path'
  import { scanIncumbents } from './incumbents.js'

  let tmpDir: string
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'incumbents-')) })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  describe('scanIncumbents', () => {
    it('returns empty inventory for an empty project', () => {
      const inv = scanIncumbents(tmpDir)
      expect(inv).toEqual({
        lintConfigs: [], testConfigs: [], ciWorkflows: [], composeFiles: [], docs: [],
      })
    })

    it('finds lint, test, compose, workflow, and doc incumbents', () => {
      fs.writeFileSync(path.join(tmpDir, 'biome.json'), '{}')
      fs.writeFileSync(path.join(tmpDir, 'vitest.config.ts'), 'export default {}')
      fs.writeFileSync(path.join(tmpDir, 'docker-compose.yml'), 'services: {}')
      fs.mkdirSync(path.join(tmpDir, '.github/workflows'), { recursive: true })
      fs.writeFileSync(path.join(tmpDir, '.github/workflows/test.yml'), 'on: push')
      fs.mkdirSync(path.join(tmpDir, 'docs'))
      fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# c')
      fs.writeFileSync(path.join(tmpDir, 'docs/ARCHITECTURE.md'), '# a')
      const inv = scanIncumbents(tmpDir)
      expect(inv.lintConfigs).toEqual(['biome.json'])
      expect(inv.testConfigs).toEqual(['vitest.config.ts'])
      expect(inv.composeFiles).toEqual(['docker-compose.yml'])
      expect(inv.ciWorkflows).toEqual([path.join('.github', 'workflows', 'test.yml')])
      expect(inv.docs).toContain('CONTRIBUTING.md')
      expect(inv.docs).toContain(path.join('docs', 'ARCHITECTURE.md'))
    })
  })
  ```

- [ ] Write failing tests `src/ingestion/map-candidates.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from 'vitest'
  import fs from 'node:fs'
  import os from 'node:os'
  import path from 'node:path'
  import { proposeMapCandidates, CANDIDATE_SOURCES } from './map-candidates.js'

  let tmpDir: string
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapcand-')) })
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

  const ALL_STEPS = ['coding-standards', 'system-architecture', 'security', 'dev-env-setup', 'tdd']

  describe('proposeMapCandidates', () => {
    it('proposes the first existing candidate per step', () => {
      fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# c')
      fs.writeFileSync(path.join(tmpDir, 'SECURITY.md'), '# s')
      const out = proposeMapCandidates({
        projectRoot: tmpDir, resolvedSteps: ALL_STEPS,
        satisfiedSteps: new Set(), existingMap: {},
      })
      expect(out).toEqual([
        { step: 'coding-standards', target: 'CONTRIBUTING.md', evidence: 'CONTRIBUTING.md exists' },
        { step: 'security', target: 'SECURITY.md', evidence: 'SECURITY.md exists' },
      ])
    })

    it('never proposes for satisfied, already-mapped, or unresolved steps', () => {
      fs.writeFileSync(path.join(tmpDir, 'CONTRIBUTING.md'), '# c')
      fs.writeFileSync(path.join(tmpDir, 'SECURITY.md'), '# s')
      fs.writeFileSync(path.join(tmpDir, 'ARCHITECTURE.md'), '# a')
      const out = proposeMapCandidates({
        projectRoot: tmpDir,
        resolvedSteps: ['coding-standards', 'security'],      // system-architecture not resolved
        satisfiedSteps: new Set(['security']),                 // security already verified
        existingMap: { 'coding-standards': 'docs/style.md' },  // already mapped
      })
      expect(out).toEqual([])
    })

    it('README.md is never a candidate source', () => {
      for (const { paths } of CANDIDATE_SOURCES) {
        expect(paths).not.toContain('README.md')
        expect(paths).not.toContain('docs/README.md')
      }
    })
  })
  ```

- [ ] Run: `npx vitest run src/ingestion/` — FAIL (modules missing).
- [ ] Create `src/ingestion/incumbents.ts`:

  ```ts
  import fs from 'node:fs'
  import path from 'node:path'

  /**
   * Incumbent-artifact inventory (brownfield R3, D10b). Generalizes the R2
   * gate-seed parsing surface: one scan, consumed by map-candidate proposals,
   * the adoption plan, and the D7 gate component's ingestion-lite parser.
   * NOTE for the executor: if R2 landed its package.json/workflow command
   * extractor under a different module, move/re-export it from src/ingestion/
   * so this directory is the single ingestion home (spec §8: "ingestion
   * helpers shared with D7"). Locate with: git grep -ln "workflows" src/ | grep -v test
   */
  export interface IncumbentInventory {
    lintConfigs: string[]
    testConfigs: string[]
    ciWorkflows: string[]
    composeFiles: string[]
    docs: string[]
  }

  const LINT_CONFIG_NAMES = [
    '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml',
    'eslint.config.js', 'eslint.config.mjs', 'biome.json', 'biome.jsonc',
    '.prettierrc', '.prettierrc.json', '.prettierrc.yml', 'prettier.config.js',
    'ruff.toml', '.ruff.toml', '.flake8', '.golangci.yml', 'rustfmt.toml', 'clippy.toml',
  ]

  const TEST_CONFIG_NAMES = [
    'vitest.config.ts', 'vitest.config.js', 'vitest.config.mts',
    'jest.config.js', 'jest.config.ts', 'playwright.config.ts', 'playwright.config.js',
    'pytest.ini', '.mocharc.json', 'karma.conf.js',
  ]

  const COMPOSE_NAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']

  const DOC_NAMES = [
    'CONTRIBUTING.md', 'ARCHITECTURE.md', 'SECURITY.md',
    'DEVELOPMENT.md', 'TESTING.md', 'STYLEGUIDE.md',
  ]

  export function scanIncumbents(projectRoot: string): IncumbentInventory {
    const existing = (names: readonly string[], dir = ''): string[] =>
      names
        .map(n => (dir === '' ? n : path.join(dir, n)))
        .filter(rel => fs.existsSync(path.join(projectRoot, rel)))

    const ciWorkflows: string[] = []
    try {
      for (const entry of fs.readdirSync(path.join(projectRoot, '.github', 'workflows'))) {
        if (entry.endsWith('.yml') || entry.endsWith('.yaml')) {
          ciWorkflows.push(path.join('.github', 'workflows', entry))
        }
      }
    } catch {
      // no workflows directory
    }

    return {
      lintConfigs: existing(LINT_CONFIG_NAMES),
      testConfigs: existing(TEST_CONFIG_NAMES),
      ciWorkflows: ciWorkflows.sort(),
      composeFiles: [...existing(COMPOSE_NAMES), ...existing(COMPOSE_NAMES, path.join('ops', 'compose'))],
      docs: [...existing(DOC_NAMES), ...existing(DOC_NAMES, 'docs')],
    }
  }
  ```

- [ ] Create `src/ingestion/map-candidates.ts`:

  ```ts
  import fs from 'node:fs'
  import path from 'node:path'

  /** A proposed step→incumbent mapping (D10a), rendered as a plan disposition. */
  export interface MapCandidate {
    step: string
    target: string
    evidence: string
  }

  /**
   * Incumbent files that can plausibly satisfy a pipeline step (D10a).
   * Deliberately small and evidence-based. README.md is NEVER a candidate:
   * "a README exists" is exactly the any-output-exists false-positive class
   * this design removes (spec §1 — the beads/CLAUDE.md lesson).
   */
  export const CANDIDATE_SOURCES: ReadonlyArray<{ step: string; paths: readonly string[] }> = [
    { step: 'coding-standards',    paths: ['CONTRIBUTING.md', 'docs/CONTRIBUTING.md', 'STYLEGUIDE.md', 'docs/STYLEGUIDE.md'] },
    { step: 'system-architecture', paths: ['ARCHITECTURE.md', 'docs/ARCHITECTURE.md', 'docs/architecture.md'] },
    { step: 'security',            paths: ['SECURITY.md', 'docs/SECURITY.md'] },
    { step: 'dev-env-setup',       paths: ['DEVELOPMENT.md', 'docs/DEVELOPMENT.md'] },
    { step: 'tdd',                 paths: ['TESTING.md', 'docs/TESTING.md'] },
  ]

  /**
   * Propose artifact_map candidates for the adoption plan. A candidate is
   * proposed only when the step is in the resolved pipeline, is not already
   * satisfied (verified/declared complete), has no existing mapping, and the
   * incumbent file exists. First matching path wins — one proposal per step.
   * Proposals are rendered in the plan and applied only on approval (D1).
   */
  export function proposeMapCandidates(options: {
    projectRoot: string
    resolvedSteps: readonly string[]
    satisfiedSteps: ReadonlySet<string>
    existingMap: Readonly<Record<string, string>>
  }): MapCandidate[] {
    const { projectRoot, resolvedSteps, satisfiedSteps, existingMap } = options
    const resolved = new Set(resolvedSteps)
    const out: MapCandidate[] = []
    for (const { step, paths: candidatePaths } of CANDIDATE_SOURCES) {
      if (!resolved.has(step)) continue
      if (satisfiedSteps.has(step)) continue
      if (existingMap[step] !== undefined) continue
      for (const rel of candidatePaths) {
        if (fs.existsSync(path.join(projectRoot, rel))) {
          out.push({ step, target: rel, evidence: `${rel} exists` })
          break
        }
      }
    }
    return out
  }
  ```

- [ ] Run: `npx vitest run src/ingestion/` — all green.
- [ ] Commit: `feat(ingestion): incumbent inventory + map-candidate proposals (D10)`

---

### Task 9: Adoption plan — `map-candidate` disposition + `run — adoption mode` annotation

R1 ships the plan renderer with the disposition union `done (verified) | conflict | run | skip-proposed | undetectable` and the `plan_key` canonicalization over complete apply-action records (spec D1/§6.1). Expected home: `src/project/adoption-plan.ts`. **Locate instruction:** if R1 placed it elsewhere, find it with `git grep -ln "skip-proposed" src/ | grep -v test` and apply the identical changes there.

**Files:**
- `src/project/adoption-plan.ts` (extend disposition union, proposal wiring, renderer rows, mode annotation)
- `src/project/adoption-plan.test.ts` (new cases)

**Interfaces:**
- Disposition union gains `'map-candidate'`; its record carries `target: string` (inside the canonical record → inside `plan_key`).
- `run` records gain `mode: 'fresh' | 'update' | 'adoption'` (computed via `resolveAssemblyMode`; inside the canonical record → inside `plan_key`).

**Steps:**

- [ ] Write failing tests in `src/project/adoption-plan.test.ts`, following R1's existing plan-builder test fixtures (tmp project + injected state). Add:

  ```ts
  describe('map-candidate disposition (R3, D10)', () => {
    it('renders a map-candidate row when an incumbent matches an unsatisfied step', () => {
      // fixture: brownfield tmp project, CONTRIBUTING.md present,
      // coding-standards unsatisfied in the resolved pipeline
      const plan = buildAdoptionPlan(/* R1 fixture args */)
      const row = plan.steps.find(s => s.step === 'coding-standards')
      expect(row?.disposition).toBe('map-candidate')
      expect(row?.target).toBe('CONTRIBUTING.md')
    })

    it('the map-candidate target participates in plan_key', () => {
      // two otherwise-identical fixtures whose only difference is the mapped
      // target path (CONTRIBUTING.md vs docs/CONTRIBUTING.md — create both
      // files, force the proposal to each in turn)
      expect(planKeyA).not.toBe(planKeyB)
    })

    it('run rows are annotated with the resolved mode in a brownfield project', () => {
      const plan = buildAdoptionPlan(/* brownfield fixture, tech-stack unsatisfied, no incumbent */)
      const row = plan.steps.find(s => s.step === 'tech-stack')
      expect(row?.disposition).toBe('run')
      expect(row?.mode).toBe('adoption')
    })

    it('human renderer prints the annotated forms', () => {
      const text = renderAdoptionPlanText(plan)
      expect(text).toContain('map-candidate')
      expect(text).toContain('CONTRIBUTING.md')
      expect(text).toContain('run — adoption mode')
    })
  })
  ```

  (Adapt constructor/args names to R1's actual API — the assertions above are the contract; the fixture plumbing follows the file's existing tests.)
- [ ] Run: `npx vitest run src/project/adoption-plan.test.ts` — new tests FAIL.
- [ ] Implement:
  - Extend the disposition union with `'map-candidate'` and add `target?: string` (present iff disposition is `map-candidate`) plus `mode?: 'fresh' | 'update' | 'adoption'` (present iff disposition is `run`) to the step-record type. Because R1's `plan_key` hashes the canonical JSON of the complete records, both fields flow into the key with no hasher change — the second test proves it.
  - In the plan builder, after D3 verification produces per-step verdicts: call `proposeMapCandidates` (Task 8) with `resolvedSteps` = the preset-resolved pipeline, `satisfiedSteps` = steps whose verification verdict is verified/declared-complete, `existingMap` = `config.artifact_map ?? {}`. A proposed candidate sets the step's disposition to `map-candidate` with its `target` (map-candidate outranks `run`/`skip-proposed` for that step; it never overrides `done (verified)` or `conflict`).
  - For each `run` disposition, compute `mode` via `resolveAssemblyMode({ step, state, currentDepth: <resolved depth>, projectRoot, artifactMap: config.artifact_map })`.
  - Renderer rows (human format): `map-candidate` → `map-candidate → <target>   (accept: --apply writes artifact_map.<step>)`; `run` → `run — <mode> mode`. JSON output carries `target` and `mode` verbatim.
- [ ] Run: `npx vitest run src/project/adoption-plan.test.ts` — all green; also `npx vitest run src/project/` to confirm no R1 plan tests regressed.
- [ ] Commit: `feat(adopt): map-candidate disposition + run-mode annotation in adoption plan (D10, §6.1)`

---

### Task 10: Apply approved mappings — config write + honest re-verification

R1 ships the `--apply` executor with the `plan_key` re-render/abort contract. Expected home: `src/cli/commands/adopt.ts` (apply handler). **Locate instruction:** `git grep -ln "plan_key\|planKey" src/cli src/project | grep -v test`.

**Files:**
- `src/cli/commands/adopt.ts` (add `applyArtifactMappings`; call it from the apply path)
- `src/cli/commands/adopt.test.ts` (new cases; create if absent — the yaml round-trip logic is unit-testable in isolation)

**Interfaces:**

```ts
export function applyArtifactMappings(
  projectRoot: string,
  mappings: ReadonlyArray<{ step: string; target: string }>,
): void
```

**Steps:**

- [ ] Write failing tests:

  ```ts
  describe('applyArtifactMappings (D10a apply)', () => {
    it('writes artifact_map entries into config.yml preserving existing content', () => {
      writeConfig(`# scaffold config\nversion: 2\nmethodology: deep\nproject:\n  projectType: cli\n`)
      applyArtifactMappings(tmpDir, [{ step: 'coding-standards', target: 'CONTRIBUTING.md' }])
      const text = fs.readFileSync(path.join(tmpDir, '.scaffold/config.yml'), 'utf8')
      expect(text).toContain('artifact_map:')
      expect(text).toContain('coding-standards: CONTRIBUTING.md')
      expect(text).toContain('# scaffold config')       // comments preserved (AST edit)
      expect(text).toContain('projectType: cli')        // existing content preserved
    })

    it('is idempotent — re-applying the same mapping produces identical config', () => {
      writeConfig(`version: 2\nmethodology: deep\n`)
      applyArtifactMappings(tmpDir, [{ step: 'security', target: 'SECURITY.md' }])
      const first = fs.readFileSync(path.join(tmpDir, '.scaffold/config.yml'), 'utf8')
      applyArtifactMappings(tmpDir, [{ step: 'security', target: 'SECURITY.md' }])
      const second = fs.readFileSync(path.join(tmpDir, '.scaffold/config.yml'), 'utf8')
      expect(second).toBe(first)
    })

    it('no-ops on an empty mapping list', () => {
      writeConfig(`version: 2\nmethodology: deep\n`)
      const before = fs.readFileSync(path.join(tmpDir, '.scaffold/config.yml'), 'utf8')
      applyArtifactMappings(tmpDir, [])
      expect(fs.readFileSync(path.join(tmpDir, '.scaffold/config.yml'), 'utf8')).toBe(before)
    })
  })
  ```

- [ ] Run: `npx vitest run src/cli/commands/adopt.test.ts` — FAIL.
- [ ] Implement in `src/cli/commands/adopt.ts`, next to `writeOrUpdateConfig` (same `parseDocument` + `atomicWriteFileSync` pattern):

  ```ts
  /**
   * D10a apply: persist approved map-candidate dispositions into
   * .scaffold/config.yml `artifact_map`. AST edit (comments and existing
   * content preserved), atomic write. Callers must only pass mappings the
   * approved plan showed (plan_key enforcement happens in the apply driver).
   */
  export function applyArtifactMappings(
    projectRoot: string,
    mappings: ReadonlyArray<{ step: string; target: string }>,
  ): void {
    if (mappings.length === 0) return
    const configPath = path.join(projectRoot, '.scaffold', 'config.yml')
    const doc = parseDocument(fs.readFileSync(configPath, 'utf8'))
    if (doc.errors.length > 0) {
      throw configParseError(configPath, doc.errors[0].message)
    }
    for (const { step, target } of mappings) {
      doc.setIn(['artifact_map', step], target)
    }
    atomicWriteFileSync(configPath, doc.toString())
  }
  ```

- [ ] Wire the apply driver: where R1's apply path iterates approved dispositions, handle `map-candidate` as: (1) collect all approved mappings and call `applyArtifactMappings` once; (2) **re-run D3 verification for each mapped step with the updated map** (Task 2's `artifactMap` param); (3) only when verification passes, record the step `completed` / `verification: 'verified'` through R1's state-write path — a mapping whose verification still fails (e.g. the file vanished between plan and apply) leaves the step `pending` and surfaces a warning. Apply never blind-writes `completed` from the disposition alone — completion is always the verification result. Add one integration assertion to the R1 apply test suite: approved map-candidate ⇒ config contains the mapping AND state shows `completed`/`verified` for the step.
- [ ] Run: `npx vitest run src/cli/commands/adopt.test.ts src/project/` — all green.
- [ ] Commit: `feat(adopt): apply approved artifact mappings with honest re-verification (D10a)`

---

### Task 11: Adoption-blocks eval + content batch 1 (tech-stack, coding-standards, tdd, project-structure, beads)

**Files:**
- `tests/evals/adoption-mode-specifics.bats` (new)
- `content/pipeline/foundation/tech-stack.md`
- `content/pipeline/foundation/coding-standards.md`
- `content/pipeline/foundation/tdd.md`
- `content/pipeline/foundation/project-structure.md`
- `content/pipeline/foundation/beads.md`

**Interfaces:** the eval's `ADOPTION_STEP_FILES` manifest is the machine-readable home of the pinned 18-step list; it grows per batch and Tasks 12–14 extend it.

**Steps:**

- [ ] Create `tests/evals/adoption-mode-specifics.bats`:

  ```bash
  #!/usr/bin/env bats
  # Eval: Adoption Mode Specifics block convention (brownfield R3, D11)
  # Guards: (1) every adoption-capable step carries exactly one
  # "## Adoption Mode Specifics" block; (2) ordering — Mode Detection before
  # Update Mode Specifics before Adoption Mode Specifics; (3) required bullets
  # present; (4) pipeline-wide consistency for any file carrying the block.
  # The ADOPTION_STEP_FILES manifest is the pinned adoption-capable list from
  # docs/superpowers/plans/2026-07-19-brownfield-r3-adoption-mode.md.

  setup() {
    load eval_helper
  }

  # Grows with each authoring batch; final list is the 18 adoption-capable steps.
  ADOPTION_STEP_FILES=(
    "foundation/tech-stack.md"
    "foundation/coding-standards.md"
    "foundation/tdd.md"
    "foundation/project-structure.md"
    "foundation/beads.md"
  )

  @test "adoption-capable steps carry exactly one Adoption Mode Specifics block" {
    local failures=()
    for rel in "${ADOPTION_STEP_FILES[@]}"; do
      local f="${PROJECT_ROOT}/content/pipeline/${rel}"
      if [[ ! -f "$f" ]]; then
        failures+=("$rel: file missing")
        continue
      fi
      local count
      count="$(grep -c '^## Adoption Mode Specifics$' "$f" || true)"
      [[ "$count" -eq 1 ]] || failures+=("$rel: expected 1 block, found ${count}")
    done
    if [[ ${#failures[@]} -gt 0 ]]; then
      printf "Adoption Mode Specifics presence failures:\n"
      printf "  %s\n" "${failures[@]}"
      return 1
    fi
  }

  @test "any Adoption Mode Specifics block follows Mode Detection and Update Mode Specifics" {
    local failures=()
    while IFS= read -r file; do
      grep -q '^## Adoption Mode Specifics$' "$file" || continue
      local md ums ams
      md="$(grep -n '^## Mode Detection' "$file" | head -1 | cut -d: -f1)"
      ums="$(grep -n '^## Update Mode Specifics' "$file" | head -1 | cut -d: -f1)"
      ams="$(grep -n '^## Adoption Mode Specifics$' "$file" | head -1 | cut -d: -f1)"
      if [[ -z "$md" || -z "$ums" ]]; then
        failures+=("$(basename "$file"): has Adoption block but missing Mode Detection or Update Mode Specifics")
        continue
      fi
      if ! [[ "$md" -lt "$ums" && "$ums" -lt "$ams" ]]; then
        failures+=("$(basename "$file"): ordering violated (MD:${md} UMS:${ums} AMS:${ams})")
      fi
    done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)
    if [[ ${#failures[@]} -gt 0 ]]; then
      printf "Adoption block ordering failures:\n"
      printf "  %s\n" "${failures[@]}"
      return 1
    fi
  }

  @test "Adoption Mode Specifics blocks carry the required bullets" {
    local failures=()
    while IFS= read -r file; do
      grep -q '^## Adoption Mode Specifics$' "$file" || continue
      local section
      section="$(awk '/^## Adoption Mode Specifics$/{found=1; next} /^## /{if(found) exit} found{print}' "$file")"
      for marker in '\*\*Codify from repo evidence\*\*' '\*\*Interview only for\*\*' '\*\*Do not\*\*'; do
        if ! echo "$section" | grep -qE "$marker"; then
          failures+=("$(basename "$file"): missing required bullet ${marker//\\/}")
        fi
      done
    done < <(find "${PROJECT_ROOT}/content/pipeline" -name '*.md' -type f)
    if [[ ${#failures[@]} -gt 0 ]]; then
      printf "Adoption block bullet failures:\n"
      printf "  %s\n" "${failures[@]}"
      return 1
    fi
  }
  ```

- [ ] Run: `npx bats tests/evals/adoption-mode-specifics.bats` — expect test 1 to FAIL for all five files (blocks absent). Tests 2–3 pass vacuously.
- [ ] Append to `content/pipeline/foundation/tech-stack.md` (at end of file — Update Mode Specifics is its last section):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the stack as-installed — languages and
    versions from lockfiles (package-lock.json / pnpm-lock.yaml / poetry.lock /
    go.mod / Cargo.toml), frameworks and databases from actual imports and
    config files, hosting and deploy targets from infra manifests (Dockerfile,
    fly.toml, vercel.json, .github/workflows). Record versions from lockfile
    evidence, never from memory or the README.
  - **Interview only for**: planned migrations or upgrades, known pain points
    with current choices, deploy-target intent the manifests don't show, and
    constraints on adding new dependencies.
  - **Ingest with provenance**: translate the dependency manifest into the
    Quick Reference section with a provenance annotation; competitive-analysis
    sections cover only genuinely open decisions, never already-made ones.
  - **Do not**: propose replacing any working technology, or present
    alternatives for choices the codebase has already made — document each
    incumbent choice as a decision with its observed rationale, and record any
    concern as a gap, not a migration plan.
  ```

- [ ] Append to `content/pipeline/foundation/coding-standards.md` (at end of file):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the conventions the code already follows —
    read incumbent linter/formatter configs (.eslintrc*, eslint.config.*,
    biome.json, .prettierrc*, ruff.toml), sample real source files for naming,
    import, and error-handling patterns, and derive the commit-message
    convention from `git log --oneline -50` (conventional-commit adherence is
    measured, not assumed).
  - **Interview only for**: whether observed inconsistencies are deliberate,
    which currently-unenforced rules the team wants tightened going forward,
    and whether new lint rules apply to new code only or to the whole repo.
  - **Ingest with provenance**: translate the incumbent lint/formatter config
    into the standards document with provenance annotations; when
    `artifact_map` maps this step to an incumbent doc (e.g. CONTRIBUTING.md),
    treat that doc as the prior artifact and extend it rather than starting
    over.
  - **Do not**: generate a new linter config when one exists (extend the
    incumbent); propose repo-wide reformatting sweeps; write standards the
    existing codebase violates without marking them "new code only".
  ```

- [ ] Append to `content/pipeline/foundation/tdd.md` (after the Update Mode Specifics section, per the Global Constraints placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the test stack as-built — runner and config
    (vitest/jest/pytest/playwright config files), observed test directory
    layout and naming, coverage thresholds already configured, and which CI
    workflow steps actually run tests.
  - **Interview only for**: target coverage goals versus the measured current
    baseline, which untested areas matter most to the user, and appetite for
    TDD on new work versus retrofitting tests onto existing code.
  - **Do not**: prescribe a different test runner; set coverage gates the
    current suite immediately fails (ratchet upward from the measured baseline
    instead); mark legacy untested modules as rewrite candidates — record them
    as coverage gaps with evidence.
  ```

- [ ] Append to `content/pipeline/foundation/project-structure.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the directory layout as it exists — the
    real tree, observed module boundaries, where each file type actually
    lives, and the import/barrel conventions in use. In adoption mode this
    document describes the incumbent structure; it does not design a new one,
    and no directories are scaffolded.
  - **Interview only for**: which boundaries are intentional versus
    accidental, where new feature code should go, and growth areas that need
    placement rules the current tree doesn't yet show.
  - **Do not**: propose moving or renaming existing directories; scaffold
    placeholder directories into an established tree; impose a module
    organization strategy that contradicts the observed one.
  ```

- [ ] Append to `content/pipeline/foundation/beads.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the incumbent task-tracking surface —
    existing GitHub issues usage (`gh issue list --limit 20`), TODO/BACKLOG
    files, and any existing CLAUDE.md/AGENTS.md content this step would
    normally create. Beads initialization itself proceeds as in fresh mode (a
    brownfield repo without `.beads/` genuinely needs `bd init`), but all
    CLAUDE.md content merges around what already exists.
  - **Interview only for**: whether open incumbent TODOs/issues should be
    imported as beads now, later, or not at all; and which existing CLAUDE.md
    workflow conventions must survive verbatim.
  - **Do not**: overwrite or restructure an existing CLAUDE.md (insert
    scaffold sections around incumbent content); bulk-import historical
    closed issues; create duplicate tracking — if the team keeps GitHub
    issues for external reports, document the division of labor between
    issues and beads.
  ```

- [ ] Run: `npx bats tests/evals/adoption-mode-specifics.bats` — expect `ok` ×3. Then `npx bats tests/evals/update-mode-specifics-paths.bats` — must remain green (the new blocks don't touch UMS Detect lines).
- [ ] Commit: `feat(content): Adoption Mode Specifics — foundation batch 1 + eval (D11)`

---

### Task 12: Content batch 2 (github-setup, dev-env-setup, git-workflow, merge-throughput, staging-environments)

**Files:**
- `tests/evals/adoption-mode-specifics.bats` (extend manifest)
- `content/pipeline/foundation/github-setup.md`
- `content/pipeline/environment/dev-env-setup.md`
- `content/pipeline/environment/git-workflow.md`
- `content/pipeline/environment/merge-throughput.md`
- `content/pipeline/environment/staging-environments.md`

**Steps:**

- [ ] Extend `ADOPTION_STEP_FILES` in the eval with:

  ```bash
    "foundation/github-setup.md"
    "environment/dev-env-setup.md"
    "environment/git-workflow.md"
    "environment/merge-throughput.md"
    "environment/staging-environments.md"
  ```

- [ ] Run: `npx bats tests/evals/adoption-mode-specifics.bats` — test 1 FAILS for the five new files.
- [ ] Add to `content/pipeline/foundation/github-setup.md` (per placement rule — after the Update Mode Specifics section and its trailing `###` subsections, before the next `##` heading or at EOF):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the hosting state as it exists — remote URL
    and visibility (`git remote get-url origin`, `gh repo view`), default
    branch, and branch-protection rules
    (`gh api repos/{owner}/{repo}/branches/{branch}/protection`) — recorded in
    docs/github-setup.md as facts. In adoption this step is usually already
    `done (verified)` via its detect contract; this block governs the residual
    cases.
  - **Interview only for**: nothing, when a pushed remote already exists; for
    a local-only repository, only the visibility choice (private default)
    before the first push.
  - **Do not**: create a second remote or rename `origin`; change visibility
    or branch-protection settings; push a never-pushed history without the
    secret scan the Update Mode Specifics above already requires.
  ```

- [ ] Add to `content/pipeline/environment/dev-env-setup.md` (insert immediately before the `## Instructions` heading):

  ```markdown
  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the dev workflow that already works —
    existing package.json scripts and Makefile targets under their current
    names, real .env.example variables, incumbent database setup, and the
    observed first-clone steps. The Key Commands table documents incumbent
    commands with their existing names, each row still marked
    Agent-safe/Ask-first.
  - **Interview only for**: which incumbent command is the canonical dev entry
    point when several exist, current setup pain points, and the
    classification of environment-sensitive suites (e.g. visual regression)
    that must stay out of the merge gate.
  - **Ingest with provenance**: package.json scripts and CI workflow test/lint
    commands are the seed candidates for the `check` / `check-affected` gate
    targets (the same inventory the agent-ops gate component ingests) —
    present them for confirmation, mapped from their source with provenance
    annotations.
  - **Do not**: rename or replace working scripts/targets; add a duplicate
    target when an incumbent exists under another name (alias it instead);
    regenerate .env.example from scratch when one exists — append missing
    variables only.

  ```

- [ ] Add to `content/pipeline/environment/git-workflow.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the collaboration patterns git history
    proves — branch naming from recent branches
    (`git branch -a --sort=-committerdate`), merge style from
    `git log --merges --oneline -30` (squash versus merge commits), the
    existing PR template, hooks already installed, and protected-branch
    rules. Document the incumbent workflow before layering the
    parallel-agent machinery on top of it.
  - **Interview only for**: willingness to move to squash-merge and
    one-branch-per-task where history shows another style; how many parallel
    agents are expected (drives the worktree and queue decisions); and which
    incumbent hooks must be preserved.
  - **Ingest with provenance**: an existing .github/pull_request_template.md
    is extended, not replaced, with provenance annotations on added sections.
  - **Do not**: rewrite commit-format conventions retroactively or demand
    history cleanup; overwrite existing git hooks (scaffold hooks are merged
    alongside via `scaffold hooks install`); force any branch renames.
  ```

- [ ] Add to `content/pipeline/environment/merge-throughput.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the merge pressure that actually exists —
    open-PR count, merges per day from
    `git log --merges --since='2 weeks ago' --oneline`, and the measured gate
    duration from CI logs or a timed local `make check`. Install the queue
    because the measured cadence needs it, never because the step exists.
  - **Interview only for**: expected concurrent agents going forward (3+ is
    the signal; solo cadence keeps `bd merge-slot`), and which suites are
    environment-sensitive and must be excluded from the queue gate.
  - **Do not**: enqueue-gate suites the local environment cannot run
    deterministically (the visual-regression lesson); replace an incumbent CI
    merge gate without documenting the division of responsibility between it
    and the local queue; install the queue speculatively on a solo project.
  ```

- [ ] Add to `content/pipeline/environment/staging-environments.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the incumbent container topology — existing
    compose files, their services, published ports, volumes, and healthchecks.
    The per-worktree service list starts from what the incumbent compose
    actually runs, not from the tech-stack doc alone.
  - **Interview only for**: which services agents genuinely need per-worktree
    versus shared, and whether existing published ports are load-bearing for
    other tools (port bands must avoid them).
  - **Ingest with provenance**: translate incumbent compose services into the
    staging compose with provenance annotations; anything not translatable
    (host-mounted secrets, external networks) is listed under "Not
    translated" with the reason — never guessed.
  - **Do not**: rebind or renumber ports the incumbent stack already
    publishes; replace the incumbent compose file (the staging compose is
    layered alongside it); copy production credentials into staging
    configuration.
  ```

- [ ] Run: `npx bats tests/evals/adoption-mode-specifics.bats` — `ok` ×3 (ten files now enforced).
- [ ] Commit: `feat(content): Adoption Mode Specifics — batch 2, github-setup + environment core (D11)`

---

### Task 13: Content batch 3 (design-system, ai-memory-setup, automated-pr-review, create-prd, create-vision)

**Files:**
- `tests/evals/adoption-mode-specifics.bats` (extend manifest)
- `content/pipeline/environment/design-system.md`
- `content/pipeline/environment/ai-memory-setup.md`
- `content/pipeline/environment/automated-pr-review.md`
- `content/pipeline/pre/create-prd.md`
- `content/pipeline/vision/create-vision.md`

**Steps:**

- [ ] Extend `ADOPTION_STEP_FILES` with:

  ```bash
    "environment/design-system.md"
    "environment/ai-memory-setup.md"
    "environment/automated-pr-review.md"
    "pre/create-prd.md"
    "vision/create-vision.md"
  ```

- [ ] Run: `npx bats tests/evals/adoption-mode-specifics.bats` — test 1 FAILS for the five new files.
- [ ] Add to `content/pipeline/environment/design-system.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the visual language already shipped —
    existing token sources (tailwind.config, CSS custom properties, theme
    files), the fonts and color values in actual use, and recurring component
    patterns in the UI code. The document names what exists before proposing
    anything.
  - **Interview only for**: which current visuals are intentional brand
    decisions versus accidents — this is the one step where the user may want
    change, but every change is opt-in per token, never assumed.
  - **Ingest with provenance**: fold incumbent token definitions into the
    design-system doc with provenance annotations; record WCAG contrast
    measurements of the existing palette as findings, not as automatic
    changes.
  - **Do not**: restyle working UI; introduce a parallel token system when one
    exists (extend the incumbent scale); swap fonts or palette values without
    explicit approval.
  ```

- [ ] Add to `content/pipeline/environment/ai-memory-setup.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: incumbent agent-instruction surfaces —
    existing CLAUDE.md, AGENTS.md, .cursorrules, and
    .github/copilot-instructions.md — and extract rules from the incumbent
    human docs (README, CONTRIBUTING) as well as scaffold-generated docs: in
    a brownfield repo the incumbent docs carry the real conventions.
  - **Interview only for**: which agent harnesses the team actually uses
    (determines which rule surfaces to generate), and which incumbent
    instructions are stale versus load-bearing.
  - **Do not**: overwrite incumbent instruction files (layer .claude/rules/
    alongside and cross-link); copy whole incumbent docs into rules — extract
    the rule and cite the source, the 500-line budget still applies; delete
    stale-looking instructions without confirmation.
  ```

- [ ] Add to `content/pipeline/environment/automated-pr-review.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: review automation already in place —
    CODEOWNERS, existing review bots or GitHub Actions review workflows, and
    branch-protection review requirements. Document the incumbent review path
    before adding MMR.
  - **Interview only for**: whether incumbent review automation stays (and how
    MMR divides responsibility with it), and the team's severity threshold for
    blocking findings on a codebase with long-standing patterns.
  - **Do not**: disable or bypass incumbent review requirements; double-report
    the same findings through two channels without documenting which one
    gates; treat pre-existing incumbent code patterns as review findings on
    unrelated PRs.
  ```

- [ ] Add to `content/pipeline/pre/create-prd.md` (per placement rule — after the Update Mode Specifics section and its trailing `###` subsections, i.e. at end of file):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: what the product demonstrably is — features
    from the routes, screens, or commands in the code, README claims verified
    against the implementation, and existing product docs. Write the
    current-capabilities baseline from this evidence, each item citing its
    source, before any forward-looking requirements.
  - **Interview only for**: intent the repo cannot show — target users and
    their priorities, the roadmap, what is missing or broken from the user's
    perspective, and success criteria going forward.
  - **Do not**: invent requirements without code or user evidence; blend
    shipped behavior and aspirations into one undifferentiated feature list —
    keep "Current capabilities (as-built)" and "Planned" sections distinct;
    re-spec removed-but-still-documented features instead of marking them
    removed.
  ```

- [ ] Add to `content/pipeline/vision/create-vision.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: positioning evidence only — the README
    pitch, package or app-store descriptions, and any marketing copy in the
    repo — as seed material. This step stays interview-led in adoption mode:
    vision is intent, and code cannot answer intent.
  - **Interview only for**: essentially everything — who it's for,
    differentiation, and what success looks like — using repo evidence to
    sharpen the questions ("the README targets X; is that still the
    audience?") rather than to answer them.
  - **Do not**: reverse-engineer a vision from the code and present it as the
    user's strategy; treat incumbent marketing copy as validated positioning
    without confirmation; skip the vision interview because the product
    already exists.
  ```

- [ ] Run: `npx bats tests/evals/adoption-mode-specifics.bats` — `ok` ×3 (fifteen files enforced).
- [ ] Commit: `feat(content): Adoption Mode Specifics — batch 3, design/memory/review + product docs (D11)`

---

### Task 14: Content batch 4 (domain-modeling, system-architecture, security) + full-manifest lock

**Files:**
- `tests/evals/adoption-mode-specifics.bats` (extend manifest + count lock)
- `content/pipeline/modeling/domain-modeling.md`
- `content/pipeline/architecture/system-architecture.md`
- `content/pipeline/quality/security.md`

**Steps:**

- [ ] Extend `ADOPTION_STEP_FILES` with:

  ```bash
    "modeling/domain-modeling.md"
    "architecture/system-architecture.md"
    "quality/security.md"
  ```

  and add the count lock as a fourth test:

  ```bash
  @test "the adoption-capable manifest is the pinned 18-step list" {
    [[ "${#ADOPTION_STEP_FILES[@]}" -eq 18 ]] || {
      printf "expected 18 adoption-capable files, manifest has %d\n" "${#ADOPTION_STEP_FILES[@]}"
      return 1
    }
  }
  ```

- [ ] Run: `npx bats tests/evals/adoption-mode-specifics.bats` — test 1 FAILS for the three new files; count lock passes.
- [ ] Add to `content/pipeline/modeling/domain-modeling.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the domain the code already speaks —
    entities from the database schema and migrations, model/type definitions,
    API resource names, and event names in the codebase. The ubiquitous
    language starts from the names in the code; the model documents what those
    names mean and how they relate, with file-path evidence per entity.
  - **Interview only for**: invariants the code cannot express (business
    rules enforced socially or not at all), mismatches between code names and
    the words the team actually uses, and which aggregates are load-bearing
    versus vestigial.
  - **Do not**: rename existing code concepts to fit textbook DDD vocabulary
    (document the mapping between code name and team term instead); model
    aspirational entities with no code or story evidence; declare aggregate
    boundaries the persistence layer contradicts without flagging the
    conflict.
  ```

- [ ] Add to `content/pipeline/architecture/system-architecture.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: the architecture as-built — components from
    the real module tree, data flows traced through imports and configuration,
    integration points from client/SDK usage, and deployment topology from
    infra manifests. Every component section cites the directories and files
    it describes.
  - **Interview only for**: known pain points, scaling concerns, and the
    intended target architecture where it differs from as-built — captured in
    a clearly separated "Evolution" section, never blended into the as-built
    description.
  - **Do not**: propose restructuring working modules; document an idealized
    architecture the code contradicts; treat undocumented-but-working
    structure as a defect — absence of a diagram is not absence of a design.
  ```

- [ ] Add to `content/pipeline/quality/security.md` (per placement rule):

  ```markdown

  ## Adoption Mode Specifics
  - **Codify from repo evidence**: controls as-implemented — auth middleware
    and session handling from the code, input validation at trust boundaries,
    secrets handling (env files, vaults, CI secrets), dependency audit state
    (`npm audit` / `pip-audit` output), and any existing SECURITY.md policy.
    The threat model covers the system that exists, with evidence per
    control.
  - **Interview only for**: risk appetite and compliance obligations (they are
    not in the code), known past incidents, and which of the pre-existing gaps
    the user wants prioritized.
  - **Do not**: file long-standing accepted risks as new blockers without
    marking them pre-existing; propose rewrites of working auth flows —
    record gaps with evidence and severity instead; weaken or "simplify" any
    existing control.
  ```

- [ ] Run: `npx bats tests/evals/adoption-mode-specifics.bats` — all 4 tests `ok`; all 18 files enforced. Then run the neighboring content evals to prove no regression: `npx bats tests/evals/update-mode-specifics-paths.bats tests/evals/prompt-quality.bats tests/evals/pipeline-completeness.bats` — all `ok`.
- [ ] Commit: `feat(content): Adoption Mode Specifics — batch 4, modeling/architecture/security; 18-step manifest locked (D11)`

---

### Task 15: Document the convention — CLAUDE.md editing guidelines

**Files:**
- `CLAUDE.md` (Editing Guidelines section)

**Steps:**

- [ ] In CLAUDE.md's **Editing Guidelines** section, after the existing bullet about Mode Detection + Update Mode Specifics blocks, add:

  ```markdown
  - Adoption-capable steps (18 initially — the pinned list lives in
    `tests/evals/adoption-mode-specifics.bats`) additionally carry an
    `## Adoption Mode Specifics` block placed after the Update Mode Specifics
    section ends (after its bullets and any `###` subsections, before the next
    `##` heading or at end of file). Required bullets: **Codify from repo
    evidence**, **Interview only for**, **Do not**; optional: **Ingest with
    provenance**. The global adoption-mode preamble lives in
    `content/modes/adoption.md` and is injected at assembly time for steps
    resolving to adoption mode — per-step blocks carry only what differs from
    it. When adding an adoption block to a new step, add the file to the
    eval's `ADOPTION_STEP_FILES` manifest.
  ```

- [ ] Verify the eval still gates the claim: `npx bats tests/evals/adoption-mode-specifics.bats` — `ok` ×4.
- [ ] Commit: `docs(claude-md): adoption-mode block convention in editing guidelines (D11)`

---

### Task 16: CHANGELOG + README

**Files:**
- `CHANGELOG.md`
- `README.md` (brownfield / `scaffold adopt` section)

**Steps:**

- [ ] Add the R3 entry at the top of `CHANGELOG.md` (version number per the release mapping — nominally the third minor after R1; confirm against the actual R1/R2 released versions and the operations runbook before tagging):

  ```markdown
  ## [Unreleased] — brownfield R3 (Tier B): adoption mode + ingestion

  ### Added
  - **Adoption mode (D11).** A third assembly mode alongside fresh/update.
    Steps with no surviving scaffold completion in a project with
    `init-mode: brownfield` (or `v1-migration`) now assemble with a global
    adoption-mode preamble (`content/modes/adoption.md`: read the repo first,
    extract facts with evidence, interview only for intent gaps, never propose
    rewrites of working code), per-step `## Adoption Mode Specifics` blocks on
    the initial 18 adoption-capable steps, and an automatically injected
    `brownfield-adoption` knowledge entry. This completes the `init-mode`
    staging announced in R1 — the field now changes prompt content.
  - **`artifact_map` (D10a).** `.scaffold/config.yml` can map a step to an
    incumbent artifact (`coding-standards: CONTRIBUTING.md`); D3 verification
    accepts the incumbent, and update-mode runs treat it as the prior
    artifact. The adoption plan proposes mappings as `map-candidate`
    dispositions (target path inside `plan_key` — changing a proposal forces
    re-approval); `adopt --apply` writes approved mappings and re-verifies
    honestly.
  - **Ingestion framework (D10b).** `src/ingestion/` generalizes R2's gate
    seeding into a reusable incumbent inventory (lint configs, CI workflows,
    test configs, compose files, docs); adoption-mode prompts translate
    incumbents with provenance annotations and list what cannot translate.
  - **Plan annotation.** `run` dispositions in the adoption plan now carry the
    resolved mode (`run — adoption mode`).

  ### Changed
  - Update mode now requires the step's completion to survive verification as
    `verified` or `declared` (D3 matrix). Greenfield behavior is unchanged
    (completed steps with outputs migrate to `declared`).
  ```

- [ ] In `README.md`, in the section covering brownfield adoption / `scaffold adopt`, append:

  ```markdown
  In a brownfield project, pipeline steps that have not already been satisfied
  run in **adoption mode**: prompts instruct the agent to read the repository
  first, codify what exists with evidence, interview only for intent gaps, and
  never propose rewrites of working code. Existing documents can satisfy steps
  outright via `artifact_map` in `.scaffold/config.yml` — the adoption plan
  proposes these mappings as `map-candidate` rows for approval.
  ```

  (Place it where the adopt plan/apply flow is described; match the surrounding tone.)
- [ ] Commit: `docs: CHANGELOG + README for brownfield R3 adoption mode (D16)`

---

### Task 17: Full-gate verification

**Files:** none (verification only; fix anything red in place).

**Steps:**

- [ ] Run the TypeScript suite: `npx vitest run` — expect 0 failures.
- [ ] Run the full quality gates: `make check-all` — expect exit 0 (ShellCheck, frontmatter validation, full bats suite including all evals, TypeScript gates). Known-sensitive evals to watch: `knowledge-quality.bats` (the new entry must be ≥200 lines with ≥1 code block and exempted from the orphan check), `knowledge-injection.bats` (Summary ⇒ Deep Guidance pairing), `update-mode-specifics-paths.bats` (untouched UMS Detect lines), `adoption-mode-specifics.bats` (18/18).
- [ ] If any gate fails: fix the root cause (per CLAUDE.md — no exemption-padding to silence a legitimate finding), re-run `make check-all` to green.
- [ ] Review the full branch diff against the Global Constraints section of this plan: every constraint either implemented or explicitly N/A; grep the diff for stray `TODO`/`FIXME`/placeholder text introduced by this work: `git diff origin/main...HEAD | grep -nE "TODO|FIXME|PLACEHOLDER"` — expect no new hits from this plan's files.
- [ ] Commit any final fixes: `test: green make check-all for brownfield R3`

---

## Execution notes

- **Branching/PR:** per the spec's release mapping (§10), this plan is one PR on a fresh branch off `main` (after R1 and R2 have merged), with mandatory MMR review after `gh pr create` and the scaffold release flow per the operations runbook.
- **Dependency order:** Tasks 1–2 are independent of 3–7 but both precede 9–10; Tasks 11–14 (content) only require Task 5's preamble to exist conceptually and can run in parallel with 8–10; Task 15+ last.
- **R1/R2 drift:** wherever this plan pins an expected R1/R2 module path (`src/project/adoption-plan.ts`, the apply driver in `src/cli/commands/adopt.ts`, `verifyStep`/`runDetect` in `src/state/completion.ts`), the accompanying locate instruction is authoritative — apply the specified change at the actual location; the change content itself does not vary.
