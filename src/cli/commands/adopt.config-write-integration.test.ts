import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeOrUpdateConfig } from './adopt.js'
import type { AdoptionResult } from '../../project/adopt.js'
import type { DetectedConfig } from '../../types/config.js'

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-write-int-'))
}

function makeResult(overrides: Partial<AdoptionResult> = {}): AdoptionResult {
  return {
    mode: 'brownfield',
    artifactsFound: 0,
    detectedArtifacts: [],
    stepsCompleted: [],
    stepsRemaining: [],
    methodology: 'deep',
    errors: [],
    warnings: [],
    ...overrides,
  } as AdoptionResult
}

describe('writeOrUpdateConfig integration', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true })
    tmpDirs.length = 0
  })

  function tracked(dir: string): string {
    tmpDirs.push(dir)
    return dir
  }

  it('bootstraps new config.yml when none exists', () => {
    const dir = tracked(makeTmpDir())
    const result = makeResult({
      projectType: 'web-app',
      detectedConfig: {
        type: 'web-app',
        config: { renderingStrategy: 'ssr' },
      } as DetectedConfig,
    })

    writeOrUpdateConfig(dir, result)

    const content = fs.readFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'utf8',
    )
    expect(content).toContain('projectType: web-app')
    expect(content).toContain('renderingStrategy: ssr')
    expect(content).toContain('version: 2')
  })

  it('preserves comments in existing config.yml', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      '# My custom comment\nversion: 2\nproject:\n  projectType: web-app\n',
    )

    const result = makeResult({
      projectType: 'web-app',
      detectedConfig: {
        type: 'web-app',
        config: { renderingStrategy: 'ssr' },
      } as DetectedConfig,
    })

    writeOrUpdateConfig(dir, result)

    const content = fs.readFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'utf8',
    )
    expect(content).toContain('# My custom comment')
    expect(content).toContain('renderingStrategy: ssr')
  })

  it('removes stale config blocks when switching project types', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nproject:\n  projectType: game\n  gameConfig:\n    engine: unity\n',
    )

    const result = makeResult({
      projectType: 'web-app',
      detectedConfig: {
        type: 'web-app',
        config: { renderingStrategy: 'ssr' },
      } as DetectedConfig,
    })

    writeOrUpdateConfig(dir, result)

    const content = fs.readFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'utf8',
    )
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

    const result = makeResult({
      projectType: 'backend',
      detectedConfig: {
        type: 'backend',
        config: { apiStyle: 'rest' },
      } as DetectedConfig,
    })

    expect(() => writeOrUpdateConfig(dir, result)).not.toThrow()

    const content = fs.readFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'utf8',
    )
    expect(content).toContain('projectType: backend')
    expect(content).toContain('backendConfig')
  })

  it('throws on malformed YAML', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      '{{{{invalid!',
    )

    const result = makeResult({
      projectType: 'web-app',
      detectedConfig: {
        type: 'web-app',
        config: { renderingStrategy: 'ssr' },
      } as DetectedConfig,
    })

    expect(() => writeOrUpdateConfig(dir, result)).toThrow()
  })

  it('uses atomic tmp+rename write (no partial writes)', () => {
    const dir = tracked(makeTmpDir())
    const result = makeResult({
      projectType: 'cli',
      detectedConfig: {
        type: 'cli',
        config: { interactivity: 'args-only' },
      } as DetectedConfig,
    })

    writeOrUpdateConfig(dir, result)

    const configPath = path.join(dir, '.scaffold', 'config.yml')
    expect(fs.existsSync(configPath)).toBe(true)
    // No tmp file left behind
    const tmpPath = `${configPath}.${process.pid}.tmp`
    expect(fs.existsSync(tmpPath)).toBe(false)
  })

  it('does nothing when result has no projectType', () => {
    const dir = tracked(makeTmpDir())
    fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
    fs.writeFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'version: 2\nproject:\n',
    )

    const result = makeResult()   // no projectType, no detectedConfig

    writeOrUpdateConfig(dir, result)

    const content = fs.readFileSync(
      path.join(dir, '.scaffold', 'config.yml'),
      'utf8',
    )
    // File should be unchanged (no projectType mutation)
    expect(content).not.toContain('projectType:')
  })
})
