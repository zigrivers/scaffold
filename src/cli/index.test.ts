import { describe, it, expect } from 'vitest'
import { runCli } from './index.js'

describe('CLI framework', () => {
  it('exports runCli function', () => {
    expect(typeof runCli).toBe('function')
  })
})
