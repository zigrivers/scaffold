/**
 * E2E integration tests for cross-service references (Wave 3c).
 *
 * Scope note: these tests exercise the full cross-reads resolver against the
 * real filesystem (StateManager.loadStateReadOnly, migrateState, state merging,
 * per-service cache, transitive DFS). MetaPromptFile fixtures are typed objects
 * rather than on-disk pipeline content because Wave 3c is the first feature to
 * use the crossReads frontmatter field — no real pipeline step uses it yet.
 * CLI-wiring coverage (loadPipelineContext + runCommand.handler) lives in
 * src/cli/commands/run.test.ts's "cross-reads artifact gathering (Wave 3c)"
 * suite, which mocks resolveTransitiveCrossReads at the module boundary.
 *
 * Verifies:
 *  - resolveTransitiveCrossReads returns foreign service artifacts
 *  - transitive chain A → B → C surfaces C's artifact via B's crossReads
 *  - the read-only loader NEVER writes to foreign state — regression test for
 *    the Round-4 P0 (migrateState → saveState clobbering next_eligible)
 *  - cross-reads work while a foreign service's lock is held (no deadlock,
 *    no foreign-state write under concurrency)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveTransitiveCrossReads } from '../core/assembly/cross-reads.js'
import type {
  ScaffoldConfig, PipelineState, MetaPromptFile,
} from '../types/index.js'
import type { OutputContext } from '../cli/output/context.js'

function mkOutput(): OutputContext {
  return {
    warn: vi.fn(), info: vi.fn(), success: vi.fn(), error: vi.fn(),
    result: vi.fn(),
    supportsInteractivePrompts: vi.fn().mockReturnValue(false),
    prompt: vi.fn(), confirm: vi.fn(), select: vi.fn(),
    multiSelect: vi.fn(), multiInput: vi.fn(),
    startSpinner: vi.fn(), stopSpinner: vi.fn(),
    startProgress: vi.fn(), updateProgress: vi.fn(), stopProgress: vi.fn(),
  } as unknown as OutputContext
}

function mkMetaFile(
  name: string,
  crossReads: Array<{ service: string; step: string }> = [],
): MetaPromptFile {
  return {
    stepName: name,
    filePath: `/fake/${name}.md`,
    frontmatter: {
      name, description: '', summary: null,
      phase: 'architecture', order: 700,
      dependencies: [], outputs: [], conditional: null,
      knowledgeBase: [], reads: [], crossReads,
      stateless: false, category: 'pipeline',
    },
    body: '', sections: {},
  }
}

function writeState(
  filePath: string,
  steps: Record<string, { status: string; source?: string; produces?: string[] }>,
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify({
    'schema-version': 3,
    steps,
    next_eligible: [],
    in_progress: null,
  }))
}

describe('Cross-service references E2E (Wave 3c)', () => {
  let projectRoot: string
  const producerStep = 'domain-modeling'  // service-local step (not in multi-service-overlay)

  beforeEach(() => {
    projectRoot = path.join(os.tmpdir(), `scaffold-e2e-cross-${Date.now()}-${Math.random()}`)
    fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true })
    fs.mkdirSync(path.join(projectRoot, '.scaffold', 'services', 'producer'), { recursive: true })
    fs.mkdirSync(path.join(projectRoot, '.scaffold', 'services', 'consumer'), { recursive: true })
    writeState(path.join(projectRoot, '.scaffold', 'state.json'), {})
    writeState(
      path.join(projectRoot, '.scaffold', 'services', 'producer', 'state.json'),
      { [producerStep]: { status: 'completed', produces: ['docs/contracts.md'] } },
    )
    writeState(
      path.join(projectRoot, '.scaffold', 'services', 'consumer', 'state.json'),
      {},
    )
    fs.writeFileSync(path.join(projectRoot, 'docs', 'contracts.md'), 'CONTRACTS')
  })
  afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }))

  const config: ScaffoldConfig = {
    version: 2, methodology: 'deep', platforms: ['claude-code'],
    project: {
      services: [
        {
          name: 'producer', projectType: 'library',
          libraryConfig: { visibility: 'internal' },
          exports: [{ step: producerStep }],
        },
        {
          name: 'consumer', projectType: 'backend',
          backendConfig: { apiStyle: 'rest' },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }

  it('resolveTransitiveCrossReads returns foreign service artifact end-to-end', () => {
    const metas = new Map<string, MetaPromptFile>([
      [producerStep, mkMetaFile(producerStep)],
    ])
    const output = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'producer', step: producerStep }],
      config, projectRoot, metas, output,
      new Set(), new Map(), new Map<string, PipelineState | null>(),
    )
    expect(artifacts).toEqual([
      expect.objectContaining({
        stepName: `producer:${producerStep}`,
        filePath: 'docs/contracts.md',
        content: 'CONTRACTS',
      }),
    ])
  })

  it('transitive chain: consumer → producer → shared-lib surfaces all artifacts', () => {
    // A third service 'shared-lib' produces docs/shared.md; producer's
    // domain-modeling step cross-reads shared-lib, so consumer cross-reading
    // producer should transitively receive shared-lib's artifact too.
    fs.mkdirSync(path.join(projectRoot, '.scaffold', 'services', 'shared-lib'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, 'docs', 'shared.md'), 'SHARED')
    writeState(
      path.join(projectRoot, '.scaffold', 'services', 'shared-lib', 'state.json'),
      { 'api-contracts': { status: 'completed', produces: ['docs/shared.md'] } },
    )
    const transitiveConfig: ScaffoldConfig = {
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        services: [
          {
            name: 'producer', projectType: 'library',
            libraryConfig: { visibility: 'internal' },
            exports: [{ step: producerStep }],
          },
          {
            name: 'shared-lib', projectType: 'library',
            libraryConfig: { visibility: 'internal' },
            exports: [{ step: 'api-contracts' }],
          },
          {
            name: 'consumer', projectType: 'backend',
            backendConfig: { apiStyle: 'rest' },
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }
    // Producer's step template declares a cross-read to shared-lib:api-contracts
    const metas = new Map<string, MetaPromptFile>([
      [producerStep, mkMetaFile(producerStep, [{ service: 'shared-lib', step: 'api-contracts' }])],
      ['api-contracts', mkMetaFile('api-contracts')],
    ])
    const output = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'producer', step: producerStep }],  // consumer → producer
      transitiveConfig, projectRoot, metas, output,
      new Set(), new Map(), new Map<string, PipelineState | null>(),
    )
    const paths = artifacts.map(a => a.filePath).sort()
    expect(paths).toEqual(['docs/contracts.md', 'docs/shared.md'])
  })

  it('NEVER writes to foreign state file even when migrateState would apply a rename', () => {
    // Regression for Round-4 P0. Seed producer state with a deprecated step name
    // that migrateState would rename (testing-strategy → tdd). If loadStateReadOnly
    // or any downstream code calls saveState, this file's mtime changes.
    const producerStatePath = path.join(
      projectRoot, '.scaffold', 'services', 'producer', 'state.json',
    )
    writeState(producerStatePath, {
      [producerStep]: { status: 'completed', produces: ['docs/contracts.md'] },
      'testing-strategy': { status: 'completed', produces: ['docs/tdd.md'] },
    })
    // Backdate so a same-millisecond write would still be detectable
    const backdated = new Date(Date.now() - 2000)
    fs.utimesSync(producerStatePath, backdated, backdated)
    const mtimeBefore = fs.statSync(producerStatePath).mtimeMs

    const metas = new Map<string, MetaPromptFile>([
      [producerStep, mkMetaFile(producerStep)],
    ])
    const output = mkOutput()
    resolveTransitiveCrossReads(
      [{ service: 'producer', step: producerStep }],
      config, projectRoot, metas, output,
      new Set(), new Map(), new Map<string, PipelineState | null>(),
    )
    const mtimeAfter = fs.statSync(producerStatePath).mtimeMs
    expect(mtimeAfter).toBe(mtimeBefore)  // file NOT written
  })

  it('cross-read succeeds when producer service has an active lock (no deadlock, no write)', () => {
    // Simulate a foreign service lock held by another concurrent run
    const lockDir = path.join(projectRoot, '.scaffold', 'services', 'producer')
    const lockPath = path.join(lockDir, 'lock.json')
    fs.writeFileSync(lockPath, JSON.stringify({
      pid: 999999, step: producerStep, acquired: new Date().toISOString(),
    }))
    const statePath = path.join(lockDir, 'state.json')
    const backdated = new Date(Date.now() - 2000)
    fs.utimesSync(statePath, backdated, backdated)
    const mtimeBefore = fs.statSync(statePath).mtimeMs

    const metas = new Map<string, MetaPromptFile>([
      [producerStep, mkMetaFile(producerStep)],
    ])
    const output = mkOutput()
    // Must complete without hanging on the lock — read-only loader acquires no lock.
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'producer', step: producerStep }],
      config, projectRoot, metas, output,
      new Set(), new Map(), new Map<string, PipelineState | null>(),
    )
    expect(artifacts.length).toBeGreaterThan(0)
    // Still no write to foreign state
    expect(fs.statSync(statePath).mtimeMs).toBe(mtimeBefore)
  })

  it('overlay-only crossRead (no frontmatter entry) surfaces through resolveTransitiveCrossReads (Wave 3c+1)', () => {
    // Step B's frontmatter has no crossReads; an overlay adds one pointing at C.
    // Passing the overlay map to the resolver must surface C's artifact.
    fs.mkdirSync(path.join(projectRoot, '.scaffold', 'services', 'consumer2'), { recursive: true })
    fs.writeFileSync(path.join(projectRoot, 'docs', 'extra.md'), 'EXTRA')
    writeState(
      path.join(projectRoot, '.scaffold', 'services', 'consumer2', 'state.json'),
      { 'extra-step': { status: 'completed', produces: ['docs/extra.md'] } },
    )

    const configWithExtraExport: ScaffoldConfig = {
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        services: [
          {
            name: 'producer', projectType: 'library',
            libraryConfig: { visibility: 'internal' },
            exports: [{ step: producerStep }],
          },
          {
            name: 'consumer2', projectType: 'library',
            libraryConfig: { visibility: 'internal' },
            exports: [{ step: 'extra-step' }],
          },
          {
            name: 'consumer', projectType: 'backend',
            backendConfig: { apiStyle: 'rest' },
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }
    const metas = new Map<string, MetaPromptFile>([
      [producerStep, mkMetaFile(producerStep)],  // no frontmatter crossReads
    ])
    // Overlay adds a cross-read to producer's step
    const overlayCrossReads = {
      [producerStep]: [{ service: 'consumer2', step: 'extra-step' }],
    }
    const output = mkOutput()
    const artifacts = resolveTransitiveCrossReads(
      [{ service: 'producer', step: producerStep }],
      configWithExtraExport, projectRoot, metas, output,
      new Set(), new Map(), new Map<string, PipelineState | null>(),
      undefined,  // globalSteps
      overlayCrossReads,
    )
    const paths = artifacts.map(a => a.filePath).sort()
    // producer's own docs/contracts.md + consumer2's docs/extra.md (via overlay-added crossRead)
    expect(paths).toEqual(['docs/contracts.md', 'docs/extra.md'])
  })
})
