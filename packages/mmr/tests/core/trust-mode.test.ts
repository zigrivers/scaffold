import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { classifyTrustMode } from '../../src/core/trust-mode.js'

describe('classifyTrustMode', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-trust-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('returns non-git when no .git directory exists', () => {
    const result = classifyTrustMode({ cwd: tmpDir, args: { diff: '-' } })
    expect(result.trust_mode).toBe('non-git')
    expect(result.base_ref).toBeUndefined()
  })

  it('returns base-ref with --base set in a real Git repo', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({ cwd: tmpDir, args: { base: 'main' } })
    expect(result.trust_mode).toBe('base-ref')
    expect(result.base_ref).toBe('main')
  })

  it('returns base-ref with --staged in a real Git repo (HEAD is the trusted ref)', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({ cwd: tmpDir, args: { staged: true } })
    expect(result.trust_mode).toBe('base-ref')
    expect(result.base_ref).toBe('HEAD')
  })

  it('returns base-ref with --pr <num> resolving to a real baseRefName', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({
      cwd: tmpDir,
      args: { pr: 123 },
      resolvePrBase: () => 'main',
    })
    expect(result.trust_mode).toBe('base-ref')
    expect(result.base_ref).toBe('main')
  })

  it('returns untrusted-head when --diff is used in a Git repo with no --base', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({ cwd: tmpDir, args: { diff: '-' }, isCI: false })
    expect(result.trust_mode).toBe('untrusted-head')
    expect(result.base_ref).toBeUndefined()
  })

  it('defaults to base-ref:HEAD for a no-flag review in a Git repo when NOT in CI', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({ cwd: tmpDir, args: {}, isCI: false })
    expect(result.trust_mode).toBe('base-ref')
    expect(result.base_ref).toBe('HEAD')
  })

  it('fails closed to untrusted-head for a no-flag review in CI (PR checkout may be untrusted)', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({ cwd: tmpDir, args: {}, isCI: true })
    expect(result.trust_mode).toBe('untrusted-head')
  })

  it('lets --pr win over a stray --base (trusts the resolved PR base, not the supplied ref)', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({
      cwd: tmpDir,
      args: { pr: 123, base: 'attacker-controlled' },
      resolvePrBase: () => 'main',
    })
    expect(result.trust_mode).toBe('base-ref')
    expect(result.base_ref).toBe('main')
  })

  it('fails closed when a base ref contains unsafe characters', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({ cwd: tmpDir, args: { base: 'evil:../../etc' } })
    expect(result.trust_mode).toBe('untrusted-head')
  })

  it('returns untrusted-head when --pr resolution fails', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({
      cwd: tmpDir,
      args: { pr: 9999 },
      resolvePrBase: () => undefined,
    })
    expect(result.trust_mode).toBe('untrusted-head')
  })

  it('honors --config-base-ref override in untrusted-head mode', () => {
    fs.mkdirSync(path.join(tmpDir, '.git'))
    const result = classifyTrustMode({
      cwd: tmpDir,
      args: { diff: '-', 'config-base-ref': 'origin/main' },
    })
    expect(result.trust_mode).toBe('base-ref')
    expect(result.base_ref).toBe('origin/main')
  })
})
