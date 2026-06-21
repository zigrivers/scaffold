import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CritiqueSessionStore, type CritiqueRound } from '../../src/core/critique-session.js'

const tmps: string[] = []
function store(): CritiqueSessionStore {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crit-sess-'))
  tmps.push(root)
  return new CritiqueSessionStore(root)
}
afterEach(() => { for (const d of tmps.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

const round = (n: number): CritiqueRound => ({
  round: n,
  artifact_source: `design-v${n}.md`,
  items: [{ id: 'C-001', kind: 'concern', theme: 'scaling', observation: `obs ${n}` }],
})

describe('CritiqueSessionStore', () => {
  it('returns [] for an unknown session', () => {
    expect(store().load('fresh')).toEqual([])
  })

  it('appends rounds and loads them in order', () => {
    const s = store()
    s.append('s1', round(1))
    s.append('s1', round(2))
    const loaded = s.load('s1')
    expect(loaded.map((r) => r.round)).toEqual([1, 2])
    expect(loaded[1].artifact_source).toBe('design-v2.md')
  })

  it('rejects an invalid session id', () => {
    expect(() => store().append('../evil', round(1))).toThrow(/session id/i)
  })

  it('isolates different sessions', () => {
    const s = store()
    s.append('a', round(1))
    expect(s.load('b')).toEqual([])
  })
})
