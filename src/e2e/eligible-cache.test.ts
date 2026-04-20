import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadPipelineContext } from '../core/pipeline/context.js'
import { resolvePipeline } from '../core/pipeline/resolver.js'
import { StateManager } from '../state/state-manager.js'
import { StatePathResolver } from '../state/state-path-resolver.js'
import { readEligible } from '../core/pipeline/read-eligible.js'
import { readRootSaveCounter } from '../state/root-counter-reader.js'
import { createOutputContext } from '../cli/output/context.js'

describe('Eligible-Step Cache v2 — E2E', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ec2-e2e-'))
    fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'config.yml'),
      `version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: api
      projectType: backend
      backendConfig:
        apiStyle: rest
`,
    )
    const baseState = {
      'schema-version': 3,
      'scaffold-version': '1.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2026-04-20T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
    }
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), JSON.stringify(baseState))
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
      JSON.stringify(baseState),
    )
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('AC2: service cache is invalidated by root state mutation (cross-file)', () => {
    const context = loadPipelineContext(tmpRoot)
    const output = createOutputContext('auto')
    const rootPipeline = resolvePipeline(context, { output })
    const rootPathResolver = new StatePathResolver(tmpRoot)
    const rootSm = new StateManager(
      tmpRoot,
      rootPipeline.computeEligible,
      () => context.config ?? undefined,
      rootPathResolver,
      rootPipeline.globalSteps,
      rootPipeline.getPipelineHash('global'),
    )
    // Seed root counter by doing an initial root save
    rootSm.saveState(rootSm.loadState())

    const svcPipeline = resolvePipeline(context, { output, serviceId: 'api' })
    const pathResolver = new StatePathResolver(tmpRoot, 'api')
    const sm = new StateManager(
      tmpRoot,
      svcPipeline.computeEligible,
      () => context.config ?? undefined,
      pathResolver,
      svcPipeline.globalSteps,
      svcPipeline.getPipelineHash('service'),
    )
    const state = sm.loadState()
    state.steps['some-step'] = { status: 'pending', source: 'pipeline', produces: [] }
    sm.saveState(state)

    const svcDisk = JSON.parse(fs.readFileSync(
      path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'), 'utf8',
    ))
    expect(svcDisk.next_eligible_root_counter).toBe(1)
    expect(typeof svcDisk.next_eligible_hash).toBe('string')

    // Mutate root — bumps save_counter from 1 to 2
    rootSm.saveState(rootSm.loadState())
    expect(readRootSaveCounter(tmpRoot)).toBe(2)

    // readEligible must fall back because next_eligible_root_counter (1) !== current root counter (2)
    const liveCalls: string[] = []
    const sentinelPipeline = {
      ...svcPipeline,
      computeEligible: ((steps, opts) => {
        liveCalls.push('live-recompute-fired')
        return svcPipeline.computeEligible(steps, opts)
      }) as typeof svcPipeline.computeEligible,
    }
    readEligible(
      sm.loadState(),
      sentinelPipeline,
      { scope: 'service', globalSteps: svcPipeline.globalSteps },
      () => readRootSaveCounter(tmpRoot),
    )
    expect(liveCalls).toContain('live-recompute-fired')
  })

  it('AC3: pipeline-graph change (different hash on re-resolution) invalidates cache on read', () => {
    const context = loadPipelineContext(tmpRoot)
    const output = createOutputContext('auto')
    const pipelineA = resolvePipeline(context, { output })
    const pathResolver = new StatePathResolver(tmpRoot)
    const sm = new StateManager(
      tmpRoot,
      pipelineA.computeEligible,
      () => context.config ?? undefined,
      pathResolver,
      pipelineA.globalSteps,
      pipelineA.getPipelineHash('global'),
    )
    sm.saveState(sm.loadState())

    // Build a new context whose metaPrompts differs — delete first slug
    const firstSlug = [...context.metaPrompts.keys()][0]
    expect(firstSlug).toBeDefined()
    const mutatedMetaPrompts = new Map(context.metaPrompts)
    mutatedMetaPrompts.delete(firstSlug!)
    const mutatedContext = { ...context, metaPrompts: mutatedMetaPrompts }
    const pipelineB = resolvePipeline(mutatedContext, { output })
    expect(pipelineB.getPipelineHash('global')).not.toBe(pipelineA.getPipelineHash('global'))

    const liveCalls: string[] = []
    const sentinelPipeline = {
      ...pipelineB,
      computeEligible: ((steps, opts) => {
        liveCalls.push('live-fired')
        return pipelineB.computeEligible(steps, opts)
      }) as typeof pipelineB.computeEligible,
    }
    readEligible(sm.loadState(), sentinelPipeline, undefined, undefined)
    expect(liveCalls).toContain('live-fired')
  })
})
