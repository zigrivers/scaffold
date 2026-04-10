import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectBrowserExtension } from './browser-extension.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/browser-extension')

describe('detectBrowserExtension', () => {
  it('MV3 with popup + service_worker → high', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'mv3-popup'))
    const m = detectBrowserExtension(ctx)
    expect(m?.projectType).toBe('browser-extension')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.manifestVersion).toBe('3')
    expect(m?.partialConfig.uiSurfaces).toEqual(['popup'])
    expect(m?.partialConfig.hasBackgroundWorker).toBe(true)
  })

  it('MV2 with content_scripts + background.scripts → high', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'mv2-content'))
    const m = detectBrowserExtension(ctx)
    expect(m?.partialConfig.manifestVersion).toBe('2')
    expect(m?.partialConfig.hasContentScript).toBe(true)
    expect(m?.partialConfig.hasBackgroundWorker).toBe(true)
  })

  it('Minimal theme manifest → returns match with only manifestVersion (Zod defaults fill rest)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'minimal-theme'))
    const m = detectBrowserExtension(ctx)
    expect(m?.partialConfig.manifestVersion).toBe('3')
    expect(m?.partialConfig.hasContentScript).toBeUndefined()    // CRITICAL: omitted
    expect(m?.partialConfig.hasBackgroundWorker).toBeUndefined() // CRITICAL: omitted
    expect(m?.partialConfig.uiSurfaces).toBeUndefined()          // CRITICAL: omitted
    expect(ctx.warnings.some(w => w.code === 'ADOPT_MINIMAL_EXTENSION')).toBe(true)
  })

  it('PWA manifest (no manifest_version) → returns null', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'malformed/manifest-json-no-version'))
    expect(detectBrowserExtension(ctx)).toBeNull()
  })

  it('manifest.json with manifest_version: "3" (STRING not int) → returns null', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['manifest.json'],
      files: { 'manifest.json': '{"manifest_version":"3","name":"x"}' },
    })
    expect(detectBrowserExtension(ctx)).toBeNull()
  })

  it('No manifest.json → returns null', () => {
    const ctx = createFakeSignalContext({})
    expect(detectBrowserExtension(ctx)).toBeNull()
  })

  it('manifest.json with manifest_version: 4 → returns null', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['manifest.json'],
      files: { 'manifest.json': '{"manifest_version":4,"name":"x"}' },
    })
    expect(detectBrowserExtension(ctx)).toBeNull()
  })

  it('Malformed manifest.json → returns null (unparseable JSON)', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['manifest.json'],
      files: { 'manifest.json': '{ invalid json' },
    })
    expect(detectBrowserExtension(ctx)).toBeNull()
  })
})
