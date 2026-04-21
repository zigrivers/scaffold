import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCrossReadReadiness } from '../core/assembly/cross-reads.js'
import { buildDependencyGraph } from '../dashboard/dependency-graph.js'
import type { BuildGraphInput } from '../dashboard/dependency-graph.js'
import { generateMultiServiceDashboardData, generateMultiServiceHtml } from '../dashboard/generator.js'
import type { ScaffoldConfig, PipelineState, MetaPromptFile } from '../types/index.js'
import type { OverlayState } from '../core/assembly/overlay-state-resolver.js'

vi.mock('../core/assembly/cross-reads.js', () => ({
  resolveCrossReadReadiness: vi.fn(),
}))

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
): OverlayState {
  const steps: OverlayState['steps'] = {}
  for (const step of Object.keys(crossReadsByStep)) {
    steps[step] = { enabled: true }
  }
  return {
    steps,
    knowledge: {},
    reads: {},
    dependencies: {},
    crossReads: crossReadsByStep,
  }
}

function emptyState(): PipelineState {
  return {
    'schema-version': 3,
    'scaffold-version': '3.22.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2026-04-21T00:00:00.000Z',
    in_progress: null,
    steps: {},
    next_eligible: [],
    'extra-steps': [],
  } as PipelineState
}

beforeEach(() => {
  vi.mocked(resolveCrossReadReadiness).mockReset()
  vi.mocked(resolveCrossReadReadiness).mockImplementation(([cr]) => [{ ...cr, status: 'completed' }])
})

function loadedServicesFor(services: Array<{ name: string; projectType: string }>) {
  return services.map(s => ({
    name: s.name,
    projectType: s.projectType,
    state: emptyState(),
    metaPrompts: new Map<string, MetaPromptFile>(),
  }))
}

describe('dashboard integration — cross-service dependency graph', () => {
  it('test 21: multi-service with real cross-reads → HTML contains <section class="dep-graph">', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'implementation-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    }
    const graph = buildDependencyGraph(input)
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    expect(html).toContain('<section class="dep-graph"')
    expect(html).toContain('data-consumer="web"')
    expect(html).toContain('data-producer="api"')
  })

  it('test 22: multi-service with zero cross-reads → HTML does NOT contain class="dep-graph"', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay()],
      ]),
    }
    const graph = buildDependencyGraph(input)
    expect(graph).toBeNull()
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    expect(html).not.toContain('class="dep-graph"')
  })

  it('test 23: edge data-steps round-trips via regex extraction', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'impl-plan': [{ service: 'api', step: 'create-prd' }],
        })],
      ]),
    }
    const graph = buildDependencyGraph(input)
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    const match = html.match(/data-consumer="web"[^>]*data-producer="api"[^>]*data-steps="([^"]*)"/)
    expect(match).not.toBeNull()
    const steps = JSON.parse(match![1].replace(/&quot;/g, '"'))
    expect(steps).toEqual([
      { consumerStep: 'impl-plan', producerStep: 'create-prd', status: 'completed' },
    ])
  })

  it('test 24: orphan service appears as a node even with no edges', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
      { name: 'worker', projectType: 'backend' },  // orphan
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'impl': [{ service: 'api', step: 'prd' }],
        })],
        ['worker', makeOverlay()],
      ]),
    }
    const graph = buildDependencyGraph(input)
    expect(graph).not.toBeNull()
    expect(graph!.nodes).toHaveLength(3)
    expect(graph!.nodes.map(n => n.name).sort()).toEqual(['api', 'web', 'worker'])
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    expect(html).toContain('<section class="dep-graph"')
    expect(html).toContain('data-service="worker"')
  })

  it('test 25: service-unknown cross-read does not crash — edge dropped, other edges rendered', () => {
    const services = [
      { name: 'api', projectType: 'backend' },
      { name: 'web', projectType: 'web-app' },
    ]
    const input: BuildGraphInput = {
      config: makeConfig(services),
      projectRoot: '/tmp/proj',
      services,
      perServiceOverlay: new Map([
        ['api', makeOverlay()],
        ['web', makeOverlay({
          'impl': [
            { service: 'nonexistent', step: 'prd' },  // dropped by knownServices filter
            { service: 'api', step: 'create-prd' },
          ],
        })],
      ]),
    }
    const graph = buildDependencyGraph(input)
    expect(graph).not.toBeNull()
    expect(graph!.edges).toHaveLength(1)  // only the api edge survives
    expect(graph!.edges[0].producer).toBe('api')
    expect(graph!.nodes.map(n => n.name).sort()).toEqual(['api', 'web'])
    // No nonexistent-service node
    expect(graph!.nodes.find(n => n.name === 'nonexistent')).toBeUndefined()
    const data = generateMultiServiceDashboardData({
      services: loadedServicesFor(services),
      methodology: 'deep',
      dependencyGraph: graph,
    })
    const html = generateMultiServiceHtml(data)
    expect(html).toContain('<section class="dep-graph"')
  })
})
