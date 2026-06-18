import { describe, it, expect } from 'vitest'
import { ProjectSchema } from '../schema.js'

function check(macosNativeConfig: Record<string, unknown>) {
  return ProjectSchema.safeParse({ projectType: 'macos-native', macosNativeConfig })
}

describe('macos-native coupling validator', () => {
  it('accepts a valid developer-id config', () => {
    expect(check({ distribution: 'developer-id', sandboxed: false, autoUpdate: 'sparkle' }).success).toBe(true)
  })

  it('requires sandboxed:true for mac-app-store', () => {
    const r = check({ distribution: 'mac-app-store', sandboxed: false, autoUpdate: 'none' })
    expect(r.success).toBe(false)
  })

  it('forbids sparkle in a mac-app-store build', () => {
    const r = check({ distribution: 'mac-app-store', sandboxed: true, autoUpdate: 'sparkle' })
    expect(r.success).toBe(false)
  })

  it('allows sparkle when distribution is both', () => {
    const r = check({ distribution: 'both', sandboxed: true, autoUpdate: 'sparkle' })
    expect(r.success).toBe(true)
  })

  it('requires macOS 14+ for swiftdata', () => {
    expect(check({ persistence: 'swiftdata', minMacosVersion: '13.0' }).success).toBe(false)
    expect(check({ persistence: 'swiftdata', minMacosVersion: '14.0' }).success).toBe(true)
  })

  it('rejects macosNativeConfig on a non-macos-native project', () => {
    const r = ProjectSchema.safeParse({ projectType: 'web-app', macosNativeConfig: {} })
    expect(r.success).toBe(false)
  })
})
