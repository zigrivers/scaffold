import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { loadOverlay } from './preset-loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures/methodology')

describe('loadOverlay', () => {
  it('loads game-overlay.yml with correct name and projectType', () => {
    const { overlay, errors } = loadOverlay(
      path.join(fixtureDir, 'game-overlay.yml'),
    )
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.name).toBe('game')
    expect(overlay!.description).toBe('Game development overlay for testing')
    expect(overlay!.projectType).toBe('game')
  })

  it('parses step-overrides correctly', () => {
    const { overlay, errors } = loadOverlay(
      path.join(fixtureDir, 'game-overlay.yml'),
    )
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.stepOverrides['game-design-document']).toEqual({ enabled: true })
    expect(overlay!.stepOverrides['review-gdd']).toEqual({ enabled: true })
    expect(overlay!.stepOverrides['design-system']).toEqual({ enabled: false })
  })

  it('parses knowledge-overrides (append arrays)', () => {
    const { overlay, errors } = loadOverlay(
      path.join(fixtureDir, 'game-overlay.yml'),
    )
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.knowledgeOverrides['tech-stack']).toEqual({
      append: ['game-engine-selection'],
    })
    expect(overlay!.knowledgeOverrides['tdd']).toEqual({
      append: ['game-testing-strategy'],
    })
  })

  it('parses reads-overrides (replace maps and append arrays)', () => {
    const { overlay, errors } = loadOverlay(
      path.join(fixtureDir, 'game-overlay.yml'),
    )
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.readsOverrides['story-tests']).toEqual({
      replace: { 'ux-spec': 'game-ui-spec' },
      append: [],
    })
    expect(overlay!.readsOverrides['implementation-plan']).toEqual({
      replace: { 'ux-spec': 'game-ui-spec' },
      append: ['game-design-document'],
    })
  })

  it('parses dependency-overrides (replace maps and append arrays)', () => {
    const { overlay, errors } = loadOverlay(
      path.join(fixtureDir, 'game-overlay.yml'),
    )
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.dependencyOverrides['user-stories']).toEqual({
      replace: {},
      append: ['review-gdd'],
    })
    expect(overlay!.dependencyOverrides['platform-parity-review']).toEqual({
      replace: { 'review-ux': 'review-game-ui' },
      append: [],
    })
  })

  it('returns error for missing file', () => {
    const { overlay, errors } = loadOverlay(
      path.join(fixtureDir, 'nonexistent-overlay.yml'),
    )
    expect(overlay).toBeNull()
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('PRESET_MISSING')
  })

  it('returns empty overrides for minimal overlay (no override sections)', () => {
    const { overlay, errors } = loadOverlay(
      path.join(fixtureDir, 'minimal-overlay.yml'),
    )
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.name).toBe('minimal')
    expect(overlay!.projectType).toBe('game')
    expect(overlay!.stepOverrides).toEqual({})
    expect(overlay!.knowledgeOverrides).toEqual({})
    expect(overlay!.readsOverrides).toEqual({})
    expect(overlay!.dependencyOverrides).toEqual({})
  })

  it('warns on malformed override structure (e.g., knowledge-overrides as array)', () => {
    // Create a temp file with malformed structure
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-test-'))
    const tmpFile = path.join(tmpDir, 'malformed-overlay.yml')
    fs.writeFileSync(tmpFile, [
      'name: malformed',
      'description: Malformed overlay for testing',
      'project-type: game',
      'knowledge-overrides:',
      '  - item1',
      '  - item2',
    ].join('\n'))

    try {
      const { overlay, errors: _errors, warnings } = loadOverlay(tmpFile)
      // Should still load (gracefully degrade) but warn
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0].code).toBe('OVERLAY_MALFORMED_SECTION')
      // Overlay should still be returned with empty knowledgeOverrides
      expect(overlay).not.toBeNull()
      expect(overlay!.knowledgeOverrides).toEqual({})
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})
