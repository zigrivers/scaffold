import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StateManager } from '../../state/state-manager.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  resolveDirectCrossRead, resolveTransitiveCrossReads, resolveCrossReadReadiness,
} from './cross-reads.js'
import type {
  ScaffoldConfig, PipelineState, ArtifactEntry, MetaPromptFile,
} from '../../types/index.js'
import type { OutputContext } from '../../cli/output/context.js'

interface CapturedWarning {
  raw: unknown
  asString: string
}

function mkOutput(): { warnings: CapturedWarning[]; output: OutputContext } {
  const warnings: CapturedWarning[] = []
  const output = {
    warn: (w: unknown) => {
      let asString = ''
      if (typeof w === 'string') asString = w
      else if (w && typeof w === 'object' && 'message' in w) {
        asString =
          String((w as { code?: string; message: string }).code ?? '') +
          ' ' + String((w as { message: string }).message)
      }
      warnings.push({ raw: w, asString })
    },
    info: () => {}, success: () => {}, error: () => {}, result: () => {},
    supportsInteractivePrompts: () => false,
    prompt: async () => '', confirm: async () => false,
    select: async () => '', multiSelect: async () => [],
    multiInput: async () => [],
    startSpinner: () => {}, stopSpinner: () => {},
    startProgress: () => {}, updateProgress: () => {}, stopProgress: () => {},
  } as unknown as OutputContext
  return { warnings, output }
}

function mkConfig(exports: Array<{ step: string }> | undefined): ScaffoldConfig {
  return {
    version: 2, methodology: 'deep', platforms: ['claude-code'],
    project: {
      services: [{
        name: 'shared-lib', projectType: 'library',
        libraryConfig: { visibility: 'internal' },
        ...(exports ? { exports } : {}),
      }],
    },
  } as ScaffoldConfig
}

describe('resolveDirectCrossRead', () => {
  let tmpRoot: string
  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `scaffold-cross-reads-${Date.now()}-${Math.random()}`)
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'shared-lib'), { recursive: true })
  })
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  function seedForeign(steps: Record<string, { status: string; produces?: string[] }>) {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'shared-lib', 'state.json'),
      JSON.stringify({ 'schema-version': 3, steps, next_eligible: [], in_progress: null }),
    )
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'state.json'),
      JSON.stringify({ 'schema-version': 3, steps: {}, next_eligible: [], in_progress: null }),
    )
  }

  it('happy path: returns completed + artifacts for an exported + completed step', () => {
    fs.mkdirSync(path.join(tmpRoot, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'api.md'), 'API content')
    seedForeign({ 'api-contracts': { status: 'completed', produces: ['docs/api.md'] } })

    const { output } = mkOutput()
    const cache = new Map<string, PipelineState | null>()
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'api-contracts' },
      mkConfig([{ step: 'api-contracts' }]),
      tmpRoot, output, cache,
    )
    expect(result.completed).toBe(true)
    expect(result.artifacts).toEqual([
      { stepName: 'shared-lib:api-contracts', filePath: 'docs/api.md', content: 'API content' },
    ])
  })

  it('warns + returns { completed: false, artifacts: [] } when step not in exports', () => {
    seedForeign({ 'api-contracts': { status: 'completed', produces: [] } })
    const { warnings, output } = mkOutput()
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'api-contracts' },
      mkConfig([]),
      tmpRoot, output, new Map(),
    )
    expect(result).toEqual({ completed: false, artifacts: [] })
    expect(warnings.some(w => /not exported/i.test(w.asString))).toBe(true)
  })

  it('warns when service not in config', () => {
    const { warnings, output } = mkOutput()
    const result = resolveDirectCrossRead(
      { service: 'unknown-service', step: 'whatever' },
      mkConfig([{ step: 'whatever' }]),
      tmpRoot, output, new Map(),
    )
    expect(result).toEqual({ completed: false, artifacts: [] })
    expect(warnings.some(w => /not found/i.test(w.asString))).toBe(true)
  })

  it('warns when foreign state file is missing', () => {
    const { warnings, output } = mkOutput()
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'api-contracts' },
      mkConfig([{ step: 'api-contracts' }]),
      tmpRoot, output, new Map(),
    )
    expect(result).toEqual({ completed: false, artifacts: [] })
    expect(warnings.some(w => /not bootstrapped/i.test(w.asString))).toBe(true)
  })

  it('returns { completed: true, artifacts: [] } when step completed but produces is empty', () => {
    seedForeign({ 'aggregator': { status: 'completed', produces: [] } })
    const { output } = mkOutput()
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'aggregator' },
      mkConfig([{ step: 'aggregator' }]),
      tmpRoot, output, new Map(),
    )
    expect(result.completed).toBe(true)
    expect(result.artifacts).toEqual([])
  })

  it('emits structured ARTIFACT_PATH_REJECTED warning when produces entry escapes project root', () => {
    seedForeign({ 'api-contracts': { status: 'completed', produces: ['../../../etc/passwd'] } })
    const { warnings, output } = mkOutput()
    resolveDirectCrossRead(
      { service: 'shared-lib', step: 'api-contracts' },
      mkConfig([{ step: 'api-contracts' }]),
      tmpRoot, output, new Map(),
    )
    // Assert the structured warning object (matches the existing run.ts reads-loop contract)
    const pathRejected = warnings.find(w =>
      typeof w.raw === 'object' && w.raw !== null &&
      (w.raw as { code?: string }).code === 'ARTIFACT_PATH_REJECTED',
    )
    expect(pathRejected).toBeDefined()
    expect(pathRejected?.raw).toMatchObject({
      code: 'ARTIFACT_PATH_REJECTED',
      message: expect.stringContaining('shared-lib:api-contracts'),
    })
  })

  it('caches foreign state after first load', () => {
    seedForeign({ 'api-contracts': { status: 'completed', produces: [] } })
    const cache = new Map<string, PipelineState | null>()
    const { output } = mkOutput()
    const cfg = mkConfig([{ step: 'api-contracts' }])
    resolveDirectCrossRead({ service: 'shared-lib', step: 'api-contracts' }, cfg, tmpRoot, output, cache)
    expect(cache.has('shared-lib')).toBe(true)
    // Second call — delete state.json; cached result should still work
    fs.unlinkSync(path.join(tmpRoot, '.scaffold', 'services', 'shared-lib', 'state.json'))
    const second = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'api-contracts' }, cfg, tmpRoot, output, cache,
    )
    expect(second.completed).toBe(true)  // served from cache, not disk
  })

  it('warns + skips when cr.step is a global step (runtime defense-in-depth)', () => {
    seedForeign({ 'service-ownership-map': { status: 'completed', produces: [] } })
    const { warnings, output } = mkOutput()
    const globalSteps = new Set(['service-ownership-map'])
    const result = resolveDirectCrossRead(
      { service: 'shared-lib', step: 'service-ownership-map' },
      mkConfig([{ step: 'service-ownership-map' }]),
      tmpRoot, output, new Map(), globalSteps,
    )
    expect(result).toEqual({ completed: false, artifacts: [] })
    expect(warnings.some(w => /global step/i.test(w.asString))).toBe(true)
  })
})

function mkMetaFile(
  name: string,
  crossReads: Array<{ service: string; step: string }> = [],
  category: 'pipeline' | 'tool' = 'pipeline',
): MetaPromptFile {
  return {
    stepName: name,
    filePath: `/fake/${name}.md`,
    frontmatter: {
      name, description: '', summary: null,
      phase: 'architecture', order: 700,
      dependencies: [], outputs: [], conditional: null,
      knowledgeBase: [], reads: [], crossReads,
      stateless: false, category,
    },
    body: '', sections: {},
  }
}

describe('resolveTransitiveCrossReads', () => {
  let tmpRoot: string
  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `scaffold-transitive-${Date.now()}-${Math.random()}`)
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'b'), { recursive: true })
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'c'), { recursive: true })
    fs.mkdirSync(path.join(tmpRoot, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 3, steps: {}, next_eligible: [], in_progress: null,
    }))
  })
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  function seedService(
    name: string,
    steps: Record<string, { status: string; produces?: string[] }>,
  ) {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', name, 'state.json'),
      JSON.stringify({ 'schema-version': 3, steps, next_eligible: [], in_progress: null }),
    )
  }

  function mkMultiConfig(exports: Record<string, string[]>): ScaffoldConfig {
    return {
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        services: Object.entries(exports).map(([name, stepNames]) => ({
          name, projectType: 'library',
          libraryConfig: { visibility: 'internal' },
          exports: stepNames.map(s => ({ step: s })),
        })),
      },
    } as ScaffoldConfig
  }

  it('resolves transitive chain A → B (B step has crossReads to C)', () => {
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B content')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C content')
    seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    const metas = new Map<string, MetaPromptFile>([
      ['b-step', mkMetaFile('b-step', [{ service: 'c', step: 'c-step' }])],
      ['c-step', mkMetaFile('c-step')],
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      mkMultiConfig({ b: ['b-step'], c: ['c-step'] }),
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    const paths = artifacts.map(a => a.filePath).sort()
    expect(paths).toEqual(['docs/b.md', 'docs/c.md'])
  })

  it('stops at cycle (skips silently)', () => {
    seedService('b', { 'b-step': { status: 'completed', produces: [] } })
    const metas = new Map<string, MetaPromptFile>([
      ['b-step', mkMetaFile('b-step', [{ service: 'b', step: 'b-step' }])],  // self-cycle
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      mkMultiConfig({ b: ['b-step'] }),
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    expect(artifacts).toEqual([])  // no infinite loop
  })

  it('memoizes FULL closure (direct + transitive) and reuses it on subsequent calls', () => {
    // Chain: b-step → c-step. Closure for b:b-step must include BOTH b.md and c.md.
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')
    seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    const metas = new Map<string, MetaPromptFile>([
      ['b-step', mkMetaFile('b-step', [{ service: 'c', step: 'c-step' }])],
      ['c-step', mkMetaFile('c-step')],
    ])
    const { output } = mkOutput()
    const resolved = new Map<string, ArtifactEntry[]>()
    const cfg = mkMultiConfig({ b: ['b-step'], c: ['c-step'] })

    // First call — populates the cache with the full closure
    const firstResult = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      cfg, tmpRoot, metas, output, new Set(), resolved, new Map(),
    )
    expect(firstResult.map(a => a.filePath).sort()).toEqual(['docs/b.md', 'docs/c.md'])
    // Cache must hold the FULL closure (2 entries), not just direct (1)
    expect(resolved.get('b:b-step')).toHaveLength(2)
    expect(resolved.get('c:c-step')).toHaveLength(1)

    // Second call — delete all foreign state to force cache-only path
    fs.unlinkSync(path.join(tmpRoot, '.scaffold', 'services', 'b', 'state.json'))
    fs.unlinkSync(path.join(tmpRoot, '.scaffold', 'services', 'c', 'state.json'))
    const secondResult = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      cfg, tmpRoot, metas, output, new Set(), resolved, new Map(),
    )
    expect(secondResult.map(a => a.filePath).sort()).toEqual(['docs/b.md', 'docs/c.md'])
  })

  it('recurses through completed step with empty produces (aggregator)', () => {
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')
    seedService('b', { 'b-agg': { status: 'completed', produces: [] } })   // aggregator
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    const metas = new Map<string, MetaPromptFile>([
      ['b-agg', mkMetaFile('b-agg', [{ service: 'c', step: 'c-step' }])],
      ['c-step', mkMetaFile('c-step')],
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-agg' }],
      mkMultiConfig({ b: ['b-agg'], c: ['c-step'] }),
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    expect(artifacts.map(a => a.filePath)).toEqual(['docs/c.md'])
  })

  it('skips transitive lookup when foreign meta is category: tool', () => {
    seedService('c', { 'c-tool': { status: 'completed', produces: [] } })
    const metas = new Map<string, MetaPromptFile>([
      ['c-tool', mkMetaFile('c-tool', [{ service: 'x', step: 'x-step' }], 'tool')],
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'c', step: 'c-tool' }],
      mkMultiConfig({ c: ['c-tool'] }),
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    expect(artifacts).toEqual([])  // tool's crossReads ignored
  })

  it('dedupes diamond deps (A→B, A→C, B & C both → D) via filePath Map inside traversal', () => {
    // Real diamond topology: top calls B and C; both B and C cross-read D.
    // D's shared artifact must appear exactly once in the final closure.
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'd'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'd.md'), 'D')
    seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'd', 'state.json'),
      JSON.stringify({
        'schema-version': 3,
        steps: { 'd-step': { status: 'completed', produces: ['docs/d.md'] } },
        next_eligible: [], in_progress: null,
      }),
    )
    const metas = new Map<string, MetaPromptFile>([
      ['b-step', mkMetaFile('b-step', [{ service: 'd', step: 'd-step' }])],
      ['c-step', mkMetaFile('c-step', [{ service: 'd', step: 'd-step' }])],
      ['d-step', mkMetaFile('d-step')],
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [
        { service: 'b', step: 'b-step' },
        { service: 'c', step: 'c-step' },
      ],
      {
        version: 2, methodology: 'deep', platforms: ['claude-code'],
        project: {
          services: [
            {
              name: 'b', projectType: 'library',
              libraryConfig: { visibility: 'internal' },
              exports: [{ step: 'b-step' }],
            },
            {
              name: 'c', projectType: 'library',
              libraryConfig: { visibility: 'internal' },
              exports: [{ step: 'c-step' }],
            },
            {
              name: 'd', projectType: 'library',
              libraryConfig: { visibility: 'internal' },
              exports: [{ step: 'd-step' }],
            },
          ],
        },
      } as ScaffoldConfig,
      tmpRoot, metas, output, new Set(), new Map(), new Map(),
    )
    // B, C, and D each appear exactly once — D is the diamond bottom that would be 2× without dedup
    const paths = artifacts.map(a => a.filePath).sort()
    expect(paths).toEqual(['docs/b.md', 'docs/c.md', 'docs/d.md'])
    expect(paths.filter(p => p === 'docs/d.md')).toHaveLength(1)
  })

  it('uses overlayCrossReads for foreign step when provided (overlay-first)', () => {
    // b-step frontmatter has no crossReads; overlay adds one to c-step
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')
    seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    // b-step has NO frontmatter crossReads; overlay provides them for b-step
    const metas = new Map<string, MetaPromptFile>([
      ['b-step', mkMetaFile('b-step')],  // no frontmatter crossReads
      ['c-step', mkMetaFile('c-step')],
    ])
    const overlayCrossReads = {
      'b-step': [{ service: 'c', step: 'c-step' }],  // overlay-only
    }
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      mkMultiConfig({ b: ['b-step'], c: ['c-step'] }),
      tmpRoot, metas, output,
      new Set(), new Map(), new Map(),
      undefined,  // globalSteps
      overlayCrossReads,
    )
    const paths = artifacts.map(a => a.filePath).sort()
    expect(paths).toEqual(['docs/b.md', 'docs/c.md'])
  })

  it('falls back to foreignMeta.frontmatter.crossReads when overlayCrossReads is omitted (backward compat)', () => {
    // This is essentially the original Wave 3c test, restated to lock the backcompat contract.
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')
    seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    const metas = new Map<string, MetaPromptFile>([
      ['b-step', mkMetaFile('b-step', [{ service: 'c', step: 'c-step' }])],  // frontmatter only
      ['c-step', mkMetaFile('c-step')],
    ])
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      mkMultiConfig({ b: ['b-step'], c: ['c-step'] }),
      tmpRoot, metas, output,
      new Set(), new Map(), new Map(),
      // No globalSteps, no overlayCrossReads — omitted args
    )
    const paths = artifacts.map(a => a.filePath).sort()
    expect(paths).toEqual(['docs/b.md', 'docs/c.md'])
  })

  it('does NOT recurse when overlay references a step absent from metaPrompts (foreignMeta guard)', () => {
    // Setup specifically designed to isolate the foreignMeta existence guard.
    //
    // The guard lives here: `if (foreignMeta && !isTool && foreignCrossReads.length > 0)`
    //
    // To prove it actually fires, we need a scenario where — WITHOUT the guard —
    // recursion WOULD surface an artifact that SHOULDN'T appear. A previous
    // version of this test relied on resolveDirectCrossRead rejecting a missing
    // service, which short-circuits before the guard is reached, so the test
    // would pass even if the guard were removed. This version fixes that.
    //
    // Scenario:
    //   - Top-level cross-read: b:b-step → c:ghost-step
    //   - ghost-step's direct state EXISTS (artifact 'docs/ghost.md' produced)
    //     so `direct.completed` is true and recursion reaches the guard.
    //   - overlayCrossReads['ghost-step'] = [{ d, deep-step }] (length > 0,
    //     would recurse without the guard)
    //   - metaPrompts has b-step + deep-step, but deliberately NOT ghost-step.
    //   - d:deep-step produces 'docs/deep.md'.
    //
    // With the guard: recursion into ghost-step's overlay crossReads is blocked
    //   (foreignMeta for ghost-step is undefined). docs/deep.md must NOT surface.
    // Without the guard: recursion fires and docs/deep.md would appear.
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'c'), { recursive: true })
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'd'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'ghost.md'), 'GHOST')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'deep.md'), 'DEEP')
    seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
    seedService('c', { 'ghost-step': { status: 'completed', produces: ['docs/ghost.md'] } })
    seedService('d', { 'deep-step': { status: 'completed', produces: ['docs/deep.md'] } })
    const metas = new Map<string, MetaPromptFile>([
      ['b-step', mkMetaFile('b-step')],
      ['deep-step', mkMetaFile('deep-step')],
      // ghost-step deliberately NOT added — tests the existence guard
    ])
    const overlayCrossReads = {
      'b-step': [{ service: 'c', step: 'ghost-step' }],
      'ghost-step': [{ service: 'd', step: 'deep-step' }],  // would recurse without guard
    }
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      mkMultiConfig({
        b: ['b-step'],
        c: ['ghost-step'],   // c exports ghost-step so direct lookup succeeds
        d: ['deep-step'],
      }),
      tmpRoot, metas, output,
      new Set(), new Map(), new Map(),
      undefined, overlayCrossReads,
    )
    const paths = artifacts.map(a => a.filePath).sort()
    // Must contain b.md (self) + ghost.md (direct hop from b).
    // Must NOT contain deep.md (guarded recursion into ghost-step would have surfaced it).
    expect(paths).toEqual(['docs/b.md', 'docs/ghost.md'])
    expect(paths).not.toContain('docs/deep.md')
  })

  it('overlayCrossReads takes PRECEDENCE over frontmatter when both disagree (overlay-first)', () => {
    // Both present, but pointing at different foreign steps. The correct impl must
    // recurse into the overlay target, NOT the frontmatter target. A buggy impl that
    // still prefers frontmatter would pass the earlier tests (where only one is set).
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'fm'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'b.md'), 'B')
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'c.md'), 'C')          // overlay target
    fs.writeFileSync(path.join(tmpRoot, 'docs', 'from-fm.md'), 'FM')   // frontmatter target
    seedService('b', { 'b-step': { status: 'completed', produces: ['docs/b.md'] } })
    seedService('c', { 'c-step': { status: 'completed', produces: ['docs/c.md'] } })
    seedService('fm', { 'fm-step': { status: 'completed', produces: ['docs/from-fm.md'] } })
    // b-step has FRONTMATTER crossRead to fm:fm-step; overlay REPLACES with c:c-step.
    const metas = new Map<string, MetaPromptFile>([
      ['b-step', mkMetaFile('b-step', [{ service: 'fm', step: 'fm-step' }])],
      ['c-step', mkMetaFile('c-step')],
      ['fm-step', mkMetaFile('fm-step')],
    ])
    const overlayCrossReads = {
      'b-step': [{ service: 'c', step: 'c-step' }],   // overlay wins
    }
    const { output } = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'b', step: 'b-step' }],
      mkMultiConfig({ b: ['b-step'], c: ['c-step'], fm: ['fm-step'] }),
      tmpRoot, metas, output,
      new Set(), new Map(), new Map(),
      undefined, overlayCrossReads,
    )
    const paths = artifacts.map(a => a.filePath).sort()
    // Overlay target (c.md) must be present; frontmatter target (from-fm.md) must NOT.
    expect(paths).toEqual(['docs/b.md', 'docs/c.md'])
    expect(paths).not.toContain('docs/from-fm.md')
  })
})

describe('resolveCrossReadReadiness', () => {
  let tmpRoot: string
  beforeEach(() => {
    tmpRoot = path.join(os.tmpdir(), `scaffold-readiness-${Date.now()}-${Math.random()}`)
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 3, steps: {}, next_eligible: [], in_progress: null,
    }))
  })
  afterEach(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

  const cfg = (exports: Array<{ step: string }>): ScaffoldConfig => ({
    version: 2, methodology: 'deep', platforms: ['claude-code'],
    project: {
      services: [{
        name: 'api', projectType: 'backend',
        backendConfig: { apiStyle: 'rest' },
        exports,
      }],
    },
  }) as ScaffoldConfig

  it('returns service-unknown for missing service', () => {
    const r = resolveCrossReadReadiness(
      [{ service: 'ghost', step: 'x' }],
      cfg([{ step: 'x' }]),
      tmpRoot,
    )
    expect(r[0].status).toBe('service-unknown')
  })

  it('returns not-exported when step not in exports', () => {
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'secret' }],
      cfg([]),
      tmpRoot,
    )
    expect(r[0].status).toBe('not-exported')
  })

  it('returns not-bootstrapped when foreign state file missing', () => {
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'x' }],
      cfg([{ step: 'x' }]),
      tmpRoot,
    )
    expect(r[0].status).toBe('not-bootstrapped')
  })

  it('returns completed when foreign step completed', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
      JSON.stringify({
        'schema-version': 3,
        steps: { 'x': { status: 'completed', source: 'pipeline', produces: [] } },
        next_eligible: [], in_progress: null,
      }),
    )
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'x' }],
      cfg([{ step: 'x' }]),
      tmpRoot,
    )
    expect(r[0].status).toBe('completed')
  })

  it('returns pending when foreign step not completed', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
      JSON.stringify({
        'schema-version': 3,
        steps: { 'x': { status: 'in_progress', source: 'pipeline', produces: [] } },
        next_eligible: [], in_progress: null,
      }),
    )
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'x' }],
      cfg([{ step: 'x' }]),
      tmpRoot,
    )
    expect(r[0].status).toBe('pending')
  })

  it('returns empty array when given no cross-reads', () => {
    expect(resolveCrossReadReadiness([], cfg([]), tmpRoot)).toEqual([])
  })

  it('returns read-error when foreign state.json exists but cannot be loaded', () => {
    // Write malformed JSON that parses as JSON but not as state
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
      '{ not-valid-scaffold-state: no schema-version }',
    )
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'x' }],
      cfg([{ step: 'x' }]),
      tmpRoot,
    )
    expect(r[0].status).toBe('read-error')
  })

  it('returns not-exported when cr.step is a global step (defense-in-depth)', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
      JSON.stringify({
        'schema-version': 3,
        steps: {
          'service-ownership-map': { status: 'completed', source: 'pipeline', produces: [] },
        },
        next_eligible: [], in_progress: null,
      }),
    )
    const globalSteps = new Set(['service-ownership-map'])
    const r = resolveCrossReadReadiness(
      [{ service: 'api', step: 'service-ownership-map' }],
      cfg([{ step: 'service-ownership-map' }]),  // parse-time allowlist would have already rejected this
      tmpRoot,
      globalSteps,
    )
    expect(r[0].status).toBe('not-exported')
  })

  it('caches foreign state so multiple cross-reads to same service trigger one load', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
      JSON.stringify({
        'schema-version': 3,
        steps: {
          'x': { status: 'completed', source: 'pipeline', produces: [] },
          'y': { status: 'pending', source: 'pipeline', produces: [] },
        },
        next_eligible: [], in_progress: null,
      }),
    )
    const spy = vi.spyOn(StateManager, 'loadStateReadOnly')
    try {
      const r = resolveCrossReadReadiness(
        [
          { service: 'api', step: 'x' },
          { service: 'api', step: 'y' },
          { service: 'api', step: 'x' },
        ],
        cfg([{ step: 'x' }, { step: 'y' }]),
        tmpRoot,
      )
      expect(r.map(e => e.status)).toEqual(['completed', 'pending', 'completed'])
      expect(spy).toHaveBeenCalledTimes(1)  // cached after first read
    } finally {
      spy.mockRestore()
    }
  })
})
