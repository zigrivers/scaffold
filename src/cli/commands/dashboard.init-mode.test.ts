import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveSkeletonInitMode } from './dashboard.js'

describe('resolveSkeletonInitMode (D11 R1)', () => {
  it('mirrors the root state init-mode', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-im-'))
    fs.mkdirSync(path.join(dir, '.scaffold'))
    fs.writeFileSync(path.join(dir, '.scaffold', 'state.json'), JSON.stringify({
      'schema-version': 1, 'scaffold-version': '3.0.0',
      init_methodology: 'brownfield', config_methodology: 'brownfield',
      'init-mode': 'brownfield', created: '2026-01-01T00:00:00.000Z',
      in_progress: null, steps: {}, next_eligible: [], 'extra-steps': [],
    }))
    expect(resolveSkeletonInitMode(dir, null)).toBe('brownfield')
  })

  it('falls back to greenfield when no root state exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-im-'))
    expect(resolveSkeletonInitMode(dir, null)).toBe('greenfield')
  })
})
