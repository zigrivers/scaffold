import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveDirectCrossRead } from './cross-reads.js'
import type { ScaffoldConfig, PipelineState } from '../../types/index.js'
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
