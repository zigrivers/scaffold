import { describe, it, expect } from 'vitest'
import { loadPipelineContext } from './context.js'

describe('loadPipelineContext', () => {
  it('returns metaPrompts map with pipeline steps', () => {
    const ctx = loadPipelineContext(process.cwd())
    expect(ctx.metaPrompts.size).toBeGreaterThan(50)
    expect(ctx.metaPrompts.has('create-prd')).toBe(true)
  })

  it('returns presets with deep and mvp', () => {
    const ctx = loadPipelineContext(process.cwd())
    expect(ctx.presets.deep).not.toBeNull()
    expect(ctx.presets.mvp).not.toBeNull()
  })

  it('returns methodologyDir as a string', () => {
    const ctx = loadPipelineContext(process.cwd())
    expect(typeof ctx.methodologyDir).toBe('string')
    expect(ctx.methodologyDir).toContain('methodology')
  })

  it('excludes tools by default', () => {
    const ctx = loadPipelineContext(process.cwd())
    expect(ctx.metaPrompts.has('release')).toBe(false)
  })

  it('includes tools when includeTools is true', () => {
    const ctx = loadPipelineContext(process.cwd(), { includeTools: true })
    expect(ctx.metaPrompts.has('release')).toBe(true)
  })

  it('config is null when project has no .scaffold/config.yml', () => {
    const ctx = loadPipelineContext('/tmp/nonexistent-project-dir-' + Date.now())
    expect(ctx.config).toBeNull()
    expect(ctx.configErrors.length).toBeGreaterThan(0)
  })
})
