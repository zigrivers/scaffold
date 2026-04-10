// src/project/detectors/game.ts
import type { SignalContext } from './context.js'
import type { GameMatch } from './types.js'
import { evidence } from './types.js'

/**
 * Detects game projects by engine signature (per spec Section 5.9):
 *   Unity    → Assets/ directory containing any *.meta file
 *   Unreal   → *.uproject at root
 *   Godot    → project.godot at root
 *   Bevy     → Cargo.toml with bevy dep → engine: 'custom'
 *   Love2D   → conf.lua + main.lua at root → engine: 'custom'
 *   JS games → phaser, babylonjs, or (three + index.html) → engine: 'custom'
 *
 * Precedence: Unity > Unreal > Godot > Bevy > Love2D > JS (locked by regression test
 * in src/project/adopt.test.ts — "Unity wins precedence when multi-engine signatures coexist").
 *
 * IMPORTANT: this detector ONLY uses the SignalContext API — no direct fs/path imports.
 */
export function detectGame(ctx: SignalContext): GameMatch | null {
  // Unity — Assets/ with at least one .meta file
  if (ctx.dirExists('Assets')) {
    const assetsEntries = ctx.listDir('Assets')
    if (assetsEntries.some(name => name.endsWith('.meta'))) {
      return {
        projectType: 'game',
        confidence: 'high',
        partialConfig: { engine: 'unity' },
        evidence: [evidence('unity-assets-meta', 'Assets/')],
      }
    }
  }

  // Unreal — any *.uproject at root
  const uproject = ctx.rootEntries().find(f => f.endsWith('.uproject'))
  if (uproject) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'unreal' },
      evidence: [evidence('unreal-uproject', uproject)],
    }
  }

  // Godot — project.godot at root
  if (ctx.hasFile('project.godot')) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'godot' },
      evidence: [evidence('godot-project', 'project.godot')],
    }
  }

  // Bevy — Rust game engine
  if (ctx.hasDep('bevy', 'cargo')) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'custom' },
      evidence: [evidence('bevy-dep', 'Cargo.toml')],
    }
  }

  // Love2D — Lua game engine. conf.lua + main.lua at root is the canonical signature.
  if (ctx.hasFile('conf.lua') && ctx.hasFile('main.lua')) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'custom' },
      evidence: [evidence('love2d-conf', 'conf.lua')],
    }
  }

  // JavaScript game engines — Phaser / Babylon / Three.js with an HTML entry
  const hasJsGameDep =
    ctx.hasDep('phaser', 'npm')
    || ctx.hasDep('babylonjs', 'npm')
    || ctx.hasDep('@babylonjs/core', 'npm')
    || (ctx.hasDep('three', 'npm') && ctx.hasFile('index.html'))
  if (hasJsGameDep) {
    return {
      projectType: 'game',
      confidence: 'high',
      partialConfig: { engine: 'custom' },
      evidence: [
        evidence('js-game-dep', 'package.json',
          'phaser/babylonjs/three with HTML entry suggests browser game'),
      ],
    }
  }

  return null
}
