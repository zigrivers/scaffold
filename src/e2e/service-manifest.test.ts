/**
 * E2E smoke test: scaffold init --from <nibble.yml>
 *
 * Proves the full declarative init path works end-to-end with a 5-service
 * manifest shaped like a real multi-service project (nibble). The test uses
 * a real tmpdir and calls initCommand.handler directly — no mocking of the
 * modules under test.
 *
 * External collaborators that are NOT mocked (real behaviour verified):
 *   - materializeScaffoldProject
 *   - StateManager / initializeState
 *   - ConfigSchema.parse (round-trip normalization)
 *
 * Mocked (to keep the test hermetic in CI):
 *   - runBuild — requires built pipeline artifacts; mocked to exit 0 + empty data
 *   - syncSkillsIfNeeded — requires .claude-plugin; mocked best-effort no-op
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse as parseYaml } from 'yaml'
import { ConfigSchema } from '../config/schema.js'

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before real imports
// ---------------------------------------------------------------------------

vi.mock('../cli/commands/build.js', () => ({
  runBuild: vi.fn().mockResolvedValue({
    exitCode: 0,
    data: {
      stepsTotal: 0,
      stepsEnabled: 0,
      platforms: ['claude-code'],
      generatedFiles: 0,
      buildTimeMs: 1,
    },
  }),
  default: {
    handler: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../core/skills/sync.js', () => ({
  syncSkillsIfNeeded: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Real imports (after mock declarations)
// ---------------------------------------------------------------------------

import initCommand from '../cli/commands/init.js'
import runCommand from '../cli/commands/run.js'

// ---------------------------------------------------------------------------
// Nibble-shaped 5-service manifest
// ---------------------------------------------------------------------------

const nibbleManifest = `version: 2
methodology: deep
platforms: [claude-code]
project:
  services:
    - name: strategy-evaluator
      projectType: library
      libraryConfig:
        visibility: internal
        documentationLevel: api-docs
      path: shared/strategy_evaluator
    - name: research-engine
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: apikey
        asyncMessaging: none
        deployTarget: container
        domain: fintech
      path: services/research
    - name: backtesting-engine
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: apikey
        asyncMessaging: none
        deployTarget: container
        domain: fintech
      path: services/backtesting
    - name: trading-bot
      projectType: backend
      backendConfig:
        apiStyle: rest
        dataStore: [relational]
        authMechanism: oauth
        asyncMessaging: event-driven
        deployTarget: container
        domain: fintech
      path: services/trading-bot
    - name: dashboard
      projectType: web-app
      webAppConfig:
        renderingStrategy: ssr
        deployTarget: container
        realtime: websocket
        authFlow: oauth
      path: apps/dashboard
`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: scaffold init --from <nibble.yml>', () => {
  let root: string
  let manifestPath: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-nibble-'))
    manifestPath = path.join(root, 'services.yml')
    fs.writeFileSync(manifestPath, nibbleManifest, 'utf-8')
    process.exitCode = 0

    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    vi.restoreAllMocks()
    process.exitCode = undefined
  })

  it('materializes a nibble-shaped multi-service project', async () => {
    // Phase 1: scaffold init --from services.yml --root <tmpdir> --auto
    await initCommand.handler({
      _: [],
      $0: 'scaffold',
      from: manifestPath,
      root,
      auto: true,
      force: false,
      format: undefined,
      verbose: false,
    } as Parameters<typeof initCommand.handler>[0])

    const configPath = path.join(root, '.scaffold', 'config.yml')
    const statePath = path.join(root, '.scaffold', 'state.json')
    const decisionsPath = path.join(root, '.scaffold', 'decisions.jsonl')

    // All three scaffold files must exist
    expect(fs.existsSync(configPath)).toBe(true)
    expect(fs.existsSync(statePath)).toBe(true)
    expect(fs.existsSync(decisionsPath)).toBe(true)

    // Config round-trips through Zod normalization: what was written equals
    // ConfigSchema.parse(input) — defaults filled in, structure normalized.
    const parsedWritten = parseYaml(fs.readFileSync(configPath, 'utf8'))
    const parsedInput = parseYaml(nibbleManifest)
    const normalizedInput = ConfigSchema.parse(parsedInput)
    expect(parsedWritten).toEqual(normalizedInput)

    // State emits schema-version 2 because services[] is present.
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    expect(state['schema-version']).toBe(2)

    // decisions.jsonl is empty (current behavior preserved).
    expect(fs.readFileSync(decisionsPath, 'utf8')).toBe('')

    // Phase 2: scaffold run implementation-plan (a per-service step) should
    // exit 2 because no --service flag is provided. Global steps like
    // create-prd now run without --service; per-service steps require it.
    process.exitCode = 0
    await runCommand.handler({
      root,
      _: ['implementation-plan'],
      step: 'implementation-plan',
      $0: 'scaffold',
    } as Parameters<typeof runCommand.handler>[0])
    expect(process.exitCode).toBe(2)
  })
})
