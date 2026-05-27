import { describe, it, expect } from 'vitest'
import { runChecks } from './runner.js'
import type { LensManifest } from './registry.js'
import type { Finding } from '../types.js'

const stubGraph = {
  cwd: '',
  features: [], stories: [], acceptance_criteria: [], plan_tasks: [], playbook_tasks: [], tests: [],
  pull_requests: [], files: [], rules: [], components: [], tokens: [], decisions: [],
  edges: [], provenance: {}, unresolved_globs: [],
}
const stubAvailability = {
  git: { status: 'available' as const }, gh: { status: 'unavailable' as const, reason: 'no gh' },
  pipeline_docs: { status: 'available' as const }, tests: { status: 'available' as const },
  state: { status: 'available' as const }, beads: { status: 'unavailable' as const },
  mmr: { status: 'available' as const }, audit_history: { status: 'unavailable' as const },
  ledger: { events_read: 0, malformed_lines: 0, sources: [] },
}

describe('runChecks', () => {
  it('runs lenses in topological order based on depends_on', async () => {
    const order: string[] = []
    const registry: LensManifest[] = [
      { id: 'X', name: 'X', profiles: ['fast'], required: ['pipeline_docs'], optional: [], depends_on: ['Y'] },
      { id: 'Y', name: 'Y', profiles: ['fast'], required: ['pipeline_docs'], optional: [] },
    ]
    const lenses = {
      X: async () => { order.push('X'); return [] as Finding[] },
      Y: async () => { order.push('Y'); return [] as Finding[] },
    }
    await runChecks({
      registry, lenses, graph: stubGraph, ledger: { events: [] }, availability: stubAvailability, profile: 'fast',
    })
    expect(order).toEqual(['Y', 'X'])
  })

  it('emits a lens_skipped finding (P3) when a required adapter is unavailable', async () => {
    const registry: LensManifest[] = [
      { id: 'NeedsGh', name: 'NG', profiles: ['fast'], required: ['gh'], optional: [] },
    ]
    const lenses = { NeedsGh: async () => [{ id: 'should-not-be-called' } as never as Finding] }
    const findings = await runChecks({
      registry, lenses, graph: stubGraph, ledger: { events: [] }, availability: stubAvailability, profile: 'fast',
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].lens_id).toBe('NeedsGh')
    expect(findings[0].severity).toBe('P3')
    expect(findings[0].evidence.kind).toBe('lens_skipped')
  })

  it('passes upstream findings to downstream via the shared buffer', async () => {
    const registry: LensManifest[] = [
      { id: 'D-stack', name: 'D', profiles: ['fast'], required: ['pipeline_docs'], optional: [] },
      {
        id: 'G-decisions', name: 'G', profiles: ['fast'],
        required: ['pipeline_docs'], optional: [], depends_on: ['D-stack'],
      },
    ]
    const seen: Finding[][] = []
    const lenses = {
      'D-stack': async () => [{ id: 'fake-d', lens_id: 'D-stack', severity: 'P1' } as Finding],
      'G-decisions': async (_g: unknown, _l: unknown, _a: unknown, upstream: Finding[]) => {
        seen.push(upstream)
        return [] as Finding[]
      },
    }
    await runChecks({
      registry, lenses, graph: stubGraph, ledger: { events: [] }, availability: stubAvailability, profile: 'fast',
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toHaveLength(1)
    expect(seen[0][0].lens_id).toBe('D-stack')
  })

  it('rejects lens-dependency cycles at startup', async () => {
    const registry: LensManifest[] = [
      { id: 'A', name: 'A', profiles: ['fast'], required: ['pipeline_docs'], optional: [], depends_on: ['B'] },
      { id: 'B', name: 'B', profiles: ['fast'], required: ['pipeline_docs'], optional: [], depends_on: ['A'] },
    ]
    await expect(runChecks({
      registry, lenses: {}, graph: stubGraph, ledger: { events: [] }, availability: stubAvailability, profile: 'fast',
    })).rejects.toThrow(/cycle/i)
  })

  it('passes the profile to each lens function via LensContext', async () => {
    const captured: string[] = []
    const registry: LensManifest[] = [
      { id: 'P', name: 'P', profiles: ['fast', 'full'], required: ['pipeline_docs'], optional: [] },
    ]
    const lenses = {
      P: async (
        _g: unknown, _l: unknown, _a: unknown, _u: unknown, _e: unknown,
        ctx?: { profile?: string },
      ) => {
        captured.push(ctx?.profile ?? '(missing)')
        return [] as never[]
      },
    }
    await runChecks({
      registry, lenses, graph: stubGraph, ledger: { events: [] },
      availability: stubAvailability, profile: 'full',
    })
    expect(captured).toEqual(['full'])
  })

  it('threads knowledgeRootResolution + warnedKeys into LensContext', async () => {
    // Regression test for the T7 + T8 plumbing path: runAudit constructs
    // a knowledgeRootResolution + fresh warnedKeys and passes them into
    // runChecks; runChecks must propagate the root, the pre-loaded
    // index, the attempts trail, and the warnedKeys Set into every
    // lensFn's LensContext.
    const captured: Array<{
      knowledgeRoot: unknown
      knowledgeIndex: unknown
      knowledgeRootAttempts: unknown
      warnedKeysSize: number
    }> = []
    const sharedWarnedKeys = new Set<string>(['pre-existing'])
    const fakeIndex = new Set<string>(['alpha'])
    const registry: LensManifest[] = [
      { id: 'P', name: 'P', profiles: ['fast'], required: ['pipeline_docs'], optional: [] },
    ]
    const lenses = {
      P: async (
        _g: unknown, _l: unknown, _a: unknown, _u: unknown, _e: unknown,
        ctx?: {
          knowledgeRoot?: string | null
          knowledgeIndex?: Set<string> | null
          knowledgeRootAttempts?: Array<{ source: string; outcome: string }>
          warnedKeys?: Set<string>
        },
      ) => {
        captured.push({
          knowledgeRoot: ctx?.knowledgeRoot,
          knowledgeIndex: ctx?.knowledgeIndex,
          knowledgeRootAttempts: ctx?.knowledgeRootAttempts,
          warnedKeysSize: ctx?.warnedKeys?.size ?? -1,
        })
        return [] as never[]
      },
    }
    await runChecks({
      registry, lenses, graph: stubGraph, ledger: { events: [] },
      availability: stubAvailability, profile: 'fast',
      knowledgeRootResolution: {
        root: '/fake/kb',
        index: fakeIndex,
        attempts: [{ source: 'cli', outcome: 'used' }],
      },
      warnedKeys: sharedWarnedKeys,
    })
    expect(captured).toHaveLength(1)
    expect(captured[0].knowledgeRoot).toBe('/fake/kb')
    expect(captured[0].knowledgeIndex).toBe(fakeIndex)
    expect(captured[0].knowledgeRootAttempts).toEqual([{ source: 'cli', outcome: 'used' }])
    // The exact same caller-provided Set is threaded (identity, not copy)
    // so mutations from inside emitOnceForAudit persist across lenses
    // and across audit calls that share the Set.
    expect(captured[0].warnedKeysSize).toBe(1)
  })

  it('defaults the knowledge-root + warnedKeys fields when caller omits them', async () => {
    // Regression test for T7's "safe defaults" promise: legacy callers
    // (and tests bypassing runAudit) that don't supply
    // knowledgeRootResolution / warnedKeys must still receive a usable
    // LensContext — root/index default to undefined (Lens I treats
    // as no-suppression), attempts defaults to [], warnedKeys to a
    // fresh empty Set.
    const captured: Array<{
      knowledgeRoot: unknown
      knowledgeIndex: unknown
      attemptsIsArray: boolean
      warnedKeysIsSet: boolean
    }> = []
    const registry: LensManifest[] = [
      { id: 'P', name: 'P', profiles: ['fast'], required: ['pipeline_docs'], optional: [] },
    ]
    const lenses = {
      P: async (
        _g: unknown, _l: unknown, _a: unknown, _u: unknown, _e: unknown,
        ctx?: {
          knowledgeRoot?: string | null
          knowledgeIndex?: Set<string> | null
          knowledgeRootAttempts?: unknown[]
          warnedKeys?: Set<string>
        },
      ) => {
        captured.push({
          knowledgeRoot: ctx?.knowledgeRoot,
          knowledgeIndex: ctx?.knowledgeIndex,
          attemptsIsArray: Array.isArray(ctx?.knowledgeRootAttempts),
          warnedKeysIsSet: ctx?.warnedKeys instanceof Set,
        })
        return [] as never[]
      },
    }
    await runChecks({
      registry, lenses, graph: stubGraph, ledger: { events: [] },
      availability: stubAvailability, profile: 'fast',
    })
    expect(captured).toHaveLength(1)
    expect(captured[0].knowledgeRoot).toBeUndefined()
    expect(captured[0].knowledgeIndex).toBeUndefined()
    expect(captured[0].attemptsIsArray).toBe(true)
    expect(captured[0].warnedKeysIsSet).toBe(true)
  })
})
