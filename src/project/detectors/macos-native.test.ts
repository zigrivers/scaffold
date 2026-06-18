import { describe, it, expect } from 'vitest'
import { createFakeSignalContext } from './context.js'
import { detectMacosNative } from './macos-native.js'

describe('detectMacosNative', () => {
  it('high confidence: AppKit import + entitlements', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Glyver.xcodeproj', 'Glyver.entitlements', 'main.swift'],
      files: {
        'Glyver.entitlements': '<plist/>',
        'main.swift': 'import AppKit\nimport SwiftUI\n@main struct App {}',
      },
    })
    const m = detectMacosNative(ctx)
    expect(m?.projectType).toBe('macos-native')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.uiFramework).toBe('hybrid')
    expect(m?.partialConfig.sandboxed).toBe(true)
  })

  it('high confidence: Package.swift with .macOS executable', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Package.swift'],
      files: {
        'Package.swift': 'platforms: [.macOS(.v15)],\n.executable(name: "app", targets: ["App"])',
      },
    })
    expect(detectMacosNative(ctx)?.confidence).toBe('high')
  })

  it('returns null for a pure iOS Xcode app (SDKROOT iphoneos)', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['MyApp.xcodeproj'],
      dirs: ['MyApp.xcodeproj'],
      dirListings: { 'MyApp.xcodeproj': ['project.pbxproj'] },
      files: {
        'MyApp.xcodeproj/project.pbxproj': 'SDKROOT = iphoneos;\nIPHONEOS_DEPLOYMENT_TARGET = 17.0;',
      },
    })
    expect(detectMacosNative(ctx)).toBeNull()
  })

  it('returns null for a pure Swift library (.macOS platform, no executable)', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Package.swift'],
      files: { 'Package.swift': 'platforms: [.macOS(.v13), .iOS(.v16)],\n.library(name: "Lib", targets: ["Lib"])' },
    })
    expect(detectMacosNative(ctx)).toBeNull()
  })

  it('low confidence for a multiplatform macOS+iOS target', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Package.swift', 'App.swift'],
      files: {
        'Package.swift': 'platforms: [.macOS(.v15), .iOS(.v17)],\n.executable(name: "app", targets: ["App"])',
        'App.swift': 'import SwiftUI\nimport UIKit\n@main struct A {}',
      },
    })
    const m = detectMacosNative(ctx)
    expect(m?.projectType).toBe('macos-native')
    expect(m?.confidence).toBe('low')
  })

  it('returns null when there are no Apple/Swift signals', () => {
    const ctx = createFakeSignalContext({ rootEntries: ['package.json'], files: { 'package.json': '{}' } })
    expect(detectMacosNative(ctx)).toBeNull()
  })
})
