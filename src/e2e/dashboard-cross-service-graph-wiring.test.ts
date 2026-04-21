import { describe, it, expect, vi } from 'vitest'
import type { PipelineState } from '../types/index.js'

// ---------- Module mocks ----------
// All vi.mock calls are hoisted file-wide; keeping them in a separate file
// prevents leakage into the API-level integration tests.

vi.mock('../core/pipeline/context.js', () => ({
  loadPipelineContext: vi.fn(),
}))
vi.mock('../core/pipeline/resolver.js', () => ({
  resolvePipeline: vi.fn(),
}))
vi.mock('../state/state-manager.js', () => {
  class MockStateManager {
    loadState(): PipelineState {
      return {
        'schema-version': 3, 'scaffold-version': '3.22.0',
        init_methodology: 'deep', config_methodology: 'deep',
        'init-mode': 'greenfield',
        created: '2026-04-21T00:00:00Z',
        in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
      } as PipelineState
    }
    saveState() {}
  }
  return { StateManager: MockStateManager }
})
vi.mock('../config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    config: {
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        services: [
          { name: 'api', projectType: 'backend' },
          { name: 'web', projectType: 'web-app' },
        ],
      },
    },
    errors: [], warnings: [],
  })),
}))
vi.mock('../state/ensure-v3-migration.js', () => ({ ensureV3Migration: vi.fn() }))
vi.mock('../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))
vi.mock('../state/decision-logger.js', () => ({ readDecisions: vi.fn(() => []) }))
vi.mock('../cli/middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(() => '/tmp/fake-proj'),
}))
// CRITICAL: mock `utils/fs` to intercept atomicWriteFile. dashboard.ts calls
// atomicWriteFile(outputPath, html) — we need to capture `html` here.
// Module-level `let capturedHtml` allows the test block to read the captured
// payload after the handler runs.
let capturedHtml = ''
vi.mock('../utils/fs.js', async (importActual) => {
  const actual = await importActual<typeof import('../utils/fs.js')>()
  return {
    ...actual,
    atomicWriteFile: vi.fn((_p: string, contents: string) => {
      if (typeof contents === 'string' && contents.includes('<html')) capturedHtml = contents
    }),
  }
})
vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))

// ---------- Test ----------

describe('dashboard.ts multi-service wiring — resolvePipeline integration', () => {
  it('test 26: resolvePipeline called per service; one service throwing does not crash the dashboard', async () => {
    capturedHtml = ''
    const { loadPipelineContext } = await import('../core/pipeline/context.js')
    const { resolvePipeline } = await import('../core/pipeline/resolver.js')
    vi.mocked(loadPipelineContext).mockReturnValue({
      projectRoot: '/tmp/fake-proj',
      metaPrompts: new Map(),
      config: undefined,
      configErrors: [],
      configWarnings: [],
      presets: { deep: undefined, mvp: undefined, custom: undefined },
      methodologyDir: '/tmp/fake-methodology',
    } as unknown as ReturnType<typeof loadPipelineContext>)
    vi.mocked(resolvePipeline).mockImplementation((_ctx, opts) => {
      if (opts?.serviceId === 'api') throw new Error('simulated overlay parse error')
      // 'web' resolves OK with empty overlay (no edges → null graph)
      return {
        graph: { nodes: [], edges: [] },
        preset: { name: 'deep', description: '', default_depth: 3, steps: {} },
        overlay: { steps: {}, knowledge: {}, reads: {}, dependencies: {}, crossReads: {} },
        stepMeta: new Map(),
        computeEligible: () => [],
        globalSteps: new Set<string>(),
        getPipelineHash: () => 'hash',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    })

    // dashboard.ts's handler calls process.exit(0) on success — intercept to
    // keep the test process alive while still asserting success.
    const origExit = process.exit
    let exitCode: number | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process as any).exit = (code?: number) => {
      exitCode = code ?? 0
      throw new Error('__exit__')
    }

    try {
      const dashboardCmd = (await import('../cli/commands/dashboard.js')).default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (dashboardCmd.handler as (a: any) => Promise<void>)({
        'no-open': true,
        _: [],
        $0: 'scaffold',
      })
    } catch (err) {
      if ((err as Error).message !== '__exit__') throw err
    } finally {
      process.exit = origExit
    }

    // Core assertion: resolvePipeline called once per configured service.
    expect(vi.mocked(resolvePipeline)).toHaveBeenCalledTimes(2)
    // Handler completed successfully despite api's throw.
    expect(exitCode).toBe(0)
    // HTML was written (atomicWriteFile was called with an <html> payload).
    expect(capturedHtml).toContain('<html')
    // Graph section absent (web has empty overlay, api threw → no edges).
    expect(capturedHtml).not.toContain('class="dep-graph"')
    // Service cards still rendered — the whole dashboard didn't crash.
    expect(capturedHtml).toContain('class="services-grid"')
  })
})
