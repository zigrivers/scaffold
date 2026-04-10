import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { createSignalContext, createFakeSignalContext, type PackageJson } from './context.js'
import { detectLibrary } from './library.js'

const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/library')

describe('detectLibrary', () => {
  it('detects npm ESM library with types', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'esm-types'))
    const m = detectLibrary(ctx)
    expect(m?.projectType).toBe('library')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.visibility).toBe('public')
    expect(m?.partialConfig.hasTypeDefinitions).toBe(true)
  })

  it('detects Rust [lib] crate', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'rust-lib'))
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.visibility).toBe('public')
  })

  it('detects Python Poetry library', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'python-poetry'))
    expect(detectLibrary(ctx)?.confidence).toBe('high')
  })

  it('Storybook → documentationLevel api-docs (NOT full-site)', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'storybook-lib'))
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.documentationLevel).toBe('api-docs')
  })

  it('private package → visibility internal', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'internal', main: 'index.js', private: true } as PackageJson,
    })
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.visibility).toBe('internal')
  })

  it('NEVER sets documentationLevel: none — omits when no positive evidence', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'lib', main: 'index.js' },
    })
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.documentationLevel).toBeUndefined()
  })

  it('public library without README → emits ADOPT_PUBLIC_LIBRARY_NO_README warning', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['package.json'],
      packageJson: { name: 'lib', main: 'index.js' },
    })
    const m = detectLibrary(ctx)
    expect(m?.partialConfig.visibility).toBe('public')
    // Detector pushes warning into ctx.warnings
    expect(ctx.warnings.some(w => w.code === 'ADOPT_PUBLIC_LIBRARY_NO_README')).toBe(true)
  })

  it('package with main AND bin → medium tier (dual-purpose library + CLI per Section 5.4)', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'demo', main: 'index.js', bin: { demo: 'cli.js' } },
    })
    const m = detectLibrary(ctx)
    expect(m?.projectType).toBe('library')
    expect(m?.confidence).toBe('medium')
    // Intentional: the package exports both a library AND a CLI.
    // detectCli will also fire high; disambiguate prompts the user.
  })
})
