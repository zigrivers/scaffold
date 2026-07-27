import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeInitializeConfig } from './adoption-apply.js'
import type { InitializeRecord } from './adoption-plan.js'

// These cases used to target `writeOrUpdateConfig` in cli/commands/adopt.ts — a
// helper that `adopt --apply` stopped calling in R1 and that adopt.ts marked
// "slated for removal in R2". They were the only thing keeping it alive, so the
// suite was proving that dead code worked. They now target
// `writeInitializeConfig`, which is what actually writes .scaffold/config.yml,
// and which had no direct coverage of its own before this. The helper is gone.

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-write-int-'))
}

function makeInitialize(project: Record<string, unknown> | null): InitializeRecord {
  return {
    config: {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project,
    },
    state: {
      'init-mode': 'brownfield',
      methodology: 'deep',
      steps: {},
    },
  }
}

describe('writeInitializeConfig integration', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
    tmpDirs.length = 0
  })

  function tracked(dir: string): string {
    tmpDirs.push(dir)
    return dir
  }

  function readConfig(dir: string): string {
    return fs.readFileSync(path.join(dir, '.scaffold', 'config.yml'), 'utf8')
  }

  it('bootstraps new config.yml when none exists', () => {
    const dir = tracked(makeTmpDir())

    writeInitializeConfig(dir, makeInitialize({
      projectType: 'web-app',
      webAppConfig: { renderingStrategy: 'ssr' },
    }))

    const content = readConfig(dir)
    expect(content).toContain('projectType: web-app')
    expect(content).toContain('renderingStrategy: ssr')
    expect(content).toContain('version: 2')
    expect(content).toContain('methodology: deep')
  })

  it('preserves comments in existing config.yml', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      '# My custom comment\nversion: 2\nproject:\n  projectType: web-app\n',
    )

    writeInitializeConfig(dir, makeInitialize({
      projectType: 'web-app',
      webAppConfig: { renderingStrategy: 'ssr' },
    }))

    const content = readConfig(dir)
    expect(content).toContain('# My custom comment')
    expect(content).toContain('renderingStrategy: ssr')
  })

  it('preserves unrelated top-level keys in existing config.yml', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nartifact_map:\n  create-prd: docs/prd.md\nproject:\n  projectType: web-app\n',
    )

    writeInitializeConfig(dir, makeInitialize({
      projectType: 'web-app',
      webAppConfig: { renderingStrategy: 'ssr' },
    }))

    // The doc comment on writeInitializeConfig promises "preserves unrelated
    // keys of an existing config.yml". artifact_map is one a real adopted repo
    // carries, and clobbering it would silently unmap every adopted artifact.
    const content = readConfig(dir)
    expect(content).toContain('artifact_map:')
    expect(content).toContain('create-prd: docs/prd.md')
  })

  it('removes stale config blocks when switching project types', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nproject:\n  projectType: game\n  gameConfig:\n    engine: unity\n',
    )

    writeInitializeConfig(dir, makeInitialize({
      projectType: 'web-app',
      webAppConfig: { renderingStrategy: 'ssr' },
    }))

    const content = readConfig(dir)
    expect(content).toContain('projectType: web-app')
    expect(content).toContain('webAppConfig')
    expect(content).not.toContain('gameConfig')
    expect(content).not.toContain('engine: unity')
  })

  it('handles bare project: (null scalar) without crashing', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nproject:\n',
    )

    expect(() => writeInitializeConfig(dir, makeInitialize({
      projectType: 'backend',
      backendConfig: { apiStyle: 'rest' },
    }))).not.toThrow()

    const content = readConfig(dir)
    expect(content).toContain('projectType: backend')
    expect(content).toContain('backendConfig')
  })

  it('throws a config-parse error naming the file on malformed YAML', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.scaffold', 'config.yml'), '{{{{invalid!')

    // The error must be the project's structured one: a code the CLI envelope
    // can map, a recovery hint, and the offending file. Without the doc.errors
    // check in writeInitializeConfig this still throws, but as the yaml
    // library's bare "Document with errors cannot be stringified" — no code, no
    // recovery, no filename.
    let thrown: unknown
    try {
      writeInitializeConfig(dir, makeInitialize({ projectType: 'web-app' }))
    } catch (err) {
      thrown = err
    }

    expect(thrown, 'malformed config.yml must fail the apply, not be silently rewritten').toBeDefined()
    const error = thrown as { code?: string; recovery?: string; context?: { file?: string } }
    expect(error.code).toBe('CONFIG_PARSE_ERROR')
    expect(error.recovery).toBeTruthy()
    expect(error.context?.file).toBe(path.join(dir, '.scaffold', 'config.yml'))
  })

  it('uses atomic tmp+rename write (no partial writes)', () => {
    const dir = tracked(makeTmpDir())

    writeInitializeConfig(dir, makeInitialize({
      projectType: 'cli',
      cliConfig: { interactivity: 'args-only' },
    }))

    const configPath = path.join(dir, '.scaffold', 'config.yml')
    expect(fs.existsSync(configPath)).toBe(true)
    // No tmp file left behind — see atomicWriteFile in src/utils/fs.ts
    expect(fs.existsSync(`${configPath}.tmp`)).toBe(false)
  })

  it('leaves an existing project block untouched when the plan has no project', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nproject:\n  projectType: web-app\n',
    )

    // project: null means the plan detected no project type. The apply path must
    // still write version/methodology/platforms, but must not erase what is
    // already there — that would downgrade a configured project to untyped.
    writeInitializeConfig(dir, makeInitialize(null))

    const content = readConfig(dir)
    expect(content).toContain('projectType: web-app')
    expect(content).toContain('methodology: deep')
  })
})
