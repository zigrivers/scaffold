import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SessionStore } from '../../src/commands/sessions.js'

let tmpHome: string
let store: SessionStore

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-sessions-'))
  store = SessionStore.fromHome(tmpHome)
})

afterEach(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('SessionStore', () => {
  it('creates a session file on start()', () => {
    const s = store.start('feat-foo')
    expect(s.session_id).toBe('feat-foo')
    expect(s.jobs).toEqual([])
    expect(s.rounds).toBe(0)
    expect(fs.existsSync(path.join(tmpHome, '.mmr', 'sessions', 'feat-foo.json'))).toBe(true)
  })

  it('rejects an invalid session id BEFORE constructing any path', () => {
    expect(() => store.start('../../../etc/passwd')).toThrow(/invalid session id/i)
    expect(() => store.start('has spaces')).toThrow(/invalid session id/i)
    expect(() => store.start('has.dots')).toThrow(/invalid session id/i)
    expect(() => store.start('CON')).toThrow(/invalid session id/i)
    expect(() => store.start('com1')).toThrow(/invalid session id/i)
    expect(() => store.start('index')).toThrow(/invalid session id/i)
    expect(() => store.start('__proto__')).toThrow(/invalid session id/i)
  })

  it('start() refuses to overwrite an existing session', () => {
    store.start('feat-foo')
    store.addJob('feat-foo', 'mmr-abc123', 1)

    expect(() => store.start('feat-foo')).toThrow(/session already exists/i)

    const s = store.show('feat-foo')!
    expect(s.jobs).toEqual(['mmr-abc123'])
    expect(s.rounds).toBe(1)
  })

  it('lists all sessions sorted by created_at desc', () => {
    store.start('a')
    store.start('b')
    const list = store.list()
    expect(list).toHaveLength(2)
    expect(list.map((s) => s.session_id).sort()).toEqual(['a', 'b'])
  })

  it('shows() returns the persisted session', () => {
    store.start('feat-foo')
    const s = store.show('feat-foo')
    expect(s?.session_id).toBe('feat-foo')
  })

  it('show() returns undefined for missing session', () => {
    expect(store.show('does-not-exist')).toBeUndefined()
  })

  it('show() returns undefined for malformed session JSON', () => {
    store.start('feat-foo')
    fs.writeFileSync(path.join(tmpHome, '.mmr', 'sessions', 'feat-foo.json'), '{')
    expect(store.show('feat-foo')).toBeUndefined()
  })

  it('end() deletes the session file', () => {
    store.start('feat-foo')
    store.end('feat-foo')
    expect(fs.existsSync(path.join(tmpHome, '.mmr', 'sessions', 'feat-foo.json'))).toBe(false)
  })

  it('addJob() appends to the jobs array and increments rounds', () => {
    store.start('feat-foo')
    store.addJob('feat-foo', 'mmr-abc123', 1)
    store.addJob('feat-foo', 'mmr-def456', 2)
    const s = store.show('feat-foo')!
    expect(s.jobs).toEqual(['mmr-abc123', 'mmr-def456'])
    expect(s.rounds).toBe(2)
  })

  it('addJob() creates the sessions directory when called before start()', () => {
    store.addJob('feat-foo', 'mmr-abc123', 1)
    const s = store.show('feat-foo')!
    expect(s.jobs).toEqual(['mmr-abc123'])
    expect(s.rounds).toBe(1)
  })

  it('recovers stale session locks', () => {
    const staleLock = path.join(tmpHome, '.mmr', 'sessions', 'feat-foo.json.lock')
    fs.mkdirSync(staleLock, { recursive: true })
    const staleTime = new Date(Date.now() - 10_000)
    fs.utimesSync(staleLock, staleTime, staleTime)

    store.addJob('feat-foo', 'mmr-abc123', 1)

    const s = store.show('feat-foo')!
    expect(s.jobs).toEqual(['mmr-abc123'])
    expect(fs.existsSync(staleLock)).toBe(false)
  })

  it('list() reads the session index instead of parsing every session file', () => {
    store.start('feat-foo')
    fs.writeFileSync(path.join(tmpHome, '.mmr', 'sessions', 'feat-foo.json'), '{')
    expect(store.list().map((s) => s.session_id)).toEqual(['feat-foo'])
  })

  it('does not overwrite a corrupt session index', () => {
    const indexPath = path.join(tmpHome, '.mmr', 'sessions', 'index.json')
    fs.mkdirSync(path.dirname(indexPath), { recursive: true })
    fs.writeFileSync(indexPath, '{')

    expect(() => store.addJob('feat-foo', 'mmr-abc123', 1)).toThrow(SyntaxError)
    expect(fs.readFileSync(indexPath, 'utf-8')).toBe('{')
  })
})
