import type { LibraryCopy } from './types.js'

export const libraryCopy: LibraryCopy = {
  visibility: {
    short: 'Who can install and use this library.',
    long: 'Public libraries are published to a registry; internal libraries stay within your organization.',
    options: {
      public:   { label: 'Public',   short: 'Published to a public registry (npm, PyPI, etc.).' },
      internal: { label: 'Internal', short: 'Private package shared within your organization.' },
    },
  },
  runtimeTarget: {
    short: 'Where the library code will execute.',
    long: 'Determines which APIs are available and how the code is bundled.',
    options: {
      node:       { label: 'Node.js',     short: 'Runs only in Node.js — can use fs, net, etc.' },
      browser:    { label: 'Browser',     short: 'Runs only in the browser — can use DOM and Web APIs.' },
      isomorphic: { label: 'Isomorphic',  short: 'Works in both Node.js and browsers.' },
      edge:       { label: 'Edge runtime', short: 'Targets edge runtimes (Cloudflare Workers, Deno Deploy).' },
    },
  },
  bundleFormat: {
    short: 'The module format(s) for the published package.',
    long: 'ESM is modern import/export; CJS is require(); dual ships both for maximum compatibility.',
    options: {
      esm:       { label: 'ESM only',   short: 'ES modules — modern import/export syntax.' },
      cjs:       { label: 'CJS only',   short: 'CommonJS — require() for legacy Node.js projects.' },
      dual:      { label: 'Dual (ESM + CJS)', short: 'Ships both formats for maximum compatibility.' },
      unbundled: { label: 'Unbundled',   short: 'Source files published as-is — consumers handle bundling.' },
    },
  },
  hasTypeDefinitions: {
    short: 'Generate and ship TypeScript type declarations (.d.ts).',
  },
  documentationLevel: {
    short: 'How much documentation to generate.',
    long: 'Public libraries should have at least a README; more docs lower the adoption barrier.',
    options: {
      none:       { label: 'None',          short: 'No generated docs — code comments only.' },
      readme:     { label: 'README',        short: 'A single README with usage examples.' },
      'api-docs': { label: 'API reference', short: 'Auto-generated API docs from source comments.' },
      'full-site': { label: 'Documentation site', short: 'Full docs site with guides, examples, and API reference.' },
    },
  },
}
