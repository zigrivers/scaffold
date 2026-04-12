import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { loadOverlay, loadSubOverlay } from './overlay-loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures/methodology')
const methodologyDir = path.resolve(__dirname, '../../../content/methodology')

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
    expect(errors[0].code).toBe('OVERLAY_MISSING')
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

describe('web-app overlay', () => {
  it('loads web-app-overlay.yml successfully', () => {
    const overlayPath = path.join(methodologyDir, 'web-app-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('web-app')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(20)
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
  })
})

describe('backend overlay', () => {
  it('loads backend-overlay.yml successfully', () => {
    const overlayPath = path.join(methodologyDir, 'backend-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('backend')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(15)
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
  })
})

describe('cli overlay', () => {
  it('loads cli-overlay.yml successfully', () => {
    const overlayPath = path.join(methodologyDir, 'cli-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('cli')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(15)
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
  })
})

describe('library overlay', () => {
  it('loads library-overlay.yml successfully', () => {
    const overlayPath = path.join(methodologyDir, 'library-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('library')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(15)
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
  })
})

describe('mobile-app overlay', () => {
  it('loads mobile-app-overlay.yml successfully', () => {
    const overlayPath = path.join(methodologyDir, 'mobile-app-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('mobile-app')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(15)
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
  })
})

describe('data-pipeline overlay', () => {
  it('loads data-pipeline-overlay.yml successfully', () => {
    const overlayPath = path.join(methodologyDir, 'data-pipeline-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('data-pipeline')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(15)
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
  })
})

describe('ml overlay', () => {
  it('loads ml-overlay.yml successfully', () => {
    const overlayPath = path.join(methodologyDir, 'ml-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('ml')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(15)
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
  })
})

describe('browser-extension overlay', () => {
  it('loads browser-extension-overlay.yml successfully', () => {
    const overlayPath = path.join(methodologyDir, 'browser-extension-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('browser-extension')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(15)
    expect(Object.keys(overlay!.stepOverrides)).toHaveLength(0)
  })
})

describe('loadSubOverlay', () => {
  it('loads knowledge-overrides from a valid sub-overlay with no warnings', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-overlay-test-'))
    const tmpFile = path.join(tmpDir, 'knowledge-only.yml')
    fs.writeFileSync(tmpFile, [
      'name: knowledge-only',
      'description: Sub-overlay with knowledge only',
      'project-type: research',
      'knowledge-overrides:',
      '  tech-stack:',
      '    append:',
      '      - quant-finance-stack',
      '      - data-analysis-tools',
    ].join('\n'))

    try {
      const { overlay, errors, warnings } = loadSubOverlay(tmpFile)
      expect(errors).toHaveLength(0)
      expect(warnings).toHaveLength(0)
      expect(overlay).not.toBeNull()
      expect(overlay!.knowledgeOverrides['tech-stack']).toEqual({
        append: ['quant-finance-stack', 'data-analysis-tools'],
      })
      expect(overlay!.stepOverrides).toEqual({})
      expect(overlay!.readsOverrides).toEqual({})
      expect(overlay!.dependencyOverrides).toEqual({})
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })

  it('warns and strips non-knowledge sections from sub-overlay', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-overlay-test-'))
    const tmpFile = path.join(tmpDir, 'mixed-sections.yml')
    fs.writeFileSync(tmpFile, [
      'name: mixed-sections',
      'description: Sub-overlay with step overrides that should be stripped',
      'project-type: research',
      'step-overrides:',
      '  game-design-document:',
      '    enabled: true',
      'knowledge-overrides:',
      '  tech-stack:',
      '    append:',
      '      - quant-finance-stack',
    ].join('\n'))

    try {
      const { overlay, errors, warnings } = loadSubOverlay(tmpFile)
      expect(errors).toHaveLength(0)
      expect(overlay).not.toBeNull()
      // Step overrides should be stripped
      expect(overlay!.stepOverrides).toEqual({})
      // Knowledge overrides should be preserved
      expect(overlay!.knowledgeOverrides['tech-stack']).toEqual({
        append: ['quant-finance-stack'],
      })
      // Warning should be emitted
      expect(warnings).toHaveLength(1)
      expect(warnings[0].code).toBe('SUB_OVERLAY_NON_KNOWLEDGE')
      expect(warnings[0].message).toContain('non-knowledge')
    } finally {
      fs.rmSync(tmpDir, { recursive: true })
    }
  })
})
