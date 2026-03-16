import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { atomicWriteFile, fileExists, ensureDir } from './fs.js'

const tmpFiles: string[] = []
const tmpDirs: string[] = []

function tmpPath(ext = '') {
  const p = path.join(os.tmpdir(), `scaffold-test-${crypto.randomUUID()}${ext}`)
  tmpFiles.push(p)
  return p
}

function tmpDir() {
  const p = path.join(os.tmpdir(), `scaffold-test-${crypto.randomUUID()}`)
  tmpDirs.push(p)
  return p
}

afterEach(() => {
  for (const f of tmpFiles) {
    try { fs.rmSync(f, { force: true }) } catch { /* ignore */ }
    try { fs.rmSync(f + '.tmp', { force: true }) } catch { /* ignore */ }
  }
  tmpFiles.length = 0
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

describe('atomicWriteFile', () => {
  it('creates file with correct content', () => {
    const p = tmpPath()
    atomicWriteFile(p, 'hello world')
    expect(fs.readFileSync(p, 'utf8')).toBe('hello world')
  })

  it('does not leave a .tmp file after successful write', () => {
    const p = tmpPath()
    atomicWriteFile(p, 'content')
    expect(fs.existsSync(p + '.tmp')).toBe(false)
  })

  it('overwrites an existing file', () => {
    const p = tmpPath()
    fs.writeFileSync(p, 'original', 'utf8')
    atomicWriteFile(p, 'updated')
    expect(fs.readFileSync(p, 'utf8')).toBe('updated')
  })
})

describe('fileExists', () => {
  it('returns true for an existing file', () => {
    const p = tmpPath()
    fs.writeFileSync(p, '', 'utf8')
    expect(fileExists(p)).toBe(true)
  })

  it('returns false for a non-existent path', () => {
    const p = tmpPath()
    expect(fileExists(p)).toBe(false)
  })

  it('returns true for an existing directory', () => {
    const d = tmpDir()
    fs.mkdirSync(d)
    expect(fileExists(d)).toBe(true)
  })
})

describe('ensureDir', () => {
  it('creates a directory when it does not exist', () => {
    const d = tmpDir()
    ensureDir(d)
    expect(fs.existsSync(d)).toBe(true)
    expect(fs.statSync(d).isDirectory()).toBe(true)
  })

  it('does not throw when directory already exists', () => {
    const d = tmpDir()
    fs.mkdirSync(d)
    expect(() => ensureDir(d)).not.toThrow()
  })

  it('creates nested directories recursively', () => {
    const d = tmpDir()
    const nested = path.join(d, 'a', 'b', 'c')
    ensureDir(nested)
    expect(fs.existsSync(nested)).toBe(true)
    expect(fs.statSync(nested).isDirectory()).toBe(true)
  })
})
