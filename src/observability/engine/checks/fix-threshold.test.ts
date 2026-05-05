import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveFixThreshold } from './fix-threshold'

describe('resolveFixThreshold', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-ft-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns CLI override when given', () => {
    expect(resolveFixThreshold(dir, 'P0')).toBe('P0')
  })

  it('returns audit_fix_threshold when present in .mmr.yaml', () => {
    writeFileSync(join(dir, '.mmr.yaml'), 'fix_threshold: P3\naudit_fix_threshold: P1\n')
    expect(resolveFixThreshold(dir)).toBe('P1')
  })

  it('falls back to fix_threshold when audit_fix_threshold is absent', () => {
    writeFileSync(join(dir, '.mmr.yaml'), 'fix_threshold: P0\n')
    expect(resolveFixThreshold(dir)).toBe('P0')
  })

  it('falls back to default P2 when no .mmr.yaml exists', () => {
    expect(resolveFixThreshold(dir)).toBe('P2')
  })

  it('rejects malformed .mmr.yaml severity values', () => {
    writeFileSync(join(dir, '.mmr.yaml'), 'fix_threshold: lemon\n')
    expect(resolveFixThreshold(dir)).toBe('P2')   // ignore garbage, fall through to default
  })
})
