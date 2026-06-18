import type { MacosNativeCopy } from './types.js'

export const macosNativeCopy: MacosNativeCopy = {
  uiFramework: {
    short: 'The UI framework powering the app.',
    long: 'SwiftUI is the modern default; AppKit gives fine-grained control and virtualization; '
      + 'hybrid mixes SwiftUI chrome with AppKit where performance demands it.',
    options: {
      swiftui: { label: 'SwiftUI',  short: 'Modern declarative UI — the default for new macOS apps.' },
      appkit:  { label: 'AppKit',   short: 'Mature imperative UI — maximum control and virtualization.' },
      hybrid:  { label: 'Hybrid',   short: 'SwiftUI for most UI, AppKit (NSViewRepresentable) where needed.' },
    },
  },
  appStyle: {
    short: 'The kind of macOS app this is.',
    long: 'Standard is a windowed app; menu-bar lives in the status bar (NSStatusItem/MenuBarExtra); '
      + 'agent runs in the background with no Dock icon (LSUIElement).',
    options: {
      standard:   { label: 'Standard window app', short: 'A normal windowed app with a Dock icon.' },
      'menu-bar': { label: 'Menu-bar app',         short: 'Lives in the menu bar (NSStatusItem / MenuBarExtra).' },
      agent:      { label: 'Background agent',      short: 'No Dock icon / UI chrome (LSUIElement).' },
    },
  },
  minMacosVersion: {
    short: 'Minimum supported macOS version (e.g. "15.0"). Drives @available guidance.',
  },
  distribution: {
    short: 'How the app is delivered to users.',
    long: 'Developer ID ships a notarized direct download; Mac App Store requires the App Sandbox; '
      + 'both ships two variants.',
    options: {
      'developer-id':  { label: 'Developer ID (direct download)', short: 'Notarized DMG/pkg outside the App Store.' },
      'mac-app-store': {
        label: 'Mac App Store',
        short: 'Distributed via the App Store (sandbox required).',
      },
      both:            { label: 'Both',                           short: 'Direct download AND Mac App Store builds.' },
    },
  },
  sandboxed: {
    short: 'Enable the App Sandbox (required for the Mac App Store).',
  },
  persistence: {
    short: 'Local data persistence approach.',
    options: {
      none:        { label: 'None',       short: 'No local persistence.' },
      sqlite:      { label: 'SQLite/GRDB', short: 'Direct SQLite (e.g. via GRDB) — full control.' },
      'core-data': { label: 'Core Data',  short: 'Apple\'s object-graph persistence framework.' },
      swiftdata:   { label: 'SwiftData',  short: 'Modern Swift persistence (requires macOS 14+).' },
    },
  },
  autoUpdate: {
    short: 'Auto-update mechanism for direct-download builds.',
    options: {
      none:    { label: 'None',    short: 'No in-app updater (or App Store handles updates).' },
      sparkle: { label: 'Sparkle', short: 'Sparkle appcast auto-updates (Developer-ID builds only).' },
    },
  },
}
