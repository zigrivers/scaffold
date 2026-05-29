import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AckStore, type AckRecord } from '../../src/core/ack-store.js'

const FAKE_KEY = 'a'.repeat(40)
const SHINGLE = ['hello', 'ello ', 'llo w']

let tmpProject: string
let tmpHome: string
let store: AckStore

beforeEach(() => {
  tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-home-'))
  store = new AckStore({ projectRoot: tmpProject, userHome: tmpHome })
})

afterEach(() => {
  fs.rmSync(tmpProject, { recursive: true, force: true })
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('AckStore', () => {
  it('writes a project ack record to ./.mmr/acks/<key>.json by default', () => {
    const record: AckRecord = {
      finding_key: FAKE_KEY,
      normalized_location: 'src/foo.ts',
      description_shingle: SHINGLE,
      reason: 'intentional',
      created_at: '2026-05-22T00:00:00Z',
    }
    store.add(record, 'project')
    const fp = path.join(tmpProject, '.mmr', 'acks', `${FAKE_KEY}.json`)
    expect(fs.existsSync(fp)).toBe(true)
  })

  it('writes a user ack record to ~/.mmr/acks/<key>.json when scope=user', () => {
    const record: AckRecord = {
      finding_key: FAKE_KEY,
      normalized_location: 'src/foo.ts',
      description_shingle: SHINGLE,
      created_at: '2026-05-22T00:00:00Z',
    }
    store.add(record, 'user')
    const fp = path.join(tmpHome, '.mmr', 'acks', `${FAKE_KEY}.json`)
    expect(fs.existsSync(fp)).toBe(true)
  })

  it('REJECTS a non-sha1 finding_key BEFORE constructing a path', () => {
    const record: AckRecord = {
      finding_key: '../../../etc/passwd',
      normalized_location: 'src/foo.ts',
      description_shingle: SHINGLE,
      created_at: '2026-05-22T00:00:00Z',
    }
    expect(() => store.add(record, 'project')).toThrow(/invalid finding[_ ]key/i)
  })

  it('REJECTS a finding_key with invalid hex chars', () => {
    const record: AckRecord = {
      finding_key: 'g'.repeat(40),
      normalized_location: 'src/foo.ts',
      description_shingle: SHINGLE,
      created_at: '2026-05-22T00:00:00Z',
    }
    expect(() => store.add(record, 'project')).toThrow(/invalid finding[_ ]key/i)
  })

  it('listAll merges project and user acks; project shadows user on conflict', () => {
    const projectRec: AckRecord = {
      finding_key: FAKE_KEY,
      normalized_location: 'src/foo.ts',
      description_shingle: SHINGLE,
      reason: 'project',
      created_at: '2026-05-22T00:00:00Z',
    }
    const userRec: AckRecord = { ...projectRec, reason: 'user' }
    store.add(userRec, 'user')
    store.add(projectRec, 'project')
    const merged = store.listAll()
    expect(merged).toHaveLength(1)
    expect(merged[0].reason).toBe('project')
  })

  it('lookup() returns exact-match ack when finding_key matches', () => {
    const record: AckRecord = {
      finding_key: FAKE_KEY,
      normalized_location: 'src/foo.ts',
      description_shingle: SHINGLE,
      created_at: '2026-05-22T00:00:00Z',
    }
    store.add(record, 'project')
    const result = store.lookup({ finding_key: FAKE_KEY, normalized_location: 'src/foo.ts', shingle: SHINGLE })
    expect(result?.match).toBe('exact')
  })

  it('lookup() returns fuzzy-match when location matches AND shingle Jaccard ≥ 0.7', () => {
    const ack: AckRecord = {
      finding_key: FAKE_KEY,
      normalized_location: 'src/foo.ts',
      description_shingle: ['hello', 'ello ', 'llo w', 'lo wo', 'o wor'],
      created_at: '2026-05-22T00:00:00Z',
    }
    store.add(ack, 'project')
    const result = store.lookup({
      finding_key: 'b'.repeat(40), // strict key differs
      normalized_location: 'src/foo.ts',
      shingle: ['hello', 'ello ', 'llo w', 'lo wo', 'o wor'], // shingle identical (Jaccard 1.0)
    })
    expect(result?.match).toBe('fuzzy')
  })

  it('lookup() returns undefined when location differs (even with similar shingle)', () => {
    const ack: AckRecord = {
      finding_key: FAKE_KEY,
      normalized_location: 'src/foo.ts',
      description_shingle: SHINGLE,
      created_at: '2026-05-22T00:00:00Z',
    }
    store.add(ack, 'project')
    const result = store.lookup({
      finding_key: 'b'.repeat(40),
      normalized_location: 'src/bar.ts',
      shingle: SHINGLE,
    })
    expect(result).toBeUndefined()
  })

  it('remove() deletes the ack file', () => {
    const record: AckRecord = {
      finding_key: FAKE_KEY,
      normalized_location: 'src/foo.ts',
      description_shingle: SHINGLE,
      created_at: '2026-05-22T00:00:00Z',
    }
    store.add(record, 'project')
    store.remove(FAKE_KEY, 'project')
    expect(fs.existsSync(path.join(tmpProject, '.mmr', 'acks', `${FAKE_KEY}.json`))).toBe(false)
  })

  it('lookup() does NOT fuzzy-match when shingle Jaccard < 0.7 (same location)', () => {
    store.add(
      {
        finding_key: FAKE_KEY,
        normalized_location: 'src/foo.ts',
        description_shingle: ['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee'],
        created_at: '2026-05-22T00:00:00Z',
      },
      'project',
    )
    // Share only 1 of 5 shingles → Jaccard ~0.11, below the 0.7 threshold.
    const result = store.lookup({
      finding_key: 'b'.repeat(40),
      normalized_location: 'src/foo.ts',
      shingle: ['aaaaa', 'vvvvv', 'wwwww', 'xxxxx', 'yyyyy'],
    })
    expect(result).toBeUndefined()
  })

  it('skips an ack whose embedded finding_key disagrees with its filename (desync)', () => {
    // File is named FAKE_KEY but its content claims a different key.
    const dir = path.join(tmpProject, '.mmr', 'acks')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, `${FAKE_KEY}.json`),
      JSON.stringify({
        finding_key: 'c'.repeat(40),
        normalized_location: 'src/foo.ts',
        description_shingle: SHINGLE,
        created_at: '2026-05-22T00:00:00Z',
      }),
    )
    expect(store.listAll()).toHaveLength(0)
    expect(store.lookup({ finding_key: FAKE_KEY, normalized_location: 'src/foo.ts', shingle: SHINGLE })).toBeUndefined()
  })

  it('skips a structurally malformed ack record (missing/!typed fields)', () => {
    const dir = path.join(tmpProject, '.mmr', 'acks')
    fs.mkdirSync(dir, { recursive: true })
    // Valid filename, but description_shingle is not a string[] and created_at is missing.
    fs.writeFileSync(
      path.join(dir, `${FAKE_KEY}.json`),
      JSON.stringify({ finding_key: FAKE_KEY, normalized_location: 'src/foo.ts', description_shingle: 'nope' }),
    )
    expect(store.listAll()).toHaveLength(0)
  })

  it('refuses to write an ack through a symlink', () => {
    const dir = path.join(tmpProject, '.mmr', 'acks')
    fs.mkdirSync(dir, { recursive: true })
    const target = path.join(tmpProject, 'secret.txt')
    fs.writeFileSync(target, 'original')
    fs.symlinkSync(target, path.join(dir, `${FAKE_KEY}.json`))
    expect(() =>
      store.add(
        {
          finding_key: FAKE_KEY,
          normalized_location: 'src/foo.ts',
          description_shingle: SHINGLE,
          created_at: '2026-05-22T00:00:00Z',
        },
        'project',
      ),
    ).toThrow(/symlink/i)
    // The symlink target must be untouched.
    expect(fs.readFileSync(target, 'utf-8')).toBe('original')
  })
})
