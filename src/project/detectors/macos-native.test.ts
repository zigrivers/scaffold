import { describe, it, expect } from 'vitest'
import { createFakeSignalContext } from './context.js'
import { detectMacosNative } from './macos-native.js'

describe('detectMacosNative', () => {
  it('high confidence: AppKit import + entitlements with app-sandbox key → sandboxed:true', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Glyver.xcodeproj', 'Glyver.entitlements', 'main.swift'],
      files: {
        'Glyver.entitlements': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
</dict>
</plist>`,
        'main.swift': 'import AppKit\nimport SwiftUI\n@main struct App {}',
      },
    })
    const m = detectMacosNative(ctx)
    expect(m?.projectType).toBe('macos-native')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.uiFramework).toBe('hybrid')
    expect(m?.partialConfig.sandboxed).toBe(true)
  })

  it('app-sandbox key set to <false/> with another entitlement <true/> → sandboxed NOT set', () => {
    // Regression: the old check matched app-sandbox key presence AND any <true/>
    // anywhere in the file. An explicit app-sandbox=false with another entitlement
    // (e.g. allow-jit) set to true must NOT set sandboxed:true.
    const ctx = createFakeSignalContext({
      rootEntries: ['Glyver.xcodeproj', 'Glyver.entitlements', 'main.swift'],
      files: {
        'Glyver.entitlements': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <false/>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
</dict>
</plist>`,
        'main.swift': 'import AppKit\n@main struct App {}',
      },
    })
    const m = detectMacosNative(ctx)
    expect(m?.projectType).toBe('macos-native')
    expect(m?.partialConfig.sandboxed).toBeUndefined()
  })

  it('entitlements without app-sandbox key → sandboxed NOT set (hardened-runtime only)', () => {
    // A non-sandboxed Developer ID app may carry .entitlements for
    // hardened-runtime exceptions (e.g. allow-jit, disable-library-validation).
    // Presence of the file alone must NOT set sandboxed:true.
    const ctx = createFakeSignalContext({
      rootEntries: ['Glyver.xcodeproj', 'Glyver.entitlements', 'main.swift'],
      files: {
        'Glyver.entitlements': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.disable-library-validation</key>
  <true/>
</dict>
</plist>`,
        'main.swift': 'import AppKit\nimport SwiftUI\n@main struct App {}',
      },
    })
    const m = detectMacosNative(ctx)
    expect(m?.projectType).toBe('macos-native')
    expect(m?.confidence).toBe('high')
    // sandboxed must be absent (undefined), not true
    expect(m?.partialConfig.sandboxed).toBeUndefined()
  })

  it('high confidence: Package.swift with .macOS executable + SwiftUI import', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Package.swift', 'App.swift'],
      files: {
        'Package.swift': 'platforms: [.macOS(.v15)],\n.executable(name: "app", targets: ["App"])',
        'App.swift': 'import SwiftUI\n@main struct MyApp: App { var body: some Scene { WindowGroup { } } }',
      },
    })
    expect(detectMacosNative(ctx)?.confidence).toBe('high')
  })

  it('returns null for a Foundation-only Swift CLI (Package.swift .macOS executable, no SwiftUI/AppKit)', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['Package.swift', 'main.swift'],
      files: {
        'Package.swift': 'platforms: [.macOS(.v13)],\n.executable(name: "cli", targets: ["CLI"])',
        'main.swift': 'import Foundation\n\nprint("hello")',
      },
    })
    expect(detectMacosNative(ctx)).toBeNull()
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

  it('low confidence for multiplatform .macOS+.iOS executable without UIKit import (regression)', () => {
    // This case would incorrectly score "high" before the fix because
    // (pkgIos && !pkgMacos) suppressed the iOS signal when both platforms are declared.
    const ctx = createFakeSignalContext({
      rootEntries: ['Package.swift', 'App.swift'],
      files: {
        'Package.swift': 'platforms: [.macOS(.v15), .iOS(.v17)],\n.executable(name: "app", targets: ["App"])',
        'App.swift': 'import SwiftUI\n@main struct App: App { var body: some Scene { WindowGroup { } } }',
      },
    })
    const m = detectMacosNative(ctx)
    expect(m?.projectType).toBe('macos-native')
    expect(m?.confidence).toBe('low')
  })

  it('returns null for iOS project with .entitlements: entitlements must not fire macOS-positive signal', () => {
    // Regression: entitlements alone was treated as macOS-positive even on iOS projects.
    // An iphoneos SDKROOT + entitlements file must not match macos-native.
    const ctx = createFakeSignalContext({
      rootEntries: ['MyApp.xcodeproj', 'MyApp.entitlements'],
      dirs: ['MyApp.xcodeproj'],
      dirListings: { 'MyApp.xcodeproj': ['project.pbxproj'] },
      files: {
        'MyApp.entitlements': '<plist/>',
        'MyApp.xcodeproj/project.pbxproj': 'SDKROOT = iphoneos;\nIPHONEOS_DEPLOYMENT_TARGET = 17.0;',
      },
    })
    expect(detectMacosNative(ctx)).toBeNull()
  })

  it('returns null for a repo containing ONLY a .entitlements file (no AppKit/SwiftUI/SDKROOT/Package signals)', () => {
    // A lone .entitlements file must never classify as macos-native — it appears in
    // helper tools, CI scripts, and iOS repos alike.
    const ctx = createFakeSignalContext({
      rootEntries: ['MyHelper.entitlements'],
      files: { 'MyHelper.entitlements': '<plist/>' },
    })
    expect(detectMacosNative(ctx)).toBeNull()
  })

  it('returns null when there are no Apple/Swift signals', () => {
    const ctx = createFakeSignalContext({ rootEntries: ['package.json'], files: { 'package.json': '{}' } })
    expect(detectMacosNative(ctx)).toBeNull()
  })
})
