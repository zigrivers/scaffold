import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { AckStore, type AckRecord } from '../../src/core/ack-store.js'

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-baseref-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' })
  return dir
}

const KEY = 'a'.repeat(40)
const RECORD: AckRecord = {
  finding_key: KEY,
  normalized_location: 'src/foo.ts',
  description_shingle: ['unused', 'used '],
  created_at: '2026-05-22T00:00:00Z',
}

describe('AckStore with configBaseRef', () => {
  it('reads project acks from the base ref, ignoring working-tree-added acks', () => {
    const dir = initRepo()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-home-'))
    try {
      // Initial commit with no acks.
      fs.writeFileSync(path.join(dir, 'README.md'), 'hi')
      execFileSync('git', ['add', 'README.md'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' })
      // Working tree adds a project ack — this would self-suppress if trusted.
      const acksDir = path.join(dir, '.mmr', 'acks')
      fs.mkdirSync(acksDir, { recursive: true })
      fs.writeFileSync(path.join(acksDir, `${KEY}.json`), JSON.stringify(RECORD))

      const store = new AckStore({ projectRoot: dir, userRoot: home, configBaseRef: 'HEAD' })
      const hit = store.lookup({ finding_key: KEY, normalized_location: 'src/foo.ts', shingle: ['unused', 'used '] })
      expect(hit).toBeUndefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('finds project acks that were committed at the base ref', () => {
    const dir = initRepo()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-home-'))
    try {
      const acksDir = path.join(dir, '.mmr', 'acks')
      fs.mkdirSync(acksDir, { recursive: true })
      fs.writeFileSync(path.join(acksDir, `${KEY}.json`), JSON.stringify(RECORD))
      execFileSync('git', ['add', '.mmr/acks'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'add ack'], { cwd: dir, stdio: 'ignore' })
      // Remove from working tree — base ref still has it.
      fs.rmSync(path.join(acksDir, `${KEY}.json`))

      const store = new AckStore({ projectRoot: dir, userRoot: home, configBaseRef: 'HEAD' })
      const hit = store.lookup({ finding_key: KEY, normalized_location: 'src/foo.ts', shingle: ['unused', 'used '] })
      expect(hit).toBeDefined()
      expect(hit!.match).toBe('exact')
      expect(hit!.scope).toBe('project')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('skips a base-ref ack whose embedded key disagrees with its filename', () => {
    const dir = initRepo()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-home-'))
    try {
      const acksDir = path.join(dir, '.mmr', 'acks')
      fs.mkdirSync(acksDir, { recursive: true })
      // Filename is KEY but the record claims a different finding_key.
      fs.writeFileSync(path.join(acksDir, `${KEY}.json`), JSON.stringify({ ...RECORD, finding_key: 'b'.repeat(40) }))
      execFileSync('git', ['add', '.mmr/acks'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'add bad ack'], { cwd: dir, stdio: 'ignore' })

      const store = new AckStore({ projectRoot: dir, userRoot: home, configBaseRef: 'HEAD' })
      expect(store.lookup({ finding_key: KEY, normalized_location: 'src/foo.ts', shingle: ['unused', 'used '] })).toBeUndefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})
