import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gateTemplateVars, ingestGateSeed } from './gate-ingest.js'

function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ingest-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  return root
}

describe('ingestGateSeed', () => {
  it('classifies package.json scripts: lint/typecheck/test to the gate, visual/e2e excluded', () => {
    const root = project({
      'package.json': JSON.stringify({
        scripts: {
          lint: 'biome check .',
          typecheck: 'tsc --noEmit',
          test: 'vitest run',
          'test:visual': 'playwright test --grep @visual',
          e2e: 'playwright test',
        },
        devDependencies: { vitest: '^3.0.0' },
      }),
    })
    const seed = ingestGateSeed(root)
    expect(seed.gateCommands).toEqual(['npm run lint', 'npm run typecheck', 'npm run test'])
    expect(seed.visualCommands).toEqual(['npm run test:visual', 'npm run e2e'])
    expect(seed.sources).toContain('package.json:scripts.lint')
  })
  it('detects vitest and emits the --changed affected invocation with quarantine expansion', () => {
    const root = project({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^3' } }),
    })
    const seed = ingestGateSeed(root)
    expect(seed.affectedInvocation).toBe(
      'npx vitest run --changed "$BASE" ${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}',
    )
    expect(seed.probeCommands).toEqual(['npx vitest --version >/dev/null'])
  })
  it('falls back to the full gate when no affected-capable runner is detected', () => {
    const root = project({ 'package.json': JSON.stringify({ scripts: { test: 'mocha' } }) })
    expect(ingestGateSeed(root).affectedInvocation).toBe(
      'full "no affected-selection runner detected at seed time"',
    )
  })
  it('extracts additional test commands from workflow run: steps, deduplicated', () => {
    const root = project({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^3' } }),
      '.github/workflows/ci.yml': [
        'jobs:',
        '  test:',
        '    steps:',
        '      - run: npm run test',
        '      - run: npx tsc --noEmit',
        '      - run: echo hello',
      ].join('\n'),
    })
    const seed = ingestGateSeed(root)
    expect(seed.gateCommands).toContain('npx tsc --noEmit')
    expect(seed.gateCommands.filter(c => c === 'npm run test').length).toBe(1)
    expect(seed.gateCommands).not.toContain('echo hello')
    expect(seed.sources.join('\n')).toContain('.github/workflows/ci.yml')
  })
  it('adds a functional java runtime probe when scripts mention java/emulators', () => {
    const root = project({
      'package.json': JSON.stringify({
        scripts: { test: 'firebase emulators:exec "vitest run"' },
        devDependencies: { vitest: '^3' },
      }),
    })
    const seed = ingestGateSeed(root)
    expect(seed.runtimeProbes.join('\n')).toContain('java -version')
  })
  it('non-node projects get a no-op ensureDeps and a fail-loud empty gate', () => {
    const root = project({})
    const seed = ingestGateSeed(root)
    expect(seed.ensureDeps).toBe(':')
    const vars = gateTemplateVars(seed)
    expect(vars.GATE_FULL_COMMANDS).toContain('no gate commands were detected')
    expect(vars.GATE_FULL_COMMANDS).toContain('exit 1')
  })
})

describe('gateTemplateVars', () => {
  it('maps every marker the two templates consume', () => {
    const root = project({
      'package.json': JSON.stringify({ scripts: { test: 'vitest run' }, devDependencies: { vitest: '^3' } }),
    })
    const vars = gateTemplateVars(ingestGateSeed(root))
    for (const key of [
      'GATE_ENSURE_DEPS', 'GATE_RUNTIME_PROBES', 'GATE_PROBE_COMMANDS',
      'GATE_FULL_COMMANDS', 'GATE_AFFECTED_INVOCATION',
    ]) {
      expect(vars[key], key).toBeTypeOf('string')
      expect(vars[key].length, key).toBeGreaterThan(0)
    }
  })
})
