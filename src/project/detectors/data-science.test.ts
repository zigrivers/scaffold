// src/project/detectors/data-science.test.ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectDataScience } from './data-science.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/data-science')

describe('detectDataScience', () => {
  it('marimo dep → low-tier match', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'marimo-only'))
    const m = detectDataScience(ctx)
    expect(m?.projectType).toBe('data-science')
    expect(m?.confidence).toBe('low')
    expect(m?.partialConfig.audience).toBeUndefined()
  })

  it('dvc.yaml alone → null (DVC without marimo does not imply data-science)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'dvc-managed'))
    const m = detectDataScience(ctx)
    expect(m).toBeNull()
  })

  it('.dvc/config directory alone → null', () => {
    const ctx = createFakeSignalContext({
      files: { '.dvc/config': '[core]\nremote = s3remote\n' },
    })
    const m = detectDataScience(ctx)
    expect(m).toBeNull()
  })

  it('.marimo.toml → low-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { '.marimo.toml': '[display]\ntheme = "dark"\n' },
    })
    const m = detectDataScience(ctx)
    expect(m?.confidence).toBe('low')
  })

  it('dvc as a pyproject dep alone → null', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'x', dependencies: ['dvc'] } },
    })
    const m = detectDataScience(ctx)
    expect(m).toBeNull()
  })

  it('marimo + dvc.yaml → low-tier match with both evidence entries', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'x', dependencies: ['marimo'] } },
      files: { 'dvc.yaml': 'stages: {}\n' },
    })
    const m = detectDataScience(ctx)
    expect(m?.projectType).toBe('data-science')
    expect(m?.confidence).toBe('low')
    const signals = (m?.evidence ?? []).map(e => e.signal)
    expect(signals).toContain('marimo-dep')
    expect(signals).toContain('dvc-yaml')
  })

  it('no DS signals → null (no match)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'no-match'))
    const m = detectDataScience(ctx)
    expect(m).toBeNull()
  })
})
