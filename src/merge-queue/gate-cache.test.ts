// src/merge-queue/gate-cache.test.ts
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  GATE_CACHE_FILE, affectedGateKey, fullGateKey, hashFileOrAbsent,
  lookupGateCache, recordGateCache,
} from './gate-cache.js'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-cache-')) }

const AT = '2026-07-19T12:00:00.000Z'

const baseParts = {
  candidateTree: 'tree-a', baseTree: 'tree-b', command: 'make check-affected',
  quarantineHash: 'quarantine:none', tiaMapHash: 'tia:none',
}

describe('gate cache keys', () => {
  it('affected key is deterministic and covers every selection input', () => {
    expect(affectedGateKey(baseParts)).toBe(affectedGateKey({ ...baseParts }))
    for (const field of Object.keys(baseParts) as (keyof typeof baseParts)[]) {
      expect(affectedGateKey({ ...baseParts, [field]: 'CHANGED' }))
        .not.toBe(affectedGateKey(baseParts))
    }
  })

  it('full key covers tree + command + quarantine and differs from the affected key', () => {
    const parts = { tree: 'tree-a', command: 'make check', quarantineHash: 'quarantine:none' }
    expect(fullGateKey(parts)).toBe(fullGateKey({ ...parts }))
    for (const field of Object.keys(parts) as (keyof typeof parts)[]) {
      expect(fullGateKey({ ...parts, [field]: 'CHANGED' }))
        .not.toBe(fullGateKey(parts))
    }
    expect(fullGateKey(parts)).not.toBe(affectedGateKey(baseParts))
  })

  it('keyOf is collision-resistant across a shifted field boundary', () => {
    // A bare '\n'-join would make these two field splits identical:
    // 'X\nY' + '\0' + 'Z'  vs.  'X' + '\0' + 'Y\nZ'  ==>  'X\nY\nZ' either way.
    expect(affectedGateKey({ ...baseParts, candidateTree: 'X\nY', baseTree: 'Z' }))
      .not.toBe(affectedGateKey({ ...baseParts, candidateTree: 'X', baseTree: 'Y\nZ' }))
  })

  it('hashFileOrAbsent yields a labeled sentinel for missing files and a sha for content', () => {
    const dir = tmp()
    expect(hashFileOrAbsent(path.join(dir, 'nope.txt'), 'quarantine')).toBe('quarantine:none')
    const f = path.join(dir, 'q.txt')
    fs.writeFileSync(f, 'flaky.test.ts\n')
    const h = hashFileOrAbsent(f, 'quarantine')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    fs.writeFileSync(f, 'other.test.ts\n')
    expect(hashFileOrAbsent(f, 'quarantine')).not.toBe(h)
  })
})

describe('lookupGateCache / recordGateCache', () => {
  it('records and looks up a green entry', () => {
    const mqDir = tmp()
    expect(lookupGateCache(mqDir, 'k1')).toBeNull()
    recordGateCache(mqDir, { key: 'k1', seconds: 90, at: AT }, 200)
    expect(lookupGateCache(mqDir, 'k1')).toEqual({ key: 'k1', seconds: 90, at: AT })
  })

  it('caps the cache and prunes the oldest entries', () => {
    const mqDir = tmp()
    for (let i = 0; i < 5; i++) {
      recordGateCache(mqDir, { key: `k${i}`, seconds: i, at: AT }, 3)
    }
    expect(lookupGateCache(mqDir, 'k0')).toBeNull()
    expect(lookupGateCache(mqDir, 'k1')).toBeNull()
    expect(lookupGateCache(mqDir, 'k4')).not.toBeNull()
    const raw = JSON.parse(
      fs.readFileSync(path.join(mqDir, GATE_CACHE_FILE), 'utf8'),
    ) as { entries: unknown[] }
    expect(raw.entries).toHaveLength(3)
  })

  it('re-recording a key replaces it instead of duplicating', () => {
    const mqDir = tmp()
    recordGateCache(mqDir, { key: 'k1', seconds: 1, at: AT }, 200)
    recordGateCache(mqDir, { key: 'k1', seconds: 2, at: AT }, 200)
    const raw = JSON.parse(
      fs.readFileSync(path.join(mqDir, GATE_CACHE_FILE), 'utf8'),
    ) as { entries: unknown[] }
    expect(raw.entries).toHaveLength(1)
    expect(lookupGateCache(mqDir, 'k1')?.seconds).toBe(2)
  })

  it('maxEntries 0 disables recording entirely', () => {
    const mqDir = tmp()
    recordGateCache(mqDir, { key: 'k1', seconds: 1, at: AT }, 0)
    expect(fs.existsSync(path.join(mqDir, GATE_CACHE_FILE))).toBe(false)
  })

  it('a corrupt cache file reads as empty and is repaired on the next record', () => {
    const mqDir = tmp()
    fs.writeFileSync(path.join(mqDir, GATE_CACHE_FILE), '{corrupt')
    expect(lookupGateCache(mqDir, 'k1')).toBeNull()
    recordGateCache(mqDir, { key: 'k1', seconds: 5, at: AT }, 200)
    expect(lookupGateCache(mqDir, 'k1')?.seconds).toBe(5)
  })
})
