// src/types/config.test.ts
import { describe, it, expect } from 'vitest'
import type { ProjectConfig, GameConfig, ProjectType } from './config.js'

describe('GameConfig type', () => {
  it('accepts a valid game config', () => {
    const config: GameConfig = {
      engine: 'unity',
      multiplayerMode: 'none',
      narrative: 'none',
      contentStructure: 'discrete',
      economy: 'none',
      onlineServices: [],
      persistence: 'progression',
      targetPlatforms: ['pc'],
      supportedLocales: ['en'],
      hasModding: false,
      npcAiComplexity: 'none',
    }
    expect(config.engine).toBe('unity')
  })

  it('accepts a project without projectType (backwards compatible)', () => {
    const project: ProjectConfig = { name: 'my-web-app' }
    expect(project.projectType).toBeUndefined()
  })
})
