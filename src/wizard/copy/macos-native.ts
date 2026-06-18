import type { MacosNativeCopy } from './types.js'

export const macosNativeCopy: MacosNativeCopy = {
  uiFramework: {
    options: {
      'swiftui': { label: 'SwiftUI',      short: 'Declarative UI framework (macOS 10.15+, recommended).' },
      'appkit':  { label: 'AppKit',       short: 'Traditional Cocoa UI framework.' },
      'hybrid':  { label: 'Hybrid',       short: 'SwiftUI with AppKit interop (NSViewRepresentable).' },
    },
  },
  appStyle: {
    options: {
      'standard':  { label: 'Standard app',  short: 'Dock + window-based app.' },
      'menu-bar':  { label: 'Menu-bar app',  short: 'Lives in the macOS menu bar (no Dock icon).' },
      'agent':     { label: 'Agent / daemon', short: 'Background process with no UI (LSUIElement).' },
    },
  },
  minMacosVersion: {},
  distribution: {
    options: {
      'developer-id':   { label: 'Developer ID',     short: 'Notarized & distributed outside the App Store.' },
      'mac-app-store':  { label: 'Mac App Store',    short: 'Distributed via the Mac App Store (sandboxed).' },
      'both':           { label: 'Both',             short: 'Separate builds for MAS and direct download.' },
    },
  },
  sandboxed: {},
  persistence: {
    options: {
      'none':       { label: 'None',       short: 'No persistent storage.' },
      'sqlite':     { label: 'SQLite',     short: 'Embedded relational store via GRDB or SQLite.swift.' },
      'core-data':  { label: 'Core Data',  short: 'Apple\'s ORM-backed persistence framework.' },
      'swiftdata':  { label: 'SwiftData',  short: 'Modern Swift-native persistence (macOS 14+).' },
    },
  },
  autoUpdate: {
    options: {
      'none':    { label: 'None',    short: 'No auto-update mechanism.' },
      'sparkle': { label: 'Sparkle', short: 'De-facto standard updater for non-MAS apps.' },
    },
  },
}
