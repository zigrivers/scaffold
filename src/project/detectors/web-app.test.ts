import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectWebApp } from './web-app.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/web-app')

describe('detectWebApp', () => {
  it('Next.js standalone → ssr + realtime websocket', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'nextjs-standalone'))
    const match = detectWebApp(ctx)
    expect(match).toBeTruthy()
    expect(match?.projectType).toBe('web-app')
    expect(match?.partialConfig.renderingStrategy).toBe('ssr')
    expect(match?.partialConfig.realtime).toBe('websocket')
    expect(match?.confidence).toBe('high')
  })

  it('Vite + index.html → spa', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'vite-spa'))
    const match = detectWebApp(ctx)
    expect(match).toBeTruthy()
    expect(match?.partialConfig.renderingStrategy).toBe('spa')
  })

  it('Astro output: server → ssr', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'astro-server'))
    const match = detectWebApp(ctx)
    expect(match).toBeTruthy()
    expect(match?.partialConfig.renderingStrategy).toBe('ssr')
  })

  it('SvelteKit + adapter-vercel → ssr + serverless + session auth', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'sveltekit-vercel'))
    const match = detectWebApp(ctx)
    expect(match).toBeTruthy()
    expect(match?.partialConfig.renderingStrategy).toBe('ssr')
    expect(match?.partialConfig.deployTarget).toBe('serverless')
    expect(match?.partialConfig.authFlow).toBe('session')
  })

  it('Mobile disqualifier: app.json + expo → null', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json', 'app.json'],
      files: {
        'package.json': '{"name":"demo","dependencies":{"expo":"50"}}',
        'app.json': '{}',
      },
      packageJson: { name: 'demo', dependencies: { expo: '50' } },
    })
    expect(detectWebApp(ctx)).toBeNull()
  })

  it('Mobile disqualifier: ios/ + android/ → null', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      files: { 'package.json': '{"name":"demo"}' },
      dirs: ['ios', 'android'],
      packageJson: { name: 'demo' },
    })
    expect(detectWebApp(ctx)).toBeNull()
  })

  it('Monorepo with hoisted expo + root next.config: NOT disqualified', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json', 'next.config.mjs'],
      files: { 'next.config.mjs': 'export default { output: \'standalone\' }' },
      packageJson: { name: 'monorepo', dependencies: { expo: '50', next: '14', react: '18' } },
    })
    expect(detectWebApp(ctx)?.projectType).toBe('web-app')
  })

  it('Next.js app/ + pages/ → hybrid', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json', 'next.config.mjs'],
      files: { 'next.config.mjs': 'export default {}' },
      dirs: ['app', 'pages'],
      packageJson: { name: 'demo', dependencies: { next: '14', react: '18' } },
    })
    const match = detectWebApp(ctx)
    expect(match?.partialConfig.renderingStrategy).toBe('hybrid')
  })

  it('No framework → null', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      files: { 'package.json': '{"name":"demo"}' },
      packageJson: { name: 'demo', dependencies: { lodash: '4' } },
    })
    expect(detectWebApp(ctx)).toBeNull()
  })

  it('Default Next.js (no output directive) → ssr', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json', 'next.config.mjs'],
      files: { 'next.config.mjs': 'export default {}' },
      packageJson: { name: 'demo', dependencies: { next: '14', react: '18' } },
    })
    const match = detectWebApp(ctx)
    expect(match?.partialConfig.renderingStrategy).toBe('ssr')
  })
})
