import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readRootSaveCounter } from './root-counter-reader.js'

describe('readRootSaveCounter', () => {
  let tmpRoot: string

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rcr-'))
    fs.mkdirSync(path.join(tmpRoot, '.scaffold'), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('returns null when root state file is missing', () => {
    expect(readRootSaveCounter(tmpRoot)).toBeNull()
  })

  it('returns the counter when state file has a valid save_counter', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'state.json'),
      JSON.stringify({ save_counter: 42, 'schema-version': 3 }),
    )
    expect(readRootSaveCounter(tmpRoot)).toBe(42)
  })

  it('returns null when state file has invalid JSON', () => {
    fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), '{ not valid json')
    expect(readRootSaveCounter(tmpRoot)).toBeNull()
  })

  it('returns null when state file lacks save_counter (legacy file)', () => {
    fs.writeFileSync(
      path.join(tmpRoot, '.scaffold', 'state.json'),
      JSON.stringify({ 'schema-version': 3 }),
    )
    expect(readRootSaveCounter(tmpRoot)).toBeNull()
  })
})
