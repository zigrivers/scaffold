import type { WebAppCopy } from './types.js'

export const webAppCopy: WebAppCopy = {
  renderingStrategy: {
    short: 'How the HTML is produced and delivered to the browser.',
    long: 'SPA renders everything client-side; SSR renders on each request; '
      + 'SSG pre-builds at deploy time; Hybrid mixes strategies per route.',
    options: {
      spa:    { label: 'SPA',    short: 'Single-page app — all rendering happens in the browser.' },
      ssr:    { label: 'SSR',    short: 'Server-side rendered on every request for dynamic content.' },
      ssg:    { label: 'SSG',    short: 'Static site generation — pages pre-built at deploy time.' },
      hybrid: { label: 'Hybrid', short: 'Mix of SSR and SSG, chosen per route.' },
    },
  },
  deployTarget: {
    short: 'Where the built app will be hosted.',
    long: 'Determines infrastructure assumptions like compute availability, cold starts, and scaling model.',
    options: {
      static:       { label: 'Static hosting',  short: 'CDN-served files with no server compute.' },
      serverless: {
        label: 'Serverless',
        short: 'Functions that spin up per request (e.g. AWS Lambda, Vercel).',
      },
      container:    { label: 'Container',        short: 'Docker container running in a managed cluster.' },
      edge:         { label: 'Edge',             short: 'Code runs at CDN edge locations for low latency.' },
      'long-running': { label: 'Long-running',   short: 'Traditional always-on server process.' },
    },
  },
  realtime: {
    short: 'Whether the app needs a persistent connection for live updates.',
    options: {
      none:      { label: 'None',      short: 'Standard request/response — no live updates.' },
      websocket: { label: 'WebSocket', short: 'Full-duplex persistent connection for bidirectional data.' },
      sse:       { label: 'SSE',       short: 'Server-sent events — server pushes updates to client.' },
    },
  },
  authFlow: {
    short: 'How users prove their identity.',
    long: 'Choosing "none" means the app has no login. Other options add auth scaffolding.',
    options: {
      none:    { label: 'None',    short: 'No authentication — the app is fully public.' },
      session: { label: 'Session', short: 'Server-managed sessions with cookies.' },
      oauth:   { label: 'OAuth',   short: 'Delegated login via a third-party provider.' },
      passkey: { label: 'Passkey', short: 'WebAuthn / FIDO2 passwordless login.' },
    },
  },
}
