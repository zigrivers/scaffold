// src/project/detectors/web3.test.ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectWeb3 } from './web3.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/web3')

describe('detectWeb3', () => {
  it('foundry.toml → medium-tier match', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'foundry-only'))
    const m = detectWeb3(ctx)
    expect(m?.projectType).toBe('web3')
    expect(m?.confidence).toBe('medium')
    expect(m?.partialConfig.scope).toBeUndefined() // detector omits; schema defaults
  })

  it('hardhat.config.ts → medium-tier match', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'hardhat-only'))
    const m = detectWeb3(ctx)
    expect(m?.projectType).toBe('web3')
    expect(m?.confidence).toBe('medium')
  })

  it('hardhat.config.js (commonjs) → medium-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { 'hardhat.config.js': 'module.exports = { solidity: "0.8.20" }\n' },
    })
    const m = detectWeb3(ctx)
    expect(m?.projectType).toBe('web3')
    expect(m?.confidence).toBe('medium')
  })

  it('hardhat.config.cjs → medium-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { 'hardhat.config.cjs': 'module.exports = { solidity: "0.8.20" }\n' },
    })
    expect(detectWeb3(ctx)?.confidence).toBe('medium')
  })

  it('hardhat.config.mjs → medium-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { 'hardhat.config.mjs': 'export default { solidity: "0.8.20" }\n' },
    })
    expect(detectWeb3(ctx)?.confidence).toBe('medium')
  })

  it('remappings.txt alone → low-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { 'remappings.txt': 'forge-std/=lib/forge-std/src/\n' },
    })
    const m = detectWeb3(ctx)
    expect(m?.projectType).toBe('web3')
    expect(m?.confidence).toBe('low')
  })

  it('lib/forge-std directory alone → low-tier match', () => {
    const ctx = createFakeSignalContext({
      dirs: ['lib/forge-std'],
    })
    const m = detectWeb3(ctx)
    expect(m?.projectType).toBe('web3')
    expect(m?.confidence).toBe('low')
  })

  it('medium and low signals together → medium-tier match', () => {
    const ctx = createFakeSignalContext({
      files: { 'foundry.toml': '[profile.default]\n', 'remappings.txt': 'forge-std/=lib/forge-std/src/\n' },
      dirs: ['lib/forge-std'],
    })
    const m = detectWeb3(ctx)
    expect(m?.confidence).toBe('medium')
    expect(m?.evidence.length).toBeGreaterThanOrEqual(3) // foundry.toml + remappings + lib/forge-std
  })

  it('no web3 signals → null', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'no-match'))
    const m = detectWeb3(ctx)
    expect(m).toBeNull()
  })
})
