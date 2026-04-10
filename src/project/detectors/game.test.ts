import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectGame } from './game.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/game')

describe('detectGame', () => {
  it('detects Unity from Assets/*.meta', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'unity-only'))
    const match = detectGame(ctx)
    expect(match).toBeTruthy()
    expect(match?.projectType).toBe('game')
    expect(match?.partialConfig.engine).toBe('unity')
    expect(match?.confidence).toBe('high')
  })

  it('detects Unreal from *.uproject', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'unreal-only'))
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('unreal')
  })

  it('detects Godot from project.godot', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'godot-only'))
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('godot')
  })

  it('detects Bevy as custom engine', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'bevy'))
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('custom')
  })

  it('returns null when no game signature exists', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      files: { 'package.json': '{"name":"demo"}' },
      packageJson: { name: 'demo' },
    })
    expect(detectGame(ctx)).toBeNull()
  })

  it('Unity precedence: picks Unity when Unity + Unreal both present', () => {
    const multiEngine = path.join(FIXTURES, 'multi-engine')
    const ctx = createSignalContext(multiEngine)
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('unity')
  })

  it('emits evidence with signal and file', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'godot-only'))
    const match = detectGame(ctx)
    expect(match?.evidence).toContainEqual({
      signal: 'godot-project', file: 'project.godot', note: undefined,
    })
  })

  it('detects Love2D from conf.lua + main.lua', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['conf.lua', 'main.lua'],
      files: { 'conf.lua': 'function love.conf(t) end', 'main.lua': 'function love.draw() end' },
    })
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('custom')
    expect(match?.evidence[0].signal).toBe('love2d-conf')
  })

  it('detects JS game from phaser npm dep', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      files: { 'package.json': '{"name":"x"}' },
      packageJson: { name: 'x', dependencies: { phaser: '3.80' } },
    })
    const match = detectGame(ctx)
    expect(match?.partialConfig.engine).toBe('custom')
    expect(match?.evidence[0].signal).toBe('js-game-dep')
  })

  it('requires index.html alongside three for JS game detection', () => {
    // three alone is not enough — could be a visualization project
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      files: { 'package.json': '{"name":"x"}' },
      packageJson: { name: 'x', dependencies: { three: '0.160' } },
    })
    expect(detectGame(ctx)).toBeNull()
  })

  it('returns null for empty directory', () => {
    const ctx = createFakeSignalContext({ rootEntries: [] })
    expect(detectGame(ctx)).toBeNull()
  })
})
