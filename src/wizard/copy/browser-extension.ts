import type { BrowserExtensionCopy } from './types.js'

export const browserExtensionCopy: BrowserExtensionCopy = {
  manifestVersion: {
    short: 'Which Chrome extension manifest version to target.',
    long: 'Manifest V3 is required for new Chrome Web Store submissions. V2 is legacy and only relevant for existing extensions.',
    options: {
      '2': { label: 'Manifest V2', short: 'Legacy format — still supported in some browsers but deprecated in Chrome.' },
      '3': { label: 'Manifest V3', short: 'Current standard — required for new Chrome Web Store listings.' },
    },
  },
  uiSurfaces: {
    short: 'Where the extension shows its UI.',
    long: 'You can select multiple surfaces. Each one adds a dedicated entry point and HTML page.',
    options: {
      popup:     { label: 'Popup',      short: 'Small panel that opens when clicking the toolbar icon.' },
      options:   { label: 'Options',    short: 'Full settings page accessible from the extension menu.' },
      newtab:    { label: 'New Tab',    short: 'Replaces the browser\'s new-tab page with a custom one.' },
      devtools:  { label: 'DevTools',   short: 'Adds a panel to Chrome DevTools for developer workflows.' },
      sidepanel: { label: 'Side Panel', short: 'Persistent panel docked to the side of the browser window.' },
    },
  },
  hasContentScript: {
    short: 'Inject scripts into web pages to read or modify their content.',
  },
  hasBackgroundWorker: {
    short: 'Run a service worker in the background for events, alarms, and cross-tab coordination.',
  },
}
