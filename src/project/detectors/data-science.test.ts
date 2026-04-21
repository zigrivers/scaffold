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

  it('dvc.yaml → low-tier match', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'dvc-managed'))
    const m = detectDataScience(ctx)
    expect(m?.projectType).toBe('data-science')
    expect(m?.confidence).toBe('low')
  })

  it('.dvc/config directory → low-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { '.dvc/config': '[core]\nremote = s3remote\n' },
    })
    const m = detectDataScience(ctx)
    expect(m?.projectType).toBe('data-science')
    expect(m?.confidence).toBe('low')
  })

  it('.marimo.toml → low-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { '.marimo.toml': '[display]\ntheme = "dark"\n' },
    })
    const m = detectDataScience(ctx)
    expect(m?.confidence).toBe('low')
  })

  it('dvc as a pyproject dep → low-tier match', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'x', dependencies: ['dvc'] } },
    })
    const m = detectDataScience(ctx)
    expect(m?.confidence).toBe('low')
  })

  it('no DS signals → null (no match)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'no-match'))
    const m = detectDataScience(ctx)
    expect(m).toBeNull()
  })
})
