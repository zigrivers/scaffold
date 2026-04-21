import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCrossReadReadiness } from '../core/assembly/cross-reads.js'
import { buildDependencyGraph } from './dependency-graph.js'
import type { BuildGraphInput } from './dependency-graph.js'
import type { ScaffoldConfig } from '../types/index.js'
import type { OverlayState } from '../core/assembly/overlay-state-resolver.js'

vi.mock('../core/assembly/cross-reads.js', () => ({
  resolveCrossReadReadiness: vi.fn(),
}))

// Minimal valid ScaffoldConfig for builder (builder only uses services + passes
// config through to resolveCrossReadReadiness which is mocked).
function makeConfig(services: Array<{ name: string; projectType: string }>): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    project: {
      services: services.map(s => ({
        name: s.name,
        projectType: s.projectType as 'backend',
        backendConfig: {
          apiStyle: 'rest',
          dataStore: ['relational'],
          authMechanism: 'jwt',
          asyncMessaging: 'none',
          deployTarget: 'container',
          domain: 'none',
        },
      })),
    },
  } as unknown as ScaffoldConfig
}

function makeOverlay(
  crossReadsByStep: Record<string, Array<{ service: string; step: string }>> = {},
  enabledByStep: Record<string, boolean> = {},
): OverlayState {
  const steps: OverlayState['steps'] = {}
  for (const step of Object.keys(crossReadsByStep)) {
    steps[step] = { enabled: enabledByStep[step] ?? true }
  }
  return {
    steps,
    knowledge: {},
    reads: {},
    dependencies: {},
    crossReads: crossReadsByStep,
  }
}

function makeInput(overrides: Partial<BuildGraphInput> = {}): BuildGraphInput {
  const services = overrides.services ?? [
    { name: 'api', projectType: 'backend' } as const,
    { name: 'web', projectType: 'web-app' } as const,
  ]
  return {
    config: overrides.config ?? makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
    projectRoot: overrides.projectRoot ?? '/tmp/proj',
    services: services as BuildGraphInput['services'],
    perServiceOverlay: overrides.perServiceOverlay ?? new Map(),
    globalSteps: overrides.globalSteps,
  }
}

beforeEach(() => {
  vi.mocked(resolveCrossReadReadiness).mockReset()
  // Default: any cross-read resolves to 'completed'. Override per-test as needed.
  vi.mocked(resolveCrossReadReadiness).mockImplementation(([cr]) => [{ ...cr, status: 'completed' }])
})

describe('buildDependencyGraph — core aggregation', () => {
  it('test 1: returns null when all services have zero cross-reads', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay()],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).toBeNull()
  })

  it('test 2: single edge — web consumes api:create-prd → 1 edge, 2 nodes', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.nodes).toHaveLength(2)
    expect(result!.nodes.map(n => n.name).sort()).toEqual(['api', 'web'])
    expect(result!.edges).toHaveLength(1)
    expect(result!.edges[0].consumer).toBe('web')
    expect(result!.edges[0].producer).toBe('api')
    expect(result!.edges[0].steps).toEqual([
      { consumerStep: 'implementation-plan', producerStep: 'create-prd', status: 'completed' },
    ])
  })

  it('test 3: multi-step aggregation — two steps each cross-reading different api steps', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'step-a': [{ service: 'api', step: 'create-prd' }],
          'step-b': [{ service: 'api', step: 'tech-stack' }],
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.edges).toHaveLength(1)  // same consumer+producer = 1 aggregate edge
    expect(result!.edges[0].steps).toHaveLength(2)
    expect(result!.edges[0].steps.map(s => s.consumerStep).sort()).toEqual(['step-a', 'step-b'])
    expect(result!.edges[0].steps.map(s => s.producerStep).sort()).toEqual(['create-prd', 'tech-stack'])
  })
})

describe('buildDependencyGraph — layer assignment', () => {
  it('test 4: three-layer chain — web → api → shared-lib', () => {
    const services = [
      { name: 'shared-lib', projectType: 'library' } as const,
      { name: 'api', projectType: 'backend' } as const,
      { name: 'web', projectType: 'web-app' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['shared-lib', makeOverlay()],
        ['api', makeOverlay({
          'tech-stack': [{ service: 'shared-lib', step: 'api-contract' }],
        })],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    const byName = new Map(result!.nodes.map(n => [n.name, n]))
    expect(byName.get('shared-lib')!.layer).toBe(0)
    expect(byName.get('api')!.layer).toBe(1)
    expect(byName.get('web')!.layer).toBe(2)
  })

  it('test 5: orphan service — 4 services, 1 with no edges touches it', () => {
    const services = [
      { name: 'api', projectType: 'backend' } as const,
      { name: 'web', projectType: 'web-app' } as const,
      { name: 'worker', projectType: 'backend' } as const,  // orphan
      { name: 'shared-lib', projectType: 'library' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['api', makeOverlay({
          'tech-stack': [{ service: 'shared-lib', step: 'api-contract' }],
        })],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
        ['worker', makeOverlay()],
        ['shared-lib', makeOverlay()],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.nodes).toHaveLength(4)
    const byName = new Map(result!.nodes.map(n => [n.name, n]))
    expect(byName.get('worker')!.layer).toBe(0)  // orphan at layer 0
    expect(byName.get('shared-lib')!.layer).toBe(0)
    // Chain layers unaffected by the orphan — regression lock on cross-graph interference.
    expect(byName.get('api')!.layer).toBe(1)
    expect(byName.get('web')!.layer).toBe(2)
    // no edges touch worker
    expect(result!.edges.some(e => e.consumer === 'worker' || e.producer === 'worker')).toBe(false)
  })

  it('test 6: cycle — A ↔ B → both same layer, 2 nodes, 2 edges, no crash', () => {
    const services = [
      { name: 'svc-a', projectType: 'backend' } as const,
      { name: 'svc-b', projectType: 'backend' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['svc-a', makeOverlay({
          'step-a1': [{ service: 'svc-b', step: 'step-b1' }],
        })],
        ['svc-b', makeOverlay({
          'step-b1': [{ service: 'svc-a', step: 'step-a1' }],
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.nodes).toHaveLength(2)
    expect(result!.edges).toHaveLength(2)
    const byName = new Map(result!.nodes.map(n => [n.name, n]))
    expect(byName.get('svc-a')!.layer).toBe(byName.get('svc-b')!.layer)
  })
})

describe('buildDependencyGraph — layout + determinism', () => {
  it('test 8: same input twice → identical x/y + identical SVG paths', () => {
    const services = [
      { name: 'api', projectType: 'backend' } as const,
      { name: 'web', projectType: 'web-app' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    })
    const first = buildDependencyGraph(input)!
    const second = buildDependencyGraph(input)!
    expect(first.nodes.map(n => ({ name: n.name, x: n.x, y: n.y, layer: n.layer })))
      .toEqual(second.nodes.map(n => ({ name: n.name, x: n.x, y: n.y, layer: n.layer })))
    expect(first.edges.map(e => ({ consumer: e.consumer, producer: e.producer, path: e.svgPath })))
      .toEqual(second.edges.map(e => ({ consumer: e.consumer, producer: e.producer, path: e.svgPath })))
    expect(first.viewBox).toEqual(second.viewBox)
  })

  it('test 9: viewBox dimensions scale with layer count + tallest-layer node count', () => {
    // Small graph: 2 layers, 1 node each → narrow + short.
    const small = buildDependencyGraph(makeInput({
      services: [
        { name: 'api', projectType: 'backend' } as const,
        { name: 'web', projectType: 'web-app' } as const,
      ],
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({ step: [{ service: 'api', step: 's' }] })],
      ]),
    }))!

    // Wider graph: 3 layers.
    const wide = buildDependencyGraph(makeInput({
      services: [
        { name: 'a', projectType: 'backend' } as const,
        { name: 'b', projectType: 'backend' } as const,
        { name: 'c', projectType: 'backend' } as const,
      ],
      config: makeConfig([
        { name: 'a', projectType: 'backend' },
        { name: 'b', projectType: 'backend' },
        { name: 'c', projectType: 'backend' },
      ]),
      perServiceOverlay: new Map([
        ['a', makeOverlay()],
        ['b', makeOverlay({ s: [{ service: 'a', step: 'x' }] })],
        ['c', makeOverlay({ s: [{ service: 'b', step: 'x' }] })],
      ]),
    }))!

    expect(wide.viewBox.width).toBeGreaterThan(small.viewBox.width)

    // Taller graph: 2 layers with 2 nodes in the tall layer → taller than small.
    const tall = buildDependencyGraph(makeInput({
      services: [
        { name: 'producer', projectType: 'library' } as const,
        { name: 'cons-a', projectType: 'web-app' } as const,
        { name: 'cons-b', projectType: 'web-app' } as const,
      ],
      config: makeConfig([
        { name: 'producer', projectType: 'library' },
        { name: 'cons-a', projectType: 'web-app' },
        { name: 'cons-b', projectType: 'web-app' },
      ]),
      perServiceOverlay: new Map([
        ['producer', makeOverlay()],
        ['cons-a', makeOverlay({ s: [{ service: 'producer', step: 'x' }] })],
        ['cons-b', makeOverlay({ s: [{ service: 'producer', step: 'x' }] })],
      ]),
    }))!

    expect(tall.viewBox.height).toBeGreaterThan(small.viewBox.height)
  })
})

describe('buildDependencyGraph — readiness + filters (regression)', () => {
  it('test 7: readiness threads 5 reachable statuses from resolveCrossReadReadiness', () => {
    // service-unknown is filtered at aggregation time (§2.1) BEFORE readiness is
    // called, so only 5 of the 6 CrossReadStatus values can appear on an edge.
    const services = [
      { name: 'producer', projectType: 'library' } as const,
      { name: 'web', projectType: 'web-app' } as const,
    ]
    const input = makeInput({
      services,
      config: makeConfig(services.map(s => ({ name: s.name, projectType: s.projectType }))),
      perServiceOverlay: new Map([
        ['producer', makeOverlay()],
        ['web', makeOverlay({
          'step-1': [{ service: 'producer', step: 'completed-step' }],
          'step-2': [{ service: 'producer', step: 'pending-step' }],
          'step-3': [{ service: 'producer', step: 'not-bootstrapped-step' }],
          'step-4': [{ service: 'producer', step: 'read-error-step' }],
          'step-5': [{ service: 'producer', step: 'not-exported-step' }],
        })],
      ]),
    })
    // Mock returns a different status based on cr.step
    vi.mocked(resolveCrossReadReadiness).mockImplementation(([cr]) => {
      const map: Record<string, 'completed' | 'pending' | 'not-bootstrapped' | 'read-error' | 'not-exported'> = {
        'completed-step': 'completed',
        'pending-step': 'pending',
        'not-bootstrapped-step': 'not-bootstrapped',
        'read-error-step': 'read-error',
        'not-exported-step': 'not-exported',
      }
      return [{ ...cr, status: map[cr.step] }]
    })
    const result = buildDependencyGraph(input)
    expect(result).not.toBeNull()
    expect(result!.edges).toHaveLength(1)
    const statuses = result!.edges[0].steps.map(s => s.status).sort()
    expect(statuses).toEqual(['completed', 'not-bootstrapped', 'not-exported', 'pending', 'read-error'])
  })

  it('test 10: self-reference filter — cr svc → svc dropped', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay({
          'step-a': [{ service: 'api', step: 'step-b' }],  // self-reference
        })],
        ['web', makeOverlay()],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).toBeNull()  // 0 edges after filtering → null
  })

  it('test 11: service-unknown filter — target not in services[] dropped BEFORE readiness lookup, edgeMap empty → null', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'step-a': [{ service: 'nonexistent', step: 'step-b' }],  // unknown producer
        })],
      ]),
    })
    const result = buildDependencyGraph(input)
    // Builder short-circuits when edgeMap.size === 0
    expect(result).toBeNull()
    // Filter order contract (spec §2.1): unknown-service cross-reads must be
    // dropped BEFORE resolveCrossReadReadiness is called, both because that
    // helper is filesystem-touching and because the caller (layoutGraph) does
    // byName.get(producer)! which would crash. Lock the invariant:
    expect(resolveCrossReadReadiness).not.toHaveBeenCalled()
  })

  it('test 12: disabled-step filter — cr declared on disabled consumer step dropped', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay(
          { 'step-a': [{ service: 'api', step: 'create-prd' }] },
          { 'step-a': false },  // step-a disabled
        )],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).toBeNull()
  })

  it('test 13: mixed filter — self-ref + unknown + disabled, all dropped BEFORE readiness lookup, null returned', () => {
    const input = makeInput({
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay(
          {
            'self-ref-step': [{ service: 'web', step: 'x' }],         // self-ref
            'unknown-step': [{ service: 'nonexistent', step: 'x' }],  // unknown
            'disabled-step': [{ service: 'api', step: 'x' }],         // disabled
          },
          { 'disabled-step': false },
        )],
      ]),
    })
    const result = buildDependencyGraph(input)
    expect(result).toBeNull()
    // All three filter classes drop BEFORE readiness lookup:
    expect(resolveCrossReadReadiness).not.toHaveBeenCalled()
  })
})
