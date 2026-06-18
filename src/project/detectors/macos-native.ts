import type { SignalContext } from './context.js'
import type { MacosNativeMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

const SWIFT_SAMPLE_DIRS = ['', 'Sources', 'App', 'src'] as const

/** Sample Swift source text from conventional locations (depth-1 + one nested Sources/<module> level). */
function sampleSwift(ctx: SignalContext, limit = 16): string {
  const texts: string[] = []
  const add = (rel: string) => {
    if (texts.length >= limit || !rel.endsWith('.swift')) return
    const t = ctx.readFileText(rel, 65536)
    if (t) texts.push(t)
  }
  for (const dir of SWIFT_SAMPLE_DIRS) {
    const entries = dir === '' ? ctx.rootEntries() : ctx.listDir(dir)
    for (const name of entries) {
      const rel = dir === '' ? name : `${dir}/${name}`
      if (name.endsWith('.swift')) add(rel)
      else if (dir === 'Sources') for (const inner of ctx.listDir(rel)) add(`${rel}/${inner}`)
    }
  }
  return texts.join('\n')
}

/** Read the first .xcodeproj/.xcworkspace's project.pbxproj text, if any. */
function pbxproj(ctx: SignalContext): string {
  const proj = ctx.rootEntries().find(f => f.endsWith('.xcodeproj'))
  if (!proj) return ''
  return ctx.readFileText(`${proj}/project.pbxproj`, 131072) ?? ''
}

export function detectMacosNative(ctx: SignalContext): MacosNativeMatch | null {
  const swift = sampleSwift(ctx)
  const pkg = ctx.readFileText('Package.swift') ?? ''
  const pbx = pbxproj(ctx)

  const xcodeArtifact = ctx.rootEntries().find(f => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace'))
  const entitlements = ctx.rootEntries().some(f => f.endsWith('.entitlements'))
  const importsAppKit = /\bimport\s+(AppKit|Cocoa)\b/.test(swift)
  const importsSwiftUI = /\bimport\s+SwiftUI\b/.test(swift)
  const importsUIKit = /\bimport\s+UIKit\b/.test(swift)
  const hasMainApp = /@main/.test(swift)
  const pkgMacos = /\.macOS\s*\(/.test(pkg)
  const pkgIos = /\.iOS\s*\(/.test(pkg)
  const pkgExecutable = /\.executable\b/.test(pkg) || /executableTarget\s*\(/.test(pkg)
  const sdkMacos = /SDKROOT\s*=\s*macosx/.test(pbx) || /MACOSX_DEPLOYMENT_TARGET/.test(pbx)
  const sdkIos = /SDKROOT\s*=\s*iphoneos/.test(pbx) || /IPHONEOS_DEPLOYMENT_TARGET/.test(pbx)

  // No Apple/Swift signal at all → not ours.
  if (!importsAppKit && !importsSwiftUI && !importsUIKit && !pkg && !xcodeArtifact && !entitlements) {
    return null
  }

  // Entitlements alone is too broad — iOS projects also have .entitlements files.
  // Only treat entitlements as a macOS-positive signal when no iOS signal is present.
  const entitlementsIsPositive = entitlements && !sdkIos && !importsUIKit && !ctx.dirExists('ios')
  const macosPositive =
    importsAppKit || entitlementsIsPositive || sdkMacos || (pkgMacos && pkgExecutable && importsSwiftUI)
  const iosPositive =
    ctx.dirExists('ios') || importsUIKit || sdkIos || pkgIos
    || ctx.hasDep('expo', 'npm') || ctx.hasDep('react-native', 'npm') || ctx.hasFile('pubspec.yaml')

  // Pure iOS (or RN/Expo/Flutter) → mobile-app owns it.
  if (iosPositive && !macosPositive) return null
  if (!macosPositive) {
    // No positive macOS signal and not clearly iOS — only a SwiftUI @main Xcode app counts (medium).
    if (xcodeArtifact && hasMainApp && importsSwiftUI && !iosPositive) {
      return {
        projectType: 'macos-native', confidence: 'medium',
        partialConfig: inferConfig(swift, pkg, entitlements),
        evidence: [evidence('xcode-swiftui-main-app', xcodeArtifact)],
      }
    }
    return null
  }

  const ev: DetectionEvidence[] = []
  if (importsAppKit) ev.push(evidence('appkit-import'))
  if (entitlementsIsPositive) ev.push(evidence('entitlements-file'))
  if (sdkMacos) ev.push(evidence('pbxproj-macosx-sdk'))
  if (pkgMacos && pkgExecutable && importsSwiftUI) ev.push(evidence('package-swift-macos-executable', 'Package.swift'))

  // Multiplatform macOS+iOS → low confidence; let disambiguation rank it vs mobile-app.
  const confidence: MacosNativeMatch['confidence'] = iosPositive ? 'low' : 'high'
  if (iosPositive) ev.push(evidence('multiplatform-macos-ios'))

  return {
    projectType: 'macos-native', confidence,
    partialConfig: inferConfig(swift, pkg, entitlements),
    evidence: ev,
  }
}

function inferConfig(swift: string, pkg: string, entitlements: boolean): Partial<MacosNativeMatch['partialConfig']> {
  const pc: Partial<MacosNativeMatch['partialConfig']> = {}
  const appkit = /\bimport\s+(AppKit|Cocoa)\b/.test(swift)
  const swiftui = /\bimport\s+SwiftUI\b/.test(swift)
  if (appkit && swiftui) pc.uiFramework = 'hybrid'
  else if (appkit) pc.uiFramework = 'appkit'
  else if (swiftui) pc.uiFramework = 'swiftui'
  if (entitlements) pc.sandboxed = true
  if (/Sparkle/.test(pkg)) pc.autoUpdate = 'sparkle'
  if (/\bimport\s+SwiftData\b/.test(swift)) pc.persistence = 'swiftdata'
  else if (/\bimport\s+CoreData\b/.test(swift)) pc.persistence = 'core-data'
  else if (/\bimport\s+(GRDB|SQLite)\b/.test(swift)) pc.persistence = 'sqlite'
  if (/\bLSUIElement\b/.test(swift)) pc.appStyle = 'agent'
  else if (/\b(NSStatusItem|MenuBarExtra)\b/.test(swift)) pc.appStyle = 'menu-bar'
  return pc
}
