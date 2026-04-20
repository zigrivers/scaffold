import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import * as projectRootModule from '../middleware/project-root.js'

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `scaffold-dashboard-test-${crypto.randomUUID()}`)
  fs.mkdirSync(d, { recursive: true })
  tmpDirs.push(d)
  return d
}

function makeProjectDir(stateContent?: string): string {
  const dir = makeTmpDir()
  fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
  const state = stateContent ?? JSON.stringify({
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps: {
      'create-prd': {
        status: 'completed',
        source: 'pipeline',
        at: '2024-01-02T00:00:00.000Z',
        completed_by: 'claude',
        depth: 2,
        produces: ['docs/prd.md'],
      },
    },
    next_eligible: [],
    'extra-steps': [],
  })
  fs.writeFileSync(path.join(dir, '.scaffold', 'state.json'), state, 'utf8')
  return dir
}

/**
 * Create a multi-service project fixture.
 * Writes:
 *   - .scaffold/config.yml with `project.services` entries (YAML)
 *   - .scaffold/state.json  (v3 root, empty steps)
 *   - .scaffold/services/{svc}/state.json for each service in `services`
 * If `omitServiceStates` is supplied, those named service state files are NOT
 * written — used to test "broken service" handling.
 */
function makeMultiServiceProjectDir(opts: {
  services: Array<{ name: string; projectType: string; stepCompletedSlug?: string }>
  omitServiceStates?: string[]
}): string {
  const dir = makeTmpDir()
  fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })

  // config.yml with services[]
  const yamlServices = opts.services
    .map(s =>
      `    - name: ${s.name}\n      projectType: ${s.projectType}\n      ${configBlockFor(s.projectType)}`,
    )
    .join('\n')
  const yaml =
    `version: 2\nmethodology: deep\nplatforms: [claude-code]\nproject:\n  services:\n${yamlServices}\n`
  fs.writeFileSync(path.join(dir, '.scaffold', 'config.yml'), yaml, 'utf8')

  // v3 root state (global steps only; empty here)
  const rootState = JSON.stringify({
    'schema-version': 3,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps: {},
    next_eligible: [],
    'extra-steps': [],
  })
  fs.writeFileSync(path.join(dir, '.scaffold', 'state.json'), rootState, 'utf8')

  // per-service state files
  const omit = new Set(opts.omitServiceStates ?? [])
  for (const svc of opts.services) {
    if (omit.has(svc.name)) continue
    const svcDir = path.join(dir, '.scaffold', 'services', svc.name)
    fs.mkdirSync(svcDir, { recursive: true })
    const completedSlug = svc.stepCompletedSlug ?? 'create-prd'
    const svcState = JSON.stringify({
      'schema-version': 3,
      'scaffold-version': '2.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2024-01-01T00:00:00.000Z',
      in_progress: null,
      steps: {
        [completedSlug]: {
          status: 'completed',
          source: 'pipeline',
          at: '2024-01-02T00:00:00.000Z',
          completed_by: 'claude',
          depth: 2,
          produces: ['docs/prd.md'],
        },
      },
      next_eligible: [],
      'extra-steps': [],
    })
    fs.writeFileSync(path.join(svcDir, 'state.json'), svcState, 'utf8')
  }
  return dir
}

function configBlockFor(projectType: string): string {
  // Minimal valid config blocks per projectType (matching schema coupling rules).
  const indent = '        '
  switch (projectType) {
  case 'backend':
    return [
      'backendConfig:',
      `${indent}apiStyle: rest`,
      `${indent}dataStore: [relational]`,
      `${indent}authMechanism: apikey`,
      `${indent}asyncMessaging: none`,
      `${indent}deployTarget: container`,
      `${indent}domain: fintech`,
    ].join('\n')
  case 'library':
    return [
      'libraryConfig:',
      `${indent}visibility: internal`,
      `${indent}documentationLevel: api-docs`,
    ].join('\n')
  case 'web-app':
    return [
      'webAppConfig:',
      `${indent}frontendFramework: react`,
      `${indent}renderingStrategy: ssr`,
      `${indent}stateManagement: none`,
      `${indent}styling: tailwind`,
      `${indent}routing: file-based`,
      `${indent}dataFetching: rest`,
      `${indent}authMechanism: apikey`,
      `${indent}deployTarget: container`,
      `${indent}domain: fintech`,
    ].join('\n')
  default:
    return ''
  }
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
  vi.restoreAllMocks()
})

async function runDashboardHandler(argv: Record<string, unknown>): Promise<void> {
  const mod = await import('./dashboard.js')
  const cmd = mod.default
  if (typeof cmd.handler === 'function') {
    await cmd.handler(argv as never)
  }
}

const BASE_ARGV = {
  root: undefined,
  format: undefined,
  auto: false,
  output: undefined as string | undefined,
  'no-open': true,
  'json-only': false,
}

describe('dashboard command', () => {
  let stdoutWrite: MockInstance<typeof process.stdout.write>
  let stderrWrite: MockInstance<typeof process.stderr.write>
  let exitSpy: MockInstance

  beforeEach(() => {
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`)
    }) as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exits 1 when project root not found', async () => {
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(null)

    await expect(
      runDashboardHandler({ ...BASE_ARGV }),
    ).rejects.toThrow('process.exit(1)')

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('--json-only outputs JSON to stdout', async () => {
    const dir = makeProjectDir()
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, format: 'json', 'json-only': true }),
    ).rejects.toThrow('process.exit(0)')

    const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
    const parsed = JSON.parse(allStdout) as {
      success: boolean
      data: { methodology: string; steps: unknown[]; progress: unknown; decisions: unknown[] }
    }
    expect(parsed.success).toBe(true)
    expect(parsed.data).toHaveProperty('methodology')
    expect(parsed.data).toHaveProperty('steps')
    expect(parsed.data).toHaveProperty('progress')
    expect(parsed.data).toHaveProperty('decisions')
  })

  it('generates HTML file at specified --output path', async () => {
    const dir = makeProjectDir()
    const outDir = makeTmpDir()
    const outputPath = path.join(outDir, 'dashboard.html')
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
    ).rejects.toThrow('process.exit(0)')

    expect(fs.existsSync(outputPath)).toBe(true)
    const content = fs.readFileSync(outputPath, 'utf8')
    expect(content.trimStart().startsWith('<!DOCTYPE html>')).toBe(true)
  })

  it('creates parent directories for --output path', async () => {
    const dir = makeProjectDir()
    const outDir = makeTmpDir()
    const outputPath = path.join(outDir, 'nested', 'deep', 'dashboard.html')
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
    ).rejects.toThrow('process.exit(0)')

    expect(fs.existsSync(outputPath)).toBe(true)
  })

  it('--no-open generates HTML and exits 0 without attempting browser open', async () => {
    // When --no-open is true the handler must not invoke any browser opener.
    // We verify this by asserting the command succeeds cleanly even in a
    // headless environment where open/xdg-open would not be available.
    const dir = makeProjectDir()
    const outDir = makeTmpDir()
    const outputPath = path.join(outDir, 'dashboard.html')
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
    ).rejects.toThrow('process.exit(0)')

    // File exists, so the handler completed the write step
    expect(fs.existsSync(outputPath)).toBe(true)
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('outputs success message with file path in interactive mode', async () => {
    const dir = makeProjectDir()
    const outDir = makeTmpDir()
    const outputPath = path.join(outDir, 'dashboard.html')
    vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

    await expect(
      runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
    ).rejects.toThrow('process.exit(0)')

    const allOutput = [
      ...stdoutWrite.mock.calls.map(c => String(c[0])),
      ...stderrWrite.mock.calls.map(c => String(c[0])),
    ].join('')
    expect(allOutput).toContain('Dashboard generated')
    expect(allOutput).toContain(outputPath)
  })

  describe('multi-service mode', () => {
    it('renders multi-service HTML when services[] is non-empty and --service is not set', async () => {
      const dir = makeMultiServiceProjectDir({
        services: [
          { name: 'svc-a', projectType: 'backend' },
          { name: 'svc-b', projectType: 'library' },
        ],
      })
      const outDir = makeTmpDir()
      const outputPath = path.join(outDir, 'dashboard.html')
      vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

      await expect(
        runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
      ).rejects.toThrow('process.exit(0)')

      expect(fs.existsSync(outputPath)).toBe(true)
      const html = fs.readFileSync(outputPath, 'utf8')
      // Multi-service template marker (service cards, not present in single-service HTML).
      expect(html).toContain('service-card')
      expect(html).toContain('svc-a')
      expect(html).toContain('svc-b')
    })

    it('--service flag bypasses multi-service mode even when services[] exists', async () => {
      const dir = makeMultiServiceProjectDir({
        services: [
          { name: 'svc-a', projectType: 'backend' },
          { name: 'svc-b', projectType: 'library' },
        ],
      })
      const outDir = makeTmpDir()
      const outputPath = path.join(outDir, 'dashboard.html')
      vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

      await expect(
        runDashboardHandler({ ...BASE_ARGV, output: outputPath, service: 'svc-a' }),
      ).rejects.toThrow('process.exit(0)')

      expect(fs.existsSync(outputPath)).toBe(true)
      const html = fs.readFileSync(outputPath, 'utf8')
      // Single-service HTML must NOT contain the multi-service service-card marker.
      expect(html).not.toContain('service-card')
    })

    it('single-project config (no services) uses existing single-service path', async () => {
      // makeProjectDir writes NO config.yml — loadConfig returns null, so services[] is undefined.
      const dir = makeProjectDir()
      const outDir = makeTmpDir()
      const outputPath = path.join(outDir, 'dashboard.html')
      vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

      await expect(
        runDashboardHandler({ ...BASE_ARGV, output: outputPath }),
      ).rejects.toThrow('process.exit(0)')

      const html = fs.readFileSync(outputPath, 'utf8')
      // Single-service HTML should not contain multi-service card markers.
      expect(html).not.toContain('service-card')
    })

    it('--json-only mode emits MultiServiceDashboardData envelope', async () => {
      const dir = makeMultiServiceProjectDir({
        services: [
          { name: 'svc-a', projectType: 'backend' },
          { name: 'svc-b', projectType: 'library' },
        ],
      })
      vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

      await expect(
        runDashboardHandler({ ...BASE_ARGV, format: 'json', 'json-only': true }),
      ).rejects.toThrow('process.exit(0)')

      const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
      const parsed = JSON.parse(allStdout) as {
        success: boolean
        data: {
          services?: Array<{ name: string; projectType: string }>
          aggregate?: { totalServices: number; averagePercentage: number }
          // Single-service-only keys must be absent in multi-service envelope:
          steps?: unknown
          progress?: unknown
          decisions?: unknown
        }
      }
      expect(parsed.success).toBe(true)
      expect(parsed.data).toHaveProperty('services')
      expect(parsed.data).toHaveProperty('aggregate')
      expect(parsed.data.services).toHaveLength(2)
      expect(parsed.data.aggregate?.totalServices).toBe(2)
      // Must NOT contain single-service-only shape keys.
      expect(parsed.data).not.toHaveProperty('steps')
      expect(parsed.data).not.toHaveProperty('progress')
      expect(parsed.data).not.toHaveProperty('decisions')
    })

    it('missing service state uses empty skeleton state (continues with remaining services)', async () => {
      const dir = makeMultiServiceProjectDir({
        services: [
          { name: 'svc-a', projectType: 'backend' },
          { name: 'svc-b', projectType: 'library' },
        ],
        omitServiceStates: ['svc-b'],  // svc-b has no state.json
      })
      vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

      await expect(
        runDashboardHandler({ ...BASE_ARGV, format: 'json', 'json-only': true }),
      ).rejects.toThrow('process.exit(0)')

      const allStdout = stdoutWrite.mock.calls.map(c => String(c[0])).join('')
      const parsed = JSON.parse(allStdout) as {
        success: boolean
        data: { services: Array<{ name: string; total: number; completed: number; percentage: number }> }
      }
      expect(parsed.success).toBe(true)
      expect(parsed.data.services).toHaveLength(2)
      const svcB = parsed.data.services.find(s => s.name === 'svc-b')
      expect(svcB).toBeDefined()
      // Skeleton state = empty steps: total=0, completed=0, percentage=0.
      expect(svcB?.total).toBe(0)
      expect(svcB?.completed).toBe(0)
      expect(svcB?.percentage).toBe(0)
      // svc-a should still have its data intact.
      const svcA = parsed.data.services.find(s => s.name === 'svc-a')
      expect(svcA?.total).toBeGreaterThan(0)
    })

    it('re-throws non-STATE_MISSING errors (corrupt JSON does not become a skeleton — MMR P2 lock)', async () => {
      // Regression guard: earlier bare catch collapsed every failure mode
      // (corrupt JSON, schema-version mismatch, permission errors) into an
      // empty skeleton, hiding real problems behind a 0% row.
      const dir = makeMultiServiceProjectDir({
        services: [
          { name: 'svc-a', projectType: 'backend' },
          { name: 'svc-b', projectType: 'library' },
        ],
      })
      // Corrupt svc-b's state.json — not missing, but parse-broken.
      const svcBPath = path.join(dir, '.scaffold', 'services', 'svc-b', 'state.json')
      fs.writeFileSync(svcBPath, '{ this is not valid json')
      vi.spyOn(projectRootModule, 'findProjectRoot').mockReturnValue(dir)

      await expect(
        runDashboardHandler({ ...BASE_ARGV, format: 'json', 'json-only': true }),
      ).rejects.toThrow(/STATE_PARSE_ERROR|state\.json/i)
    })
  })
})
