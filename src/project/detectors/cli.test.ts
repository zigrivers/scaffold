import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectCli } from './cli.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/cli')

describe('detectCli', () => {
  it('Node bin + commander + inquirer → high, hybrid', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'node-bin'))
    const m = detectCli(ctx)
    expect(m?.projectType).toBe('cli')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.interactivity).toBe('hybrid')
    expect(m?.partialConfig.distributionChannels).toContain('package-manager')
  })

  it('Rust [[bin]] + clap → args-only', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'rust-clap'))
    const m = detectCli(ctx)
    expect(m?.partialConfig.interactivity).toBe('args-only')
  })

  it('Python pyproject.scripts + typer → args-only', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'python-typer'))
    const m = detectCli(ctx)
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.interactivity).toBe('args-only')
  })

  it('Go cmd/*/main.go + cobra → args-only, standalone-binary', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'go-cobra'))
    const m = detectCli(ctx)
    expect(m?.partialConfig.interactivity).toBe('args-only')
    expect(m?.partialConfig.distributionChannels).toContain('standalone-binary')
  })

  it('CLI framework dep without bin → medium', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'wip', dependencies: { yargs: '17' } },
    })
    const m = detectCli(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('Inquirer dep alone → interactive', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'wip', bin: { wip: 'cli.js' }, dependencies: { '@inquirer/prompts': '7' } },
    })
    const m = detectCli(ctx)
    expect(m?.partialConfig.interactivity).toBe('interactive')
  })

  it('No bin, no framework → null', () => {
    const ctx = createFakeSignalContext({ packageJson: { name: 'demo' } })
    expect(detectCli(ctx)).toBeNull()
  })

  it('Go cmd/ without CLI framework → null (avoids backend false positive)', () => {
    const ctx = createFakeSignalContext({
      dirs: ['cmd'],
      goMod: { module: 'example.com/svc', requires: [
        { path: 'github.com/gin-gonic/gin', version: 'v1.9.0', indirect: false },
      ] },
    })
    expect(detectCli(ctx)).toBeNull()
  })

  it('hasStructuredOutput true when ink dep present', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'tui', bin: { tui: 'cli.js' }, dependencies: { ink: '5' } },
    })
    const m = detectCli(ctx)
    expect(m?.partialConfig.hasStructuredOutput).toBe(true)
  })
})
