import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execSync } from 'node:child_process'
import { describe, it, expect, afterEach } from 'vitest'
import { acquireLock, releaseLock, checkLock, isStale } from './lock-manager.js'
import type { LockFile } from '../types/index.js'

/**
 * Get the actual start time of a PID via `ps`. Tests must use this instead of
 * `new Date().toISOString()` for `processStartedAt` when using a real PID
 * (like `process.pid`), because the lock-manager compares recorded vs. actual
 * start time to detect PID recycling. Using wall-clock "now" causes flaky
 * failures on slow CI runners where vitest started seconds before the test runs.
 */
function getProcessStartedAt(pid: number): string {
  try {
    const output = execSync(`ps -o lstart= -p ${pid}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const trimmed = output.trim()
    if (trimmed) {
      const date = new Date(trimmed)
      if (!isNaN(date.getTime())) return date.toISOString()
    }
  } catch { /* fall through */ }
  return new Date().toISOString()
}

const tmpDirs: string[] = []

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-lm-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  tmpDirs.push(dir)
  return dir
}

function writeLock(projectRoot: string, data: LockFile): void {
  const lockDir = path.join(projectRoot, '.scaffold')
  fs.mkdirSync(lockDir, { recursive: true })
  fs.writeFileSync(path.join(lockDir, 'lock.json'), JSON.stringify(data, null, 2), 'utf8')
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

describe('acquireLock', () => {
  it('creates lock.json with correct fields', () => {
    const dir = makeTempDir()
    const result = acquireLock(dir, 'run', 'create-prd')

    expect(result.acquired).toBe(true)
    const lockPath = path.join(dir, '.scaffold', 'lock.json')
    expect(fs.existsSync(lockPath)).toBe(true)

    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as LockFile
    expect(lock.holder).toBe(os.hostname())
    expect(lock.pid).toBe(process.pid)
    expect(lock.command).toBe('run')
    expect(lock.prompt).toBe('create-prd')
    expect(lock.started).toBeTruthy()
    expect(lock.processStartedAt).toBeTruthy()
    expect(new Date(lock.started).getTime()).not.toBeNaN()
  })

  it('returns acquired: true on success', () => {
    const dir = makeTempDir()
    const result = acquireLock(dir, 'init')
    expect(result.acquired).toBe(true)
    expect(result.error).toBeUndefined()
    expect(result.warning).toBeUndefined()
  })

  it('returns acquired: false with error when lock exists and PID alive', () => {
    const dir = makeTempDir()
    // Write a lock held by the current process (alive PID)
    const lock: LockFile = {
      holder: os.hostname(),
      pid: process.pid,
      started: new Date().toISOString(),
      processStartedAt: getProcessStartedAt(process.pid),
      command: 'run',
    }
    writeLock(dir, lock)

    const result = acquireLock(dir, 'skip')
    expect(result.acquired).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error?.code).toBe('LOCK_HELD')
    expect(result.error?.exitCode).toBe(3)
  })

  it('returns LOCK_HELD error code when lock is active', () => {
    const dir = makeTempDir()
    const lock: LockFile = {
      holder: 'some-host',
      pid: process.pid,
      started: new Date().toISOString(),
      processStartedAt: getProcessStartedAt(process.pid),
      command: 'run',
    }
    writeLock(dir, lock)

    const result = acquireLock(dir, 'run')
    expect(result.acquired).toBe(false)
    expect(result.error?.code).toBe('LOCK_HELD')
  })

  it('auto-clears stale lock and acquires successfully (LOCK_STALE_CLEARED warning)', () => {
    const dir = makeTempDir()
    // Use a PID that definitely does not exist
    const deadPid = 999999
    const lock: LockFile = {
      holder: 'old-host',
      pid: deadPid,
      started: new Date(Date.now() - 60000).toISOString(),
      processStartedAt: new Date(Date.now() - 60000).toISOString(),
      command: 'run',
    }
    writeLock(dir, lock)

    const result = acquireLock(dir, 'init')
    expect(result.acquired).toBe(true)
    expect(result.warning).toBeDefined()
    expect(result.warning?.code).toBe('LOCK_STALE_CLEARED')
    // New lock should exist with current PID
    const newLock = checkLock(dir)
    expect(newLock?.pid).toBe(process.pid)
  })
})

describe('releaseLock', () => {
  it('deletes lock.json when current process holds it', () => {
    const dir = makeTempDir()
    acquireLock(dir, 'run')
    const lockPath = path.join(dir, '.scaffold', 'lock.json')
    expect(fs.existsSync(lockPath)).toBe(true)

    releaseLock(dir)
    expect(fs.existsSync(lockPath)).toBe(false)
  })

  it('does not delete lock.json when different PID holds it', () => {
    const dir = makeTempDir()
    const lock: LockFile = {
      holder: 'other-host',
      pid: 12345,
      started: new Date().toISOString(),
      processStartedAt: new Date().toISOString(),
      command: 'run',
    }
    writeLock(dir, lock)

    releaseLock(dir)
    const lockPath = path.join(dir, '.scaffold', 'lock.json')
    // Lock should still exist since we don't own it
    expect(fs.existsSync(lockPath)).toBe(true)
  })

  it('does nothing when no lock exists', () => {
    const dir = makeTempDir()
    // Should not throw
    expect(() => releaseLock(dir)).not.toThrow()
  })
})

describe('checkLock', () => {
  it('returns null when lock.json does not exist', () => {
    const dir = makeTempDir()
    expect(checkLock(dir)).toBeNull()
  })

  it('returns LockFile when lock.json exists', () => {
    const dir = makeTempDir()
    const lock: LockFile = {
      holder: 'test-host',
      pid: 42,
      started: new Date().toISOString(),
      processStartedAt: new Date().toISOString(),
      command: 'init',
    }
    writeLock(dir, lock)

    const result = checkLock(dir)
    expect(result).not.toBeNull()
    expect(result?.holder).toBe('test-host')
    expect(result?.pid).toBe(42)
    expect(result?.command).toBe('init')
  })

  it('returns null and auto-deletes corrupt lock file', () => {
    const dir = makeTempDir()
    const lockDir = path.join(dir, '.scaffold')
    fs.mkdirSync(lockDir, { recursive: true })
    fs.writeFileSync(path.join(lockDir, 'lock.json'), 'not valid json {{ }}', 'utf8')

    const result = checkLock(dir)
    expect(result).toBeNull()
    // Corrupt file should be auto-deleted
    expect(fs.existsSync(path.join(lockDir, 'lock.json'))).toBe(false)
  })
})

describe('isStale', () => {
  it('returns true when PID is not running', () => {
    const lock: LockFile = {
      holder: 'some-host',
      pid: 999999,
      started: new Date().toISOString(),
      processStartedAt: new Date().toISOString(),
      command: 'run',
    }
    expect(isStale(lock)).toBe(true)
  })

  it('returns false when PID matches current process', () => {
    // Use the current process PID — it is definitely running
    const lock: LockFile = {
      holder: os.hostname(),
      pid: process.pid,
      started: new Date().toISOString(),
      processStartedAt: getProcessStartedAt(process.pid),
      command: 'run',
    }
    // Current process is alive — isStale should return false
    const result = isStale(lock)
    expect(result).toBe(false)
  })
})
