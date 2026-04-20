import { describe, it, expect } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { loadStructuralOverlay } from './overlay-loader.js'

function writeTmpOverlay(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structural-overlay-'))
  const file = path.join(dir, 'test-overlay.yml')
  fs.writeFileSync(file, content, 'utf8')
  return file
}

describe('loadStructuralOverlay', () => {
  it('loads a valid structural overlay without project-type', () => {
    const file = writeTmpOverlay(`
name: multi-service
description: Cross-service pipeline steps

step-overrides:
  service-ownership-map: { enabled: true }

knowledge-overrides:
  system-architecture:
    append: [multi-service-architecture]
`)
    const { overlay, errors } = loadStructuralOverlay(file)

    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.name).toBe('multi-service')
    expect(overlay!.projectType).toBeUndefined()
    expect(overlay!.stepOverrides['service-ownership-map']).toEqual({ enabled: true })
    expect(overlay!.knowledgeOverrides['system-architecture']).toEqual({
      append: ['multi-service-architecture'],
    })
  })

  it('errors on missing name field', () => {
    const file = writeTmpOverlay(`
description: No name here

step-overrides:
  foo: { enabled: true }
`)
    const { overlay, errors } = loadStructuralOverlay(file)

    expect(overlay).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toMatch(/name/)
  })

  it('errors on missing description field', () => {
    const file = writeTmpOverlay(`
name: test-overlay

step-overrides:
  foo: { enabled: true }
`)
    const { overlay, errors } = loadStructuralOverlay(file)

    expect(overlay).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toMatch(/description/)
  })

  it('errors on non-existent file', () => {
    const { overlay, errors } = loadStructuralOverlay('/nonexistent/overlay.yml')

    expect(overlay).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
  })

  it('parses reads-overrides and dependency-overrides', () => {
    const file = writeTmpOverlay(`
name: test
description: Test overlay

reads-overrides:
  implementation-plan:
    append: [service-ownership-map]

dependency-overrides:
  review-security:
    append: [cross-service-auth]
`)
    const { overlay, errors } = loadStructuralOverlay(file)

    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.readsOverrides['implementation-plan']).toEqual({
      replace: {}, append: ['service-ownership-map'],
    })
    expect(overlay!.dependencyOverrides['review-security']).toEqual({
      replace: {}, append: ['cross-service-auth'],
    })
  })

  it('warns on malformed step-overrides entries', () => {
    const file = writeTmpOverlay(`
name: test
description: Test overlay

step-overrides:
  bad-step: "not-an-object"
`)
    const { overlay, warnings } = loadStructuralOverlay(file)

    expect(overlay).not.toBeNull()
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('ignores project-type field if accidentally present', () => {
    const file = writeTmpOverlay(`
name: test
description: Test overlay
project-type: backend

step-overrides:
  foo: { enabled: true }
`)
    const { overlay, errors } = loadStructuralOverlay(file)

    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBeUndefined()
  })
})

describe('loadStructuralOverlay cross-reads-overrides (Wave 3c follow-on)', () => {
  it('parses cross-reads-overrides into crossReadsOverrides', () => {
    const tmpPath = path.join(os.tmpdir(), `struct-overlay-${Date.now()}.yml`)
    fs.writeFileSync(tmpPath, `
name: multi-service
description: test
cross-reads-overrides:
  system-architecture:
    append:
      - service: billing
        step: api-contracts
      - service: inventory
        step: domain-modeling
`)
    try {
      const { overlay, errors } = loadStructuralOverlay(tmpPath)
      expect(errors).toEqual([])
      expect(overlay).not.toBeNull()
      expect(overlay!.crossReadsOverrides['system-architecture'].append).toEqual([
        { service: 'billing', step: 'api-contracts' },
        { service: 'inventory', step: 'domain-modeling' },
      ])
    } finally {
      fs.rmSync(tmpPath, { force: true })
    }
  })

  it('returns empty crossReadsOverrides when section absent', () => {
    const tmpPath = path.join(os.tmpdir(), `struct-overlay-${Date.now()}.yml`)
    fs.writeFileSync(tmpPath, `
name: multi-service
description: test
`)
    try {
      const { overlay } = loadStructuralOverlay(tmpPath)
      expect(overlay!.crossReadsOverrides).toEqual({})
    } finally {
      fs.rmSync(tmpPath, { force: true })
    }
  })

  it('emits OVERLAY_MALFORMED_SECTION when cross-reads-overrides is wrong shape (array)', () => {
    const tmpPath = path.join(os.tmpdir(), `struct-overlay-${Date.now()}.yml`)
    fs.writeFileSync(tmpPath, `
name: multi-service
description: test
cross-reads-overrides: []
`)
    try {
      const { overlay, warnings } = loadStructuralOverlay(tmpPath)
      expect(overlay!.crossReadsOverrides).toEqual({})
      expect(warnings.some(w =>
        w.code === 'OVERLAY_MALFORMED_SECTION'
        && String(w.context?.section) === 'cross-reads-overrides',
      )).toBe(true)
    } finally {
      fs.rmSync(tmpPath, { force: true })
    }
  })
})
