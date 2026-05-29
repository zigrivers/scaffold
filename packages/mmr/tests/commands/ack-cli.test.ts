import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mmrBin = path.resolve(__dirname, '../../dist/index.js')

describe('mmr ack CLI', () => {
  it('rejects an invalid finding-key BEFORE constructing a path', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-cli-'))
    const tmpProj = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
    try {
      try {
        execFileSync('node', [mmrBin, 'ack', 'add', '../../etc/passwd'], {
          encoding: 'utf-8',
          env: { ...process.env, HOME: tmpHome },
          cwd: tmpProj,
        })
        throw new Error('expected nonzero exit')
      } catch (err: unknown) {
        const e = err as { status: number; stderr: string }
        expect(e.status).toBeGreaterThan(0)
        expect(e.stderr).toMatch(/invalid finding[_ ]key/i)
      }
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true })
      fs.rmSync(tmpProj, { recursive: true, force: true })
    }
  })

  it('rejects a path-traversal --job value before any filesystem read', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-cli-'))
    const tmpProj = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
    const validKey = 'a'.repeat(40)
    try {
      try {
        execFileSync('node', [mmrBin, 'ack', 'add', validKey, '--job', '../../etc/passwd'], {
          encoding: 'utf-8',
          env: { ...process.env, HOME: tmpHome },
          cwd: tmpProj,
        })
        throw new Error('expected nonzero exit')
      } catch (err: unknown) {
        const e = err as { status: number; stderr: string }
        expect(e.status).toBeGreaterThan(0)
        expect(e.stderr).toMatch(/invalid job id/i)
      }
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true })
      fs.rmSync(tmpProj, { recursive: true, force: true })
    }
  })

  it('list returns [] when no acks exist', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-cli-'))
    const tmpProj = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-ack-proj-'))
    try {
      const out = execFileSync('node', [mmrBin, 'ack', 'list'], {
        encoding: 'utf-8',
        env: { ...process.env, HOME: tmpHome },
        cwd: tmpProj,
      })
      expect(JSON.parse(out)).toEqual([])
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true })
      fs.rmSync(tmpProj, { recursive: true, force: true })
    }
  })
})
